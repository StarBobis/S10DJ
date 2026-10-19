"""查看 ManifestDownloader 导出的清单 JSON（紧凑输出）。

用法: python inspect_manifest.py <manifest.json> [regex]
"""
import json
import re
import sys

path = sys.argv[1]
pat = re.compile(sys.argv[2], re.I) if len(sys.argv) > 2 else None

with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)

print("top-level:", list(data.keys()))
files = data.get("files")
print("files container type:", type(files).__name__, "len:", len(files))

# files 可能是 list[dict] 或 dict[name->entry]
entries = []
if isinstance(files, list):
    for item in files:
        if isinstance(item, dict):
            entries.append(item)
elif isinstance(files, dict):
    for k, v in files.items():
        if isinstance(v, dict):
            v = dict(v)
            v.setdefault("name", k)
            entries.append(v)

print("entries:", len(entries))
if entries:
    print("entry keys sample:", sorted(entries[0].keys()))
    print("first entry:", json.dumps(entries[0], ensure_ascii=False)[:300])

hits = 0
for e in entries:
    name = str(e.get("name") or e.get("path") or e.get("file") or "")
    if pat and not pat.search(name):
        continue
    size = e.get("size") or e.get("file_size") or 0
    try:
        if isinstance(size, str):
            size = int(re.sub(r"[^0-9]", "", size) or 0)
        size_mb = int(size) / 1048576
    except Exception:
        size_mb = -1
    chunks = e.get("chunks") or []
    print(f"  {size_mb:10.2f} MB  chunks={len(chunks):4d}  {name}")
    hits += 1
    if hits > 200:
        print("  ... (truncated)")
        break
print("hits:", hits)
