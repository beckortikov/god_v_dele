require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data: payments, error } = await supabase
      .from('monthly_payments')
      .select('*, participant:participants(name)')
      .gte('paid_date', '2026-05-20');

    if (error) throw error;

    console.log("--- Анализ платежей за последние 3 дня ---");
    payments.forEach(p => {
      console.log(`Студент: ${p.participant ? p.participant.name : 'Unknown'}`);
      console.log(`  Сумма: ${p.fact_amount} USD (${p.original_amount} ${p.currency})`);
      console.log(`  Счет (account_id): ${p.account_id}`);
      console.log(`  Дата оплаты (paid_date): ${p.paid_date}`);
      console.log(`  Отчетный Месяц (month_number): ${p.month_number}`);
      console.log(`  Отчетный Год (year): ${p.year}`);
      console.log(`  Создан (created_at): ${p.created_at}`);
      console.log("-----------------------------------------");
    });

  } catch(e) {
    console.error(e);
  }
}
check();
