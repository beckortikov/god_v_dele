'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, Save, Loader2, CheckCircle2, AlertCircle, RefreshCw, Search, Eye, BarChart3, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
    'Август': '#ec4899',    // Pink
    'Сентябрь': '#d946ef',  // Fuchsia
    'Октябрь': '#8b5cf6',   // Violet
    'Ноябрь': '#6366f1',   // Indigo
    'Декабрь': '#6b7280',   // Gray
}

// ─────────────────────────── Main Component ───────────────────────────
interface LifeBalancePageProps {
    participantId?: string
    participantName?: string
}

export function LifeBalancePage({ participantId: fixedParticipantId, participantName }: LifeBalancePageProps = {}) {
    const isParticipantMode = !!fixedParticipantId

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [year, setYear] = useState<number>(() => new Date().getFullYear())
    
    // Editor States
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORY_NAMES)
    const [idealValues, setIdealValues] = useState<Record<string, number>>({})
    const [monthlyValues, setMonthlyValues] = useState<Record<string, Record<string, number>>>({})
    const [selectedMonths, setSelectedMonths] = useState<Record<string, boolean>>({
        'Январь': true // default check January
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

    // Fetch all entries for report
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

    // Fetch entry details for editor
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
                const entry: LifeBalanceEntry = data[0]
                const ideals = entry.ideal_values || {}
                const monthly = entry.monthly_values || {}

                // Merge categories list dynamically based on loaded data
                const loadedCats = [...DEFAULT_CATEGORY_NAMES]
                Object.keys(ideals).forEach(k => {
                    if (!loadedCats.includes(k)) loadedCats.push(k)
                })
                Object.values(monthly).forEach((scores: any) => {
                    Object.keys(scores || {}).forEach(k => {
                        if (!loadedCats.includes(k)) loadedCats.push(k)
                    })
                })

                setCategories(loadedCats)
                setIdealValues(ideals)
                setMonthlyValues(monthly)
            } else {
                // Not found - reset to defaults
                setCategories(DEFAULT_CATEGORY_NAMES)
                
                const defaultIdeals: Record<string, number> = {}
                DEFAULT_CATEGORY_NAMES.forEach(c => {
                    defaultIdeals[c] = 10
                })
                setIdealValues(defaultIdeals)
                setMonthlyValues({})
            }
        } catch (e) {
            console.error('Error fetching life balance entry:', e)
        } finally {
            setIsLoading(false)
            setHasUnsavedChanges(false)
        }
    }, [fixedParticipantId, selectedParticipantId, year])

    useEffect(() => {
        fetchEntry()
    }, [fetchEntry])

    // Save handler
    const handleSave = async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) {
            alert('Пожалуйста, выберите участника')
            return
        }

        setIsSaving(true)
        setSaveStatus('idle')

        try {
            // Prune monthly values with empty rows
            const prunedMonthly: Record<string, Record<string, number>> = {}
            Object.entries(monthlyValues).forEach(([m, scores]) => {
                const prunes: Record<string, number> = {}
                Object.entries(scores).forEach(([cat, val]) => {
                    if (val !== undefined && val !== null && String(val) !== '') {
                        prunes[cat] = Number(val)
                    }
                })
                if (Object.keys(prunes).length > 0) {
                    prunedMonthly[m] = prunes
                }
            })

            const res = await fetch('/api/life-balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participant_id: pid,
                    year,
                    ideal_values: idealValues,
                    monthly_values: prunedMonthly
                })
            })

            const result = await res.json()
            if (!res.ok || result?.error) {
                throw new Error(result?.error || 'Не удалось сохранить')
            }

            setSaveStatus('success')
            setTimeout(() => setSaveStatus('idle'), 3000)
            setHasUnsavedChanges(false)
            fetchReportData() // reload report in case it saved successfully
        } catch (e: any) {
            setSaveStatus('error')
            alert('Ошибка при сохранении: ' + (e.message || 'Неизвестная ошибка'))
        } finally {
            setIsSaving(false)
        }
    }

    // Grid modifications
    const handleIdealChange = (cat: string, val: string) => {
        const numVal = val === '' ? 10 : Math.min(10, Math.max(1, parseInt(val, 10) || 1))
        setIdealValues(prev => ({ ...prev, [cat]: numVal }))
        setHasUnsavedChanges(true)
    }

    const handleScoreChange = (month: string, cat: string, val: string) => {
        const parsed = parseInt(val, 10)
        const finalVal = isNaN(parsed) ? 0 : Math.min(10, Math.max(1, parsed))
        
        setMonthlyValues(prev => {
            const monthScores = { ...(prev[month] || {}) }
            if (val === '') {
                delete monthScores[cat]
            } else {
                monthScores[cat] = finalVal
            }
            
            const next = { ...prev }
            if (Object.keys(monthScores).length === 0) {
                delete next[month]
            } else {
                next[month] = monthScores
            }
            return next
        })
        setHasUnsavedChanges(true)
    }

    const handleCustomCategoryChange = (index: number, newName: string) => {
        const oldName = categories[index]
        if (categories.includes(newName) && newName !== oldName) {
            return // prevent duplicates
        }

        setCategories(prev => {
            const next = [...prev]
            next[index] = newName
            return next
        })

        // Rename keys in values if they exist
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
            Object.keys(next).forEach(m => {
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
        let nameIdx = 1
        let customName = `Кастомная ${nameIdx}`
        while (categories.includes(customName)) {
            nameIdx++
            customName = `Кастомная ${nameIdx}`
        }

        setCategories(prev => [...prev, customName])
        setIdealValues(prev => ({ ...prev, [customName]: 10 }))
        setHasUnsavedChanges(true)
    }

    const deleteCustomCategory = (name: string) => {
        if (!window.confirm(`Удалить категорию "${name}"?`)) return

        setCategories(prev => prev.filter(c => c !== name))
        setIdealValues(prev => {
            const next = { ...prev }
            delete next[name]
            return next
        })
        setMonthlyValues(prev => {
            const next = { ...prev }
            Object.keys(next).forEach(m => {
                const monthScores = { ...next[m] }
                delete monthScores[name]
                next[m] = monthScores
            })
            return next
        })
        setHasUnsavedChanges(true)
    }

    // Toggle month visualization
    const toggleMonthSelected = (m: string) => {
        setSelectedMonths(prev => ({
            ...prev,
            [m]: !prev[m]
        }))
    }

    const selectAllMonths = () => {
        const next: Record<string, boolean> = {}
        MONTHS.forEach(m => {
            next[m] = true
        })
        setSelectedMonths(next)
    }

    const clearAllMonths = () => {
        setSelectedMonths({})
    }

    // Radar Chart Data Prep
    const chartData = useMemo(() => {
        return categories.map(cat => {
            const item: any = {
                category: cat,
                ideal: idealValues[cat] !== undefined ? idealValues[cat] : 10
            }
            MONTHS.forEach(m => {
                if (selectedMonths[m]) {
                    const val = monthlyValues[m]?.[cat]
                    item[m] = val !== undefined ? val : 0
                }
            })
            return item
        })
    }, [categories, idealValues, monthlyValues, selectedMonths])

    // Report Processing
    const uniquePrograms = Array.from(new Set(participants.map(p => p.program?.name).filter(Boolean)))

    const reportRows = useMemo(() => {
        return participants
            .filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
                const matchesProgram = programFilter === 'all' || p.program?.name === programFilter
                return matchesSearch && matchesProgram
            })
            .map(p => {
                const entry = allEntries.find(e => e.participant_id === p.id && e.participant_id !== TEMPLATE_ID)
                const filledMonths = MONTHS.filter(m => {
                    const scores = entry?.monthly_values?.[m] || {}
                    return Object.values(scores).some(v => v !== undefined && v !== null && v > 0)
                })
                return {
                    participant: p,
                    entry,
                    filledMonths,
                    count: filledMonths.length
                }
            })
    }, [participants, allEntries, searchTerm, programFilter])

    const selectedParticipant = participants.find(p => p.id === selectedParticipantId)

    return (
        <div className="p-4 sm:p-6 space-y-6 min-h-full bg-background">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        <span className="text-3xl">☸️</span>
                        Колесо баланса жизни
                        {isParticipantMode && participantName && (
                            <Badge variant="secondary" className="ml-2 text-sm font-normal py-1 px-3">
                                {participantName}
                            </Badge>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Оценка сфер жизни от 1 до 10 по месяцам и идеальные ориентиры</p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Year selector */}
                    <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border border-border">
                        <span className="text-xs font-semibold text-muted-foreground">ГОД:</span>
                        <select
                            value={year}
                            onChange={e => { setYear(Number(e.target.value)); setHasUnsavedChanges(true) }}
                            className="bg-transparent border-none text-sm font-bold text-foreground focus:outline-none cursor-pointer"
                        >
                            {[2025, 2026, 2027, 2028].map(y => (
                                <option key={y} value={y} className="bg-background">{y}</option>
                            ))}
                        </select>
                    </div>

                    {activeTab === 'editor' && saveStatus === 'success' && (
                        <span className="flex items-center gap-1.5 text-sm text-green-600 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg animate-in fade-in duration-300">
                            <CheckCircle2 className="w-4 h-4" /> Сохранено
                        </span>
                    )}
                    {activeTab === 'editor' && saveStatus === 'error' && (
                        <span className="flex items-center gap-1.5 text-sm text-red-600 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg animate-in fade-in duration-300">
                            <AlertCircle className="w-4 h-4" /> Ошибка
                        </span>
                    )}

                    {activeTab === 'editor' && (
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !selectedParticipantId}
                            className="gap-2 px-5 font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-md shadow-indigo-500/20 transition-all hover:scale-[1.02]"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {isSaving ? 'Сохранение...' : 'Сохранить'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs Selector (Admin only) */}
            {!isParticipantMode && (
                <div className="flex border-b border-border/80">
                    <button
                        onClick={() => setActiveTab('editor')}
                        className={`px-6 py-3 border-b-2 text-sm font-bold transition-all relative ${activeTab === 'editor'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Конструктор баланса
                        {hasUnsavedChanges && (
                            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500" title="Несохраненные изменения" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('report')}
                        className={`px-6 py-3 border-b-2 text-sm font-bold transition-all ${activeTab === 'report'
                            ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Отчет по заполнению
                    </button>
                </div>
            )}

            {activeTab === 'editor' ? (
                <div className="space-y-6">
                    {/* Top bar (Admin participant selector) */}
                    {!isParticipantMode && (
                        <div className="bg-card border border-border p-4 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Выбор участника для заполнения</h3>
                                <p className="text-xs text-muted-foreground">Выберите участника из списка активных участников программы</p>
                            </div>
                            <select
                                value={selectedParticipantId}
                                onChange={e => { setSelectedParticipantId(e.target.value); setHasUnsavedChanges(false) }}
                                className="w-full sm:w-[320px] px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-medium"
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
                    )}

                    {!selectedParticipantId && !isParticipantMode ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground bg-card border border-dashed border-border rounded-2xl">
                            <div className="p-4 bg-muted/50 rounded-full">
                                <BarChart3 className="w-12 h-12 text-muted-foreground/50" />
                            </div>
                            <p className="text-lg font-bold text-foreground">Выберите участника</p>
                            <p className="text-sm text-center max-w-sm">Выберите участника из списка выше, чтобы открыть и отредактировать его колесо баланса жизни</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                            {/* Editor Grid */}
                            <Card className="xl:col-span-8 p-4 sm:p-6 border-border shadow-md overflow-x-auto">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/60">
                                    <div>
                                        <h2 className="text-lg font-bold text-foreground">Таблица оценок</h2>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Укажите идеальный барьер и оценки по месяцам (числа от 1 до 10)
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={addCustomCategory}
                                        className="gap-1.5 border-indigo-600/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 font-bold"
                                    >
                                        <Plus className="w-4 h-4" /> Добавить категорию
                                    </Button>
                                </div>

                                <div className="min-w-[900px]">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-border/80 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                                <th className="py-3 px-2 w-[180px]">Категория</th>
                                                <th className="py-3 px-2 text-center w-[85px] bg-slate-500/5 dark:bg-slate-500/10">Мой идеал</th>
                                                {MONTHS.map(m => (
                                                    <th key={m} className="py-3 px-1 text-center w-[58px]">
                                                        {m.substring(0, 3)}
                                                    </th>
                                                ))}
                                                <th className="py-3 px-2 text-center w-[40px]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60 text-sm">
                                            {categories.map((cat, idx) => {
                                                const isDefault = DEFAULT_CATEGORY_NAMES.includes(cat)
                                                const idealVal = idealValues[cat] !== undefined ? idealValues[cat] : 10
                                                
                                                return (
                                                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                                        <td className="py-2.5 px-2">
                                                            {isDefault ? (
                                                                <span className="font-semibold text-foreground">{cat}</span>
                                                            ) : (
                                                                <Input
                                                                    value={cat}
                                                                    onChange={e => handleCustomCategoryChange(idx, e.target.value)}
                                                                    className="h-8 py-0.5 text-xs font-semibold bg-indigo-500/5 border-indigo-500/20 focus:border-indigo-500 w-full"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 px-2 bg-slate-500/5 dark:bg-slate-500/10">
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                max={10}
                                                                value={idealVal}
                                                                onChange={e => handleIdealChange(cat, e.target.value)}
                                                                className="h-8 py-0.5 px-1 text-center font-bold text-indigo-600 dark:text-indigo-400 bg-background"
                                                            />
                                                        </td>
                                                        {MONTHS.map(m => {
                                                            const val = monthlyValues[m]?.[cat]
                                                            return (
                                                                <td key={m} className="py-2.5 px-1">
                                                                    <Input
                                                                        type="number"
                                                                        min={1}
                                                                        max={10}
                                                                        value={val !== undefined ? val : ''}
                                                                        onChange={e => handleScoreChange(m, cat, e.target.value)}
                                                                        placeholder="-"
                                                                        className="h-8 py-0.5 px-1 text-center font-semibold placeholder:text-muted-foreground/30 focus-visible:ring-indigo-500/50"
                                                                    />
                                                                </td>
                                                            )
                                                        })}
                                                        <td className="py-2.5 px-2 text-center">
                                                            {!isDefault && (
                                                                <button
                                                                    onClick={() => deleteCustomCategory(cat)}
                                                                    className="p-1 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 rounded-md transition-colors"
                                                                    title="Удалить категорию"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
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

                            {/* Sidebar Radar Chart Visualization */}
                            <div className="xl:col-span-4 space-y-6">
                                <Card className="p-4 sm:p-6 border-border shadow-md">
                                    <h3 className="font-bold text-foreground mb-4">Легенда и фильтр месяцев</h3>
                                    
                                    <div className="flex gap-2 mb-4">
                                        <Button size="sm" variant="outline" onClick={selectAllMonths} className="text-xs h-7">
                                            Выбрать все
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={clearAllMonths} className="text-xs h-7 text-muted-foreground">
                                            Сбросить
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-3 gap-2">
                                        {MONTHS.map(m => {
                                            const isChecked = !!selectedMonths[m]
                                            const hasData = Object.values(monthlyValues[m] || {}).some(v => v > 0)
                                            return (
                                                <button
                                                    key={m}
                                                    onClick={() => toggleMonthSelected(m)}
                                                    className={`px-2 py-1.5 rounded-lg border text-xs font-semibold text-center transition-all flex items-center justify-between gap-1 ${
                                                        isChecked
                                                            ? 'border-indigo-500 text-indigo-600 bg-indigo-500/10'
                                                            : 'border-border text-muted-foreground hover:bg-muted/40'
                                                    }`}
                                                >
                                                    <span className="truncate">{m.substring(0, 5)}</span>
                                                    {hasData && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Есть заполнение" />
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </Card>

                                <Card className="p-4 sm:p-6 border-border shadow-md flex flex-col items-center">
                                    <h3 className="font-bold text-foreground mb-4 self-start">Диаграмма баланса</h3>

                                    {/* Responsive Container for Radar Chart */}
                                    <div className="w-full h-[320px] mt-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                                                <PolarGrid stroke="hsl(var(--muted-foreground) / 0.15)" />
                                                <PolarAngleAxis
                                                    dataKey="category"
                                                    tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 500 }}
                                                    className="text-muted-foreground"
                                                />
                                                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fontSize: 9 }} />
                                                
                                                {/* Ideal Base Line */}
                                                <Radar
                                                    name="Мой идеал"
                                                    dataKey="ideal"
                                                    stroke="#64748b"
                                                    strokeDasharray="4 4"
                                                    fill="none"
                                                    strokeWidth={2}
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
                                                            fill={MONTH_COLORS[m]}
                                                            fillOpacity={0.06}
                                                            strokeWidth={1.5}
                                                        />
                                                    )
                                                })}
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: 'hsl(var(--background))',
                                                        borderColor: 'hsl(var(--border))',
                                                        borderRadius: '8px',
                                                        fontSize: '12px'
                                                    }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px', marginTop: '10px' }} />
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
                <Card className="p-4 sm:p-6 border-border shadow-md space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
                        <div>
                            <h2 className="text-xl font-bold text-foreground">История и статистика заполнения</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Участники и месяцы, за которые заполнено колесо баланса в {year} году
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Поиск по имени..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="pl-9 w-full sm:w-[220px] h-9"
                                />
                            </div>
                            <select
                                value={programFilter}
                                onChange={e => setProgramFilter(e.target.value)}
                                className="px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 h-9 font-medium"
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
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                            <p className="text-sm">Загрузка данных отчета...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        <th className="py-3 px-4">Участник</th>
                                        <th className="py-3 px-4 text-center">Всего заполнено месяцев</th>
                                        <th className="py-3 px-4">Месяцы заполнения</th>
                                        <th className="py-3 px-4 text-right">Действие</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-sm">
                                    {reportRows.map(({ participant, filledMonths, count }) => (
                                        <tr key={participant.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-foreground">{participant.name}</div>
                                                {participant.program?.name && (
                                                    <Badge variant="secondary" className="mt-1 text-[10px] px-2 py-0.5">
                                                        {participant.program.name}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-center">
                                                <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${
                                                    count > 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-muted text-muted-foreground'
                                                }`}>
                                                    {count} из 12
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {count > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5 max-w-[500px]">
                                                        {filledMonths.map(m => (
                                                            <Badge
                                                                key={m}
                                                                variant="outline"
                                                                className="text-xs px-2 py-0.5 font-semibold bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
                                                            >
                                                                {m}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Не заполнено</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="gap-1.5 hover:text-indigo-600 hover:bg-indigo-500/10 text-muted-foreground transition-all duration-200"
                                                    onClick={() => {
                                                        setSelectedParticipantId(participant.id)
                                                        setActiveTab('editor')
                                                        
                                                        // Toggle months that are filled
                                                        const monthChecks: Record<string, boolean> = {}
                                                        if (filledMonths.length > 0) {
                                                            filledMonths.forEach(m => {
                                                                monthChecks[m] = true
                                                            })
                                                        } else {
                                                            monthChecks['Январь'] = true
                                                        }
                                                        setSelectedMonths(monthChecks)
                                                    }}
                                                >
                                                    <Eye className="w-4 h-4" /> Посмотреть
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}

                                    {reportRows.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="py-12 text-center text-muted-foreground italic">
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
