-- Drop foreign key constraints on wheel tables
-- This allows staff users (employees, managers, etc.) who are not in the participants table to save their own wheels.

ALTER TABLE life_wheel_entries DROP CONSTRAINT IF EXISTS life_wheel_entries_participant_id_fkey;
ALTER TABLE life_balance_entries DROP CONSTRAINT IF EXISTS life_balance_entries_participant_id_fkey;
ALTER TABLE business_wheel_entries DROP CONSTRAINT IF EXISTS business_wheel_entries_participant_id_fkey;
