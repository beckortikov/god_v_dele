require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing env vars. URL:", supabaseUrl, "Key length:", supabaseKey ? supabaseKey.length : 0);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    console.log("--- Счета (Accounts) ---");
    const { data: accounts, error: accError } = await supabase.from('accounts').select('*');
    if (accError) throw accError;
    accounts.forEach(a => {
      console.log(`ID: ${a.id} | Name: ${a.name} | Currency: ${a.currency} | Initial Balance: ${a.initial_balance}`);
    });

    console.log("\n--- Последние платежи (monthly_payments) за последние 3 дня ---");
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const startDateStr = threeDaysAgo.toISOString().split('T')[0];

    const { data: payments, error: payError } = await supabase
      .from('monthly_payments')
      .select('*, participant:participants(name), account:accounts(name, currency)')
      .gte('paid_date', startDateStr);
    
    if (payError) throw payError;

    if (payments.length === 0) {
      console.log("Платежей за последние 3 дня не обнаружено.");
    } else {
      payments.forEach(p => {
        console.log(`ID: ${p.id}`);
        console.log(`  Студент: ${p.participant ? p.participant.name : 'Unknown'}`);
        console.log(`  Планировалось: ${p.amount} | Фактически оплачено фактом: ${p.fact_amount}`);
        console.log(`  Оригинальная сумма (original_amount): ${p.original_amount} ${p.currency}`);
        console.log(`  Валюта платежа: ${p.currency}`);
        console.log(`  Курс обмена: ${p.exchange_rate}`);
        console.log(`  Счет: ${p.account ? p.account.name : 'Не указан'} (${p.account_id})`);
        console.log(`  Дата оплаты: ${p.paid_date}`);
        console.log(`  Статус: ${p.status}`);
        console.log(`  Создано в БД: ${p.created_at}`);
        console.log("-----------------------------------------");
      });
    }

    console.log("\n--- Все платежи (monthly_payments) с суммой прихода больше 0 за май 2026 ---");
    const { data: allMayPayments, error: allMayError } = await supabase
      .from('monthly_payments')
      .select('*, participant:participants(name), account:accounts(name, currency)')
      .eq('year', 2026)
      .eq('month_number', 5);
    
    if (allMayError) throw allMayError;
    
    allMayPayments.forEach(p => {
      if (p.fact_amount > 0) {
        console.log(`Май 2026 | Студент: ${p.participant?.name} | Факт: ${p.fact_amount} USD | Оригинал: ${p.original_amount} ${p.currency} | Счет: ${p.account?.name}`);
      }
    });

  } catch(e) {
    console.error("Caught error:", e);
  }
}
check();
