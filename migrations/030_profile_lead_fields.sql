-- Профиль участника: откуда пришёл, Instagram и примерный оборот в месяц.
-- Заполняются в CRM при «Завести в базу» и редактируются в профиле участника.
-- Оборот в месяц — в валюте профиля (participant_profiles.currency); точные цифры по годам — в participant_business_years.
--
-- Откат:
--   ALTER TABLE participant_profiles DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS instagram, DROP COLUMN IF EXISTS monthly_turnover;

ALTER TABLE participant_profiles
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS monthly_turnover numeric(18,2);
