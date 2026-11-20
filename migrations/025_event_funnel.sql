-- Воронка приглашения на мероприятие (например, мастермайнд): на каком этапе каждый человек,
-- когда ему перезвонить и лента комментариев по звонкам. Звонят с обычного телефона,
-- здесь только отслеживание.
-- Только добавляет колонки и таблицу, существующие данные не меняются:
-- у всех, кто уже в списках, этап «Не звонили», у кого уже есть оплата — «Оплатил».
--
-- Откат:
--   DROP TABLE IF EXISTS event_attendee_comments;
--   ALTER TABLE event_attendees DROP COLUMN IF EXISTS next_contact_on, DROP COLUMN IF EXISTS funnel_stage;

ALTER TABLE event_attendees
  ADD COLUMN IF NOT EXISTS funnel_stage text NOT NULL DEFAULT 'new'
    CHECK (funnel_stage IN ('new', 'no_answer', 'thinking', 'going', 'paid', 'declined')),
  -- когда связаться снова («перезвонить в четверг»)
  ADD COLUMN IF NOT EXISTS next_contact_on date;

UPDATE event_attendees SET funnel_stage = 'paid' WHERE funnel_stage = 'new' AND payment_received > 0;

CREATE INDEX IF NOT EXISTS event_attendees_funnel_idx ON event_attendees (event_id, funnel_stage);

-- Комментарии по человеку в рамках мероприятия: что сказал, когда, кто записал.
CREATE TABLE IF NOT EXISTS event_attendee_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendee_id  uuid NOT NULL REFERENCES event_attendees(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (length(btrim(body)) > 0),
  author_id    text,
  author_name  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_attendee_comments_attendee_idx ON event_attendee_comments (attendee_id, created_at DESC);
