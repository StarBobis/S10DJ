export type Layer = 'drums' | 'chords' | 'top';

export const LAYERS: Layer[] = ['drums', 'chords', 'top'];

export interface Unit {
  apiName: string;
  name: string;
  cost: number;
  traits: string[];
  musicTraits: string[];
  style: string;
}

export interface RulesFile {
  layers: Layer[];
  styles: Record<string, { layers: Layer[]; traitApiSuffix: string | null }>;
  traitToStyle: Record<string, string>;
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
  layers: Record<Layer, LayerSetting>;
}

export interface StemScan {
  root: string;
  files: string[];
  durations: Record<string, number>;
  missing: string[];
}

export function defaultSettings(): Settings {
  return {
    language: 'en',
    era: 'late',
    lockLoop: true,
    master: 0.9,
    sidebarCollapsed: false,
    layers: {
      drums: { enabled: true, volume: 1, override: null },
      chords: { enabled: true, volume: 1, override: null },
      top: { enabled: true, volume: 1, override: null },
    },
  };
}
