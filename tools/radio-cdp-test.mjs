/**
 * CDP smoke test for the radio fix.
 *
 * A: a station starts as one hard, aligned start of every stem at offset 0.
 * B: the countdown equals the station's real song length and follows the audio.
 * C: pausing freezes it - no wall-clock timer eats the song.
 * D: skipping to the next station starts that one aligned as well.
 * E: switching era changes the one-per-era loop and re-seats every voice
 *    together (a plan edit no longer changes the loop at all).
 * F: the station rotates after one full song of the current station, not after
 *    the old fixed 165 s.
 *
 * Run with: bun tmp/radio-cdp.mjs
 */

import { writeFileSync } from 'node:fs';

const PORT = 9222;
const URL = 'http://127.0.0.1:8787/';
const SHOT = 'tmp/radio-fixed.png';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function endpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
      const page = pages.find((item) => item.type === 'page');
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
  if (data.id) {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    data.error ? job.reject(new Error(JSON.stringify(data.error))) : job.resolve(data.result);
    return;
  }
  if (data.method === 'Runtime.consoleAPICalled') {
    const text = data.params.args
      .map((arg) => (typeof arg.value === 'string' ? arg.value : arg.description ?? ''))
      .join(' ');
    if (text.includes('[desk]')) logs.push({ at: Date.now(), text });
  }
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description);
  return result.result.value;
}

async function waitFor(expression, label, timeout = 40000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const radio = () => evaluate(`(() => {
  const copy = document.querySelector('.radio-copy em');
  const meter = document.querySelector('.radio-meter i');
  const time = document.querySelector('.radio-copy .radio-time');
  const station = copy ? copy.textContent.trim() : null;
  return {
    label: station ? station + ' - ' + (time ? time.textContent.trim() : '') : null,
    station,
    meter: meter ? meter.style.width : null,
    status: document.querySelector('.transport-status')?.textContent.trim() ?? null,
    playing: document.querySelector('.transport-status')?.classList.contains('playing') ?? false,
  };
})()`);

const RESULTS = [];
function check(name, ok, detail) {
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

const songOf = (text) => Number(/song ([\d.]+)s/.exec(text ?? '')?.[1] ?? 0);
const countdown = (text) => {
  const match = /(\d+):(\d\d)\s*$/.exec(text ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};
const lastLog = (needle) => logs.filter((item) => item.text.includes(needle)).at(-1);

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await waitFor(`Boolean(document.querySelector('.transport-bar') && document.querySelector('.pool-card'))`, 'desk ready');

// Early era so one song is far longer than the old fixed 165 s timer.
await evaluate(`document.querySelectorAll('.era-toggle .segmented button')[0].click()`);
await sleep(400);
console.log('era:', await evaluate(`document.querySelector('.era-toggle .segmented button.active')?.textContent.trim()`));

await evaluate(`document.querySelector('.radio-button').click()`);
await waitFor(`document.querySelector('.transport-status')?.classList.contains('playing')`, 'radio playback');
await sleep(1500);

let station = await radio();
let hardStart = lastLog('hard start');
check(
  'radio on air',
  Boolean(station.station && / - \d+\.\d$/.test(station.station)),
  station.label,
);
check(
  'station starts as one aligned hard start',
  Boolean(hardStart?.text.includes('offset 0')),
  hardStart?.text,
);
const song = songOf(hardStart?.text);
const played = (Date.now() - (hardStart?.at ?? Date.now())) / 1000;
check(
  'countdown equals the remaining song',
  Math.abs(countdown(station.label) - Math.ceil(song - played)) <= 2,
  `${countdown(station.label)}s shown, ${(song - played).toFixed(1)}s of ${song}s left`,
);

await sleep(3000);
const after3 = await radio();
check(
  'countdown tracks audio position',
  countdown(station.label) - countdown(after3.label) >= 2,
  `${countdown(station.label)}s -> ${countdown(after3.label)}s`,
);

// Pause: the song must stop advancing, and resuming replays it from the top.
await evaluate(`document.querySelectorAll('.transport-actions .ghost.icon')[0].click()`);
await waitFor(`!document.querySelector('.transport-status')?.classList.contains('playing')`, 'pause');
await sleep(700);
const paused = await radio();
await sleep(5000);
const pausedLater = await radio();
check(
  'pause freezes the countdown',
  countdown(paused.label) === countdown(pausedLater.label),
  `${countdown(paused.label)}s stayed after 5 s paused`,
);

await evaluate(`document.querySelector('.transport-actions .primary.play').click()`);
await waitFor(`document.querySelector('.transport-status')?.classList.contains('playing')`, 'resume');
await sleep(1200);
const resumed = await radio();
check(
  'resume replays the full song',
  countdown(resumed.label) >= Math.ceil(song) - 2,
  `${countdown(resumed.label)}s of ${Math.ceil(song)}s`,
);

// Skip: the next station also enters as one aligned hard start.
const beforeSkip = station.station;
await evaluate(`document.querySelector('.radio-skip').click()`);
await sleep(2500);
const skipped = await radio();
const skipStart = lastLog('hard start');
check('skip changes the station', skipped.station !== beforeSkip, `${beforeSkip} -> ${skipped.station}`);
check(
  'skipped station starts aligned at offset 0',
  skipStart?.text.includes('offset 0') && skipStart.text !== hardStart?.text,
  skipStart?.text,
);

// Era switch on a live mix changes the loop length: voices must be re-seated.
// A station may have flipped the era, so toggle to the other button instead of
// assuming the current one.
await evaluate(`document.querySelector('.radio-button').click()`); // radio off
await sleep(800);
// Two champions so the mix really has several voices to re-seat.
await evaluate(`document.querySelectorAll('.pool-card')[0].click()`);
await sleep(300);
await evaluate(`document.querySelectorAll('.pool-card')[1].click()`);
await waitFor(`document.querySelectorAll('.pool-card.owned').length >= 2`, 'board units');
if (!(await evaluate(`document.querySelector('.transport-status')?.classList.contains('playing')`))) {
  await evaluate(`document.querySelector('.transport-actions .primary.play').click()`);
  await waitFor(`document.querySelector('.transport-status')?.classList.contains('playing')`, 'manual playback');
}
await sleep(2500);
const beforeEra = logs.length;
const eraIndex = await evaluate(
  `[...document.querySelectorAll('.era-toggle .segmented button')].findIndex((b) => b.classList.contains('active'))`,
);
await evaluate(`document.querySelectorAll('.era-toggle .segmented button')[${1 - eraIndex}].click()`);
let reseat = null;
for (let attempt = 0; attempt < 20 && !reseat; attempt += 1) {
  await sleep(250);
  reseat = logs.slice(beforeEra).find((item) => item.text.includes('re-seated'));
}
check('era switch re-seats the running mix', Boolean(reseat), reseat?.text ?? 'no re-seated log');
check(
  'every voice is re-seated together',
  Boolean(reseat) && Number(/re-seated (\d+) voices/.exec(reseat.text)?.[1] ?? 0) >= 2,
  reseat?.text ?? 'no re-seated log',
);
const afterEra = await radio();
check('transport keeps playing after the re-seat', afterEra.playing, afterEra.status);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
console.log('screenshot:', SHOT);

// Long check: one station must play its whole song before rotating. The clock
// is the station's own `hard start` log line, so it does not depend on load
// time; the old fixed timer would have rotated at 165 s instead.
const hardStartCount = () => logs.filter((item) => item.text.includes('hard start')).length;

async function startStation() {
  const before = hardStartCount();
  await evaluate(`document.querySelector('.radio-button').click()`); // radio on
  const deadline = Date.now() + 30000;
  while (hardStartCount() <= before && Date.now() < deadline) await sleep(100);
  await waitFor(`document.querySelector('.transport-status')?.classList.contains('playing')`, 'station playback');
  return lastLog('hard start');
}

if (await evaluate(`Boolean(document.querySelector('.radio-skip'))`)) {
  await evaluate(`document.querySelector('.radio-button').click()`); // radio off
  await sleep(600);
}
await evaluate(`document.querySelectorAll('.era-toggle .segmented button')[0].click()`); // early
await sleep(400);

// The station beat flips the era 28% of the time; an early-era song is ~198 s,
// which is what separates this behaviour from the old 165 s timer.
let rotationStart = null;
for (let attempt = 0; attempt < 4; attempt += 1) {
  rotationStart = await startStation();
  if (songOf(rotationStart?.text) > 190) break;
  await evaluate(`document.querySelector('.radio-button').click()`); // radio off
  await sleep(600);
  await evaluate(`document.querySelectorAll('.era-toggle .segmented button')[0].click()`); // early
  await sleep(400);
}
await sleep(900);
const start = await radio();
const rotationSong = songOf(rotationStart?.text);
console.log(`rotation watch: ${start.label}, song ${rotationSong}s`);

let rotated = null;
let rotatedAt = 0;
const deadline = Date.now() + Math.ceil((rotationSong + 25) * 1000);
while (Date.now() < deadline) {
  await sleep(500);
  const now = await radio();
  if (now.station !== start.station) {
    rotated = now;
    rotatedAt = Date.now();
    break;
  }
}
const elapsed = rotated ? (rotatedAt - rotationStart.at) / 1000 : 0;
check(
  'station rotates after a full song',
  Boolean(rotated) && elapsed >= rotationSong - 1.5 && elapsed <= rotationSong + 3,
  `${elapsed.toFixed(1)}s of a ${rotationSong}s song -> ${rotated?.label ?? 'no change'}`,
);

console.log('\n--- [desk] radio log ---');
for (const entry of logs.filter((item) => /hard start|re-seated|transport: playing/.test(item.text))) {
  console.log(entry.text);
}

const failed = RESULTS.filter((item) => !item.ok);
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} checks passed`);
socket.close();
process.exit(failed.length ? 1 : 0);
