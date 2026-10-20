---
name: lol-client-ui-effects
description: Find and extract the League Client (LCU) UI effects behind Collections tiles and similar widgets - the rarity border SVGs, rarity gems and the looping "linger" glow video that plays on newly acquired items - plus how to query the live client API when the lockfile is empty. Use when asked where a client animation, glow, shader-like effect or tile art comes from, or when replicating LCU visuals.
---

# Hunting LCU UI effects and tile art

The client is Chromium/CEF running Ember apps. Every "shader" or glow effect in
it is CSS (gradients, `filter`, `mix-blend-mode`) or an **alpha-less WebM played
behind the artwork** - there is no GPU shader anywhere in the client. Only the
game engine ships compiled DX11 shaders (`Game/DATA/FINAL/ShaderCache.dx11.wad.client`,
1369 chunks carrying `DXBC` bytecode).

Tools used here: `tools/scan_wad_text.py`, `tools/collect_css_urls.py`,
`tools/wad_dump_images.py`, `tools/wad_path_map.py`, `tools/grep_minified.py`,
`tools/lcu_fetch.py`.

## 1. Where the UI comes from

```
<install>/LeagueClient/Plugins/<plugin>/assets.wad     one wad per frontend plugin
<install>/LeagueClient/Plugins/rcp-be-lol-game-data/default-assets*.wad   catalog + art
```

Plugin JS/CSS/images/videos all live in that single `assets.wad`, addressed at
runtime as `/fe/<plugin>/<path>` (that route only exists inside CEF - the
remoting API port answers 404 for `/fe/...`).

## 2. Find the code for a widget by content, not by name

Chunk names in the TOC are hashes and the LCU packer's exact spelling is **not**
`xxh64(path)` for any of the obvious prefixes (plain, `/`, `assets/`,
`fe/<plugin>/`, plugin-relative). `wad_path_map.py probe` shows this in one run.
Scan by content instead:

```powershell
py -3.14 tools/scan_wad_text.py <plugin>\assets.wad --dump tmp\wad_scan\<plugin>
```

It decompresses every chunk, sniffs the payload (`js`/`css`/`png`/`webm`/`xml`/
`ogg`) and prints keyword hit counts, which immediately exposes the CSS bundle,
the JS bundle and the videos. Minified bundles are one enormous line, so read
them with `tools/grep_minified.py <file> <regex> --window N`, never with grep.

Useful starting keywords: `keyframes,animation,glow,pulse,shimmer,hue-rotate,
mix-blend-mode,webm,<widget-class-name>`. Beware false positives from localized
strings (German "Inhalte" matches `inhal`).

## 3. The Collections summoner-icon tile (worked example)

Template (JS) and CSS give the whole anatomy:

| layer | rule | asset |
| --- | --- | --- |
| tile | `.rcp-fe-lol-collections-summoner-icon-item` 92x92 | - |
| art | `.inventory-item-image-container.owned` with a `clip-path` polygon (chamfered frame) | `/lol-game-data/assets/v1/profile-icons/<id>.jpg` |
| glow | `.linger-video-wrapper` `left:-9px; top:-6px; width:105px` > `video.linger-video` `width:106px; loop` | `/fe/lol-collections/video/purchase/linger.webm` (`skin-linger.webm` for skins) |
| border | `.border.{rarity}.item-type-general` | `/fe/lol-collections/images/item-element/borders/border-<rarity>-<state>.svg` (rarity: normal/base/rare/epic/legendary/mythic/ultimate/exalted/transcendent; state: gradient/normal/current/selected/equipped) |
| gem | `.gem-wrapper .gem.{borderRarity}`, 12-26 px | `inventoryItem.rarity.gemIcon` served from game data |

Paint order in the template: video, then art, then border, then gem. The glow
video has **no alpha channel** (`vp8`, `yuv420p`), it is simply wider than the
tile, so only its outer halo survives around the 92x92 art - that is the
"breathing" edge glow.

It only appears on new items: `shouldShowNewItemGlow = isNew || isNewBorder`
(purchase/rental date >= `lastVisitTime`), played in `didInsertElement`, and
`hoverToDismissVideo` hides it on hover.

Other animated bits in the same plugin: `fill-brightness` / `pulsating-flow`
(mastery progress bar), `fadeIn` on route entry, `.style_video.<style>` rune
background loops recoloured with `filter: hue-rotate(...)`. Files literally
named "shader" (`images/skins-viewer/showcase/screen-shader.png`) are static
overlay PNGs, not shaders.

## 4. Talking to the running client

`tools/lcu_fetch.py` reads `LeagueClient/lockfile`; on Tencent/WeGame builds
that file is **0 bytes**, so the tool falls back to parsing the newest
`*LeagueClientUx.log`, which echoes `--app-port=` and `--remoting-auth-token=`
(the same credentials the client puts in its own `https://riot:<token>@127.0.0.1:<port>/index.html`).
Then `GET /lol-game-data/assets/...` works (catalogs such as
`v1/summoner-icons.json` with per-icon `rarities`, and raw art). `/fe/...`
plugin routes do not answer there - extract those from the wad instead.

The Ux log is created at 0 bytes and only flushes minutes into a session, so a
fresh client yields no credentials; `lcu-live-data-surfaces` has the full
discovery order and the live-surfaces map.

## 5. Inspecting the extracted media

```powershell
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt -of csv=p=0 x.webm
ffmpeg -y -v error -ss 2 -i x.webm -frames:v 1 frame.png      # one frame
```

`pix_fmt=yuv420p` with `alpha_mode` absent means opaque: the effect relies on
paint order, not transparency. Video chunks are the ones whose payload starts
with the EBML magic `1A 45 DF A3`; `tools/scan_wad_text.py` classifies them as
`webm`. To prove an effect, composite a decoded frame at the CSS geometry behind
the real tile crop - matching offsets is what makes the reproduction convincing.

## 6. Gotchas

* The PowerShell console is GBK: force UTF-8 in Python helpers
  (`sys.stdout.reconfigure(encoding="utf-8", errors="replace")`) or printing
  localized strings raises `UnicodeEncodeError`.
* Avoid inline `python -c` with quotes/regex from PowerShell - it mangles the
  argument. Put the code in a file under `tmp/` (or promote it to `tools/`).
* Keep game-asset rips in `tmp/` (gitignored); commit only tools and skills.
