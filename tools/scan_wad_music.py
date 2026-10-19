"""扫描整个 WAD：统计块类型，并找出含音乐关键字的块。

用法: python scan_wad_music.py <wad> [outdir] [--keywords a,b,c]
输出: 每个命中块的 hash/大小/关键字符串；可选把命中块写到 outdir。
"""
import argparse
import gzip
import os
import re
import struct
import sys
import time
from compression import zstd

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"
DEFAULT_KEYS = ["Music", "mus_map22", "Set10", "Remix", "Mixmaster", "MusicPlayer"]


def read_toc(path):
    with open(path, "rb") as f:
        head = f.read(4 + 256 + 8 + 4)
        magic, major, minor = struct.unpack_from("<HBB", head, 0)
        assert magic == 0x5752, hex(magic)
        (count,) = struct.unpack_from("<i", head, 4 + 256 + 8)
        toc = f.read(count * 32)
    entries = []
    for i in range(count):
        base = i * 32
        ph, doff, csize, usize, tfc = struct.unpack_from("<QIIIB", toc, base)
        entries.append((ph, doff, csize, usize, tfc & 0xF))
    return major, minor, entries


def decompress(raw, ctype, usize):
    if ctype == 0:
        return raw
    if ctype == 1:
        return gzip.decompress(raw)
    if ctype == 3:
        try:
            return zstd.decompress(raw)
        except Exception:
            return None
    if ctype == 4:
        off = raw.find(ZSTD_MAGIC)
        if off < 0:
            return raw
        try:
            out = bytearray(usize)
            out[:off] = raw[:off]
            out[off:] = zstd.decompress(raw[off:])
            return bytes(out)
        except Exception:
            return None
    return None


def sniff(data):
    if data[:4] == b"BKHD":
        return "bnk"
    if data[:4] in (b"RIFF", b"RIFX"):
        return "riff"
    if data[:4] == b"OggS":
        return "ogg"
    if data[:4] == b"AKPK":
        return "akpk"
    return "other"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wad")
    ap.add_argument("outdir", nargs="?", default=None)
    ap.add_argument("--keywords", default=",".join(DEFAULT_KEYS))
    args = ap.parse_args()
    keys = [k.encode() for k in args.keywords.split(",") if k]

    t0 = time.time()
    major, minor, entries = read_toc(args.wad)
    print(f"WAD v{major}.{minor} chunks={len(entries)}  ({args.wad})", flush=True)
    if args.outdir:
        os.makedirs(args.outdir, exist_ok=True)

    kinds = {}
    matches = []
    with open(args.wad, "rb") as f:
        for i, (ph, doff, csize, usize, ctype) in enumerate(entries):
            f.seek(doff)
            raw = f.read(csize)
            data = decompress(raw, ctype, usize)
            if data is None:
                kinds["undecodable"] = kinds.get("undecodable", 0) + 1
                continue
            k = sniff(data)
            kinds[k] = kinds.get(k, 0) + 1
            if k in ("riff", "ogg"):
                kinds[f"{k}_bytes"] = kinds.get(f"{k}_bytes", 0) + len(data)
            hit_keys = [key.decode() for key in keys if key in data]
            if hit_keys:
                strs = [
                    s.decode("ascii", "replace")
                    for s in re.findall(rb"[\x20-\x7e]{10,120}", data)
                    if any(key in s for key in keys)
                ]
                matches.append((f"{ph:016x}", k, len(data), hit_keys, sorted(set(strs))[:25]))
                if args.outdir:
                    ext = {"bnk": "bnk", "riff": "wem", "ogg": "ogg"}.get(k, "bin")
                    with open(os.path.join(args.outdir, f"{ph:016x}.{ext}"), "wb") as w:
                        w.write(data)
            if (i + 1) % 20000 == 0:
                print(f"  ... {i+1}/{len(entries)}  {time.time()-t0:.0f}s  matches={len(matches)}", flush=True)

    print("\nkind stats:", kinds)
    print(f"matched chunks: {len(matches)}")
    for h, k, size, hk, strs in matches[:60]:
        print(f"\n== {h}  kind={k}  {size/1024:.1f} KB  keys={hk}")
        for s in strs[:12]:
            print("   ", s)
    print(f"\nelapsed {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
