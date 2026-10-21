/**
 * «Колесо внимания»: what a period starts from when the participant has not saved it yet.
 * Their own earlier work comes first; the shared template is only for people who never filled anything.
 */

export interface BaseCandidate {
  period_type: 'weekly' | 'monthly'
  period_label: string
  categories: { value?: number | string }[] | null
  updated_at?: string | null
}

export interface BasePick<T extends BaseCandidate> {
  entry: T
  /** Same kind of period: the hours can be copied as they are (otherwise they need scaling to a week or a month). */
  sameType: boolean
}

const total = (c: BaseCandidate['categories']) => (c ?? []).reduce((s, x) => s + (Number(x.value) || 0), 0)
const usable = (e: BaseCandidate) => !e.period_label.startsWith('template') && (e.categories?.length ?? 0) > 0 && total(e.categories) > 0

/**
 * Picks the saved entry to start from: the closest earlier period of the same kind, else the
 * earliest later one, else the latest-saved entry of the other kind. Labels sort as text
 * («2026-07», «2026-W29»). Empty or all-zero entries are ignored.
 */
export function pickBaseEntry<T extends BaseCandidate>(entries: T[], type: 'weekly' | 'monthly', label: string): BasePick<T> | null {
  const mine = entries.filter(e => usable(e) && !(e.period_type === type && e.period_label === label))
  const same = mine.filter(e => e.period_type === type)
  if (same.length) {
    const before = same.filter(e => e.period_label < label).sort((a, b) => b.period_label.localeCompare(a.period_label))
    if (before.length) return { entry: before[0], sameType: true }
    const after = same.filter(e => e.period_label > label).sort((a, b) => a.period_label.localeCompare(b.period_label))
    return { entry: after[0], sameType: true }
  }
  const other = mine.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  return other.length ? { entry: other[0], sameType: false } : null
}
