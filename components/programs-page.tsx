'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Trash2, AlertCircle, BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Program {
    id: string
    name: string
    price_per_month: number
    duration_months: number
}

export function ProgramsPage() {
    const [programs, setPrograms] = useState<Program[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [submitLoading, setSubmitLoading] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        price_per_month: '',
        duration_months: ''
    })

    useEffect(() => {
        fetchPrograms()
    }, [])

    const fetchPrograms = async () => {
        try {
            const res = await fetch('/api/programs')
            const result = await res.json()
            if (result.error) throw new Error(result.error)
            setPrograms(result.data || [])
            setLoading(false)
        } catch (err: any) {
            setError(err.message)
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Вы уверены, что хотите удалить эту программу?')) return

        try {
            const res = await fetch(`/api/programs/${id}`, { method: 'DELETE' })
            const result = await res.json()
            if (result.error) throw new Error(result.error)

            setPrograms(programs.filter(p => p.id !== id))
        } catch (err: any) {
            alert('Ошибка при удалении: ' + err.message)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitLoading(true)

        try {
            const payload = {
                name: formData.name,
                price_per_month: Number(formData.price_per_month),
                duration_months: Number(formData.duration_months)
            }

            const res = await fetch('/api/programs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const result = await res.json()
            if (result.error) throw new Error(result.error)

            setPrograms([...programs, result.data])
            setIsAddOpen(false)
            setFormData({ name: '', price_per_month: '', duration_months: '' })
        } catch (err: any) {
            alert('Ошибка при создании: ' + err.message)
        } finally {
            setSubmitLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Загрузка программ...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6 bg-background">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Программы обучения</h2>
                    <p className="text-sm text-muted-foreground mt-1">Управление образовательными продуктами</p>
                </div>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="w-4 h-4" />
                            Добавить программу
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Новая программа</DialogTitle>
                            <DialogDescription>
                                Заполните данные о новой образовательной программе
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Название</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Например: Фундамент"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="cost">Цена за месяц ($)</Label>
                                    <Input
                                        id="cost"
                                        type="number"
                                        value={formData.price_per_month}
                                        onChange={e => setFormData({ ...formData, price_per_month: e.target.value })}
                                        placeholder="1000"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="duration">Длительность (мес)</Label>
                                    <Input
                                        id="duration"
                                        type="number"
                                        value={formData.duration_months}
                                        onChange={e => setFormData({ ...formData, duration_months: e.target.value })}
                                        placeholder="12"
                                        required
                                    />
                                </div>
                            </div>
                            <Button type="submit" className="w-full" disabled={submitLoading}>
                                {submitLoading ? 'Сохранение...' : 'Создать программу'}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Название</TableHead>
                            <TableHead>Цена за месяц</TableHead>
                            <TableHead>Длительность</TableHead>
                            <TableHead className="text-right">Действия</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {programs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                    Программ пока нет. Создайте первую программу.
                                </TableCell>
                            </TableRow>
                        ) : (
                            programs.map((program) => (
                                <TableRow key={program.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <BookOpen className="w-4 h-4 text-primary" />
                                            {program.name}
                                        </div>
                                    </TableCell>
                                    <TableCell>${Number(program.price_per_month || 0).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">
                                            {program.duration_months} мес.
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDelete(program.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {error && (
                <div className="mt-4 p-4 border border-destructive/20 bg-destructive/5 rounded-md flex items-center gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4" />
                    <p>{error}</p>
                </div>
            )}
        </div>
    )
}
