require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_ACCOUNT_ID = '7e7201b0-a652-4d10-898b-849520243d80'; // Год в деле 2 доллар

async function run() {
  try {
    // 1. Получаем счет
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', TARGET_ACCOUNT_ID)
      .single();

    if (accErr) throw accErr;

    console.log(`=== Анализ счета "${account.name}" ===`);
    console.log(`ID: ${account.id}`);
    console.log(`Валюта: ${account.currency}`);
    console.log(`Начальный баланс (initial_balance): ${account.initial_balance}`);

    // 2. Получаем платежи до мая 2026 года (month < 5)
    const { data: openingPayments, error: opErr } = await supabase
      .from('monthly_payments')
      .select('*, participant:participants(name)')
      .eq('account_id', TARGET_ACCOUNT_ID)
      .or('year.lt.2026,and(year.eq.2026,month_number.lt.5)');

    if (opErr) throw opErr;

    // 3. Получаем расходы до мая 2026 года (date < 2026-05-01)
    const { data: openingExpenses, error: oeErr } = await supabase
      .from('expenses')
      .select('*')
      .eq('account_id', TARGET_ACCOUNT_ID)
      .lt('expense_date', '2026-05-01');

    if (oeErr) throw oeErr;

    console.log("\n--- Транзакции ДО мая 2026 года ---");
    let totalOpeningPayments = 0;
    openingPayments.forEach(p => {
      console.log(`  [Приход] Студент: ${p.participant?.name} | Месяц: ${p.month_number}/${p.year} | Дата: ${p.paid_date} | Сумма: ${p.fact_amount} USD`);
      totalOpeningPayments += p.fact_amount || 0;
    });

    let totalOpeningExpenses = 0;
    openingExpenses.forEach(e => {
      console.log(`  [Расход] ${e.name} | Дата: ${e.expense_date} | Сумма: ${e.amount} USD`);
      totalOpeningExpenses += e.amount || 0;
    });

    const calculatedOpeningBalance = Number(account.initial_balance || 0) + totalOpeningPayments - totalOpeningExpenses;
    console.log(`\nИтого приходов до мая: +$${totalOpeningPayments}`);
    console.log(`Итого расходов до мая: -$${totalOpeningExpenses}`);
    console.log(`РАСЧЕТНЫЙ баланс на начало мая (На начало): $${calculatedOpeningBalance}`);

    // 4. Получаем транзакции за май 2026 года
    const { data: mayPayments, error: mpErr } = await supabase
      .from('monthly_payments')
      .select('*, participant:participants(name)')
      .eq('account_id', TARGET_ACCOUNT_ID)
      .eq('year', 2026)
      .eq('month_number', 5);

    if (mpErr) throw mpErr;

    const { data: mayExpenses, error: meErr } = await supabase
      .from('expenses')
      .select('*')
      .eq('account_id', TARGET_ACCOUNT_ID)
      .gte('expense_date', '2026-05-01')
      .lte('expense_date', '2026-05-31');

    if (meErr) throw meErr;

    console.log("\n--- Транзакции ЗА май 2026 года ---");
    let totalMayPayments = 0;
    mayPayments.forEach(p => {
      console.log(`  [Приход] Студент: ${p.participant?.name} | Месяц: ${p.month_number}/${p.year} | Дата: ${p.paid_date} | Сумма: ${p.fact_amount} USD`);
      totalMayPayments += p.fact_amount || 0;
    });

    let totalMayExpenses = 0;
    mayExpenses.forEach(e => {
      console.log(`  [Расход] ${e.name} | Дата: ${e.expense_date} | Сумма: ${e.amount} USD`);
      totalMayExpenses += e.amount || 0;
    });

    const calculatedClosingBalance = calculatedOpeningBalance + totalMayPayments - totalMayExpenses;
    console.log(`\nИтого приходов за май: +$${totalMayPayments}`);
    console.log(`Итого расходов за май: -$${totalMayExpenses}`);
    console.log(`РАСЧЕТНЫЙ баланс на конец мая (На конец): $${calculatedClosingBalance}`);

  } catch(e) {
    console.error(e);
  }
}
run();
