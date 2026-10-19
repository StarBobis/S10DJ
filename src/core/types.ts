export type Layer = 'drums' | 'chords' | 'top';

export const LAYERS: Layer[] = ['drums', 'chords', 'top'];

/** Board geometry: four rows of seven hexes, ten deployable units. */
export const BOARD_ROWS = 4;
export const BOARD_COLUMNS = 7;
export const BOARD_SLOTS = BOARD_ROWS * BOARD_COLUMNS;
export const MAX_BOARD_UNITS = 10;
export const MAX_STARS = 3;

export interface Unit {
  apiName: string;
  name: string;
  /** Simplified Chinese label from Riot's zh_CN set data. */
  nameZh?: string;
  cost: number;
  traits: string[];
  musicTraits: string[];
  style: string;
  /** Portrait file stem inside src/assets/heroes. */
  art: string;
}

export interface BoardUnit {
  apiName: string;
  /** 1..3, the star level reached by buying copies. */
  star: number;
  /** Index into the hex board, 0..BOARD_SLOTS-1. */
  slot: number;
  /** Display trait that received the Headliner +1, if this unit is a Headliner. */
  headliner?: string | null;
}

export interface RulesFile {
  set: number;
  patch: string;
  layers: Layer[];
  styles: Record<string, { layers: Layer[]; traitApiSuffix: string | null }>;
  traitToStyle: Record<string, string>;
  /** Display-name trait -> style, the view champion data actually uses. */
  traitDisplayStyle: Record<string, string>;
  traitNamesZh: Record<string, string>;
  styleNamesZh: Record<string, string>;
  traitThresholds: Record<string, number[]>;
  stems: Record<string, Partial<Record<Layer, Partial<Record<Era, string>>>>>;
  priority: string[];
  specialRules?: Record<string, unknown>;
}

export type Era = 'early' | 'late';

export interface UnitsFile {
  set: number;
  patch: string;
  units: Unit[];
}

export interface LayerSetting {
  enabled: boolean;
  volume: number;
  override: string | null;
}

export interface Assignment {
  style: string;
  weight: number;
  spotlight?: boolean;
  manual?: boolean;
}

export type Plan = Record<Layer, Assignment>;

export interface Settings {
  language: 'en' | 'zh-CN';
  era: Era;
  lockLoop: boolean;
  master: number;
  sidebarCollapsed: boolean;
  /** Board weights drive the mix, or the manual layer overrides do. */
  mixMode: 'board' | 'manual';
  layers: Record<Layer, LayerSetting>;
}

export interface StemScan {
  root: string;
  files: string[];
  durations: Record<string, number>;
  missing: string[];
}

export interface LineupUnit {
  apiName: string;
  star: number;
  slot: number;
  headliner?: string | null;
}

/** Portable JSON written by the Export button and accepted by Import. */
export interface LineupFile {
  format: 'set10-desk-lineup';
  version: 1;
  set: number;
  patch: string;
  savedAt: string;
  era: Era;
  mixMode: Settings['mixMode'];
  selected?: string | null;
  units: LineupUnit[];
  layers: Record<Layer, LayerSetting>;
}

export function defaultSettings(): Settings {
  return {
    language: 'en',
    era: 'late',
    lockLoop: true,
    master: 0.9,
    sidebarCollapsed: true,
    mixMode: 'board',
    layers: {
      drums: { enabled: true, volume: 1, override: null },
      chords: { enabled: true, volume: 1, override: null },
      top: { enabled: true, volume: 1, override: null },
    },
  };
}
