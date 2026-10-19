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

const TIER_NAMES = ['bronze', 'silver', 'gold', 'prismatic'];

export function styleWeights(
  units: Unit[],
  tiers: Record<string, number> = {},
  traitToStyle: Record<string, string> = {},
): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const unit of units) {
    if (!unit || unit.style === 'none') continue;
    weights[unit.style] = (weights[unit.style] || 0) + 1;
  }
  // A reached breakpoint raises that style's share of the mix (Riot interview).
  for (const [trait, tier] of Object.entries(tiers)) {
    const style = traitToStyle[trait];
    if (!style || !tier) continue;
    weights[style] = (weights[style] || 0) + tier;
  }
  return weights;
}

export interface AssignOptions {
  styleLayers: Record<string, Layer[]>;
  traitToStyle: Record<string, string>;
  priority: string[];
  tiers?: Record<string, number>;
  overrides?: Partial<Record<Layer, string | null>>;
  spotlightAlwaysOccupies?: boolean;
}

export function assignLayers(units: Unit[], options: AssignOptions): { plan: Plan; weights: Record<string, number> } {
  const { styleLayers, traitToStyle, priority, tiers = {}, overrides = {}, spotlightAlwaysOccupies = true } = options;
  const weights = styleWeights(units, tiers, traitToStyle);
  const rank = new Map(priority.map((style, index) => [style, index]));

  const plan = {} as Plan;
  for (const layer of LAYERS) {
    let best = 'none';
    let bestWeight = 0;
    for (const [style, weight] of Object.entries(weights)) {
      if (!styleLayers[style]?.includes(layer)) continue;
      const better = weight > bestWeight;
      const tied = weight === bestWeight && (rank.get(style) ?? 99) < (rank.get(best) ?? 99);
      if (better || tied) {
        best = style;
        bestWeight = weight;
      }
    }
    plan[layer] = { style: best, weight: bestWeight };
  }

  if (spotlightAlwaysOccupies && weights.classical) {
    plan.top = { style: 'classical', weight: weights.classical, spotlight: true };
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

export type { Assignment, Layer, Plan, Unit };
