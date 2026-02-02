-- Add tariff column to participants table
ALTER TABLE participants ADD COLUMN IF NOT EXISTS tariff NUMERIC;

-- Comment: This tariff overrides the program's price_per_month if set.
