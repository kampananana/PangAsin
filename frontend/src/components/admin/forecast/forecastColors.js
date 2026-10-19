// WHAT: One source of truth for the semantic colours of the Municipalities
//       section: increase, decrease, stable and no-data.
// WHY: The two bar panels, the header legend, the No-data/Incomplete rows and
//      the "Needs attention" badges must all mean the same thing, so the
//      mapping lives in one place instead of being re-declared per file.

export const MUNI_COLORS = {
  increase: 'var(--fc-soft-green)',
  decrease: 'var(--fc-soft-red)',
  stable: 'var(--fc-soft-slate)',
  nodata: 'var(--fc-nodata-fill)',
};

export const MUNI_EDGES = {
  increase: 'var(--fc-soft-green-edge)',
  decrease: 'var(--fc-soft-red-edge)',
  stable: 'var(--fc-soft-slate-edge)',
  nodata: 'var(--fc-nodata-edge)',
};

export const MUNI_LABELS = {
  increase: 'Increase',
  decrease: 'Decrease',
  stable: 'Stable',
  nodata: 'No data',
};

/* Direction -> colour key. Uses the same +/-2% thresholds as the backend
   _trend_direction() so the bars and the badges never disagree. */
export function colorKeyFor(direction) {
  if (direction === 'increasing') return 'increase';
  if (direction === 'declining') return 'decrease';
  return 'stable';
}

/* Reason badge -> colour key, so "Needs attention" speaks the same language
   as the bars next to it. */
export const ATTENTION_COLOR_KEY = {
  declining: 'decrease',
  low: 'stable',
  nodata: 'nodata',
};
