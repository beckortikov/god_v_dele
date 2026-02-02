import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-client'

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        if (!id) {
            return NextResponse.json({ error: 'Missing program ID' }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from('programs')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true }, { status: 200 })
    } catch (error: any) {
        console.error('Error deleting program:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
