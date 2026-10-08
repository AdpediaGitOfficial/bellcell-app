/**
 * Chart palette - VALIDATED, do not substitute by eye.
 *
 * Checked with the palette validator across lightness band, chroma floor,
 * CVD separation (all pairs, not just adjacent), normal-vision floor and
 * contrast vs surface. Both modes pass all six checks.
 *
 * HARD LIMIT: four categorical hues. Because the brand IS teal, blue and
 * green are unusable as categorical slots - measured teal<->sky dE 11.6 for
 * normal vision and amber<->lime dE 4.9 under protanopia. A fifth category
 * folds into "Other" or the chart becomes small multiples. Do not "just add
 * one more colour".
 */

export const CATEGORICAL_LIGHT = ['#00958F', '#7C3AED', '#C2850D', '#BE123C'] as const
export const CATEGORICAL_DARK = ['#0FA9A2', '#8B5CF6', '#C2850D', '#E11D48'] as const

/** Single-hue ramp for ORDERED/magnitude data (never categorical hues). */
export const SEQUENTIAL_LIGHT = [
  '#ccedec',
  '#99dbd8',
  '#66c9c5',
  '#33b7b2',
  '#00a59f',
  '#007c77',
] as const

export const SEQUENTIAL_DARK = [
  '#004a48',
  '#00635f',
  '#007c77',
  '#00958f',
  '#00a59f',
  '#33b7b2',
] as const

/** Reserved status colours - never reused as a series colour. */
export const STATUS = {
  positive: '#059669',
  caution: '#D97706',
  critical: '#DC2626',
  info: '#2563EB',
} as const

export const MAX_CATEGORICAL = 4
