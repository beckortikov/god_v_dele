/**
 * Category colours for the wheel pages.
 *
 * The wheels need more distinct series than the six `--chart-n` tokens give
 * (12 months, 10 business areas, any number of life-wheel groups), so they
 * are defined here once. Values are mid-lightness OKLCH, which keeps enough
 * contrast on both the light card surface and the dark one. Lighter variants
 * are mixed toward `var(--card)`, so they follow the active theme.
 */

/** Ordered so that neighbours are far apart on the hue circle. */
export const WHEEL_COLORS = [
  'oklch(0.6 0.17 268)', // indigo
  'oklch(0.66 0.17 350)', // pink
  'oklch(0.66 0.13 225)', // sky
  'oklch(0.74 0.14 75)', // amber
  'oklch(0.65 0.12 175)', // teal
  'oklch(0.64 0.18 25)', // red
  'oklch(0.62 0.16 300)', // violet
  'oklch(0.72 0.15 130)', // lime
  'oklch(0.68 0.15 50)', // orange
  'oklch(0.6 0.14 250)', // blue
  'oklch(0.66 0.14 155)', // green
  'oklch(0.62 0.17 325)', // magenta
] as const

export function wheelColor(i: number) {
  return WHEEL_COLORS[((i % WHEEL_COLORS.length) + WHEEL_COLORS.length) % WHEEL_COLORS.length]
}

/** A lighter tint of `color`, mixed toward the card surface (theme-aware). */
export function tint(color: string, step: number) {
  const pct = Math.max(45, 100 - step * 11)
  return `color-mix(in oklch, ${color} ${pct}%, var(--card))`
}

/** Months in calendar order, each with its own colour. */
export const MONTH_COLORS: string[] = [
  'oklch(0.6 0.14 250)', // Январь
  'oklch(0.66 0.12 205)', // Февраль
  'oklch(0.66 0.14 160)', // Март
  'oklch(0.72 0.15 130)', // Апрель
  'oklch(0.76 0.14 90)', // Май
  'oklch(0.68 0.15 50)', // Июнь
  'oklch(0.62 0.19 25)', // Июль
  'oklch(0.66 0.17 350)', // Август
  'oklch(0.6 0.16 305)', // Сентябрь
  'oklch(0.62 0.17 325)', // Октябрь
  'oklch(0.58 0.17 270)', // Ноябрь
  'oklch(0.64 0.11 185)', // Декабрь
]
