"""Dump every printable ASCII string of a binary to a text file (low memory).

Usage: python dump_strings.py <file> <out.txt> [minlen]
"""
import mmap
import re
import sys

MINLEN = int(sys.argv[3]) if len(sys.argv) > 3 else 8
CHUNK = 64 * 1024 * 1024
OVERLAP = 1024


def main():
    path, out = sys.argv[1], sys.argv[2]
    pat = re.compile(rb"[\x20-\x7e]{%d,}" % MINLEN)
    n = 0
    with open(path, "rb") as fh, open(out, "w", encoding="utf-8", errors="replace") as w:
        with mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            size = len(mm)
            pos = 0
            while pos < size:
                end = min(size, pos + CHUNK)
                chunk = mm[pos:end + OVERLAP]
                for m in pat.finditer(chunk):
                    w.write(m.group(0).decode("ascii", "replace"))
                    w.write("\n")
                    n += 1
                pos = end
    print(f"wrote {n:,} strings to {out}")


if __name__ == "__main__":
    main()
