-- Доступ к CRM (Обзвон, Воронка, позже Instagram): галочка у входа сотрудника.
-- Администратору CRM открыта всегда, участникам — никогда.
-- Кто уже звонит людям (хантер или автор заметок и отметок в обзвоне), получает доступ сразу,
-- чтобы после обновления никто не потерял «Обзвон».
--
-- Откат:
--   ALTER TABLE app_users DROP COLUMN IF EXISTS crm_access;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS crm_access boolean NOT NULL DEFAULT false;

UPDATE app_users
SET crm_access = true
WHERE role IN ('finance', 'manager', 'employee', 'wheels_manager')
  AND (
    id IN (SELECT hunter_id FROM event_attendees WHERE hunter_id IS NOT NULL)
    OR id::text IN (SELECT author_id::text FROM event_attendee_comments WHERE author_id IS NOT NULL)
  );
