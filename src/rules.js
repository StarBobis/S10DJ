/**
 * Set 10 mixing engine - reconstructed rules.
 *
 * Evidence:
 *  - Riot design interview: the soundtrack has 3 layers, up to 3 styles play at
 *    once, triggered by how many units of a style are on the board; complex
 *    traits such as K/DA grow with their breakpoint tier; a solo trait such as
 *    Maestro (Jhin) always occupies one of the three layers.
 *  - Patch 13.24 game data (Map22 music data) exposes the switch surface
 *    Set_Switch_set10_<style>_<layer> with layer in {drums, chords, top}, which
 *    gives the layer inventory per style and the style id list.
 *  - CommunityDragon 13.24 set data maps every unit to its music trait.
 */

export const LAYERS = ['drums', 'chords', 'top'];

/** Layer availability per style, taken from the shipped switch names. */
export const STYLE_LAYERS = {
  none: ['drums', 'chords', 'top'],
  kda: ['drums', 'chords', 'top'],
  pentakill: ['drums', 'chords', 'top'],
  popband: ['drums', 'chords', 'top'],
  truedamage: ['drums', 'chords', 'top'],
  '8bit': ['drums', 'chords'],
  country: ['drums', 'chords'],
  edm: ['drums', 'chords'],
  emo: ['drums', 'chords'],
  funk: ['drums', 'chords'],
  punkrock: ['drums', 'chords'],
  illbeats: ['drums', 'top'],
  dj: ['drums'],
  classical: ['top'],
  hyperpop: ['top'],
  jazz: ['top'],
};

export const STYLE_LABEL = {
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

const TIER_STYLES = ['bronze', 'silver', 'gold', 'prismatic'];

/**
 * Count units per style.
 * @param {Array<{style: string}>} units units currently on the board
 * @returns {Record<string, number>}
 */
export function styleCounts(units) {
  const counts = {};
  for (const unit of units) {
    if (!unit || unit.style === 'none') continue;
    counts[unit.style] = (counts[unit.style] || 0) + 1;
  }
  return counts;
}

/**
 * Weight of every style: unit count plus a breakpoint bonus.
 *
 * The interview says a style's share of the mix grows with its trait tier, so a
 * reached breakpoint adds its tier index (1..4) to the style's weight.
 *
 * @param {Array<{style: string}>} units
 * @param {Record<string, {active: number}>} traitTiers active tier index per trait
 */
export function styleWeights(units, traitTiers = {}) {
  const weights = {};
  for (const unit of units) {
    if (!unit || unit.style === 'none') continue;
    weights[unit.style] = (weights[unit.style] || 0) + 1;
  }
  for (const [trait, tier] of Object.entries(traitTiers)) {
    const style = TRAIT_TO_STYLE[trait];
    if (!style || !tier || !tier.active) continue;
    weights[style] = (weights[style] || 0) + tier.active;
  }
  return weights;
}

export const TRAIT_TO_STYLE = {
  '8-bit': '8bit',
  Maestro: 'classical',
  Country: 'country',
  Mixmaster: 'dj',
  EDM: 'edm',
  Emo: 'emo',
  Disco: 'funk',
  Hyperpop: 'hyperpop',
  ILLBEATS: 'illbeats',
  Jazz: 'jazz',
  'K/DA': 'kda',
  Pentakill: 'pentakill',
  Heartsteel: 'popband',
  Punk: 'punkrock',
  'True Damage': 'truedamage',
};

export const SPOTLIGHT_TRAITS = Object.keys(TRAIT_TO_STYLE);

/**
 * Assign a style to every layer.
 *
 * Each layer independently takes the heaviest style able to provide it; ties
 * fall back to the fixed priority list shipped in data/music_rules.json. Layers
 * nobody can provide fall back to the base style.
 *
 * @param {Array} units board units
 * @param {object} options { traitTiers, priority, spotlightAlwaysOccupies }
 */
export function assignLayers(units, options = {}) {
  const {
    traitTiers = {},
    priority = [
      'kda', 'pentakill', 'truedamage', 'popband', 'illbeats', '8bit', 'country',
      'edm', 'emo', 'funk', 'punkrock', 'hyperpop', 'jazz', 'classical', 'dj', 'none',
    ],
    spotlightAlwaysOccupies = true,
  } = options;

  const weights = styleWeights(units, traitTiers);
  const rank = new Map(priority.map((style, index) => [style, index]));

  const assignment = {};
  for (const layer of LAYERS) {
    let best = 'none';
    let bestWeight = 0;
    for (const [style, weight] of Object.entries(weights)) {
      if (!STYLE_LAYERS[style]?.includes(layer)) continue;
      if (weight > bestWeight || (weight === bestWeight && rank.get(style) < rank.get(best))) {
        best = style;
        bestWeight = weight;
      }
    }
    assignment[layer] = { style: best, weight: bestWeight };
  }

  // A solo act such as Maestro (Jhin) always holds one layer.
  if (spotlightAlwaysOccupies && weights.classical) {
    assignment.top = { style: 'classical', weight: weights.classical, spotlight: true };
  }
  return { assignment, weights };
}

/**
 * Breakpoint tier index for a trait given how many units have it.
 * @param {number[]} thresholds ascending breakpoints
 * @param {number} count
 */
export function tierIndex(thresholds, count) {
  let tier = 0;
  for (const threshold of thresholds) {
    if (count >= threshold) tier += 1;
  }
  return tier;
}

export function tierName(tier) {
  return TIER_STYLES[Math.min(tier, TIER_STYLES.length) - 1] || 'off';
}
