import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { defaultSettings, type Settings, type StemScan, type UnitsFile, type RulesFile } from './types';

export const inTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>);

const SETTINGS_KEY = 'set10-desk-settings';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`cannot load ${path} (${response.status})`);
  return (await response.json()) as T;
}

export function loadUnits(): Promise<UnitsFile> {
  return getJson<UnitsFile>('data/set10_units.json');
}

export function loadRules(): Promise<RulesFile> {
  return getJson<RulesFile>('data/music_rules.json');
}

let audioRoot = 'assets/audio_ogg';

/** Absolute folder holding the converted stems, asked from the Rust side. */
export async function resolveAudioRoot(): Promise<string> {
  if (!inTauri()) return audioRoot;
  try {
    audioRoot = await invoke<string>('asset_root');
  } catch (error) {
    console.warn('asset_root unavailable, using relative path', error);
  }
  return audioRoot;
}

export function stemUrl(file: string): string {
  const relative = `${audioRoot}/${file}.ogg`;
  if (!inTauri()) return relative.startsWith('assets') ? `/${relative}` : relative;
  const separator = audioRoot.includes('\\') ? '\\' : '/';
  return convertFileSrc(`${audioRoot}${separator}${file}.ogg`);
}

export async function scanStems(required: string[] = []): Promise<StemScan> {
  if (inTauri()) {
    try {
      return await invoke<StemScan>('scan_stems', { required });
    } catch (error) {
      console.warn('scan_stems failed, falling back to durations.json', error);
    }
  }
  const durations = await getJson<Record<string, number>>('assets/audio_ogg/durations.json');
  const files = Object.keys(durations);
  return {
    root: audioRoot,
    files,
    durations,
    missing: required.filter((name) => !files.includes(name)),
  };
}

export async function loadSettings(): Promise<Settings> {
  if (inTauri()) {
    try {
      const stored = await invoke<Settings | null>('load_settings');
      if (stored) return mergeSettings(stored);
    } catch (error) {
      console.warn('load_settings failed', error);
    }
  }
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      return mergeSettings(JSON.parse(raw) as Settings);
    } catch {
      /* fall through to defaults */
    }
  }
  return defaultSettings();
}

export async function saveSettings(settings: Settings): Promise<void> {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  if (!inTauri()) return;
  try {
    await invoke('save_settings', { settings });
  } catch (error) {
    console.warn('save_settings failed', error);
  }
}

export function mergeSettings(stored: Partial<Settings>): Settings {
  const base = defaultSettings();
  return {
    ...base,
    ...stored,
    layers: {
      drums: { ...base.layers.drums, ...stored.layers?.drums },
      chords: { ...base.layers.chords, ...stored.layers?.chords },
      top: { ...base.layers.top, ...stored.layers?.top },
    },
  };
}
