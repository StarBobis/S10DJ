"""在 ManifestDownloader 导出的清单 JSON 中按正则筛选文件，输出路径与大小。

用法: python find_in_manifest.py <manifest.json> <regex> [max]
"""
import json
import re
import sys

path, pattern = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 100

with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)

pat = re.compile(pattern, re.I)
total = 0
shown = 0
for e in data["files"]:
    p = e["path"]
    if not pat.search(p):
        continue
    total += 1
    if shown < limit:
        size = int(re.sub(r"[^0-9]", "", e.get("file_size", "0")) or 0)
        print(f"{size / 1048576:10.2f} MB  ({size:>14,} B)  {p}")
        shown += 1
print(f"# matched {total} file(s), shown {shown}")
