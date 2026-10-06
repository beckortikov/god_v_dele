-- Год в деле: миграции 011, 012, 014, 015 одним файлом.
-- Только добавляют новые таблицы и триггер; существующие строки не меняются.
-- Можно запускать повторно. Выполнить целиком в Supabase → SQL Editor → Run.

-- ================= 011_audit_log =================
-- Журнал изменений и корзина.
-- Только добавляет новую таблицу, существующие данные не меняются.
-- Откат: DROP TABLE IF EXISTS audit_log;

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  table_name   text NOT NULL,
  record_id    text,
  action       text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  actor_id     text,
  actor_name   text,
  summary      text,
  before       jsonb,
  after        jsonb,
  restored_at  timestamptz,
  restored_by  text
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_record_idx ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action) WHERE action = 'delete';


-- ================= 012_account_transfers =================
-- Переводы между счетами компании (например, обмен долларов на сомони или
-- инкассация из кассы на карту).
-- Только добавляет новую таблицу, существующие данные не меняются.
-- Пока миграция не применена, приложение работает как раньше: балансы
-- считаются без переводов, а вкладка «Счета» показывает подсказку.
--
-- Откат: DROP TABLE IF EXISTS account_transfers;

CREATE TABLE IF NOT EXISTS account_transfers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  transfer_date    date NOT NULL DEFAULT CURRENT_DATE,
  -- SET NULL, как у monthly_payments/expenses: удаление счёта не удаляет
  -- историю, а баланс второго счёта остаётся верным.
  from_account_id  uuid REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id    uuid REFERENCES accounts(id) ON DELETE SET NULL,
  -- Сумма списания в валюте счёта-источника
  amount_from      numeric(14,2) NOT NULL CHECK (amount_from > 0),
  -- Сумма зачисления в валюте счёта-получателя
  amount_to        numeric(14,2) NOT NULL CHECK (amount_to > 0),
  -- Курс, по которому выполнен обмен: сколько единиц более дешёвой валюты
  -- за 1 единицу более дорогой (например, 9.2275 TJS за 1 USD).
  -- 1, если валюты счетов совпадают.
  exchange_rate    numeric(12,4) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  note             text,
  CONSTRAINT account_transfers_distinct_accounts CHECK (from_account_id IS DISTINCT FROM to_account_id)
);

CREATE INDEX IF NOT EXISTS account_transfers_date_idx ON account_transfers (transfer_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS account_transfers_from_idx ON account_transfers (from_account_id);
CREATE INDEX IF NOT EXISTS account_transfers_to_idx ON account_transfers (to_account_id);


-- ================= 014_payment_transactions =================
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


-- ================= 015_telegram =================
-- Привязка Telegram-аккаунтов (сейчас участников, позже сотрудников) для
-- напоминаний об оплате через бота.
-- Только добавляет новые таблицы, существующие данные не меняются.
-- Пока миграция не применена, API /api/telegram/* отвечает
-- { error: 'migration_required' } (503), а интерфейс показывает подсказку.
--
-- Откат:
--   DROP TABLE IF EXISTS telegram_link_codes;
--   DROP TABLE IF EXISTS telegram_links;

-- Кто есть кто: одна строка = одна привязка Telegram-аккаунта к человеку.
-- Отвязка не удаляет строку, а ставит unlinked_at, поэтому история
-- (кто был привязан раньше, чем его заменили) сохраняется.
CREATE TABLE IF NOT EXISTS telegram_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'participant' сейчас, 'employee' позже. Внешнего ключа нет, так как
  -- subject_id ссылается на разные таблицы в зависимости от subject_type.
  subject_type      text NOT NULL CHECK (subject_type IN ('participant', 'employee')),
  subject_id        uuid NOT NULL,
  -- Идентификаторы Telegram помещаются в 52 бита, bigint с запасом.
  telegram_user_id  bigint NOT NULL,
  chat_id           bigint NOT NULL,
  username          text,
  first_name        text,
  last_name         text,
  language_code     text,
  -- Номер из «Поделиться номером» (только цифры). phone_verified = true,
  -- если он совпал с телефоном в карточке участника (последние 9 цифр).
  phone             text,
  phone_verified    boolean NOT NULL DEFAULT false,
  phone_verified_at timestamptz,
  -- false = не отправлять уведомления (на будущее: например, бот заблокирован).
  notify            boolean NOT NULL DEFAULT true,
  linked_at         timestamptz NOT NULL DEFAULT now(),
  linked_via_code   text,
  unlinked_at       timestamptz,
  -- user_stop — человек отправил /stop; manual — отвязали в кабинете или
  -- админке; moved — этот Telegram привязали к другому человеку;
  -- replaced — к этому человеку привязали другой Telegram.
  unlink_reason     text CHECK (unlink_reason IN ('user_stop', 'manual', 'moved', 'replaced')),
  -- Новая привязка, которая заменила эту (для moved / replaced).
  replaced_by       uuid REFERENCES telegram_links(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Один активный Telegram на человека и один человек на Telegram.
-- Уникальность только среди активных строк, чтобы хранить историю.
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_subject_uidx
  ON telegram_links (subject_type, subject_id) WHERE unlinked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_user_uidx
  ON telegram_links (telegram_user_id) WHERE unlinked_at IS NULL;
CREATE INDEX IF NOT EXISTS telegram_links_user_history_idx
  ON telegram_links (telegram_user_id, linked_at DESC);

-- Одноразовые коды для ссылки https://t.me/<бот>?start=<code>.
-- Код создаётся для конкретного человека, поэтому бот точно знает, кто пришёл.
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code                      text PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9_-]{8,64}$'),
  subject_type              text NOT NULL CHECK (subject_type IN ('participant', 'employee')),
  subject_id                uuid NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  expires_at                timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at                   timestamptz,
  -- Кто использовал код: повторная доставка того же /start от Telegram
  -- распознаётся и не считается ошибкой.
  used_by_telegram_user_id  bigint,
  created_by                text
);

CREATE INDEX IF NOT EXISTS telegram_link_codes_subject_idx
  ON telegram_link_codes (subject_type, subject_id, created_at DESC);

-- В таблицах есть телефоны. Сервер ходит с service role (RLS не мешает),
-- а публичный anon-ключ к ним доступа не получает.
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

