import { LAYERS, type Assignment, type Layer, type Plan, type Unit } from './types';

/**
 * Set 10 mixing rules.
 *
 * Evidence:
 *  - the shipped 13.24 game data exposes the switch surface
 *    `Set_Switch_set10_<style>_<layer>` with layer in {drums, chords, top};
 *  - Riot's design interview states the mix follows unit counts, that a style
 *    grows with its breakpoint tier and that a solo act such as Maestro (Jhin)
 *    always holds one of the three layers.
 */

export const STYLE_LABEL: Record<string, string> = {
  '8bit': '8-bit',
  classical: 'Maestro',
  country: 'Country',
  dj: 'Mixmaster',
  edm: 'EDM',
  emo: 'Emo',
  funk: 'Disco',
  hyperpop: 'Hyperpop',
  illbeats: 'ILLBEATS',
  jazz: 'Jazz',
  kda: 'K/DA',
  none: 'Base',
  pentakill: 'Pentakill',
  popband: 'Heartsteel',
  punkrock: 'Punk',
  truedamage: 'True Damage',
};

/** Stage lighting per style, reused by board glows, badges and the mixer. */
export const STYLE_COLOR: Record<string, string> = {
  '8bit': '#5cc8ff',
  classical: '#e0b74b',
  country: '#e08a3c',
  dj: '#ff5fa2',
  edm: '#7d6bff',
  emo: '#8f7bff',
  funk: '#ffb63d',
  hyperpop: '#ff4fd8',
  illbeats: '#ff3b57',
  jazz: '#5a8cff',
  kda: '#b45cff',
  none: '#8d8d99',
  pentakill: '#3fdc9a',
  popband: '#ff6a3d',
  punkrock: '#ff4f6d',
  truedamage: '#ffd23f',
};

/** Small ASCII-safe emblems used when an image would distract. */
export const STYLE_GLYPH: Record<string, string> = {
  '8bit': '\u25a6',
  classical: '\u266b',
  country: '\u266a',
  dj: '\u25ce',
  edm: '\u25b2',
  emo: '\u263e',
  funk: '\u25cf',
  hyperpop: '\u2726',
  illbeats: '\u2739',
  jazz: '\u266c',
  kda: '\u2726',
  none: '\u25cb',
  pentakill: '\u2694',
  popband: '\u2665',
  punkrock: '\u26a1',
  truedamage: '\u2620',
};

/** Fake FM dial positions, purely for the radio mode display. */
export const STYLE_FREQUENCY: Record<string, string> = {
  '8bit': '88.3',
  classical: '89.7',
  country: '91.1',
  dj: '92.5',
  edm: '94.1',
  emo: '95.9',
  funk: '97.3',
  hyperpop: '98.7',
  illbeats: '100.1',
  jazz: '101.5',
  punkrock: '102.9',
  kda: '103.7',
  none: '105.1',
  pentakill: '106.3',
  popband: '107.1',
  truedamage: '99.5',
};

export function styleFrequency(style: string): string {
  return STYLE_FREQUENCY[style] ?? '99.9';
}

export const TIER_NAMES = ['bronze', 'silver', 'gold', 'prismatic'];

export function styleColor(style: string): string {
  return STYLE_COLOR[style] ?? STYLE_COLOR.none;
}

export function styleGlyph(style: string): string {
  return STYLE_GLYPH[style] ?? STYLE_GLYPH.none;
}

/**
 * Weight per music style.
 *
 * Every copy of a champion on the board adds one point to its style, and every
 * reached breakpoint adds its tier index. Champion traits are display names
 * ("K/DA", "8-bit"), so the display-name map is authoritative; the api-name
 * map is accepted as a fallback for older data files.
 */
export function styleWeights(
  units: Unit[],
  tiers: Record<string, number> = {},
  traitStyles: Record<string, string> = {},
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const unit of units) {
    if (!unit || unit.style === 'none') continue;
    weights[unit.style] = (weights[unit.style] || 0) + 1;
  }
  // A reached breakpoint raises that style's share of the mix (Riot interview).
  for (const [trait, tier] of Object.entries(tiers)) {
    const style = traitStyles[trait];
    if (!style || !tier) continue;
    weights[style] = (weights[style] || 0) + tier;
  }
  return weights;
}

export interface AssignOptions {
  styleLayers: Record<string, Layer[]>;
  /** Display-name trait -> style. */
  traitStyles: Record<string, string>;
  priority: string[];
  tiers?: Record<string, number>;
  overrides?: Partial<Record<Layer, string | null>>;
  /** Styles whose single-unit act always takes one layer (Maestro etc.). */
  soloStyles?: string[];
  soloSpotlight?: boolean;
  /** Legacy flag kept for callers that only know about Maestro. */
  spotlightAlwaysOccupies?: boolean;
}

export function assignLayers(
  units: Unit[],
  options: AssignOptions,
): { plan: Plan; weights: Record<string, number> } {
  const {
    styleLayers,
    traitStyles,
    priority,
    tiers = {},
    overrides = {},
    soloStyles = ['classical'],
    soloSpotlight = true,
    spotlightAlwaysOccupies = true,
  } = options;
  const weights = styleWeights(units, tiers, traitStyles);
  const rank = new Map(priority.map((style, index) => [style, index]));
  const activeSoloStyles = soloSpotlight && spotlightAlwaysOccupies ? soloStyles : [];

  const styleTier = (style: string): number => {
    let tier = 0;
    for (const [trait, mapped] of Object.entries(traitStyles)) {
      if (mapped === style) tier = Math.max(tier, tiers[trait] ?? 0);
    }
    return tier;
  };

  const plan = {} as Plan;
  for (const layer of LAYERS) {
    let best = 'none';
    let bestWeight = 0;
    let bestTier = 0;
    for (const [style, weight] of Object.entries(weights)) {
      if (weight <= 0 || !styleLayers[style]?.includes(layer)) continue;
      const tier = styleTier(style);
      const better = weight > bestWeight;
      const tierTie = weight === bestWeight && tier > bestTier;
      const priorityTie =
        weight === bestWeight &&
        tier === bestTier &&
        (rank.get(style) ?? 99) < (rank.get(best) ?? 99);
      if (better || tierTie || priorityTie) {
        best = style;
        bestWeight = weight;
        bestTier = tier;
      }
    }
    plan[layer] = { style: best, weight: bestWeight };
  }

  // Solo acts (Maestro, Mixmaster, ILLBEATS) always hold one of the three
  // layers. They are placed specialists-first so a two-layer act only takes a
  // second solo's layer when one is still free.
  const soloOrder = activeSoloStyles
    .filter((style) => (weights[style] ?? 0) > 0 && styleLayers[style]?.length)
    .sort((a, b) => {
      const layerDiff = (styleLayers[a]?.length ?? 0) - (styleLayers[b]?.length ?? 0);
      return layerDiff || (rank.get(a) ?? 99) - (rank.get(b) ?? 99);
    });
  const soloLayerCount = new Map<string, number>();
  for (const layer of LAYERS) {
    const style = plan[layer].style;
    if (!soloOrder.includes(style)) continue;
    soloLayerCount.set(style, (soloLayerCount.get(style) ?? 0) + 1);
    plan[layer].spotlight = true;
  }
  for (const style of soloOrder) {
    if (soloLayerCount.has(style)) continue;
    const candidates = LAYERS.filter(
      (layer) =>
        styleLayers[style]?.includes(layer) &&
        (!soloOrder.includes(plan[layer].style) ||
          (soloLayerCount.get(plan[layer].style) ?? 0) > 1),
    );
    if (!candidates.length) continue;
    // Prefer a layer currently held by a normal style; otherwise take a layer
    // from a solo act that still holds another one.
    candidates.sort((a, b) => {
      const soloA = soloOrder.includes(plan[a].style) ? 1 : 0;
      const soloB = soloOrder.includes(plan[b].style) ? 1 : 0;
      return soloA - soloB;
    });
    const layer = candidates[0];
    const displaced = plan[layer].style;
    if (soloLayerCount.has(displaced)) {
      const remaining = (soloLayerCount.get(displaced) ?? 1) - 1;
      if (remaining > 0) soloLayerCount.set(displaced, remaining);
      else soloLayerCount.delete(displaced);
    }
    plan[layer] = { style, weight: weights[style] ?? 0, spotlight: true };
    soloLayerCount.set(style, 1);
  }

  for (const layer of LAYERS) {
    const override = overrides[layer];
    if (override && styleLayers[override]?.includes(layer)) {
      plan[layer] = { style: override, weight: weights[override] || 0, manual: true };
    }
  }
  return { plan, weights };
}

export function traitCounts(units: Unit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const unit of units) {
    for (const trait of unit.traits ?? []) counts[trait] = (counts[trait] || 0) + 1;
  }
  return counts;
}

export function tierIndex(thresholds: number[], count: number): number {
  let tier = 0;
  for (const threshold of thresholds) if (count >= threshold) tier += 1;
  return tier;
}

export function tierName(tier: number): string {
  if (tier <= 0) return 'off';
  return TIER_NAMES[Math.min(tier, TIER_NAMES.length) - 1] ?? 'off';
}

export function activeTiers(
  counts: Record<string, number>,
  thresholds: Record<string, number[]>,
): Record<string, number> {
  const tiers: Record<string, number> = {};
  for (const [trait, steps] of Object.entries(thresholds)) {
    tiers[trait] = tierIndex(steps, counts[trait] || 0);
  }
  return tiers;
}

export function nextThreshold(thresholds: number[] | undefined, count: number): number | null {
  if (!thresholds) return null;
  return thresholds.find((threshold) => threshold > count) ?? null;
}

/** 0..1 progress from the last reached breakpoint to the next one. */
export function tierProgress(
  thresholds: number[] | undefined,
  count: number,
): { current: number; next: number | null; ratio: number } {
  if (!thresholds?.length) return { current: 0, next: null, ratio: 0 };
  let reached = 0;
  for (const threshold of thresholds) if (count >= threshold) reached = threshold;
  const next = thresholds.find((threshold) => threshold > count) ?? null;
  if (next === null) return { current: count, next: null, ratio: 1 };
  const span = next - reached;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (count - reached) / span)) : 0;
  return { current: count, next, ratio };
}

export type { Assignment, Layer, Plan, Unit };
