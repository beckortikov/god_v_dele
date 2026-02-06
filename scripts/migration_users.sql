-- Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, -- Storing plain text as requested for simplicity, but ideally should be hashed
    role TEXT NOT NULL CHECK (role IN ('admin', 'finance', 'participant', 'employee')),
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial users
INSERT INTO app_users (username, password, role, full_name)
VALUES 
    ('admin', 'Admin123', 'admin', 'Администратор'),
    ('finance', 'Finance123', 'finance', 'Менеджер Финансов')
ON CONFLICT (username) DO NOTHING;
