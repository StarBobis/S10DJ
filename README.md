# Set 10 (Remix Rumble) Mixing Desk

Reconstruction of the Teamfight Tactics **Set 10 / patch 13.24** adaptive music
system: the rules that decide which music styles play, plus a browser mixing desk
that layers the game's stems in real time as you place units.

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
  prismatic), which matters most for K/DA and the other three-layer bands;
* a solo act such as **Maestro (Jhin) always occupies one of the three layers**.

`src/rules.js` implements this as: `weight(style) = units(style) + tierIndex`,
then each layer independently takes the heaviest style able to provide it
(ties fall back to the shipped priority order), and the base style `none` fills
whatever is left. Every layer can be overridden by hand in the UI.

## Running the desk

```powershell
python -m http.server 8787      # from the repository root
# then open http://127.0.0.1:8787/
```

Click champions to add copies, press **Play**, switch **era** (the game ships an
early and a late render of every stem), and mix with the layer faders. The layer
cards show the exact Wwise switch each choice corresponds to.

## Layout

```
data/set10_units.json   62 units with cost, traits and music style
data/music_rules.json   styles, layer inventory, thresholds, stem index
src/rules.js            weight + layer assignment engine
src/audio.js            Web Audio stem player with crossfades
src/app.js              UI
assets/audio/*.aac      stems as extracted (68 files)
assets/audio_ogg/*.ogg  stems converted for browser playback
tools/                  extraction and data build scripts (see the skills)
.agents/skills/         reusable know-how for this pipeline
tmp/                    scratch space (never committed)
```

## Provenance of the audio

The stems were extracted from the Set 10 build of the game and match the shipped
layer inventory (`drums` / `main` / `secondary` renders, early and late). The
repository keeps the converted Ogg copies; `tools/convert_stems.py` regenerates
them.

## Known uncertainty

The layer *inventory* and switch ids are read straight from the shipped data.
The weighting rule is a reconstruction: unit counts and tier bonuses are
confirmed by Riot's interview, while the exact tie-breaking and the way partial
bands split layers are inferred. That is why the desk exposes per-layer manual
overrides instead of hiding the decision inside the engine.
