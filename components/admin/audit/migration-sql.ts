/**
 * Copy of migrations/011_audit_log.sql for the «Скопировать SQL» button.
 * Keep in sync with the migration file.
 */
export const AUDIT_MIGRATION_SQL = `-- Журнал изменений и корзина.
-- Только добавляет новую таблицу, существующие данные не меняются.
-- Откат: DROP TABLE IF EXISTS audit_log;

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  table_name   text NOT NULL,
  record_id    text,
  action       text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  actor_id     text,
  actor_name   text,
  summary      text,
  before       jsonb,
  after        jsonb,
  restored_at  timestamptz,
  restored_by  text
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_record_idx ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action) WHERE action = 'delete';
`
