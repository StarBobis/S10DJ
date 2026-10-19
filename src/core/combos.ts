import { LAYERS, type Layer } from './types';

export interface StyleCombo {
  id: string;
  /** Every style must be able to provide its assigned layer. */
  layers: Record<Layer, string>;
  /** The styles this combination is made from (1-3). */
  styles: string[];
}

/** The pair the desk opens with; Jhin combos are ranked above it by default. */
export const DEFAULT_COMBO_ID = 'jazz+truedamage';

function canCover(styles: string[], styleLayers: Record<string, Layer[]>): boolean {
  return LAYERS.every((layer) => styles.some((style) => styleLayers[style]?.includes(layer)));
}

/**
 * Assign each style to a distinct layer it can provide, then fill any leftover
 * layers. A null result means the set cannot use every style (for example two
 * top-only acts in a three-style set), so it is not a real combination.
 */
function assignLayers(
  styles: string[],
  styleLayers: Record<string, Layer[]>,
): Record<Layer, string> | null {
  const result = {} as Record<Layer, string>;
  const usedLayers = new Set<Layer>();

  const match = (index: number): boolean => {
    if (index >= styles.length) return true;
    const style = styles[index];
    for (const layer of LAYERS) {
      if (usedLayers.has(layer) || !styleLayers[style]?.includes(layer)) continue;
      result[layer] = style;
      usedLayers.add(layer);
      if (match(index + 1)) return true;
      usedLayers.delete(layer);
      delete result[layer];
    }
    return false;
  };

  if (!match(0)) return null;

  for (const layer of LAYERS) {
    if (result[layer]) continue;
    const options = styles.filter((style) => styleLayers[style]?.includes(layer));
    if (!options.length) return null;
    result[layer] = options[0];
  }
  return result;
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return result;
}

/**
 * Every group of 1-3 styles that covers drums, chords and top and can actually
 * assign a distinct layer to each style. Set 10 yields 458 groups: 4 solos,
 * 74 pairs and 380 triples.
 */
export function buildStyleCombos(styleLayers: Record<string, Layer[]>): StyleCombo[] {
  const styles = Object.keys(styleLayers)
    .filter((style) => style !== 'none' && (styleLayers[style]?.length ?? 0) > 0)
    .sort((a, b) => {
      const diff = (styleLayers[a]?.length ?? 0) - (styleLayers[b]?.length ?? 0);
      return diff || a.localeCompare(b);
    });

  const combos: StyleCombo[] = [];
  for (let size = 1; size <= 3; size += 1) {
    for (const group of combinations(styles, size)) {
      if (!canCover(group, styleLayers)) continue;
      const layers = assignLayers(group, styleLayers);
      if (!layers) continue;
      combos.push({
        id: group.join('+'),
        styles: group,
        layers,
      });
    }
  }
  return combos;
}

export function defaultCombo(combos: StyleCombo[]): StyleCombo | null {
  return combos.find((combo) => combo.id === DEFAULT_COMBO_ID) ?? combos[0] ?? null;
}
