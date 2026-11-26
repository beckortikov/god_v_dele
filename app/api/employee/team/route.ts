import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** Active colleagues a task can be given to: names and positions only. */
export async function GET() {
  const { data, error } = await db
    .from('employees')
    .select('id, first_name, last_name, position, status')
    .order('first_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(((data ?? []) as { status?: string | null }[]).filter(e => e.status !== 'terminated'))
}
