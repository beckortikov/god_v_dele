-- Профиль участника: число сотрудников, сайт или соцсети бизнеса и цель по обороту на год.
-- Только добавляет пустые колонки, существующие данные не меняются. Нужна миграция 019.
-- Пока миграция не применена, профиль работает как раньше, а сохранение новых полей
-- отвечает подсказкой «примените миграцию 022».
--
-- Откат:
--   ALTER TABLE participant_business_years DROP COLUMN IF EXISTS goal_turnover;
--   ALTER TABLE participant_profiles DROP COLUMN IF EXISTS website;
--   ALTER TABLE participant_profiles DROP COLUMN IF EXISTS employees_count;

ALTER TABLE participant_profiles
  ADD COLUMN IF NOT EXISTS employees_count integer CHECK (employees_count IS NULL OR employees_count BETWEEN 0 AND 100000),
  ADD COLUMN IF NOT EXISTS website text;

-- Цель по обороту на год: сравнивается с фактическим оборотом того же года.
ALTER TABLE participant_business_years
  ADD COLUMN IF NOT EXISTS goal_turnover numeric(18, 2) CHECK (goal_turnover IS NULL OR goal_turnover >= 0);
