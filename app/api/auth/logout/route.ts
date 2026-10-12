import { NextResponse } from 'next/server'
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

/** POST: ends the session by clearing the cookie. Works without a session too. */
export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return response
}
