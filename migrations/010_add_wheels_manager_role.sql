-- Migration: 010_add_wheels_manager_role.sql
-- Description: Update app_users_role_check constraint to support 'wheels_manager' role

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'finance', 'participant', 'employee', 'manager', 'wheels_manager'));
