const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SYMBOLS: Record<string, { sign: string; before: boolean }> = {
  USD: { sign: '$', before: true },
  EUR: { sign: '€', before: true },
  RUB: { sign: '₽', before: false },
  TJS: { sign: 'TJS', before: false },
}

/** "$12 400", "8 500 TJS". Fractions are kept only when present. */
export function formatMoney(value: number | string | null | undefined, currency = 'USD', opts?: { sign?: boolean }) {
  const n = Number(value) || 0
  const abs = Math.abs(n)
  const body = Number.isInteger(Math.round(abs * 100) / 100) ? nf0.format(abs) : nf2.format(abs)
  const sym = SYMBOLS[currency] ?? { sign: currency, before: false }
  const s = sym.before ? `${sym.sign}${body}` : `${body} ${sym.sign}`
  const prefix = n < 0 ? '−' : opts?.sign && n > 0 ? '+' : ''
  return prefix + s
}

export function formatNumber(value: number) {
  return nf0.format(value)
}

export function formatDate(value: string | Date | null | undefined, style: 'short' | 'long' = 'short') {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return style === 'short'
    ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
export const MONTHS_SHORT_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Russian plural: plural(5, ['платёж','платежа','платежей']) */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}
