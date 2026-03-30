-- Migration: 001_add_program_id_to_expenses
-- Description: Add program_id foreign key column to expenses table
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES programs(id) ON DELETE SET NULL;
