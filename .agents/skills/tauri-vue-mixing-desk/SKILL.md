---
name: tauri-vue-mixing-desk
description: Build and extend the Tauri 2 + Vue 3 + TypeScript desktop mixing desk in this repository, including the single-page board/traits/mixer desk, radio mode, manual Style Lab with all style combinations and likes, Headliners, trait-grouped pool, lineup export/import, global hero wallpaper, waveform analyser, localized TFT data and the Web Audio layer mixer. Use when changing the app shell, adding a command, fixing playback scheduling, editing board interactions or adding a locale.
---

# Tauri 2 + Vue 3 desk

## Stack and commands

```
bun install
bun run dev        # Vite only, http://127.0.0.1:8787
bun run build      # vue-tsc --noEmit && vite build
bun run app:dev    # Tauri window (Rust + WebView2)
bun run app:build  # NSIS bundle
python tools/build_dataset.py    # regenerate units/rules incl. zh_CN names
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

`App.vue` mounts `GlobalWallpaper` behind the shell and has two routes: `desk`
and `settings`. `DeskView.vue` owns the one desk page:

```
TransportBar (play/era/mode/loop/radio/lineup/plan/status)
desk-grid: ChampionPool | BoardStage or StyleLab | (HeroSpotlight + TraitsPanel)
MixerPanel (Waveform + three channels + master)
```

All of it shares `src/stores/desk.ts`. Do not split board/traits/mixer back into
separate routes - the point of the page is that a board change, the resulting
trait tiers and the layer switches are visible together.

Board model: `board: BoardUnit[]` with `{ apiName, star, slot, headliner? }`.
`BOARD_ROWS x BOARD_COLUMNS` gives 28 hex slots, `MAX_BOARD_UNITS` is 10 and
`MAX_STARS` is 3. Buying a champion already on the board raises its star instead
of adding a second trait count; TFT traits count a champion once even when it is
3-starred. `slots` is a computed sparse array used by `BoardStage.vue`; native
HTML drag-and-drop moves or swaps entries with `text/plain` payloads
`shop:<apiName>` and `board:<apiName>`.

A board unit can be a **Headliner** (`entry.headliner` is the chosen display
trait). `setHeadliner()` clears every other Headliner, raises the unit to at least
2 stars and adds +1 to that trait before tiers are calculated. The crown shows on
the hex and the trait count updates immediately.

**Tauri drag trap:** `tauri.conf.json` must set `app.windows[0].dragDropEnabled`
to `false`. With the default file-drop handler enabled, WebView2 can swallow
HTML5 dragstart/drop events on Windows, so the board appears undraggable even
though it works in Chrome. Keep the native DnD handlers and disable Tauri's file
drop.

## Radio mode

**A station is a style combo, not a single style.** `startRadio()` snapshots
board, selection, era, mix mode and layer settings, clears overrides and enables
all layers, then fills `radio.queue` with combo ids from `radioQueue()`:
`styleCombos` minus every banned id, liked combos first, each group shuffled.
`radioBeat()` shifts the next combo, builds a 6-10 unit board themed on that
combo's styles (`radioBoard(combo.styles)`), selects a featured champion (which
changes the global wallpaper), and may flip the era. The station label is the
combo label plus the drums style's fake FM dial position.

**The station plan is pinned.** `recompute()` ends with a `radioCombo` override:
while a station is on air every layer is `{ style, weight, pinned: true }`. Do not
remove it - the random board alone cannot guarantee the announced combo (a solo
act with weight > 0 always grabs a layer, unrelated styles can out-weigh a combo
style), and the heart/broken-heart buttons must act on the exact mix the user
hears. `MixerPanel` shows a `radio` badge on pinned channels. Leaving radio mode
(`stopRadio`) always calls `recompute()` so the pin is released, even when it is
not restoring the snapshot.

**One station = one song, measured in audio time.** A 250 ms ticker compares
`mixer.positionSeconds` against `mixer.songSeconds()` (the one loop per era,
because locked-loop playback wraps every voice there) and only publishes
`radio.progress` / `radio.remaining` until the song ends. Never drive the
rotation from `setInterval`/`Date.now()`: the old fixed 165 s timer cut every
early-era station 33-37 s short (the songs are 197.6-202.0 s) and its countdown
kept running while paused. Audio-position rotation also survives a slow stem
load, a pause and a manual realign for free.

A station change is a **new song**, so it still restarts every voice at loop
offset 0: `radioBeat()` sets `restartPending` and lets the debounced
`scheduleApply()` call `mixer.restart(planFiles())`. Board edits no longer need
that reset - a plain `applyPlan()` phase-locks the new stems (see the Web Audio
pitfalls), so only radio and the realign button start from the top.
`nextStation()` skips the same way; `stopRadio(true)` restores the snapshot; any
manual board edit or settings change calls `stopRadio(false)` so the radio
cannot fight the user.

`mixer.restart(plan)` accepts a plan because the station's plan is already
computed when the beat fires; `restart()` without an argument is the transport
realign button. In `applyPlan` a hard start also re-records `startedAt` after
the stem loads, otherwise the first song's countdown drifts by the decode time.

## Radio likes and bans

`src/stores/likes.ts` owns one localStorage record
(`set10-desk-likes-v1`: `styles`, `combos`, `disliked`). `disliked` is an
append-to-front array of combo ids, so the Settings list shows the newest ban
first and the radio can filter with `isComboDisliked`. A like and a dislike are
mutually exclusive in both directions.

- `likeStation()` toggles `toggleComboLike(radio.combo)`. A cycle holds all 458
  combos, so ordering the queue by likes would mean a heart is never heard
  again; instead `nextRadioCombo()` promotes a random liked combo over the cycle
  with `LIKED_PROMOTION` (25%). Likes also rank higher in Style Lab.
- `dislikeStation()` calls `dislikeCombo(id)`, drops the id from the pending
  queue and calls `radioBeat()` so the banned station leaves the air at once.
- `radioPool()` is `styleCombos` minus banned ids. When it is empty the radio
  refuses to start, `radioBeat()` stops the radio and `notice.radioEmpty` tells
  the user to restore a combo in Settings. Never fall back to playing banned
  combos.
- **Settings > Radio dislikes** (`SettingsPage.vue`) lists each banned combo with
  its three-layer split and per-row restore, plus restore-all. Unknown ids from
  an older rules version still render (label from `comboIdStyles`) and stay
  removable.
- `StyleLab.vue` sorts banned combos to the bottom, dims them and adds a
  `disliked` badge; they can still be applied manually.

The station label sits on the second line of `.radio-copy` while the countdown
is next to `ON AIR` (`ON AIR 3:19`), so a long combo name can ellipsize without
hiding the remaining time. While the radio is live `.plan-pills` are hidden: the
station name is the combo and the mixer already shows the layer split, so the
pills would only steal the width the station needs.

The heart and broken heart are the two `.radio-vote-btn`s after `.radio-skip`.
The broken heart is `BrokenHeart.vue`, a monochrome **CSS split heart**: two
`&#9829;` glyphs clipped into halves and nudged apart. Do not swap it for a
color emoji (clashes with the neon theme) and do not clip at 50% with rotation
(the lobes look like petals) - the polygon pair in `styles.css` is tuned to read
as a crack at 13 px.

## Champion pool grouping

`ChampionPool.vue` has two group modes. Cost mode groups the **filtered** units by
cost (search and cost chips both apply). Trait mode groups units by every trait,
shows music traits first, and offers a trait select for narrowing. A unit appears
in each of its trait groups, which is intentional. `PoolCard.vue` owns the card,
drag payload and preview so both modes share the same markup.

## Manual Style Lab

`settings.mixMode` is `board` or `manual`. In manual mode `recompute()` passes an
empty unit list to `assignLayers` and only the per-layer overrides matter, so the
mix can be composed without champions. `src/core/combos.ts` generates **all 458
usable 1-3 style groups** with a perfect style-to-distinct-layer matching, so every
style in a combo actually contributes. `StyleLab.vue` shows the layer racks, the
combos with filter chips (All / Jhin / Liked), and the style grid with a heart on
each card. Likes live in `src/stores/likes.ts` (localStorage): a combo like is
worth 100, each liked style 10, and `classical` gets a +25 editorial boost so
Jhin combinations start at the top until a liked non-Jhin combo overtakes them.
The default loaded combo is `jazz+truedamage`. Clicking a champion in the dimmed
pool switches back to board mode via `addToBoard`.

## Lineup files

The two transport arrows call `lineupSnapshot()` / `importLineup()`. The JSON
format is `set10-desk-lineup` v1 and carries units (star, slot, Headliner), era,
mix mode, selected champion and the three layer settings. Export uses a Blob +
anchor download; import uses a hidden file input and validates unknown units,
duplicate slots, stars, Headliner ownership and layer overrides before applying.

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

## Visual assets and wallpaper

`tools/fetch_hero_art.py` downloads both patch 13.24 TFT renders:

```
src/assets/heroes/banner/<art>.webp      384x192  in-game champion banner
src/assets/heroes/wallpaper/<art>.webp   384x384  square set splash
```

The banner is the primary tile in the pool, hex board and spotlight. The square
splash is **only** the blurred global wallpaper. `src/core/art.ts` has two eager
globs (`heroBanner`, `heroWallpaper`); `ArtImage.vue` takes a `kind` prop.
`GlobalWallpaper.vue` crossfades `heroWallpaper(selected.art)` and keeps the
whole shell translucent with `backdrop-filter`.

`tools/make_board_art.py` renders the stage backdrop and film grain into
`src/assets/board/`. Both scripts are idempotent and runnable with the bundled
Python. Regenerating art while Vite is running requires a page reload because
the globs are evaluated once. For CDragon URLs and crop recipes, load the
`tft-champion-portraits` skill.

## Waveform analyser

`SegmentMixer` connects `masterGain -> analyser -> destination` and exposes
`analyser`. `Waveform.vue` reads `getByteTimeDomainData` and
`getByteFrequencyData` in a `requestAnimationFrame` loop, draws mirrored
spectrum bars plus a gradient ribbon, and falls back to a synthetic wave when
the transport is stopped or a headless browser reports a flat time-domain
buffer while the spectrum still moves. Keep the canvas DPR-scaled and observe
resizes; otherwise the waveform is blurry or cropped.

## Shell and sidebar

The title bar is only the drag region, brand mark and window buttons. The
hamburger and Settings live in the sidebar: Desk at the top, a flexible spacer,
then the collapse toggle and Settings pinned at the bottom. In the collapsed
52 px rail labels disappear; at widths under 1180 px an expanded rail floats
over the desk instead of squeezing the board.

The theme is intentionally bright purple, not near-black. `tools/make_board_art.py`
renders a saturated stage; panel/sidebar/transport backgrounds use translucent
purple gradients with `backdrop-filter`, and the global wallpaper stays visible
through them. If a change makes the desk look grey again, re-render the stage and
check the wallpaper veil before darkening the panels.

## Rule audit

The Settings page shows the live audit (33 switches, unit+tier model, solo acts,
Headliner support, unmodelled features). Keep it in sync with `rules.ts` and the
`tft-set10-music-system` skill. Do not describe the exact tie-break as
bit-perfect: the client selection code is native and the weight arithmetic is a
reconstruction from Riot's interview plus shipped breakpoint data.

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
* **One Wwise segment, not one loop per file.** The shipped act 1 segment is
  212.516 s with its loop/exit marker at 200.514 s; act 2-3 and draft are
  174.585 s with the exit at 165.333 s. `data/set10_music_engine.json` carries
  the recovered segment and every style/layer clip (`playAt`, `begin`, `dur`).
  `SegmentMixer` schedules clips per loop pass at `loopStart + playAt` and never
  loops a file on its own duration. Plan edits keep the pass; an act change
  restarts the segment and logs `hard start` plus `re-seated N voices`.
  `setLockLoop` is a no-op because the game loop is fixed.
* **Join on the start clock, not on "now".** A new stem used to take
  `position()` at apply time and then start 20 ms later, so every changed layer
  entered one scheduling lead behind the voices that kept playing - the
  "beats don't line up after switching a combo" report (measured -20 ms before
  the fix). `joinClip` schedules at `startAt = now + 0.02` and offsets with
  `positionAt(startAt)`, so its media position equals the `playAt`-relative grid
  at the moment it actually starts. The stock game swaps a source inside the
  running segment at the current music position instead of restarting it.
* **Cancel pending loop passes on a switch.** `allVoices` holds voices already
  scheduled for the next loop. A plan edit must fade the current voice and any
  future voice with the old clip, otherwise the old layer re-enters after the
  swap. `scheduleLoop` dedupes by `(layer, loopIndex)` across `allVoices`.
* **Keep continuous position separate from loop position.** The radio rotates
  when `positionSeconds >= songSeconds`; returning `elapsed % loop` never
  reaches the song length and the station never rotates. `positionSeconds` is
  continuous, `positionAt()`/`phaseReport.transport` are wrapped at the loop.
* **A hard restart must clear `allVoices`, not just `voices`.** Otherwise an
  old scheduled voice with `loopIndex 0` blocks the new song and the new
  segment starts with zero voices.
* **Load stems in parallel.** `applyPlan` awaits `Promise.all`, and `load()`
  deduplicates concurrent requests for the same file. Sequential awaits made the
  first play take several seconds.
* **One start call.** `StemMixer.start(plan, settings, master, lockLoop)` takes
  the plan up front; calling a separate `applyPlan` after `start` used to stack a
  second voice for the initial plan.
* **Do not decode stems at startup.** The old self-test fetched three large Ogg
  files on every launch. The diagnostics button in Settings runs the same
  `selfTest` on demand.

## Chinese data and trait mapping

`tools/build_dataset.py` merges `en_us.json` and `zh_cn.json` from the 13.24 TFT
data and emits `units[].nameZh`, `rules.traitNamesZh` and
`rules.styleNamesZh`. The JSON stays ASCII via `\u` escapes. Components must use
`useI18n().championName / traitName / styleName` instead of raw fields.

Champion set data lists traits by display name (`K/DA`, `8-bit`, `Disco`) while
the Wwise trait api uses suffixes (`Set10_KDA`, `Set10_8Bit`, `Set10_Funk`).
`rules.ts` must consume `traitDisplayStyle` (display name -> style). Using
`traitToStyle` against champion traits silently disables every breakpoint bonus
and pushes all music traits into the "other" bucket. `tools/build_dataset.py`
emits both maps; keep them in sync when regenerating the dataset.

## i18n

Messages live in `src/i18n/messages.ts`. The Simplified Chinese table is written
with `\u` escapes so the source tree stays ASCII while the UI renders Chinese.
`useI18n()` picks the table from `settings.language`, supports `{name}`
interpolation via `t('key', { count })`, and exposes localized champion, trait
and style names. Keep new source strings ASCII; convert Chinese literals with a
small script before committing.

## Verification

`bun run build` is the fast gate. For UI and playback checks, use the headless
Chrome CDP recipe in the `browser-cdp-smoke-test` skill: deploy champions, check
Chinese names in `.pool-name`/`.hex-label`, drag a hex, press Play, start radio
and wait for the station to rotate, switch to Style Lab and click a combo, then
read `.channel-switch`. A successful run logs `selftest: 3/3 stems decodable`,
the transport becomes `playing`, and the waveform canvas has a non-zero size.

Radio playback is cheap to assert without listening: every station start and
every aligned restart logs `[desk] hard start: N stems at offset 0 (song Xs)`.
A station must rotate after `X` seconds - in the early era that is ~198 s, so a
rotation at 165 s means a wall-clock timer crept back in. While paused the
countdown in `.radio-copy .radio-time` must stay frozen (it moved off `em` when
the station became a combo). An era change on a live mix logs
`[desk] re-seated N voices at Ys`; plan edits must not log it any more.
`bun tools/radio-cdp-test.mjs` runs all of this against a headless Chrome on
port 9222 (about four minutes, the rotation watch dominates) and saves
`tmp/radio-fixed.png`. `bun tools/radio-vote-cdp-test.mjs` covers the combo
station, the pinned plan, both vote buttons, the Settings ban list and restore
(about half a minute).

`bun tools/phase-sync-cdp-test.mjs` is the sync gate: it reads the dev-only
`window.__set10Desk` hook (`state`, `mixerPhases`, `applyCombo`, `setOverride`,
`styleCombos`, `play`, `stop`; stripped from sealed builds), changes one layer,
a combo, the board and the era, and requires every voice's `delta` against the
transport grid to stay within 5 ms. Before the fix the first layer change
reported -20 ms; now it is 0 ms. The test clears localStorage first, so it
starts from the default late plan.

Reading state from the page without the debug hook: the likes record is plain
localStorage (`set10-desk-likes-v1`), so `JSON.parse(localStorage.getItem(...))`
shows the like/ban lists. To prove the radio refuses an empty pool, seed
`disliked` with every combo id (rebuild them from `data/music_rules.json` with
the `buildStyleCombos` rules) and check that clicking `.radio-button` leaves the
control un-lit and raises the toast. The Style Lab combo count (`458`) is a cheap
oracle for the id list.

For a packaged check, build with `tauri build --no-bundle`, launch the exe with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`, and repeat
the same CDP assertions against `http://tauri.localhost/`.
