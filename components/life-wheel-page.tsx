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
    group?: string
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
    // 1. Здоровье и Энергия (Indigo)
    { id: '1', group: 'Здоровье и Энергия', name: 'Здоровье', value: 0, color: '#4f46e5' },
    { id: '2', group: 'Здоровье и Энергия', name: 'Спорт', value: 0, color: '#6366f1' },
    { id: '3', group: 'Здоровье и Энергия', name: 'Сон', value: 0, color: '#818cf8' },
    
    // 2. Семья и Отношения (Pink)
    { id: '4', group: 'Семья и Отношения', name: 'Жена', value: 0, color: '#be185d' },
    { id: '5', group: 'Семья и Отношения', name: 'Дети и их воспитание', value: 0, color: '#db2777' },
    { id: '6', group: 'Семья и Отношения', name: 'Родители', value: 0, color: '#ec4899' },
    { id: '7', group: 'Семья и Отношения', name: 'Братья, Сестры', value: 0, color: '#f472b6' },
    { id: '8', group: 'Семья и Отношения', name: 'Родственники', value: 0, color: '#f9a8d4' },
    { id: '9', group: 'Семья и Отношения', name: '2 ГА или любовница', value: 0, color: '#fbcfe8' },
    
    // 3. Бизнес и Работа (Blue)
    { id: '10', group: 'Бизнес и Работа', name: 'Операционка', value: 0, color: '#1d4ed8' },
    { id: '11', group: 'Бизнес и Работа', name: 'Сотрудники', value: 0, color: '#2563eb' },
    { id: '12', group: 'Бизнес и Работа', name: 'Стратегия - новый уровень', value: 0, color: '#3b82f6' },
    { id: '13', group: 'Бизнес и Работа', name: 'Планирование', value: 0, color: '#60a5fa' },
    { id: '14', group: 'Бизнес и Работа', name: 'Личный бренд', value: 0, color: '#93c5fd' },
    
    // 4. Окружение и Коммуникации (Purple)
    { id: '15', group: 'Окружение и Коммуникации', name: 'Друзья', value: 0, color: '#7e22ce' },
    { id: '16', group: 'Окружение и Коммуникации', name: 'Наставники', value: 0, color: '#9333ea' },
    { id: '17', group: 'Окружение и Коммуникации', name: 'Свадьбы - поседелки', value: 0, color: '#a855f7' },
    
    // 5. Личностный рост (Teal)
    { id: '18', group: 'Личностный рост', name: 'Саморазвитие', value: 0, color: '#0f766e' },
    { id: '19', group: 'Личностный рост', name: 'Чтение', value: 0, color: '#0d9488' },
    { id: '20', group: 'Личностный рост', name: 'Навыки', value: 0, color: '#14b8a6' },
    { id: '21', group: 'Личностный рост', name: 'Насмотренность - Идея', value: 0, color: '#2dd4bf' },
    
    // 6. Яркость жизни и Отдых (Orange)
    { id: '22', group: 'Яркость жизни и Отдых', name: 'Отдых - путешествие', value: 0, color: '#ea580c' },
    { id: '23', group: 'Яркость жизни и Отдых', name: 'Хобби', value: 0, color: '#f97316' },
    { id: '24', group: 'Яркость жизни и Отдых', name: 'Фильмы - Сериалы', value: 0, color: '#fb923c' },
    
    // 7. Духовность (Yellow)
    { id: '25', group: 'Духовность', name: 'Духовность', value: 0, color: '#eab308' },
    
    // 8. Пожиратели времени (Rose)
    { id: '26', group: 'Пожиратели времени', name: 'Соц. сети', value: 0, color: '#e11d48' },
    { id: '27', group: 'Пожиратели времени', name: 'Телевизоров', value: 0, color: '#f43f5e' },
    { id: '28', group: 'Пожиратели времени', name: 'Плохая привычка', value: 0, color: '#fb7185' }
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

// ─────────────────────────── SVG Sunburst Chart ───────────────────────────
function SunburstChartSVG({ categories }: { categories: WheelCategory[] }) {
    const width = 600
    const height = 500
    const cx = width / 2
    const cy = height / 2
    
    // Radii
    const rOuter = 210
    const rMid = 140
    const rInner = 80

    const total = categories.reduce((s, c) => s + (c.value || 0), 0)
    if (total === 0 || categories.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[350px] text-muted-foreground gap-2">
                <AlertCircle className="w-16 h-16 opacity-30" />
                <p className="text-sm">Нет данных для графика</p>
            </div>
        )
    }

    const grouped = new Map<string, { value: number; color: string; items: WheelCategory[] }>()
    categories.filter(c => c.value > 0).forEach(c => {
        const gName = (c.group && c.group.trim() !== '') ? c.group.trim() : 'Прочее'
        if (!grouped.has(gName)) {
            grouped.set(gName, { value: 0, color: c.color, items: [] })
        }
        const g = grouped.get(gName)!
        g.value += c.value
        g.items.push(c)
    })

    const createArc = (startAngle: number, angle: number, radiusInner: number, radiusOuter: number) => {
        // SVG paths typically break if a single arc approaches 360deg perfectly (2*PI)
        const safeAngle = Math.min(angle, Math.PI * 2 - 0.0001)
        const endAngle = startAngle + safeAngle
        
        const x1Inner = cx + radiusInner * Math.cos(startAngle)
        const y1Inner = cy + radiusInner * Math.sin(startAngle)
        const x2Inner = cx + radiusInner * Math.cos(endAngle)
        const y2Inner = cy + radiusInner * Math.sin(endAngle)
        
        const x1Outer = cx + radiusOuter * Math.cos(startAngle)
        const y1Outer = cy + radiusOuter * Math.sin(startAngle)
        const x2Outer = cx + radiusOuter * Math.cos(endAngle)
        const y2Outer = cy + radiusOuter * Math.sin(endAngle)
        
        const largeArc = safeAngle > Math.PI ? 1 : 0
        
        return [
            `M ${x1Inner} ${y1Inner}`,
            `L ${x1Outer} ${y1Outer}`,
            `A ${radiusOuter} ${radiusOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
            `L ${x2Inner} ${y2Inner}`,
            `A ${radiusInner} ${radiusInner} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}`,
            'Z'
        ].join(' ')
    }

    const slices: any[] = []
    let cumAngle = -Math.PI / 2

    grouped.forEach((g, gName) => {
        const gAngle = (g.value / total) * 2 * Math.PI
        const gStart = cumAngle
        
        slices.push({
            type: 'group', name: gName, value: g.value, color: g.color,
            d: createArc(gStart, gAngle, rInner, rMid),
        })

        let childCumAngle = gStart
        g.items.forEach(child => {
            const cAngle = (child.value / total) * 2 * Math.PI
            if (cAngle > 0) {
                slices.push({
                    type: 'child', name: child.name, value: child.value, color: child.color, parent: gName,
                    d: createArc(childCumAngle, cAngle, rMid + 3, rOuter), // Gap between circles
                })
            }
            childCumAngle += cAngle
        })

        cumAngle += gAngle
    })

    const [hoveredNode, setHoveredNode] = useState<any>(null)

    return (
        <div className="relative w-full max-w-[600px] flex justify-center">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full drop-shadow-sm font-sans" aria-label="Солнечные лучи">
                {slices.map((s, i) => (
                    <path
                        key={i}
                        d={s.d}
                        fill={s.color}
                        stroke="hsl(var(--background))"
                        strokeWidth="2"
                        className="transition-opacity duration-200 cursor-pointer outline-none"
                        style={{
                            opacity: hoveredNode 
                                ? (hoveredNode.name === s.name || hoveredNode.name === s.parent || hoveredNode.parent === s.name ? 1 : 0.25)
                                : 1
                        }}
                        onMouseEnter={() => setHoveredNode(s)}
                        onMouseLeave={() => setHoveredNode(null)}
                    />
                ))}
            </svg>

            {/* Central Info HUD */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-200">
               {hoveredNode ? (
                   <div className="bg-background/95 backdrop-blur-md border border-border shadow-lg rounded-full w-40 h-40 p-4 flex flex-col items-center justify-center animate-in zoom-in-95 duration-200">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground line-clamp-1 mb-0.5">
                           {hoveredNode.type === 'group' ? 'БЛОК' : hoveredNode.parent}
                       </span>
                       <span className="text-sm font-bold text-foreground text-center line-clamp-2 w-full leading-tight">
                           {hoveredNode.name}
                       </span>
                       <div className="mt-1 text-2xl font-black tabular-nums" style={{ color: hoveredNode.color }}>
                           {hoveredNode.value}%
                       </div>
                   </div>
               ) : (
                   <div className="text-center bg-background/50 backdrop-blur-sm rounded-full w-32 h-32 flex flex-col items-center justify-center shadow-sm border border-border/50 transition-opacity duration-300">
                      <p className="text-3xl font-bold text-foreground">{total}%</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-widest mt-0.5">итого</p>
                   </div>
               )}
            </div>
        </div>
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
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

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
                            setHasUnsavedChanges(false)
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
            setHasUnsavedChanges(false)
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

    // ── Save Logic
    const handleSave = async (silent = false) => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        if (isOverLimit) return

        if (!silent) setIsSaving(true)
        if (!silent) setSaveStatus('idle')

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
            
            if (!silent) {
                setSaveStatus('success')
                setTimeout(() => setSaveStatus('idle'), 3000)
            }
            setHasUnsavedChanges(false)
        } catch (e: any) {
            if (!silent) {
                setSaveStatus('error')
                alert('Ошибка сохранения: ' + e.message)
            } else {
                console.error('Autosave error:', e)
            }
        } finally {
            if (!silent) setIsSaving(false)
        }
    }

    // ── Auto-save Effect
    useEffect(() => {
        if (!hasUnsavedChanges || isOverLimit || !selectedParticipantId) return;
        const timer = setTimeout(() => {
            handleSave(true)
        }, 1500)
        return () => clearTimeout(timer)
    }, [categories, hasUnsavedChanges, isOverLimit, selectedParticipantId])

    // ── Category operations
    const addCategory = () => {
        const nextColor = PALETTE[categories.length % PALETTE.length]
        setCategories(prev => [...prev, { id: generateId(), name: '', value: 0, color: nextColor }])
        setHasUnsavedChanges(true)
    }

    const updateCategory = (id: string, field: 'name' | 'value' | 'color' | 'group', val: string | number) => {
        setCategories(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))
        setHasUnsavedChanges(true)
    }

    const removeCategory = (id: string) => {
        setCategories(prev => prev.filter(c => c.id !== id))
        setHasUnsavedChanges(true)
    }

    const resetToDefault = () => {
        setCategories(DEFAULT_CATEGORIES)
        setHasUnsavedChanges(true)
    }

    return (
        <div className="p-4 sm:p-6 space-y-6 min-h-full bg-background">
            {/* ── Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <span className="text-2xl">🎯</span>
                        Колесо внимания
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
                    <p className="text-sm">чтобы увидеть или заполнить колесо внимания</p>
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
                                            className="w-7 h-7 rounded-[4px] border-2 border-border cursor-pointer p-0 bg-transparent"
                                            title="Выберите цвет"
                                        />
                                    </div>

                                    {/* Group & Name Split */}
                                    <div className="flex flex-1 -space-x-px">
                                         <Input
                                             placeholder="Сфера (Блок)"
                                             value={cat.group || ''}
                                             title="Укажите сферу, в которую входит категория (напр. 'Работа' или 'Семья')"
                                             onChange={e => updateCategory(cat.id, 'group', e.target.value)}
                                             className="w-1/2 h-9 text-xs font-medium rounded-r-none focus-visible:z-10 bg-muted/30 placeholder:text-muted-foreground/50"
                                         />
                                         <Input
                                             placeholder="Категория"
                                             value={cat.name}
                                             onChange={e => updateCategory(cat.id, 'name', e.target.value)}
                                             className="w-1/2 h-9 text-sm font-medium rounded-l-none focus-visible:z-10"
                                         />
                                    </div>

                                    {/* Value */}
                                    <div className="relative flex-shrink-0 w-[72px]">
                                        <Input
                                            type="number"
                                            min={0}
                                            max={100}
                                            value={cat.value}
                                            onChange={e => updateCategory(cat.id, 'value', Math.max(0, Math.min(100, Number(e.target.value))))}
                                            className="h-9 text-sm pr-6 text-right font-medium"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                                    </div>

                                    {/* Delete */}
                                    <button
                                        onClick={() => removeCategory(cat.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-500 transition-all rounded-lg hover:bg-red-50 dark:hover:bg-red-950 flex-shrink-0"
                                    >
                                        <Trash2 className="w-4 h-4" />
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
                            <SunburstChartSVG categories={categories} />
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
