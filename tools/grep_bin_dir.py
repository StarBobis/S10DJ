"""在目录内所有文件里按正则提取命中的可打印字符串（去重计数）。

用法: python grep_bin_dir.py <dir> <regex> [max]
"""
import os
import re
import sys

d, pat = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 100
rx = re.compile(pat.encode(), re.I)

found = {}
for root, _dirs, names in os.walk(d):
    for n in names:
        p = os.path.join(root, n)
        with open(p, "rb") as f:
            data = f.read()
        for m in rx.finditer(data):
            s = m.group(0).decode("ascii", "replace")
            found.setdefault(s, set()).add(n)

print(f"# {len(found)} unique matched strings in {d}")
for s in sorted(found)[:limit]:
    files = sorted(found[s])[:3]
    print(f"  {s}   [{len(found[s])} chunk(s): {', '.join(files)}]")
