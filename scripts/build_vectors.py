"""Build the word vectors ClipFinder uses for its similar-word search.

Run once, after get_transcripts.py:  python scripts/build_vectors.py
Output:  data/vectors.json, data/stopwords.json

It loads pretrained GloVe vectors (glove-wiki-gigaword-50) through gensim.
GloVe and Word2Vec make the same thing: one 50-number vector per word, where
words used in similar contexts end up close together. gensim loads both the
same way (a KeyedVectors object).

Which words get saved:
  * every word that appears in the lecture transcripts (these are the words
    a search can actually land on), and
  * the 20,000 most common English words, so a search for a word the
    professor never said ("money") still has a vector to compare with.

To keep the file small, each vector is scaled to length 1 and stored as
50 signed bytes (-127..127), base64 encoded. Because every vector has length 1,
cosine similarity is just the dot product, divided by 127 * 127.
"""
import base64
import json
import pathlib
import re

import gensim.downloader as api
import numpy as np
from gensim.parsing.preprocessing import STOPWORDS as GENSIM_STOPWORDS

ROOT = pathlib.Path(__file__).resolve().parent.parent
TRANSCRIPTS = ROOT / "data" / "transcripts.json"
OUT = ROOT / "data" / "vectors.json"
STOPWORDS_OUT = ROOT / "data" / "stopwords.json"

COMMON_WORDS = 20000

# gensim's stopword list includes some real topic words. A student searching
# "computer" or "interest" (as in interest rates) means it, so keep them.
TOPIC_WORDS = {"computer", "system", "interest", "bill", "amount", "fire",
               "detail", "describe", "mill", "found", "name", "move", "part"}
STOPWORDS = GENSIM_STOPWORDS - TOPIC_WORDS
# Same tokenizer as the browser (assets/nlp.js)
WORD = re.compile(r"[a-z]+(?:'[a-z]+)?")


def keep(w):
    return len(w) > 2 and w not in STOPWORDS


def main():
    videos = json.loads(TRANSCRIPTS.read_text(encoding="utf-8"))
    lecture_words = set()
    for v in videos:
        for line in v["lines"]:
            lecture_words.update(w for w in WORD.findall(line["text"].lower()) if keep(w))
    print(f"{len(lecture_words)} unique non-stopword words in the transcripts")

    print("Loading glove-wiki-gigaword-50 (first run downloads ~66 MB)...")
    kv = api.load("glove-wiki-gigaword-50")

    # GloVe lists words from most to least common
    common = [w for w in kv.index_to_key[:60000] if w.isalpha() and keep(w)][:COMMON_WORDS]
    in_lectures = sorted(w for w in lecture_words if w in kv.key_to_index)
    words = in_lectures + [w for w in common if w not in lecture_words]
    print(f"{len(in_lectures)} lecture words have a vector "
          f"({len(lecture_words) - len(in_lectures)} skipped), plus {len(words) - len(in_lectures)} common words")

    mat = np.stack([kv[w] for w in words])
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)
    q = np.clip(np.round(mat * 127), -127, 127).astype(np.int8)

    out = {
        "model": "glove-wiki-gigaword-50",
        "dim": int(q.shape[1]),
        "scale": 127,
        "words": words,
        "lecture_count": len(in_lectures),  # words[:lecture_count] appear in the lectures
        "vectors": base64.b64encode(q.tobytes()).decode("ascii"),
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    # Same stopword list for the browser, so query cleanup matches the index
    STOPWORDS_OUT.write_text(json.dumps(sorted(STOPWORDS)), encoding="utf-8")
    print(f"Saved {OUT} ({OUT.stat().st_size // 1024} KB)")

    # Quick sanity check, the same math the browser does
    i = {w: n for n, w in enumerate(words)}
    if "money" in i:
        sims = (q[:len(in_lectures)].astype(np.int32) @ q[i["money"]].astype(np.int32)) / (127 * 127)
        top = np.argsort(-sims)[:8]
        print("money ->", ", ".join(f"{words[t]} {sims[t]:.2f}" for t in top))


if __name__ == "__main__":
    main()
