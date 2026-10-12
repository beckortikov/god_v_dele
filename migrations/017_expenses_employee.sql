-- Связь расхода «Зарплаты» с сотрудником.
-- Форма расхода уже отправляет employee_id (выплата попадает в зарплатную
-- ведомость), но колонки в таблице не было: сохранение падало с ошибкой
-- «Could not find the 'employee_id' column of 'expenses'». API теперь сохраняет
-- расход и без колонки, а после этой миграции ещё и запоминает сотрудника,
-- чтобы при редактировании он не терялся.
-- Только добавляет колонку, существующие данные не меняются.
--
-- Откат:
--   DROP INDEX IF EXISTS idx_expenses_employee_id;
--   ALTER TABLE expenses DROP COLUMN IF EXISTS employee_id;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_employee_id ON expenses (employee_id) WHERE employee_id IS NOT NULL;

-- Чтобы PostgREST сразу увидел новую колонку.
NOTIFY pgrst, 'reload schema';
