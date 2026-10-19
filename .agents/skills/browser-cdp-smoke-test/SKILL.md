---
name: browser-cdp-smoke-test
description: Drive and screenshot a local web or Tauri-dev UI with headless Chrome over the DevTools Protocol using only Node's built-in WebSocket, with no Playwright or Puppeteer dependency. Use to verify clicks, drag and drop, locale switches, audio playback and layout sizes, or to capture visual evidence after a UI rewrite.
---

# Headless Chrome CDP smoke test

## Why CDP

Playwright/Puppeteer are often absent from a small desktop repo and installing
them changes the dependency tree. Chrome already supports remote debugging, and
Node 22 ships a global `WebSocket`, so a ~100 line script in `tmp/` can click,
read the DOM, capture console logs and take screenshots.

## Launch

```powershell
Start-Process chrome.exe -ArgumentList @(
  '--headless=new','--disable-gpu','--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=9222',
  '--user-data-dir=D:\repo\tmp\chrome-profile',
  '--window-size=1440,900','about:blank')
```

`--autoplay-policy=no-user-gesture-required` matters for Web Audio tests. Use a
throwaway `user-data-dir` inside `tmp/` so localStorage starts clean on every
run. Read `http://127.0.0.1:9222/json/version` until it answers, then pick the
`type: "page"` target from `/json`.

## Minimal driver

```js
const pages = await fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const page = pages.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

let nextId = 1;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (!data.id) return;
  const job = pending.get(data.id);
  if (!job) return;
  pending.delete(data.id);
  data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description);
  return result.result.value;
}
```

Enable `Page` and `Runtime`, call `Page.navigate`, then sleep for the app's first
async load (champion data + stems often take 2-4 s). `userGesture: true` is what
lets a clicked Play button resume an `AudioContext` in headless mode.

## Interaction patterns

* **Click**: `document.querySelector('button.play').click()`. Vue reacts on the
  next microtask; wait 100-300 ms before reading the DOM.
* **Drag and drop**: build a `new DataTransfer()`, dispatch `dragstart` on the
  draggable child, then `dragover` and `drop` on the target. Both need
  `bubbles: true`; `drop` also needs `cancelable: true`.
* **Selects**: set `.value`, then dispatch `new Event('change', { bubbles: true })`.
* **Hover**: dispatch `mouseenter` without bubbles on the card. Native Vue
  `@mouseenter` handlers attach directly, so this works.
* **Screenshots**: `Page.captureScreenshot({ format: 'png' })`, then write
  `Buffer.from(result.data, 'base64')` to a file under `tmp/`.
* **Console**: subscribe to `Runtime.consoleAPICalled` before navigating and keep
  the last ~20 lines. App-side `console.log` diagnostics are usually enough to
  tell a decode failure from a missing route.
* **Layout metrics**: `getBoundingClientRect()` plus `getComputedStyle` through
  `evaluate` is faster than eyeballing a screenshot. Check `scrollHeight` against
  `height` to catch clipped scroll panels.

## Pitfalls

* `--window-size=1440,900` does not guarantee `innerHeight === 900`; Chrome
  headless may report ~805. Print `[innerWidth, innerHeight]` and test the
  responsive breakpoints you actually ship.
* `--screenshot=... --virtual-time-budget=...` is fine for a static shot but
  cannot click. Use CDP for anything interactive.
* A DOM `.click()` inside an async chain must be awaited; reading `.board-count`
  in the same synchronous loop still shows the old render.
* `decodeAudioData` detaches the `ArrayBuffer`. Log durations instead of
  `buffer.byteLength` after decoding, or the size reads as zero.
* The page keeps localStorage between navigations in the same profile. Clear it
  or use a fresh `user-data-dir` when locale/default-setting tests matter.
* Close the WebSocket at the end, or the Node process stays alive.
