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
import { heroArtCount } from '../core/art';
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
  type Plan,
  type RulesFile,
  type Settings,
  type StemScan,
  type Unit,
} from '../core/types';

export type NoticeCode = 'boardFull' | 'maxStars' | 'notPlaying' | '';

const state = reactive({
  ready: false,
  error: '' as string,
  notice: '' as NoticeCode,
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

function notify(code: NoticeCode) {
  state.notice = code;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    state.notice = '';
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
    units: boardUnits.value.filter((unit) => unit.traits.includes(trait)).map((unit) => unit.name),
  };
}

function recompute() {
  if (!state.rules) return;
  const units = boardUnits.value;
  state.traits = traitCounts(units);
  state.tiers = activeTiers(state.traits, state.rules.traitThresholds ?? {});
  const overrides: Partial<Record<Layer, string | null>> = {};
  for (const layer of LAYERS) overrides[layer] = state.settings.layers[layer].override;
  const { plan, weights } = assignLayers(units, {
    styleLayers: styleLayers(),
    traitStyles: traitStyles(),
    priority: state.rules.priority ?? [],
    tiers: state.tiers,
    overrides,
    spotlightAlwaysOccupies: state.rules.specialRules?.classicalAlwaysOccupiesALayer !== false,
  });
  state.plan = plan;
  state.weights = weights;
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
  state.board.push({ apiName, star: 1, slot: target });
  state.selected = apiName;
}

export function removeFromBoard(apiName: string): void {
  state.board = state.board.filter((entry) => entry.apiName !== apiName);
  if (state.selected === apiName) state.selected = null;
  if (state.preview === apiName) state.preview = null;
}

export function moveBoardUnit(apiName: string, slot: number): void {
  if (slot < 0 || slot >= BOARD_SLOTS) return;
  const mover = state.board.find((entry) => entry.apiName === apiName);
  if (!mover || mover.slot === slot) return;
  const occupant = state.board.find((entry) => entry.slot === slot);
  if (occupant) occupant.slot = mover.slot;
  mover.slot = slot;
}

export function upgradeBoardUnit(apiName: string): void {
  const entry = state.board.find((item) => item.apiName === apiName);
  if (!entry) return;
  if (entry.star >= MAX_STARS) {
    notify('maxStars');
    return;
  }
  entry.star += 1;
}

export function clearBoard(): void {
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

/* ---------- settings and transport ---------- */

export function setOverride(layer: Layer, style: string | null): void {
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
  if (!state.playing) return;
  if (applyTimer) clearTimeout(applyTimer);
  applyTimer = setTimeout(() => {
    applyTimer = null;
    void mixer.applyPlan(planFiles());
  }, 40);
}

watch(
  () => state.board.map((entry) => `${entry.apiName}:${entry.star}:${entry.slot}`).join('|'),
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
