-- Отзывы об уроках: после урока участник оценивает его по пяти вопросам (1-10) и может оставить пожелания.
-- Админ и кураторы видят отзывы по дням и урокам. Один участник даёт один отзыв на урок (можно изменить).
-- Нужна миграция 020 (уроки). Только добавляет новую таблицу, существующие данные не меняются.
-- Пока миграция не применена, календарь уроков работает как раньше, а вместо отзывов показывается подсказка.
--
-- Откат:
--   DROP TABLE IF EXISTS lesson_feedback;

CREATE TABLE IF NOT EXISTS lesson_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  participant_id  uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  -- пять вопросов, оценка от 1 до 10
  content         smallint NOT NULL CHECK (content BETWEEN 1 AND 10),   -- содержание соответствовало ожиданиям и целям
  clarity         smallint NOT NULL CHECK (clarity BETWEEN 1 AND 10),   -- понятная и структурированная подача
  support         smallint NOT NULL CHECK (support BETWEEN 1 AND 10),   -- ответы на вопросы и обратная связь
  useful          smallint NOT NULL CHECK (useful BETWEEN 1 AND 10),    -- применимость знаний в деле
  overall         smallint NOT NULL CHECK (overall BETWEEN 1 AND 10),   -- урок достиг цели и оправдал время
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, participant_id)
);
CREATE INDEX IF NOT EXISTS lesson_feedback_lesson_idx ON lesson_feedback (lesson_id);

-- Отзывы читает только сервер (service role обходит RLS); публичный ключ Supabase не должен их видеть.
ALTER TABLE lesson_feedback ENABLE ROW LEVEL SECURITY;
