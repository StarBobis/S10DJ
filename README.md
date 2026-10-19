# Set 10 (Remix Rumble) Mixing Desk

A Tauri desktop app that rebuilds the Teamfight Tactics **Set 10 / patch 13.24**
adaptive music system: the rules that decide which styles play, and a live mixing
desk that layers the game's stems as you place units.

* **Frontend**: Vue 3 + TypeScript (Vite), bundled with **bun**
* **Backend**: **Rust** (Tauri 2) - stem scan, settings persistence, asset root
* **Audio**: Web Audio, one voice per stem, gains ramped so layers can be
  toggled while playing

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

## Running it

```powershell
bun install
bun run dev        # browser dev server on http://127.0.0.1:8787
bun run app:dev    # Tauri window (frameless, custom title bar)
bun run build      # type check + production bundle
bun run app:build  # installable bundle
```

In the desk: add units on **Board**, press **Play** on **Mixer**, then toggle
`drums` / `chords` / `top`, move their faders or pin a style per layer while the
music keeps running. **Settings** switches the language (English / Simplified
Chinese), the default era and the loop behaviour.

The game ships an early and a late render of every stem, so the era selector
swaps the whole set. With **Lock loop** on, all voices wrap at the shortest
active stem so layers cannot drift apart.

## Layout

```
data/set10_units.json    62 units with cost, traits and music style
data/music_rules.json    styles, layer inventory, thresholds, stem index
src/core/rules.ts        weight + layer assignment engine
src/core/audio.ts        Web Audio mixer (one voice per stem)
src/core/data.ts         data loading, Tauri commands, asset URLs
src/stores/desk.ts       reactive desk state
src/components/*.vue     title bar, sidebar, board, mixer, traits, settings
src/i18n/                English + Simplified Chinese messages
src-tauri/               Rust backend and Tauri configuration
assets/audio_ogg/        converted stems (68 files)
tools/                   extraction, conversion, dataset and icon scripts
.agents/skills/          reusable know-how for this pipeline
tmp/                     scratch space (never committed)
```

## Provenance of the audio

The stems were extracted from the Set 10 build of the game and match the shipped
layer inventory (`drums` / `main` / `secondary` renders, early and late);
`tools/convert_stems.py` regenerates the Ogg copies used here. The rules data was
recovered from the 13.24 client WADs, which the skills under `.agents/skills`
explain how to fetch and unpack.

## Known uncertainty

The layer *inventory* and switch ids are read straight from the shipped data.
The weighting rule is a reconstruction: unit counts and tier bonuses are
confirmed by Riot's interview, while the exact tie-breaking and the way partial
bands split layers are inferred - which is why each layer has a manual override.
