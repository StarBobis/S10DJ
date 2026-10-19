"""Find keywords in minified bundles and print a context window per hit.

Minified JS/CSS arrives as one enormous line, so plain grep is useless.
This prints file, offset and a +/- window around every occurrence.

Usage:
  python grep_minified.py <file> <regex> [--window N] [--max N]
  python grep_minified.py <dir> <regex> --glob *.js      # walk a directory
"""
import argparse
import os
import re
import sys

# Bundles carry non-ASCII (localized strings); a GBK console would crash on print.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass


def scan_file(path, pat, window, limit):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        print(f"!! {path}: {exc}")
        return 0
    hits = 0
    for m in pat.finditer(text):
        hits += 1
        if hits > limit:
            break
        start = max(0, m.start() - window)
        end = min(len(text), m.end() + window)
        snippet = text[start:end].replace("\n", "\\n")
        print(f"\n--- {os.path.basename(path)} @{m.start()} [{m.group(0)}]")
        print(f"    {snippet}")
    if hits:
        print(f"\n== {os.path.basename(path)}: {hits} hit(s)")
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("pattern")
    ap.add_argument("--window", type=int, default=160)
    ap.add_argument("--max", type=int, default=8, help="max hits printed per file")
    ap.add_argument("--glob", default=None, help="only files ending with this suffix")
    args = ap.parse_args()

    pat = re.compile(args.pattern, re.I)
    total = 0
    if os.path.isdir(args.target):
        for root, _dirs, files in os.walk(args.target):
            for name in sorted(files):
                if args.glob and not name.endswith(args.glob):
                    continue
                total += scan_file(os.path.join(root, name), pat, args.window, args.max)
    else:
        total = scan_file(args.target, pat, args.window, args.max)
    print(f"\nTOTAL {total} hit(s)")
    return 0 if total else 1


if __name__ == "__main__":
    sys.exit(main())
