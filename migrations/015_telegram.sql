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
