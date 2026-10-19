"""英雄联盟 WAD v3.4 解包器（专注音频：Wwise .bnk 与 .wem）。

格式（来自 LeagueToolkit ltk_wad）：
  头部: u16 magic(0x5752 "RW"), u8 major, u8 minor
        major==3: 256 字节签名 + u64 校验
        i32 chunk_count
  条目 (v3.4, 32 字节):
        u64 path_hash, u32 data_offset, u32 compressed_size, u32 uncompressed_size,
        u8 (frame_count<<4 | compression_type), 3 字节 start_frame, u64 checksum
  compression_type: 0=none 1=gzip 2=satellite 3=zstd 4=zstdmulti

用法:
  python wad_extract_audio.py <wad> <outdir> [--all] [--min-bytes N]
默认只写 BKHD(.bnk) / RIFF(.wem) / OggS(.ogg) 的块。
"""
import argparse
import gzip
import os
import re
import struct
import sys
import time
from compression import zstd

ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"


def sniff(data: bytes):
    if data[:4] == b"BKHD":
        return "bnk"
    if data[:4] in (b"RIFF", b"RIFX") and data[8:12] in (b"WAVE", b"wave"):
        return "wem"
    if data[:4] == b"OggS":
        return "ogg"
    return None


def decompress(raw: bytes, ctype: int, usize: int) -> bytes:
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
    raise ValueError(f"unsupported compression {ctype}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("wad")
    ap.add_argument("outdir")
    ap.add_argument("--all", action="store_true", help="写出所有块（不按类型过滤）")
    ap.add_argument("--min-bytes", type=int, default=0, help="音频块最小解压大小")
    args = ap.parse_args()

    t0 = time.time()
    with open(args.wad, "rb") as f:
        head = f.read(4 + 256 + 8 + 4)
        magic, major, minor = struct.unpack_from("<HBB", head, 0)
        assert magic == 0x5752, hex(magic)
        (count,) = struct.unpack_from("<i", head, 4 + 256 + 8)
        print(f"WAD v{major}.{minor}  chunks={count}  ({args.wad})", flush=True)

        toc = f.read(count * 32)
        entries = []
        for i in range(count):
            base = i * 32
            ph, doff, csize, usize, tfc = struct.unpack_from("<QIIIB", toc, base)
            entries.append((ph, doff, csize, usize, tfc & 0xF, tfc >> 4))

        os.makedirs(args.outdir, exist_ok=True)
        stats = {}
        kept = 0
        music_hits = []
        for idx, (ph, doff, csize, usize, ctype, frames) in enumerate(entries):
            f.seek(doff)
            raw = f.read(csize)
            try:
                data = decompress(raw, ctype, usize)
            except Exception:  # noqa: BLE001
                stats[f"err{ctype}"] = stats.get(f"err{ctype}", 0) + 1
                continue
            stats[f"ctype{ctype}"] = stats.get(f"ctype{ctype}", 0) + 1
            kind = sniff(data)
            if kind is None and not args.all:
                continue
            if kind in ("bnk", "wem", "ogg") and len(data) < args.min_bytes:
                continue
            if kind is None:
                kind = "bin"
            stats[kind] = stats.get(kind, 0) + 1
            sub = os.path.join(args.outdir, kind)
            os.makedirs(sub, exist_ok=True)
            path = os.path.join(sub, f"{ph:016x}.{kind}")
            with open(path, "wb") as w:
                w.write(data)
            kept += 1
            if kind == "bnk":
                names = re.findall(rb"[\x20-\x7e]{8,}", data[:800000])
                text = b" ".join(names).decode("ascii", "replace")
                hit = sorted(set(re.findall(r"[A-Za-z0-9_]*(?:Music|Set10|Remix|Mixmaster)[A-Za-z0-9_]*", text)))
                if hit:
                    music_hits.append((f"{ph:016x}", hit[:40], len(data)))
            if kept % 200 == 0:
                print(f"  ... {idx+1}/{count} chunks, kept {kept}, {time.time()-t0:.0f}s", flush=True)

        print("stats:", stats)
        print("kept files:", kept)
        print(f"elapsed {time.time()-t0:.0f}s")
        for h, names, size in music_hits[:25]:
            print(f"\n[bnk {h}] {size/1024:.0f} KB")
            for n in names:
                print("   ", n)


if __name__ == "__main__":
    sys.exit(main())
