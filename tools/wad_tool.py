"""WAD 工具：列出 TOC、按偏移/哈希定位块、按哈希提取块。

用法:
  python wad_tool.py list   <wad> [regex_hex]           # 列出块（可过滤 hash 前缀）
  python wad_tool.py offset <wad> <byte_offset>          # 找出覆盖该偏移的块
  python wad_tool.py grab   <wad> <hash_hex> <outfile>   # 提取指定 hash 的块
  python wad_tool.py find   <wad> <needle>               # 在未压缩块里找字符串
"""
import gzip
import os
import re
import struct
import sys
from compression import zstd

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"


def read_toc(path):
    with open(path, "rb") as f:
        head = f.read(4 + 256 + 8 + 4)
        magic, major, minor = struct.unpack_from("<HBB", head, 0)
        assert magic == 0x5752, hex(magic)
        (count,) = struct.unpack_from("<i", head, 4 + 256 + 8)
        toc = f.read(count * 32)
    entries = []
    for i in range(count):
        base = i * 32
        ph, doff, csize, usize, tfc = struct.unpack_from("<QIIIB", toc, base)
        if minor <= 3:
            ctype = tfc & 0xF
        else:
            ctype = tfc & 0xF
        entries.append(
            {
                "hash": ph,
                "offset": doff,
                "csize": csize,
                "usize": usize,
                "ctype": ctype,
                "frames": tfc >> 4,
            }
        )
    return major, minor, entries


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


def read_chunk(wad, entry):
    with open(wad, "rb") as f:
        f.seek(entry["offset"])
        raw = f.read(entry["csize"])
    return decompress(raw, entry["ctype"], entry["usize"])


def main():
    cmd = sys.argv[1]
    wad = sys.argv[2]
    major, minor, entries = read_toc(wad)

    if cmd == "list":
        print(f"WAD v{major}.{minor} chunks={len(entries)}")
        pat = sys.argv[3].lower() if len(sys.argv) > 3 else None
        for e in entries:
            h = f"{e['hash']:016x}"
            if pat and not h.startswith(pat):
                continue
            print(f"  {h}  off={e['offset']:>12}  csize={e['csize']:>9}  usize={e['usize']:>9}  ctype={e['ctype']}")
        return

    if cmd == "offset":
        target = int(sys.argv[3], 0)
        for e in entries:
            if e["offset"] <= target < e["offset"] + e["csize"]:
                print(f"chunk {e['hash']:016x} ctype={e['ctype']} csize={e['csize']} usize={e['usize']} frames={e['frames']}")
                data = read_chunk(wad, e)
                print("decompressed size:", len(data))
                print("head:", data[:64].hex(" "))
                strs = re.findall(rb"[\x20-\x7e]{8,}", data[:200000])
                print("strings (first 40):")
                for s in strs[:40]:
                    print("   ", s.decode("ascii", "replace"))
                return
        print("no chunk covers that offset")
        return

    if cmd == "grab":
        want = int(sys.argv[3], 16)
        out = sys.argv[4]
        for e in entries:
            if e["hash"] == want:
                data = read_chunk(wad, e)
                with open(out, "wb") as w:
                    w.write(data)
                print(f"wrote {len(data):,} bytes to {out} (ctype={e['ctype']})")
                return
        print("hash not found in this wad")
        return

    if cmd == "find":
        needle = sys.argv[3].encode()
        hits = 0
        with open(wad, "rb") as f:
            for e in entries:
                if e["ctype"] != 0:
                    continue
                f.seek(e["offset"])
                raw = f.read(e["csize"])
                if needle in raw:
                    print(f"hit in uncompressed chunk {e['hash']:016x} off={e['offset']} size={e['csize']}")
                    hits += 1
                    if hits > 20:
                        break
        print("hits:", hits)
        return

    print(__doc__)


if __name__ == "__main__":
    main()
