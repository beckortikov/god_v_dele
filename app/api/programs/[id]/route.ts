import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'
import { fetchRow, logAudit } from '@/lib/audit'
import { fetchRowsWhere, logDeletedRows } from '@/app/api/audit/_server'

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        if (!id) {
            return NextResponse.json({ error: 'Missing program ID' }, { status: 400 })
        }

        const before = await fetchRow('programs', id)
        // Program accounts are removed by ON DELETE CASCADE — keep them in the корзина too
        const accounts = before ? await fetchRowsWhere('accounts', 'program_id', id) : []

        const { error } = await supabaseAdmin
            .from('programs')
            .delete()
            .eq('id', id)

        if (error) throw error

        if (before) {
            await logAudit(request, {
                table: 'programs',
                recordId: id,
                action: 'delete',
                summary: `Программа «${before.name}»`,
                before,
            })
            await logDeletedRows(request, 'accounts', accounts, a => `Счёт «${a.name}» (вместе с программой «${before.name}»)`)
        }

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting program:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
