-- Спринты участников: куратор ставит задачи потоку (программе) по спринтам,
-- участник сдаёт результат, куратор принимает или возвращает на доработку.
-- Только добавляет новые таблицы, существующие данные не меняются.
-- Пока миграция не применена, API /api/sprints/* и /api/my-sprint отвечают
-- { error: 'migration_required' } (503), а интерфейс показывает подсказку.
--
-- Откат:
--   DROP TABLE IF EXISTS sprint_task_events;
--   DROP TABLE IF EXISTS sprint_task_assignments;
--   DROP TABLE IF EXISTS sprint_tasks;
--   DROP TABLE IF EXISTS sprints;

-- Спринт потока: «Спринт 3 · Упаковка продукта», 6–19 октября.
CREATE TABLE IF NOT EXISTS sprints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  number      integer NOT NULL CHECK (number > 0),
  title       text NOT NULL,
  goal        text,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (program_id, number)
);
CREATE INDEX IF NOT EXISTS sprints_program_idx ON sprints (program_id, start_date);

-- Задача. sprint_id = NULL — задача лежит в бэклоге потока и никому не назначена.
CREATE TABLE IF NOT EXISTS sprint_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  sprint_id        uuid REFERENCES sprints(id) ON DELETE SET NULL,
  title            text NOT NULL,
  description      text,
  due_date         date,
  -- mark — участник просто отмечает; text — текстовый отчёт; link — ссылка на файл.
  submission_type  text NOT NULL DEFAULT 'text' CHECK (submission_type IN ('mark', 'text', 'link')),
  -- false — сданная задача сразу считается выполненной.
  requires_review  boolean NOT NULL DEFAULT true,
  -- Напомнить в Telegram за день до срока тем, кто не сдал.
  remind           boolean NOT NULL DEFAULT true,
  -- all — весь поток; selected — личная задача для выбранных участников.
  audience         text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'selected')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sprint_tasks_sprint_idx ON sprint_tasks (sprint_id);
CREATE INDEX IF NOT EXISTS sprint_tasks_backlog_idx ON sprint_tasks (program_id) WHERE sprint_id IS NULL;

-- Копия задачи у конкретного участника: свой статус, отчёт и срок.
CREATE TABLE IF NOT EXISTS sprint_task_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES sprint_tasks(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  -- todo — не сдано; review — ждёт проверки; rework — вернули; done — выполнено.
  status          text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'review', 'rework', 'done')),
  -- Личный срок (новый срок при возврате). NULL — срок задачи.
  due_date        date,
  report_text     text,
  report_link     text,
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  review_comment  text,
  reviewed_by     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, participant_id)
);
CREATE INDEX IF NOT EXISTS sprint_task_assignments_participant_idx ON sprint_task_assignments (participant_id);

-- История по задаче участника: сдал, вернули, приняли, отметил.
CREATE TABLE IF NOT EXISTS sprint_task_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL REFERENCES sprint_task_assignments(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('submitted', 'returned', 'accepted', 'marked', 'unmarked')),
  comment        text,
  due_date       date,
  actor_name     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sprint_task_events_assignment_idx ON sprint_task_events (assignment_id, created_at);
