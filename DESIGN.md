# Год в деле: UI design system

A modern, calm ERP for finance and HR in an education company. It is used daily at a desk, on a laptop, between calls, and sometimes on a phone in the evening. The interface should disappear into the task: dense where data matters, quiet everywhere else, and never more than two clicks away from the next action.

**Reference implementation:** `components/income-expenses-page.tsx` together with `components/finance/*`. When in doubt, copy what it does.

## Principles

1. **Fewest actions.** Smart defaults: today's date, the last used account, the participant's tariff. Search instead of scrolling a long `<select>`. Forms open in a side sheet so the list stays visible. Offer "Сохранить и ещё" for repeated entry, and `⌘/Ctrl+Enter` to submit.
2. **One surface per idea.** Use bordered panels (`Panel`), not stacks of cards. Never nest cards. A KPI row is one `StatStrip`, not four floating cards.
3. **Data first.** Tables are dense (`py-2.5` cells), numbers are tabular (`num` class) and right-aligned, and a totals line sits at the bottom.
4. **Quiet colour.** Tinted neutrals, plus one accent (`primary`) used only for primary actions, the active state and focus. Status colours only carry meaning: `success` for paid or ok, `destructive` for overdue or negative, `warning` for partial or attention, `info`.
5. **Russian, human copy.** Write «Новое поступление», not «Добавить запись». Errors say what to do next. Use `plural()` for counts.

## Tokens (app/globals.css)

- Surfaces: `bg-background` (app canvas), `bg-card` (panels, sheets), `bg-muted` (subtle fills, tracks), `bg-accent` (hover).
- Text: `text-foreground`, `text-muted-foreground` (secondary; never lighter than that).
- Accent: `bg-primary` / `text-primary`, plus the soft pair `bg-primary-soft` + `text-primary-soft-foreground` (selected chips, active nav).
- Status: `text-success` / `bg-success-soft`, `text-destructive` / `bg-destructive-soft`, `text-warning` / `bg-warning-soft`, `text-info` / `bg-info-soft`.
- Charts: `var(--chart-1..6)` for categories, `var(--chart-income)` and `var(--chart-expense)` for money flows.
- Shadows: `shadow-xs` (panels), `shadow-pop` (popovers, sheets).
- **Never** hardcode hex or Tailwind palette colours (`text-green-600`, `bg-blue-50`, `#3b82f6`). Everything must work in the light and dark themes and with all six accent colours.

## Page anatomy

```tsx
<PageContainer>
  <PageHeader title="…" description="…" actions={<>filters (size="sm") · secondary button · primary button</>} />
  <StatStrip stats={[…]} />                 // optional, 2–4 key numbers
  <Segmented value={tab} … />               // optional, in-page views with counts
  <Panel>
    <PanelToolbar>SearchInput · Select filters (size="sm")</PanelToolbar>
    <Table>…</Table> | <EmptyState …/>
    <TotalsBar …/> <TablePagination …/>
  </Panel>
  <XxxSheet …/>                              // create / edit forms
</PageContainer>
```

The page title comes from `PageHeader`. The top navigation already shows the section, so do not add breadcrumbs.

## Components

| Need | Use |
|---|---|
| Page wrapper / header | `PageContainer`, `PageHeader` (`@/components/erp/page-header`) |
| Bordered surface / toolbar | `Panel`, `PanelToolbar` |
| KPI row | `StatStrip` (`@/components/erp/stat-strip`) |
| In-page tabs, small toggles (currency, view) | `Segmented` (`@/components/erp/segmented`) |
| Search box | `SearchInput` (`@/components/erp/search-input`) |
| Long lists to choose from (participants, employees) | `Combobox` (`@/components/erp/combobox`) |
| Short fixed lists | `Select` from `@/components/ui/select` (use `size="sm"` in toolbars). **No native `<select>`.** |
| Form field with label, hint and error | `Field`, `FieldGroup` (`@/components/erp/field`) |
| Create / edit form | `Sheet` + `SheetHeader/SheetBody/SheetFooter` (`@/components/ui/sheet`), with a `<form>` wrapping everything. Use `Dialog` only for tiny one-field prompts. |
| Delete / irreversible action | `const confirm = useConfirm()` (`@/components/erp/confirm`), then `if (!(await confirm({ title, description, confirmText: 'Удалить', destructive: true }))) return` |
| Feedback | `toast.success('…')` / `toast.error('Не удалось …', { description: err.message })` from `sonner`. **Never `alert()` or `window.confirm()`.** |
| Empty list | `EmptyState` with an icon, a title, one line of help and an action |
| Loading | `TableSkeleton`, `Skeleton`. No full-page spinners. |
| Table footer total / pagination | `TotalsBar`, `rowActionsCls`, `dangerIconCls` (`@/components/erp/table-parts`), `TablePagination` |
| Charts | Recharts with `ChartTooltip`, `ChartLegend`, `axisProps`, `gridProps`, `compactTick`, `CHART_COLORS` (`@/components/erp/chart`) |
| Status pill | `Badge` with variant `success`, `destructive`, `warning`, `info`, `secondary` (neutral) or `default` (accent-soft) |
| Row menu | `DropdownMenu` (`@/components/ui/dropdown-menu`) with a `MoreHorizontal` trigger |
| Hint on hover | `Tooltip` (`@/components/ui/tooltip`; the provider is global) |
| On/off | `Switch` (`@/components/ui/switch`) inside a bordered label row |
| Money / dates | `formatMoney(v, currency, { sign })`, `formatDate`, `formatNumber`, `plural`, `MONTHS_RU`, `todayISO` (`@/lib/format`) |

## Patterns

- **Row actions:** add `className="group"` on `TableRow`, and wrap the icon buttons in `<div className={rowActionsCls}>` so they show on hover. Clicking the row itself opens edit or detail when that makes sense.
- **Global "Создать":** the top bar can request an action for a page. Handle it with `useNavAction('new-participant', () => openSheet())` from `@/components/app-shell/nav-context`. Existing ids: `new-payment`, `new-expense` (income), `new-participant` (participants), `new-event` (offline), `new-employee` (employees).
- **Navigating:** `const { navigate } = useNav(); navigate('income')`.
- **Filters** that a user sets daily (period, program, tab) persist in `localStorage`, with every access wrapped in try/catch.
- **Validation:** show inline errors under fields (`Field hint` in `text-destructive`) and set `aria-invalid` on the control. Do not block with popups.
- **Responsive:** hide secondary table columns with `max-sm:hidden` / `max-md:hidden` / `max-lg:hidden`. Toolbars wrap. Sheets are full-width on phones.
- **Motion:** 150–250 ms colour and opacity transitions only. No decorative animation.

## Bans

Side-stripe coloured borders, gradient text, glassmorphism, emoji as icons in UI chrome, uppercase tracked eyebrow labels, identical icon-card grids, hardcoded colours, `alert()` / `confirm()`, native `<select>`, full-page spinners, and modals for long forms.
