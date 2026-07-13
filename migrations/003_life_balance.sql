-- Life Balance Entries table
-- Stores annual ideal values and monthly category scores per participant

CREATE TABLE IF NOT EXISTS life_balance_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  year INT NOT NULL,
  ideal_values JSONB NOT NULL DEFAULT '{}',
  -- monthly_values: {"Январь": {"финансы": 5, "спорт/тело": 6}, "Февраль": {...}}
  monthly_values JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_id, year)
);

-- Index for fast lookups by participant
CREATE INDEX IF NOT EXISTS idx_life_balance_participant ON life_balance_entries(participant_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_life_balance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_life_balance_updated_at ON life_balance_entries;
CREATE TRIGGER trigger_life_balance_updated_at
  BEFORE UPDATE ON life_balance_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_life_balance_updated_at();
