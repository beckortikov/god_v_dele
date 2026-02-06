import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // 1-12
        const year = searchParams.get('year');
        const employee_id = searchParams.get('employee_id');

        let query = supabaseAdmin
            .from('payroll')
            .select(`
        *,
        employees (
          first_name,
          last_name,
          position,
          base_salary
        )
      `)
            .order('year', { ascending: false })
            .order('month_number', { ascending: false });

        if (month) query = query.eq('month_number', month);
        if (year) query = query.eq('year', year);
        if (employee_id) query = query.eq('employee_id', employee_id);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching payroll:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { employee_id, month_number, year, bonus_amount = 0 } = body;

        if (!employee_id || !month_number || !year) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Fetch Employee Base Salary
        const { data: employee, error: empError } = await supabaseAdmin
            .from('employees')
            .select('base_salary')
            .eq('id', employee_id)
            .single();

        if (empError || !employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const baseSalary = Number(employee.base_salary);

        // 2. Calculate Working Days (Mon-Fri) in the month
        const startDate = new Date(year, month_number - 1, 1);
        const endDate = new Date(year, month_number, 0); // Last day of month
        const daysInMonth = endDate.getDate();
        let workingDays = 0;

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month_number - 1, d);
            const dayOfWeek = date.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0 = Sun, 6 = Sat
                workingDays++;
            }
        }

        // 3. Fetch Absent Days (unpaid_leave)
        // Format dates as YYYY-MM-DD for query
        const startStr = `${year}-${String(month_number).padStart(2, '0')}-01`;
        const endStr = `${year}-${String(month_number).padStart(2, '0')}-${daysInMonth}`;

        const { count: absentCount, error: scheduleError } = await supabaseAdmin
            .from('employee_schedules')
            .select('*', { count: 'exact', head: true })
            .eq('employee_id', employee_id)
            .gte('work_date', startStr)
            .lte('work_date', endStr)
            .eq('shift_type', 'unpaid_leave'); // Only deducting for unpaid leave

        if (scheduleError) {
            console.error('Error fetching schedule:', scheduleError);
        }

        const actualAbsentDays = absentCount || 0;

        // 4. Calculate Deduction
        let deductionAmount = 0;
        if (workingDays > 0 && actualAbsentDays > 0) {
            const dailyRate = baseSalary / workingDays;
            deductionAmount = Math.round(dailyRate * actualAbsentDays);
        }

        // 5. Calculate Total
        const totalAmount = baseSalary + Number(bonus_amount) - deductionAmount;

        // 6. Insert Record
        const payload = {
            employee_id,
            month_number,
            year,
            base_salary: baseSalary,
            bonus_amount: Number(bonus_amount),
            deduction_amount: deductionAmount,
            total_amount: totalAmount,
            status: body.status || 'pending'
        };

        const { data, error } = await supabaseAdmin
            .from('payroll')
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error('Error creating payroll record:', error);
            // Check for checking duplicate constraint manually if needed, but assuming unique index helps
            if (error.code === '23505') { // Unique violation
                return NextResponse.json({ error: 'Payroll record already exists for this month' }, { status: 409 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
