require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: m, error: me } = await supabase.from('monthly_payments').select('*').limit(1);
  console.log("monthly_payments columns:", m ? Object.keys(m[0] || {}) : me);
  
  const { data: e, error: ee } = await supabase.from('expenses').select('*').limit(1);
  console.log("expenses columns:", e ? Object.keys(e[0] || {}) : ee);
  
  const { data: a, error: ae } = await supabase.from('accounts').select('*').limit(1);
  console.log("accounts table?", a ? "YES" : ae);
}
run();
