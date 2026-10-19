"""Convert the extracted AAC stems to Ogg Vorbis for browser playback.

Reads assets/audio/*.aac, writes assets/audio_ogg/*.ogg and
assets/audio_ogg/durations.json (seconds per stem, measured with ffprobe).
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "audio")
DST = os.path.join(ROOT, "assets", "audio_ogg")


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", path],
        capture_output=True, text=True, check=False,
    )
    try:
        return float(out.stdout.strip())
    except ValueError:
        return None


def main():
    os.makedirs(DST, exist_ok=True)
    durations = {}
    files = sorted(n for n in os.listdir(SRC) if n.endswith(".aac"))
    for i, name in enumerate(files, 1):
        base = name[:-4]
        out = os.path.join(DST, base + ".ogg")
        if not os.path.exists(out):
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", os.path.join(SRC, name),
                 "-c:a", "libvorbis", "-q:a", "5", out],
                check=True,
            )
        durations[base] = probe(out)
        print(f"[{i}/{len(files)}] {base}: {durations[base]:.2f}s", flush=True)
    with open(os.path.join(DST, "durations.json"), "w", encoding="utf-8") as fh:
        json.dump(durations, fh, indent=1, sort_keys=True)
    values = [v for v in durations.values() if v]
    if values:
        print(f"min={min(values):.2f}s max={max(values):.2f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
