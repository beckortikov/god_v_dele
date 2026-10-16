-- Группы участников внутри потока (программы) и спринты по группам.
-- Куратор делит участников потока на группы; у каждой группы свои спринты
-- (свои даты, цель и задачи). Спринт без группы (group_id = NULL) остаётся
-- «для всего потока», поэтому все существующие спринты продолжают работать.
-- Существующие данные не меняются. Пока миграция не применена, интерфейс
-- спринтов работает как раньше и просто не показывает группы.
--
-- Откат:
--   DROP INDEX IF EXISTS sprints_program_group_number_idx;
--   ALTER TABLE sprints ADD CONSTRAINT sprints_program_id_number_key UNIQUE (program_id, number); -- только если нет двух спринтов с одним номером
--   ALTER TABLE sprints DROP COLUMN IF EXISTS group_id;
--   ALTER TABLE participants DROP COLUMN IF EXISTS group_id;
--   DROP TABLE IF EXISTS participant_groups;

CREATE TABLE IF NOT EXISTS participant_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, name)
);
CREATE INDEX IF NOT EXISTS participant_groups_program_idx ON participant_groups (program_id);

-- Участник состоит не более чем в одной группе. Удалили группу — участники остаются без группы.
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES participant_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS participants_group_idx ON participants (group_id);

-- Спринт группы. RESTRICT: группу со спринтами удалить нельзя, чтобы не потерять отчёты.
ALTER TABLE sprints
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES participant_groups(id) ON DELETE RESTRICT;

-- Номер спринта уникален внутри потока и группы (раньше — только внутри потока).
ALTER TABLE sprints DROP CONSTRAINT IF EXISTS sprints_program_id_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS sprints_program_group_number_idx
  ON sprints (program_id, COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid), number);
CREATE INDEX IF NOT EXISTS sprints_group_idx ON sprints (group_id);
