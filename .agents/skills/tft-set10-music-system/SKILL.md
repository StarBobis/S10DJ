---
name: tft-set10-music-system
description: Reference for the Teamfight Tactics Set 10 (Remix Rumble) adaptive soundtrack - the three mixing layers, the Wwise switch surface, the style-to-trait table, where the data lives in the shipped files, and how to rebuild a mixing desk from it. Use for any Set 10 music question or for extending the mixing desk in this repository.
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
`Set_State_Music_set10_Phase_*` (Draft / Prepare / Locked / Victory / Knockout)
and stingers are `Play_mus_map22_set10_stinger_*`.

Where it lives in the shipped files (patch 13.24):

* `Map22.wad.client` -> the TFT10 music data chunk (a `PROP` bin, ~17 MB in
  13.24, ~32 MB in later patches) holds the whole switch/state name table.
* The audio media themselves are separate WADs and were not in the 13.24
  `lol-game-client` manifest's Map22 chunk set; stems survive as community
  rips (`kda_early_drums`, `pentakill_late_main`, ...).
* `assets/audio/` in this repo holds those rips; render names map to layers as
  `drums -> drums`, `main -> chords`, `secondary -> top`, with an `early` and a
  `late` version of each.

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

## Rule reconstruction

Confirmed by Riot's design interview:

* up to three styles sound at once (one per layer);
* triggers follow **unit counts**, not only activated breakpoints, so class-trait
  comps still get music;
* a style's share grows with its breakpoint tier (bronze/silver/gold/prismatic);
* a solo act like Maestro (Jhin) always holds one of the three layers.

Implemented in `src/rules.js`:

```
weight(style) = units(style) + tierIndex(style trait breakpoints, count)
for each layer: take the heaviest style that provides that layer
                (ties -> priority list in data/music_rules.json)
                nothing eligible -> none
Maestro present -> top = classical
```

## Data files

* `data/set10_units.json` - 62 units with cost, traits, music style.
* `data/music_rules.json` - styles, layer inventory, trait thresholds (from the
  set data: K/DA 3/5/7/10, Emo 2/4/6, ...), stem index, priority, sources.

## Rebuilding the dataset

```powershell
curl.exe -k -o tmp/tftdata/en_us.json https://raw.communitydragon.org/13.24/cdragon/tft/en_us.json
python tools/build_dataset.py
```

CommunityDragon keeps per-patch TFT data, which is the cheapest way to get unit
and trait tables for any set.
