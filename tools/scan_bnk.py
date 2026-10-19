"""扫描目录内 Wwise 库（.bnk）的字符串，按关键字筛选。

用法: python scan_bnk.py <dir> [regex] [--top N]
"""
import os
import re
import sys

d = sys.argv[1]
pat = re.compile(sys.argv[2] if len(sys.argv) > 2 else r"music|set\d+|remix|mixmaster|mus_", re.I)

files = []
for root, _dirs, names in os.walk(d):
    for n in names:
        p = os.path.join(root, n)
        files.append((os.path.getsize(p), p))
files.sort(reverse=True)
print(f"# {len(files)} files in {d}")
print("# largest 15:")
for size, p in files[:15]:
    print(f"   {size/1024:10.1f} KB  {os.path.basename(p)}")

hits = 0
for size, p in files:
    with open(p, "rb") as f:
        data = f.read()
    if data[:4] != b"BKHD":
        continue
    strs = re.findall(rb"[\x20-\x7e]{6,}", data)
    matched = []
    for s in strs:
        t = s.decode("ascii", "replace")
        # 只看像事件/对象名的字符串
        if re.fullmatch(r"[A-Za-z0-9_\-./]{6,80}", t) and pat.search(t):
            matched.append(t)
    if matched:
        hits += 1
        uniq = sorted(set(matched))
        print(f"\n== {os.path.basename(p)}  ({size/1024:.0f} KB)  {len(uniq)} matched strings")
        for t in uniq[:60]:
            print("   ", t)
        if hits >= 30:
            print("... (stop after 30 banks)")
            break
print(f"\n# banks with matches: {hits}")
