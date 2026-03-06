import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-client';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString());
        const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

        // Get time logs for the month
        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

        const { data: logs, error: logsError } = await supabaseAdmin
            .from('time_logs')
            .select('*, employee:employees(first_name, last_name, position)')
            .gte('work_date', startDate)
            .lte('work_date', endDate)
            .eq('status', 'completed');

        if (logsError) {
            return NextResponse.json({ error: logsError.message }, { status: 500 });
        }

        // Group by employee
        const employeeMap = new Map();

        for (const log of (logs || [])) {
            const empId = log.employee_id;
            if (!employeeMap.has(empId)) {
                employeeMap.set(empId, {
                    employee_id: empId,
                    employee_name: `${log.employee?.first_name || ''} ${log.employee?.last_name || ''}`,
                    position: log.employee?.position || '',
                    unique_days: new Set(),
                    total_minutes: 0,
                });
            }

            const empData = employeeMap.get(empId);
            empData.unique_days.add(log.work_date);
            empData.total_minutes += (log.duration_minutes || 0);
        }

        const result = Array.from(employeeMap.values()).map(emp => ({
            employee_id: emp.employee_id,
            employee_name: emp.employee_name,
            position: emp.position,
            days_worked: emp.unique_days.size,
            total_minutes: emp.total_minutes
        }));

        // Sort by name
        result.sort((a, b) => a.employee_name.localeCompare(b.employee_name));

        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
