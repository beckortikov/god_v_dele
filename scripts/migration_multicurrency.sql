-- Migration to add multi-currency support
-- Run this in Supabase SQL Editor

ALTER TABLE monthly_payments 
ADD COLUMN currency VARCHAR DEFAULT 'USD',
ADD COLUMN original_amount DECIMAL,
ADD COLUMN exchange_rate DECIMAL;

-- If expenses table exists (checking structure from code inference, but safe to add if exists)
-- Assuming 'expenses' table exists based on previous context
ALTER TABLE expenses 
ADD COLUMN currency VARCHAR DEFAULT 'USD',
ADD COLUMN original_amount DECIMAL,
ADD COLUMN exchange_rate DECIMAL;
