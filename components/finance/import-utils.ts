/**
 * Parsing helpers for the Excel/CSV import: reading the file with `xlsx`,
 * detecting columns, and tolerant parsing of dates, amounts and names.
 */

export type Cell = string | number | boolean | null | undefined
export type Grid = Cell[][]

export type ImportField = 'date' | 'name' | 'amount' | 'currency' | 'category' | 'account' | 'program' | 'rate' | 'comment'

export const FIELD_LABELS: Record<ImportField, string> = {
  date: 'Дата',
  name: 'Название',
  amount: 'Сумма',
  currency: 'Валюта',
  category: 'Категория',
  account: 'Счёт',
  program: 'Программа',
  rate: 'Курс',
  comment: 'Комментарий',
}

const ALIASES: Record<ImportField, string[]> = {
  date: ['дата', 'date', 'день', 'дата оплаты', 'дата платежа', 'дата расхода', 'число'],
  name: ['название', 'наименование', 'расход', 'статья', 'назначение', 'name', 'title', 'участник', 'фио', 'ф.и.о', 'имя', 'студент', 'ученик', 'клиент', 'плательщик'],
  amount: ['сумма', 'amount', 'итого', 'стоимость', 'оплата', 'total', 'sum'],
  currency: ['валюта', 'currency', 'вал'],
  category: ['категория', 'category', 'вид расхода', 'тип'],
  account: ['счёт', 'счет', 'account', 'касса', 'кошелёк', 'кошелек'],
  program: ['программа', 'program', 'поток', 'группа'],
  rate: ['курс валюты', 'курс обмена', 'курс', 'rate', 'exchange rate'],
  comment: ['комментарий', 'примечание', 'коммент', 'note', 'notes', 'comment', 'описание'],
}

/** Order matters: specific fields first so «Описание» is not taken as a name. */
const DETECT_ORDER: ImportField[] = ['date', 'amount', 'currency', 'rate', 'category', 'account', 'program', 'name', 'comment']

export function norm(s: unknown) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ \s]+/g, ' ')
    .trim()
}

/** For person and account names: drop punctuation too. */
export function normName(s: unknown) {
  return norm(s)
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function columnLetter(i: number) {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// ---------- Reading -------------------------------------------------------

export interface Workbook {
  sheetNames: string[]
  read: (sheet: string) => Grid
}

function decodeText(buf: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    // Excel on Russian Windows saves CSV in cp1251
    return new TextDecoder('windows-1251').decode(buf)
  }
}

export async function readWorkbook(file: File): Promise<Workbook> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const isText = /\.(csv|txt|tsv)$/i.test(file.name)
  // CSV: keep every cell as text and parse dates ourselves (dd.mm.yyyy, not US m/d/y)
  const wb = isText ? XLSX.read(decodeText(buf), { type: 'string', raw: true }) : XLSX.read(buf, { type: 'array', cellDates: false })
  return {
    sheetNames: wb.SheetNames,
    read: (sheet: string) => {
      const ws = wb.Sheets[sheet]
      if (!ws) return []
      const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })
      return rows.filter(r => r.some(c => String(c ?? '').trim() !== ''))
    },
  }
}

// ---------- Values --------------------------------------------------------

function isoFromParts(y: number, m: number, d: number) {
  if (y < 100) y += 2000
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Excel serial (days since 1899-12-30), ISO, or dd.mm.yyyy → YYYY-MM-DD. */
export function parseDate(v: Cell): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null
    const ms = Math.round((v - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (m) return isoFromParts(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (m) return isoFromParts(+m[3], +m[2], +m[1])
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDate(Number(s))
  return null
}

/** "1 234,50", "1,234.50", "$1200", "-500 TJS" → positive number. */
export function parseAmount(v: Cell): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0 ? Math.abs(v) : null
  if (/^\s*\d{1,4}[-./]\d{1,2}[-./]\d{1,4}/.test(String(v))) return null // a date, not an amount
  let s = String(v)
    .replace(/[  \s']/g, '')
    .replace(/(usd|tjs|сомони|смн|сом|долл?\.?|\$|руб\.?)/gi, '')
    .replace(/[()−–-]/g, '')
  if (!s) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return n > 0 ? n : null
}

export function parseCurrency(v: Cell): 'USD' | 'TJS' | null | 'unknown' {
  const s = norm(v)
  if (!s) return null
  if (/usd|\$|долл|dollar/.test(s)) return 'USD'
  if (/tjs|сомон|смн|сом|somoni/.test(s)) return 'TJS'
  return 'unknown'
}

export function cellText(v: Cell) {
  if (v == null) return ''
  return String(v).trim()
}

// ---------- Column detection ---------------------------------------------

export type Mapping = Record<ImportField, number>

export const NO_COLUMN = -1

function share(rows: Grid, col: number, test: (c: Cell) => boolean) {
  const values = rows.map(r => r[col]).filter(c => cellText(c) !== '')
  if (!values.length) return 0
  return values.filter(test).length / values.length
}

/** Finds the header row (the one that best matches known column names) among the first rows. */
export function detectHeaderRow(grid: Grid) {
  let best = -1
  let bestScore = 0
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const score = grid[i].filter(c => {
      const h = norm(c)
      return h && typeof c === 'string' && DETECT_ORDER.some(f => ALIASES[f].some(a => h === a || h.startsWith(a)))
    }).length
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }
  return bestScore >= 2 ? best : -1
}

export function detectMapping(headers: string[], body: Grid): Mapping {
  const mapping = Object.fromEntries(DETECT_ORDER.map(f => [f, NO_COLUMN])) as Mapping
  const used = new Set<number>()

  const contentOk: Partial<Record<ImportField, (col: number) => boolean>> = {
    date: col => share(body, col, c => parseDate(c) !== null) >= 0.6,
    amount: col => share(body, col, c => parseAmount(c) !== null) >= 0.6,
    rate: col => share(body, col, c => {
      const n = parseAmount(c)
      return n !== null && n > 0.001 && n < 1000
    }) >= 0.6,
  }

  for (const field of DETECT_ORDER) {
    let bestCol = NO_COLUMN
    let bestScore = 0
    headers.forEach((raw, col) => {
      if (used.has(col)) return
      const h = norm(raw)
      if (!h) return
      let score = 0
      for (const a of ALIASES[field]) {
        if (h === a) score = Math.max(score, 3)
        else if (h.startsWith(a)) score = Math.max(score, 2)
        else if (a.length > 3 && h.includes(a)) score = Math.max(score, 1)
      }
      if (score > bestScore && (!contentOk[field] || contentOk[field]!(col))) {
        bestScore = score
        bestCol = col
      }
    })
    if (bestCol !== NO_COLUMN) {
      mapping[field] = bestCol
      used.add(bestCol)
    }
  }

  // No usable headers: guess by content
  const width = Math.max(headers.length, ...body.slice(0, 50).map(r => r.length))
  const free = () => Array.from({ length: width }, (_, i) => i).filter(i => !used.has(i))
  if (mapping.date === NO_COLUMN) {
    const col = free().find(c => contentOk.date!(c))
    if (col !== undefined) used.add((mapping.date = col))
  }
  if (mapping.amount === NO_COLUMN) {
    const col = free().find(c => contentOk.amount!(c))
    if (col !== undefined) used.add((mapping.amount = col))
  }
  if (mapping.name === NO_COLUMN) {
    const col = free().find(c => share(body, c, x => typeof x === 'string' && /\p{L}{2,}/u.test(x)) >= 0.6)
    if (col !== undefined) used.add((mapping.name = col))
  }
  return mapping
}

// ---------- Fuzzy matching -----------------------------------------------

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

function similarity(a: string, b: string) {
  const len = Math.max(a.length, b.length)
  return len ? 1 - levenshtein(a, b) / len : 1
}

export interface NameIndex<T> {
  items: { item: T; norm: string; sorted: string; tokens: string[] }[]
}

export function buildNameIndex<T>(items: T[], name: (t: T) => string): NameIndex<T> {
  return {
    items: items.map(item => {
      const n = normName(name(item))
      const tokens = n.split(' ').filter(Boolean)
      return { item, norm: n, tokens, sorted: [...tokens].sort().join(' ') }
    }),
  }
}

/**
 * Case-insensitive fuzzy match: exact → same words in any order → prefixes
 * ("Иванов И." → "Иванов Иван") → close spelling. Returns null when nothing
 * matches or when several candidates are equally good.
 */
export function matchName<T>(index: NameIndex<T>, raw: string): { item: T; exact: boolean } | { ambiguous: T[] } | null {
  const n = normName(raw)
  if (!n) return null
  const tokens = n.split(' ').filter(Boolean)
  const sorted = [...tokens].sort().join(' ')

  const pick = (list: NameIndex<T>['items'], exact: boolean) =>
    list.length === 1 ? { item: list[0].item, exact } : list.length > 1 ? { ambiguous: list.map(x => x.item) } : null

  const exact = index.items.filter(x => x.norm === n)
  if (exact.length) return pick(exact, true)

  const sameWords = index.items.filter(x => x.sorted === sorted)
  if (sameWords.length) return pick(sameWords, true)

  // Every word of the file name starts a distinct word of the participant name
  if (tokens.length >= 2) {
    const prefix = index.items.filter(x => {
      const pool = [...x.tokens]
      return tokens.every(t => {
        const k = pool.findIndex(p => p.startsWith(t) || t.startsWith(p))
        if (k === -1) return false
        pool.splice(k, 1)
        return true
      })
    })
    const r = pick(prefix, false)
    if (r) return r
  }

  let best: { x: NameIndex<T>['items'][number]; s: number }[] = []
  for (const x of index.items) {
    const s = similarity(sorted, x.sorted)
    if (s < 0.82) continue
    if (!best.length || s > best[0].s + 0.02) best = [{ x, s }]
    else if (Math.abs(s - best[0].s) <= 0.02) best.push({ x, s })
  }
  return pick(
    best.map(b => b.x),
    false
  )
}

// ---------- Report --------------------------------------------------------

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
