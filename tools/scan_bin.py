"""扫描二进制文件中的 Wwise / 音乐相关标记。

用法: python scan_bin.py <file> [pattern...]
默认模式: BKHD (Wwise bank), RIFF (wem), TFT10, Set10, Remix, Music, DJ
输出: 每个模式的出现次数与前若干偏移，并打印偏移附近的可见字符串。
"""
import mmap
import re
import sys

DEFAULT_PATTERNS = [b"BKHD", b"RIFF", b"TFT10", b"Set10", b"Remix", b"Music", b"DJ_Sona"]


def strings_near(mm, off, before=64, after=200000, minlen=5, limit=40):
    """提取 off 附近的可见 ASCII 字符串。"""
    start = max(0, off - before)
    end = min(len(mm), off + after)
    chunk = mm[start:end]
    found = re.findall(rb"[\x20-\x7e]{%d,}" % minlen, chunk)
    out = []
    for f in found[:limit]:
        out.append(f.decode("ascii", "replace"))
    return out


def main():
    path = sys.argv[1]
    patterns = [p.encode() for p in sys.argv[2:]] or DEFAULT_PATTERNS
    with open(path, "rb") as fh:
        with mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ) as mm:
            size = len(mm)
            print(f"# file: {path}  size: {size:,} bytes")
            for pat in patterns:
                offs = []
                pos = 0
                while True:
                    i = mm.find(pat, pos)
                    if i < 0:
                        break
                    offs.append(i)
                    pos = i + 1
                    if len(offs) >= 5000:
                        break
                print(f"\n## pattern {pat!r}: {len(offs)} hit(s)")
                for i in offs[:12]:
                    print(f"   offset {i:,} (0x{i:X})")
                if offs:
                    strs = strings_near(mm, offs[0])
                    print(f"   -- strings near first hit --")
                    for s in strs[:25]:
                        print(f"      {s}")
                del offs


if __name__ == "__main__":
    main()
