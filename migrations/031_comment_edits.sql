-- Заметки обзвона можно исправить: автор или администратор меняет текст, и рядом видно «изменено».
--
-- Откат:
--   ALTER TABLE event_attendee_comments DROP COLUMN IF EXISTS edited_at;

ALTER TABLE event_attendee_comments
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;
