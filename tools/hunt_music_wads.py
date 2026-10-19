"""Scan multiple WADs for S10 music style markers and save matching chunks.

Usage: python hunt_music_wads.py <file1> [file2 ...]
"""
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_wad_music import read_toc, decompress, sniff  # noqa: E402

KEYS = [b"popband", b"punkrock", b"illbeats", b"truedamage_drums", b"set10_chords",
        b"tft10_chords", b"mus_map22_set10", b"set10_kick", b"midi"]
OUT = r"D:\Dev\S10DJ\tmp\scan"


def main():
    for wad in sys.argv[1:]:
        if not os.path.exists(wad):
            print(f"# MISSING {wad}")
            continue
        t0 = time.time()
        try:
            major, minor, entries = read_toc(wad)
        except Exception as exc:  # noqa: BLE001
            print(f"# FAILED to read {wad}: {exc}")
            continue
        name = os.path.basename(wad)
        print(f"\n######## {name}  v{major}.{minor} chunks={len(entries)}", flush=True)
        kinds = {}
        matches = []
        outdir = os.path.join(OUT, name)
        with open(wad, "rb") as f:
            for i, (ph, doff, csize, usize, ctype) in enumerate(entries):
                f.seek(doff)
                raw = f.read(csize)
                data = decompress(raw, ctype, usize)
                if data is None:
                    kinds["undecodable"] = kinds.get("undecodable", 0) + 1
                    continue
                k = sniff(data)
                kinds[k] = kinds.get(k, 0) + 1
                hit = [key.decode() for key in KEYS if key in data]
                if hit:
                    matches.append((f"{ph:016x}", k, len(data), hit))
                    os.makedirs(outdir, exist_ok=True)
                    with open(os.path.join(outdir, f"{ph:016x}.{k}"), "wb") as w:
                        w.write(data)
                if (i + 1) % 30000 == 0:
                    print(f"   ... {i+1}/{len(entries)} matches={len(matches)} {time.time()-t0:.0f}s", flush=True)
        print("   kinds:", kinds)
        print(f"   matches: {len(matches)}")
        for h, k, size, hit in matches[:25]:
            print(f"     {h}  {k:8s} {size/1024:9.1f} KB  {hit}")
        print(f"   elapsed {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
