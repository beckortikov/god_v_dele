'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Download, Filter, CheckCircle, AlertCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner' // Assuming sonner or generic alert

interface PayrollRecord {
    id: string
    employee_id: string
    month_number: number
    year: number
    base_salary: number
    bonus_amount: number
    deduction_amount: number
    total_amount: number
    status: 'pending' | 'paid' | 'cancelled'
    payment_date: string | null
    employees?: {
        first_name: string
        last_name: string
        position: string
    }
}

export function PayrollPage() {
    const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth() + 1))
    const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))
    const [payrollData, setPayrollData] = useState<PayrollRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        fetchPayroll()
    }, [selectedMonth, selectedYear])

    const fetchPayroll = async () => {
        setIsLoading(true)
        try {
            const res = await fetch(`/api/hr/payroll?month=${selectedMonth}&year=${selectedYear}`)
            if (res.ok) {
                const data = await res.json()
                setPayrollData(data)
            }
        } catch (error) {
            console.error('Failed to fetch payroll', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleGenerate = async () => {
        if (!confirm(`Сформировать ведомость за ${selectedMonth}.${selectedYear}? Это создаст черновики для всех активных сотрудников.`)) return;

        try {
            // 1. Fetch active employees
            const empRes = await fetch('/api/hr/employees');
            const employees = await empRes.json();

            // 2. Create records
            // Ideally should be a bulk backend operation, but iterating for now
            let createdCount = 0;
            for (const emp of employees) {
                if (emp.status !== 'active') continue;

                // Check if already exists (simplified check here, mostly relying on backend or ignoring dupes logic if we had it, 
                // but checking local state is safer or just letting backend handle UNIQUE constraints if any. 
                // Our schema defines UNIQUE(employee_id, month_number, year) index? No, it defines INDEX but not UNIQUE constraint in schema provided.
                // Wait, unique index IS creating unique constraint usually if defined as UNIQUE INDEX or just INDEX?
                // Schema said: CREATE INDEX idx_payroll_employee_period. That is NOT a unique constraint.
                // So we should be careful not to duplicate.
                // Let's check if record exists in current `payrollData`
                const exists = payrollData.find(p => p.employee_id === emp.id);
                if (exists) continue;

                const res = await fetch('/api/hr/payroll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        employee_id: emp.id,
                        month_number: Number(selectedMonth),
                        year: Number(selectedYear),
                        base_salary: emp.base_salary,
                        bonus_amount: 0,
                        deduction_amount: 0,
                        total_amount: emp.base_salary, // Simple logic
                        status: 'pending'
                    })
                });

                if (res.ok) {
                    createdCount++;
                } else {
                    console.error('Failed to create record for', emp.first_name, await res.text());
                }
            }

            if (createdCount > 0) {
                alert(`Создано записей: ${createdCount}`);
                fetchPayroll();
            } else {
                alert('Ведомость уже сформирована (или нет активных сотрудников)');
            }

        } catch (error) {
            console.error('Error generating payroll', error)
        }
    }

    const handlePay = async (record: PayrollRecord) => {
        if (!confirm(`Подтвердить выплату для ${record.employees?.first_name}? Это также создаст расход в Финансах.`)) return;
        await handleStatusChange(record, 'paid');
    }

    const handleStatusChange = async (record: PayrollRecord, newStatus: PayrollRecord['status']) => {
        try {
            const res = await fetch(`/api/hr/payroll/${record.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: newStatus,
                    payment_date: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null
                })
            });

            if (res.ok) {
                fetchPayroll();
            } else {
                alert('Ошибка при обновлении статуса');
            }
        } catch (error) {
            console.error('Error updating status', error);
        }
    }

    const handleDelete = async (record: PayrollRecord) => {
        if (!confirm('Вы уверены, что хотите удалить эту запись?')) return;

        try {
            const res = await fetch(`/api/hr/payroll/${record.id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchPayroll();
            } else {
                alert('Ошибка при удалении');
            }
        } catch (error) {
            console.error('Error deleting record', error);
        }
    }

    // Stats
    const totalAmount = payrollData.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
    const paidAmount = payrollData.filter(i => i.status === 'paid').reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
    const pendingAmount = payrollData.filter(i => i.status === 'pending').reduce((sum, item) => sum + Number(item.total_amount || 0), 0)

    const monthOptions = [
        { val: '1', label: 'Январь' }, { val: '2', label: 'Февраль' }, { val: '3', label: 'Март' },
        { val: '4', label: 'Апрель' }, { val: '5', label: 'Май' }, { val: '6', label: 'Июнь' },
        { val: '7', label: 'Июль' }, { val: '8', label: 'Август' }, { val: '9', label: 'Сентябрь' },
        { val: '10', label: 'Октябрь' }, { val: '11', label: 'Ноябрь' }, { val: '12', label: 'Декабрь' },
    ]

    return (
        <div className="p-4 sm:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold">Зарплата</h1>
                <div className="flex items-center gap-2">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Месяц" />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(m => <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="Год" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2025">2025</SelectItem>
                            <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="default" onClick={handleGenerate}>
                        <Plus className="w-4 h-4 mr-2" />
                        Сформировать
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Фонд оплаты труда</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalAmount.toLocaleString()} TJS</div>
                        <p className="text-xs text-muted-foreground">Начислено за период</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Выплачено</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{paidAmount.toLocaleString()} TJS</div>
                        <p className="text-xs text-muted-foreground">Фактические выплаты</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Задолженность</CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{pendingAmount.toLocaleString()} TJS</div>
                        <p className="text-xs text-muted-foreground">Остаток к выплате</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Ведомость</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Сотрудник</TableHead>
                                <TableHead>Оклад</TableHead>
                                <TableHead>Премии</TableHead>
                                <TableHead>Вычеты</TableHead>
                                <TableHead>К выплате</TableHead>
                                <TableHead>Статус</TableHead>
                                <TableHead className="text-right">Действия</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-4">Загрузка...</TableCell>
                                </TableRow>
                            ) : payrollData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Нет данных. Нажмите "Сформировать", чтобы создать ведомость.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                payrollData.map(record => (
                                    <TableRow key={record.id}>
                                        <TableCell>
                                            <div className="font-medium">{record.employees?.first_name} {record.employees?.last_name}</div>
                                            <div className="text-xs text-muted-foreground">{record.employees?.position}</div>
                                        </TableCell>
                                        <TableCell>{record.base_salary.toLocaleString()}</TableCell>
                                        <TableCell className="text-green-600">+{record.bonus_amount.toLocaleString()}</TableCell>
                                        <TableCell className="text-red-600">-{record.deduction_amount.toLocaleString()}</TableCell>
                                        <TableCell className="font-bold">{record.total_amount.toLocaleString()} TJS</TableCell>
                                        <TableCell>
                                            <Badge variant={record.status === 'paid' ? 'default' : 'secondary'} className={
                                                record.status === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                                                    record.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                            }>
                                                {record.status === 'paid' ? 'Выплачено' :
                                                    record.status === 'cancelled' ? 'Отменено' : 'Ожидает'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {record.status === 'paid' && (
                                                    <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleStatusChange(record, 'cancelled')}>
                                                        Отменить
                                                    </Button>
                                                )}
                                                {record.status === 'cancelled' && (
                                                    <Button size="sm" variant="outline" onClick={() => handleStatusChange(record, 'pending')}>
                                                        Вернуть
                                                    </Button>
                                                )}
                                                <Button size="sm" variant="ghost" className="text-gray-400 hover:text-red-600" onClick={() => handleDelete(record)}>
                                                    <span className="sr-only">Удалить</span>
                                                    ×
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
