-- ============================================
-- HR System Database Schema
-- For God v Dele Platform
-- ============================================

-- ============================================
-- 1. Employees Table (Сотрудники)
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

-- ============================================
-- 2. Employee Schedules Table (График работы)
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

-- ============================================
-- 3. Payroll Table (Зарплата)
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

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_schedules_employee_date ON employee_schedules(employee_id, work_date);
CREATE INDEX idx_payroll_employee_period ON payroll(employee_id, month_number, year);
