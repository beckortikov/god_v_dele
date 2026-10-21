import { NextResponse } from 'next/server'
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase-client'

/** The answer to a successful sign-in, however it was proved (password or Telegram): the user for the interface and the session cookie. */
export async function signedInResponse(user: any) {
    let position = null
    let employeeName = null
    if (user.employee_id) {
        const { data: employeeData } = await supabaseAdmin
            .from('employees')
            .select('position, first_name, last_name')
            .eq('id', user.employee_id)
            .single()
        if (employeeData) {
            position = employeeData.position
            employeeName = `${employeeData.first_name} ${employeeData.last_name}`
        }
    }

    // Awaited on purpose: an edge function may stop right after the response
    await supabaseAdmin
        .from('app_users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id)

    const response = NextResponse.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            role: user.role,
            full_name: user.full_name,
            employee_id: user.employee_id,
            employee_name: employeeName,
            position,
            participant_id: user.participant_id,
        },
    })
    response.cookies.set(SESSION_COOKIE, createSessionToken({ ...user, full_name: user.full_name || user.username }), sessionCookieOptions)
    return response
}
