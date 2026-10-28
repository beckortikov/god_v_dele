import { createClient } from '@supabase/supabase-js'
import { createPostgresClient, type QueryBuilder } from '@/lib/db-postgres'

/**
 * Server-side data access. Only for API routes and server code, never for client components.
 *
 * With DATABASE_URL set, tables go straight to Postgres (lib/db-postgres.ts); otherwise to Supabase
 * as before. Both answer the same query builder calls, so switching is an environment change:
 *
 *   const { data, error } = await db.from('participants').select('id, name').eq('status', 'active')
 *
 * Files stay on Supabase Storage until FILES_URL points at the file service on the server.
 */

export type { DbError, DbResult, DbRow } from '@/lib/db-postgres'

type SupabaseClient = ReturnType<typeof createClient>
type Storage = SupabaseClient['storage']

export interface Db {
  from(table: string): QueryBuilder
  storage: Storage
}

let supabase: SupabaseClient | null = null

function supabaseClient(): SupabaseClient {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing DATABASE_URL or Supabase environment variables')
    supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  return supabase
}

const postgres = process.env.DATABASE_URL ? createPostgresClient() : null

export const db: Db = {
  from: table => (postgres ? postgres.from(table) : (supabaseClient().from(table) as unknown as QueryBuilder)),
  get storage() {
    return supabaseClient().storage
  },
}
