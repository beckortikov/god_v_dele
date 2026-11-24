/**
 * Instagram clients in the CRM: the sales stages and their funnel. Pure, shared by server and client.
 * Stored values are English (migration 029), labels Russian.
 */

export const IG_STAGES = ['new', 'talk', 'mm', 'pay', 'member'] as const
export type IgStage = (typeof IG_STAGES)[number]

export type IgVariant = 'secondary' | 'warning' | 'default' | 'info' | 'success'

export const IG_STAGE_INFO: { value: IgStage; label: string; hint: string; variant: IgVariant }[] = [
  { value: 'new', label: 'Новый', hint: 'Написал или оставил комментарий', variant: 'secondary' },
  { value: 'talk', label: 'В диалоге', hint: 'Мы ответили, идёт разговор', variant: 'warning' },
  { value: 'mm', label: 'Мастермайнд', hint: 'Приглашён на встречу', variant: 'default' },
  { value: 'pay', label: 'Оплата', hint: 'Решился, ждём оплату', variant: 'info' },
  { value: 'member', label: 'Участник', hint: 'Оплатил, в программе', variant: 'success' },
]

export const isIgStage = (v: unknown): v is IgStage => typeof v === 'string' && (IG_STAGES as readonly string[]).includes(v)
export const igStageOf = (v: string | null | undefined) => IG_STAGE_INFO.find(s => s.value === v) ?? IG_STAGE_INFO[0]

export const IG_NOTE_MAX = 2000

export interface IgContact {
  ig_user_id: string
  stage: IgStage
  note: string | null
  participant_id: string | null
  participant_name?: string | null
}

/**
 * Cumulative steps: someone at «Оплата» has also been in a dialog and at the mastermind.
 * `people` is everyone known: conversation partners and commenters with a CRM card.
 */
export function igFunnel(people: { stage: IgStage | null | undefined; inBase: boolean }[]) {
  const idx = (s: IgStage | null | undefined) => Math.max(0, IG_STAGES.indexOf(s ?? 'new'))
  const steps = IG_STAGE_INFO.map((s, i) => ({ ...s, count: people.filter(p => idx(p.stage) >= i).length }))
  const current = Object.fromEntries(IG_STAGES.map(s => [s, people.filter(p => (p.stage ?? 'new') === s).length])) as Record<IgStage, number>
  return { total: people.length, inBase: people.filter(p => p.inBase).length, steps, current }
}

/** First reply moves a new client to «В диалоге»; later stages stay as set. */
export const stageAfterReply = (s: IgStage | null | undefined): IgStage => (!s || s === 'new' ? 'talk' : s)

/** «Фотех Юсуфзода | Товарный бизнес 🚀» → name and what they do; people often write it so in their Instagram name. */
export function splitInstagramName(raw: string): { name: string; activity: string } {
  const clean = (t: string) => t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim()
  const [head, ...rest] = raw.split(/\s[|•·—–-]\s|\|/)
  return { name: clean(head ?? raw) || clean(raw), activity: clean(rest.join(' ')) }
}

/** The last phone number the person typed in the chat («906666683», «+992 93 010 50 01»), or ''. */
export function phoneFromMessages(messages: { text: string; outgoing: boolean }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.outgoing || !m.text) continue
    const found = m.text.match(/\+?\d[\d\s()\-]{6,18}\d/g)
    const phone = found?.map(s => s.trim()).find(s => {
      const digits = s.replace(/\D/g, '').length
      return digits >= 7 && digits <= 15
    })
    if (phone) return phone
  }
  return ''
}
