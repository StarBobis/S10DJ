import type { Layer } from './types';

export interface StyleCombo {
  id: string;
  /** Every style must be able to provide its assigned layer. */
  layers: Record<Layer, string>;
}

/**
 * Curated no-champion combinations. They exist to make the manual mixer feel
 * like arranging a set rather than filling three dropdowns.
 */
export const STYLE_COMBOS: StyleCombo[] = [
  { id: 'jazz-truedamage', layers: { drums: 'truedamage', chords: 'truedamage', top: 'jazz' } },
  { id: 'kda-pentakill', layers: { drums: 'kda', chords: 'kda', top: 'pentakill' } },
  { id: 'disco-hyperpop', layers: { drums: 'funk', chords: 'funk', top: 'hyperpop' } },
  { id: 'emo-maestro', layers: { drums: 'emo', chords: 'emo', top: 'classical' } },
  { id: 'country-illbeats', layers: { drums: 'country', chords: 'country', top: 'illbeats' } },
  { id: 'heartsteel-truedamage', layers: { drums: 'popband', chords: 'popband', top: 'truedamage' } },
  { id: 'kda-truedamage', layers: { drums: 'kda', chords: 'truedamage', top: 'kda' } },
  { id: '8bit-jazz', layers: { drums: '8bit', chords: '8bit', top: 'jazz' } },
  { id: 'punk-edm-kda', layers: { drums: 'punkrock', chords: 'edm', top: 'kda' } },
  { id: 'mixmaster-funk-illbeats', layers: { drums: 'dj', chords: 'funk', top: 'illbeats' } },
];
