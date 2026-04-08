-- Add participant_id to app_users
ALTER TABLE app_users
ADD COLUMN participant_id UUID REFERENCES participants(id) ON DELETE SET NULL;
