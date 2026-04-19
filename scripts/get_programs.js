const { createClient } = require('@supabase/supabase-js')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data: p } = await supabase.from('programs').select('id').limit(1)
    const prog_id = p[0] ? p[0].id : null;
    const TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'
    const { error } = await supabase.from('participants').upsert(
        { id: TEMPLATE_ID, name: 'Шаблон по умолчанию', status: 'active', program_id: prog_id, start_date: new Date().toISOString().split('T')[0] }
    )
    if (error) console.error('insert err:', error)
    else console.log('Template inserted successfully')
}
run()
