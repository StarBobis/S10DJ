---
name: tauri-vue-mixing-desk
description: Build and extend the Tauri 2 + Vue 3 + TypeScript desktop mixing desk in this repository, including the frameless WinUI-style shell, the i18n setup, the Rust command surface and the Web Audio layer mixer. Use when changing the app shell, adding a command, fixing playback scheduling or adding a locale.
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

The desk keeps `data/` and `assets/` outside the bundle so extracted files stay
where the Python tools wrote them. A small Vite middleware serves `/data` and
`/assets` from the repository root; Tauri reads the same files through the
`asset:` protocol, whose scope lives in `src-tauri/tauri.conf.json`
(`app.security.assetProtocol`).

## Rust command surface

`src-tauri/src/lib.rs` exposes four commands, all invoked from
`src/core/data.ts`:

| command | purpose |
| --- | --- |
| `asset_root` | folder holding the Ogg stems (repo checkout in dev, bundled resource afterwards, app data as fallback) |
| `scan_stems` | list `.ogg` stems, read `durations.json`, report required-but-missing files |
| `load_settings` / `save_settings` | JSON settings in the app config dir |

The frontend degrades gracefully when it runs in a plain browser: `inTauri()`
checks `__TAURI_INTERNALS__`, settings fall back to `localStorage`, and stems are
fetched relative to the dev server.

## Window shell

`decorations: false` in `tauri.conf.json`; `TitleBar.vue` supplies the drag
region (`data-tauri-drag-region`) plus minimize / maximize / close buttons that
call `getCurrentWindow()` and are hidden outside Tauri. Window permissions are
listed in `src-tauri/capabilities/default.json` (`core:window:allow-*`).

`SideBar.vue` is the WinUI NavigationView pattern: a 200 px rail that collapses
to 52 px with `.collapsed .nav-item .label { display: none }`, an accent bar on
the active item and a hamburger toggle in the title bar.

## Web Audio pitfalls (learned the hard way)

* **Never schedule a negative offset.** `AudioBufferSourceNode.start(when,
  offset)` rejects a negative offset with `The offset provided (-0.08) is less
  than the minimum bound (0)`. That happens when the transport start time is in
  the future (`ctx.currentTime + 0.08`) while the position is computed from
  `currentTime - startedAt`. Clamp the position at zero and pass `0` for a hard
  start.
* **Key voices by stem file, not by layer.** The base `none` style and ILLBEATS
  feed several layers from one file; one voice per layer stacks the same file and
  doubles its level (and phase).
* **Toggle by gain, not by stop/start.** Voices keep running while a layer is
  switched off, so re-enabling stays in sync; stop the source only when the stem
  is no longer used at all.
* **Lock the loop region** when layers have different durations (for example
  165 s vs 170 s): set `loopStart`/`loopEnd` to the shortest active stem so
  layers cannot drift apart over time.

## i18n

Messages live in `src/i18n/messages.ts`. The Simplified Chinese table is written
with `\u` escapes so the source tree stays ASCII while the UI renders Chinese;
`useI18n()` picks the table from `settings.language`.
