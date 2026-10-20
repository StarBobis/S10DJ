import { reactive } from 'vue';

const KEY = 'set10-desk-likes-v1';

interface LikeState {
  styles: Record<string, number>;
  combos: Record<string, number>;
  /** Combo ids the radio must never pick again, newest first. */
  disliked: string[];
}

function emptyState(): LikeState {
  return { styles: {}, combos: {}, disliked: [] };
}

function load(): LikeState {
  if (typeof localStorage === 'undefined') return emptyState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LikeState>;
    return {
      styles: parsed.styles ?? {},
      combos: parsed.combos ?? {},
      disliked: Array.isArray(parsed.disliked)
        ? parsed.disliked.filter((id): id is string => typeof id === 'string' && Boolean(id))
        : [],
    };
  } catch {
    return emptyState();
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
  if (state.combos[id]) {
    delete state.combos[id];
  } else {
    state.combos[id] = 1;
    // A like and a dislike are mutually exclusive: the heart undoes a banish.
    state.disliked = state.disliked.filter((item) => item !== id);
  }
  save();
}

export function isComboDisliked(id: string): boolean {
  return state.disliked.includes(id);
}

/** Banned combo ids, newest first. A copy, so callers cannot mutate the store. */
export function dislikedCombos(): string[] {
  return [...state.disliked];
}

export function dislikeCombo(id: string): void {
  if (!id) return;
  delete state.combos[id];
  state.disliked = [id, ...state.disliked.filter((item) => item !== id)];
  save();
}

export function restoreCombo(id: string): void {
  if (!state.disliked.includes(id)) return;
  state.disliked = state.disliked.filter((item) => item !== id);
  save();
}

export function restoreAllCombos(): void {
  if (!state.disliked.length) return;
  state.disliked = [];
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
