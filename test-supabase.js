require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing env vars", process.env.NEXT_PUBLIC_SUPABASE_URL);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    const { data, error } = await supabase.from('life_wheel_entries').select('*').limit(1);
    console.log("Data:", data, "Error:", error);
  } catch(e) {
    console.log("Caught error:", e);
  }
}
test();
