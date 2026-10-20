/**
 * CDP regression test for layer phase sync.
 *
 * A: every live voice sits at 0 ms against the transport grid after play.
 * B: a single layer change (soft join) keeps the new voice on the grid.
 * C: a three-style combo switch keeps the loop and every voice on the grid.
 * D: a board-driven plan change keeps the same loop and grid.
 * E: the loop is one per era: no plan edit re-seats the voices.
 * F: an era change moves the loop once and re-seats all voices together.
 *
 * Needs Vite on 127.0.0.1:8787 and headless Chrome on port 9222, like the radio
 * tests. Reads the dev-only window.__set10Desk hook for the phase report.
 *
 *   bun run dev
 *   chrome --headless=new --remote-debugging-port=9222 --autoplay-policy=no-user-gesture-required
 *   bun tools/phase-sync-cdp-test.mjs
 */

const PORT = 9222;
const URL = 'http://127.0.0.1:8787/';
const RESULTS = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(label, ok, detail) {
  RESULTS.push({ label, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail ?? ''}`);
}

async function endpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
      const page = pages.find((item) => item.type === 'page' && item.url.includes('8787'));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* chrome still starting */
    }
    await sleep(500);
  }
  throw new Error('chrome devtools endpoint never answered');
}

const socket = new WebSocket(await endpoint());
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));

let nextId = 1;
const pending = new Map();
const logs = [];
socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  if (data.method === 'Runtime.consoleAPICalled') {
    const text = (data.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (text) logs.push(text);
  }
  if (!data.id) return;
  const job = pending.get(data.id);
  if (!job) return;
  pending.delete(data.id);
  data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result);
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return result.result.value;
}

async function waitFor(expression, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const read = () =>
  evaluate(`(() => {
    const d = window.__set10Desk;
    const s = d.state;
    const phases = d.mixerPhases();
    const loop = phases.loop ?? 0;
    return {
      status: s.status,
      era: s.settings.era,
      board: s.board.length,
      plan: Object.fromEntries(Object.entries(s.plan).map(([k, v]) => [k, v.style])),
      loop,
      transport: phases.transport,
      voices: phases.voices.map((v) => ({ file: v.file, deltaMs: Math.round(v.delta * 1000) })),
    };
  })()`);

function report(label, snapshot) {
  const worst = snapshot.voices.length
    ? Math.max(...snapshot.voices.map((voice) => Math.abs(voice.deltaMs)))
    : 999;
  console.log(
    `\n${label}: loop ${snapshot.loop.toFixed(3)}  t ${snapshot.transport.toFixed(2)}  worst ${worst} ms  ` +
      `plan ${JSON.stringify(snapshot.plan)}`,
  );
  for (const voice of snapshot.voices) {
    console.log(`  ${voice.file.padEnd(26)} ${String(voice.deltaMs).padStart(5)} ms`);
  }
  return worst;
}

const onGrid = (snapshot) =>
  snapshot.voices.length > 0 &&
  snapshot.voices.every((voice) => Math.abs(voice.deltaMs) <= 5);

// Chrome replays a few console lines from the previous page on Runtime.enable,
// so count only what this run produced.
let logsAtPlay = 0;
const reseatCount = () => logs.slice(logsAtPlay).filter((line) => line.includes('re-seated')).length;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(1500);
// Start from defaults: earlier runs persist overrides and mix mode.
await evaluate(`localStorage.clear()`);
await send('Page.reload');
await waitFor(`Boolean(window.__set10Desk && document.querySelector('button.play'))`, 'desk ready');

await evaluate(`window.__set10Desk.play()`);
await waitFor(`window.__set10Desk.state.status === 'playing'`, 'playback');
await sleep(2500);
logsAtPlay = logs.length;

const start = await read();
const startWorst = report('A play', start);
check('A: play lands every voice on the grid', onGrid(start), `${startWorst} ms`);
check('A: default late loop is 165.02 s', Math.abs(start.loop - 165.02) < 0.1, `${start.loop.toFixed(3)} s`);

await evaluate(`window.__set10Desk.setOverride('top', 'jazz')`);
await sleep(1100);
const layer = await read();
const layerWorst = report('B layer change', layer);
check('B: soft join keeps every voice on the grid', onGrid(layer), `${layerWorst} ms`);
check(
  'B: the loop does not move on a layer change',
  Math.abs(layer.loop - start.loop) < 0.001,
  `${start.loop.toFixed(3)} -> ${layer.loop.toFixed(3)}`,
);
check(
  'B: the new stem is in the live voices',
  layer.voices.some((voice) => voice.file === 'jazz_late_main'),
  layer.voices.map((voice) => voice.file).join(', '),
);

await evaluate(`(() => {
  const d = window.__set10Desk;
  const combo = d.styleCombos.value.find((c) => c.styles.length === 3 && c.layers.drums !== 'none');
  d.applyCombo(combo.id);
})()`);
await sleep(1600);
const combo = await read();
const comboWorst = report('C combo switch', combo);
check('C: combo switch keeps every voice on the grid', onGrid(combo), `${comboWorst} ms`);
check(
  'C: combo switch keeps the era loop',
  Math.abs(combo.loop - start.loop) < 0.001,
  `${start.loop.toFixed(3)} -> ${combo.loop.toFixed(3)}`,
);

await evaluate(`document.querySelectorAll('.pool-card')[0].click()`);
await sleep(1400);
const board = await read();
const boardWorst = report('D board change', board);
check('D: board change keeps every voice on the grid', onGrid(board), `${boardWorst} ms`);
check('D: a champion reached the board', board.board >= 1, `${board.board} units`);
check(
  'E: no plan edit re-seated the mix',
  reseatCount() === 0,
  `${reseatCount()} re-seated log(s) before the era switch`,
);

const beforeEra = logs.length;
const eraIndex = await evaluate(
  `[...document.querySelectorAll('.era-toggle .segmented button')].findIndex((b) => b.classList.contains('active'))`,
);
await evaluate(`document.querySelectorAll('.era-toggle .segmented button')[${1 - eraIndex}].click()`);
await sleep(2600);
const era = await read();
const eraWorst = report('F era change', era);
const reseat = logs.slice(beforeEra).find((line) => line.includes('re-seated'));
check('F: era change re-seats the voices together', Boolean(reseat), reseat ?? 'no re-seated log');
check('F: era loop is 197.63 s', Math.abs(era.loop - 197.625) < 0.1, `${era.loop.toFixed(3)} s`);
check('F: re-seated voices still share the grid', onGrid(era), `${eraWorst} ms`);

console.log('\nsync log:');
for (const line of logs.slice(logsAtPlay).filter((entry) => entry.includes('hard start') || entry.includes('re-seated'))) {
  console.log('  ', line);
}

const failed = RESULTS.filter((item) => !item.ok);
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} checks passed`);
socket.close();
process.exit(failed.length ? 1 : 0);
