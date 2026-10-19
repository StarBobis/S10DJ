"""Dump every PNG (and optionally other images) from a WAD, printing dimensions.

Chunk names are hashes, so the only way to find a specific picture is to look
at all of them.  This writes the images out and prints a size table, which is
usually enough to spot UI parts (tile borders, 12px rarity gems, ...).

Usage:
  python wad_dump_images.py <wad> <outdir> [--min-w N] [--max-w N] [--kind png]
"""
import argparse
import gzip
import os
import struct
import sys

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
    from PIL import Image
except ImportError:
    Image = None

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"
MAGICS = {b"\x89PNG": "png", b"DDS ": "dds", b"\xff\xd8\xff": "jpg"}


def read_toc(path):
    with open(path, "rb") as fh:
        head = fh.read(4 + 256 + 8 + 4)
        magic, major, minor = struct.unpack_from("<HBB", head, 0)
        if magic != 0x5752:
            raise SystemExit(f"not a WAD: magic={magic:#x}")
        (count,) = struct.unpack_from("<i", head, 4 + 256 + 8)
        toc = fh.read(count * 32)
    out = []
    for i in range(count):
        ph, off, csize, usize, tfc = struct.unpack_from("<QIIIB", toc, i * 32)
        out.append({"hash": ph, "offset": off, "csize": csize, "usize": usize,
                    "ctype": tfc & 0xF, "frames": tfc >> 4})
    return major, minor, out


def decompress(raw, ctype, usize):
    if ctype == 0:
        return raw
    if ctype == 1:
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wad")
    ap.add_argument("outdir")
    ap.add_argument("--min-w", type=int, default=0)
    ap.add_argument("--max-w", type=int, default=10 ** 6)
    ap.add_argument("--kind", default=None, help="png/dds/jpg")
    args = ap.parse_args()

    major, minor, entries = read_toc(args.wad)
    os.makedirs(args.outdir, exist_ok=True)
    print(f"WAD v{major}.{minor} chunks={len(entries)}")
    found = 0
    with open(args.wad, "rb") as fh:
        for e in entries:
            fh.seek(e["offset"])
            raw = fh.read(e["csize"])
            head = raw if e["ctype"] == 0 else None
            kind = None
            if head is not None:
                for magic, name in MAGICS.items():
                    if head.startswith(magic):
                        kind = name
                        break
            if kind is None:
                try:
                    data = decompress(raw, e["ctype"], e["usize"])
                except Exception:
                    continue
                for magic, name in MAGICS.items():
                    if data.startswith(magic):
                        kind = name
                        break
            else:
                data = raw
            if kind is None:
                continue
            if args.kind and kind != args.kind:
                continue
            size = ""
            if Image is not None and kind == "png":
                try:
                    import io

                    with Image.open(io.BytesIO(data)) as im:
                        w, h = im.size
                    size = f"{w}x{h}"
                    if not (args.min_w <= w <= args.max_w):
                        continue
                except Exception:
                    size = "unreadable"
            path = os.path.join(args.outdir, f"{e['hash']:016x}.{kind}")
            with open(path, "wb") as w:
                w.write(data)
            found += 1
            print(f"  {e['hash']:016x} {kind:>4} {len(data):>9} B {size:>11} frames={e['frames']}")
    print(f"dumped {found} image(s) to {args.outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
