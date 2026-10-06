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
