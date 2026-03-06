'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock } from 'lucide-react'

export function TimesheetPage() {
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [month, setMonth] = useState((new Date().getMonth() + 1).toString())
    const [year, setYear] = useState(new Date().getFullYear().toString())

    useEffect(() => {
        setLoading(true)
        fetch(`/api/hr/timesheet?month=${month}&year=${year}`)
            .then(res => res.json())
            .then(result => {
                if (!result.error) {
                    setData(result)
                }
                setLoading(false)
            })
            .catch(err => {
                console.error(err)
                setLoading(false)
            })
    }, [month, year])

    const months = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ]
    const years = ['2025', '2026', '2027']

    return (
        <div className="p-4 sm:p-6 space-y-6 bg-background">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Табель учета времени</h1>
                    <p className="text-sm text-muted-foreground">Детальный отчет по отработанным часам сотрудников</p>
                </div>

                <div className="flex gap-2">
                    <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Месяц" />
                        </SelectTrigger>
                        <SelectContent>
                            {months.map((m, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="Год" />
                        </SelectTrigger>
                        <SelectContent>
                            {years.map(y => (
                                <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Card className="border-border">
                {loading ? (
                    <div className="p-8 text-center text-muted-foreground">Загрузка данных...</div>
                ) : data.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                        <Clock className="w-12 h-12 text-muted-foreground/30" />
                        <h3 className="text-lg font-medium text-foreground">Нет данных за этот период</h3>
                        <p className="text-sm text-muted-foreground">Сотрудники еще не отмечали свое рабочее время.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Сотрудник</TableHead>
                                    <TableHead>Должность</TableHead>
                                    <TableHead>Отработано дней</TableHead>
                                    <TableHead>Всего часов</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((row, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="font-medium">{row.employee_name}</TableCell>
                                        <TableCell>{row.position}</TableCell>
                                        <TableCell>{row.days_worked}</TableCell>
                                        <TableCell>{(row.total_minutes / 60).toFixed(1)} ч.</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </Card>
        </div>
    )
}
