-- ============================================================================
-- 013 · Округление денежных сумм (НЕОБЯЗАТЕЛЬНАЯ, разовая)
-- ============================================================================
--
-- ВНИМАНИЕ: эта миграция ИЗМЕНЯЕТ СУЩЕСТВУЮЩИЕ ДАННЫЕ.
--
-- Что делает: округляет уже сохранённые суммы до центов (2 знака) и курсы
-- валют до 4 знаков, например 999.9999999999999 → 1000.00,
-- 537.6344086021505 → 537.63. Новые записи API уже округляет само
-- (lib/money.ts → roundMoney / roundRate), поэтому без этой миграции всё
-- продолжит работать; она только чистит старые «хвосты».
--
-- Перед запуском:
--   1. Сделайте резервную копию (Supabase → Database → Backups) или хотя бы
--      выгрузите затронутые таблицы в CSV.
--   2. Посмотрите, сколько строк изменится, — запросы-превью ниже.
--   3. Итоги в отчётах могут сдвинуться на несколько центов: сумма округлённых
--      значений не всегда равна округлённой сумме.
--
-- Меняются только строки, где значение действительно отличается от
-- округлённого; NULL остаётся NULL. Всё выполняется в одной транзакции:
-- при любой ошибке ничего не изменится.
--
-- Итоги мероприятий (offline_events.total_income / total_expenses / balance)
-- пересчитываются триггером update_event_financials автоматически при
-- обновлении event_attendees и expenses, поэтому напрямую здесь не трогаются.
-- account_transfers не включена: её столбцы уже numeric(14,2) / numeric(12,4)
-- (миграция 012), база округляет их сама.
--
-- Откат: только из резервной копии.
-- ============================================================================

-- Превью (выполните отдельно, до миграции):
-- SELECT 'monthly_payments' AS t, count(*) FROM monthly_payments
--   WHERE plan_amount::numeric <> round(plan_amount::numeric, 2) OR fact_amount::numeric <> round(fact_amount::numeric, 2)
--      OR original_amount::numeric <> round(original_amount::numeric, 2) OR exchange_rate::numeric <> round(exchange_rate::numeric, 4)
-- UNION ALL SELECT 'expenses', count(*) FROM expenses
--   WHERE amount::numeric <> round(amount::numeric, 2) OR original_amount::numeric <> round(original_amount::numeric, 2)
--      OR exchange_rate::numeric <> round(exchange_rate::numeric, 4)
-- UNION ALL SELECT 'event_attendees', count(*) FROM event_attendees
--   WHERE payment_received::numeric <> round(payment_received::numeric, 2) OR original_amount::numeric <> round(original_amount::numeric, 2)
--      OR exchange_rate::numeric <> round(exchange_rate::numeric, 4);

BEGIN;

-- Поступления от участников
UPDATE monthly_payments SET
  plan_amount     = round(plan_amount::numeric, 2),
  fact_amount     = round(fact_amount::numeric, 2),
  original_amount = round(original_amount::numeric, 2),
  exchange_rate   = round(exchange_rate::numeric, 4)
WHERE plan_amount::numeric     <> round(plan_amount::numeric, 2)
   OR fact_amount::numeric     <> round(fact_amount::numeric, 2)
   OR original_amount::numeric <> round(original_amount::numeric, 2)
   OR exchange_rate::numeric   <> round(exchange_rate::numeric, 4);

-- Расходы (общие и расходы мероприятий)
UPDATE expenses SET
  amount          = round(amount::numeric, 2),
  original_amount = round(original_amount::numeric, 2),
  exchange_rate   = round(exchange_rate::numeric, 4)
WHERE amount::numeric          <> round(amount::numeric, 2)
   OR original_amount::numeric <> round(original_amount::numeric, 2)
   OR exchange_rate::numeric   <> round(exchange_rate::numeric, 4);

-- Оплаты гостей мероприятий
UPDATE event_attendees SET
  payment_received = round(payment_received::numeric, 2),
  original_amount  = round(original_amount::numeric, 2),
  exchange_rate    = round(exchange_rate::numeric, 4)
WHERE payment_received::numeric <> round(payment_received::numeric, 2)
   OR original_amount::numeric  <> round(original_amount::numeric, 2)
   OR exchange_rate::numeric    <> round(exchange_rate::numeric, 4);

-- Тарифы участников и цены программ
UPDATE participants SET tariff = round(tariff::numeric, 2)
WHERE tariff::numeric <> round(tariff::numeric, 2);

UPDATE programs SET price_per_month = round(price_per_month::numeric, 2)
WHERE price_per_month::numeric <> round(price_per_month::numeric, 2);

-- Прогнозы
UPDATE monthly_forecasts SET
  planned_income     = round(planned_income::numeric, 2),
  planned_expenses   = round(planned_expenses::numeric, 2),
  optimistic_income  = round(optimistic_income::numeric, 2),
  pessimistic_income = round(pessimistic_income::numeric, 2)
WHERE planned_income::numeric     <> round(planned_income::numeric, 2)
   OR planned_expenses::numeric   <> round(planned_expenses::numeric, 2)
   OR optimistic_income::numeric  <> round(optimistic_income::numeric, 2)
   OR pessimistic_income::numeric <> round(pessimistic_income::numeric, 2);

-- Оклады и начисления зарплаты
UPDATE employees SET base_salary = round(base_salary::numeric, 2)
WHERE base_salary::numeric <> round(base_salary::numeric, 2);

UPDATE payroll SET
  base_salary      = round(base_salary::numeric, 2),
  bonus_amount     = round(bonus_amount::numeric, 2),
  deduction_amount = round(deduction_amount::numeric, 2),
  total_amount     = round(total_amount::numeric, 2)
WHERE base_salary::numeric      <> round(base_salary::numeric, 2)
   OR bonus_amount::numeric     <> round(bonus_amount::numeric, 2)
   OR deduction_amount::numeric <> round(deduction_amount::numeric, 2)
   OR total_amount::numeric     <> round(total_amount::numeric, 2);

-- Начальные остатки счетов
UPDATE accounts SET initial_balance = round(initial_balance::numeric, 2)
WHERE initial_balance::numeric <> round(initial_balance::numeric, 2);

COMMIT;
