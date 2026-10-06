-- ============================================================================
-- 014 · Частичные оплаты: журнал поступлений по участникам (payment_transactions)
-- ============================================================================
--
-- Что делает:
--   1. Создаёт таблицу payment_transactions: одна строка = одно реальное
--      поступление денег (чек). За один месяц участника может быть сколько
--      угодно поступлений, например $300 + $200 + $500.
--   2. Создаёт триггер: после добавления, изменения или удаления поступления
--      он пересчитывает строку monthly_payments этого месяца:
--        fact_amount  = сумма amount_usd всех поступлений месяца;
--        paid_date    = самая поздняя дата поступления;
--        currency, exchange_rate, account_id — из последнего поступления;
--        original_amount = сумма в валюте, если все поступления месяца в одной
--                          валюте, иначе сумма последнего поступления;
--        status       = paid (факт ≥ плана в центах), partial (факт > 0),
--                       pending (ничего не получено);
--        updated_at   = now().
--      Так старые отчёты, которые читают monthly_payments, продолжают
--      работать без изменений.
--   3. Переносит уже сохранённые оплаты: для каждой строки monthly_payments
--      с fact_amount > 0 создаёт одно поступление с теми же суммой, валютой,
--      курсом, датой, счётом и комментарием. Строки, у которых поступления
--      уже есть, пропускаются, поэтому миграцию можно запускать повторно.
--      Во время переноса триггер не срабатывает: monthly_payments не меняется
--      ни на цент.
--
-- Что НЕ делает:
--   * не удаляет и не меняет существующие таблицы и ограничения. Уникальность
--     (participant_id, month_number, year) в monthly_payments остаётся: одна
--     строка на месяц — это строка графика (план), а поступления лежат в
--     payment_transactions;
--   * не трогает расходы, счета и переводы.
--
-- Порядок: после 005 (accounts). От 011, 012, 013 и 015 не зависит, их можно
-- применять в любом порядке. Рекомендуется сначала применить 013 (округление):
-- поступления хранятся в numeric(14,2), и без 013 старые «хвосты» вроде
-- 537.6344086 перенесутся как 537.63.
--
-- Пока миграция не применена, приложение работает как раньше (одна оплата на
-- месяц, повторная заменяет первую). После применения оно само это заметит
-- в течение минуты, перезапуск не нужен.
--
-- Проверка после применения (см. также docs/partial-payments.md):
--   SELECT count(*) FROM payment_transactions;                 -- = строк с оплатой
--   SELECT count(*) FROM monthly_payments WHERE fact_amount > 0;
--   -- расхождения факта и суммы поступлений (должно быть 0 строк, кроме
--   -- сумм с долями цента, если 013 не применена):
--   SELECT mp.id, mp.fact_amount, sum(t.amount_usd)
--     FROM monthly_payments mp JOIN payment_transactions t ON t.monthly_payment_id = mp.id
--    GROUP BY mp.id HAVING round(mp.fact_amount::numeric, 2) <> sum(t.amount_usd);
--
-- Откат: см. раздел ROLLBACK в конце файла.
-- ============================================================================

BEGIN;

-- 1. Таблица поступлений ------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Месяц графика, за который пришли деньги. Удаление месяца удаляет его
  -- поступления.
  monthly_payment_id uuid NOT NULL REFERENCES monthly_payments(id) ON DELETE CASCADE,
  participant_id     uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  program_id         uuid REFERENCES programs(id) ON DELETE SET NULL,
  -- Сумма в долларах (база для всех отчётов)
  amount_usd         numeric(14,2) NOT NULL,
  -- Сумма в валюте поступления (например, в сомони)
  original_amount    numeric(14,2),
  currency           text NOT NULL DEFAULT 'USD',
  -- Сколько единиц валюты за 1 USD; 1 для долларов
  exchange_rate      numeric(12,4),
  paid_date          date,
  -- SET NULL, как у monthly_payments и expenses: удаление счёта не удаляет историю
  account_id         uuid REFERENCES accounts(id) ON DELETE SET NULL,
  notes              text,
  -- Кто внёс (имя или id пользователя из заголовков запроса); 'backfill-014'
  -- для перенесённых оплат
  created_by         text
);

CREATE INDEX IF NOT EXISTS payment_transactions_monthly_idx ON payment_transactions (monthly_payment_id);
CREATE INDEX IF NOT EXISTS payment_transactions_participant_idx ON payment_transactions (participant_id);
CREATE INDEX IF NOT EXISTS payment_transactions_paid_date_idx ON payment_transactions (paid_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_account_idx ON payment_transactions (account_id);

-- 2. Пересчёт месяца ------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_monthly_payment(p_monthly_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count      integer;
  v_fact       numeric;
  v_paid_date  date;
  v_currencies integer;
  v_orig_sum   numeric;
  v_last       record;
BEGIN
  IF p_monthly_payment_id IS NULL THEN
    RETURN;
  END IF;

  -- Блокируем строку месяца: два одновременных поступления за один месяц
  -- пересчитываются по очереди, и второе видит первое.
  PERFORM 1 FROM monthly_payments WHERE id = p_monthly_payment_id FOR UPDATE;

  SELECT count(*),
         coalesce(sum(amount_usd), 0),
         max(paid_date),
         count(DISTINCT currency),
         sum(coalesce(original_amount, amount_usd))
    INTO v_count, v_fact, v_paid_date, v_currencies, v_orig_sum
    FROM payment_transactions
   WHERE monthly_payment_id = p_monthly_payment_id;

  -- «Последнее» поступление: самая поздняя дата, затем самое позднее создание
  SELECT original_amount, currency, exchange_rate, account_id
    INTO v_last
    FROM payment_transactions
   WHERE monthly_payment_id = p_monthly_payment_id
   ORDER BY paid_date DESC NULLS LAST, created_at DESC, id DESC
   LIMIT 1;

  IF v_count = 0 THEN
    UPDATE monthly_payments
       SET fact_amount     = 0,
           original_amount = NULL,
           exchange_rate   = NULL,
           account_id      = NULL,
           paid_date       = NULL,
           status          = 'pending',
           updated_at      = now()
     WHERE id = p_monthly_payment_id;
    RETURN;
  END IF;

  UPDATE monthly_payments
     SET fact_amount     = round(v_fact, 2),
         original_amount = CASE WHEN v_currencies = 1 THEN round(v_orig_sum, 2) ELSE v_last.original_amount END,
         currency        = v_last.currency,
         exchange_rate   = v_last.exchange_rate,
         account_id      = v_last.account_id,
         paid_date       = v_paid_date,
         status          = CASE
                             WHEN round(v_fact * 100) <= 0 THEN 'pending'
                             WHEN round(v_fact * 100) >= round(coalesce(plan_amount, 0)::numeric * 100) THEN 'paid'
                             ELSE 'partial'
                           END,
         updated_at      = now()
   WHERE id = p_monthly_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION payment_transactions_after_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Перенос старых оплат (шаг 3) выключает пересчёт на время своей транзакции
  IF coalesce(current_setting('payments.skip_recompute', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM recompute_monthly_payment(OLD.monthly_payment_id);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.monthly_payment_id IS DISTINCT FROM OLD.monthly_payment_id) THEN
    PERFORM recompute_monthly_payment(NEW.monthly_payment_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS payment_transactions_recompute ON payment_transactions;
CREATE TRIGGER payment_transactions_recompute
  AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION payment_transactions_after_change();

-- 3. Перенос существующих оплат (идемпотентно) -------------------------------

-- Только до конца этой транзакции: monthly_payments при переносе не меняется
SET LOCAL payments.skip_recompute = 'on';

INSERT INTO payment_transactions (
  created_at, monthly_payment_id, participant_id, program_id,
  amount_usd, original_amount, currency, exchange_rate,
  paid_date, account_id, notes, created_by
)
SELECT
  coalesce(mp.updated_at, mp.created_at, now()),
  mp.id,
  mp.participant_id,
  mp.program_id,
  round(mp.fact_amount::numeric, 2),
  round(mp.original_amount::numeric, 2),
  coalesce(nullif(mp.currency, ''), 'USD'),
  round(mp.exchange_rate::numeric, 4),
  mp.paid_date,
  mp.account_id,
  mp.notes,
  'backfill-014'
FROM monthly_payments mp
WHERE mp.fact_amount > 0
  AND NOT EXISTS (SELECT 1 FROM payment_transactions t WHERE t.monthly_payment_id = mp.id);

SET LOCAL payments.skip_recompute = 'off';

COMMIT;

-- Чтобы API (PostgREST) сразу увидел новую таблицу
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (выполнять вручную, только если нужно вернуться к старой схеме)
-- ============================================================================
-- Приложение само вернётся к прежнему поведению в течение минуты после
-- удаления таблицы. monthly_payments сохранит последний пересчитанный факт.
-- ВНИМАНИЕ: поступления, внесённые после миграции, сольются в одну сумму на
-- месяц; список отдельных чеков будет потерян (сделайте выгрузку заранее).
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS payment_transactions_recompute ON payment_transactions;
--   DROP FUNCTION IF EXISTS payment_transactions_after_change();
--   DROP FUNCTION IF EXISTS recompute_monthly_payment(uuid);
--   DROP TABLE IF EXISTS payment_transactions;
-- COMMIT;
