"""在大文件里用正则抽取可打印字符串（分块扫描，避免一次性读入内存）。

用法: python scan_strings.py <file> "<regex>" [max_results]
regex 按 bytes 处理；匹配到的内容必须是可打印 ASCII（脚本已保证边界）。
"""
import mmap
import re
import sys

CHUNK = 128 * 1024 * 1024
OVERLAP = 4096


def main():
    path = sys.argv[1]
    pat = re.compile(sys.argv[2].encode())
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    found = {}
    with open(path, "rb") as fh:
        with mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            size = len(mm)
            print(f"# {path}  {size:,} bytes  regex={sys.argv[2]!r}")
            pos = 0
            while pos < size:
                end = min(size, pos + CHUNK)
                chunk = mm[pos:end + OVERLAP]
                for m in pat.finditer(chunk):
                    s = m.group(0)
                    if s not in found:
                        found[s] = pos + m.start()
                    if len(found) >= limit * 4:
                        break
                pos = end
            print(f"# unique matches: {len(found)}")
            for s, off in sorted(found.items(), key=lambda kv: kv[1])[:limit]:
                print(f"  0x{off:X}  {s.decode('ascii', 'replace')}")


if __name__ == "__main__":
    main()
