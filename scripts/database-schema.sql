-- ============================================
-- God v Dele - Unified Database Schema
-- Combined & Updated: 2026-02-13
-- ============================================

-- ============================================
-- 1. App Users & Authentication
-- ============================================
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL, -- Plain text as requested
    role TEXT NOT NULL CHECK (role IN ('admin', 'finance', 'participant', 'employee')),
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults
INSERT INTO app_users (username, password, role, full_name)
VALUES 
    ('admin', 'Admin123', 'admin', 'Администратор'),
    ('finance', 'Finance123', 'finance', 'Менеджер Финансов')
ON CONFLICT (username) DO NOTHING;

-- ============================================
-- 2. Programs Table (Программы обучения)
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

INSERT INTO programs (name, description, price_per_month, duration_months) VALUES
('Основной курс', 'Полный курс обучения на 12 месяцев', 5000, 12),
('Продвинутый курс', 'Углубленный курс для опытных участников', 8000, 12),
('Мини курс', 'Краткосрочный курс основ', 3000, 12)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 3. Participants Table (Участники)
-- ============================================
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  tariff NUMERIC, -- Custom monthly payment amount overrides program default
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_participants_program_id ON participants(program_id);
CREATE INDEX idx_participants_status ON participants(status);
CREATE INDEX idx_participants_start_date ON participants(start_date);

-- ============================================
-- 4. Monthly Payments Table (Ежемесячные платежи)
-- ============================================
CREATE TABLE IF NOT EXISTS monthly_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
  payment_month TEXT NOT NULL, -- e.g., 'Январь', 'Февраль'
  month_number INTEGER NOT NULL, -- 1-12
  year INTEGER NOT NULL,
  
  -- Financial Amounts
  plan_amount NUMERIC NOT NULL,
  fact_amount NUMERIC DEFAULT 0, -- Stored in Base Currency (usually USD)
  
  -- Multi-currency support
  currency VARCHAR DEFAULT 'USD',
  original_amount DECIMAL, -- Amount in original currency (e.g. TJS)
  exchange_rate DECIMAL,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'partial', 'overdue', 'pending')),
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(participant_id, month_number, year)
);

CREATE INDEX idx_monthly_payments_participant_id ON monthly_payments(participant_id);
CREATE INDEX idx_monthly_payments_month_year ON monthly_payments(month_number, year);
CREATE INDEX idx_monthly_payments_status ON monthly_payments(status);

-- ============================================
-- 5. Monthly Forecasts Table (Прогнозы на месяц)
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

CREATE INDEX idx_monthly_forecasts_month_year ON monthly_forecasts(month_number, year);

-- ============================================
-- 6. HR System: Employees (Сотрудники)
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  position TEXT NOT NULL, -- Должность
  department TEXT, -- Отдел
  
  -- Financial Info
  base_salary NUMERIC NOT NULL DEFAULT 0, -- Оклад
  currency TEXT DEFAULT 'TJS',
  
  -- Job Description
  responsibilities TEXT, -- Должностные обязанности
  valuable_final_product TEXT, -- Ценный конечный продукт (ЦКП)
  
  hire_date DATE DEFAULT CURRENT_DATE,
  birth_date DATE, -- Дата рождения
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'terminated')),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_employees_status ON employees(status);

-- ============================================
-- 7. HR System: Schedules (График работы)
-- ============================================
CREATE TABLE IF NOT EXISTS employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  work_date DATE NOT NULL,
  shift_type TEXT DEFAULT 'work' CHECK (shift_type IN ('work', 'day_off', 'sick_leave', 'vacation', 'unpaid_leave')),
  
  start_time TIME, -- NULL if day_off
  end_time TIME, -- NULL if day_off
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(employee_id, work_date)
);

CREATE INDEX idx_schedules_employee_date ON employee_schedules(employee_id, work_date);

-- ============================================
-- 8. HR System: Payroll (Зарплата)
-- ============================================
CREATE TABLE IF NOT EXISTS payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  
  month_number INTEGER NOT NULL, -- 1-12
  year INTEGER NOT NULL,
  
  base_salary NUMERIC NOT NULL,
  bonus_amount NUMERIC DEFAULT 0, -- Премии
  deduction_amount NUMERIC DEFAULT 0, -- Вычеты/Штрафы
  total_amount NUMERIC NOT NULL, -- Итого к выплате
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_date DATE,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payroll_employee_period ON payroll(employee_id, month_number, year);

-- ============================================
-- 9. Offline Events Module (Мероприятия)
-- ============================================

-- 9.1 Offline Events Table
CREATE TABLE IF NOT EXISTS offline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  location TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  
  -- Financials (Auto-calculated via Triggers)
  total_income NUMERIC DEFAULT 0,
  total_expenses NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  
  -- Stats (Auto-calculated)
  attendees_registered INTEGER DEFAULT 0,
  attendees_attended INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_offline_events_event_date ON offline_events(event_date);
CREATE INDEX idx_offline_events_status ON offline_events(status);

-- 9.2 Event Attendees (Income Source)
CREATE TABLE IF NOT EXISTS event_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES offline_events(id) ON DELETE CASCADE,
  
  -- Attendee Info
  attendee_type TEXT NOT NULL CHECK (attendee_type IN ('participant', 'guest')),
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL, -- if program participant
  guest_name TEXT, -- if guest
  guest_email TEXT,
  guest_phone TEXT,
  
  -- Financials: Income Only
  payment_received NUMERIC DEFAULT 0, -- Stored in USD (or base currency)
  currency TEXT DEFAULT 'USD',
  original_amount NUMERIC, -- Amount in original currency
  exchange_rate NUMERIC DEFAULT 1,
  payment_date DATE,
  payment_method TEXT, -- 'cash', 'card', 'transfer', 'other'
  payment_notes TEXT,
  
  -- Metadata
  registration_date TIMESTAMP DEFAULT NOW(),
  attendance_status TEXT DEFAULT 'registered' CHECK (
    attendance_status IN ('registered', 'confirmed', 'attended', 'cancelled', 'no_show')
  ),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_event_attendees_event_id ON event_attendees(event_id);
CREATE INDEX idx_event_attendees_participant_id ON event_attendees(participant_id);
CREATE INDEX idx_event_attendees_type ON event_attendees(attendee_type);
CREATE INDEX idx_event_attendees_status ON event_attendees(attendance_status);

-- 9.3 Expenses (Cost Source)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES offline_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL, -- Stored in USD
  currency TEXT DEFAULT 'USD',
  original_amount NUMERIC, -- Amount in original currency
  exchange_rate NUMERIC DEFAULT 1,
  category TEXT NOT NULL, -- e.g., 'Marketing', 'Venue', 'Catering'
  expense_date DATE NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_event_id ON expenses(event_id);

-- ============================================
-- 10. Triggers & Functions (Financial Automation)
-- ============================================

CREATE OR REPLACE FUNCTION update_event_financials()
RETURNS TRIGGER AS $$
DECLARE
  target_event_id UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_event_id := OLD.event_id;
  ELSE
    target_event_id := NEW.event_id;
  END IF;

  -- If event_id is null (e.g. global expense), skip update.
  IF target_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE offline_events
  SET 
    total_income = (
      SELECT COALESCE(SUM(payment_received), 0)
      FROM event_attendees
      WHERE event_id = target_event_id
    ),
    total_expenses = (
      SELECT COALESCE(SUM(amount), 0)
      FROM expenses
      WHERE event_id = target_event_id
    ),
    attendees_registered = (
      SELECT COUNT(*)
      FROM event_attendees
      WHERE event_id = target_event_id
        AND attendance_status != 'cancelled'
    ),
    attendees_attended = (
      SELECT COUNT(*)
      FROM event_attendees
      WHERE event_id = target_event_id
        AND attendance_status = 'attended'
    ),
    updated_at = NOW()
  WHERE id = target_event_id;
  
  -- Update balance
  UPDATE offline_events
  SET balance = total_income - total_expenses
  WHERE id = target_event_id;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for Event Attendees
CREATE TRIGGER trigger_update_event_financials
AFTER INSERT OR UPDATE OR DELETE ON event_attendees
FOR EACH ROW
EXECUTE FUNCTION update_event_financials();

-- Trigger for Expenses
CREATE TRIGGER trigger_update_event_financials_expenses
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW
EXECUTE FUNCTION update_event_financials();
