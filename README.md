# Set 10 (Remix Rumble) Mixing Desk

A Tauri desktop app that rebuilds the Teamfight Tactics **Set 10 / patch 13.24**
adaptive music system: the rules that decide which styles play, and a live mixing
desk that layers the game's stems as you place units.

Everything which makes the mix fits on **one desk page**: champion pool, hex
board, hero spotlight, traits and the three-channel mixer. The selected champion
also becomes the blurred global wallpaper, and every surface stays translucent
over it.

* **Frontend**: Vue 3 + TypeScript (Vite), bundled with **bun**
* **Backend**: **Rust** (Tauri 2) - stem scan, data files, settings persistence,
  asset root
* **Audio**: Web Audio, one voice per stem, gains ramped so layers can be
  toggled while playing, plus a live analyser driving the waveform
* **Art**: 60 extracted TFT champion banners for the UI, 60 square splashes for
  the global wallpaper, and a procedural stage texture
* **Locale**: English and Simplified Chinese for champion, trait and style names

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

* **Sidebar** - the desk at the top, the collapse toggle and Settings pinned to
  the bottom. The title bar is only the drag region, brand and window buttons.
* **Champion pool** - the extracted TFT champion banner, localized name, cost
  and style. Filter by cost, search in English or Chinese, click to deploy or
  right-click to remove.
* **Hex board** - 4 x 7 hexes. Click to select, **drag to move or swap**,
  double-click to star up (1-3), right-click to remove. Each copy bought adds a
  star, and a champion counts once for traits no matter its star level.
* **Hero spotlight** - the selected or hovered champion's banner, localized name,
  traits and remove/upgrade actions.
* **Traits** - active music traits with count, next breakpoint, tier and meter,
  followed by non-music traits. Names and layer assignments are localized.
* **Mixing desk** - one channel per layer with an on/off switch, vertical fader,
  style override and the exact `Set_Switch_set10_*` name. The header carries a
  live waveform/spectrum analyser.
* **Radio** - one click builds a themed board, starts playback and keeps
  rotating stations (`12 s`) and eras. `Next station` skips immediately; stop
  restores the board, selection, era and layer settings you had before.
* **Style Lab** - a no-champion mode for composing styles directly. Pick a style
  per layer, click a style to apply it to all its layers, or use a curated combo
  such as **Jazz + True Damage**. Champion data is ignored while manual mode is
  active, and clicking a champion returns to board mode.
* **Global wallpaper** - selecting a champion crossfades its set splash behind
  the whole app; every panel is translucent and blurred over it.

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
language, the default era, loop behaviour and runs the audio diagnostics.

The game ships an early and a late render of every stem, so the era selector
swaps the whole set. With **Lock loop** on, all voices wrap at the shortest
active stem so layers cannot drift apart.

## Art assets

The UI uses the in-game TFT champion banners, not the splash wallpaper:

```
tft10_<champion>.tft_set10.png          256x128 banner  -> src/assets/heroes/banner
tft10_<champion>_mobile.tft_set10.png   512x512 splash  -> src/assets/heroes/wallpaper
```

Both are downloaded from CommunityDragon's patch 13.24 TFT assets and converted
to WebP (384x192 and 384x384). The banner is the primary hero tile everywhere;
the square splash is used only for the blurred global backdrop.

```powershell
python tools/fetch_hero_art.py     # banner/ + wallpaper/ + credits.json
python tools/make_board_art.py     # src/assets/board/stage.webp + grain.png
```

Both scripts are idempotent; pass `--force` to `fetch_hero_art.py` to download
again. Vite fingerprints the images into the bundle, so dev and packaged builds
use the same paths. `credits.json` records the source URL for both renders.

## Localized data

`tools/build_dataset.py` merges `en_us.json` and `zh_cn.json` from the patch
13.24 TFT data:

* `units[].nameZh` - Simplified Chinese champion name
* `rules.traitNamesZh` - display trait name -> Chinese label
* `rules.styleNamesZh` - style id -> Chinese style label

The JSON is written with `\u` escapes, so the repository stays ASCII while the
UI renders Chinese. `src/i18n/index.ts` exposes `championName`, `traitName` and
`styleName`, which every component uses instead of the raw data fields.

## Layout

```
data/set10_units.json        60 units with cost, traits, style, art and nameZh
data/music_rules.json        styles, layers, thresholds, stems and Chinese names
src/core/rules.ts            weight + layer assignment + style palette
src/core/combos.ts           curated no-champion layer combinations
src/core/audio.ts            Web Audio mixer + master analyser
src/core/data.ts             data loading, Tauri commands, stem URLs
src/core/art.ts              banner, wallpaper and stage lookup
src/stores/desk.ts           board editing, manual mix, radio, transport
src/components/              desk, pool, board, spotlight, traits, mixer,
                             StyleLab, Waveform, GlobalWallpaper
src/assets/heroes/banner/    60 TFT champion banners
src/assets/heroes/wallpaper/ 60 square set splashes
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
explain how to fetch and unpack. The banners and splashes are the same set art
Riot shipped for the set; `src/assets/heroes/credits.json` records every URL.

## Known uncertainty

The layer *inventory* and switch ids are read straight from the shipped data.
The weighting rule is a reconstruction: unit counts and tier bonuses are
confirmed by Riot's interview, while the exact tie-breaking and the way partial
bands split layers are inferred - which is why each layer has a manual override
and the Style Lab exists.
