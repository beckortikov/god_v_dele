import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { isMissingTableError } from './_server'

const ACTIONS = new Set(['create', 'update', 'delete', 'restore'])
const MAX_PAGE_SIZE = 200

/** "2026-10-06" → start of that day (UTC); full ISO timestamps pass through. */
function toTimestamp(v: string | null, endOfDay = false): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00Z`)
    if (endOfDay) d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString()
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * GET /api/audit — журнал изменений.
 *
 * Filters: table, action, actor (actor_id, or "none" for entries without a user),
 * record_id, from, to (ISO timestamp or YYYY-MM-DD; `to` is exclusive for
 * timestamps and inclusive for dates), q (search in summary), trash=1 (deletions
 * not yet restored). Pagination: page (1-based), pageSize (≤ 200).
 * `facet=actors` returns the distinct users found in the журнал instead.
 *
 * Returns { data, total } or { error: 'migration_required' } with 503.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    if (searchParams.get('facet') === 'actors') {
      const { data, error } = await supabaseAdmin
        .from('audit_log')
        .select('actor_id, actor_name')
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) {
        if (isMissingTableError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 503 })
        throw error
      }
      const seen = new Map<string, { id: string; name: string }>()
      for (const r of data ?? []) {
        if (!r.actor_id || seen.has(r.actor_id)) continue
        seen.set(r.actor_id, { id: r.actor_id, name: r.actor_name || r.actor_id })
      }
      const actors = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      return NextResponse.json({ data: actors, total: actors.length })
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50))

    let query = supabaseAdmin.from('audit_log').select('*', { count: 'exact' })

    const table = searchParams.get('table')
    if (table) query = query.eq('table_name', table)

    if (searchParams.get('trash') === '1') {
      query = query.eq('action', 'delete').is('restored_at', null)
    } else {
      const action = searchParams.get('action')
      if (action && ACTIONS.has(action)) query = query.eq('action', action)
    }

    const actor = searchParams.get('actor')
    if (actor === 'none') query = query.is('actor_id', null)
    else if (actor) query = query.eq('actor_id', actor)

    const recordId = searchParams.get('record_id')
    if (recordId) query = query.eq('record_id', recordId)

    const from = toTimestamp(searchParams.get('from'))
    if (from) query = query.gte('created_at', from)
    const to = toTimestamp(searchParams.get('to'), true)
    if (to) query = query.lt('created_at', to)

    const q = searchParams.get('q')?.trim()
    if (q) query = query.ilike('summary', `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`)

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (error) {
      if (isMissingTableError(error)) return NextResponse.json({ error: 'migration_required' }, { status: 503 })
      // Page past the end (e.g. after filters changed): an empty page, not an error
      if (error.code === 'PGRST103') return NextResponse.json({ data: [], total: count ?? 0 })
      throw error
    }

    return NextResponse.json({ data: data ?? [], total: count ?? 0 })
  } catch (error: any) {
    console.error('Error fetching audit log:', error)
    return NextResponse.json({ error: error.message || 'Не удалось загрузить журнал' }, { status: 500 })
  }
}
