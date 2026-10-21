-- Вход на сайт через Telegram-бота.
-- Человек нажимает «Войти через Telegram» на сайте, открывается бот, он подтверждает
-- вход, и сайт входит сам. Одна строка = одна попытка входа, живёт 5 минут.
-- Нужна миграция 015 (привязка Telegram). Только добавляет новую таблицу,
-- существующие данные не меняются. Пока миграция не применена, кнопки входа через
-- Telegram на сайте просто нет.
--
-- Откат:
--   DROP TABLE IF EXISTS telegram_logins;

CREATE TABLE IF NOT EXISTS telegram_logins (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Идёт в ссылку https://t.me/<бот>?start=login_<token>
  token                 text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  -- Хеш секрета, который знает только браузер, начавший вход: без него
  -- подтверждённый вход чужой ссылкой на сайт не получить.
  secret_hash           text NOT NULL,
  -- pending -> approved (подтвердили в боте) -> used (сайт вошёл), либо denied
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'used')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  ip                    text,
  device                text,
  approved_participant_id uuid,
  telegram_user_id      bigint,
  approved_at           timestamptz,
  used_at               timestamptz
);

CREATE INDEX IF NOT EXISTS telegram_logins_ip_idx ON telegram_logins (ip, created_at DESC);

-- Сервер ходит с service role; публичный ключ доступа к таблице не получает.
ALTER TABLE telegram_logins ENABLE ROW LEVEL SECURITY;
