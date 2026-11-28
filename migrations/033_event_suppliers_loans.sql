-- Деньги мероприятия (мастермайнд): кому платим и откуда берём.
--
-- Поставщики — тур-компания, отель, транспорт, площадка: сумма по договору. Оплаты поставщику
-- остаются обычными расходами мероприятия (таблица expenses, event_id), у них появляются
-- supplier_id (кому) и loan_id (из какого займа). Если платим прямо со счёта «Год в деле»,
-- расход получает account_id, и баланс счёта уменьшается, как у любого расхода со счёта.
--
-- Займы — деньги, взятые на мероприятие: со счёта «Год в деле» (source = 'account', баланс счёта
-- уменьшается на сумму займа и растёт на каждый возврат) или у человека / компании
-- (source = 'person'). Возвраты пишутся частями; возврат стороннему займодателю может быть
-- со счёта «Год в деле» (тогда этот счёт уменьшается).
--
-- Суммы как у расходов: amount — в долларах, original_amount — в валюте операции, exchange_rate — курс.
-- Только добавляет таблицы и пустые колонки, существующие данные не меняются.
--
-- Откат:
--   ALTER TABLE expenses DROP COLUMN IF EXISTS loan_id, DROP COLUMN IF EXISTS supplier_id;
--   DROP TABLE IF EXISTS event_loan_repayments, event_loans, event_suppliers;

CREATE TABLE IF NOT EXISTS event_suppliers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           uuid NOT NULL REFERENCES offline_events(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (length(btrim(name)) > 0),
  kind               text NOT NULL DEFAULT 'other' CHECK (kind IN ('tour', 'hotel', 'transport', 'venue', 'other')),
  -- сумма по договору: в долларах и в валюте договора
  contract_amount    numeric(14, 2) NOT NULL DEFAULT 0 CHECK (contract_amount >= 0),
  contract_currency  text NOT NULL DEFAULT 'USD' CHECK (contract_currency IN ('USD', 'TJS')),
  contract_original  numeric(14, 2) NOT NULL DEFAULT 0 CHECK (contract_original >= 0),
  contract_rate      numeric(12, 4) NOT NULL DEFAULT 1 CHECK (contract_rate > 0),
  contact            text,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_suppliers_event_idx ON event_suppliers (event_id);

CREATE TABLE IF NOT EXISTS event_loans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES offline_events(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('account', 'person')),
  account_id       uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  lender_name      text,
  amount           numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency         text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'TJS')),
  original_amount  numeric(14, 2) NOT NULL CHECK (original_amount > 0),
  exchange_rate    numeric(12, 4) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  received_on      date NOT NULL DEFAULT CURRENT_DATE,
  due_on           date,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (source = 'account' AND account_id IS NOT NULL)
    OR (source = 'person' AND lender_name IS NOT NULL AND length(btrim(lender_name)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS event_loans_event_idx ON event_loans (event_id);
CREATE INDEX IF NOT EXISTS event_loans_account_idx ON event_loans (account_id) WHERE account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_loan_repayments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id          uuid NOT NULL REFERENCES event_loans(id) ON DELETE CASCADE,
  amount           numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency         text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'TJS')),
  original_amount  numeric(14, 2) NOT NULL CHECK (original_amount > 0),
  exchange_rate    numeric(12, 4) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  repaid_on        date NOT NULL DEFAULT CURRENT_DATE,
  -- для займа у человека: с какого счёта «Год в деле» вернули (необязательно)
  account_id       uuid REFERENCES accounts(id) ON DELETE SET NULL,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_loan_repayments_loan_idx ON event_loan_repayments (loan_id);
CREATE INDEX IF NOT EXISTS event_loan_repayments_account_idx ON event_loan_repayments (account_id) WHERE account_id IS NOT NULL;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES event_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loan_id     uuid REFERENCES event_loans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id ON expenses (supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_loan_id ON expenses (loan_id) WHERE loan_id IS NOT NULL;
