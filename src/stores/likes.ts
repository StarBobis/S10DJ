import { reactive } from 'vue';

const KEY = 'set10-desk-likes-v1';

interface LikeState {
  styles: Record<string, number>;
  combos: Record<string, number>;
}

function load(): LikeState {
  if (typeof localStorage === 'undefined') return { styles: {}, combos: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { styles: {}, combos: {} };
    const parsed = JSON.parse(raw) as Partial<LikeState>;
    return {
      styles: parsed.styles ?? {},
      combos: parsed.combos ?? {},
    };
  } catch {
    return { styles: {}, combos: {} };
  }
}

const state = reactive<LikeState>(load());

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* likes are cosmetic; never break the desk */
  }
}

export function styleLikes(style: string): number {
  return state.styles[style] ? 1 : 0;
}

export function comboLikes(id: string): number {
  return state.combos[id] ? 1 : 0;
}

export function isStyleLiked(style: string): boolean {
  return Boolean(state.styles[style]);
}

export function isComboLiked(id: string): boolean {
  return Boolean(state.combos[id]);
}

export function toggleStyleLike(style: string): void {
  if (state.styles[style]) delete state.styles[style];
  else state.styles[style] = 1;
  save();
}

export function toggleComboLike(id: string): void {
  if (state.combos[id]) delete state.combos[id];
  else state.combos[id] = 1;
  save();
}

/**
 * Ranking score: a direct combo like is the strongest signal, then the user's
 * liked styles, then the editorial Jhin/Maestro boost the desk owner asked for.
 */
export function comboScore(combo: { id: string; styles: string[] }): number {
  const direct = comboLikes(combo.id) * 100;
  const styleScore = combo.styles.reduce((total, style) => total + styleLikes(style) * 10, 0);
  const jhin = combo.styles.includes('classical') ? 25 : 0;
  return direct + styleScore + jhin - combo.styles.length;
}
