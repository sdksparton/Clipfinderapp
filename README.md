# ClipFinder

**Find the moment, not the whole lecture.**

ClipFinder is basically Ctrl+F for lecture videos, but smarter. You type a topic and it jumps you straight to the moment it comes up, even if the professor said it a totally different way. I built it for my NLP class.

Regular caption search only catches exact words. ClipFinder uses word vectors (Word2Vec-style embeddings), so searching **"money"** also finds lines where the professor said **"cash," "funds,"** or **"credit."** Every result shows the transcript line, the timestamp, the words it matched, and a **Play from here** button.

## Who it's for (ICP)

**"Studying Sam":** a college student, 19 to 35, juggling classes with a part-time or full-time job. Their classes are online or hybrid with 1 to 3 hour recorded lectures. They study late at night after a shift and don't have time to rewatch a whole lecture to find one topic.

- **Pain:** "I know he explained it, I just can't find where." Transcript search misses it when the professor used different words.
- **Goal:** find the exact moment a topic is explained, fast, and review only what they need before homework or a test.
- **Where they hang out:** class Discords and group chats, Canvas, YouTube, and TikTok/Reddit study communities.

## How the NLP works

1. **Transcripts.** `scripts/get_transcripts.py` downloads the captions for 4 free public lectures with `youtube-transcript-api`, merges the 3-second caption pieces into ~12-second lines, and saves `data/transcripts.json`.
2. **Word vectors.** `scripts/build_vectors.py` loads pretrained **GloVe** vectors (`glove-wiki-gigaword-50`, 50 numbers per word) with **gensim**. GloVe and Word2Vec produce the same kind of thing: words used in similar contexts get vectors that point in similar directions. It keeps every word from the lectures plus the 20,000 most common English words (so you can search a word the professor never said). Each vector is scaled to length 1 and stored as 50 signed bytes, which keeps `data/vectors.json` around 1.5 MB.
3. **In the browser** (`assets/nlp.js`, plain JavaScript, no server, no API keys):
   - **Tokenize** the search: lowercase, split into words, remove stopwords.
   - **Query expansion:** for each search word, find the 5 most similar words that appear in the lectures, using **cosine similarity** (kept only if similarity > 0.6). Since the vectors are length 1, cosine similarity is just the dot product.
   - **Score each line:** an exact match = 1.0 point; otherwise the similarity of the best similar word in that line. One word in a line only counts toward one search word.
   - Show the **top 10** lines with highlighted matches (teal = exact, amber = similar word) and the similarity scores.
4. **Explore words panel:** type any word and see its 10 nearest words from the lectures with their similarity scores. This is the Word2Vec demo part.
5. **Play from here** loads the YouTube embed player at that timestamp. The timeline under the player shows a glowing tick wherever your topic shows up in the lecture.

### Example

| Search | Expanded to (similarity) |
| --- | --- |
| money | cash 0.90, funds 0.88, raise 0.85, billions 0.83, millions 0.82 |
| brain | heart 0.78, causes 0.78, cells 0.77, brains 0.77, cell 0.74 |
| neural network | neurons, neuron, brain, activation / networks, channel, internet, web |

## The lectures

| Course | Video |
| --- | --- |
| MIT 6.0001 Intro to CS | [What is Computation?](https://www.youtube.com/watch?v=nykOeWgQcHM) |
| Yale ECON 252 Financial Markets | [Lecture 1: Introduction](https://www.youtube.com/watch?v=WQui_3Hpmmc) |
| 3Blue1Brown | [But what is a neural network?](https://www.youtube.com/watch?v=aircAruvnKk) |
| Stanford CS224N | [Lecture 1: Intro & Word Vectors](https://www.youtube.com/watch?v=rmVRLeJRkl4) |

## Run it yourself

The generated JSON is already committed, so you only need the scripts to change the lectures.

```bash
pip install -r requirements.txt
python scripts/get_transcripts.py   # -> data/transcripts.json (caches raw captions in data/raw/)
python scripts/build_vectors.py     # -> data/vectors.json + data/stopwords.json
```

To add a lecture, add its YouTube id to `VIDEOS` in `scripts/get_transcripts.py` and run both scripts again. YouTube blocks IPs that pull too many transcripts, so the raw captions are cached in `data/raw/` and only downloaded once.

To view the site locally, serve the folder (opening `index.html` straight from disk won't load the data):

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Tech

- Static site: HTML, CSS, vanilla JS. No backend, no API keys, nothing that costs money.
- Python (gensim, youtube-transcript-api) runs once locally to build the data.
- Hosted on Netlify, which publishes the repo root.

## Files

```
index.html          landing page
search.html         the search app
assets/style.css    styles (navy #1E2A4A, teal #14B8A6, soft white #F8FAFC, Poppins)
assets/nlp.js       tokenizer, cosine similarity, query expansion, scoring
assets/app.js       UI: results, player, timeline, Explore words
data/               transcripts, word vectors, stopwords (generated)
scripts/            the two Python scripts that generate data/
```
