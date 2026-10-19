"""Map asset paths to WAD chunk hashes (xxhash64) and extract them by path.

WAD TOCs store only the xxhash64 of the asset path, so a path becomes
extractable once you guess the exact string the packer hashed.  This tool
hashes a list of candidate spellings of each wanted path and reports which
spelling hits a chunk.

Usage:
  python wad_path_map.py probe <wad> <candidates.txt>     # find the prefix convention
  python wad_path_map.py extract <wad> <candidates.txt> <outdir> [--prefix P]

<candidates.txt> holds one asset path per line, e.g.
  images/item-element/borders/border-rare-gradient.svg
The probe mode tries these shapes for every line and prints the hit rate of
each shape, so the working convention is obvious at a glance.
"""
import argparse
import os
import re
import struct
import sys

import xxhash

try:
    from compression import zstd
except ImportError:  # Python < 3.14
    import zstandard as _zstd

    class _Z:
        @staticmethod
        def decompress(raw):
            return _zstd.ZstdDecompressor().decompress(raw, max_output_size=1 << 31)

    zstd = _Z()

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"

SHAPES = [
    "{p}",
    "/{p}",
    "assets/{p}",
    "assets/{p}".lower(),
    "{p}".lower(),
    "/assets/{p}",
]


def read_toc(path):
    with open(path, "rb") as fh:
        head = fh.read(4 + 256 + 8 + 4)
        magic, major, minor = struct.unpack_from("<HBB", head, 0)
        if magic != 0x5752:
            raise SystemExit(f"not a WAD: magic={magic:#x}")
        (count,) = struct.unpack_from("<i", head, 4 + 256 + 8)
        toc = fh.read(count * 32)
    entries = {}
    for i in range(count):
        ph, off, csize, usize, tfc = struct.unpack_from("<QIIIB", toc, i * 32)
        entries[ph] = {"hash": ph, "offset": off, "csize": csize, "usize": usize, "ctype": tfc & 0xF}
    return major, minor, entries


def decompress(raw, ctype, usize):
    if ctype == 0:
        return raw
    if ctype == 1:
        import gzip

        return gzip.decompress(raw)
    if ctype == 3:
        return zstd.decompress(raw)
    if ctype == 4:
        off = raw.find(ZSTD_MAGIC)
        if off < 0:
            return raw
        out = bytearray(usize)
        out[:off] = raw[:off]
        out[off:] = zstd.decompress(raw[off:])
        return bytes(out)
    raise ValueError(f"compression {ctype}")


def read_chunk(wad, entry):
    with open(wad, "rb") as fh:
        fh.seek(entry["offset"])
        raw = fh.read(entry["csize"])
    return decompress(raw, entry["ctype"], entry["usize"])


def variants(prefix, path):
    """Spellings of one asset path, from the extern prefix plus built-in shapes."""
    path = path.lstrip("/")
    extra = []
    if prefix:
        p = prefix.strip("/")
        extra = [f"{p}/{path}", f"/{p}/{path}"]
    return extra + [s.format(p=path) for s in SHAPES]


def probe(wad, paths, prefix):
    major, minor, entries = read_toc(wad)
    print(f"WAD v{major}.{minor} chunks={len(entries)}")
    stats = {}
    samples = {}
    for path in paths:
        for shape in variants(prefix, path):
            h = xxhash.xxh64(shape.encode()).intdigest()
            key = shape.replace(path, "{p}")
            stats.setdefault(key, [0, 0])
            stats[key][1] += 1
            if h in entries:
                stats[key][0] += 1
                samples.setdefault(key, (path, entries[h]))
    for key, (hits, tried) in sorted(stats.items(), key=lambda kv: -kv[1][0]):
        print(f"  {hits:>4}/{tried:<4} {key}")
        if key in samples and hits:
            path, entry = samples[key]
            print(f"         e.g. {path} -> {entry['hash']:016x} usize={entry['usize']}")
    return 0


def extract(wad, paths, outdir, prefix):
    major, minor, entries = read_toc(wad)
    ok = 0
    for path in paths:
        found = None
        for shape in variants(prefix, path):
            h = xxhash.xxh64(shape.encode()).intdigest()
            if h in entries:
                found = (shape, entries[h])
                break
        if not found:
            print(f"  MISS {path}")
            continue
        shape, entry = found
        data = read_chunk(wad, entry)
        out = os.path.join(outdir, path.lstrip("/"))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as fh:
            fh.write(data)
        ok += 1
        print(f"  OK   {path}  ({len(data):,} B, ctype={entry['ctype']})")
    print(f"extracted {ok}/{len(paths)}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["probe", "extract"])
    ap.add_argument("wad")
    ap.add_argument("list")
    ap.add_argument("outdir", nargs="?")
    ap.add_argument("--prefix", default=None)
    args = ap.parse_args()

    with open(args.list, encoding="utf-8") as fh:
        paths = [line.strip() for line in fh if line.strip() and not line.startswith("#")]
    if args.mode == "probe":
        return probe(args.wad, paths, args.prefix)
    if not args.outdir:
        raise SystemExit("extract needs an outdir")
    return extract(args.wad, paths, args.outdir, args.prefix)


if __name__ == "__main__":
    sys.exit(main())
