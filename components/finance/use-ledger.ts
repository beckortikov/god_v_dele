'use client'

import * as React from 'react'
import type { ScheduleRow } from '@/lib/payment-schedule'

/**
 * Whether partial payments (migration 014, the payments ledger) are on.
 * Asked once per page load and shared by every component; `null` while
 * unknown. A failed check counts as «off», the old behaviour.
 */
export interface LedgerState {
  enabled: boolean | null
  /** Dev-only read-only preview (cookie pp-ledger-mock=1). */
  preview: boolean
}

let cached: Promise<LedgerState> | null = null
let cachedAt = 0

export function fetchLedgerState(force = false): Promise<LedgerState> {
  // «Off» is re-checked after a minute, so the app notices the migration
  if (!cached || force || Date.now() - cachedAt > 60_000) {
    cachedAt = Date.now()
    cached = fetch('/api/payments/ledger')
      .then(r => r.json())
      .then(j => ({ enabled: !!j?.enabled, preview: !!j?.preview }))
      .catch(() => ({ enabled: false, preview: false }))
    cached.then(s => {
      // Keep a positive answer for the page lifetime
      if (s.enabled) cachedAt = Number.POSITIVE_INFINITY
    })
  }
  return cached
}

export function useLedger(): LedgerState {
  const [state, setState] = React.useState<LedgerState>({ enabled: null, preview: false })
  React.useEffect(() => {
    let alive = true
    fetchLedgerState().then(s => alive && setState(s))
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** One receipt as returned by GET /api/payments/transactions. */
export interface Receipt {
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
  month_number: number
  year: number
  date: string
  monthly?: { plan_amount: number | null; fact_amount: number | null; status: string | null } | null
  participant?: { name: string | null; program_id: string | null; program?: { name: string | null } | null } | null
  account?: { name: string | null; currency: string | null } | null
}

/** A monthly row as returned by GET /api/monthly-payments. */
export interface MonthRow extends ScheduleRow {
  id: string
  participant_id: string
  paid_date?: string | null
  notes?: string | null
  currency?: string | null
  original_amount?: number | null
  account_id?: string | null
}

async function getJSON(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { signal })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.error) throw new Error(json?.error || `Ошибка ${res.status}`)
  return json
}

/**
 * A participant's monthly rows and, with the ledger on, their receipts.
 * `reload()` refetches (after a payment is added or removed).
 */
export function useParticipantPayments(participantId: string | null | undefined, enabled = true) {
  const [state, setState] = React.useState<{
    loading: boolean
    error: string | null
    ledger: boolean
    preview: boolean
    rows: MonthRow[]
    receipts: Receipt[]
    forId: string | null
  }>({ loading: false, error: null, ledger: false, preview: false, rows: [], receipts: [], forId: null })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!participantId || !enabled) return
    const ctrl = new AbortController()
    setState(s => ({ ...s, loading: true, error: null, ...(s.forId !== participantId ? { rows: [], receipts: [] } : null) }))
    const id = encodeURIComponent(participantId)
    Promise.all([
      getJSON(`/api/monthly-payments?participant_id=${id}`, ctrl.signal),
      getJSON(`/api/payments/transactions?participant_id=${id}`, ctrl.signal).catch(() => ({ ledger: false, data: [] })),
    ])
      .then(([rows, tx]) =>
        setState({
          loading: false,
          error: null,
          ledger: !!tx.ledger,
          preview: !!tx.preview,
          rows: (rows.data ?? []).filter((r: MonthRow) => r.participant_id === participantId),
          receipts: tx.data ?? [],
          forId: participantId,
        })
      )
      .catch(err => {
        if (err?.name === 'AbortError') return
        setState(s => ({ ...s, loading: false, error: err.message || 'Не удалось загрузить оплаты' }))
      })
    return () => ctrl.abort()
  }, [participantId, enabled, attempt])

  const reload = React.useCallback(() => setAttempt(a => a + 1), [])
  const current = state.forId === participantId
  return { ...state, rows: current ? state.rows : [], receipts: current ? state.receipts : [], reload }
}
