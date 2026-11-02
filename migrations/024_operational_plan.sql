-- Операционный план участника: видение → направления → микро-цели → действия.
-- У действия есть индикатор результата, срок, ответственные (просто имена из команды участника),
-- приоритет A/B/C и «цена слова» — сумма, которую участник отдаёт, если срок прошёл без результата.
-- Каждая такая «отмазка» записывается отдельно (причина, сумма, пропущенный и новый срок).
-- Только добавляет новые таблицы, существующие данные не меняются.
-- Пока миграция не применена, раздел «Мой план» показывает подсказку.
--
-- Откат:
--   DROP TABLE IF EXISTS op_action_excuses, op_actions, op_goals, op_directions, op_plans;

CREATE TABLE IF NOT EXISTS op_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  uuid NOT NULL UNIQUE REFERENCES participants(id) ON DELETE CASCADE,
  vision          text,            -- «№1 платформа по продаже цветов в Центральной Азии…»
  vision_date     date,            -- к какой дате
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Направления (цели): Стратегия, HR, Продажи…
CREATE TABLE IF NOT EXISTS op_directions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES op_plans(id) ON DELETE CASCADE,
  title       text NOT NULL,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS op_directions_plan_idx ON op_directions (plan_id);

-- Микро-цели внутри направления
CREATE TABLE IF NOT EXISTS op_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES op_plans(id) ON DELETE CASCADE,
  direction_id  uuid NOT NULL REFERENCES op_directions(id) ON DELETE CASCADE,
  title         text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS op_goals_plan_idx ON op_goals (plan_id);

-- Действия (микро-задачи)
CREATE TABLE IF NOT EXISTS op_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid NOT NULL REFERENCES op_plans(id) ON DELETE CASCADE,
  goal_id      uuid NOT NULL REFERENCES op_goals(id) ON DELETE CASCADE,
  title        text NOT NULL,
  indicator    text,                                   -- как поймём, что сделано
  due_date     date,
  owners       text[] NOT NULL DEFAULT '{}',
  priority     char(1) NOT NULL DEFAULT 'B' CHECK (priority IN ('A', 'B', 'C')),
  price        numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),   -- цена слова, $
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  result_note  text,
  result_link  text,
  done_at      timestamptz,
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS op_actions_plan_idx ON op_actions (plan_id);

-- Отмазки: срок прошёл без результата, цена слова отдана, поставлен новый срок
CREATE TABLE IF NOT EXISTS op_action_excuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES op_plans(id) ON DELETE CASCADE,
  action_id   uuid NOT NULL REFERENCES op_actions(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  price       numeric(12, 2) NOT NULL DEFAULT 0,
  missed_due  date,
  new_due     date,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS op_action_excuses_plan_idx ON op_action_excuses (plan_id);

-- Читает и пишет только сервер (service role обходит RLS); публичный ключ Supabase не должен видеть планы.
ALTER TABLE op_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE op_action_excuses ENABLE ROW LEVEL SECURITY;
