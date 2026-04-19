-- Life Wheel Entries table
-- Stores time allocation data per participant per period

CREATE TABLE IF NOT EXISTS life_wheel_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  period_type VARCHAR(10) NOT NULL DEFAULT 'monthly', -- 'weekly' | 'monthly'
  period_label VARCHAR(20) NOT NULL, -- '2026-04' for monthly, '2026-W14' for weekly
  categories JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"name": "Работа", "value": 70, "color": "#6366f1"}, ...]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_id, period_type, period_label)
);

-- Index for fast lookups by participant
CREATE INDEX IF NOT EXISTS idx_life_wheel_participant ON life_wheel_entries(participant_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_life_wheel_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_life_wheel_updated_at ON life_wheel_entries;
CREATE TRIGGER trigger_life_wheel_updated_at
  BEFORE UPDATE ON life_wheel_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_life_wheel_updated_at();
