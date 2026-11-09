/*
 * ClipFinder NLP: query expansion with word vectors, all in the browser.
 *
 * 1. Tokenize: lowercase, split into words, drop stopwords and words of
 *    1-2 letters (same rules as scripts/build_vectors.py).
 * 2. Query expansion: for each query word, find the 5 most similar words that
 *    appear in the lectures (cosine similarity > 0.6).
 * 3. Score each transcript line: exact match = 1.0 point per query word,
 *    otherwise the similarity of the best similar word found in the line.
 * 4. Return the top 10 lines.
 */
const NLP = (() => {
  const WORD = /[a-z]+(?:'[a-z]+)?/g;
  const TOP_SIMILAR = 5;
  const MIN_SIMILARITY = 0.6;
  const TOP_RESULTS = 10;

  let words = [];           // vocabulary, words[i] has vector i
  let index = new Map();    // word -> i
  let lectureCount = 0;     // words[0..lectureCount) appear in the lectures
  let dim = 50, scale = 127;
  let vecs = null;          // Int8Array, unit-length vectors * 127
  let stop = new Set();
  let videos = [];          // [{video_id, title, lines:[{start_seconds, text, tokens:Set}]}]

  async function load() {
    const get = p => fetch(p).then(r => {
      if (!r.ok) throw new Error(`Could not load ${p} (${r.status})`);
      return r.json();
    });
    const [v, s, t] = await Promise.all([
      get("data/vectors.json"), get("data/stopwords.json"), get("data/transcripts.json"),
    ]);

    words = v.words;
    dim = v.dim;
    scale = v.scale;
    lectureCount = v.lecture_count;
    words.forEach((w, i) => index.set(w, i));
    const bin = atob(v.vectors);
    vecs = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) vecs[i] = (bin.charCodeAt(i) << 24) >> 24; // byte -> signed

    stop = new Set(s);
    videos = t.map(video => ({
      ...video,
      duration: video.lines.length ? video.lines[video.lines.length - 1].start_seconds + 15 : 0,
      lines: video.lines.map(l => ({ ...l, tokens: new Set(tokenize(l.text)) })),
    }));
    return videos;
  }

  function tokenize(text) {
    return (text.toLowerCase().match(WORD) || []).filter(w => w.length > 2 && !stop.has(w));
  }

  // Cosine similarity. The vectors are already unit length, so it's a dot product.
  function similarity(i, j) {
    let dot = 0;
    const a = i * dim, b = j * dim;
    for (let k = 0; k < dim; k++) dot += vecs[a + k] * vecs[b + k];
    return Math.min(1, dot / (scale * scale));
  }

  // Most similar words that appear in the lectures.
  function neighbors(word, k = 10, minSim = 0) {
    const i = index.get(word);
    if (i === undefined) return [];
    const out = [];
    for (let j = 0; j < lectureCount; j++) {
      if (j === i) continue;
      const s = similarity(i, j);
      if (s >= minSim) out.push({ word: words[j], sim: s });
    }
    out.sort((a, b) => b.sim - a.sim);
    return out.slice(0, k);
  }

  function expand(query) {
    const terms = [...new Set(tokenize(query))];
    // "computer memory": don't let "computers" count as a similar word for
    // "memory", since it's really just another form of the word "computer".
    const formOfOtherTerm = (word, term) =>
      terms.some(t => t !== term && (word.startsWith(t) || t.startsWith(word)));
    return terms.map(term => ({
      term,
      known: index.has(term),
      similar: neighbors(term, TOP_SIMILAR + terms.length * 3, MIN_SIMILARITY)
        .filter(s => !formOfOtherTerm(s.word, term))
        .slice(0, TOP_SIMILAR),
    }));
  }

  function search(query, videoId = "all") {
    const expansion = expand(query);
    if (!expansion.length) return { expansion, results: [] };

    const results = [];
    for (const video of videos) {
      if (videoId !== "all" && video.video_id !== videoId) continue;
      for (const line of video.lines) {
        let score = 0;
        const matched = [];
        const used = new Set(); // a word in the line only counts toward one query word
        // Exact matches first, so they can't be "stolen" as someone else's similar word
        for (const { term } of expansion) {
          if (line.tokens.has(term)) {
            score += 1;
            used.add(term);
            matched.push({ word: term, term, sim: 1, exact: true });
          }
        }
        for (const { term, similar } of expansion) {
          if (line.tokens.has(term)) continue;
          // list is sorted, so the first unused hit is the best one
          const best = similar.find(s => line.tokens.has(s.word) && !used.has(s.word));
          if (best) {
            score += best.sim;
            used.add(best.word);
            matched.push({ word: best.word, term, sim: best.sim, exact: false });
          }
        }
        if (score > 0) results.push({ video, line, score, matched });
      }
    }
    results.sort((a, b) => b.score - a.score || a.line.start_seconds - b.line.start_seconds);
    return { expansion, results: results.slice(0, TOP_RESULTS) };
  }

  return { load, tokenize, expand, search, neighbors, has: w => index.has(w), get videos() { return videos; } };
})();
