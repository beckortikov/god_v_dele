-- ============================================
-- Migration: Add Accounts table for Multi-Account tracking
-- ============================================

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE, -- If null, it's a global/company account
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add account_id to track which account received the income / paid the expense
ALTER TABLE monthly_payments ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Create default accounts for existing programs to avoid breaking current data
INSERT INTO accounts (name, currency, program_id, is_default)
SELECT 'Основной счет ($)', 'USD', id, true FROM programs;

INSERT INTO accounts (name, currency, program_id, is_default)
SELECT 'Счет сомони (TJS)', 'TJS', id, false FROM programs;

-- Create some global accounts
INSERT INTO accounts (name, currency, is_default) VALUES ('Главная касса ($)', 'USD', true);
INSERT INTO accounts (name, currency, is_default) VALUES ('Главная касса (TJS)', 'TJS', false);
