-- Приоритет задачи: 1 «Срочно» (P1), 2 «Важно» (P2), 3 «Обычно» (P3, по умолчанию), 4 «Не срочно» (P4).
--
-- Откат:
--   ALTER TABLE tasks DROP COLUMN IF EXISTS priority;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 3;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check CHECK (priority BETWEEN 1 AND 4);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
