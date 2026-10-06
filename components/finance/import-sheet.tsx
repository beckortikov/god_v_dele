'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Field } from '@/components/erp/field'
import { Segmented } from '@/components/erp/segmented'
import { Combobox } from '@/components/erp/combobox'
import { Checkbox } from '@/components/finance/checkbox'
import { MONTHS_RU, formatDate, formatMoney, formatNumber, plural } from '@/lib/format'
import { roundMoney } from '@/lib/money'
import { fetchNbtRate } from '@/lib/exchange-rate'
import {
  FIELD_LABELS,
  NO_COLUMN,
  buildNameIndex,
  cellText,
  columnLetter,
  detectHeaderRow,
  detectMapping,
  downloadCsv,
  matchName,
  normName,
  parseAmount,
  parseCurrency,
  parseDate,
  readWorkbook,
  type Cell,
  type Grid,
  type ImportField,
  type Mapping,
  type Workbook,
} from '@/components/finance/import-utils'
import {
  accountsFor,
  pickAccount,
  readPref,
  type Account,
  type ExpenseItem,
  type IncomeItem,
  type Participant,
  type Program,
} from '@/components/finance/types'

export type ImportMode = 'expenses' | 'payments'

const FIELDS: Record<ImportMode, { field: ImportField; required?: boolean }[]> = {
  expenses: [
    { field: 'date', required: true },
    { field: 'name', required: true },
    { field: 'amount', required: true },
    { field: 'currency' },
    { field: 'category' },
    { field: 'account' },
    { field: 'program' },
    { field: 'rate' },
    { field: 'comment' },
  ],
  payments: [
    { field: 'date', required: true },
    { field: 'name', required: true },
    { field: 'amount', required: true },
    { field: 'currency' },
    { field: 'account' },
    { field: 'rate' },
    { field: 'comment' },
  ],
}

const AUTO_ACCOUNT = 'auto'
const PREVIEW_LIMIT = 500

interface ParsedRow {
  key: number
  line: number
  raw: Cell[]
  date: string | null
  name: string
  amount: number | null
  currency: 'USD' | 'TJS'
  rate: number | null
  category: string
  accountId: string
  programId: string | null
  comment: string
  participant: Participant | null
  candidates: Participant[]
  errors: string[]
  warnings: string[]
  /** Selected by default (no errors, not a likely duplicate). */
  suggested: boolean
}

interface Outcome {
  created: number
  skipped: number
  failed: number
  report: (string | number)[][]
}

/** The participant's program account in the payment currency, else the usual pick. */
function autoAccount(accounts: Account[], programId: string | null | undefined, currency: string, remembered: string | null) {
  const opts = accountsFor(accounts, programId)
  const sameCurrency = opts.filter(a => a.currency === currency)
  const own = sameCurrency.filter(a => a.program_id && a.program_id === programId)
  for (const pool of [own, sameCurrency]) {
    const id = pickAccount(pool, remembered)
    if (id) return id
  }
  return ''
}

function fieldLabel(mode: ImportMode, f: ImportField) {
  return mode === 'payments' && f === 'name' ? 'Участник' : FIELD_LABELS[f]
}

export function ImportSheet({
  open,
  onOpenChange,
  mode,
  accounts,
  programs,
  categories,
  participants,
  payments,
  ledger = false,
  expenses,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  mode: ImportMode
  accounts: Account[]
  programs: Program[]
  categories: string[]
  participants: Participant[]
  payments: IncomeItem[]
  /** Partial payments on (migration 014): each row adds a receipt, months are never replaced. */
  ledger?: boolean
  expenses: ExpenseItem[]
  onSaved: () => void
}) {
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [reading, setReading] = React.useState(false)
  const [fileName, setFileName] = React.useState('')
  const [workbook, setWorkbook] = React.useState<Workbook | null>(null)
  const [sheetName, setSheetName] = React.useState('')
  const [grid, setGrid] = React.useState<Grid>([])
  const [headerRow, setHeaderRow] = React.useState(-1)
  const [mapping, setMapping] = React.useState<Mapping | null>(null)

  const [defaultAccount, setDefaultAccount] = React.useState('')
  const [defaultCategory, setDefaultCategory] = React.useState('Прочее')
  const [defaultCurrency, setDefaultCurrency] = React.useState<'USD' | 'TJS'>('USD')
  const [replaceExisting, setReplaceExisting] = React.useState(false)

  const [selection, setSelection] = React.useState<Map<number, boolean>>(new Map())
  const [participantOverride, setParticipantOverride] = React.useState<Map<number, string>>(new Map())
  const [filter, setFilter] = React.useState<'all' | 'issues'>('all')
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)

  const reset = React.useCallback(() => {
    setFileName('')
    setWorkbook(null)
    setSheetName('')
    setGrid([])
    setHeaderRow(-1)
    setMapping(null)
    setSelection(new Map())
    setParticipantOverride(new Map())
    setFilter('all')
    setProgress(null)
    setOutcome(null)
  }, [])

  React.useEffect(() => {
    if (!open) return
    reset()
    setDefaultCurrency('USD')
    setDefaultCategory('Прочее')
    setReplaceExisting(false)
    setDefaultAccount(
      mode === 'payments' ? AUTO_ACCOUNT : pickAccount(accountsFor(accounts, null), readPref('last-expense-account')) || ''
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const loadSheet = React.useCallback((wb: Workbook, name: string) => {
    const g = wb.read(name)
    const h = detectHeaderRow(g)
    const headers = h >= 0 ? g[h].map(c => cellText(c)) : []
    const body = g.slice(h + 1)
    setSheetName(name)
    setGrid(g)
    setHeaderRow(h)
    setMapping(detectMapping(headers, body))
    setSelection(new Map())
    setParticipantOverride(new Map())
  }, [])

  const openFile = async (file: File | undefined) => {
    if (!file) return
    if (!/\.(xlsx|xls|csv|txt)$/i.test(file.name)) {
      toast.error('Этот формат не подходит', { description: 'Загрузите файл .xlsx или .csv' })
      return
    }
    setReading(true)
    try {
      const wb = await readWorkbook(file)
      if (!wb.sheetNames.length) throw new Error('В файле нет листов')
      // First sheet that has data
      const first = wb.sheetNames.find(n => wb.read(n).length > 0) ?? wb.sheetNames[0]
      setWorkbook(wb)
      setFileName(file.name)
      loadSheet(wb, first)
    } catch (err: any) {
      toast.error('Не удалось прочитать файл', { description: err.message })
    } finally {
      setReading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  // ---------- Parsing rows -------------------------------------------------
  const headers = React.useMemo(() => {
    const width = Math.max(0, ...grid.slice(0, 200).map(r => r.length))
    return Array.from({ length: width }, (_, i) => {
      const h = headerRow >= 0 ? cellText(grid[headerRow]?.[i]) : ''
      return h ? `${h} (${columnLetter(i)})` : `Колонка ${columnLetter(i)}`
    })
  }, [grid, headerRow])

  const participantIndex = React.useMemo(() => buildNameIndex(participants, p => p.name), [participants])
  const accountIndex = React.useMemo(() => buildNameIndex(accounts, a => a.name), [accounts])
  const programIndex = React.useMemo(() => buildNameIndex(programs, p => p.name), [programs])
  const categoryByNorm = React.useMemo(() => new Map(categories.map(c => [normName(c), c])), [categories])

  const rows = React.useMemo<ParsedRow[]>(() => {
    if (!mapping) return []
    const body = grid.slice(headerRow + 1)
    const lastIncomeAccount = readPref('last-income-account')
    const seenPayments = new Map<string, number>()
    const existingPayments = new Set(payments.map(p => `${p.participantId}|${p.month}|${p.year}`))
    // Ledger: a receipt is a duplicate when participant, date, currency and amount all match
    const receiptKey = (pid: string, date: string, cur: string | undefined, amount: unknown) => `${pid}|${date}|${cur || 'USD'}|${roundMoney(amount)}`
    const existingReceipts = new Set(
      ledger ? payments.map(p => receiptKey(p.participantId, p.date, p.currency, p.currency === 'TJS' ? p.original_amount : p.amount)) : []
    )
    const seenReceipts = new Map<string, number>()
    const existingExpenses = new Set(expenses.map(e => `${normName(e.name)}|${e.date}|${roundMoney(e.currency === 'TJS' ? e.original_amount : e.amount)}`))

    return body.map((raw, i): ParsedRow => {
      const get = (f: ImportField) => (mapping[f] >= 0 ? raw[mapping[f]] : '')
      const errors: string[] = []
      const warnings: string[] = []
      const line = headerRow + 2 + i

      const dateCell = get('date')
      const date = parseDate(dateCell)
      if (!date) errors.push(cellText(dateCell) ? `Не распознана дата «${cellText(dateCell)}»` : 'Нет даты')

      const amountCell = get('amount')
      const amount = parseAmount(amountCell)
      if (!amount) errors.push(cellText(amountCell) ? `Не распознана сумма «${cellText(amountCell)}»` : 'Нет суммы')

      const curRaw = parseCurrency(get('currency'))
      let currency: 'USD' | 'TJS' = defaultCurrency
      if (curRaw === 'USD' || curRaw === 'TJS') currency = curRaw
      else if (curRaw === 'unknown') warnings.push(`Валюта «${cellText(get('currency'))}» не поддерживается, взята ${defaultCurrency}`)

      let rate: number | null = null
      if (currency === 'TJS' && cellText(get('rate'))) {
        const r = parseAmount(get('rate'))
        if (r && r > 1 && r < 100) rate = r
        else warnings.push('Курс из файла не распознан, возьмём курс НБТ')
      }

      const name = cellText(get('name'))
      const comment = cellText(get('comment'))

      // Account from the file, else default
      let accountId = ''
      const accountText = cellText(get('account'))
      if (accountText) {
        const m = matchName(accountIndex, accountText)
        if (m && 'item' in m) accountId = m.item.id
        else warnings.push(`Счёт «${accountText}» не найден, взят счёт по умолчанию`)
      }

      let category = ''
      let programId: string | null = null
      let participant: Participant | null = null
      let candidates: Participant[] = []
      let suggested = true

      if (mode === 'expenses') {
        if (!name) errors.push('Нет названия')
        const catText = cellText(get('category'))
        category = catText ? categoryByNorm.get(normName(catText)) ?? catText : defaultCategory
        const progText = cellText(get('program'))
        if (progText) {
          const m = matchName(programIndex, progText)
          if (m && 'item' in m) programId = m.item.id
          else warnings.push(`Программа «${progText}» не найдена, расход будет без программы`)
        }
        if (!accountId && defaultAccount && defaultAccount !== AUTO_ACCOUNT) accountId = defaultAccount
        if (!accountId) errors.push('Не выбран счёт')
        if (date && amount && existingExpenses.has(`${normName(name)}|${date}|${roundMoney(amount)}`)) {
          warnings.push('Такой расход уже есть')
          suggested = false
        }
      } else {
        const overrideId = participantOverride.get(i)
        if (overrideId) participant = participants.find(p => p.id === overrideId) ?? null
        else if (name) {
          const m = matchName(participantIndex, name)
          if (m && 'item' in m) {
            participant = m.item
            if (!m.exact) warnings.push(`Найден как «${m.item.name}»`)
          } else if (m && 'ambiguous' in m) candidates = m.ambiguous
        }
        if (!participant) {
          errors.push(!name ? 'Нет участника' : candidates.length ? 'Несколько похожих участников, выберите' : 'Участник не найден, выберите')
        } else {
          programId = participant.program_id || null
          if (!accountId) {
            accountId =
              defaultAccount && defaultAccount !== AUTO_ACCOUNT
                ? defaultAccount
                : autoAccount(accounts, participant.program_id, currency, lastIncomeAccount)
          }
          if (!accountId) errors.push('Не выбран счёт')
          if (date && ledger) {
            // Several payments for one month are fine; only exact repeats are suspicious
            const k = receiptKey(participant.id, date, currency, amount)
            const prevLine = seenReceipts.get(k)
            if (prevLine) {
              warnings.push(`Такая же сумма и дата уже в строке ${prevLine}`)
              suggested = false
            } else seenReceipts.set(k, line)
            if (existingReceipts.has(k)) {
              warnings.push('Такое поступление уже есть')
              suggested = false
            }
          } else if (date) {
            const [y, m] = date.split('-').map(Number)
            const k = `${participant.id}|${m}|${y}`
            const prevLine = seenPayments.get(k)
            if (prevLine) errors.push(`Повтор: этот участник за ${MONTHS_RU[m - 1].toLowerCase()} уже в строке ${prevLine}`)
            else seenPayments.set(k, line)
            if (existingPayments.has(k)) {
              warnings.push(`Уже есть оплата за ${MONTHS_RU[m - 1].toLowerCase()} ${y}${replaceExisting ? ', будет заменена' : ''}`)
              if (!replaceExisting) suggested = false
            }
          }
        }
      }

      return {
        key: i,
        line,
        raw,
        date,
        name,
        amount,
        currency,
        rate,
        category,
        accountId,
        programId,
        comment,
        participant,
        candidates,
        errors,
        warnings,
        suggested: suggested && errors.length === 0,
      }
    })
  }, [
    mapping,
    grid,
    headerRow,
    payments,
    ledger,
    expenses,
    defaultCurrency,
    defaultCategory,
    defaultAccount,
    replaceExisting,
    mode,
    accountIndex,
    programIndex,
    participantIndex,
    categoryByNorm,
    participantOverride,
    participants,
    accounts,
  ])

  const isSelected = (r: ParsedRow) => r.errors.length === 0 && (selection.get(r.key) ?? r.suggested)
  const selectedRows = rows.filter(isSelected)
  const errorCount = rows.filter(r => r.errors.length).length
  const issueCount = rows.filter(r => r.errors.length || r.warnings.length).length
  const visibleRows = filter === 'issues' ? rows.filter(r => r.errors.length || r.warnings.length) : rows
  const unmatchedCount = mode === 'payments' ? rows.filter(r => !r.participant && r.name).length : 0
  const sumBy = (cur: string) => selectedRows.filter(r => r.currency === cur).reduce((s, r) => s + (r.amount || 0), 0)
  const totalLabel = [sumBy('USD') > 0 && formatMoney(sumBy('USD')), sumBy('TJS') > 0 && formatMoney(sumBy('TJS'), 'TJS')]
    .filter(Boolean)
    .join(' + ')
  const missingRequired = FIELDS[mode].filter(f => f.required && mapping && mapping[f.field] === NO_COLUMN)
  const running = progress !== null && !outcome

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'
  const participantOptions = React.useMemo(
    () =>
      participants.map(p => ({
        value: p.id,
        label: p.name,
        group: p.program?.name || 'Без программы',
        hint: p.status && p.status !== 'active' ? 'неактивен' : undefined,
      })),
    [participants]
  )

  // ---------- Import -------------------------------------------------------
  const runImport = async () => {
    const queue = selectedRows
    if (!queue.length) return
    setProgress({ done: 0, total: queue.length })
    const report: (string | number)[][] = []
    const headerCells = headerRow >= 0 ? grid[headerRow].map(c => cellText(c)) : headers
    report.push(['Строка', 'Результат', ...headerCells])
    const addReport = (r: ParsedRow, reason: string) => report.push([r.line, reason, ...r.raw.map(c => cellText(c))])

    // Not imported by choice or because of validation errors
    for (const r of rows) {
      if (isSelected(r)) continue
      addReport(r, r.errors.length ? r.errors.join('; ') : r.warnings.length ? `Пропущено: ${r.warnings.join('; ')}` : 'Пропущено вручную')
    }

    let created = 0
    let failed = 0
    for (const r of queue) {
      try {
        const original = roundMoney(r.amount)
        let rate = 1
        if (r.currency === 'TJS') {
          rate = r.rate ?? (await fetchNbtRate(r.date!, 'USD').then(x => x.rate, () => 0))
          if (!(rate > 0)) throw new Error('Нет курса НБТ на эту дату, укажите курс в файле')
        }
        let res: Response
        if (mode === 'expenses') {
          res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: r.name,
              amount: original / rate,
              original_amount: original,
              currency: r.currency,
              exchange_rate: rate,
              category: r.category || 'Прочее',
              expense_date: r.date,
              description: r.comment,
              status: 'approved',
              program_id: r.programId || null,
              account_id: r.accountId,
            }),
          })
        } else {
          const p = r.participant!
          const [y, m] = r.date!.split('-').map(Number)
          res = ledger
            ? await fetch('/api/payments/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  participant_id: p.id,
                  month_number: m,
                  year: y,
                  amount: original,
                  currency: r.currency,
                  exchange_rate: rate,
                  paid_date: r.date,
                  account_id: r.accountId,
                  notes: r.comment || null,
                }),
              })
            : await fetch('/api/monthly-payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              participant_id: p.id,
              program_id: p.program_id,
              plan_amount: p.tariff || p.program?.price_per_month || 0,
              fact_amount: original / rate,
              original_amount: original,
              currency: r.currency,
              exchange_rate: rate,
              month_number: m,
              payment_month: MONTHS_RU[m - 1],
              year: y,
              status: 'paid',
              paid_date: r.date,
              notes: r.comment || null,
              account_id: r.accountId,
            }),
          })
        }
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
        created++
      } catch (err: any) {
        failed++
        addReport(r, `Ошибка: ${err instanceof TypeError ? 'нет связи с сервером' : err.message}`)
      }
      setProgress(pr => (pr ? { ...pr, done: pr.done + 1 } : pr))
    }

    const skipped = rows.length - queue.length
    setOutcome({ created, skipped, failed, report })
    if (created) onSaved()
    const noun = mode === 'expenses' ? (['расход', 'расхода', 'расходов'] as [string, string, string]) : (['платёж', 'платежа', 'платежей'] as [string, string, string])
    if (failed) toast.error(`Импорт завершён с ошибками`, { description: `Создано ${created}, ошибок ${failed}, пропущено ${skipped}` })
    else toast.success(`Импортировано ${created} ${plural(created, noun)}`, { description: skipped ? `Пропущено ${skipped}` : fileName })
  }

  const downloadTemplate = () => {
    if (mode === 'expenses') {
      downloadCsv('шаблон-расходы.csv', [
        ['Дата', 'Название', 'Сумма', 'Валюта', 'Категория', 'Счёт', 'Программа', 'Комментарий'],
        ['05.10.2026', 'Аренда офиса', '1200', 'USD', 'Офис', accounts[0]?.name ?? '', '', ''],
      ])
    } else {
      downloadCsv('шаблон-поступления.csv', [
        ['Дата', 'Участник', 'Сумма', 'Валюта', 'Счёт', 'Комментарий'],
        ['05.10.2026', participants[0]?.name ?? 'Иванов Иван', '300', 'USD', '', 'Перевод на карту'],
      ])
    }
  }

  const title = mode === 'expenses' ? 'Импорт расходов' : 'Импорт поступлений'

  // ---------- Render -------------------------------------------------------
  return (
    <Sheet open={open} onOpenChange={o => !running && onOpenChange(o)}>
      <SheetContent className="sm:max-w-[980px]">
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {mode === 'expenses'
                ? 'Загрузите выписку или таблицу расходов в формате Excel или CSV'
                : 'Загрузите таблицу оплат участников в формате Excel или CSV'}
            </SheetDescription>
          </SheetHeader>

          <SheetBody className="flex flex-col gap-5">
            {outcome ? (
              <ResultView outcome={outcome} mode={mode} fileName={fileName} />
            ) : !mapping ? (
              <>
                <label
                  onDragOver={e => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setDragging(false)
                    openFile(e.dataTransfer.files?.[0])
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center transition-colors',
                    dragging ? 'border-primary bg-primary-soft' : 'hover:border-ring/50 hover:bg-muted/40'
                  )}
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Upload className="size-5" />
                  </span>
                  <span className="font-medium">{reading ? 'Читаем файл…' : 'Перетащите файл сюда или выберите на компьютере'}</span>
                  <span className="text-sm text-muted-foreground">.xlsx или .csv · первая строка с заголовками колонок</span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    className="sr-only"
                    onChange={e => openFile(e.target.files?.[0])}
                  />
                </label>
                <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <p className="font-medium">Какие колонки распознаются</p>
                  <p className="mt-1 text-muted-foreground">
                    {FIELDS[mode].map(f => fieldLabel(mode, f.field) + (f.required ? '*' : '')).join(', ')}. Названия колонок можно
                    поменять на следующем шаге.{' '}
                    {mode === 'payments' && 'Участники ищутся по имени без учёта регистра и порядка слов. '}
                    Суммы в TJS пересчитываются по курсу НБТ на дату операции.
                  </p>
                  <Button type="button" variant="link" size="sm" className="mt-1 h-auto px-0" onClick={downloadTemplate}>
                    <Download /> Скачать шаблон
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate font-medium">{fileName}</span>
                  <span className="text-muted-foreground">
                    · {formatNumber(rows.length)} {plural(rows.length, ['строка', 'строки', 'строк'])}
                  </span>
                  {workbook && workbook.sheetNames.length > 1 && (
                    <Select value={sheetName} onValueChange={v => loadSheet(workbook, v)} disabled={running}>
                      <SelectTrigger size="sm" className="min-w-32" aria-label="Лист">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {workbook.sheetNames.map(n => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={reset} disabled={running}>
                    <RotateCcw /> Другой файл
                  </Button>
                </div>

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Колонки файла</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {FIELDS[mode].map(({ field, required }) => (
                      <Field
                        key={field}
                        label={fieldLabel(mode, field)}
                        required={required}
                        hint={required && mapping[field] === NO_COLUMN && <span className="text-destructive">Выберите колонку</span>}
                      >
                        <Select
                          value={String(mapping[field])}
                          onValueChange={v => setMapping(m => (m ? { ...m, [field]: Number(v) } : m))}
                          disabled={running}
                        >
                          <SelectTrigger size="sm" className="w-full" aria-invalid={(required && mapping[field] === NO_COLUMN) || undefined}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={String(NO_COLUMN)}>
                              <span className="text-muted-foreground">Нет в файле</span>
                            </SelectItem>
                            {headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>
                                {h}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold">Если в строке не указано</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="Счёт">
                      <Select value={defaultAccount} onValueChange={setDefaultAccount} disabled={running}>
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue placeholder="Выберите счёт" />
                        </SelectTrigger>
                        <SelectContent>
                          {mode === 'payments' && <SelectItem value={AUTO_ACCOUNT}>По программе участника</SelectItem>}
                          {accounts.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} <span className="text-muted-foreground">· {a.currency}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {mode === 'expenses' && (
                      <Field label="Категория">
                        <Select value={defaultCategory} onValueChange={setDefaultCategory} disabled={running}>
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map(c => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    <Field label="Валюта">
                      <Segmented
                        aria-label="Валюта по умолчанию"
                        size="sm"
                        value={defaultCurrency}
                        onChange={setDefaultCurrency}
                        options={[
                          { value: 'USD', label: 'USD' },
                          { value: 'TJS', label: 'TJS' },
                        ]}
                        className="w-fit"
                      />
                    </Field>
                  </div>
                  {mode === 'payments' && ledger && (
                    <p className="mt-3 rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
                      Каждая строка добавит отдельное поступление. Если за месяц уже есть оплата, суммы сложатся — заменять ничего не нужно.
                    </p>
                  )}
                  {mode === 'payments' && !ledger && (
                    <label className="mt-3 flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
                      <span>
                        <span className="block text-sm font-medium">Заменять существующие оплаты</span>
                        <span className="block text-xs text-muted-foreground">
                          Если за этот месяц у участника уже есть оплата, запись из файла её заменит
                        </span>
                      </span>
                      <Switch checked={replaceExisting} onCheckedChange={setReplaceExisting} disabled={running} />
                    </label>
                  )}
                </section>

                <section className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">Предпросмотр</h3>
                    <Segmented
                      aria-label="Фильтр строк"
                      size="sm"
                      value={filter}
                      onChange={setFilter}
                      options={[
                        { value: 'all', label: 'Все', count: rows.length },
                        { value: 'issues', label: 'С замечаниями', count: issueCount },
                      ]}
                    />
                    {unmatchedCount > 0 && (
                      <span className="text-xs text-destructive">
                        {unmatchedCount} {plural(unmatchedCount, ['участник не найден', 'участника не найдены', 'участников не найдены'])}
                      </span>
                    )}
                  </div>
                  {missingRequired.length > 0 ? (
                    <div className="flex gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      <p>Укажите, в какой колонке {missingRequired.map(f => `«${fieldLabel(mode, f.field)}»`).join(', ')}.</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-9 pr-0">
                              <Checkbox
                                aria-label="Выбрать все строки без ошибок"
                                disabled={running}
                                checked={
                                  selectedRows.length === 0
                                    ? false
                                    : selectedRows.length === rows.length - errorCount
                                      ? true
                                      : 'indeterminate'
                                }
                                onCheckedChange={v =>
                                  setSelection(new Map(rows.filter(r => !r.errors.length).map(r => [r.key, !!v])))
                                }
                              />
                            </TableHead>
                            <TableHead className="w-12 max-sm:hidden">Стр.</TableHead>
                            <TableHead className="w-24">Дата</TableHead>
                            <TableHead>{mode === 'payments' ? 'Участник' : 'Название'}</TableHead>
                            <TableHead className="text-right max-sm:hidden">Сумма</TableHead>
                            {mode === 'expenses' && <TableHead className="max-md:hidden">Категория</TableHead>}
                            <TableHead className="max-lg:hidden">Счёт</TableHead>
                            <TableHead className="max-sm:hidden">Проверка</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleRows.slice(0, PREVIEW_LIMIT).map(r => (
                            <PreviewRow
                              key={r.key}
                              row={r}
                              mode={mode}
                              selected={isSelected(r)}
                              disabled={running}
                              onSelect={v => setSelection(s => new Map(s).set(r.key, v))}
                              accountName={accountName(r.accountId)}
                              participantOptions={participantOptions}
                              onPickParticipant={id => setParticipantOverride(m => new Map(m).set(r.key, id))}
                            />
                          ))}
                        </TableBody>
                      </Table>
                      {visibleRows.length > PREVIEW_LIMIT && (
                        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                          Показаны первые {PREVIEW_LIMIT} строк из {formatNumber(visibleRows.length)}. Импортируются все выбранные.
                        </p>
                      )}
                      {visibleRows.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Замечаний нет</p>}
                    </div>
                  )}
                </section>
              </>
            )}
          </SheetBody>

          <SheetFooter className="flex-wrap">
            {outcome ? (
              <>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Готово
                </Button>
                {outcome.report.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => downloadCsv(`отчёт-импорта-${fileName.replace(/\.[^.]+$/, '')}.csv`, outcome.report)}
                  >
                    <Download /> Отчёт о пропущенных строках
                  </Button>
                )}
              </>
            ) : progress ? (
              <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
                <span className="num shrink-0 text-muted-foreground">
                  {progress.done} из {progress.total}
                </span>
              </div>
            ) : (
              <>
                <Button type="button" disabled={!mapping || missingRequired.length > 0 || selectedRows.length === 0} onClick={runImport}>
                  {selectedRows.length
                    ? `Импортировать ${formatNumber(selectedRows.length)} ${plural(selectedRows.length, mode === 'expenses' ? ['расход', 'расхода', 'расходов'] : ['платёж', 'платежа', 'платежей'])}`
                    : 'Импортировать'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Отмена
                </Button>
                {mapping && totalLabel && <span className="num ml-auto text-sm font-medium">{totalLabel}</span>}
              </>
            )}
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function PreviewRow({
  row: r,
  mode,
  selected,
  disabled,
  onSelect,
  accountName,
  participantOptions,
  onPickParticipant,
}: {
  row: ParsedRow
  mode: ImportMode
  selected: boolean
  disabled: boolean
  onSelect: (v: boolean) => void
  accountName: string
  participantOptions: { value: string; label: string; group?: string; hint?: string }[]
  onPickParticipant: (id: string) => void
}) {
  const hasErrors = r.errors.length > 0
  const status = hasErrors ? (
    <span className="flex items-start gap-1.5 text-destructive">
      <XCircle className="mt-0.5 size-3.5 shrink-0" /> {r.errors.join('; ')}
    </span>
  ) : r.warnings.length ? (
    <span className="flex items-start gap-1.5 text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {r.warnings.join('; ')}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <CheckCircle2 className="size-3.5 shrink-0 text-success" /> Готово
    </span>
  )
  const needsPick = mode === 'payments' && !!r.name && (!r.participant || r.candidates.length > 0)

  return (
    <TableRow className={cn(hasErrors && 'bg-destructive-soft/40 hover:bg-destructive-soft/60', !selected && !hasErrors && 'text-muted-foreground')}>
      <TableCell className="pr-0 align-top">
        <Checkbox checked={selected} disabled={disabled || hasErrors} onCheckedChange={v => onSelect(!!v)} aria-label={`Строка ${r.line}`} />
      </TableCell>
      <TableCell className="num align-top text-muted-foreground max-sm:hidden">{r.line}</TableCell>
      <TableCell className="num align-top">{r.date ? formatDate(r.date) : <span className="text-destructive">—</span>}</TableCell>
      <TableCell className="max-w-72 align-top whitespace-normal">
        {mode === 'payments' ? (
          <div className="flex flex-col gap-1">
            {r.participant && !needsPick ? (
              <span className="font-medium">{r.participant.name}</span>
            ) : (
              <span className="text-destructive">{r.name || '—'}</span>
            )}
            {r.participant && r.participant.name !== r.name && !needsPick && <span className="text-xs text-muted-foreground">в файле: {r.name}</span>}
            {(needsPick || (!r.participant && r.name)) && (
              <Combobox
                size="sm"
                value={r.participant?.id ?? ''}
                onChange={onPickParticipant}
                options={
                  r.candidates.length
                    ? [
                        ...r.candidates.map(c => ({ value: c.id, label: c.name, group: 'Похожие' })),
                        ...participantOptions.filter(o => !r.candidates.some(c => c.id === o.value)),
                      ]
                    : participantOptions
                }
                placeholder="Выберите участника"
                searchPlaceholder="Имя участника…"
                className="max-w-64"
              />
            )}
          </div>
        ) : (
          <>
            <div className="truncate font-medium">{r.name || <span className="text-destructive">—</span>}</div>
            {r.comment && <div className="truncate text-xs text-muted-foreground">{r.comment}</div>}
          </>
        )}
        <div className="num mt-1 text-sm font-medium sm:hidden">{r.amount ? formatMoney(r.amount, r.currency) : '—'}</div>
        <div className="mt-1 text-xs sm:hidden">{status}</div>
      </TableCell>
      <TableCell className="num text-right align-top font-medium whitespace-nowrap max-sm:hidden">
        {r.amount ? formatMoney(r.amount, r.currency) : <span className="text-destructive">—</span>}
        {r.rate && <div className="text-xs font-normal text-muted-foreground">курс {r.rate}</div>}
      </TableCell>
      {mode === 'expenses' && <TableCell className="align-top text-muted-foreground max-md:hidden">{r.category}</TableCell>}
      <TableCell className="align-top text-muted-foreground max-lg:hidden">{r.accountId ? accountName : '—'}</TableCell>
      <TableCell className="max-w-64 align-top text-xs whitespace-normal max-sm:hidden">{status}</TableCell>
    </TableRow>
  )
}

function ResultView({ outcome, mode, fileName }: { outcome: Outcome; mode: ImportMode; fileName: string }) {
  const items = [
    { label: 'Создано', value: outcome.created, tone: 'text-success' },
    { label: 'Пропущено', value: outcome.skipped, tone: 'text-foreground' },
    { label: 'Ошибок', value: outcome.failed, tone: outcome.failed ? 'text-destructive' : 'text-foreground' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-11 items-center justify-center rounded-xl',
            outcome.failed ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'
          )}
        >
          {outcome.failed ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
        </span>
        <div>
          <p className="font-medium">{outcome.failed ? 'Импорт завершён с ошибками' : 'Импорт завершён'}</p>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x rounded-lg border">
        {items.map(i => (
          <div key={i.label} className="px-4 py-3">
            <p className="text-sm text-muted-foreground">{i.label}</p>
            <p className={cn('num mt-0.5 text-2xl font-semibold tracking-tight', i.tone)}>{formatNumber(i.value)}</p>
          </div>
        ))}
      </div>
      {outcome.report.length > 1 ? (
        <p className="text-sm text-muted-foreground">
          В отчёте — все пропущенные и неудачные строки с причиной и исходными данными. Исправьте их в файле и загрузите только эти
          строки ещё раз.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Все строки файла загружены. {mode === 'expenses' ? 'Расходы' : 'Поступления'} уже в списке.
        </p>
      )}
    </div>
  )
}
