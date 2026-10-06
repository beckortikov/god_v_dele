'use client'

import * as XLSX from 'xlsx'
import { todayISO } from '@/lib/format'

/**
 * Client-side Excel export for table pages. Read-only: it only turns rows that
 * are already on the page (or fetched with GET) into an .xlsx file.
 *
 *   exportToExcel({
 *     filename: 'Сотрудники',                       // → «Сотрудники_2026-10-06.xlsx»
 *     columns: [
 *       { header: 'Сотрудник', value: e => fullName(e) },
 *       { header: 'Оклад', value: e => e.base_salary, type: 'money' },
 *       { header: 'Дата рождения', value: e => e.birth_date, type: 'date' },
 *     ],
 *     rows: filtered,
 *     totals: true,                                  // «Итого» + sum of money columns
 *   })
 *
 * Money and numbers go in as real numbers, dates as real Excel dates, so
 * sorting, filters and formulas work in Excel. The header row gets an
 * autofilter. (SheetJS community edition cannot write bold fonts.)
 */

export type ExportCellType = 'money' | 'date' | 'datetime' | 'number' | 'percent' | 'text'

export interface ExportColumn<T> {
  header: string
  value: (row: T, index: number) => unknown
  /** Default 'text'. `percent` expects 12.5 for 12,5 %. */
  type?: ExportCellType
  /** Column width in characters. Computed from the content when omitted. */
  width?: number
  /** Custom Excel number format, e.g. '0.0 "ч"'. */
  format?: string
}

export type ExportTotals =
  | boolean
  | {
      /** Text in the first column, default «Итого». */
      label?: string
      /** Headers of the columns to sum. Default: every `money` column. */
      sum?: string[]
      /** Fixed values by header (override sums). */
      values?: Record<string, unknown>
    }

export interface ExportOptions<T> {
  /** File name without the date and extension, e.g. «Сотрудники». */
  filename: string
  /** Sheet name, default = filename (trimmed to Excel's 31 characters). */
  sheetName?: string
  columns: ExportColumn<T>[]
  rows: T[]
  totals?: ExportTotals
  /** Add the date to the file name (default true). */
  dated?: boolean
}

const FORMATS: Record<Exclude<ExportCellType, 'text'>, string> = {
  money: '#,##0.00',
  number: '#,##0', // integers; fractions get '#,##0.0###' (see makeCell)
  percent: '0.0"%"',
  date: 'dd.mm.yyyy',
  datetime: 'dd.mm.yyyy hh:mm',
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

/** Excel serial for a calendar date (no time-zone shift). */
function dateSerial(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) {
  return (Date.UTC(y, m - 1, d, hh, mm, ss) - EXCEL_EPOCH) / 864e5
}

function toDateSerial(v: unknown, withTime: boolean): number | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return withTime
      ? dateSerial(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds())
      : dateSerial(v.getFullYear(), v.getMonth() + 1, v.getDate())
  }
  const s = String(v)
  // Plain «YYYY-MM-DD» is a calendar date: never shift it through a time zone
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (plain) return dateSerial(+plain[1], +plain[2], +plain[3])
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : toDateSerial(d, withTime)
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function makeCell(v: unknown, type: ExportCellType, format?: string): XLSX.CellObject | null {
  if (type === 'text') {
    if (v == null || v === '') return null
    return { t: 's', v: String(v) }
  }
  if (type === 'date' || type === 'datetime') {
    const serial = toDateSerial(v, type === 'datetime')
    if (serial == null) return v == null || v === '' ? null : { t: 's', v: String(v) }
    return { t: 'n', v: serial, z: format ?? FORMATS[type] }
  }
  const n = toNumber(v)
  if (n == null) return v == null || v === '' ? null : { t: 's', v: String(v) }
  const value = type === 'money' ? Math.round(n * 100) / 100 : n
  // '#,##0.##' would leave a dangling separator on whole numbers in Excel
  const z = format ?? (type === 'number' && !Number.isInteger(value) ? '#,##0.0###' : FORMATS[type])
  return { t: 'n', v: value, z }
}

/** Approximate on-screen width of a cell in characters. */
function cellWidth(cell: XLSX.CellObject | null, type: ExportCellType) {
  if (!cell) return 0
  if (type === 'date') return 10
  if (type === 'datetime') return 16
  if (cell.t === 'n') {
    const abs = Math.abs(Number(cell.v))
    const digits = Math.floor(abs).toString().length
    return digits + Math.floor((digits - 1) / 3) + (type === 'money' ? 3 : 2) + (Number(cell.v) < 0 ? 1 : 0)
  }
  return String(cell.v)
    .split('\n')
    .reduce((m, l) => Math.max(m, l.length), 0)
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Экспорт'
}

function safeSheetName(name: string) {
  return name.replace(/[\\/:*?[\]]+/g, ' ').trim().slice(0, 31) || 'Лист1'
}

/** Builds the workbook without saving it (used by tests and multi-sheet exports). */
export function buildWorkbook<T>({ sheetName, filename, columns, rows, totals }: ExportOptions<T>) {
  const ws: XLSX.WorkSheet = {}
  const types = columns.map(c => c.type ?? 'text')
  const widths = columns.map(c => c.header.length)

  const put = (r: number, c: number, cell: XLSX.CellObject | null, measure = true) => {
    if (!cell) return
    ws[XLSX.utils.encode_cell({ r, c })] = cell
    if (measure) widths[c] = Math.max(widths[c], cellWidth(cell, types[c]))
  }

  columns.forEach((col, c) => put(0, c, { t: 's', v: col.header }))

  const sums = columns.map(() => 0)
  rows.forEach((row, i) => {
    columns.forEach((col, c) => {
      const cell = makeCell(col.value(row, i), types[c], col.format)
      put(i + 1, c, cell)
      if (cell?.t === 'n') sums[c] += Number(cell.v)
    })
  })

  let lastRow = rows.length
  if (totals && rows.length) {
    const opts = typeof totals === 'object' ? totals : {}
    const sumHeaders = new Set(opts.sum ?? columns.filter(c => c.type === 'money').map(c => c.header))
    const r = rows.length + 1
    columns.forEach((col, c) => {
      if (opts.values && col.header in opts.values) {
        const v = opts.values[col.header]
        // A number in a text column (e.g. a count under a day) stays a number
        put(r, c, typeof v === 'number' && types[c] === 'text' ? { t: 'n', v } : makeCell(v, types[c], col.format))
      }
      else if (sumHeaders.has(col.header)) put(r, c, makeCell(sums[c], types[c], col.format))
    })
    // The label may overflow into the next empty cell; it does not widen the column
    if (!ws[XLSX.utils.encode_cell({ r, c: 0 })]) put(r, 0, { t: 's', v: opts.label ?? 'Итого' }, false)
    lastRow = r
  }

  const range = { s: { r: 0, c: 0 }, e: { r: Math.max(lastRow, 0), c: Math.max(columns.length - 1, 0) } }
  ws['!ref'] = XLSX.utils.encode_range(range)
  if (rows.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: range.s, e: { r: rows.length, c: range.e.c } }) }
  ws['!cols'] = columns.map((col, c) => ({ wch: col.width ?? Math.min(60, Math.max(8, widths[c] + 2)) }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetName ?? filename))
  return wb
}

/** Saves the rows as «<filename>_<YYYY-MM-DD>.xlsx». Returns the file name. */
export function exportToExcel<T>(opts: ExportOptions<T>): string {
  const wb = buildWorkbook(opts)
  const file = `${safeFileName(opts.filename)}${opts.dated === false ? '' : `_${todayISO()}`}.xlsx`
  XLSX.writeFile(wb, file, { compression: true })
  return file
}
