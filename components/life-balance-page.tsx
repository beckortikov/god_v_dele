'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Save, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Search, Eye, BarChart3, X, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Legend,
    Tooltip
} from 'recharts'

// ─────────────────────────── Types ───────────────────────────
interface Participant {
    id: string
    name: string
    program?: { name: string }
    status: string
}

interface LifeBalanceEntry {
    id?: string
    participant_id: string
    year: number
    ideal_values: Record<string, number>
    monthly_values: Record<string, Record<string, number>>
}

// ─────────────────────────── Constants ───────────────────────────
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000000'

const DEFAULT_CATEGORY_NAMES = [
    'финансы',
    'спорт/тело',
    'духовность',
    'личностный рост',
    'навыки',
    'душа',
    'личный бренд',
    'семья',
    'здоровье',
    'чтение',
    'путешествие'
]

const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
]

const MONTH_COLORS: Record<string, string> = {
    'Январь': '#3b82f6',   // Blue
    'Февраль': '#06b6d4',  // Cyan
    'Март': '#10b981',    // Emerald
    'Апрель': '#84cc16',   // Lime
    'Май': '#eab308',     // Yellow
    'Июнь': '#f97316',     // Orange
    'Июль': '#ef4444',     // Red
    'Август': '#ec4899',   // Pink
    'Сентябрь': '#8b5cf6',  // Purple
    'Октябрь': '#a855f7',  // Violet
    'Ноябрь': '#6366f1',   // Indigo
    'Декабрь': '#14b8a6'   // Teal
}

const CATEGORY_COLORS: Record<string, string> = {
    'финансы': '#3b82f6',        // Blue
    'спорт/тело': '#10b981',     // Emerald
    'духовность': '#8b5cf6',     // Purple
    'личностный рост': '#ec4899',// Pink
    'навыки': '#0ea5e9',         // Sky
    'душа': '#6366f1',           // Indigo
    'личный бренд': '#f59e0b',   // Amber
    'семья': '#f87171',          // Red
    'здоровье': '#06b6d4',       // Cyan
    'чтение': '#a855f7',         // Violet
    'путешествие': '#f97316'     // Orange
}

const PALETTE = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#06b6d4', '#3b82f6', '#a855f7'
]

export function LifeBalancePage({ participantId: fixedParticipantId, participantName }: { participantId?: string, participantName?: string } = {}) {
    const isParticipantMode = !!fixedParticipantId

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [year, setYear] = useState<number>(() => new Date().getFullYear())

    // Category lists & values
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORY_NAMES)
    const [idealValues, setIdealValues] = useState<Record<string, number>>({})
    const [monthlyValues, setMonthlyValues] = useState<Record<string, Record<string, number>>>({})

    // Filter query for category row highlighting
    const [catFilter, setCatFilter] = useState('')

    // Which months are selected to render in Recharts radar
    const [selectedMonths, setSelectedMonths] = useState<Record<string, boolean>>(() => {
        const curM = MONTHS[new Date().getMonth()]
        return MONTHS.reduce((acc, m) => {
            acc[m] = m === curM
            return acc
        }, {} as Record<string, boolean>)
    })

    // UI Feedback States
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Report states
    const [activeTab, setActiveTab] = useState<'editor' | 'report'>('editor')
    const [allEntries, setAllEntries] = useState<LifeBalanceEntry[]>([])
    const [isReportLoading, setIsReportLoading] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [programFilter, setProgramFilter] = useState('all')

    // Fetch active participants (admin mode only)
    useEffect(() => {
        if (isParticipantMode) return
        fetch('/api/participants')
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setParticipants(data.filter((p: Participant) => p.status === 'active'))
                }
            })
            .catch(console.error)
    }, [isParticipantMode])

    // Fetch report statistics
    const fetchReportData = useCallback(() => {
        if (activeTab !== 'report') return
        setIsReportLoading(true)
        fetch(`/api/life-balance?year=${year}`)
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setAllEntries(data)
                }
            })
            .catch(console.error)
            .finally(() => setIsReportLoading(false))
    }, [activeTab, year])

    useEffect(() => {
        fetchReportData()
    }, [fetchReportData])

    // Fetch single entry for editor
    const fetchEntry = useCallback(async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        setIsLoading(true)

        try {
            const params = new URLSearchParams({
                participant_id: pid,
                year: String(year)
            })
            const res = await fetch(`/api/life-balance?${params}`)
            const { data } = await res.json()

            if (data && data.length > 0) {
                const entry = data[0] as LifeBalanceEntry
                
                // Merge default categories with whatever custom exists in entry
                const entryCats = new Set<string>()
                Object.keys(entry.ideal_values || {}).forEach(k => entryCats.add(k))
                Object.keys(entry.monthly_values || {}).forEach(m => {
                    Object.keys(entry.monthly_values[m] || {}).forEach(k => entryCats.add(k))
                })

                // Keep standard categories sorted first
                const mergedCats = Array.from(new Set([
                    ...DEFAULT_CATEGORY_NAMES,
                    ...Array.from(entryCats)
                ]))

                setCategories(mergedCats)
                setIdealValues(entry.ideal_values || {})
                setMonthlyValues(entry.monthly_values || {})
            } else {
                setCategories(DEFAULT_CATEGORY_NAMES)
                setIdealValues({})
                setMonthlyValues({})
            }
        } catch (e) {
            console.error('Error fetching life balance:', e)
            setCategories(DEFAULT_CATEGORY_NAMES)
            setIdealValues({})
            setMonthlyValues({})
        } finally {
            setIsLoading(false)
            setHasUnsavedChanges(false)
        }
    }, [fixedParticipantId, selectedParticipantId, year])

    useEffect(() => {
        fetchEntry()
    }, [fetchEntry])

    // Save
    const handleSave = async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) {
            alert('Пожалуйста, выберите участника')
            return
        }

        setIsSaving(true)
        setSaveStatus('idle')

        try {
            const res = await fetch('/api/life-balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participant_id: pid,
                    year,
                    ideal_values: idealValues,
                    monthly_values: monthlyValues
                })
            })

            const result = await res.json()
            if (!res.ok || result?.error) {
                throw new Error(result?.error || 'Не удалось сохранить')
            }

            setSaveStatus('success')
            setTimeout(() => setSaveStatus('idle'), 3000)
            setHasUnsavedChanges(false)
            fetchReportData()
        } catch (e: any) {
            setSaveStatus('error')
            let userMsg = e.message || 'Неизвестная ошибка'
            if (userMsg.includes('violates foreign key constraint')) {
                userMsg = 'Ваш аккаунт персонала не связан с записью участника в базе данных. Пожалуйста, обратитесь к администратору или примените SQL-миграцию.'
            }
            alert('Ошибка при сохранении: ' + userMsg)
        } finally {
            setIsSaving(false)
        }
    }

    // Grid modifications
    const handleIdealChange = (cat: string, val: string) => {
        const numVal = val === '' ? 10 : Math.min(10, Math.max(0, parseInt(val, 10) || 0))
        setIdealValues(prev => ({ ...prev, [cat]: numVal }))
        setHasUnsavedChanges(true)
    }

    const handleScoreChange = (month: string, cat: string, val: string) => {
        const parsed = parseInt(val, 10)
        const finalVal = isNaN(parsed) ? 0 : Math.min(10, Math.max(0, parsed))
        
        setMonthlyValues(prev => {
            const monthScores = { ...(prev[month] || {}) }
            if (val === '') {
                delete monthScores[cat]
            } else {
                monthScores[cat] = finalVal
            }
            return { ...prev, [month]: monthScores }
        })
        setHasUnsavedChanges(true)
    }

    const handleCustomCategoryChange = (index: number, newName: string) => {
        const oldName = categories[index]
        setCategories(prev => {
            const next = [...prev]
            next[index] = newName
            return next
        })

        // Rename keys in values
        setIdealValues(prev => {
            const next = { ...prev }
            if (next[oldName] !== undefined) {
                next[newName] = next[oldName]
                delete next[oldName]
            }
            return next
        })

        setMonthlyValues(prev => {
            const next = { ...prev }
            MONTHS.forEach(m => {
                const monthScores = { ...next[m] }
                if (monthScores[oldName] !== undefined) {
                    monthScores[newName] = monthScores[oldName]
                    delete monthScores[oldName]
                }
                next[m] = monthScores
            })
            return next
        })
        setHasUnsavedChanges(true)
    }

    const addCustomCategory = () => {
        const baseName = 'Новая категория'
        let name = baseName
        let counter = 1
        while (categories.includes(name)) {
            name = `${baseName} ${counter++}`
        }

        setCategories(prev => [...prev, name])
        setHasUnsavedChanges(true)
    }

    const removeCategory = (index: number) => {
        const name = categories[index]
        if (!confirm(`Удалить категорию "${name}"? Все сохраненные оценки по ней будут стерты.`)) return

        setCategories(prev => prev.filter((_, i) => i !== index))

        setIdealValues(prev => {
            const next = { ...prev }
            delete next[name]
            return next
        })

        setMonthlyValues(prev => {
            const next = { ...prev }
            MONTHS.forEach(m => {
                const monthScores = { ...next[m] }
                delete monthScores[name]
                next[m] = monthScores
            })
            return next
        })
        setHasUnsavedChanges(true)
    }

    // Recharts Data formatter
    const chartData = useMemo(() => {
        return categories.map(cat => {
            const row: Record<string, any> = {
                category: cat
            }
            row.ideal = idealValues[cat] !== undefined ? idealValues[cat] : 10

            MONTHS.forEach(m => {
                if (selectedMonths[m]) {
                    row[m] = monthlyValues[m]?.[cat] !== undefined ? monthlyValues[m][cat] : 0
                }
            })
            return row
        })
    }, [categories, idealValues, monthlyValues, selectedMonths])

    // Toggle months in chart
    const toggleMonthSelected = (m: string) => {
        setSelectedMonths(prev => ({
            ...prev,
            [m]: !prev[m]
        }))
    }

    const selectAllMonths = () => {
        const next = MONTHS.reduce((acc, m) => {
            acc[m] = true
            return acc
        }, {} as Record<string, boolean>)
        setSelectedMonths(next)
    }

    const clearAllMonths = () => {
        setSelectedMonths(MONTHS.reduce((acc, m) => {
            acc[m] = false
            return acc
        }, {} as Record<string, boolean>))
    }

    // Report processing
    const uniquePrograms = Array.from(new Set(participants.map(p => p.program?.name).filter(Boolean)))

    const reportRows = useMemo(() => {
        return participants
            .filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
                const matchesProgram = programFilter === 'all' || p.program?.name === programFilter
                return matchesSearch && matchesProgram
            })
            .map(p => {
                const userEntries = allEntries.filter(e => e.participant_id === p.id && e.participant_id !== TEMPLATE_ID)
                const filledMonths = MONTHS.filter(m => {
                    const entry = userEntries[0] // Since grouped by year
                    return entry && entry.monthly_values?.[m] && Object.keys(entry.monthly_values[m]).length > 0
                })
                return {
                    participant: p,
                    filledMonths,
                    count: filledMonths.length
                }
            })
    }, [participants, allEntries, searchTerm, programFilter])

    return (
        <div className="p-4 sm:p-6 space-y-6 min-h-full bg-background/50">
            {/* Header Title */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-5">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                        <span className="text-3xl sm:text-4xl animate-pulse">🎡</span>
                        Колесо жизни
                        {isParticipantMode && participantName && (
                            <Badge variant="outline" className="ml-2 text-xs font-bold py-1 px-2.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                                {participantName}
                            </Badge>
                        )}
                    </h1>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">Сравнительный анализ и баланс ключевых сфер вашей жизнедеятельности по месяцам</p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-end">
                    {/* Period Pickers */}
                    <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border shadow-sm">
                        <select
                            value={year}
                            onChange={e => { setYear(Number(e.target.value)); setHasUnsavedChanges(true) }}
                            className="bg-transparent border-none text-xs font-bold text-foreground focus:outline-none cursor-pointer p-0.5"
                        >
                            {[2025, 2026, 2027, 2028].map(y => (
                                <option key={y} value={y} className="bg-card text-foreground">{y} год</option>
                            ))}
                        </select>
                    </div>

                    {activeTab === 'editor' && saveStatus === 'success' && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg animate-in fade-in zoom-in duration-300 font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Изменения сохранены!
                        </span>
                    )}
                    {activeTab === 'editor' && saveStatus === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg animate-in fade-in zoom-in duration-300 font-semibold">
                            <AlertCircle className="w-4 h-4" /> Ошибка сохранения
                        </span>
                    )}

                    {activeTab === 'editor' && (
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !selectedParticipantId}
                            size="default"
                            className="gap-2 font-bold bg-indigo-600 hover:bg-indigo-500 text-xs shadow-md px-5 py-2 transition-all active:scale-95 text-white"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isSaving ? 'Сохранение...' : 'Сохранить изменения'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Tab Links (Admin Only) */}
            {!isParticipantMode && (
                <div className="flex border-b border-border/80 gap-1">
                    <button
                        onClick={() => setActiveTab('editor')}
                        className={`px-5 py-2.5 border-b-2 text-xs font-bold transition-all relative ${activeTab === 'editor'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Конструктор оценок
                        {hasUnsavedChanges && (
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('report')}
                        className={`px-5 py-2.5 border-b-2 text-xs font-bold transition-all ${activeTab === 'report'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Отчет по заполнению
                    </button>
                </div>
            )}

            {activeTab === 'editor' ? (
                <div className="space-y-5">
                    {/* User Selection & Highlighting (Admin/User Mode) */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        {/* Selector (Admin Only) */}
                        {!isParticipantMode ? (
                            <div className="md:col-span-6 bg-card border border-border p-3.5 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">Выбор участника</h3>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Выберите анкету для заполнения</p>
                                </div>
                                <select
                                    value={selectedParticipantId}
                                    onChange={e => { setSelectedParticipantId(e.target.value); setHasUnsavedChanges(false) }}
                                    className="w-full sm:w-[280px] px-3 py-2 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 font-semibold shadow-sm"
                                >
                                    <option value="">— Выберите участника —</option>
                                    <option value={TEMPLATE_ID}>⚙️ Базовый шаблон (для всех)</option>
                                    {participants.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} {p.program?.name ? `(${p.program.name})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="md:col-span-6" />
                        )}

                        {/* Search Checkpoints Filter */}
                        {selectedParticipantId && (
                            <div className="md:col-span-6 bg-card border border-border p-3.5 rounded-xl shadow-sm flex items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                                    <Input
                                        placeholder="Поиск по сферам (например: здоровье, финансы, чтение)..."
                                        value={catFilter}
                                        onChange={e => setCatFilter(e.target.value)}
                                        className="pl-9 h-9 text-xs border-border bg-background focus-visible:ring-indigo-500/30 rounded-lg"
                                    />
                                    {catFilter && (
                                        <button 
                                            onClick={() => setCatFilter('')}
                                            className="absolute right-3 top-2.5 text-muted-foreground/60 hover:text-foreground text-xs"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {!selectedParticipantId && !isParticipantMode ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground bg-card border border-dashed border-border rounded-2xl shadow-sm">
                            <div className="p-4 bg-indigo-500/5 rounded-full border border-indigo-500/10 text-indigo-500">
                                <BarChart3 className="w-12 h-12" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground">Выберите участника для заполнения</h3>
                            <p className="text-xs text-center max-w-sm text-muted-foreground mt-0.5 leading-relaxed">
                                Выберите студента или базовый шаблон в выпадающем списке выше, чтобы открыть интерактивную матрицу оценок его колеса жизни.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            {/* Matrix Grid Editor */}
                            <Card className="xl:col-span-8 p-4 sm:p-5 border-border shadow-md overflow-x-auto bg-card/60 backdrop-blur-md rounded-2xl">
                                <div className="flex items-center justify-between mb-5 pb-3.5 border-b border-border/40">
                                    <div>
                                        <h2 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Таблица оценок баланса</h2>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            Укажите идеальный порог и выставьте оценки по 10-балльной шкале
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={addCustomCategory}
                                        className="gap-1 text-[10.5px] font-bold border-indigo-600/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/5 transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Добавить категорию
                                    </Button>
                                </div>

                                <div className="min-w-[850px] overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-border/80 text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                                                <th className="py-3 px-2.5 w-[200px]">Категория</th>
                                                <th className="py-3 px-2 text-center w-[90px] bg-slate-500/5 dark:bg-slate-500/10 rounded-t-lg">Мой идеал</th>
                                                {MONTHS.map(m => (
                                                    <th key={m} className="py-3 px-1 text-center w-[54px]">
                                                        {m.substring(0, 3)}
                                                    </th>
                                                ))}
                                                <th className="py-3 px-2 w-[40px]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/40 text-xs">
                                            {categories.map((cat, idx) => {
                                                const isDefault = DEFAULT_CATEGORY_NAMES.includes(cat)
                                                const idealVal = idealValues[cat] !== undefined ? idealValues[cat] : 10
                                                const catLower = cat.toLowerCase()
                                                const catColor = CATEGORY_COLORS[catLower] || PALETTE[idx % PALETTE.length]

                                                const isHighlighted = catFilter
                                                    ? cat.toLowerCase().includes(catFilter.toLowerCase())
                                                    : false
                                                const isDimmed = catFilter && !isHighlighted

                                                return (
                                                    <tr 
                                                        key={idx} 
                                                        className={`hover:bg-muted/20 transition-all border-l-2 ${
                                                            isDimmed ? 'opacity-30 scale-98' : 'opacity-100'
                                                        }`}
                                                        style={{ borderLeftColor: catColor }}
                                                    >
                                                        {/* Category Name */}
                                                        <td className="py-2 px-2.5">
                                                            {isDefault ? (
                                                                <span className="font-extrabold text-foreground tracking-tight">{cat}</span>
                                                            ) : (
                                                                <Input
                                                                    value={cat}
                                                                    onChange={e => handleCustomCategoryChange(idx, e.target.value)}
                                                                    className="h-8 py-0.5 text-xs font-bold bg-indigo-500/5 border-indigo-500/20 focus:border-indigo-500 focus:ring-0 w-full rounded-md"
                                                                />
                                                            )}
                                                        </td>

                                                        {/* Ideal Target */}
                                                        <td className="py-2 px-2 bg-slate-500/5 dark:bg-slate-500/10 text-center">
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={10}
                                                                value={idealVal}
                                                                onChange={e => handleIdealChange(cat, e.target.value)}
                                                                className="h-8 py-0.5 px-1 text-center font-extrabold text-indigo-600 dark:text-indigo-400 bg-background focus:ring-indigo-500/35 rounded-md"
                                                            />
                                                        </td>

                                                        {/* Monthly inputs */}
                                                        {MONTHS.map(m => {
                                                            const val = monthlyValues[m]?.[cat]
                                                            return (
                                                                <td key={m} className="py-2 px-1">
                                                                    <Input
                                                                        type="number"
                                                                        min={0}
                                                                        max={10}
                                                                        value={val !== undefined ? val : ''}
                                                                        onChange={e => handleScoreChange(m, cat, e.target.value)}
                                                                        placeholder="-"
                                                                        className="h-8 py-0.5 px-1 text-center font-extrabold placeholder:text-muted-foreground/30 focus-visible:ring-indigo-500/30 rounded-md border-border/85"
                                                                        style={val !== undefined ? { color: catColor, backgroundColor: `${catColor}07`, borderColor: `${catColor}35` } : {}}
                                                                    />
                                                                </td>
                                                            )
                                                        })}

                                                        {/* Delete custom category */}
                                                        <td className="py-2 px-2 text-right">
                                                            {!isDefault && (
                                                                <button
                                                                    onClick={() => removeCategory(idx)}
                                                                    className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/5 rounded transition-all"
                                                                    title="Удалить показатель"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            {/* Radar Visualization Column */}
                            <div className="xl:col-span-4 space-y-6">
                                {/* Months Selector & Filters */}
                                <Card className="p-4 sm:p-5 border-border shadow-md bg-card/85 backdrop-blur-md rounded-2xl">
                                    <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-3">
                                        <h3 className="font-extrabold text-xs text-foreground uppercase tracking-wider">Фильтр месяцев</h3>
                                        <div className="flex gap-1.5">
                                            <Button variant="ghost" size="sm" onClick={selectAllMonths} className="text-[10px] font-bold h-6 px-1.5 rounded">
                                                Все
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={clearAllMonths} className="text-[10px] font-bold h-6 px-1.5 rounded text-muted-foreground">
                                                Сброс
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-3 gap-2">
                                        {MONTHS.map(m => {
                                            const isChecked = !!selectedMonths[m]
                                            const hasData = Object.values(monthlyValues[m] || {}).some(v => v > 0)
                                            return (
                                                <button
                                                    key={m}
                                                    onClick={() => toggleMonthSelected(m)}
                                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold text-center transition-all flex items-center justify-between gap-1 ${
                                                        isChecked
                                                            ? 'border-indigo-500 text-indigo-600 bg-indigo-500/10'
                                                            : 'border-border text-muted-foreground hover:bg-muted/40'
                                                    }`}
                                                >
                                                    <span className="truncate">{m}</span>
                                                    {hasData && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Есть заполнение" />
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </Card>

                                {/* Radar chart */}
                                <Card className="p-5 border-border shadow-md flex flex-col items-center bg-card/75 backdrop-blur-md rounded-2xl">
                                    <h3 className="font-extrabold text-sm text-foreground mb-3 self-start flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-amber-500 animate-spin" style={{ animationDuration: '8s' }} />
                                        Диаграмма баланса
                                    </h3>

                                    <div className="w-full h-[320px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                                                <PolarGrid stroke="hsl(var(--muted-foreground) / 0.18)" />
                                                <PolarAngleAxis
                                                    dataKey="category"
                                                    tick={{ fill: 'currentColor', fontSize: 9, fontWeight: 600 }}
                                                    className="text-muted-foreground"
                                                />
                                                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fontSize: 8 }} />
                                                
                                                {/* Ideal Base Line */}
                                                <Radar
                                                    name="Мой идеал"
                                                    dataKey="ideal"
                                                    stroke="#94a3b8"
                                                    strokeDasharray="4 4"
                                                    fill="none"
                                                    strokeWidth={1.5}
                                                />

                                                {/* Selected Months */}
                                                {MONTHS.map(m => {
                                                    if (!selectedMonths[m]) return null
                                                    return (
                                                        <Radar
                                                            key={m}
                                                            name={m}
                                                            dataKey={m}
                                                            stroke={MONTH_COLORS[m]}
                                                            fill={`url(#gradient-${m})`}
                                                            fillOpacity={0.2}
                                                            strokeWidth={2}
                                                        />
                                                    )
                                                })}

                                                {/* Gradient definitions for glowing charts */}
                                                <defs>
                                                    {MONTHS.map(m => (
                                                        <linearGradient id={`gradient-${m}`} key={m} x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor={MONTH_COLORS[m]} stopOpacity={0.45} />
                                                            <stop offset="100%" stopColor={MONTH_COLORS[m]} stopOpacity={0.01} />
                                                        </linearGradient>
                                                    ))}
                                                </defs>

                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: 'hsl(var(--background))',
                                                        borderColor: 'hsl(var(--border))',
                                                        borderRadius: '12px',
                                                        fontSize: '11px',
                                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                                                    }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '9px', marginTop: '10px', fontWeight: 600 }} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Report View (Admin Only) */
                <Card className="p-5 border-border shadow-md space-y-6 bg-card rounded-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                        <div>
                            <h2 className="text-lg font-extrabold text-foreground">Отчет по заполнению</h2>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Участники и месяцы, в которых заполнялся чек-лист колеса жизни в {year} году
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/60" />
                                <Input
                                    placeholder="Поиск по имени..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-8.5 w-full sm:w-[200px] h-9 text-xs border-border bg-background focus-visible:ring-indigo-500/30 rounded-lg"
                                />
                            </div>
                            <select
                                value={programFilter}
                                onChange={e => setProgramFilter(e.target.value)}
                                className="px-3 py-1 bg-background border border-border rounded-lg text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30 h-9 font-semibold shadow-sm"
                            >
                                <option value="all">Все программы</option>
                                {uniquePrograms.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {isReportLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                            <p className="text-xs">Загрузка данных отчета...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                        <th className="py-3 px-4">Участник</th>
                                        <th className="py-3 px-4 text-center w-[180px]">Всего заполнено месяцев</th>
                                        <th className="py-3 px-4">Месяцы заполнения</th>
                                        <th className="py-3 px-4 text-right w-[100px]">Действие</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60 text-xs">
                                    {reportRows.map(({ participant, filledMonths, count }) => (
                                        <tr key={participant.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-foreground">{participant.name}</div>
                                                {participant.program?.name && (
                                                    <Badge variant="secondary" className="mt-0.5 text-[9px] px-1.5 py-0 border-none font-medium">
                                                        {participant.program.name}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    count > 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {count} из 12
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {count > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {filledMonths.map(m => (
                                                            <Badge
                                                                key={m}
                                                                variant="outline"
                                                                className="text-[9px] px-1.5 py-0 font-bold bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
                                                            >
                                                                {m}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground italic">Не заполнено</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="gap-1 hover:text-indigo-600 hover:bg-indigo-500/10 text-muted-foreground text-[10.5px] h-7 px-2 font-bold"
                                                    onClick={() => {
                                                        setSelectedParticipantId(participant.id)
                                                        setActiveTab('editor')
                                                        if (filledMonths.length > 0) {
                                                            const lastM = filledMonths[filledMonths.length - 1]
                                                            setSelectedMonths({ [lastM]: true })
                                                        }
                                                    }}
                                                >
                                                    <Eye className="w-3.5 h-3.5" /> Посмотреть
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}

                                    {reportRows.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-10 text-center text-muted-foreground italic text-xs">
                                                Участники не найдены
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}
        </div>
    )
}

export default LifeBalancePage
