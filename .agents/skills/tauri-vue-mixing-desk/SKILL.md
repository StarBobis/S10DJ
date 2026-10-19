---
name: tauri-vue-mixing-desk
description: Build and extend the Tauri 2 + Vue 3 + TypeScript desktop mixing desk in this repository, including the single-page board/traits/mixer desk, the frameless WinUI-style shell, the Rust command surface, the Set 10 portrait pipeline and the Web Audio layer mixer. Use when changing the app shell, adding a command, fixing playback scheduling, editing board interactions or adding a locale.
---

# Tauri 2 + Vue 3 desk

## Stack and commands

```
bun install
bun run dev        # Vite only, http://127.0.0.1:8787
bun run build      # vue-tsc --noEmit && vite build
bun run app:dev    # Tauri window (Rust + WebView2)
bun run app:build  # NSIS bundle
```

Vite must bind IPv4 (`server.host: '127.0.0.1'`); the default `localhost` binding
resolves to `::1` on this machine, which makes `tauri dev` and plain
`127.0.0.1` checks fail with "connection refused" even though Vite reports ready.
Keep `tauri.conf.json` `devUrl` on `http://127.0.0.1:8787` for the same reason.

The desk keeps `data/` and `audio` outside the bundle so extracted files stay
where the Python tools wrote them. A small Vite middleware serves `/data` and
`/assets` from the repository root. UI art lives in `src/assets` and is imported
through Vite, so a packaged build only needs the `data` and `audio_ogg`
resources listed in `tauri.conf.json`.

## Single-page structure

`App.vue` has two routes: `desk` and `settings`. `DeskView.vue` owns the one desk
page:

```
TransportBar
desk-grid: ChampionPool | BoardStage | (HeroSpotlight + TraitsPanel)
MixerPanel
```

All of it shares `src/stores/desk.ts`. Do not split board/traits/mixer back into
separate routes - the point of the page is that a board change, the resulting
trait tiers and the layer switches are visible together.

Board model: `board: BoardUnit[]` with `{ apiName, star, slot }`.
`BOARD_ROWS x BOARD_COLUMNS` gives 28 hex slots, `MAX_BOARD_UNITS` is 10 and
`MAX_STARS` is 3. Buying a champion already on the board raises its star instead
of adding a second trait count; TFT traits count a champion once even when it is
3-starred. `slots` is a computed sparse array used by `BoardStage.vue`; native
HTML drag-and-drop moves or swaps entries with `text/plain` payloads
`shop:<apiName>` and `board:<apiName>`.

## Rust command surface

`src-tauri/src/lib.rs` exposes six commands, all invoked from
`src/core/data.ts`:

| command | purpose |
| --- | --- |
| `asset_root` | folder holding the Ogg stems (repo checkout in dev, bundled resource afterwards, app data as fallback) |
| `scan_stems` | list `.ogg` stems, read `durations.json`, report required-but-missing files |
| `load_data` | read `data/set10_units.json` and `data/music_rules.json` from the repo/resource folder; a packaged WebView has no HTTP route to those folders |
| `load_settings` / `save_settings` | JSON settings in the app config dir |
| `log_event` | forward mixer diagnostics to the Rust console |

The frontend degrades gracefully in a plain browser: `inTauri()` checks
`__TAURI_INTERNALS__`, settings fall back to `localStorage`, data falls back to
`fetch('data/...')`, and stems are fetched from the dev server.

The desk also opens the resolved stem directory on the Tauri asset-protocol
scope in `setup`, so a packaged build can decode stems from the resource folder.

## Visual assets

`tools/fetch_hero_art.py` downloads the patch 13.24 mobile splash renders from
CommunityDragon, crops them square and writes 384x384 WebP portraits to
`src/assets/heroes/<art>.webp` plus `credits.json`. `tools/make_board_art.py`
renders the stage backdrop and film grain into `src/assets/board/`. Both are
idempotent and runnable with the bundled Python.

`src/core/art.ts` maps `unit.art` to the hashed URL with an eager
`import.meta.glob('../assets/heroes/*.webp', { eager: true, query: '?url', import: 'default' })`.
`ArtImage.vue` adds a text fallback when a file is missing. Regenerating art
while Vite is running requires a page reload because the glob is evaluated once.

For the exact CDragon URLs, naming rules and crop recipe, load the
`tft-champion-portraits` skill.

## Web Audio pitfalls (learned the hard way)

* **Never schedule a negative offset.** `AudioBufferSourceNode.start(when,
  offset)` rejects a negative offset with `The offset provided (-0.08) is less
  than the minimum bound (0)`. That happens when the transport start time is in
  the future (`ctx.currentTime + 0.08`) while the position is computed from
  `currentTime - startedAt`. Clamp the position at zero and pass `0` for a hard
  start.
* **Never call `convertFileSrc` in a browser.** In the old fallback path it ran
  outside Tauri and threw `Cannot read properties of undefined (reading
  'convertFileSrc')`, which surfaced as a play failure. `stemUrlFallback` now
  returns `null` when the page is served over HTTP.
* **Key voices by stem file, not by layer.** The base `none` style and ILLBEATS
  feed several layers from one file; one voice per layer stacks the same file and
  doubles its level (and phase).
* **Toggle by gain, not by stop/start.** Voices keep running while a layer is
  switched off, so re-enabling stays in sync; stop the source only when the stem
  is no longer used at all.
* **Lock the loop region** when layers have different durations (for example
  165 s vs 170 s): set `loopStart`/`loopEnd` to the shortest active stem so
  layers cannot drift apart over time. `setLockLoop` updates `loopEnd` on live
  voices instead of restarting them.
* **Load stems in parallel.** `applyPlan` awaits `Promise.all`, and `load()`
  deduplicates concurrent requests for the same file. Sequential awaits made the
  first play take several seconds.
* **One start call.** `StemMixer.start(plan, settings, master, lockLoop)` takes
  the plan up front; calling a separate `applyPlan` after `start` used to stack a
  second voice for the initial plan.
* **Do not decode stems at startup.** The old self-test fetched three large Ogg
  files on every launch. The diagnostics button in Settings runs the same
  `selfTest` on demand.

## Trait mapping pitfall

Champion set data lists traits by display name (`K/DA`, `8-bit`, `Disco`) while
the Wwise trait api uses suffixes (`Set10_KDA`, `Set10_8Bit`, `Set10_Funk`).
`rules.ts` must consume `traitDisplayStyle` (display name -> style). Using
`traitToStyle` against champion traits silently disables every breakpoint bonus
and pushes all music traits into the "other" bucket. `tools/build_dataset.py`
emits both maps; keep them in sync when regenerating the dataset.

## i18n

Messages live in `src/i18n/messages.ts`. The Simplified Chinese table is written
with `\u` escapes so the source tree stays ASCII while the UI renders Chinese.
`useI18n()` picks the table from `settings.language` and supports `{name}`
interpolation via `t('key', { count })`. Keep new source strings ASCII; convert
Chinese literals with a small script before committing.

## Verification

`bun run build` is the fast gate. For UI and playback checks, use the headless
Chrome CDP recipe in the `browser-cdp-smoke-test` skill: deploy champions, check
`.trait-row`/`.plan-pill`/`.channel-switch`, press Play, switch era, override a
layer, then read the diagnostics result. A successful run logs
`selftest: 3/3 stems decodable` and the transport status becomes `playing`.
