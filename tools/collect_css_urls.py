"""Collect url() references from a CSS bundle and print or save them.

Client CSS bundles are single-line minified files with hundreds of asset
references; this lists the unique ones so they can be fed to wad_path_map.py.

Usage:
  python collect_css_urls.py <css-file> [out.txt] [--filter REGEX]
"""
import argparse
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("css")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--filter", default=None)
    args = ap.parse_args()

    with open(args.css, encoding="utf-8", errors="replace") as fh:
        text = fh.read()

    urls = []
    for raw in re.findall(r"url\(([^)]+)\)", text):
        url = raw.strip().strip("\"'").strip()
        if url.startswith("data:") or url in urls:
            continue
        urls.append(url)

    if args.filter:
        pat = re.compile(args.filter, re.I)
        urls = [u for u in urls if pat.search(u)]

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write("\n".join(urls) + "\n")
    print(f"{len(urls)} unique url(s)")
    for u in urls[:40]:
        print("  " + u)
    if len(urls) > 40:
        print(f"  ... {len(urls) - 40} more")
    return 0


if __name__ == "__main__":
    sys.exit(main())
