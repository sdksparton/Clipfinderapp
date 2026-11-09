(() => {
  const $ = id => document.getElementById(id);
  const q = $("q"), videoSel = $("video"), meta = $("meta"), list = $("results");
  const track = $("track"), frame = $("frame");
  let ready = false;
  let current = { results: [], activeKey: null };

  const fmt = s => {
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  };
  const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const keyOf = r => `${r.video.video_id}@${r.line.start_seconds}`;

  // Highlight exact matches (teal) and similar-word matches (amber)
  function highlight(text, matched) {
    const exact = new Set(matched.filter(m => m.exact).map(m => m.word));
    const sim = new Set(matched.filter(m => !m.exact).map(m => m.word));
    return esc(text).replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, w => {
      const lw = w.toLowerCase();
      if (exact.has(lw)) return `<mark>${w}</mark>`;
      if (sim.has(lw)) return `<mark class="sim">${w}</mark>`;
      return w;
    });
  }

  function play(video, seconds) {
    const start = Math.max(0, Math.floor(seconds));
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${video.video_id}?start=${start}&autoplay=1&rel=0"
      title="${esc(video.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    $("nowTitle").textContent = video.title;
    $("nowTs").textContent = "from " + fmt(start);
    drawTimeline(video);
  }

  function setActive(r) {
    current.activeKey = keyOf(r);
    document.querySelectorAll(".result").forEach(el => el.classList.toggle("active", el.dataset.key === current.activeKey));
    document.querySelectorAll(".tick").forEach(el => el.classList.toggle("active", el.dataset.key === current.activeKey));
  }

  // Timeline: one glowing tick per match in this video, taller = better score
  function drawTimeline(video) {
    track.innerHTML = "";
    $("timelineName").textContent = video ? video.title.split(":")[0] : "Pick a lecture";
    $("trackEnd").textContent = video ? fmt(video.duration) : "--";
    if (!video) return;
    const hits = current.results.filter(r => r.video === video);
    const top = Math.max(1, ...hits.map(r => r.score));
    hits.forEach((r, n) => {
      const b = document.createElement("button");
      b.className = "tick";
      b.dataset.key = keyOf(r);
      b.style.left = (r.line.start_seconds / video.duration * 100) + "%";
      b.style.height = (30 + 70 * r.score / top) + "%";
      b.style.animationDelay = (n * 0.05) + "s";
      b.title = `${fmt(r.line.start_seconds)}: ${r.line.text.slice(0, 80)}...`;
      b.setAttribute("aria-label", `Play from ${fmt(r.line.start_seconds)}`);
      b.onclick = () => { play(r.video, r.line.start_seconds); setActive(r); };
      track.appendChild(b);
    });
    if (current.activeKey) setActive(current.results.find(r => keyOf(r) === current.activeKey) || { video: {}, line: {} });
  }

  function renderExpansion(expansion) {
    const chips = expansion.map(e => {
      const sims = e.similar.map(s => `<span class="w hit">${esc(s.word)}<span class="s">${s.sim.toFixed(2)}</span></span>`).join("");
      const note = e.known ? (e.similar.length ? "" : `<span class="w">no close matches</span>`) : `<span class="w">not in vocabulary, exact match only</span>`;
      return `<span class="w query">${esc(e.term)}</span>${sims}${note}`;
    }).join("");
    return `<div class="expansion">${chips}</div>`;
  }

  function runSearch(text) {
    if (!ready) return;
    text = text.trim();
    q.value = text;
    const url = new URL(location);
    text ? url.searchParams.set("q", text) : url.searchParams.delete("q");
    history.replaceState(null, "", url);
    if (!text) return;

    const { expansion, results } = NLP.search(text, videoSel.value);
    current = { results, activeKey: null };

    if (!expansion.length) {
      meta.innerHTML = "";
      list.innerHTML = `<div class="empty glass"><h3>Try a more specific word</h3>That search was all filler words like "the" or "what." Add a topic.</div>`;
      drawTimeline(null);
      return;
    }
    meta.innerHTML = `<strong>${results.length}</strong> moment${results.length === 1 ? "" : "s"} found. Searched for these words and their closest matches:${renderExpansion(expansion)}`;

    if (!results.length) {
      list.innerHTML = `<div class="empty glass"><h3>Nothing close enough</h3>None of the lectures talk about that, even with similar words. Try another topic or switch to "All lectures."</div>`;
      drawTimeline(videoSel.value === "all" ? null : NLP.videos.find(v => v.video_id === videoSel.value));
      return;
    }

    list.innerHTML = results.map((r, n) => `
      <article class="result glass" data-key="${keyOf(r)}" style="animation-delay:${n * 0.04}s">
        <div class="result-top">
          <span class="ts">${fmt(r.line.start_seconds)}</span>
          <span class="vid" title="${esc(r.video.title)}">${esc(r.video.title)}</span>
          <span class="score">score ${r.score.toFixed(2)}</span>
        </div>
        <p>${highlight(r.line.text, r.matched)}</p>
        <div class="result-bottom">
          <div class="matched">${r.matched.map(m => m.exact
            ? `<span class="e">${esc(m.word)} · exact</span>`
            : `<span class="m">${esc(m.word)} ≈ ${esc(m.term)} · ${m.sim.toFixed(2)}</span>`).join("")}</div>
          <button class="play" type="button" data-n="${n}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>Play from here
          </button>
        </div>
      </article>`).join("");

    list.querySelectorAll(".play").forEach(btn => btn.onclick = () => {
      const r = results[+btn.dataset.n];
      play(r.video, r.line.start_seconds);
      setActive(r);
      if (window.innerWidth < 900) frame.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // Timeline shows the picked lecture, or the top result's lecture for "All lectures"
    drawTimeline(videoSel.value === "all" ? results[0].video : NLP.videos.find(v => v.video_id === videoSel.value));
  }

  function explore(word) {
    const out = $("neighbors");
    const w = (word.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/) || [""])[0];
    $("ew").value = w;
    if (!w) return;
    if (!NLP.has(w)) {
      out.innerHTML = `<p class="note">"${esc(w)}" isn't in the word-vector vocabulary. Try a more common word.</p>`;
      return;
    }
    const nb = NLP.neighbors(w, 10);
    out.innerHTML = nb.map((n, i) => `
      <button class="nb" type="button" data-w="${esc(n.word)}" style="animation-delay:${i * 0.03}s">
        <span class="fill" style="width:${Math.max(0, n.sim) * 100}%"></span>
        <span class="word">${esc(n.word)}</span>
        <span class="val">similarity ${n.sim.toFixed(3)}</span>
      </button>`).join("");
    out.querySelectorAll(".nb").forEach(b => b.onclick = () => {
      runSearch(b.dataset.w);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  $("searchForm").onsubmit = e => { e.preventDefault(); runSearch(q.value); };
  $("exploreForm").onsubmit = e => { e.preventDefault(); explore($("ew").value); };
  $("chips").onclick = e => { if (e.target.classList.contains("chip")) runSearch(e.target.textContent); };
  videoSel.onchange = () => {
    if (q.value.trim()) return runSearch(q.value);
    drawTimeline(videoSel.value === "all" ? null : NLP.videos.find(v => v.video_id === videoSel.value));
  };

  NLP.load().then(videos => {
    videos.forEach(v => videoSel.add(new Option(v.title, v.video_id)));
    ready = true;
    meta.innerHTML = `Ready. <strong>${videos.length}</strong> lectures loaded. Type a topic up top.`;
    const params = new URLSearchParams(location.search);
    if (params.get("v") && videos.some(v => v.video_id === params.get("v"))) videoSel.value = params.get("v");
    if (params.get("q")) runSearch(params.get("q"));
    explore("money");
  }).catch(err => {
    meta.innerHTML = `<div class="empty glass"><h3>Couldn't load the lecture data</h3>${esc(err.message)}. If you opened the file directly, run a local server instead (see README).</div>`;
  });
})();
