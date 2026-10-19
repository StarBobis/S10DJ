import { computed, reactive, watch } from 'vue';
import { StemMixer } from '../core/audio';
import {
  loadRules,
  loadSettings,
  loadUnits,
  resolveAudioRoot,
  saveSettings,
  scanStems,
  stemUrl,
} from '../core/data';
import { activeTiers, assignLayers, nextThreshold, traitCounts } from '../core/rules';
import {
  defaultSettings,
  LAYERS,
  type Era,
  type Layer,
  type LayerSetting,
  type Plan,
  type RulesFile,
  type Settings,
  type StemScan,
  type Unit,
} from '../core/types';

const state = reactive({
  ready: false,
  error: '' as string,
  units: [] as Unit[],
  rules: null as RulesFile | null,
  roster: {} as Record<string, number>,
  settings: defaultSettings() as Settings,
  scan: null as StemScan | null,
  playing: false,
  status: 'stopped' as 'stopped' | 'playing',
  plan: {} as Plan,
  weights: {} as Record<string, number>,
  traits: {} as Record<string, number>,
  tiers: {} as Record<string, number>,
});

const mixer = new StemMixer({ urlFor: stemUrl, available: null });
let requiredChecked = false;

function styleLayers(): Record<string, Layer[]> {
  const map: Record<string, Layer[]> = {};
  for (const [style, info] of Object.entries(state.rules?.styles ?? {})) {
    map[style] = info.layers;
  }
  return map;
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

export const boardUnits = computed<Unit[]>(() => {
  const board: Unit[] = [];
  for (const [apiName, copies] of Object.entries(state.roster)) {
    const unit = state.units.find((item) => item.apiName === apiName);
    if (!unit) continue;
    for (let i = 0; i < copies; i += 1) board.push(unit);
  }
  return board;
});

export const unitsByCost = computed(() => {
  const groups = new Map<number, Unit[]>();
  for (const unit of state.units) {
    const list = groups.get(unit.cost) ?? [];
    list.push(unit);
    groups.set(unit.cost, list);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]);
});

function recompute() {
  if (!state.rules) return;
  const units = boardUnits.value;
  state.traits = traitCounts(units);
  state.tiers = activeTiers(state.traits, state.rules.traitThresholds ?? {});
  const overrides: Partial<Record<Layer, string | null>> = {};
  for (const layer of LAYERS) overrides[layer] = state.settings.layers[layer].override;
  const { plan, weights } = assignLayers(units, {
    styleLayers: styleLayers(),
    traitToStyle: state.rules.traitToStyle ?? {},
    priority: state.rules.priority ?? [],
    tiers: state.tiers,
    overrides,
    spotlightAlwaysOccupies: state.rules.specialRules?.classicalAlwaysOccupiesALayer !== false,
  });
  state.plan = plan;
  state.weights = weights;
}

async function persist() {
  await saveSettings(state.settings);
}

export function layerSetting(layer: Layer): LayerSetting {
  return state.settings.layers[layer];
}

export function addUnit(apiName: string, delta: number) {
  const copies = Math.max(0, Math.min(3, (state.roster[apiName] ?? 0) + delta));
  if (copies === 0) delete state.roster[apiName];
  else state.roster[apiName] = copies;
}

export function clearBoard() {
  state.roster = {};
}

export function setOverride(layer: Layer, style: string | null) {
  state.settings.layers[layer].override = style;
  void persist();
}

export function toggleLayer(layer: Layer) {
  state.settings.layers[layer].enabled = !state.settings.layers[layer].enabled;
  void persist();
}

export function setLayerVolume(layer: Layer, volume: number) {
  state.settings.layers[layer].volume = volume;
}

export function setEra(era: Era) {
  state.settings.era = era;
  void persist();
}

export function setMaster(master: number) {
  state.settings.master = master;
  mixer.setMaster(master);
  void persist();
}

export function setLockLoop(lock: boolean) {
  state.settings.lockLoop = lock;
  mixer.setLockLoop(lock);
  void persist();
}

export function setLanguage(language: Settings['language']) {
  state.settings.language = language;
  void persist();
}

export function toggleSidebar() {
  state.settings.sidebarCollapsed = !state.settings.sidebarCollapsed;
  void persist();
}

export async function play() {
  try {
    await mixer.start(state.settings.layers, state.settings.master, state.settings.lockLoop);
    await mixer.applyPlan(planFiles());
    state.playing = true;
    state.status = 'playing';
  } catch (error) {
    state.status = 'stopped';
    state.error = error instanceof Error ? error.message : String(error);
  }
}

export function stop() {
  mixer.stop();
  state.playing = false;
  state.status = 'stopped';
}

export function realign() {
  mixer.restart();
}

export function traitRow(trait: string) {
  const count = state.traits[trait] ?? 0;
  return {
    trait,
    count,
    tier: state.tiers[trait] ?? 0,
    next: nextThreshold(state.rules?.traitThresholds?.[trait], count),
  };
}

export function useDesk() {
  return state;
}

export async function initDesk() {
  try {
    state.settings = await loadSettings();
    const [units, rules] = await Promise.all([loadUnits(), loadRules()]);
    state.units = units.units;
    state.rules = rules;
    await resolveAudioRoot();
    const required = requiredStems(rules);
    state.scan = await scanStems(required);
    requiredChecked = true;
    mixer.setMaster(state.settings.master);
    mixer.setLockLoop(state.settings.lockLoop);
    recompute();
    state.ready = true;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
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

export function checkRequired(): boolean {
  return requiredChecked;
}

watch(
  () => [JSON.stringify(state.plan), state.settings.era],
  () => {
    if (state.playing) void mixer.applyPlan(planFiles());
  },
);

watch(
  () => JSON.stringify(state.settings.layers),
  () => {
    mixer.updateLayers(state.settings.layers);
  },
);

watch(
  () => [...boardUnits.value.map((unit) => unit.apiName), JSON.stringify(state.settings.layers)],
  () => recompute(),
  { deep: false },
);

watch(() => state.roster, () => recompute(), { deep: true });
