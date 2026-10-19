---
name: lol-wad-extraction
description: Parse and extract League of Legends .wad.client archives (v1-v3.4) with Python, list chunks, locate a chunk by byte offset or path hash, and scan every chunk for text or magic markers such as Wwise banks and audio. Use when hunting for game assets inside WAD files without a GUI extractor.
---

# WAD extraction without a GUI

`tools/wad_extract_audio.py`, `tools/wad_tool.py`, `tools/scan_wad_music.py` and
`tools/hunt_music_wads.py` implement this format. Reference implementation:
`LeagueToolkit/league-toolkit`, crate `ltk_wad` (`chunk.rs`, `lib.rs`).

## Format (implemented in the tools)

```
header:  u16 magic 0x5752 ("RW"), u8 major, u8 minor
         major == 3: 256 byte signature, u64 checksum
         i32 chunk_count
entry v3.1 (minor <= 3): u64 path_hash, u32 offset, i32 compressed, i32 uncompressed,
                         u8 (frame_count << 4 | compression), u8 duplicated, u16 start_frame, u64 checksum
entry v3.4 (minor >= 4): u64 path_hash, u32 offset, u32 compressed, u32 uncompressed,
                         u8 (frame_count << 4 | compression), 3 byte start_frame, u64 checksum
compression: 0 none, 1 gzip, 2 satellite (unsupported), 3 zstd, 4 zstd-multi
```

Both entry layouts are 32 bytes, so a single parser works for either version.

```powershell
python tools/wad_tool.py list   <wad> [hash-prefix]     # chunk table
python tools/wad_tool.py offset <wad> <byte offset>     # which chunk owns an offset
python tools/wad_tool.py grab   <wad> <hash hex> <out>  # extract one chunk
python tools/scan_wad_music.py  <wad> [outdir] --keywords a,b,c
```

Python 3.14 has `compression.zstd`, so no third-party zstd package is needed.
For `zstd-multi`, copy the bytes before the first `28 B5 2F FD` frame verbatim
and decode from the magic onward.

## Practical notes

* Chunk names are **xxhash64 of the asset path**, so the TOC shows hashes only.
  Work by content: sniff magics (`BKHD` Wwise bank, `RIFF`/`WAVE` wem, `OggS`,
  `PROP` Riot property bin, `\x1bLua` Lua bytecode) or grep decompressed chunks
  for markers.
* The same hash means the same **asset path** across patches, so a hash found in
  today's client can be pulled from an old WAD to see how that asset looked then
  (content differs, the hash does not).
* Do not filter by "is it a bank" too early: audio *event* tables and music
  switches live in `PROP` data chunks, while the media lives in `BNK` chunks or
  in a separate WAD. Scan everything and print the magic histogram first.
* A single WAD scan of 2.5 GB costs ~25 s in Python when every chunk is
  decompressed, so run scans as managed background jobs.
* Some chunks legitimately fail to decode (satellite / truncated). Count them
  instead of aborting, otherwise one bad chunk hides the whole archive.
