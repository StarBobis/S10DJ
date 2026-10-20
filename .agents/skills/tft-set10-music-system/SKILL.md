---
name: tft-set10-music-system
description: Reference for the Teamfight Tactics Set 10 (Remix Rumble) adaptive soundtrack - the three layers, the 33 Wwise switches, the style-to-trait table, where the data lives, the solo-act and Headliner edge cases, and how the desk reconstructs the selection rules. Use for any Set 10 music question or when extending the mixing desk in this repository.
---

# Set 10 music system

## The mechanism

The soundtrack is three stacked layers, each selected by its own Wwise switch:

```
Set_Switch_set10_<style>_<layer>       # patch 13.24 naming
Set_Switch_tft10_<style>_<layer>       # later revival naming
layer in { drums, chords, top }
```

`none` is the base track used by any layer no style occupies. Phase music uses
`Set_State_Music_set10_Phase_*` (Draft / Prepare / Locked / Battle) and stingers
are `Play_mus_map22_set10_stinger_*`.

Where it lives in the shipped files (patch 13.24):

* `Map22.wad.client` -> the TFT10 music data chunk (a `PROP` bin, ~17 MB in
  13.24, ~32 MB in later patches) holds the switch/state name table.
* The audio media themselves are separate WADs. Stems survive as community
  rips (`kda_early_drums`, `pentakill_late_main`, ...).
* `assets/audio/` in this repo holds those rips; render names map to layers as
  `drums -> drums`, `main -> chords`, `secondary -> top`, with an `early` and a
  `late` version of each.

## Switch surface (33 names, from the 13.24 bin)

```
8bit        chords drums
classical   top
country     chords drums
dj          drums
edm         chords drums
emo         chords drums
funk        chords drums
hyperpop    top
illbeats    drums top
jazz        top
kda         chords drums top
none        chords drums top
pentakill   chords drums top
popband     chords drums top
punkrock    chords drums
truedamage  chords drums top
```

`ILLBEATS` really does have both a drums and a top switch; some community
summaries list only drums. Count = 33.

## Style table

| style | trait | layers |
| --- | --- | --- |
| 8bit | 8-bit | drums, chords |
| classical | Maestro (Jhin) | top |
| country | Country | drums, chords |
| dj | Mixmaster (Sona) | drums |
| edm | EDM | drums, chords |
| emo | Emo | drums, chords |
| funk | Disco | drums, chords |
| hyperpop | Hyperpop | top |
| illbeats | ILLBEATS | drums, top |
| jazz | Jazz | top |
| kda | K/DA | drums, chords, top |
| none | base | drums, chords, top |
| pentakill | Pentakill | drums, chords, top |
| popband | Heartsteel | drums, chords, top |
| punkrock | Punk | drums, chords |
| truedamage | True Damage | drums, chords, top |

The renames are confirmed by Riot's own trait api names: `Set10_Funk` = Disco,
`Set10_PopBand` = Heartsteel, `Set10_Classical` = Maestro, `Set10_DJ` =
Mixmaster, `Set10_IllBeats` = ILLBEATS, `Set10_PunkRock` = Punk.

## Rule reconstruction (evidence-backed)

Riot's design interview (the Chinese interview with Matthew Wittrock and Alison
Ho is the clearest source) confirms:

* up to three styles sound at once (one per layer);
* the original rule used **activated traits**, then changed to **unit counts**
  so class-trait comps still get music;
* breakpoint tier (bronze/silver/gold/prismatic) raises that style's share;
* a solo act such as Maestro (Jhin) always holds one of the three layers.

The desk implements:

```
weight(style) = units(style) + tierIndex(style trait breakpoints, count)
for each layer: take the heaviest style that provides that layer
                equal weight -> higher tier, then priority list
                nothing eligible -> none
solo acts (classical, dj, illbeats) -> guaranteed layer before overrides
Headliner -> +1 to one chosen trait before tier calculation
```

The exact arithmetic and tie-break are a reconstruction: Riot never published a
formula, and the selection code is native rather than a Lua/bin rule table. Do
not claim it is bit-perfect. The Settings audit panel lists the assumptions.

## Edge cases and limits

* **Solo acts conflict**: Maestro only top, Mixmaster only drums, ILLBEATS
  drums/top. If all three are present, one may lose the guarantee when only
  solo-held layers remain; that is an inferred edge case.
* **Headliner** adds +1 to a chosen existing trait. Only one Headliner should
  exist; this desk enforces that.
* **Emblems, augments and portals** that add traits/champions are not modeled.
* **Phase music and stingers** are not modeled; only the early/late stems are.
* **Base track** only replaces a layer no style occupies; it is not mixed under
  every track.

## Data files

* `data/set10_units.json` - 60 units with cost, traits, music style, art and
  `nameZh`.
* `data/music_rules.json` - styles, layer inventory, thresholds, stems, priority,
  `traitDisplayStyle`, `traitNamesZh`, `styleNamesZh`.

## Rebuilding the dataset

```powershell
curl.exe -k -o tmp/tftdata/en_us.json https://raw.communitydragon.org/13.24/cdragon/tft/en_us.json
curl.exe -k -o tmp/tftdata/zh_cn.json https://raw.communitydragon.org/13.24/cdragon/tft/zh_cn.json
python tools/build_dataset.py
```

CommunityDragon keeps per-patch TFT data, which is the cheapest way to get unit
and trait tables for any set.

## Shipped bank layout (13.24)

The layer routing lives in two Wwise banks inside `Map22.wad.client`:

```
assets/sounds/wwise2016/sfx/shared/mus_map22_gameplay_set10_events.bnk  hash 835ed8f59b628d8a
assets/sounds/wwise2016/sfx/shared/mus_map22_gameplay_set10_audio.bnk   hash 12c5bae31c72a039
```

`wad_tool.py grab` needs the xxhash64 of the **lowercase** path; the paths are
printed in the 17 MB Map22 `PROP` bin next to `Play_mus_map22_theme_set10_draft`.
Dump the events bank with wwiser (it recovers the bank name from the BKHD ID):

```powershell
git clone --depth 1 https://github.com/bnnm/wwiser.git tmp/wwiser
py -3.14 tmp/wwiser/wwiser.py -d txt tmp/music_banks/MUS_Map22_Gameplay_Set10_events.bnk
```

What the dump shows:

* A music switch container (`183207102`, meter 140 BPM, 4-bar grid 6857 ms)
  selects between three random-sequence containers; one of them
  (`1058364540`) holds the gameplay song.
* The song is **one music segment** (`549536093`, 212,516 ms, 4/4) with **three
  child music tracks** (`106360728`, `826482659`, `911005957`). Each track has
  its own switch group (`uGroupID` 2652961736/738/739) and 7-13 sources, i.e.
  the styles per layer. A switch swaps the source inside the running track.
* Sources run 168-210 s and are placed at `fPlayAt` 1659.2 ms or 8516.3 ms with
  end trims. Those are the authors' entry points on the shared segment timeline,
  not separate songs. Community rips are raw media with the placement stripped,
  so inferring per-style offsets from file duration is not reliable.
* The `_audio.bnk` is only 0.5 MB: the media are streamed `.wem` files, not bank
  data. The event names sit in the PROP bin: `Play_mus_map22_set10_base_Act1`,
  `Play_mus_map22_set10_kda`, `Play_mus_map22_theme_set10`,
  `Set_State_Music_set10_Phase_*`.

The segment's `AkMeterInfo` says **120 BPM**, while the wrapping switch container
says 140 BPM and the onset analysis of the shipped stems points at ~140 BPM
(bar ~1.714 s). Do not build a bar quantiser from the segment meter alone.

The 33 switch names hash to IDs that are *not* FNV-1 of the printed names
(Wwise generated group IDs), so the name-to-group mapping is inferred from the
track arity (13 drums, 11 chords, 9 top), not recovered from the bank.
