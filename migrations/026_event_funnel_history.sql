-- История воронки приглашения: кроме комментариев, в ту же ленту пишутся действия —
-- кто перевёл человека на другой этап, кто внёс оплату, кто добавил в список.
-- Админ видит по каждому человеку, кто и когда отметил, и сводку по сотрудникам.
-- Нужна миграция 025. Только добавляет колонку, существующие комментарии становятся kind = 'note'.
--
--   kind = 'note'     body — текст комментария
--   kind = 'stage'    body — 'old>new', коды этапов (new, no_answer, thinking, going, paid, declined)
--   kind = 'payment'  body — 'old>new', сумма в USD
--   kind = 'added'    body — этап, с которым человека добавили
--
-- Откат:
--   DELETE FROM event_attendee_comments WHERE kind <> 'note';
--   ALTER TABLE event_attendee_comments DROP COLUMN IF EXISTS kind;

ALTER TABLE event_attendee_comments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'note'
    CHECK (kind IN ('note', 'stage', 'payment', 'added'));
