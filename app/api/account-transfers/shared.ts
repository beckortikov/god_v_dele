import { NextResponse } from 'next/server'

export const TRANSFERS_TABLE = 'account_transfers'

/** True when Postgres/PostgREST says the table does not exist (migration 012 not applied). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message || '').toLowerCase()
  return msg.includes(TRANSFERS_TABLE) && (msg.includes('does not exist') || msg.includes('could not find the table'))
}

export function migrationRequired() {
  return NextResponse.json(
    {
      error: 'migration_required',
      message: 'Таблица переводов ещё не создана. Примените миграцию migrations/012_account_transfers.sql в Supabase (SQL Editor).',
    },
    { status: 503 }
  )
}
