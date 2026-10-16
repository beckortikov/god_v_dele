-- Профиль участника: личные данные, паспорт, род деятельности и динамика бизнеса по годам.
-- Участник заполняет сам в кабинете («Профиль»), администратор и менеджер колёс видят и правят профиль любого участника.
-- Только добавляет новые таблицы, существующие данные не меняются. Пока миграция не применена,
-- API /api/participant-profile отвечает 503 { error: 'profile_migration_required' }, а интерфейс показывает подсказку.
-- Сканы паспорта лежат не здесь, а в закрытом хранилище Storage (bucket participant-docs, создаётся при первой загрузке).
--
-- Откат:
--   DROP TABLE IF EXISTS participant_business_years;
--   DROP TABLE IF EXISTS participant_profiles;

CREATE TABLE IF NOT EXISTS participant_profiles (
  participant_id   uuid PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  birth_date       date,
  city             text,
  address          text,
  -- серия и номер паспорта; кем и когда выдан
  passport_number  text,
  passport_issued  text,
  -- род деятельности и название бизнеса
  activity         text,
  business_name    text,
  -- валюта, в которой участник указывает оборот и прибыль (одна на все годы, чтобы динамика была сравнима)
  currency         text NOT NULL DEFAULT 'TJS' CHECK (currency IN ('TJS', 'USD', 'RUB', 'UZS', 'KZT', 'EUR')),
  updated_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Оборот и чистая прибыль участника за календарный год. Один год — одна строка.
CREATE TABLE IF NOT EXISTS participant_business_years (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  year            integer NOT NULL CHECK (year BETWEEN 1990 AND 2100),
  turnover        numeric(18, 2),
  net_profit      numeric(18, 2),
  notes           text,
  updated_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, year)
);
CREATE INDEX IF NOT EXISTS participant_business_years_participant_idx ON participant_business_years (participant_id, year);

-- Паспортные данные не должны читаться напрямую через публичный ключ Supabase:
-- RLS включён и политик нет, поэтому открыто только серверу (service role обходит RLS).
ALTER TABLE participant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_business_years ENABLE ROW LEVEL SECURITY;
