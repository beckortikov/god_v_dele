/**
 * Server-only: the payments ledger (migration 014, table payment_transactions).
 *
 * Production deploys before the owner applies the migration, so every API
 * must keep its old behaviour until the table exists. `ledgerEnabled()` checks
 * that once and caches the answer: `true` for the life of the process (the
 * table is never dropped in normal operation), `false` for 60 seconds so the
 * app notices the migration without a restart.
 *
 * Pure helpers (status, remainder, schedule) live in lib/payment-schedule.ts.
 *
 * DEV PREVIEW (never active in production): with PAYMENTS_LEDGER_MOCK=1 in the
 * environment, or the cookie `pp-ledger-mock=1`, the ledger counts as enabled
 * and reads are served from receipts synthesised from monthly_payments (one
 * per paid row; some rows are split in two to show partial receipts, unless
 * the cookie is `pp-ledger-mock=flat`). Writes
 * to the ledger are refused in this mode. Used only to preview the ledger UI
 * before the migration exists.
 */
import { supabaseAdmin } from '@/lib/supabase-client'
import { receiptDate, toCents } from '@/lib/payment-schedule'

export const LEDGER_TABLE = 'payment_transactions'

const FALSE_TTL_MS = 60_000
let cache: { enabled: boolean; at: number } | null = null

/** True when Postgres/PostgREST says the ledger table does not exist (migration 014 not applied). */
export function isMissingLedger(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes(LEDGER_TABLE) && (msg.includes('does not exist') || msg.includes('could not find the table'))
}

/** Dev-only preview of the ledger UI (see the header comment). */
export function ledgerMock(req?: Request | null): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (process.env.PAYMENTS_LEDGER_MOCK === '1') return true
  const cookie = req?.headers.get('cookie') || ''
  return /(?:^|;\s*)pp-ledger-mock=(?:1|flat)(?:;|$)/.test(cookie)
}

/** Dev preview without split receipts (`pp-ledger-mock=flat`): one receipt per paid month, for report comparisons. */
const mockFlat = (req?: Request | null) => /(?:^|;\s*)pp-ledger-mock=flat(?:;|$)/.test(req?.headers.get('cookie') || '')

/**
 * Whether the ledger table exists. Throws on unexpected database errors, so a
 * network blip never silently switches a write to the old overwrite behaviour.
 */
export async function ledgerEnabled(req?: Request | null): Promise<boolean> {
  if (ledgerMock(req)) return true
  const now = Date.now()
  if (cache && (cache.enabled || now - cache.at < FALSE_TTL_MS)) return cache.enabled
  const { error } = await supabaseAdmin.from(LEDGER_TABLE).select('id').limit(1)
  if (error && !isMissingLedger(error)) throw error
  cache = { enabled: !error, at: now }
  return cache.enabled
}

/** For tests. */
export function resetLedgerCache() {
  cache = null
}

/** Response for a ledger write while the migration is missing (or in the dev preview). */
export function ledgerUnavailable(mock: boolean) {
  return {
    error: mock
      ? 'Режим предпросмотра: запись поступлений отключена'
      : 'Частичные оплаты ещё не включены. Примените миграцию migrations/014_payment_transactions.sql в Supabase (SQL Editor).',
    code: mock ? 'ledger_preview' : 'migration_required',
  }
}

// ---------------------------------------------------------------------------
// Reading receipts

export interface LedgerTx {
  id: string
  created_at: string
  monthly_payment_id: string
  participant_id: string
  program_id: string | null
  amount_usd: number
  original_amount: number | null
  currency: string
  exchange_rate: number | null
  paid_date: string | null
  account_id: string | null
  notes: string | null
  created_by: string | null
  /** Billed month of the parent row. */
  month_number: number
  year: number
  /** Date the receipt counts in cash reports: paid_date, else the 1st of the billed month. */
  date: string
  /** Parent monthly row (plan, fact after all receipts, stored status). */
  monthly?: { plan_amount: number | null; fact_amount: number | null; status: string | null } | null
  participant?: { name: string | null; program_id: string | null; program?: { name: string | null } | null } | null
  account?: { name: string | null; currency: string | null } | null
}

export interface TxFilter {
  participantId?: string | null
  monthlyPaymentId?: string | null
  accountId?: string | null
  /** Inclusive bounds on the receipt date (`date`, see LedgerTx). */
  from?: string | null
  to?: string | null
  /** Current program of the participant (as the reports filter). */
  programId?: string | null
  /** Embed participant name/program and account name. */
  details?: boolean
  /** Newest first by creation and cap the result (e.g. «recent payments»). */
  recent?: number
}

const PAGE = 1000 // PostgREST max rows per request
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))
const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

function normalize(raw: any): LedgerTx {
  const monthly = one<any>(raw.monthly)
  const month = Number(monthly?.month_number ?? raw.month_number) || 1
  const year = Number(monthly?.year ?? raw.year) || 1970
  const participant = one<any>(raw.participant)
  return {
    id: raw.id,
    created_at: raw.created_at,
    monthly_payment_id: raw.monthly_payment_id,
    participant_id: raw.participant_id,
    program_id: raw.program_id ?? null,
    amount_usd: Number(raw.amount_usd) || 0,
    original_amount: num(raw.original_amount),
    currency: raw.currency || 'USD',
    exchange_rate: num(raw.exchange_rate),
    paid_date: raw.paid_date ?? null,
    account_id: raw.account_id ?? null,
    notes: raw.notes ?? null,
    created_by: raw.created_by ?? null,
    month_number: month,
    year,
    date: receiptDate(raw.paid_date, month, year),
    monthly: monthly
      ? { plan_amount: num(monthly.plan_amount), fact_amount: num(monthly.fact_amount), status: monthly.status ?? null }
      : null,
    participant: participant
      ? { name: participant.name ?? null, program_id: participant.program_id ?? null, program: one<any>(participant.program) }
      : null,
    account: one<any>(raw.account),
  }
}

function applyMemoryFilters(rows: LedgerTx[], f: TxFilter) {
  return rows.filter(
    t =>
      (!f.from || t.date >= f.from) &&
      (!f.to || t.date <= f.to) &&
      (!f.programId || f.programId === 'all' || t.participant?.program_id === f.programId)
  )
}

/** Newest receipt first: date, then creation time. */
export const byNewest = (a: LedgerTx, b: LedgerTx) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0

/**
 * Receipts matching the filter. Reads every page (never silently capped).
 * `from`/`to` and `programId` are applied in memory because a receipt without
 * paid_date counts on the 1st of its billed month.
 */
export async function loadTransactions(req: Request | null, f: TxFilter = {}): Promise<LedgerTx[]> {
  if (ledgerMock(req)) return mockTransactions(f, mockFlat(req))

  const needParticipant = f.details || (f.programId && f.programId !== 'all')
  const cols = [
    '*',
    'monthly:monthly_payments(month_number, year, plan_amount, fact_amount, status)',
    needParticipant ? 'participant:participants(name, program_id, program:programs(name))' : '',
    f.details ? 'account:accounts(name, currency)' : '',
  ]
    .filter(Boolean)
    .join(', ')

  const build = () => {
    let q = supabaseAdmin.from(LEDGER_TABLE).select(cols)
    if (f.participantId) q = q.eq('participant_id', f.participantId)
    if (f.monthlyPaymentId) q = q.eq('monthly_payment_id', f.monthlyPaymentId)
    if (f.accountId) q = q.eq('account_id', f.accountId)
    // Receipts without a date are kept here and filtered by their billed month below
    const range = [f.from && `paid_date.gte.${f.from}`, f.to && `paid_date.lte.${f.to}`].filter(Boolean)
    if (range.length === 1) q = q.or(`${range[0]},paid_date.is.null`)
    if (range.length === 2) q = q.or(`and(${range.join(',')}),paid_date.is.null`)
    return f.recent ? q.order('created_at', { ascending: false }) : q.order('paid_date', { ascending: true, nullsFirst: true }).order('created_at').order('id')
  }

  const out: LedgerTx[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    const page = applyMemoryFilters((data || []).map(normalize), f)
    out.push(...page)
    if (f.recent && out.length >= f.recent) return out.slice(0, f.recent)
    if (!data || data.length < PAGE) return out
  }
}

/** Dev preview: receipts synthesised from monthly_payments, read-only. */
async function mockTransactions(f: TxFilter, flat: boolean): Promise<LedgerTx[]> {
  let q = supabaseAdmin
    .from('monthly_payments')
    .select(
      'id, participant_id, program_id, month_number, year, plan_amount, fact_amount, status, original_amount, currency, exchange_rate, paid_date, account_id, notes, updated_at, created_at, participant:participants(name, program_id, program:programs(name)), account:accounts(name, currency)'
    )
    .gt('fact_amount', 0)
  if (f.participantId) q = q.eq('participant_id', f.participantId)
  if (f.monthlyPaymentId) q = q.eq('id', f.monthlyPaymentId)
  if (f.accountId) q = q.eq('account_id', f.accountId)
  const { data, error } = await q
  if (error) throw error

  const rows: LedgerTx[] = []
  for (const mp of (data || []) as any[]) {
    const base = {
      monthly_payment_id: mp.id,
      participant_id: mp.participant_id,
      program_id: mp.program_id,
      currency: mp.currency || 'USD',
      exchange_rate: mp.exchange_rate,
      account_id: mp.account_id,
      created_by: 'preview',
      monthly: { month_number: mp.month_number, year: mp.year, plan_amount: mp.plan_amount, fact_amount: mp.fact_amount, status: mp.status },
      participant: mp.participant,
      account: mp.account,
    }
    const created = mp.updated_at || mp.created_at || new Date().toISOString()
    // Split some rows in two receipts so the preview shows partial payments; totals stay the same
    const split = !flat && parseInt(String(mp.id).slice(-1), 16) % 3 === 0 && toCents(mp.fact_amount) >= 2
    if (split) {
      const usdCents = toCents(mp.fact_amount)
      const firstUsd = Math.round(usdCents * 0.4) / 100
      const orig = mp.original_amount != null ? Number(mp.original_amount) : null
      const firstOrig = orig != null ? Math.round(orig * 40) / 100 : null
      const earlier = mp.paid_date ? shiftDays(mp.paid_date, -12) : null
      rows.push(
        normalize({ ...base, id: `preview-${mp.id}-1`, created_at: created, amount_usd: firstUsd, original_amount: firstOrig, paid_date: earlier, notes: 'Первая часть' }),
        normalize({
          ...base,
          id: `preview-${mp.id}-2`,
          created_at: created,
          amount_usd: (usdCents - Math.round(firstUsd * 100)) / 100,
          original_amount: orig != null && firstOrig != null ? Math.round((orig - firstOrig) * 100) / 100 : null,
          paid_date: mp.paid_date,
          notes: mp.notes,
        })
      )
    } else {
      rows.push(normalize({ ...base, id: `preview-${mp.id}`, created_at: created, amount_usd: mp.fact_amount, original_amount: mp.original_amount, paid_date: mp.paid_date, notes: mp.notes }))
    }
  }
  const filtered = applyMemoryFilters(rows, f)
  if (f.recent) return filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, f.recent)
  return filtered.sort((a, b) => -byNewest(a, b))
}

function shiftDays(date: string, days: number) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}
