"""Scan every chunk of a WAD, classify it and grep for keyword groups.

Chunk names are xxhash64 of the asset path, so the TOC carries no names.
This scans by content instead: decompress everything, sniff the payload type
and count keyword hits per chunk.

Usage:
  python scan_wad_text.py <wad> [--keywords a,b,c] [--dump <outdir>] [--min-bytes N]

Prints a magic histogram, then one line per chunk that hits any keyword.
With --dump the hitting chunks are written as <hash>.<ext> for inspection.
"""
import argparse
import collections
import gzip
import os
import re
import struct
import sys

try:
    from compression import zstd
except ImportError:  # Python < 3.14
    try:
        import zstandard as zstd  # type: ignore

        class _Zstd:
            @staticmethod
            def decompress(raw):
                return zstd.ZstdDecompressor().decompress(raw, max_output_size=1 << 31)

        zstd = _Zstd()
    except ImportError:
        zstd = None

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"

DEFAULT_KEYWORDS = (
    "breath,pulse,glow,shimmer,holo,shader,keyframes,animation,"
    "webm,animated,summoner-icon,sparkle,foil,iridescent"
)

MAGICS = [
    (b"\x89PNG", "png"),
    (b"\x1aE\xdf\xa3", "webm"),
    (b"OggS", "ogg"),
    (b"RIFF", "riff"),
    (b"BKHD", "bnk"),
    (b"PROP", "prop"),
    (b"\x1bLua", "luac"),
    (b"DDS ", "dds"),
    (b"RST", "rst"),
    (b"{\n", "json?"),
    (b"<?xml", "xml"),
    (b"<!DOCTYPE", "html"),
    (b"<!doctype", "html"),
]


def read_toc(path):
    with open(path, "rb") as fh:
        head = fh.read(4 + 256 + 8 + 4)
        magic, major, minor = struct.unpack_from("<HBB", head, 0)
        if magic != 0x5752:
            raise SystemExit(f"not a WAD: magic={magic:#x}")
        (count,) = struct.unpack_from("<i", head, 4 + 256 + 8)
        toc = fh.read(count * 32)
    entries = []
    for i in range(count):
        ph, off, csize, usize, tfc = struct.unpack_from("<QIIIB", toc, i * 32)
        entries.append(
            {"hash": ph, "offset": off, "csize": csize, "usize": usize, "ctype": tfc & 0xF}
        )
    return major, minor, entries


def decompress(raw, ctype, usize):
    if ctype == 0:
        return raw
    if ctype == 1:
        return gzip.decompress(raw)
    if ctype == 3:
        return zstd.decompress(raw) if zstd else None
    if ctype == 4:
        if not zstd:
            return None
        off = raw.find(ZSTD_MAGIC)
        if off < 0:
            return raw
        out = bytearray(usize)
        out[:off] = raw[:off]
        out[off:] = zstd.decompress(raw[off:])
        return bytes(out)
    return None


def classify(data):
    for magic, kind in MAGICS:
        if data.startswith(magic):
            return kind
    head = data[:4096]
    if b"{" in head and b":" in head:
        return "text"
    printable = sum(1 for b in head if 9 <= b <= 13 or 32 <= b <= 126)
    if head and printable / len(head) > 0.9:
        if re.search(rb"(function|var |const |import |=>|document\.|window\.)", head):
            return "js"
        if re.search(rb"(\.\{|#|@media|px;|:\s*\d)", head):
            return "css"
        return "text"
    return "bin"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wad")
    ap.add_argument("--keywords", default=DEFAULT_KEYWORDS)
    ap.add_argument("--dump")
    ap.add_argument("--min-bytes", type=int, default=0)
    ap.add_argument("--all", action="store_true", help="list every chunk, not only hits")
    args = ap.parse_args()

    keywords = [k.strip().lower() for k in args.keywords.split(",") if k.strip()]
    major, minor, entries = read_toc(args.wad)
    total = sum(e["usize"] for e in entries)
    print(f"WAD v{major}.{minor} chunks={len(entries)} uncompressed={total / 1048576:.1f} MB")

    hist = collections.Counter()
    failed = 0
    hits_total = 0
    for e in entries:
        with open(args.wad, "rb") as fh:
            fh.seek(e["offset"])
            raw = fh.read(e["csize"])
        data = decompress(raw, e["ctype"], e["usize"])
        if data is None:
            failed += 1
            continue
        kind = classify(data)
        hist[kind] += 1
        if len(data) < args.min_bytes:
            continue
        low = data.lower()
        counts = {k: low.count(k.encode()) for k in keywords}
        counts = {k: v for k, v in counts.items() if v}
        if not counts and not args.all:
            continue
        hits_total += 1
        top = ",".join(f"{k}={v}" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])[:6])
        print(f"  {e['hash']:016x} {kind:>6} usize={len(data):>9} {top}")
        if args.dump:
            os.makedirs(args.dump, exist_ok=True)
            ext = {"js": "js", "css": "css", "html": "html", "json?": "json", "text": "txt"}.get(kind, "bin")
            out = os.path.join(args.dump, f"{e['hash']:016x}.{ext}")
            with open(out, "wb") as w:
                w.write(data)
    print("magic histogram:", dict(hist.most_common()))
    print(f"failed={failed} keyword_chunks={hits_total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
