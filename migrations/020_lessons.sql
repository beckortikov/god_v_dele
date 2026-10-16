-- Календарь уроков: расписание занятий потока (или его группы) и материалы к урокам
-- (презентации, документы, ссылки на запись или Google Drive).
-- Только добавляет новые таблицы, существующие данные не меняются. Пока миграция не применена,
-- API /api/lessons и /api/my-lessons отвечают 503 { error: 'lessons_migration_required' },
-- а интерфейс показывает подсказку. Сами файлы лежат в закрытом хранилище Storage
-- (bucket lesson-materials, создаётся при первой загрузке).
--
-- Откат:
--   DROP TABLE IF EXISTS lesson_materials;
--   DROP TABLE IF EXISTS lessons;

CREATE TABLE IF NOT EXISTS lessons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  -- NULL — урок для всего потока; иначе только для этой группы.
  -- RESTRICT: группу с уроками нельзя удалить, чтобы не потерять материалы.
  group_id    uuid REFERENCES participant_groups(id) ON DELETE RESTRICT,
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  format      text NOT NULL DEFAULT 'online' CHECK (format IN ('online', 'offline')),
  -- ссылка на Zoom / Meet для онлайн-урока
  link        text,
  -- адрес для очного урока
  location    text,
  teacher     text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS lessons_program_time_idx ON lessons (program_id, starts_at);
CREATE INDEX IF NOT EXISTS lessons_group_idx ON lessons (group_id);

-- Материал урока: файл (презентация, документ) или ссылка.
CREATE TABLE IF NOT EXISTS lesson_materials (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('file', 'link')),
  title      text NOT NULL CHECK (length(btrim(title)) > 0),
  -- для ссылки
  url        text,
  -- для файла: имя объекта в Storage (<lesson_id>/<file_key>), исходное имя и размер
  file_key   text,
  file_name  text,
  file_size  bigint,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'link' AND url IS NOT NULL) OR (kind = 'file' AND file_key IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lesson_materials_lesson_idx ON lesson_materials (lesson_id, created_at);

-- Данные читает только сервер (service role обходит RLS); публичный ключ Supabase не должен видеть таблицы.
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_materials ENABLE ROW LEVEL SECURITY;
