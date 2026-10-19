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

/**
 * Read one of the JSON data files. A packaged Tauri build has no HTTP route to
 * the repository folders, so the backend reads the bundled resource instead;
 * the browser dev server serves the same files over HTTP.
 */
async function loadData<T>(name: string): Promise<T> {
  if (inTauri()) {
    try {
      return await invoke<T>('load_data', { name });
    } catch (error) {
      console.warn(`load_data ${name} failed, trying HTTP`, error);
    }
  }
  return getJson<T>(`data/${name}`);
}

export function loadUnits(): Promise<UnitsFile> {
  return loadData<UnitsFile>('set10_units.json');
}

export function loadRules(): Promise<RulesFile> {
  return loadData<RulesFile>('music_rules.json');
}

let audioRoot = 'assets/audio_ogg';

/** True when the page is served by the Vite dev server rather than Tauri. */
export function onDevServer(): boolean {
  if (typeof window === 'undefined') return false;
  if (!inTauri()) return window.location.protocol === 'http:' || window.location.protocol === 'https:';
  const { hostname, port } = window.location;
  return (hostname === '127.0.0.1' || hostname === 'localhost') && port === '8787';
}

function joinPath(root: string, name: string): string {
  const separator = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${separator}${name}`;
}

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

/**
 * In development the page comes from Vite, which serves the repository folders
 * over HTTP, so the plain path is used. A packaged build has no such server and
 * goes through the Tauri asset protocol, whose scope the backend opens for the
 * resolved stem folder.
 */
export function stemUrl(file: string): string {
  const name = `${file}.ogg`;
  if (onDevServer()) return `/assets/audio_ogg/${name}`;
  return convertFileSrc(joinPath(audioRoot, name));
}

/** The other scheme, used as a fallback when the first one is not reachable. */
export function stemUrlFallback(file: string): string | null {
  if (onDevServer()) return null;
  return convertFileSrc(joinPath(audioRoot, `${file}.ogg`));
}

/** Mirrors a frontend event into the Rust log so runs can be verified. */
export async function reportEvent(message: string): Promise<void> {
  console.log(`[desk] ${message}`);
  if (!inTauri()) return;
  try {
    await invoke('log_event', { message });
  } catch {
    /* logging must never break playback */
  }
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
