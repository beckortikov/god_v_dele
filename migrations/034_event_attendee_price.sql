-- План и факт дохода мероприятия разделены.
--   price / price_currency / price_original — цена участия для человека (план, сколько должен заплатить);
--   payment_received / original_amount — сколько он реально заплатил (факт). Доход мероприятия
--   (offline_events.total_income, триггер update_event_financials) считается только по факту.
--
-- Исправление данных: при добавлении участников на «Малайзия - Борео Мастермайнд» (22.11.2026) цену
-- 2 300 $ ввели в поле «Оплата с каждого», и она записалась как полученные деньги у 69 человек.
-- Реально оплатили только люди на этапе «Оплатил». Поэтому:
--   1) у всех, у кого была сумма, она становится ценой (план);
--   2) у тех, кто не на этапе «Оплатил», оплата обнуляется — доход пересчитается триггером.
-- У Катара и Хайнаня все с оплатой на этапе «Оплатил», их доход не меняется.
--
-- Откат (данные): UPDATE event_attendees SET payment_received = price, original_amount = price_original
--   WHERE price > 0 AND payment_received = 0;
-- Откат (схема): ALTER TABLE event_attendees DROP COLUMN price, DROP COLUMN price_currency, DROP COLUMN price_original;

ALTER TABLE event_attendees
  ADD COLUMN IF NOT EXISTS price          numeric(14, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'USD' CHECK (price_currency IN ('USD', 'TJS')),
  ADD COLUMN IF NOT EXISTS price_original numeric(14, 2) NOT NULL DEFAULT 0 CHECK (price_original >= 0);

UPDATE event_attendees
SET price = payment_received,
    price_currency = CASE WHEN currency = 'TJS' THEN 'TJS' ELSE 'USD' END,
    price_original = COALESCE(NULLIF(original_amount, 0), payment_received)
WHERE payment_received > 0 AND price = 0;

UPDATE event_attendees
SET payment_received = 0, original_amount = 0
WHERE payment_received > 0 AND funnel_stage <> 'paid';
