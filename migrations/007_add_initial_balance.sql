-- ============================================
-- Migration: Add Initial Balance to Accounts
-- ============================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT 0;
