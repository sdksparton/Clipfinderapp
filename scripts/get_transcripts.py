"""Download the transcripts for ClipFinder's lecture videos.

Run once:  python scripts/get_transcripts.py
Output:    data/transcripts.json
"""
import json
import pathlib
import urllib.request

from youtube_transcript_api import YouTubeTranscriptApi

# Free, public lecture videos that have English captions.
# (video id, course label shown in the app)
VIDEOS = [
    ("nykOeWgQcHM", "MIT 6.0001 Intro to CS"),
    ("WQui_3Hpmmc", "Yale ECON 252 Financial Markets"),
    ("aircAruvnKk", "3Blue1Brown Deep Learning"),
    ("rmVRLeJRkl4", "Stanford CS224N NLP"),
]

# Captions come in ~3 second fragments. Merge them into ~12 second lines
# so each search result reads like a full thought.
MIN_SECONDS = 12

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "transcripts.json"
RAW = ROOT / "data" / "raw"  # cache, so re-runs don't hit YouTube again


def video_title(video_id):
    """Ask YouTube's public oEmbed endpoint for the video's title."""
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.load(r)["title"]


def fetch_raw(api, video_id):
    """Raw caption fragments + title, cached in data/raw/<id>.json.

    YouTube blocks IPs that request transcripts too often, so each video
    is only downloaded once.
    """
    cache = RAW / f"{video_id}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    snippets = api.fetch(video_id, languages=["en"]).snippets
    data = {
        "title": video_title(video_id),
        "snippets": [{"start": s.start, "duration": s.duration, "text": s.text} for s in snippets],
    }
    RAW.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def clean(text):
    return " ".join(text.replace("\n", " ").split())


def main():
    api = YouTubeTranscriptApi()
    videos = []
    for vid, course in VIDEOS:
        raw = fetch_raw(api, vid)
        lines, current = [], None
        for s in raw["snippets"]:
            text = clean(s["text"])
            if not text:
                continue
            if current is None:
                current = {"start_seconds": round(s["start"], 1), "text": text}
            else:
                current["text"] += " " + text
            if s["start"] + s["duration"] - current["start_seconds"] >= MIN_SECONDS:
                lines.append(current)
                current = None
        if current:
            lines.append(current)
        # Prefix the course label unless YouTube's title already names it
        title = raw["title"] if course.split()[0] in raw["title"] else f"{course}: {raw['title']}"
        videos.append({"video_id": vid, "title": title, "lines": lines})
        print(f"{title}: {len(lines)} lines")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(videos, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
