'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Compass, Plus, RotateCcw, Settings2, Trash2, Wand2, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MONTHS_RU, MONTHS_SHORT_RU, plural } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageContainer, PageHeader, Panel } from '@/components/erp/page-header'
import { Segmented } from '@/components/erp/segmented'
import { EmptyState } from '@/components/erp/empty-state'
import { useConfirm } from '@/components/erp/confirm'
import { wheelColor } from '@/components/wheels/colors'
import { FillReport, type FillRow } from '@/components/wheels/fill-report'
import { Meter, PanelHeading, ParticipantPicker, PeriodStepper, SaveBar, SaveStatus, WheelTabs, type WheelTab } from '@/components/wheels/parts'
import {
    TEMPLATE_ID,
    saveErrorMessage,
    useBeforeUnload,
    usePersistentState,
    useSaveShortcut,
    type WheelParticipant,
} from '@/components/wheels/shared'
import { SunburstChart, buildColors, groupKey } from '@/components/wheels/sunburst-chart'

// ─────────────────────────── Types ───────────────────────────
type Participant = WheelParticipant

interface WheelCategory {
    id: string
    group?: string
    name: string
    value: number
    color: string
}

// ─────────────────────────── Constants ───────────────────────────
// `color` is kept in the saved data for compatibility; the page itself colours
// sectors by group with theme-aware tokens (see components/wheels/colors.ts).
const G1 = wheelColor(0)
const G2 = wheelColor(1)
const G3 = wheelColor(2)
const G4 = wheelColor(3)
const G5 = wheelColor(4)

const DEFAULT_CATEGORIES: WheelCategory[] = [
    { id: '1', group: 'Здоровье и Энергия', name: 'Здоровье', value: 0, color: G1 },
    { id: '2', group: 'Здоровье и Энергия', name: 'Спорт', value: 0, color: G1 },
    { id: '3', group: 'Здоровье и Энергия', name: 'Сон', value: 0, color: G1 },

    { id: '4', group: 'Семья и Отношения', name: 'Жена', value: 0, color: G2 },
    { id: '5', group: 'Семья и Отношения', name: 'Дети', value: 0, color: G2 },
    { id: '6', group: 'Семья и Отношения', name: 'Родители', value: 0, color: G2 },
    { id: '7', group: 'Семья и Отношения', name: 'Братья / Сестры', value: 0, color: G2 },
    { id: '8', group: 'Семья и Отношения', name: 'Родственники', value: 0, color: G2 },

    { id: '9', group: 'Бизнес и Работа', name: 'Операционка', value: 0, color: G3 },
    { id: '10', group: 'Бизнес и Работа', name: 'Сотрудники', value: 0, color: G3 },
    { id: '11', group: 'Бизнес и Работа', name: 'Стратегия', value: 0, color: G3 },
    { id: '12', group: 'Бизнес и Работа', name: 'Маркетинг / Продажи', value: 0, color: G3 },

    { id: '13', group: 'Личность и Рост', name: 'Учеба / Чтение', value: 0, color: G4 },
    { id: '14', group: 'Личность и Рост', name: 'Хобби / Отдых', value: 0, color: G4 },
    { id: '15', group: 'Личность и Рост', name: 'Личный бренд', value: 0, color: G4 },
    { id: '16', group: 'Личность и Рост', name: 'Активы / Финансы', value: 0, color: G4 },

    { id: '17', group: 'Духовность', name: 'Духовные практики', value: 0, color: G5 },
    { id: '18', group: 'Духовность', name: 'Благотворительность', value: 0, color: G5 },
    { id: '19', group: 'Духовность', name: 'Окружение / Друзья', value: 0, color: G5 },
]

function getPeriodLabel(type: 'weekly' | 'monthly', offset: number): string {
    const d = new Date()
    if (type === 'monthly') {
        d.setMonth(d.getMonth() + offset)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        return `${y}-${m}`
    } else {
        d.setDate(d.getDate() + offset * 7)
        const y = d.getFullYear()

        // Calculate ISO Week Number
        const tempDate = new Date(d.valueOf())
        tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7))
        const yearStart = new Date(tempDate.getFullYear(), 0, 1)
        const weekNo = Math.ceil((((tempDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)

        const w = String(weekNo).padStart(2, '0')
        return `${y}-W${w}`
    }
}

/** Offset (in months / weeks from now) whose label equals `label`. */
function offsetForLabel(type: 'weekly' | 'monthly', label: string): number {
    for (let i = 0; i <= 260; i++) {
        if (getPeriodLabel(type, -i) === label) return -i
        if (i > 0 && getPeriodLabel(type, i) === label) return i
    }
    return 0
}

function formatPeriodLabel(label: string, type: 'weekly' | 'monthly'): string {
    if (!label) return ''
    if (label === 'template') return 'Шаблон · месяц'
    if (label === 'template_weekly') return 'Шаблон · неделя'
    if (type === 'monthly') {
        const [y, m] = label.split('-')
        const idx = parseInt(m, 10) - 1
        return `${MONTHS_RU[idx] || m} ${y}`
    } else {
        const [y, w] = label.split('-W')
        return `Неделя ${Number(w)}, ${y}`
    }
}

/** «25–31 авг 2026» for the week `offset` weeks from now. */
function weekRange(offset: number): string {
    const d = new Date()
    d.setDate(d.getDate() + offset * 7)
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    return mon.getMonth() === sun.getMonth()
        ? `${mon.getDate()}–${sun.getDate()} ${MONTHS_SHORT_RU[sun.getMonth()]} ${sun.getFullYear()}`
        : `${mon.getDate()} ${MONTHS_SHORT_RU[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_SHORT_RU[sun.getMonth()]} ${sun.getFullYear()}`
}

function balanceCategories(cats: WheelCategory[]): WheelCategory[] {
    if (!Array.isArray(cats)) return []
    // Some old entries have categories without an id; editing one of them used
    // to edit all of them at once. Give them a stable id.
    return cats.map((c, i) => ({ ...c, id: c.id ?? `legacy-${i}`, value: Number(c.value) || 0 }))
}

function scaleCategoriesToMax(cats: WheelCategory[], targetMax: number): WheelCategory[] {
    if (!Array.isArray(cats) || cats.length === 0) return []
    const currentTotal = cats.reduce((s, c) => s + (Number(c.value) || 0), 0)
    if (currentTotal === 0) return cats.map(c => ({ ...c, value: 0 }))
    if (Math.abs(currentTotal - targetMax) < 0.05) return cats

    const scale = targetMax / currentTotal
    const scaled = cats.map(c => ({
        ...c,
        value: Number(((Number(c.value) || 0) * scale).toFixed(1))
    }))

    const newTotal = scaled.reduce((s, c) => s + c.value, 0)
    const diff = Number((targetMax - newTotal).toFixed(1))
    if (Math.abs(diff) > 0.001 && scaled.length > 0) {
        let maxIndex = 0
        let maxVal = -1
        scaled.forEach((c, idx) => {
            if (c.value > maxVal) {
                maxVal = c.value
                maxIndex = idx
            }
        })
        scaled[maxIndex] = {
            ...scaled[maxIndex],
            value: Number((scaled[maxIndex].value + diff).toFixed(1))
        }
    }
    return scaled
}

const fmtH = (v: number) => (Math.round(v * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 })

// ─────────────────────────── Main Component ───────────────────────────
interface LifeWheelPageProps {
    participantId?: string
    participantName?: string
}

export function LifeWheelPage({ participantId: fixedParticipantId, participantName }: LifeWheelPageProps = {}) {
    const isParticipantMode = !!fixedParticipantId
    const confirm = useConfirm()

    const [participants, setParticipants] = useState<Participant[]>([])
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>(fixedParticipantId || '')
    const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
    const [periodOffset, setPeriodOffset] = useState(0)
    const [categories, setCategories] = useState<WheelCategory[]>(() => balanceCategories(DEFAULT_CATEGORIES))
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [historyVersion, setHistoryVersion] = useState(0)
    const [history, setHistory] = useState<Array<{ label: string; period_type: string }>>([])
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
    const [editStructure, setEditStructure] = useState(false)

    // Report states
    const [savedTab, setSavedTab] = usePersistentState<WheelTab>('life-wheel-tab', 'editor', ['editor', 'report'])
    const activeTab: WheelTab = isParticipantMode ? 'editor' : savedTab
    const [allEntries, setAllEntries] = useState<Array<{ participant_id: string; period_label: string; period_type: 'weekly' | 'monthly' }>>([])
    const [isReportLoading, setIsReportLoading] = useState(false)

    // Fetch all entries for the report
    useEffect(() => {
        if (activeTab !== 'report') return
        setIsReportLoading(true)
        fetch('/api/life-wheel')
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) {
                    setAllEntries(data)
                }
            })
            .catch(console.error)
            .finally(() => setIsReportLoading(false))
    }, [activeTab])

    const currentLabel = getPeriodLabel(periodType, periodOffset)
    const total = categories.reduce((s, c) => s + (c.value || 0), 0)
    const maxHours = periodType === 'weekly' ? 168 : 720
    const pid = fixedParticipantId || selectedParticipantId
    const isTemplate = pid === TEMPLATE_ID

    // Fetch list of participants (admin mode only)
    useEffect(() => {
        if (isParticipantMode) return
        fetch('/api/participants')
            .then(r => r.json())
            .then(({ data }) => {
                if (Array.isArray(data)) setParticipants(data.filter((p: Participant) => p.status === 'active'))
            })
            .catch(console.error)
    }, [isParticipantMode])

    // Fetch wheel entry for selected participant + period.
    // `requestRef` drops responses that arrive after the user moved on.
    const requestRef = useRef(0)
    const fetchEntry = useCallback(async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return
        const req = ++requestRef.current
        const stale = () => req !== requestRef.current
        setIsLoading(true)

        const targetMax = periodType === 'weekly' ? 168 : 720
        let pType = periodType
        let pLabel = currentLabel

        if (pid === TEMPLATE_ID) {
            pType = periodType
            pLabel = periodType === 'weekly' ? 'template_weekly' : 'template'
        }

        try {
            const params = new URLSearchParams({
                participant_id: pid,
                period_type: pType,
                period_label: pLabel,
            })
            const res = await fetch(`/api/life-wheel?${params}`)
            const { data } = await res.json()
            if (stale()) return
            if (data && data.length > 0 && data[0].categories?.length > 0) {
                // Own saved entry: show exactly what the user saved, without
                // force-scaling up to the period max (720/168h).
                setCategories(balanceCategories(data[0].categories))
            } else {
                if (pid !== TEMPLATE_ID) {
                    try {
                        const tempLabel = periodType === 'weekly' ? 'template_weekly' : 'template'
                        const tempRes = await fetch(`/api/life-wheel?participant_id=${TEMPLATE_ID}&period_type=${pType}&period_label=${tempLabel}`)
                        const tempJson = await tempRes.json()
                        if (stale()) return
                        if (tempJson.data && tempJson.data.length > 0 && tempJson.data[0].categories?.length > 0) {
                            setCategories(scaleCategoriesToMax(balanceCategories(tempJson.data[0].categories), targetMax))
                            setIsLoading(false)
                            setHasUnsavedChanges(false)
                            return
                        }
                    } catch (err) { console.error('Failed to fetch template', err) }
                }
                if (stale()) return
                setCategories(scaleCategoriesToMax(balanceCategories(DEFAULT_CATEGORIES), targetMax))
            }
        } catch (e) {
            console.error(e)
            if (stale()) return
            setCategories(scaleCategoriesToMax(balanceCategories(DEFAULT_CATEGORIES), targetMax))
        } finally {
            if (!stale()) {
                setIsLoading(false)
                setHasUnsavedChanges(false)
            }
        }
    }, [fixedParticipantId, selectedParticipantId, periodType, currentLabel])

    useEffect(() => {
        fetchEntry()
    }, [fetchEntry])

    // Fetch history of saved periods (refreshed after each save)
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
    }, [fixedParticipantId, selectedParticipantId, historyVersion])

    const periodTitle = isTemplate
        ? formatPeriodLabel(periodType === 'weekly' ? 'template_weekly' : 'template', periodType)
        : formatPeriodLabel(currentLabel, periodType)

    // Save Logic
    const handleSave = async () => {
        const pid = fixedParticipantId || selectedParticipantId
        if (!pid) return

        // Save exactly what the user entered. Filling the full 720/168h is
        // encouraged (progress bar + auto-scale button) but NOT required —
        // partial / under-allocated distributions are saved as-is.
        const finalCategories = categories

        setIsSaving(true)

        let pType = periodType
        let pLabel = currentLabel
        if (pid === TEMPLATE_ID) {
            pType = periodType
            pLabel = periodType === 'weekly' ? 'template_weekly' : 'template'
        }

        try {
            const res = await fetch('/api/life-wheel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    participant_id: pid,
                    period_type: pType,
                    period_label: pLabel,
                    categories: finalCategories,
                }),
            })

            let result
            try {
                result = await res.json()
            } catch (err) {
                throw new Error('Не удалось прочитать ответ сервера')
            }

            if (!res.ok || result?.error) {
                throw new Error(result?.error || 'Ошибка сервера при сохранении')
            }

            toast.success('Колесо сохранено', { description: periodTitle })
            setHasUnsavedChanges(false)
            setHistoryVersion(v => v + 1)
        } catch (e: any) {
            toast.error('Не удалось сохранить', { description: saveErrorMessage(e) })
        } finally {
            setIsSaving(false)
        }
    }

    useSaveShortcut(handleSave, activeTab === 'editor' && !!pid && !isSaving)
    useBeforeUnload(hasUnsavedChanges)

    const updateCategory = (id: string, key: keyof WheelCategory, val: any) => {
        setCategories(prev => prev.map(c => (c.id === id ? { ...c, [key]: val } : c)))
        setHasUnsavedChanges(true)
    }

    const addCategory = () => {
        const id = String(Date.now())
        const color = wheelColor(categories.length)
        const group = categories[categories.length - 1]?.group || ''
        setCategories(prev => [...prev, { id, name: 'Новая категория', value: 0, color, group }])
        setHasUnsavedChanges(true)
    }

    const removeCategory = async (id: string, name: string) => {
        const ok = await confirm({
            title: `Удалить «${name || 'без названия'}»?`,
            description: 'Категория пропадёт из этого периода после сохранения.',
            confirmText: 'Удалить',
            destructive: true,
        })
        if (!ok) return
        setCategories(prev => prev.filter(c => c.id !== id))
        setHasUnsavedChanges(true)
    }

    const resetToDefault = async () => {
        const ok = await confirm({
            title: 'Вернуть стандартные категории?',
            description: 'Ваши названия, сферы и добавленные категории будут заменены стандартным набором, часы обнулятся.',
            confirmText: 'Вернуть',
            destructive: true,
        })
        if (!ok) return
        setCategories(balanceCategories(DEFAULT_CATEGORIES))
        setHasUnsavedChanges(true)
    }

    const autoScale = () => {
        setCategories(prev => scaleCategoriesToMax(prev, maxHours))
        setHasUnsavedChanges(true)
    }

    /** Run `fn` only if there is nothing to lose, or the user agrees to drop it. */
    const guard = async (fn: () => void) => {
        if (hasUnsavedChanges) {
            const ok = await confirm({
                title: 'Уйти без сохранения?',
                description: 'Изменения в текущем периоде пропадут.',
                confirmText: 'Не сохранять',
                destructive: true,
            })
            if (!ok) return
        }
        fn()
    }

    const jumpTo = (type: 'weekly' | 'monthly', label: string) =>
        guard(() => {
            setPeriodType(type)
            setPeriodOffset(offsetForLabel(type, label))
        })

    // ── Derived view data ──
    const colors = useMemo(() => buildColors(categories), [categories])
    const grouped = useMemo(() => {
        const m = new Map<string, WheelCategory[]>()
        categories.forEach(c => {
            const g = groupKey(c)
            if (!m.has(g)) m.set(g, [])
            m.get(g)!.push(c)
        })
        return Array.from(m.entries())
    }, [categories])

    const diff = maxHours - total
    const over = diff < -0.05
    const balanced = Math.abs(diff) <= 0.05
    const hoursTone: 'destructive' | 'success' | 'warning' = over ? 'destructive' : balanced ? 'success' : 'warning'
    const hoursText = over
        ? `Больше нормы на ${fmtH(Number((-diff).toFixed(1)))} ч`
        : balanced
            ? 'Все часы распределены'
            : `Осталось распределить ${fmtH(Number(diff.toFixed(1)))} ч`

    const periodSub = periodType === 'weekly'
        ? weekRange(periodOffset)
        : periodOffset === 0 ? 'текущий' : undefined

    // ── Report rows ──
    const curMonth = getPeriodLabel('monthly', 0)
    const curWeek = getPeriodLabel('weekly', 0)
    const reportRows: FillRow[] = useMemo(
        () =>
            participants.map(p => {
                const pEntries = allEntries.filter(e => e.participant_id === p.id && e.participant_id !== TEMPLATE_ID)
                return {
                    participant: p,
                    count: pEntries.length,
                    periods: pEntries.map(e => formatPeriodLabel(e.period_label, e.period_type)),
                    current: pEntries.some(e => e.period_label === curMonth || e.period_label === curWeek),
                }
            }),
        [participants, allEntries, curMonth, curWeek]
    )

    const openFromReport = (row: FillRow) =>
        guard(() => {
            const pEntries = allEntries.filter(e => e.participant_id === row.participant.id && e.participant_id !== TEMPLATE_ID)
            setSelectedParticipantId(row.participant.id)
            setSavedTab('editor')
            if (pEntries.length > 0) {
                setPeriodType(pEntries[0].period_type)
                setPeriodOffset(offsetForLabel(pEntries[0].period_type, pEntries[0].period_label))
            } else {
                setPeriodOffset(0)
            }
        })

    const hoursSummary = (
        <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                    <span className={cn('num font-semibold', over && 'text-destructive')}>{fmtH(Number(total.toFixed(1)))}</span>
                    <span className="num text-muted-foreground">из {maxHours} ч</span>
                </div>
                <p
                    className={cn(
                        'truncate text-xs',
                        hoursTone === 'destructive' && 'text-destructive',
                        hoursTone === 'success' && 'text-success',
                        hoursTone === 'warning' && 'text-muted-foreground'
                    )}
                >
                    {hoursText}
                </p>
            </div>
        </div>
    )

    return (
        <PageContainer>
            <PageHeader
                title="Колесо внимания"
                description={
                    isParticipantMode
                        ? `${participantName ? participantName + ' · ' : ''}Сколько часов уходит на каждую сферу жизни`
                        : 'Распределение времени участников по сферам жизни'
                }
            />

            {!isParticipantMode && (
                <WheelTabs value={activeTab} onChange={t => setSavedTab(t)} dirty={hasUnsavedChanges} />
            )}

            {activeTab === 'report' ? (
                <FillReport
                    rows={reportRows}
                    loading={isReportLoading}
                    unit={['период', 'периода', 'периодов']}
                    currentLabel="за текущий период"
                    onOpen={openFromReport}
                />
            ) : (
                <>
                    {/* Controls */}
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        {!isParticipantMode && (
                            <ParticipantPicker
                                participants={participants}
                                value={selectedParticipantId}
                                onChange={id => guard(() => { setSelectedParticipantId(id); setPeriodOffset(0) })}
                            />
                        )}
                        {pid && (
                            <Segmented
                                aria-label="Масштаб периода"
                                value={periodType}
                                onChange={t => guard(() => { setPeriodType(t); setPeriodOffset(0) })}
                                options={[
                                    { value: 'monthly', label: 'Месяц' },
                                    { value: 'weekly', label: 'Неделя' },
                                ]}
                                className="max-sm:w-full max-sm:[&>button]:h-9 max-sm:[&>button]:flex-1 max-sm:[&>button]:justify-center"
                            />
                        )}
                        {pid && !isTemplate && (
                            <PeriodStepper
                                label={periodType === 'weekly' ? `Неделя ${Number(currentLabel.split('-W')[1])}` : formatPeriodLabel(currentLabel, periodType)}
                                sub={periodSub}
                                onPrev={() => guard(() => setPeriodOffset(o => o - 1))}
                                onNext={() => guard(() => setPeriodOffset(o => o + 1))}
                                onReset={periodOffset !== 0 ? () => guard(() => setPeriodOffset(0)) : undefined}
                            />
                        )}
                        {isTemplate && (
                            <Badge variant="info" className="h-8 px-2.5 text-sm font-normal whitespace-normal">
                                Шаблон подставляется участникам, у которых ещё нет записи за период
                            </Badge>
                        )}
                    </div>

                    {!pid ? (
                        <Panel>
                            <EmptyState
                                icon={Compass}
                                title="Выберите участника"
                                description="Найдите участника в списке выше, чтобы посмотреть или заполнить его колесо внимания."
                                action={
                                    <Button variant="outline" size="sm" onClick={() => setSavedTab('report')}>
                                        Кто уже заполнил
                                    </Button>
                                }
                            />
                        </Panel>
                    ) : (
                        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                            {/* Editor */}
                            <Panel>
                                <PanelHeading
                                    title={editStructure ? 'Категории' : 'Часы по сферам'}
                                    description={
                                        editStructure
                                            ? 'Переименуйте, сгруппируйте или добавьте свои категории'
                                            : `Сколько часов в ${periodType === 'weekly' ? 'неделю' : 'месяц'} уходит на каждую категорию`
                                    }
                                    actions={
                                        editStructure ? (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={resetToDefault}>
                                                    <RotateCcw /> Стандартные
                                                </Button>
                                                <Button variant="soft" size="sm" onClick={() => setEditStructure(false)}>
                                                    Готово
                                                </Button>
                                            </>
                                        ) : (
                                            <Button variant="ghost" size="sm" onClick={() => setEditStructure(true)}>
                                                <Settings2 /> Настроить
                                            </Button>
                                        )
                                    }
                                />

                                {/* Hours target */}
                                <div className="space-y-2 border-b px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        {hoursSummary}
                                        {!balanced && total > 0 && (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="soft" size="sm" onClick={autoScale}>
                                                        <Wand2 /> Подогнать до {maxHours} ч
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Пропорционально изменит все часы, чтобы в сумме вышло {maxHours}</TooltipContent>
                                            </Tooltip>
                                        )}
                                    </div>
                                    <Meter value={total} max={maxHours} tone={over ? 'destructive' : balanced ? 'success' : 'primary'} className="h-2" />
                                </div>

                                {isLoading ? (
                                    <div className="divide-y">
                                        {Array.from({ length: 8 }).map((_, i) => (
                                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                                                <Skeleton className="size-2.5 rounded-full" />
                                                <Skeleton className="h-4 flex-1" />
                                                <Skeleton className="h-9 w-24" />
                                            </div>
                                        ))}
                                    </div>
                                ) : editStructure ? (
                                    <div className="divide-y">
                                        {categories.map(cat => (
                                            <div key={cat.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center">
                                                <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
                                                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors.cat(cat.id) }} />
                                                    <Input
                                                        aria-label="Сфера"
                                                        placeholder="Сфера"
                                                        value={cat.group || ''}
                                                        onChange={e => updateCategory(cat.id, 'group', e.target.value)}
                                                        className="h-10 text-muted-foreground sm:h-9"
                                                    />
                                                </div>
                                                <div className="flex flex-1 items-center gap-2 max-sm:pl-[18px]">
                                                    <Input
                                                        aria-label="Категория"
                                                        placeholder="Название категории"
                                                        value={cat.name}
                                                        onChange={e => updateCategory(cat.id, 'name', e.target.value)}
                                                        aria-invalid={!cat.name.trim() || undefined}
                                                        className="h-10 min-w-0 flex-1 sm:h-9"
                                                    />
                                                    <HoursInput
                                                        id={`h-${cat.id}`}
                                                        value={cat.value}
                                                        onChange={v => updateCategory(cat.id, 'value', v)}
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={`Удалить ${cat.name}`}
                                                        onClick={() => removeCategory(cat.id, cat.name)}
                                                        className="size-10 shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive sm:size-9"
                                                    >
                                                        <Trash2 />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="px-4 py-3">
                                            <Button variant="outline" onClick={addCategory} className="w-full max-sm:h-11">
                                                <Plus /> Добавить категорию
                                            </Button>
                                        </div>
                                    </div>
                                ) : categories.length === 0 ? (
                                    <EmptyState
                                        title="Категорий нет"
                                        description="Добавьте свои категории или верните стандартный набор"
                                        action={
                                            <Button size="sm" onClick={() => setEditStructure(true)}>
                                                <Settings2 /> Настроить
                                            </Button>
                                        }
                                    />
                                ) : (
                                    <div>
                                        {grouped.map(([g, items]) => {
                                            const sub = items.reduce((s, c) => s + (c.value || 0), 0)
                                            return (
                                                <section key={g}>
                                                    <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm">
                                                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colors.group(g) }} />
                                                        <h3 className="min-w-0 flex-1 truncate font-medium">{g}</h3>
                                                        <span className="num text-muted-foreground">
                                                            {fmtH(Number(sub.toFixed(1)))} ч
                                                            <span className="max-sm:hidden"> · {total > 0 ? Math.round((sub / total) * 100) : 0}%</span>
                                                        </span>
                                                    </div>
                                                    <div className="divide-y border-b last:border-b-0">
                                                        {items.map(cat => (
                                                            <div key={cat.id} className="flex items-center gap-3 px-4 py-1.5 sm:py-1">
                                                                <label htmlFor={`h-${cat.id}`} className="min-w-0 flex-1 py-1.5 text-sm">
                                                                    {cat.name || <span className="text-muted-foreground">Без названия</span>}
                                                                </label>
                                                                <span className="num w-9 text-right text-xs text-muted-foreground">
                                                                    {total > 0 ? Math.round((cat.value / total) * 100) : 0}%
                                                                </span>
                                                                <HoursInput
                                                                    id={`h-${cat.id}`}
                                                                    value={cat.value}
                                                                    onChange={v => updateCategory(cat.id, 'value', v)}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>
                                            )
                                        })}
                                    </div>
                                )}
                            </Panel>

                            {/* Chart + history */}
                            <div className="space-y-4">
                                <Panel>
                                    <PanelHeading title="Диаграмма" description={periodTitle} />
                                    <div className="px-2 py-4 sm:px-4">
                                        <SunburstChart categories={categories} maxHours={maxHours} />
                                    </div>
                                    {total > 0 && (
                                        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t px-4 py-3 text-sm sm:grid-cols-2">
                                            {grouped.map(([g, items]) => {
                                                const sub = items.reduce((s, c) => s + (c.value || 0), 0)
                                                if (sub <= 0) return null
                                                return (
                                                    <li key={g} className="flex items-center gap-2">
                                                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colors.group(g) }} />
                                                        <span className="min-w-0 flex-1 truncate">{g}</span>
                                                        <span className="num text-muted-foreground">{Math.round((sub / total) * 100)}%</span>
                                                        <span className="num w-14 text-right font-medium">{fmtH(Number(sub.toFixed(1)))} ч</span>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    )}
                                </Panel>

                                <Panel>
                                    <PanelHeading
                                        title="Сохранённые периоды"
                                        description={
                                            history.length
                                                ? `${history.length} ${plural(history.length, ['запись', 'записи', 'записей'])} · нажмите, чтобы открыть`
                                                : undefined
                                        }
                                    />
                                    {history.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5 px-4 py-3">
                                            {history.slice(0, 16).map((h, i) => {
                                                const type = h.period_type === 'weekly' ? 'weekly' : 'monthly'
                                                const isTemplateLabel = h.label === 'template' || h.label === 'template_weekly'
                                                const active = isTemplateLabel
                                                    ? isTemplate && type === periodType
                                                    : type === periodType && h.label === currentLabel
                                                return (
                                                    <button
                                                        key={`${h.period_type}-${h.label}-${i}`}
                                                        type="button"
                                                        onClick={() => (isTemplateLabel ? guard(() => setPeriodType(type)) : jumpTo(type, h.label))}
                                                        className={cn(
                                                            'h-9 rounded-md border px-3 text-sm transition-colors sm:h-8',
                                                            active
                                                                ? 'border-transparent bg-primary-soft font-medium text-primary-soft-foreground'
                                                                : 'bg-card hover:bg-accent'
                                                        )}
                                                    >
                                                        {formatPeriodLabel(h.label, type)}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            icon={History}
                                            title="Пока ничего не сохранено"
                                            description="Сохранённые недели и месяцы появятся здесь"
                                            className="py-8"
                                        />
                                    )}
                                </Panel>
                            </div>
                        </div>
                    )}

                    {pid && (
                        <SaveBar dirty={hasUnsavedChanges} saving={isSaving} disabled={!selectedParticipantId} onSave={handleSave}>
                            <div className="flex items-center gap-3">
                                <div className="hidden min-w-0 sm:block">
                                    <p className="truncate font-medium">{periodTitle}</p>
                                    <div className="text-xs">
                                        <SaveStatus dirty={hasUnsavedChanges} />
                                    </div>
                                </div>
                                <div className="hidden h-8 w-px bg-border sm:block" />
                                {hoursSummary}
                            </div>
                        </SaveBar>
                    )}
                </>
            )}
        </PageContainer>
    )
}

function HoursInput({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
    return (
        <div className="relative w-24 shrink-0">
            <Input
                id={id}
                type="number"
                inputMode="decimal"
                enterKeyHint="next"
                min={0}
                step="0.1"
                placeholder="0"
                value={value || ''}
                onChange={e => onChange(Math.max(0, Number(e.target.value)))}
                onFocus={e => e.currentTarget.select()}
                className="num h-10 [appearance:textfield] pr-7 text-right sm:h-8 [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">ч</span>
        </div>
    )
}

export default LifeWheelPage
