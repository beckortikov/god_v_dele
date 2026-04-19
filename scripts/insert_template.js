const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'
    const { error } = await supabase.from('participants').upsert(
        { id: TEMPLATE_ID, name: 'Шаблон по умолчанию', status: 'active' }
    )
    if (error) { console.error('Error:', error) }
    else { console.log('Template inserted') }
}
run()
