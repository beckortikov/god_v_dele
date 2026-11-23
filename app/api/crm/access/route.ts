import { NextResponse } from 'next/server'
import { crmAllowed } from '@/lib/crm-access'
import { sessionOf } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/** GET → { access }: whether the menu shows the CRM to the caller. */
export async function GET(req: Request) {
  try {
    return NextResponse.json({ access: await crmAllowed(sessionOf(req)) })
  } catch (e) {
    console.error('[crm access]', e)
    return NextResponse.json({ access: false })
  }
}
