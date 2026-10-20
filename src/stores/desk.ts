import { computed, reactive, watch } from 'vue';
import { StemMixer } from '../core/audio';
import {
  loadRules,
  loadSettings,
  loadUnits,
  onDevServer,
  reportEvent,
  resolveAudioRoot,
  saveSettings,
  scanStems,
  stemUrl,
  stemUrlFallback,
} from '../core/data';
import {
  activeTiers,
  assignLayers,
  nextThreshold,
  styleColor,
  tierProgress,
  traitCounts,
} from '../core/rules';
import { buildStyleCombos, defaultCombo, type StyleCombo } from '../core/combos';
import { heroArtCount } from '../core/art';
import {
  dislikeCombo,
  isComboDisliked,
  isComboLiked,
  toggleComboLike,
} from './likes';
import {
  BOARD_COLUMNS,
  BOARD_SLOTS,
  MAX_BOARD_UNITS,
  MAX_STARS,
  defaultSettings,
  LAYERS,
  type BoardUnit,
  type Era,
  type Layer,
  type LineupFile,
  type LineupUnit,
  type Plan,
  type RulesFile,
  type Settings,
  type StemScan,
  type Unit,
} from '../core/types';

export type NoticeCode =
  | 'boardFull'
  | 'maxStars'
  | 'notPlaying'
  | 'lineupExported'
  | 'lineupImported'
  | 'lineupFailed'
  | 'radioEmpty'
  | '';

/** How often the radio compares the audio position against the song length. */
const RADIO_TICK_MS = 250;

interface RadioState {
  enabled: boolean;
  /** Combo id currently on air, '' while the radio is off. */
  combo: string;
  beat: number;
  progress: number;
  remaining: number;
  /** Pending combo ids of the current shuffle cycle. */
  queue: string[];
}

const state = reactive({
  ready: false,
  error: '' as string,
  notice: '' as NoticeCode,
  noticeCount: 0,
  units: [] as Unit[],
  rules: null as RulesFile | null,
  board: [] as BoardUnit[],
  settings: defaultSettings() as Settings,
  scan: null as StemScan | null,
  playing: false,
  status: 'stopped' as 'stopped' | 'loading' | 'playing',
  plan: {} as Plan,
  weights: {} as Record<string, number>,
  traits: {} as Record<string, number>,
  tiers: {} as Record<string, number>,
  selected: null as string | null,
  preview: null as string | null,
  testing: null as { running: boolean; ok: string[]; failed: string[] } | null,
  radio: {
    enabled: false,
    combo: '',
    beat: 0,
    progress: 0,
    remaining: 0,
    queue: [],
  } as RadioState,
});

const mixer = new StemMixer({
  urlFor: stemUrl,
  fallbackUrlFor: stemUrlFallback,
  available: null,
  onEvent: (message) => void reportEvent(message),
});

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let applyTimer: ReturnType<typeof setTimeout> | null = null;
let radioTicker: ReturnType<typeof setInterval> | null = null;
/** Set by a station change: the next plan apply has to restart the songs. */
let restartPending = false;

interface RadioBackup {
  board: BoardUnit[];
  selected: string | null;
  era: Era;
  mixMode: Settings['mixMode'];
  layers: Settings['layers'];
}

let radioBackup: RadioBackup | null = null;

function notify(code: NoticeCode, count = 0) {
  state.notice = code;
  state.noticeCount = count;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    state.notice = '';
    state.noticeCount = 0;
    noticeTimer = null;
  }, 2600);
}

function persist(delay = 180) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveSettings(state.settings);
  }, delay);
}

export function showNotice(code: NoticeCode, count = 0) {
  notify(code, count);
}

function styleLayers(): Record<string, Layer[]> {
  const map: Record<string, Layer[]> = {};
  for (const [style, info] of Object.entries(state.rules?.styles ?? {})) {
    map[style] = info.layers;
  }
  return map;
}

function traitStyles(): Record<string, string> {
  return state.rules?.traitDisplayStyle ?? state.rules?.traitToStyle ?? {};
}

/**
 * Styles whose trait is a single-unit act. The patch 13.24 interview states
 * these always occupy one of the three layers; set 10 has Maestro, Mixmaster
 * and ILLBEATS.
 */
function soloSpotlightStyles(): string[] {
  const result = new Set<string>();
  for (const [trait, style] of Object.entries(traitStyles())) {
    const steps = state.rules?.traitThresholds?.[trait];
    if (steps?.length === 1 && steps[0] <= 1) result.add(style);
  }
  return [...result];
}

/** All valid 1-3 style groups; recomputed only when the rules change. */
export const styleCombos = computed<StyleCombo[]>(() => {
  if (!state.rules) return [];
  return buildStyleCombos(styleLayers());
});

const comboIndex = computed<Map<string, StyleCombo>>(() => {
  const map = new Map<string, StyleCombo>();
  for (const combo of styleCombos.value) map.set(combo.id, combo);
  return map;
});

export function comboById(id: string): StyleCombo | null {
  return comboIndex.value.get(id) ?? null;
}

/** The combo on air, or null while the radio is off. */
export const radioCombo = computed<StyleCombo | null>(() =>
  state.radio.enabled ? comboById(state.radio.combo) : null,
);

/** Stem file for a style/layer/era, falling back to the other era. */
export function fileFor(style: string, layer: Layer, era: Era): string | null {
  const layerStems = state.rules?.stems?.[style]?.[layer];
  if (!layerStems) return null;
  const candidates = [layerStems[era], era === 'late' ? layerStems.early : layerStems.late];
  const available = state.scan?.files ? new Set(state.scan.files) : null;
  for (const candidate of candidates) {
    if (candidate && (!available || available.has(candidate))) return candidate;
  }
  return null;
}

function planFiles(): Record<Layer, string | null> {
  const files = {} as Record<Layer, string | null>;
  for (const layer of LAYERS) {
    const style = state.plan[layer]?.style ?? 'none';
    files[layer] = fileFor(style, layer, state.settings.era);
  }
  return files;
}

export function unitByApi(apiName: string | null | undefined): Unit | null {
  if (!apiName) return null;
  return state.units.find((unit) => unit.apiName === apiName) ?? null;
}

/** One entry per deployed champion: copies became star levels, not units. */
export const boardUnits = computed<Unit[]>(() => {
  const units: Unit[] = [];
  for (const entry of state.board) {
    const unit = unitByApi(entry.apiName);
    if (unit) units.push(unit);
  }
  return units;
});

export const slots = computed<(BoardUnit | null)[]>(() => {
  const list: (BoardUnit | null)[] = new Array(BOARD_SLOTS).fill(null);
  for (const entry of state.board) {
    if (entry.slot >= 0 && entry.slot < BOARD_SLOTS) list[entry.slot] = entry;
  }
  return list;
});

export const boardCount = computed(() => state.board.length);
export const boardLimit = MAX_BOARD_UNITS;

export const unitsByCost = computed(() => {
  const groups = new Map<number, Unit[]>();
  for (const unit of state.units) {
    const list = groups.get(unit.cost) ?? [];
    list.push(unit);
    groups.set(unit.cost, list);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
});

export const focusUnit = computed<Unit | null>(() => {
  return unitByApi(state.preview) ?? unitByApi(state.selected);
});

export const focusBoardUnit = computed<BoardUnit | null>(() => {
  const unit = focusUnit.value;
  if (!unit) return null;
  return state.board.find((entry) => entry.apiName === unit.apiName) ?? null;
});

export const musicTraitRows = computed(() => {
  const styles = traitStyles();
  return Object.keys(state.traits)
    .filter((trait) => Boolean(styles[trait]) && (state.traits[trait] ?? 0) > 0)
    .map((trait) => traitRow(trait))
    .sort((a, b) => b.count - a.count || b.tier - a.tier || a.trait.localeCompare(b.trait));
});

export const otherTraitRows = computed(() => {
  const styles = traitStyles();
  return Object.keys(state.traits)
    .filter((trait) => !styles[trait] && (state.traits[trait] ?? 0) > 0)
    .map((trait) => traitRow(trait))
    .sort((a, b) => b.count - a.count || a.trait.localeCompare(b.trait));
});

export const artCount = computed(() => heroArtCount());

export function traitRow(trait: string) {
  const count = state.traits[trait] ?? 0;
  const thresholds = state.rules?.traitThresholds?.[trait];
  const progress = tierProgress(thresholds, count);
  return {
    trait,
    count,
    tier: state.tiers[trait] ?? 0,
    next: nextThreshold(thresholds, count),
    ratio: progress.ratio,
    style: traitStyles()[trait] ?? null,
    color: styleColor(traitStyles()[trait] ?? 'none'),
    units: boardUnits.value.filter((unit) => unit.traits.includes(trait)),
  };
}

function recompute() {
  if (!state.rules) return;
  const manual = state.settings.mixMode === 'manual';
  const units = manual ? [] : boardUnits.value;
  if (manual) {
    state.traits = {};
    state.tiers = {};
  } else {
    state.traits = traitCounts(units);
    // A Headliner adds +1 to one of its traits. Only one Headliner can exist.
    for (const entry of state.board) {
      if (!entry.headliner) continue;
      const unit = unitByApi(entry.apiName);
      if (!unit?.traits.includes(entry.headliner)) continue;
      state.traits[entry.headliner] = (state.traits[entry.headliner] ?? 0) + 1;
    }
    state.tiers = activeTiers(state.traits, state.rules.traitThresholds ?? {});
  }
  const overrides: Partial<Record<Layer, string | null>> = {};
  for (const layer of LAYERS) overrides[layer] = state.settings.layers[layer].override;
  const { plan, weights } = assignLayers(units, {
    styleLayers: styleLayers(),
    traitStyles: traitStyles(),
    priority: state.rules.priority ?? [],
    tiers: state.tiers,
    overrides,
    soloStyles: soloSpotlightStyles(),
    soloSpotlight: state.rules.specialRules?.soloStylesAlwaysOccupy !== false,
  });
  state.plan = plan;
  state.weights = weights;
  // A radio station is one combo, so its three layers are pinned for as long as
  // it is on air. Otherwise the random board could drift the mix away from the
  // combo the station announces (and that the heart/ban acts on).
  const station = radioCombo.value;
  if (station) {
    for (const layer of LAYERS) {
      const style = station.layers[layer];
      state.plan[layer] = { style, weight: weights[style] ?? 0, pinned: true };
    }
  }
}

/* ---------- board editing ---------- */

const SLOT_ORDER = (() => {
  const order = Array.from({ length: BOARD_SLOTS }, (_, index) => index);
  const score = (slot: number) => {
    const row = Math.floor(slot / BOARD_COLUMNS);
    const column = slot % BOARD_COLUMNS;
    return Math.abs(column - 3) + Math.abs(row - 1.5) * 1.4;
  };
  order.sort((a, b) => score(a) - score(b) || a - b);
  return order;
})();

function isFree(slot: number): boolean {
  return !state.board.some((entry) => entry.slot === slot);
}

export function addToBoard(apiName: string, slot?: number): void {
  const unit = unitByApi(apiName);
  if (!unit) return;
  stopRadio(false);
  if (state.settings.mixMode === 'manual') {
    setMixMode('board');
  }
  const existing = state.board.find((entry) => entry.apiName === apiName);
  if (existing) {
    if (existing.star >= MAX_STARS) {
      notify('maxStars');
      state.selected = apiName;
      return;
    }
    existing.star += 1;
    state.selected = apiName;
    return;
  }
  if (state.board.length >= MAX_BOARD_UNITS) {
    notify('boardFull');
    return;
  }
  const target =
    slot !== undefined && slot >= 0 && slot < BOARD_SLOTS && isFree(slot)
      ? slot
      : SLOT_ORDER.find((candidate) => isFree(candidate));
  if (target === undefined) return;
  state.board.push({ apiName, star: 1, slot: target, headliner: null });
  state.selected = apiName;
}

export function removeFromBoard(apiName: string): void {
  stopRadio(false);
  state.board = state.board.filter((entry) => entry.apiName !== apiName);
  if (state.selected === apiName) state.selected = null;
  if (state.preview === apiName) state.preview = null;
}

export function moveBoardUnit(apiName: string, slot: number): void {
  if (slot < 0 || slot >= BOARD_SLOTS) return;
  stopRadio(false);
  const mover = state.board.find((entry) => entry.apiName === apiName);
  if (!mover || mover.slot === slot) return;
  const occupant = state.board.find((entry) => entry.slot === slot);
  if (occupant) occupant.slot = mover.slot;
  mover.slot = slot;
}

export function upgradeBoardUnit(apiName: string): void {
  stopRadio(false);
  const entry = state.board.find((item) => item.apiName === apiName);
  if (!entry) return;
  if (entry.star >= MAX_STARS) {
    notify('maxStars');
    return;
  }
  entry.star += 1;
}

/** Assign the Headliner +1 to one of the unit's traits (or clear it). */
export function setHeadliner(apiName: string, trait: string | null): void {
  stopRadio(false);
  const entry = state.board.find((item) => item.apiName === apiName);
  if (!entry) return;
  if (!trait) {
    entry.headliner = null;
    recompute();
    return;
  }
  const unit = unitByApi(apiName);
  if (!unit?.traits.includes(trait)) return;
  for (const other of state.board) other.headliner = null;
  entry.headliner = trait;
  entry.star = Math.max(entry.star, 2);
  recompute();
}

export function clearBoard(): void {
  stopRadio(false);
  state.board = [];
  state.selected = null;
  state.preview = null;
}

export function selectUnit(apiName: string | null): void {
  state.selected = apiName;
}

export function previewUnit(apiName: string | null): void {
  state.preview = apiName;
}

/* ---------- manual style mixing ---------- */

export function setMixMode(mode: Settings['mixMode']): void {
  if (state.settings.mixMode === mode) return;
  if (state.radio.enabled) stopRadio(false);
  state.settings.mixMode = mode;
  if (mode === 'board') {
    for (const layer of LAYERS) state.settings.layers[layer].override = null;
  }
  if (mode === 'manual') {
    for (const layer of LAYERS) state.settings.layers[layer].enabled = true;
    const complete = LAYERS.every((layer) => Boolean(state.settings.layers[layer].override));
    if (!complete) {
      const combo = defaultCombo(styleCombos.value);
      if (combo) for (const layer of LAYERS) state.settings.layers[layer].override = combo.layers[layer];
    }
  }
  recompute();
  persist();
}

export function applyCombo(id: string): void {
  const combo = styleCombos.value.find((item) => item.id === id);
  if (!combo) return;
  if (state.radio.enabled) stopRadio(false);
  state.settings.mixMode = 'manual';
  for (const layer of LAYERS) {
    state.settings.layers[layer].enabled = true;
    state.settings.layers[layer].override = combo.layers[layer];
  }
  recompute();
  persist();
}

export function clearManualStyles(): void {
  for (const layer of LAYERS) state.settings.layers[layer].override = null;
  recompute();
  persist();
}

/* ---------- radio ---------- */

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Combos the radio may pick: every valid combo the user has not banned. */
function radioPool(): StyleCombo[] {
  return styleCombos.value.filter((combo) => !isComboDisliked(combo.id));
}

/** How often a liked combo is promoted ahead of the shuffle cycle. */
const LIKED_PROMOTION = 0.25;

/**
 * One shuffle cycle over every eligible combo. `avoid` keeps a refill from
 * repeating the station that just ended.
 */
function radioQueue(avoid: string | null): string[] {
  const queue = shuffle(radioPool()).map((combo) => combo.id);
  if (avoid && queue.length > 1 && queue[0] === avoid) {
    const swap = 1 + Math.floor(Math.random() * (queue.length - 1));
    [queue[0], queue[swap]] = [queue[swap], queue[0]];
  }
  return queue;
}

function nextRadioCombo(): string | null {
  const current = state.radio.combo;
  // A cycle holds 458 combos, so a heart would never be heard again if likes only
  // reordered it. Promote a random liked combo over the cycle instead.
  const liked = styleCombos.value.filter(
    (combo) => isComboLiked(combo.id) && combo.id !== current && !isComboDisliked(combo.id),
  );
  if (liked.length && Math.random() < LIKED_PROMOTION) {
    const pick = liked[Math.floor(Math.random() * liked.length)];
    state.radio.queue = state.radio.queue.filter((id) => id !== pick.id);
    return pick.id;
  }
  if (!state.radio.queue.length) {
    if (!radioPool().length) return null;
    state.radio.queue = radioQueue(current || null);
  }
  return state.radio.queue.shift() ?? null;
}

/** A random 6-10 unit board weighted towards the combo's styles. */
function radioBoard(styles: string[]): BoardUnit[] {
  const wanted = new Set(styles);
  const themed = shuffle(state.units.filter((unit) => wanted.has(unit.style)));
  const rest = shuffle(state.units.filter((unit) => !wanted.has(unit.style)));
  const count = Math.min(MAX_BOARD_UNITS, 6 + Math.floor(Math.random() * 5));
  const themedCount = Math.min(themed.length, Math.max(1, Math.ceil(count / 2)));
  const picks = themed.slice(0, themedCount);
  for (const unit of rest) {
    if (picks.length >= count) break;
    if (!picks.some((pick) => pick.apiName === unit.apiName)) picks.push(unit);
  }
  const slots = shuffle(SLOT_ORDER).slice(0, picks.length);
  return picks.map((unit, index) => ({
    apiName: unit.apiName,
    star: Math.random() < 0.08 ? 3 : Math.random() < 0.3 ? 2 : 1,
    slot: slots[index],
    headliner: null,
  }));
}

/**
 * One radio station plays exactly one song: the mix loops at the shortest
 * active stem, so that length is the station's play time. Nothing here uses
 * wall-clock time - the audio position decides, which means a slow stem load,
 * a pause or a manual realign cannot cut a song short.
 */
function updateRadioProgress(): void {
  if (!state.radio.enabled) return;
  const song = mixer.songSeconds();
  if (!song) {
    state.radio.progress = 0;
    state.radio.remaining = 0;
    return;
  }
  const position = mixer.positionSeconds;
  if (position >= song) {
    radioBeat();
    return;
  }
  state.radio.progress = Math.min(1, Math.max(0, position / song));
  state.radio.remaining = Math.max(0, Math.ceil(song - position));
}

function radioBeat(): void {
  const id = nextRadioCombo();
  const combo = id ? comboById(id) : null;
  if (!combo) {
    stopRadio(true);
    notify('radioEmpty');
    return;
  }
  state.radio.combo = combo.id;
  state.radio.beat += 1;
  if (Math.random() < 0.28) {
    state.settings.era = state.settings.era === 'late' ? 'early' : 'late';
  }
  const board = radioBoard(combo.styles);
  state.board = board;
  const featured =
    board.find((entry) => combo.styles.includes(unitByApi(entry.apiName)?.style ?? '')) ??
    board[0] ??
    null;
  state.selected = featured?.apiName ?? null;
  state.preview = null;
  state.radio.progress = 0;
  state.radio.remaining = 0;
  recompute();
  // Start the new station from the top of its own loop. Without this hard
  // reset the surviving voices keep their old phase while the new stems come
  // in at the new loop offset, which mixes two different bar positions.
  restartPending = true;
  scheduleApply();
}

export function startRadio(): void {
  if (state.radio.enabled) return;
  if (!radioPool().length) {
    notify('radioEmpty');
    return;
  }
  radioBackup = {
    board: state.board.map((entry) => ({ ...entry })),
    selected: state.selected,
    era: state.settings.era,
    mixMode: state.settings.mixMode,
    layers: JSON.parse(JSON.stringify(state.settings.layers)) as Settings['layers'],
  };
  state.radio.enabled = true;
  state.radio.beat = 0;
  state.radio.combo = '';
  state.radio.queue = radioQueue(null);
  state.settings.mixMode = 'board';
  for (const layer of LAYERS) {
    state.settings.layers[layer].enabled = true;
    state.settings.layers[layer].override = null;
  }
  radioBeat();
  radioTicker = setInterval(updateRadioProgress, RADIO_TICK_MS);
  if (state.status === 'stopped') void play();
}

export function stopRadio(restore = true): void {
  if (!state.radio.enabled && !radioBackup) return;
  state.radio.enabled = false;
  state.radio.combo = '';
  state.radio.queue = [];
  state.radio.progress = 0;
  state.radio.remaining = 0;
  restartPending = false;
  if (radioTicker) {
    clearInterval(radioTicker);
    radioTicker = null;
  }
  if (restore && radioBackup) {
    state.board = radioBackup.board;
    state.selected = radioBackup.selected;
    state.settings.era = radioBackup.era;
    state.settings.mixMode = radioBackup.mixMode;
    state.settings.layers = radioBackup.layers;
  }
  radioBackup = null;
  // Always recompute: leaving radio mode has to release the pinned station
  // plan, otherwise the board and the mixer would disagree after a user edit.
  recompute();
}

export function toggleRadio(): void {
  if (state.radio.enabled) stopRadio(true);
  else startRadio();
}

export function nextStation(): void {
  if (!state.radio.enabled) return;
  radioBeat();
}

/** Heart the station on air: it is promoted in the rotation from now on. */
export function likeStation(): void {
  if (!state.radio.enabled || !state.radio.combo) return;
  toggleComboLike(state.radio.combo);
}

/** Ban the station on air: it never returns and the radio moves on at once. */
export function dislikeStation(): void {
  if (!state.radio.enabled || !state.radio.combo) return;
  const banned = state.radio.combo;
  dislikeCombo(banned);
  state.radio.queue = state.radio.queue.filter((id) => id !== banned);
  radioBeat();
}

/* ---------- settings and transport ---------- */

export function setOverride(layer: Layer, style: string | null): void {
  stopRadio(false);
  state.settings.layers[layer].override = style;
  recompute();
  persist();
}

export function toggleLayer(layer: Layer): void {
  state.settings.layers[layer].enabled = !state.settings.layers[layer].enabled;
  persist();
}

export function setLayerVolume(layer: Layer, volume: number): void {
  state.settings.layers[layer].volume = volume;
  persist();
}

export function setEra(era: Era): void {
  stopRadio(false);
  state.settings.era = era;
  persist();
}

export function setMaster(master: number): void {
  state.settings.master = master;
  mixer.setMaster(master);
  persist();
}

export function setLockLoop(lock: boolean): void {
  state.settings.lockLoop = lock;
  mixer.setLockLoop(lock);
  persist();
}

export function setLanguage(language: Settings['language']): void {
  state.settings.language = language;
  persist(0);
}

export function toggleSidebar(): void {
  state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
  persist(0);
}

export function clearError(): void {
  state.error = '';
}

export async function play(): Promise<void> {
  if (state.status !== 'stopped') return;
  state.status = 'loading';
  state.error = '';
  try {
    await mixer.start(planFiles(), state.settings.layers, state.settings.master, state.settings.lockLoop);
    state.playing = true;
    state.status = 'playing';
    await reportEvent('transport: playing');
  } catch (error) {
    state.playing = false;
    state.status = 'stopped';
    state.error = error instanceof Error ? error.message : String(error);
  }
}

export function stop(): void {
  mixer.stop();
  state.playing = false;
  state.status = 'stopped';
}

export function realign(): void {
  if (!state.playing) {
    notify('notPlaying');
    return;
  }
  mixer.restart();
}

export async function runStemTest(): Promise<void> {
  if (state.testing?.running) return;
  state.testing = { running: true, ok: [], failed: [] };
  const files = LAYERS.map(
    (layer) =>
      fileFor(state.plan[layer]?.style ?? 'none', layer, state.settings.era) ??
      fileFor('none', layer, state.settings.era),
  ).filter((file): file is string => Boolean(file));
  const unique = [...new Set(files)];
  if (!unique.length) {
    state.testing = { running: false, ok: [], failed: ['no stem resolved'] };
    return;
  }
  const result = await mixer.selfTest(unique);
  state.testing = { running: false, ...result };
}

export function useDesk() {
  return state;
}

/* ---------- lineup files ---------- */

export function lineupSnapshot(): LineupFile {
  return {
    format: 'set10-desk-lineup',
    version: 1,
    set: 10,
    patch: state.rules?.patch ?? '13.24',
    savedAt: new Date().toISOString(),
    era: state.settings.era,
    mixMode: state.settings.mixMode,
    selected: state.selected,
    units: state.board.map((entry) => ({
      apiName: entry.apiName,
      star: entry.star,
      slot: entry.slot,
      headliner: entry.headliner ?? null,
    })),
    layers: JSON.parse(JSON.stringify(state.settings.layers)) as Settings['layers'],
  };
}

export function lineupFileName(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  return `set10-lineup-${stamp}.json`;
}

function readLayers(raw: unknown): Settings['layers'] {
  const result = JSON.parse(JSON.stringify(state.settings.layers)) as Settings['layers'];
  if (!raw || typeof raw !== 'object') return result;
  for (const layer of LAYERS) {
    const source = (raw as Record<string, unknown>)[layer];
    if (!source || typeof source !== 'object') continue;
    const value = source as Record<string, unknown>;
    if (typeof value.enabled === 'boolean') result[layer].enabled = value.enabled;
    if (typeof value.volume === 'number') {
      result[layer].volume = Math.min(1, Math.max(0, value.volume));
    }
    if (value.override === null || typeof value.override === 'string') {
      const style = value.override as string | null;
      result[layer].override =
        style && state.rules?.styles?.[style]?.layers.includes(layer) ? style : null;
    }
  }
  return result;
}

/** Apply a lineup file. Throws on malformed JSON or a foreign format. */
export function importLineup(text: string): number {
  const parsed = JSON.parse(text) as Partial<LineupFile>;
  if (parsed.format !== 'set10-desk-lineup' || !Array.isArray(parsed.units)) {
    throw new Error('not a set10 desk lineup');
  }
  stopRadio(false);
  const units: LineupUnit[] = [];
  const usedSlots = new Set<number>();
  const seen = new Set<string>();
  let headlinerTaken = false;

  for (const raw of parsed.units as unknown[]) {
    if (units.length >= MAX_BOARD_UNITS) break;
    if (!raw || typeof raw !== 'object') continue;
    const value = raw as Record<string, unknown>;
    const apiName = typeof value.apiName === 'string' ? value.apiName : '';
    const unit = unitByApi(apiName);
    if (!unit || seen.has(apiName)) continue;
    const star = Math.min(
      MAX_STARS,
      Math.max(1, Math.floor(typeof value.star === 'number' ? value.star : 1)),
    );
    let slot = typeof value.slot === 'number' ? Math.floor(value.slot) : -1;
    if (slot < 0 || slot >= BOARD_SLOTS || usedSlots.has(slot)) {
      slot = SLOT_ORDER.find((candidate) => !usedSlots.has(candidate)) ?? -1;
    }
    if (slot < 0) continue;
    let headliner: string | null = null;
    if (
      !headlinerTaken &&
      typeof value.headliner === 'string' &&
      unit.traits.includes(value.headliner)
    ) {
      headliner = value.headliner;
      headlinerTaken = true;
    }
    units.push({ apiName, star, slot, headliner });
    usedSlots.add(slot);
    seen.add(apiName);
  }

  state.board = units;
  state.settings.era =
    parsed.era === 'early' || parsed.era === 'late' ? parsed.era : state.settings.era;
  state.settings.mixMode = parsed.mixMode === 'manual' ? 'manual' : 'board';
  state.settings.layers = readLayers(parsed.layers);
  const wanted = parsed.selected ?? '';
  state.selected = units.some((entry) => entry.apiName === wanted)
    ? wanted
    : (units[0]?.apiName ?? null);
  state.preview = null;
  recompute();
  persist();
  notify('lineupImported', units.length);
  return units.length;
}

/** Analyser attached to the master bus, used by the waveform display. */
export function mixerAnalyser(): AnalyserNode | null {
  return mixer.analyser;
}

export function requiredStems(rules: RulesFile): string[] {
  const names = new Set<string>();
  for (const style of Object.values(rules.stems ?? {})) {
    for (const layer of Object.values(style)) {
      for (const file of Object.values(layer ?? {})) {
        if (file) names.add(file);
      }
    }
  }
  return [...names].sort();
}

export function missingStems(): string[] {
  if (!state.scan || !state.rules) return [];
  const available = new Set(state.scan.files);
  return requiredStems(state.rules).filter((name) => !available.has(name));
}

export function stemsAvailable(): number {
  return state.scan?.files.length ?? 0;
}

export async function initDesk(): Promise<void> {
  if (state.ready) return;
  try {
    state.settings = await loadSettings();
    const [units, rules] = await Promise.all([loadUnits(), loadRules()]);
    state.units = units.units;
    state.rules = rules;
    await resolveAudioRoot();
    state.scan = await scanStems(requiredStems(rules));
    mixer.setMaster(state.settings.master);
    mixer.setLockLoop(state.settings.lockLoop);
    recompute();
    state.ready = true;
    await reportEvent(
      `init: ${state.units.length} units, ${state.scan.files.length} stems in ${state.scan.root} (dev server: ${onDevServer()})`,
    );
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
}

function scheduleApply() {
  if (!state.playing) {
    restartPending = false;
    return;
  }
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    applyTimer = null;
    // A station change restarts every voice together; a plain plan edit keeps
    // the running phase so layer tweaks never interrupt the song.
    if (restartPending) {
      restartPending = false;
      mixer.restart(planFiles());
      return;
    }
    void mixer.applyPlan(planFiles());
  }, 40);
}

watch(
  () => state.board.map((entry) => `${entry.apiName}:${entry.star}:${entry.slot}:${entry.headliner ?? ''}`).join('|'),
  () => recompute(),
);

watch(
  () => LAYERS.map((layer) => state.settings.layers[layer].override ?? '').join('|'),
  () => recompute(),
);

watch(() => JSON.stringify(state.plan), scheduleApply);

watch(() => state.settings.era, scheduleApply);

watch(
  () => JSON.stringify(state.settings.layers),
  () => mixer.updateLayers(state.settings.layers),
);
