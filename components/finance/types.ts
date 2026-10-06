export interface IncomeItem {
  id: string
  date: string
  participantId: string
  participant: string
  programId: string | null
  programName: string | null
  amount: number
  status: 'paid' | 'partial' | 'overdue' | 'pending'
  currency?: string
  original_amount?: number
  notes?: string
  account_id?: string
  month: number
  year: number
  /** Ledger mode: this item is one receipt (payment_transactions), not a whole month. */
  receipt?: boolean
}

export interface ExpenseItem {
  id: string
  date: string
  category: string
  amount: number
  description?: string
  name: string
  currency?: string
  original_amount?: number
  program_id?: string
  program_name?: string
  account_id?: string
  exchange_rate?: number
  employee_id?: string
  /** Set for expenses that belong to an offline event. */
  event_id?: string
}

export interface Participant {
  id: string
  name: string
  program_id: string
  tariff?: number
  status?: string
  program?: { name: string; price_per_month: number }
}

export interface Program {
  id: string
  name: string
}

export interface Account {
  id: string
  name: string
  currency: string
  program_id: string | null
  program?: { name: string } | null
  is_default: boolean
  initial_balance?: number
  balance?: number
}

export interface Employee {
  id: string
  first_name: string
  last_name: string
  position?: string
  status?: string
}

export const DEFAULT_RATE = '10.5'

/** Accounts usable for a given program: its own plus global ones. */
export function accountsFor(accounts: Account[], programId?: string | null) {
  return accounts.filter(a => !programId || !a.program_id || a.program_id === programId)
}

/** Picks the most likely account: remembered → default → only option. */
export function pickAccount(options: Account[], rememberedId?: string | null) {
  if (rememberedId && options.some(a => a.id === rememberedId)) return rememberedId
  const def = options.find(a => a.is_default)
  if (def) return def.id
  return options.length === 1 ? options[0].id : ''
}

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}
