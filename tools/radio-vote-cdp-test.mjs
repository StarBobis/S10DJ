/**
 * CDP smoke test for the radio like / dislike feature.
 *
 * A: a station is a style combo: its label lists the styles the pinned plan plays.
 * B: the heart likes the station combo and persists it.
 * C: the broken heart bans the station, the radio moves on and the ban persists.
 * D: the settings page lists the banned combo and can restore it.
 * E: a banned station never comes back while skipping.
 *
 * Needs Vite on 127.0.0.1:8787 and headless Chrome on port 9222:
 *   bun run dev
 *   chrome --headless=new --remote-debugging-port=9222 --autoplay-policy=no-user-gesture-required
 *   bun tools/radio-vote-cdp-test.mjs
 */

import { writeFileSync } from 'node:fs';

const PORT = 9222;
const URL = 'http://127.0.0.1:8787/';
const LIKES_KEY = 'set10-desk-likes-v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function endpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
      const page =
        pages.find((item) => item.type === 'page' && item.url.includes('8787')) ??
        pages.find((item) => item.type === 'page');
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
    await sleep(200);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const RESULTS = [];
function check(name, ok, detail) {
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

const view = () => evaluate(`(() => {
  const copy = document.querySelector('.radio-copy em');
  const time = document.querySelector('.radio-copy .radio-time');
  const station = copy ? copy.textContent.trim() : null;
  const remaining = time ? time.textContent.trim() : '';
  const likes = JSON.parse(localStorage.getItem('${LIKES_KEY}') || '{}');
  return {
    label: station ? station + ' - ' + remaining : null,
    station,
    remaining,
    plan: [...document.querySelectorAll('.plan-pill b')].map((node) => node.textContent.trim()),
    channels: [...document.querySelectorAll('.channel-style .style-name')].map((node) =>
      node.textContent.trim(),
    ),
    radioFlags: document.querySelectorAll('.channel-flags em').length,
    liked: Boolean(document.querySelector('.radio-vote-btn.like.active')),
    likes,
    hasVote: Boolean(document.querySelector('.radio-vote-btn.dislike')),
  };
})()`);

/** "Jazz + True Damage - 101.5 FM" -> "Jazz + True Damage". */
const baseStation = (station) => (station ?? '').split(' - ')[0].trim();
/** The style names a station label announces. */
const stylesOf = (station) =>
  baseStation(station)
    .split(' + ')
    .map((style) => style.trim())
    .filter(Boolean);

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await waitFor(`Boolean(document.querySelector('.transport-bar'))`, 'desk ready');
await evaluate(`localStorage.removeItem('${LIKES_KEY}')`);
await evaluate(`location.reload()`);
await waitFor(
  `Boolean(document.querySelector('.transport-bar') && document.querySelector('.pool-card'))`,
  'desk reloaded',
);

// ---------- 1. a station is a combo with a pinned plan ----------
await evaluate(`document.querySelector('.radio-button').click()`);
await waitFor(`document.querySelector('.transport-status')?.classList.contains('playing')`, 'radio playback');
await sleep(1600);

const first = await view();
const stationStyles = stylesOf(first.station);
check(
  'station announces a combo',
  Boolean(first.station) && first.station.includes(' + ') && / - \d+\.\d$/.test(first.station),
  first.label,
);
check('the countdown stays visible next to ON AIR', /^\d+:\d\d$/.test(first.remaining), first.remaining);
check(
  'pinned plan plays exactly the announced combo',
  JSON.stringify([...new Set(first.plan)].sort()) === JSON.stringify([...new Set(stationStyles)].sort()),
  `plan ${JSON.stringify(first.plan)} vs station ${JSON.stringify(stationStyles)}`,
);
check(
  'every channel is pinned by the station',
  first.radioFlags >= 3 && first.plan.length === 3,
  `${first.plan.length} channels, ${first.radioFlags} flags`,
);
check('heart and broken heart are visible on air', first.hasVote, `${first.label}`);

// ---------- 2. the heart likes the station ----------
await evaluate(`document.querySelector('.radio-vote-btn.like').click()`);
await sleep(300);
const liked = await view();
check(
  'heart marks the station and stores the combo',
  liked.liked && Object.keys(liked.likes.combos ?? {}).length === 1,
  JSON.stringify(liked.likes.combos),
);
const likedStation = liked.station;
await evaluate(`document.querySelector('.radio-vote-btn.like').click()`);
await sleep(300);
const unliked = await view();
check(
  'a second click removes the like',
  !unliked.liked && Object.keys(unliked.likes.combos ?? {}).length === 0,
  JSON.stringify(unliked.likes.combos),
);

// ---------- 3. the broken heart bans the station ----------
const banned = baseStation(unliked.station);
await evaluate(`document.querySelector('.radio-vote-btn.dislike').click()`);
await sleep(1800);
const afterBan = await view();
check(
  'dislike moves the radio on',
  baseStation(afterBan.station) !== banned,
  `${banned} -> ${afterBan.station}`,
);
check(
  'the banned combo is stored',
  (afterBan.likes.disliked ?? []).length === 1,
  JSON.stringify(afterBan.likes.disliked),
);
check(
  'the next station is still a real combo',
  Boolean(afterBan.station) && baseStation(afterBan.station) !== banned,
  afterBan.label,
);

// ---------- 4. the settings page manages the ban ----------
await evaluate(`document.querySelector('.settings-item').click()`);
await waitFor(`Boolean(document.querySelector('.dislikes'))`, 'settings dislikes section');
const listed = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('.dislike-row')];
  return {
    count: rows.length,
    labels: rows.map((row) => row.querySelector('.dislike-label')?.textContent.trim() ?? ''),
    layers: rows.map((row) => [...row.querySelectorAll('.dislike-layers i')].map((i) => i.textContent.trim()).join('/')),
    counter: document.querySelector('.dislike-count')?.textContent.trim() ?? '',
  };
})()`);
check(
  'settings lists the banned combo',
  listed.count === 1 && listed.labels[0] === banned,
  `${listed.count} row(s): ${JSON.stringify(listed.labels)} counter ${listed.counter}`,
);
check('the row shows the three layers', listed.layers[0]?.split('/').length === 3, listed.layers[0]);

const settingsShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/radio-dislikes-settings.png', Buffer.from(settingsShot.data, 'base64'));

await evaluate(`document.querySelector('.dislike-row .ghost.small').click()`);
await sleep(400);
const restored = await evaluate(`(() => ({
  rows: document.querySelectorAll('.dislike-row').length,
  empty: Boolean(document.querySelector('.dislikes .hint')),
  likes: JSON.parse(localStorage.getItem('${LIKES_KEY}') || '{}').disliked ?? [],
}))()`);
check(
  'restore clears the ban',
  restored.rows === 0 && restored.empty && restored.likes.length === 0,
  `${restored.rows} rows, stored ${JSON.stringify(restored.likes)}`,
);

// ---------- 5. a banned station never returns ----------
await evaluate(`document.querySelector('.nav-item').click()`);
await waitFor(`Boolean(document.querySelector('.transport-bar'))`, 'desk again');
const current = await view();
check('radio kept playing across the settings visit', Boolean(current.station), current.label);

const beforeSecondBan = await view();
const bannedLabel = baseStation(beforeSecondBan.station);
await evaluate(`document.querySelector('.radio-vote-btn.dislike').click()`);
await sleep(1500);
const bannedNow = await view();
const bannedStation = (bannedNow.likes.disliked ?? [])[0] ?? null;
const seen = [];
for (let index = 0; index < 8; index += 1) {
  if (!(await evaluate(`Boolean(document.querySelector('.radio-skip'))`))) break;
  await evaluate(`document.querySelector('.radio-skip').click()`);
  await sleep(700);
  const state = await view();
  seen.push(baseStation(state.station));
}
check(
  `skipping ${seen.length} stations never plays the banned one`,
  Boolean(bannedStation) && !seen.includes(bannedLabel),
  `banned ${bannedLabel} (${bannedStation}); heard ${JSON.stringify(seen)}`,
);

// A station still has to be the combo its label promises after a few skips.
const last = await view();
const lastStyles = stylesOf(last.station);
check(
  'every skipped station pins its own combo',
  JSON.stringify([...new Set(last.plan)].sort()) === JSON.stringify([...new Set(lastStyles)].sort()),
  `plan ${JSON.stringify(last.plan)} vs station ${JSON.stringify(lastStyles)}`,
);

const radioShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tmp/radio-vote-desk.png', Buffer.from(radioShot.data, 'base64'));

// Close-up of the radio control so the icons can be checked by eye.
const box = await evaluate(`(() => {
  const rect = document.querySelector('.radio-control').getBoundingClientRect();
  return { x: Math.max(0, rect.x - 8), y: Math.max(0, rect.y - 8), width: rect.width + 16, height: rect.height + 16 };
})()`);
const closeShot = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 3 } });
writeFileSync('tmp/radio-vote-closeup.png', Buffer.from(closeShot.data, 'base64'));

console.log('\n--- [desk] log ---');
for (const entry of logs.slice(-6)) console.log(entry.text);
console.log('\nscreenshots: tmp/radio-vote-desk.png, tmp/radio-vote-closeup.png, tmp/radio-dislikes-settings.png');

const failed = RESULTS.filter((item) => !item.ok);
console.log(`\n${RESULTS.length - failed.length}/${RESULTS.length} checks passed`);
socket.close();
process.exit(failed.length ? 1 : 0);
