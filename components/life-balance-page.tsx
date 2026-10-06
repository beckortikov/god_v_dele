'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Scale, Settings2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_SHORT_RU } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import { MONTH_COLORS } from '@/components/wheels/colors'
import { FillReport, type FillRow } from '@/components/wheels/fill-report'
import {
    Meter,
    PanelHeading,
    ParticipantPicker,
    PeriodStepper,
    SaveBar,
    SaveStatus,
    WheelTabs,
    YearSelect,
    type WheelTab,
} from '@/components/wheels/parts'
import {
    MONTHS_FULL,
    TEMPLATE_ID,
    saveErrorMessage,
    useBeforeUnload,
    usePersistentState,
    useSaveShortcut,
    type WheelParticipant,
} from '@/components/wheels/shared'
import { WheelRadar } from '@/components/wheels/wheel-radar'

// ─────────────────────────── Types ───────────────────────────
type Participant = WheelParticipant

interface LifeBalanceEntry {
    id?: string
    participant_id: string
    year: number
    ideal_values: Record<string, number>
    monthly_values: Record<string, Record<string, number>>
}

// ─────────────────────────── Constants ───────────────────────────
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

const MONTHS = MONTHS_FULL

type View = 'month' | 'year'

export function LifeBalancePage({ participantId: fixedParticipantId, participantName }: { participantId?: string, participantName?: string } = {}) {
    const isParticipantMode = !!fixedParticipantId
    const confirm = useConfirm()

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [year, setYear] = useState<number>(() => new Date().getFullYear())

    // Category lists & values
    const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORY_NAMES)
    const [idealValues, setIdealValues] = useState<Record<string, number>>({})
    const [monthlyValues, setMonthlyValues] = useState<Record<string, Record<string, number>>>({})

    // Which months are selected to render in the radar
    const [selectedMonths, setSelectedMonths] = useState<Record<string, boolean>>(() => {
        const curM = MONTHS[new Date().getMonth()]
        return MONTHS.reduce((acc, m) => {
            acc[m] = m === curM
            return acc
        }, {} as Record<string, boolean>)
    })

    // View state (presentation only)
    const [view, setView] = usePersistentState<View>('life-balance-view', 'month', ['month', 'year'])
    const [focusMonth, setFocusMonth] = useState<string>(() => MONTHS[new Date().getMonth()])
    const [editCats, setEditCats] = useState(false)

    // UI Feedback States
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Report states
    const [savedTab, setSavedTab] = usePersistentState<WheelTab>('life-balance-tab', 'editor', ['editor', 'report'])
    const activeTab: WheelTab = isParticipantMode ? 'editor' : savedTab
    const [allEntries, setAllEntries] = useState<LifeBalanceEntry[]>([])
    const [isReportLoading, setIsReportLoading] = useState(false)

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

    const pid = fixedParticipantId || selectedParticipantId

    // Admin: when a participant opens, jump to the latest month they rated
    // (participants keep the current month, which they are about to fill).
    useEffect(() => {
        if (isLoading || isParticipantMode) return
        const curM = MONTHS[new Date().getMonth()]
        const hasCur = Object.keys(monthlyValues[curM] || {}).length > 0
        if (hasCur) return
        const last = [...MONTHS].reverse().find(m => Object.keys(monthlyValues[m] || {}).length > 0)
        if (!last) return
        setFocusMonth(last)
        setSelectedMonths({ [last]: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading])

    // Save
    const handleSave = async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) {
            toast.error('Сначала выберите участника')
            return
        }

        setIsSaving(true)

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

            toast.success('Колесо жизни сохранено', { description: `${year} год` })
            setHasUnsavedChanges(false)
            fetchReportData()
        } catch (e: any) {
            toast.error('Не удалось сохранить', { description: saveErrorMessage(e) })
        } finally {
            setIsSaving(false)
        }
    }

    useSaveShortcut(handleSave, activeTab === 'editor' && !!pid && !isSaving)
    useBeforeUnload(hasUnsavedChanges)

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
        setEditCats(true)
    }

    const removeCategory = async (index: number) => {
        const name = categories[index]
        const ok = await confirm({
            title: `Удалить «${name}»?`,
            description: 'Все оценки по этой категории за год будут стёрты после сохранения.',
            confirmText: 'Удалить',
            destructive: true,
        })
        if (!ok) return

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

    /** Run `fn` only if there is nothing to lose, or the user agrees to drop it. */
    const guard = async (fn: () => void) => {
        if (hasUnsavedChanges) {
            const ok = await confirm({
                title: 'Уйти без сохранения?',
                description: 'Несохранённые оценки пропадут.',
                confirmText: 'Не сохранять',
                destructive: true,
            })
            if (!ok) return
        }
        fn()
    }

    // Report processing
    const curMonthName = MONTHS[new Date().getMonth()]
    const reportRows: FillRow[] = useMemo(() => {
        return participants.map(p => {
            const userEntries = allEntries.filter(e => e.participant_id === p.id && e.participant_id !== TEMPLATE_ID)
            const filledMonths = MONTHS.filter(m => {
                const entry = userEntries[0] // Since grouped by year
                return entry && entry.monthly_values?.[m] && Object.keys(entry.monthly_values[m]).length > 0
            })
            return {
                participant: p,
                count: filledMonths.length,
                periods: filledMonths,
                current: year === new Date().getFullYear() && filledMonths.includes(curMonthName),
            }
        })
    }, [participants, allEntries, year, curMonthName])

    const openFromReport = (row: FillRow) =>
        guard(() => {
            setSelectedParticipantId(row.participant.id)
            setSavedTab('editor')
            if (row.periods.length > 0) {
                const lastM = row.periods[row.periods.length - 1]
                setSelectedMonths({ [lastM]: true })
                setFocusMonth(lastM)
            }
        })

    // ── View helpers ──
    const idealOf = (cat: string) => (idealValues[cat] !== undefined ? idealValues[cat] : 10)
    const focusIdx = MONTHS.indexOf(focusMonth)
    const ratedInFocus = categories.filter(c => monthlyValues[focusMonth]?.[c] !== undefined).length
    const curMonthIdx = new Date().getMonth()
    const isCurrentYear = year === new Date().getFullYear()

    const radarSeries = [
        { key: 'ideal', name: 'Мой идеал', color: 'var(--muted-foreground)', dashed: true },
        ...MONTHS.filter(m => selectedMonths[m]).map(m => ({ key: m, name: m, color: MONTH_COLORS[MONTHS.indexOf(m)] })),
    ]

    const editorSkeleton = (
        <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-9 w-12" />
                    <Skeleton className="h-9 w-14" />
                </div>
            ))}
        </div>
    )

    const categoryEditButton = (
        <Button variant={editCats ? 'soft' : 'ghost'} size="sm" onClick={() => setEditCats(v => !v)}>
            {editCats ? 'Готово' : <><Settings2 /> Категории</>}
        </Button>
    )

    return (
        <PageContainer>
            <PageHeader
                title="Колесо жизни"
                description={
                    isParticipantMode
                        ? `${participantName ? participantName + ' · ' : ''}Оцените каждую сферу жизни от 0 до 10`
                        : 'Оценки участников по сферам жизни, месяц за месяцем'
                }
            />

            {!isParticipantMode && (
                <WheelTabs value={activeTab} onChange={t => setSavedTab(t)} dirty={hasUnsavedChanges} />
            )}

            {activeTab === 'report' ? (
                <FillReport
                    rows={reportRows}
                    loading={isReportLoading}
                    outOf={12}
                    unit={['месяц', 'месяца', 'месяцев']}
                    currentLabel="в этом месяце"
                    onOpen={openFromReport}
                    toolbarExtra={<YearSelect value={year} onChange={y => guard(() => setYear(y))} />}
                    maxBadges={12}
                />
            ) : (
                <>
                    {/* Controls */}
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        {!isParticipantMode && (
                            <ParticipantPicker
                                participants={participants}
                                value={selectedParticipantId}
                                onChange={id => guard(() => setSelectedParticipantId(id))}
                            />
                        )}
                        {pid && (
                            <div className="flex items-center gap-2">
                                <YearSelect value={year} onChange={y => guard(() => setYear(y))} />
                                <Segmented
                                    aria-label="Вид"
                                    value={view}
                                    onChange={setView}
                                    options={[
                                        { value: 'month', label: 'По месяцам' },
                                        { value: 'year', label: 'Весь год' },
                                    ]}
                                    className="max-sm:flex-1 max-sm:[&>button]:h-8 max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center"
                                />
                            </div>
                        )}
                    </div>

                    {!pid ? (
                        <Panel>
                            <EmptyState
                                icon={Scale}
                                title="Выберите участника"
                                description="Найдите участника в списке выше, чтобы открыть его оценки за год."
                                action={
                                    <Button variant="outline" size="sm" onClick={() => setSavedTab('report')}>
                                        Кто уже заполнил
                                    </Button>
                                }
                            />
                        </Panel>
                    ) : (
                        <div
                            className={cn(
                                'grid grid-cols-1 items-start gap-4',
                                view === 'month' ? 'lg:grid-cols-2' : 'xl:grid-cols-[minmax(0,1fr)_380px]'
                            )}
                        >
                            {view === 'month' ? (
                                /* ── One month at a time: phone-friendly list ── */
                                <Panel className="overflow-visible">
                                    <PanelHeading
                                        title="Оценки за месяц"
                                        description="0 — совсем плохо, 10 — идеально"
                                        actions={categoryEditButton}
                                        className="rounded-t-xl"
                                    />
                                    <div className="flex items-center gap-3 border-b px-4 py-2.5">
                                        <PeriodStepper
                                            className="flex-1 sm:flex-none"
                                            label={`${focusMonth} ${year}`}
                                            onPrev={() => setFocusMonth(MONTHS[focusIdx - 1])}
                                            onNext={() => setFocusMonth(MONTHS[focusIdx + 1])}
                                            prevDisabled={focusIdx <= 0}
                                            nextDisabled={focusIdx >= 11}
                                            onReset={isCurrentYear && focusIdx !== curMonthIdx ? () => setFocusMonth(MONTHS[curMonthIdx]) : undefined}
                                        />
                                        <span className="num ml-auto text-sm text-muted-foreground max-sm:hidden">
                                            Оценено {ratedInFocus} из {categories.length}
                                        </span>
                                    </div>

                                    {/* Column captions stay visible while scrolling */}
                                    <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-4 py-1.5 text-xs text-muted-foreground">
                                        <span className="flex-1">Сфера</span>
                                        <span className="w-12 text-center">Идеал</span>
                                        <span className="w-16 text-center">{focusMonth.slice(0, 3)}</span>
                                        {editCats && <span className="w-10" />}
                                    </div>

                                    {isLoading ? editorSkeleton : (
                                        <div className="divide-y">
                                            {categories.map((cat, idx) => {
                                                const isDefault = DEFAULT_CATEGORY_NAMES.includes(cat)
                                                const ideal = idealOf(cat)
                                                const val = monthlyValues[focusMonth]?.[cat]
                                                return (
                                                    <div key={idx} className="flex items-center gap-3 px-4 py-2">
                                                        <div className="min-w-0 flex-1">
                                                            {editCats && !isDefault ? (
                                                                <Input
                                                                    aria-label="Название категории"
                                                                    value={cat}
                                                                    onChange={e => handleCustomCategoryChange(idx, e.target.value)}
                                                                    className="h-9"
                                                                />
                                                            ) : (
                                                                <label htmlFor={`s-${idx}`} className="block truncate text-sm first-letter:uppercase">
                                                                    {cat}
                                                                </label>
                                                            )}
                                                            <Meter
                                                                value={val ?? 0}
                                                                max={10}
                                                                marker={ideal}
                                                                tone={val !== undefined && val >= ideal ? 'success' : 'primary'}
                                                                className="mt-2"
                                                            />
                                                        </div>
                                                        <ScoreInput
                                                            value={ideal}
                                                            onChange={v => handleIdealChange(cat, v)}
                                                            ariaLabel={`Идеал: ${cat}`}
                                                            className="w-12 text-muted-foreground"
                                                        />
                                                        <ScoreInput
                                                            id={`s-${idx}`}
                                                            value={val !== undefined ? val : ''}
                                                            onChange={v => handleScoreChange(focusMonth, cat, v)}
                                                            ariaLabel={`${focusMonth}: ${cat}`}
                                                            placeholder="–"
                                                            className="w-16 font-medium"
                                                        />
                                                        {editCats && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                disabled={isDefault}
                                                                aria-label={`Удалить ${cat}`}
                                                                onClick={() => removeCategory(idx)}
                                                                className="size-10 shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive disabled:opacity-0"
                                                            >
                                                                <Trash2 />
                                                            </Button>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                            {editCats && (
                                                <div className="px-4 py-3">
                                                    <Button variant="outline" onClick={addCustomCategory} className="w-full max-sm:h-11">
                                                        <Plus /> Добавить категорию
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Panel>
                            ) : (
                                /* ── Whole year: matrix with sticky header and first column ── */
                                <Panel>
                                    <PanelHeading
                                        title="Оценки за год"
                                        description="Идеал и оценки по месяцам, от 0 до 10"
                                        actions={
                                            <Button variant="ghost" size="sm" onClick={addCustomCategory}>
                                                <Plus /> Категория
                                            </Button>
                                        }
                                    />
                                    {isLoading ? editorSkeleton : (
                                        <div className="max-h-[70vh] overflow-auto">
                                            <table className="w-full border-separate border-spacing-0 text-sm">
                                                <thead>
                                                    <tr className="text-xs text-muted-foreground">
                                                        <th className="sticky top-0 left-0 z-30 min-w-28 border-r sm:min-w-40 border-b bg-card px-3 py-2 text-left font-medium">Сфера</th>
                                                        <th className="sticky top-0 z-20 border-b bg-muted px-1.5 py-2 text-center font-medium">Идеал</th>
                                                        {MONTHS.map((m, i) => (
                                                            <th
                                                                key={m}
                                                                className={cn(
                                                                    'sticky top-0 z-20 border-b bg-card px-1 py-2 text-center font-medium',
                                                                    isCurrentYear && i === curMonthIdx && 'text-primary'
                                                                )}
                                                            >
                                                                {MONTHS_SHORT_RU[i]}
                                                            </th>
                                                        ))}
                                                        <th className="sticky top-0 z-20 w-10 border-b bg-card" />
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {categories.map((cat, idx) => {
                                                        const isDefault = DEFAULT_CATEGORY_NAMES.includes(cat)
                                                        return (
                                                            <tr key={idx} className="group">
                                                                <td className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1.5 group-hover:bg-muted">
                                                                    {isDefault ? (
                                                                        <span className="block max-w-48 truncate first-letter:uppercase">{cat}</span>
                                                                    ) : (
                                                                        <Input
                                                                            aria-label="Название категории"
                                                                            value={cat}
                                                                            onChange={e => handleCustomCategoryChange(idx, e.target.value)}
                                                                            className="h-8"
                                                                        />
                                                                    )}
                                                                </td>
                                                                <td className="border-b bg-muted/60 px-1.5 py-1.5">
                                                                    <ScoreInput
                                                                        value={idealOf(cat)}
                                                                        onChange={v => handleIdealChange(cat, v)}
                                                                        ariaLabel={`Идеал: ${cat}`}
                                                                        className="w-11 sm:h-8"
                                                                    />
                                                                </td>
                                                                {MONTHS.map(m => {
                                                                    const val = monthlyValues[m]?.[cat]
                                                                    return (
                                                                        <td key={m} className="border-b px-0.5 py-1.5">
                                                                            <ScoreInput
                                                                                value={val !== undefined ? val : ''}
                                                                                onChange={v => handleScoreChange(m, cat, v)}
                                                                                ariaLabel={`${m}: ${cat}`}
                                                                                placeholder="–"
                                                                                className="w-11 sm:h-8"
                                                                                heat={val}
                                                                            />
                                                                        </td>
                                                                    )
                                                                })}
                                                                <td className="border-b px-1 py-1.5 text-right">
                                                                    {!isDefault && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            aria-label={`Удалить ${cat}`}
                                                                            onClick={() => removeCategory(idx)}
                                                                            className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                                                                        >
                                                                            <Trash2 />
                                                                        </Button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </Panel>
                            )}

                            {/* Radar */}
                            <Panel>
                                <PanelHeading
                                    title="Диаграмма баланса"
                                    description="Пунктир — ваш идеал"
                                    actions={
                                        <>
                                            <Button variant="ghost" size="xs" onClick={selectAllMonths}>Все</Button>
                                            <Button variant="ghost" size="xs" onClick={clearAllMonths} className="text-muted-foreground">Сбросить</Button>
                                        </>
                                    }
                                />
                                <div className="grid grid-cols-4 gap-1.5 border-b px-4 py-3 sm:grid-cols-6">
                                    {MONTHS.map((m, i) => {
                                        const on = !!selectedMonths[m]
                                        const hasData = Object.values(monthlyValues[m] || {}).some(v => v > 0)
                                        return (
                                            <button
                                                key={m}
                                                type="button"
                                                aria-pressed={on}
                                                onClick={() => toggleMonthSelected(m)}
                                                title={hasData ? 'Есть оценки' : 'Нет оценок'}
                                                className={cn(
                                                    'flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs transition-colors sm:h-8',
                                                    on
                                                        ? 'border-transparent bg-primary-soft font-medium text-primary-soft-foreground'
                                                        : hasData
                                                            ? 'bg-card text-foreground hover:bg-accent'
                                                            : 'bg-card text-muted-foreground hover:bg-accent'
                                                )}
                                            >
                                                <span
                                                    className={cn('size-2 rounded-full', !on && !hasData && 'opacity-30')}
                                                    style={{ background: on ? MONTH_COLORS[i] : hasData ? 'var(--success)' : 'var(--muted-foreground)' }}
                                                />
                                                {MONTHS_SHORT_RU[i]}
                                            </button>
                                        )
                                    })}
                                </div>
                                <div className="px-2 pt-2 pb-4 sm:px-4">
                                    <WheelRadar data={chartData} series={radarSeries} max={10} height={340} />
                                </div>
                            </Panel>
                        </div>
                    )}

                    {pid && (
                        <SaveBar dirty={hasUnsavedChanges} saving={isSaving} disabled={!selectedParticipantId} onSave={handleSave}>
                            <div className="min-w-0">
                                <p className="truncate font-medium">
                                    {view === 'month' ? `${focusMonth}: оценено ${ratedInFocus} из ${categories.length}` : `${year} год`}
                                </p>
                                <div className="text-xs">
                                    <SaveStatus dirty={hasUnsavedChanges} />
                                </div>
                            </div>
                        </SaveBar>
                    )}
                </>
            )}
        </PageContainer>
    )
}

/** 0–10 score field: numeric keyboard on phones, selects on focus. */
function ScoreInput({
    id,
    value,
    onChange,
    ariaLabel,
    placeholder,
    className,
    heat,
}: {
    id?: string
    value: number | string
    onChange: (v: string) => void
    ariaLabel: string
    placeholder?: string
    className?: string
    /** Tints the cell by score (year matrix). */
    heat?: number
}) {
    return (
        <Input
            id={id}
            type="number"
            inputMode="numeric"
            enterKeyHint="next"
            min={0}
            max={10}
            value={value}
            placeholder={placeholder}
            aria-label={ariaLabel}
            onChange={e => onChange(e.target.value)}
            onFocus={e => e.currentTarget.select()}
            className={cn('num h-10 shrink-0 px-1 text-center [appearance:textfield] sm:h-9 [&::-webkit-inner-spin-button]:appearance-none', className)}
            style={heat !== undefined ? { background: `color-mix(in oklch, var(--primary) ${Math.round(heat * 3.5)}%, var(--card))` } : undefined}
        />
    )
}

export default LifeBalancePage
