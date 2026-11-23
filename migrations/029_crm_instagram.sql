-- Клиенты из Instagram в CRM: этап воронки, заметка и связь с базой участников.
-- Переписка и комментарии живут в Zernio; здесь только то, что добавляет CRM.
-- Строка появляется при первом действии с человеком (этап, заметка, «Завести в базу»).
--
-- Откат:
--   DROP TABLE IF EXISTS crm_instagram_contacts;

CREATE TABLE IF NOT EXISTS crm_instagram_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_user_id text NOT NULL UNIQUE,
  username text,
  name text,
  picture text,
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'talk', 'mm', 'pay', 'member')),
  note text,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'dm' CHECK (source IN ('dm', 'comment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_instagram_contacts_stage_idx ON crm_instagram_contacts (stage);
