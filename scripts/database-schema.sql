-- ============================================
-- План–Факт Database Schema
-- For Supabase Project
-- ============================================

-- ============================================
-- 1. Programs Table (Программы обучения)
-- ============================================
CREATE TABLE IF NOT EXISTS programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  price_per_month NUMERIC NOT NULL,
  duration_months INTEGER DEFAULT 12,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. Participants Table (Участники)
-- ============================================
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 3. Monthly Payments Table (Ежемесячные платежи)
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  payment_month TEXT NOT NULL, -- e.g., 'Январь', 'Февраль'
  month_number INTEGER NOT NULL, -- 1-12
  year INTEGER NOT NULL,
  plan_amount NUMERIC NOT NULL,
  fact_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'partial', 'overdue', 'pending')),
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(participant_id, month_number, year)
);

-- ============================================
-- 4. Offline Events Table (Оффлайн мероприятия)
-- ============================================
CREATE TABLE IF NOT EXISTS offline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  location TEXT,
  budget NUMERIC NOT NULL,
  actual_cost NUMERIC DEFAULT 0,
  participants_count INTEGER,
  revenue NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 5. Expenses Table (Расходы)
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL, -- e.g., 'Marketing', 'Operations', 'Personnel'
  event_id UUID REFERENCES offline_events(id) ON DELETE SET NULL,
  expense_date DATE NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 6. Monthly Forecasts Table (Прогнозы на месяц)
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_number INTEGER NOT NULL, -- 1-12
  year INTEGER NOT NULL,
  planned_income NUMERIC NOT NULL,
  planned_expenses NUMERIC NOT NULL,
  optimistic_income NUMERIC,
  pessimistic_income NUMERIC,
  confidence_level NUMERIC DEFAULT 0.95, -- 0-1
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(month_number, year)
);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX idx_participants_program_id ON participants(program_id);
CREATE INDEX idx_participants_status ON participants(status);
CREATE INDEX idx_participants_start_date ON participants(start_date);

CREATE INDEX idx_monthly_payments_participant_id ON monthly_payments(participant_id);
CREATE INDEX idx_monthly_payments_month_year ON monthly_payments(month_number, year);
CREATE INDEX idx_monthly_payments_status ON monthly_payments(status);

CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_event_id ON expenses(event_id);

CREATE INDEX idx_offline_events_event_date ON offline_events(event_date);
CREATE INDEX idx_offline_events_status ON offline_events(status);

CREATE INDEX idx_monthly_forecasts_month_year ON monthly_forecasts(month_number, year);

-- ============================================
-- Sample Data
-- ============================================

-- Programs
INSERT INTO programs (name, description, price_per_month, duration_months) VALUES
('Основной курс', 'Полный курс обучения на 12 месяцев', 5000, 12),
('Продвинутый курс', 'Углубленный курс для опытных участников', 8000, 12),
('Мини курс', 'Краткосрочный курс основ', 3000, 12)
ON CONFLICT (name) DO NOTHING;
