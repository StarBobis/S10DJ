# Set 10 (Remix Rumble) Mixing Desk

A Tauri desktop app that rebuilds the Teamfight Tactics **Set 10 / patch 13.24**
adaptive music system: the rules that decide which styles play, and a live mixing
desk that layers the game's stems as you place units.

The whole set fits on **one desk page**: champion pool, hex board, traits, hero
spotlight and the three-channel mixer are visible at the same time, so changing
the board immediately shows which layer switches follow.

* **Frontend**: Vue 3 + TypeScript (Vite), bundled with **bun**
* **Backend**: **Rust** (Tauri 2) - stem scan, data files, settings persistence,
  asset root
* **Audio**: Web Audio, one voice per stem, gains ramped so layers can be
  toggled while playing
* **Art**: 60 Set 10 champion splash portraits plus a procedural stage texture

## What the game actually does (evidence-backed)

Three layers make up the soundtrack, and every layer has its own Wwise switch:

```
Set_Switch_set10_<style>_<layer>      layer in { drums, chords, top }
```

Those switch names ship inside the 13.24 game data (`Map22.wad.client`, TFT10
music data chunk), which is also where the style list comes from. Riot's own
trait api names confirm the style ids:

| style id | trait (display name) | layers provided |
| --- | --- | --- |
| `8bit` | 8-bit | drums, chords |
| `classical` | Maestro (Jhin) | top |
| `country` | Country | drums, chords |
| `dj` | Mixmaster (Sona) | drums |
| `edm` | EDM | drums, chords |
| `emo` | Emo | drums, chords |
| `funk` | Disco (`Set10_Funk`) | drums, chords |
| `hyperpop` | Hyperpop | top |
| `illbeats` | ILLBEATS | drums, top |
| `jazz` | Jazz | top |
| `kda` | K/DA | drums, chords, top |
| `none` | base track | drums, chords, top |
| `pentakill` | Pentakill | drums, chords, top |
| `popband` | Heartsteel (`Set10_PopBand`) | drums, chords, top |
| `punkrock` | Punk | drums, chords |
| `truedamage` | True Damage | drums, chords, top |

Additional rules from Riot's design interview about the set:

* the mix is driven by **how many units of a style are on the board**, not only
  by activated breakpoints (so class-trait comps still hear music);
* a style's share grows with its breakpoint tier (bronze -> silver -> gold ->
  prismatic);
* a solo act such as **Maestro (Jhin) always occupies one of the three layers**.

`src/core/rules.ts` implements this as `weight(style) = units(style) +
tierIndex`, then each layer independently takes the heaviest style able to
provide it (ties fall back to the shipped priority order) and the base style
`none` fills whatever is left. Every layer can be overridden by hand.

Champion data keys traits by **display name** (`K/DA`, `8-bit`, ...) while the
trait api uses suffixes (`Set10_KDA`). `music_rules.json` carries both views
(`traitDisplayStyle` and `traitToStyle`); the rules engine uses the display-name
map, which is why breakpoint bonuses show up in the UI and in the mix.

## The desk

* **Champion pool** - filter by cost or search, click to deploy (up to ten
  units), right-click to remove. Cards carry the Set 10 portrait, cost and
  music style.
* **Hex board** - 4 x 7 hexes. Click to select, drag to swap, double-click to
  star up (1-3), right-click to remove. Each copy bought adds a star, and a
  champion counts once for traits no matter its star level.
* **Hero spotlight** - the selected or hovered champion fills the card with its
  splash art, traits, music style and remove/upgrade actions.
* **Traits** - active music traits with count, next breakpoint, tier and meter;
  non-music traits follow. The three layer assignments are shown above them.
* **Mixing desk** - one channel per layer with an on/off switch, vertical fader,
  style override and the exact `Set_Switch_set10_*` name. Play/stop, era and
  loop lock live in the transport bar.

## Running it

```powershell
bun install
bun run dev        # browser dev server on http://127.0.0.1:8787
bun run app:dev    # Tauri window (frameless, custom title bar)
bun run build      # type check + production bundle
bun run app:build  # installable bundle
```

In the desk: add units on the left, press **Play**, then toggle layers, move
faders or pin a style while the music keeps running. **Settings** switches the
language (English / Simplified Chinese), the default era, loop behaviour and
runs the audio diagnostics.

The game ships an early and a late render of every stem, so the era selector
swaps the whole set. With **Lock loop** on, all voices wrap at the shortest
active stem so layers cannot drift apart.

## Art assets

Set 10 portraits come from CommunityDragon's patch 13.24 TFT splash renders
(`tft10_<champion>_mobile.tft_set10.png`, 512 x 512) and are converted to
384 x 384 WebP so the whole set stays around 1 MB:

```powershell
python tools/fetch_hero_art.py     # src/assets/heroes/*.webp + credits.json
python tools/make_board_art.py     # src/assets/board/stage.webp + grain.png
```

Both scripts are idempotent; pass `--force` to `fetch_hero_art.py` to download
again. The board backdrop and grain are generated locally so they can be
re-rendered without any external file. Vite fingerprints the portraits into the
bundle, so dev and packaged builds use the same paths.

## Layout

```
data/set10_units.json        60 units with cost, traits, style and art key
data/music_rules.json        styles, layer inventory, thresholds, stems
src/core/rules.ts            weight + layer assignment + style palette
src/core/audio.ts            Web Audio mixer (one voice per stem)
src/core/data.ts             data loading, Tauri commands, stem URLs
src/core/art.ts              portrait and stage lookup from the Vite graph
src/stores/desk.ts           reactive desk state, board editing, transport
src/components/              desk view, pool, board, spotlight, traits, mixer
src/assets/heroes/           60 Set 10 portraits + source credits
src/assets/board/            generated stage backdrop and grain
src/i18n/                    English + Simplified Chinese messages
src-tauri/                   Rust backend and Tauri configuration
assets/audio_ogg/            converted stems (68 files, git ignored)
tools/                       extraction, conversion, dataset, art scripts
.agents/skills/              reusable know-how for this pipeline
tmp/                         scratch space (never committed)
```

## Provenance of the audio and art

The stems were extracted from the Set 10 build of the game and match the shipped
layer inventory (`drums` / `main` / `secondary` renders, early and late);
`tools/convert_stems.py` regenerates the Ogg copies used here. The rules data was
recovered from the 13.24 client WADs, which the skills under `.agents/skills`
explain how to fetch and unpack. The portraits are the same set skins Riot
shipped for the set; `src/assets/heroes/credits.json` records every source URL.

## Known uncertainty

The layer *inventory* and switch ids are read straight from the shipped data.
The weighting rule is a reconstruction: unit counts and tier bonuses are
confirmed by Riot's interview, while the exact tie-breaking and the way partial
bands split layers are inferred - which is why each layer has a manual override.
