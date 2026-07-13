-- Business Wheel Entries table
-- Stores monthly check status of 70 business elements per participant

CREATE TABLE IF NOT EXISTS business_wheel_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month VARCHAR(20) NOT NULL, -- 'Январь', 'Февраль', etc.
  checked_items JSONB NOT NULL DEFAULT '{}', -- e.g., {"1_1": true, "1_2": true}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_id, year, month)
);

-- Index for fast lookups by participant
CREATE INDEX IF NOT EXISTS idx_business_wheel_participant ON business_wheel_entries(participant_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_business_wheel_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_business_wheel_updated_at ON business_wheel_entries;
CREATE TRIGGER trigger_business_wheel_updated_at
  BEFORE UPDATE ON business_wheel_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_business_wheel_updated_at();
