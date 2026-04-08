-- Add last_login_at to app_users
ALTER TABLE app_users
ADD COLUMN last_login_at TIMESTAMPTZ;
