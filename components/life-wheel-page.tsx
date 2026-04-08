'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Save, ChevronLeft, ChevronRight, PieChart, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// ─────────────────────────── Types ───────────────────────────
interface Participant {
    id: string
    name: string
    program?: { name: string }
    status: string
}

interface WheelCategory {
    id: string
    name: string
    value: number
    color: string
}

interface WheelEntry {
    id?: string
    participant_id: string
    period_type: 'weekly' | 'monthly'
    period_label: string
    categories: WheelCategory[]
}

// ─────────────────────────── Constants ───────────────────────────
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

const PALETTE = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#a855f7', '#84cc16',
]

const DEFAULT_CATEGORIES: WheelCategory[] = [
    { id: '1', name: 'Работа', value: 40, color: '#6366f1' },
    { id: '2', name: 'Семья', value: 20, color: '#ec4899' },
    { id: '3', name: 'Здоровье', value: 15, color: '#22c55e' },
    { id: '4', name: 'Обучение', value: 15, color: '#f97316' },
    { id: '5', name: 'Отдых', value: 10, color: '#14b8a6' },
]

// ─────────────────────────── Helpers ───────────────────────────
function getPeriodLabel(type: 'weekly' | 'monthly', offset: number): string {
    const now = new Date()
    if (type === 'monthly') {
        now.setMonth(now.getMonth() + offset)
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    } else {
        // ISO week number
        const d = new Date(now)
        d.setDate(d.getDate() + offset * 7)
        const onejan = new Date(d.getFullYear(), 0, 1)
        const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
        return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
}

function formatPeriodLabel(label: string, type: 'weekly' | 'monthly'): string {
    if (type === 'monthly') {
        const [year, month] = label.split('-')
        const date = new Date(parseInt(year), parseInt(month) - 1)
        return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    }
    const [year, week] = label.split('-W')
    return `${year} — Неделя ${week}`
}

function generateId() {
    return Math.random().toString(36).slice(2, 9)
}

// ─────────────────────────── SVG Pie Chart ───────────────────────────
function PieChartSVG({ categories }: { categories: WheelCategory[] }) {
    // Увеличим viewBox до 600x500 чтобы текст по бокам не обрезался
    const width = 600
    const height = 500
    const cx = width / 2
    const cy = height / 2
    const r = 150       // чуть уменьшили радиус с 160 до 150 для верности
    const inner = 70

    const total = categories.reduce((s, c) => s + (c.value || 0), 0)
    if (total === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[350px] text-muted-foreground gap-2">
                <PieChart className="w-16 h-16 opacity-30" />
                <p className="text-sm">Добавьте категории</p>
            </div>
        )
    }

    let cumAngle = -Math.PI / 2

    const slices = categories
        .filter(c => c.value > 0)
        .map(c => {
            const pct = c.value / total
            const angle = pct * 2 * Math.PI
            const startAngle = cumAngle
            cumAngle += angle
            const endAngle = cumAngle

            const x1 = cx + r * Math.cos(startAngle)
            const y1 = cy + r * Math.sin(startAngle)
            const x2 = cx + r * Math.cos(endAngle)
            const y2 = cy + r * Math.sin(endAngle)

            const ix1 = cx + inner * Math.cos(startAngle)
            const iy1 = cy + inner * Math.sin(startAngle)
            const ix2 = cx + inner * Math.cos(endAngle)
            const iy2 = cy + inner * Math.sin(endAngle)

            const largeArc = angle > Math.PI ? 1 : 0

            const midAngle = startAngle + angle / 2

            // Leader line: start at slice edge, elbow, then horizontal to label
            const lineR1 = r + 15
            const lineR2 = r + 35
            const lx1 = cx + lineR1 * Math.cos(midAngle)
            const ly1 = cy + lineR1 * Math.sin(midAngle)
            const lx2 = cx + lineR2 * Math.cos(midAngle)
            const ly2 = cy + lineR2 * Math.sin(midAngle)
            const isRight = Math.cos(midAngle) >= 0
            const lx3 = lx2 + (isRight ? 25 : -25)
            const ly3 = ly2

            // Label position
            const labelX = lx3 + (isRight ? 6 : -6)
            const labelY = ly3
            const textAnchor = (isRight ? 'start' : 'end') as 'start' | 'end'

            const d = [
                `M ${ix1} ${iy1}`,
                `L ${x1} ${y1}`,
                `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
                `L ${ix2} ${iy2}`,
                `A ${inner} ${inner} 0 ${largeArc} 0 ${ix1} ${iy1}`,
                'Z',
            ].join(' ')

            return { d, pct, color: c.color, name: c.name, value: c.value, midAngle, lx1, ly1, lx2, ly2, lx3, ly3, labelX, labelY, textAnchor }
        })

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[600px] drop-shadow-sm" aria-label="Диаграмма времени">
            {/* Slices */}
            {slices.map((s, i) => (
                <g key={i}>
                    <path
                        d={s.d}
                        fill={s.color}
                        stroke="hsl(var(--background))"
                        strokeWidth="2"
                        className="hover:opacity-85 transition-opacity cursor-pointer"
                        style={{ filter: `drop-shadow(0 1px 4px ${s.color}55)` }}
                    />
                </g>
            ))}

            {/* Center label */}
            <circle cx={cx} cy={cy} r={inner - 2} fill="hsl(var(--background))" />
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="24" fontWeight="bold" fill="hsl(var(--foreground))">
                {total}%
            </text>
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize="13" fill="hsl(var(--muted-foreground))">
                итого
            </text>

            {/* Leader lines + labels — only when slice is big enough */}
            {slices.map((s, i) => (
                s.pct > 0.03 && (
                    <g key={`label-${i}`}>
                        {/* Leader line */}
                        <polyline
                            points={`${s.lx1},${s.ly1} ${s.lx2},${s.ly2} ${s.lx3},${s.ly3}`}
                            fill="none"
                            stroke={s.color}
                            strokeWidth="1.2"
                            opacity="0.8"
                        />
                        {/* Dot at elbow */}
                        <circle cx={s.lx3} cy={s.ly3} r="2.5" fill={s.color} />
                        {/* Name */}
                        <text
                            x={s.labelX}
                            y={s.labelY - 8}
                            textAnchor={s.textAnchor}
                            fontSize="15"
                            fontWeight="600"
                            fill="hsl(var(--foreground))"
                        >
                            {s.name.length > 14 ? s.name.slice(0, 14) + '…' : s.name}
                        </text>
                        {/* Percentage */}
                        <text
                            x={s.labelX}
                            y={s.labelY + 12}
                            textAnchor={s.textAnchor}
                            fontSize="14"
                            fill={s.color}
                            fontWeight="700"
                        >
                            {Math.round(s.pct * 100)}%
                        </text>
                    </g>
                )
            ))}
        </svg>
    )
}


// ─────────────────────────── Main Component ───────────────────────────
interface LifeWheelPageProps {
    // If provided, the component works in participant self-view mode
    participantId?: string
    participantName?: string
}

export function LifeWheelPage({ participantId: fixedParticipantId, participantName }: LifeWheelPageProps = {}) {
    const isParticipantMode = !!fixedParticipantId

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
    const [periodOffset, setPeriodOffset] = useState(0)
    const [categories, setCategories] = useState<WheelCategory[]>(DEFAULT_CATEGORIES)
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [history, setHistory] = useState<Array<{ label: string; period_type: string }>>([])

    const currentLabel = getPeriodLabel(periodType, periodOffset)
    const total = categories.reduce((s, c) => s + (c.value || 0), 0)
    const isOverLimit = total > 100
    const selectedParticipant = participants.find(p => p.id === selectedParticipantId)

    // ── Fetch list of participants (admin mode only)
    useEffect(() => {
        if (isParticipantMode) return
        fetch('/api/participants')
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) setParticipants(data.filter((p: Participant) => p.status === 'active'))
            })
            .catch(console.error)
    }, [isParticipantMode])

    // ── Fetch wheel entry for selected participant + period
    const fetchEntry = useCallback(async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        setIsLoading(true)

        let pType = periodType
        let pLabel = currentLabel

        if (pid === TEMPLATE_ID) {
            pType = 'monthly'
            pLabel = 'template'
        }

        try {
            const params = new URLSearchParams({
                participant_id: pid,
                period_type: pType,
                period_label: pLabel,
            })
            const res = await fetch(`/api/life-wheel?${params}`)
            const { data } = await res.json()
            if (data && data.length > 0 && data[0].categories?.length > 0) {
                setCategories(data[0].categories)
            } else {
                // If it's a real user and they have no data, try fetching the global template first
                if (pid !== TEMPLATE_ID) {
                    try {
                        const tempRes = await fetch(`/api/life-wheel?participant_id=${TEMPLATE_ID}&period_type=monthly&period_label=template`)
                        const tempJson = await tempRes.json()
                        if (tempJson.data && tempJson.data.length > 0 && tempJson.data[0].categories?.length > 0) {
                            setCategories(tempJson.data[0].categories)
                            setIsLoading(false)
                            return
                        }
                    } catch (err) { console.error('Failed to fetch template', err) }
                }
                setCategories(DEFAULT_CATEGORIES)
            }
        } catch (e) {
            console.error(e)
            setCategories(DEFAULT_CATEGORIES)
        } finally {
            setIsLoading(false)
        }
    }, [fixedParticipantId, selectedParticipantId, periodType, currentLabel])

    useEffect(() => {
        fetchEntry()
    }, [fetchEntry])

    // ── Fetch history (last 6 periods)
    useEffect(() => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        fetch(`/api/life-wheel?participant_id=${pid}`)
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setHistory(data.map((e: any) => ({ label: e.period_label, period_type: e.period_type })))
                }
            })
            .catch(console.error)
    }, [fixedParticipantId, selectedParticipantId, saveStatus])

    // ── Category operations
    const addCategory = () => {
        const nextColor = PALETTE[categories.length % PALETTE.length]
        setCategories(prev => [...prev, { id: generateId(), name: '', value: 0, color: nextColor }])
    }

    const updateCategory = (id: string, field: 'name' | 'value' | 'color', val: string | number) => {
        setCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))
    }

    const removeCategory = (id: string) => {
        setCategories(prev => prev.filter(c => c.id !== id))
    }

    const resetToDefault = () => {
        setCategories(DEFAULT_CATEGORIES)
    }

    // ── Save
    const handleSave = async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        if (isOverLimit) return

        setIsSaving(true)
        setSaveStatus('idle')

        let pType = periodType
        let pLabel = currentLabel
        if (pid === TEMPLATE_ID) {
            pType = 'monthly'
            pLabel = 'template'
        }

        try {
            const res = await fetch('/api/life-wheel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participant_id: pid,
                    period_type: pType,
                    period_label: pLabel,
                    categories,
                }),
            })
            const result = await res.json()
            if (result.error) throw new Error(result.error)
            setSaveStatus('success')
            setTimeout(() => setSaveStatus('idle'), 3000)
        } catch (e: any) {
            setSaveStatus('error')
            alert('Ошибка сохранения: ' + e.message)
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="p-4 sm:p-6 space-y-6 min-h-full bg-background">
            {/* ── Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <span className="text-2xl">🎯</span>
                        Колесо баланса
                        {isParticipantMode && participantName && (
                            <Badge variant="secondary" className="ml-2 text-sm font-normal">{participantName}</Badge>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Распределение времени по категориям жизни</p>
                </div>

                <div className="flex items-center gap-2">
                    {saveStatus === 'success' && (
                        <span className="flex items-center gap-1 text-sm text-green-600 animate-in fade-in">
                            <CheckCircle2 className="w-4 h-4" /> Сохранено
                        </span>
                    )}
                    {saveStatus === 'error' && (
                        <span className="flex items-center gap-1 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4" /> Ошибка
                        </span>
                    )}
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || !selectedParticipantId || isOverLimit}
                        className="gap-2 min-w-[120px]"
                        id="life-wheel-save-btn"
                    >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                </div>
            </div>

            {/* ── Controls: Participant + Period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Participant selector (admin only) */}
                {!isParticipantMode && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Участник</label>
                        <select
                            value={selectedParticipantId}
                            onChange={e => { setSelectedParticipantId(e.target.value); setPeriodOffset(0) }}
                            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            id="life-wheel-participant-select"
                        >
                            <option value="">— Выберите участника —</option>
                            <option value={TEMPLATE_ID}>⚙️ Базовый шаблон (для всех)</option>
                            {participants.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Period type (Hidden if template) */}
                {selectedParticipantId !== TEMPLATE_ID && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Период</label>
                        <div className="flex rounded-lg border border-border overflow-hidden">
                            {(['monthly', 'weekly'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => { setPeriodType(t); setPeriodOffset(0) }}
                                    className={`flex-1 py-2 text-sm font-medium transition-colors ${periodType === t
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-background text-muted-foreground hover:bg-muted/50'
                                        }`}
                                    id={`period-type-${t}`}
                                >
                                    {t === 'monthly' ? 'Месяц' : 'Неделя'}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Period navigation (Hidden if template) */}
                {selectedParticipantId !== TEMPLATE_ID && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Выбор</label>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPeriodOffset(o => o - 1)}
                            className="p-2 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                            id="period-prev-btn"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex-1 text-center">
                            <p className="text-sm font-semibold text-foreground capitalize">
                                {formatPeriodLabel(currentLabel, periodType)}
                            </p>
                            {periodOffset < 0 && (
                                <p className="text-[10px] text-muted-foreground">
                                    {Math.abs(periodOffset)} {Math.abs(periodOffset) === 1 ? (periodType === 'monthly' ? 'месяц' : 'неделю') : (periodType === 'monthly' ? 'месяца' : 'недели')} назад
                                </p>
                            )}
                            {periodOffset === 0 && <p className="text-[10px] text-primary">текущий период</p>}
                            {periodOffset > 0 && (
                                <p className="text-[10px] text-muted-foreground">
                                    {periodOffset} {periodType === 'monthly' ? 'мес. вперёд' : 'нед. вперёд'}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => setPeriodOffset(o => o + 1)}
                            className="p-2 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                            id="period-next-btn"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                )}
            </div>

            {/* ── Main content */}
            {!selectedParticipantId && !isParticipantMode ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
                    <PieChart className="w-16 h-16 opacity-20" />
                    <p className="text-lg font-medium">Выберите участника</p>
                    <p className="text-sm">чтобы увидеть или заполнить колесо баланса</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* ── Left: Table editor */}
                    <Card className="p-4 sm:p-6 space-y-4 border-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold text-foreground">Категории</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Укажите % времени для каждой сферы жизни</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                                <button
                                    onClick={resetToDefault}
                                    className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                                    title="Сбросить к стандартным"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <Button size="sm" variant="outline" onClick={addCategory} className="gap-1.5" id="add-category-btn">
                                    <Plus className="w-3.5 h-3.5" /> Добавить
                                </Button>
                            </div>
                        </div>

                        {/* Total progress bar */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Итого</span>
                                <span className={`font-semibold ${isOverLimit ? 'text-red-500' : total === 100 ? 'text-green-600' : 'text-foreground'}`}>
                                    {total}% {isOverLimit ? '⚠️ превышает 100%' : total === 100 ? '✓ идеально' : `(осталось ${100 - total}%)`}
                                </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : total === 100 ? 'bg-green-500' : 'bg-primary'}`}
                                    style={{ width: `${Math.min(total, 100)}%` }}
                                />
                            </div>
                        </div>

                        {/* Category rows */}
                        <div className="space-y-2">
                            {categories.map((cat) => (
                                <div key={cat.id} className="flex items-center gap-2 group">
                                    {/* Color picker */}
                                    <div className="relative flex-shrink-0">
                                        <input
                                            type="color"
                                            value={cat.color}
                                            onChange={e => updateCategory(cat.id, 'color', e.target.value)}
                                            className="w-8 h-8 rounded-lg border-2 border-border cursor-pointer p-0.5 bg-transparent"
                                            title="Выберите цвет"
                                        />
                                    </div>

                                    {/* Name */}
                                    <Input
                                        placeholder="Название категории"
                                        value={cat.name}
                                        onChange={e => updateCategory(cat.id, 'name', e.target.value)}
                                        className="flex-1 h-9 text-sm"
                                    />

                                    {/* Value */}
                                    <div className="relative flex-shrink-0 w-20">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={cat.value}
                                            onChange={e => updateCategory(cat.id, 'value', Math.max(0, Math.min(100, Number(e.target.value))))}
                                            className="h-9 text-sm pr-6 text-right"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                                    </div>

                                    {/* Delete */}
                                    <button
                                        onClick={() => removeCategory(cat.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-500 transition-all rounded-lg hover:bg-red-50 dark:hover:bg-red-950"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}

                            {categories.length === 0 && (
                                <div className="py-8 text-center text-muted-foreground">
                                    <p className="text-sm">Нет категорий. Добавьте первую!</p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* ── Right: Chart */}
                    <div className="space-y-4">
                        <Card className="p-4 sm:p-6 border-border flex flex-col items-center">
                            <h2 className="font-semibold text-foreground mb-4 self-start">Диаграмма</h2>
                            <PieChartSVG categories={categories} />
                        </Card>

                        {/* History */}
                        <Card className="p-4 sm:p-5 border-border">
                            <h3 className="text-sm font-semibold text-foreground mb-3">История сохраненных периодов</h3>
                            {history.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {history.slice(0, 8).map((h, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                const now = new Date()
                                                if (h.period_type === 'monthly') {
                                                    const [y, m] = h.label.split('-').map(Number)
                                                    const nowY = now.getFullYear()
                                                    const nowM = now.getMonth() + 1
                                                    const diff = (y - nowY) * 12 + (m - nowM)
                                                    setPeriodType('monthly')
                                                    setPeriodOffset(diff)
                                                } else {
                                                    setPeriodType('weekly')
                                                    const [y, w] = h.label.replace('W', '').split('-').map(Number)
                                                    const nowWeek = Math.ceil((((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7)
                                                    const diff = (y - now.getFullYear()) * 52 + (w - nowWeek)
                                                    setPeriodOffset(diff)
                                                }
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-sm border transition-colors
                                                ${h.label === currentLabel && h.period_type === periodType
                                                    ? 'bg-primary text-primary-foreground border-primary'
                                                    : 'border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                                                }`}
                                        >
                                            {h.label}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">Участник пока не сохранял результаты.</p>
                            )}
                        </Card>
                    </div>
                </div>
            )}
        </div>
    )
}

export default LifeWheelPage
