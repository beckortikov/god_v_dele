-- Хантер в обзвоне: кто из сотрудников отвечает за человека в мероприятии (звонит, ведёт до оплаты).
-- На странице «Обзвон» фильтр «Мои» и по каждому хантеру; хантера можно сменить прямо в строке,
-- и смена пишется в историю человека (kind = 'hunter', body — 'старое имя>новое имя').
-- Нужны миграции 025 и 026. Только добавляет колонку и расширяет список видов истории.
--
-- Откат:
--   DELETE FROM event_attendee_comments WHERE kind = 'hunter';
--   ALTER TABLE event_attendee_comments DROP CONSTRAINT event_attendee_comments_kind_check,
--     ADD CONSTRAINT event_attendee_comments_kind_check CHECK (kind IN ('note', 'stage', 'payment', 'added'));
--   ALTER TABLE event_attendees DROP COLUMN IF EXISTS hunter_id;

ALTER TABLE event_attendees
  ADD COLUMN IF NOT EXISTS hunter_id uuid REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_attendees_hunter_idx ON event_attendees (event_id, hunter_id);

ALTER TABLE event_attendee_comments DROP CONSTRAINT IF EXISTS event_attendee_comments_kind_check;
ALTER TABLE event_attendee_comments
  ADD CONSTRAINT event_attendee_comments_kind_check CHECK (kind IN ('note', 'stage', 'payment', 'added', 'hunter'));
