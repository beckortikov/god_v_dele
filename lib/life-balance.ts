/** Pure helpers for the participant's «Колесо жизни» (scores 0–10 per sphere per month). */

export type MonthScores = Record<string, number>
export type YearScores = Record<string, MonthScores>

export const MAX_SCORE = 10
const START_SCORE = 5

/** Spheres the person has rated in this month. */
export function ratedCount(scores: MonthScores | undefined, categories: string[]) {
  return categories.filter(c => scores?.[c] !== undefined).length
}

/** Mean of the rated spheres, one decimal; null when nothing is rated. */
export function average(scores: MonthScores | undefined, categories: string[]): number | null {
  const rated = categories.filter(c => scores?.[c] !== undefined)
  if (!rated.length) return null
  const sum = rated.reduce((a, c) => a + scores![c], 0)
  return Math.round((sum / rated.length) * 10) / 10
}

/** The closest earlier month (same year) that has any rating, as an index into `months`. */
export function previousRatedMonth(monthly: YearScores, months: string[], idx: number): number | null {
  for (let i = idx - 1; i >= 0; i--) {
    if (Object.keys(monthly[months[i]] || {}).length > 0) return i
  }
  return null
}

/** New score after pressing − or +. An unrated sphere starts from last month's score, or the middle. */
export function stepScore(current: number | undefined, dir: -1 | 1, previous?: number): number {
  const base = current ?? previous ?? START_SCORE
  // First press on an empty sphere only fills it in, so «+» on an empty sphere is not «+1» on top of the guess.
  if (current === undefined) return base
  return Math.min(MAX_SCORE, Math.max(0, base + dir))
}

/** Gap to the ideal: how far the person is from where they want to be (never negative). */
export function gapToIdeal(score: number | undefined, ideal: number) {
  return score === undefined ? null : Math.max(0, ideal - score)
}

/** Sphere with the most room to grow among the rated ones; null when all are at their ideal. */
export function weakestSphere(scores: MonthScores | undefined, ideals: Record<string, number>, categories: string[]) {
  let worst: { category: string; gap: number } | null = null
  for (const c of categories) {
    const gap = gapToIdeal(scores?.[c], ideals[c] ?? MAX_SCORE)
    if (gap && (!worst || gap > worst.gap)) worst = { category: c, gap }
  }
  return worst
}
