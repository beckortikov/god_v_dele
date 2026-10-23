'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { ArrowUpRight, ChevronDown, Megaphone, Menu, Search, Target, Wallet, X } from 'lucide-react'
import { display } from './fonts'
import './landing.css'

/** Applications are sent to this Telegram account (opens a chat with the text pre-filled). */
const TELEGRAM_HANDLE = 'gelosl3'

const CATS: { name: string; items: string[] }[] = [
  { name: 'Ниша', items: ['Анализ ниши и поиск голубого океана', 'Анализ объёма и ёмкости рынка', 'Анализ запросов Яндекс / Google', 'Изучение потребностей клиентов', 'Доля компании в нише', 'Цель по доходу и прибыли на 12/24/36 мес.', 'Выбор бизнес-модели'] },
  { name: 'Клиенты и рынок', items: ['Анализ конкурентов', 'Портреты-аватары целевой аудитории', 'Боли, страхи и возражения ЦА', 'Численность и география ЦА', 'План/факт по конверсиям в лида и клиента', 'SWOT-анализ', 'Удовлетворённость клиентов и отзывы'] },
  { name: 'Продукт', items: ['Конкурентоспособность продукта', 'Плановый и фактический MVP', 'Юнит-экономика и доходность позиций', 'Стратегия роста LTV клиентов', 'Карта маршрута клиента (CJM)', 'Бизнес-модель Остервальдера и Пинье', 'Расчёт рентабельности продукта'] },
  { name: 'Трафик и продажи', items: ['План/факт лидов и охватов', 'План/факт стоимости лида и клиента', 'Анализ каналов продвижения', 'Воронка продаж с конверсиями', 'Регламенты и скрипты продаж', 'Настроенная CRM и взращивание', 'Ежедневный план/факт продаж'] },
  { name: 'Маркетинг и брендинг', items: ['Брендбук', 'Оффер или УТП', 'Маркетинговая стратегия', 'Сайт и аккаунты в соцсетях', 'Программа лояльности и рефералы', 'Позиционирование', '30 точек касания'] },
  { name: 'Командообразование', items: ['Организационная структура', 'Портрет, ЦКП, KPI и ДИ сотрудника', 'Формы ежедневных, месячных и годовых отчётов', 'Найм, обучение и удержание', 'Рост для ТОПов и кадровый резерв', 'Контроль работы (CRM, Битрикс)', 'Тимбилдинг'] },
  { name: 'Финансы', items: ['Финансовое планирование (бюджет)', 'План прибыли', 'Баланс', 'ОПиУ', 'ОДДС', 'Коэффициенты и управленческий учёт', 'Автоматизация учёта'] },
  { name: 'Масштабирование', items: ['Цели и инструменты масштабирования', 'Безопасность в налогообложении', 'Модель масштабирования (партнёры, франшиза)', 'Юридическая безопасность соглашений', 'Стандарты и регламенты масштабирования', 'План/факт скорости и качества роста', 'Адаптация франшизы и улучшение процессов'] },
  { name: 'Стратегия', items: ['Стратегическая сессия (от 2 раз в год)', 'Внедрение ИИ в бизнес', 'Поиск новых ниш', 'Инструменты роста капитализации', 'Аналитика для привлечения инвесторов', 'HR-платформа для обучения сотрудников', 'Опционы и партнёрство для ТОПов'] },
  { name: 'Бизнес-процессы', items: ['Направления регламентации', 'Карта процессов', 'Регламенты, хронометраж и метрики', 'Стандарты', 'Система «Кайдзен»', 'Автоматизация процессов', 'Аудит по всем направлениям'] },
]

const WHEEL_COLORS = [
  'oklch(0.72 0.15 268)', 'oklch(0.76 0.14 350)', 'oklch(0.76 0.11 225)', 'oklch(0.84 0.13 85)', 'oklch(0.75 0.11 175)',
  'oklch(0.74 0.14 25)', 'oklch(0.72 0.14 300)', 'oklch(0.8 0.14 130)', 'oklch(0.78 0.13 55)', 'oklch(0.7 0.12 250)',
]

const SITUATIONS = [
  { title: 'Хаос в управлении', points: ['Сотрудники не выполняют задачи', 'Сложно управлять командой', 'Всё держится на вас'] },
  { title: 'Рост упёрся в потолок', points: ['Непонятны финансовые показатели', 'Команда не готова к расширению', 'Нет системы, чтобы расти дальше'] },
  { title: 'Проседают продажи', points: ['Планы не выполняются', 'Растут долги и просрочки', 'Клиенты приходят нестабильно'] },
]

const STAGES = [
  { months: 'Месяцы 1–3', title: 'Фундамент и диагностика', text: 'Диагностика финансов, процессов и команды, поиск узких мест и план изменений.' },
  { months: 'Месяцы 4–6', title: 'Системы и команда', text: 'Системы управления, KPI, распределение ролей и контроль выполнения задач.' },
  { months: 'Месяцы 7–9', title: 'Финансы, продажи, рост', text: 'Прибыль, убытки, кэшфлоу, инструменты продаж и маркетинга, масштабирование.' },
  { months: 'Месяцы 10–12', title: 'Масштаб и новые горизонты', text: 'Стратегия масштабирования, новые направления, расширение команды, другие рынки.' },
]

const PROJECTS = [
  { name: 'OBBO', text: 'Первый социально ориентированный маркетплейс Таджикистана: шоурумы в Худжанде и Душанбе, доставка по всей стране и оплата в рассрочку.', tag: 'Маркетплейс' },
  { name: 'KreditMarket', text: 'Сеть магазинов бытовой техники и электроники по продаже в рассрочку.', tag: 'Ритейл' },
  { name: 'MobiCenter', text: 'Сеть розничных магазинов мобильной электроники, аксессуаров и сервисного обслуживания смартфонов.', tag: 'Ритейл' },
  { name: 'AslZar', text: 'Ювелирный дом с авторскими украшениями: изделия из золота и серебра для особых случаев.', tag: 'Ювелирный дом' },
  { name: 'BaBolo', text: 'Региональный сервис заказа такси: быстрый заказ, онлайн-отслеживание груза и поддержка 24/7.', tag: 'Такси и логистика' },
  { name: 'Sanduk', text: 'Сберегательное и микрокредитное обслуживание: доступные займы и финансовые услуги для населения.', tag: 'Микрофинансирование' },
  { name: 'Manzilsoz', text: 'Поставщик строительных материалов: широкий ассортимент для частного и коммерческого строительства.', tag: 'Стройматериалы' },
]

const COUNTRIES = ['Таджикистан', 'Узбекистан', 'Казахстан', 'Кыргызстан', 'Россия', 'Турция', 'Германия', 'США', 'Китай', 'ОАЭ']

// Wheel geometry (viewBox 0 0 500 500)
const CX = 250, CY = 250, R_OUT = 238, R_IN = 112, GAP = 1.6
const pt = (rad: number, a: number) => [CX + rad * Math.cos(a), CY + rad * Math.sin(a)]

const SEGMENTS = CATS.map((_, i) => {
  const n = CATS.length
  const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + (GAP / 180) * Math.PI
  const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - (GAP / 180) * Math.PI
  const [x0, y0] = pt(R_OUT, a0), [x1, y1] = pt(R_OUT, a1), [x2, y2] = pt(R_IN, a1), [x3, y3] = pt(R_IN, a0)
  const [rx0, ry0] = pt(R_OUT - 3, a0), [rx1, ry1] = pt(R_OUT - 3, a1)
  const [tx, ty] = pt((R_OUT + R_IN) / 2 + 6, (a0 + a1) / 2)
  return {
    body: `M${x0} ${y0}A${R_OUT} ${R_OUT} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${R_IN} ${R_IN} 0 0 0 ${x3} ${y3}Z`,
    rim: `M${rx0} ${ry0}A${R_OUT - 3} ${R_OUT - 3} 0 0 1 ${rx1} ${ry1}`,
    tx, ty,
  }
})


type MenuItem = { label: string; id: string; sub?: { label: string; id: string }[] }

/** The site structure from the design: the menu and what opens under each item. */
const MENU: MenuItem[] = [
  { label: 'Обо мне', id: 'about', sub: [{ label: 'Про путь', id: 'about' }, { label: 'Мои бизнесы', id: 'projects' }, { label: 'Проекты', id: 'projects' }, { label: 'Награды', id: 'awards' }] },
  { label: 'Мои бизнесы', id: 'projects' },
  {
    label: 'Предпринимателям',
    id: 'entrepreneurs',
    sub: [
      { label: 'Программа «Год в деле»', id: 'program' },
      { label: 'Личная консультация', id: 'offer-consult' },
      { label: 'Бизнес-разбор', id: 'offer-review' },
      { label: 'Тур по бизнесам', id: 'offer-tour' },
    ],
  },
  {
    label: 'Компаниям',
    id: 'companies',
    sub: [
      { label: 'Сопровождение', id: 'co-support' },
      { label: 'Стратегическая сессия', id: 'co-strategy' },
      { label: 'Разбор компании', id: 'co-review' },
      { label: 'Обучение персонала', id: 'co-training' },
      { label: 'Бизнес-консультация', id: 'co-consult' },
    ],
  },
  { label: 'Книга', id: 'book', sub: [{ label: 'О книге', id: 'book' }, { label: 'Купить', id: 'book-buy' }] },
  { label: 'Мероприятия', id: 'events' },
  { label: 'Контакты', id: 'contact' },
]

/** Offers for entrepreneurs. Descriptions are short drafts: confirm the wording with the author. */
const OFFERS = [
  { id: 'offer-program', tag: 'Программа', title: 'Год в деле', text: 'Годовая программа наставничества и сопровождения: диагностика, системы, финансы, масштаб.', cta: 'Записаться на поток', topic: 'Программа «Год в деле»', to: 'program', main: true },
  { id: 'offer-consult', tag: 'Один на один', title: 'Личная консультация', text: 'Индивидуальный разговор по вашему бизнесу: разбираем задачу и выходим с понятным планом действий.', cta: 'Записаться', topic: 'Личная консультация' },
  { id: 'offer-review', tag: 'Диагностика', title: 'Бизнес-разбор', text: 'Смотрим бизнес в цифрах: финансы, продажи, команду, и находим, где теряются деньги и время.', cta: 'Заказать разбор', topic: 'Бизнес-разбор' },
  { id: 'offer-tour', tag: 'Живой формат', title: 'Тур по бизнесам', text: 'Поездка по действующим бизнесам автора: можно увидеть изнутри, как устроены процессы и команда.', cta: 'Узнать про тур', topic: 'Тур по бизнесам' },
]

/** Offers for companies. Same: drafts to confirm. */
const COMPANY_OFFERS = [
  { id: 'co-support', title: 'Сопровождение', text: 'Постоянная работа рядом с командой: система управления, цели и контроль результата.', topic: 'Сопровождение компании' },
  { id: 'co-strategy', title: 'Стратегическая сессия', text: 'Совместная работа руководителей над стратегией роста и приоритетами на год.', topic: 'Стратегическая сессия' },
  { id: 'co-review', title: 'Разбор компании', text: 'Диагностика компании: цифры, процессы, команда и план изменений.', topic: 'Разбор компании' },
  { id: 'co-training', title: 'Обучение персонала', text: 'Обучение сотрудников управлению, продажам и работе с цифрами.', topic: 'Обучение персонала' },
  { id: 'co-consult', title: 'Бизнес-консультация', text: 'Консультация для руководителей по запросу компании.', topic: 'Бизнес-консультация' },
]

const BOOK_POINTS = [
  { title: 'Печатная книга', text: 'Физическая книга: можно листать, делать пометки и возвращаться к главам в любое время. Опыт и практика для вашего бизнеса в удобном формате.' },
  { title: 'ИИ-ассистент', text: 'Помогает глубже погрузиться в материал: отвечает на вопросы по содержанию, разбирает кейсы и подсказывает, как применить идеи на практике.' },
  { title: 'Доступ в Telegram', text: 'Каждый, кто приобретает книгу, получает доступ к ИИ-ассистенту через мини-приложение в Telegram: удобно с телефона в любое время.' },
]

const EVENT_FORMATS = [
  { title: 'Бесплатный тренинг', text: 'Знакомство с подходом автора: как увидеть бизнес в цифрах и с чего начать порядок.', topic: 'Бесплатный тренинг' },
  { title: 'Стратегическая сессия', text: 'Групповая работа над стратегией роста: цели, приоритеты, план на год.', topic: 'Стратегическая сессия' },
  { title: 'Тур по бизнесам', text: 'Выездной формат: действующие бизнесы автора изнутри.', topic: 'Тур по бизнесам' },
]

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: id.startsWith('offer-') || id.startsWith('co-') ? 'center' : 'start' })
}

/** The author's mark: two stacked arrows pointing up. */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3 28 14H4z" />
      <path d="M16 16 28 27H4z" />
    </svg>
  )
}

export function LandingPage({ onLogin }: { onLogin: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sphere, setSphere] = useState(6)
  const heroRef = useRef<HTMLElement>(null)
  const contactRef = useRef<HTMLElement>(null)

  const [topic, setTopic] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [about, setAbout] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20)
      const hero = heroRef.current, ct = contactRef.current
      if (!hero || !ct) return
      const heroBottom = hero.offsetTop + hero.offsetHeight - 200
      const contactTop = ct.offsetTop - window.innerHeight + 120
      setShowSticky(window.scrollY > heroBottom && window.scrollY < contactTop)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const subject = topic || 'Консультация'
  const telegramText = useMemo(
    () => `Заявка: ${subject}\nИмя: ${name.trim()}\nТелефон / Telegram: ${contact.trim()}${about.trim() ? `\nО бизнесе: ${about.trim()}` : ''}`,
    [subject, name, contact, about],
  )
  const telegramUrl = `https://t.me/${TELEGRAM_HANDLE}?text=${encodeURIComponent(telegramText)}`

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !contact.trim()) {
      setError('Укажите имя и телефон или Telegram, чтобы мы могли связаться с вами.')
      return
    }
    setError('')
    setSent(true)
    window.open(telegramUrl, '_blank', 'noopener,noreferrer')
  }

  /** Scroll to a block; with a topic, the application form remembers what the visitor asked about. */
  const go = (id: string, withTopic?: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    // Keyboard focus would keep a dropdown open after the click.
    ;(e.currentTarget as HTMLElement).blur()
    setMenuOpen(false)
    if (withTopic !== undefined) setTopic(withTopic)
    scrollToId(id)
  }

  const active = CATS[sphere]

  return (
    <div className={`landing ${display.variable}`}>
      <header className={`nav${scrolled || menuOpen ? ' scrolled' : ''}`}>
        <div className="wrap">
          <a href="#top" className="logo" onClick={e => { e.preventDefault(); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <Mark />Анвар Халиков
          </a>
          <nav aria-label="Основное меню">
            <ul className="menu">
              {MENU.map(m => (
                <li key={m.label} className={m.sub ? 'has-sub' : undefined}>
                  <a href={`#${m.id}`} onClick={go(m.id)}>{m.label}{m.sub && <ChevronDown size={14} aria-hidden="true" />}</a>
                  {m.sub && (
                    <ul className="sub">
                      {m.sub.map(s => <li key={s.label}><a href={`#${s.id}`} onClick={go(s.id, s.id === 'book-buy' ? 'Книга «Бизнес в диалоге»' : undefined)}>{s.label}</a></li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="acts">
            <button type="button" className="btn btn-ghost btn-sm login-btn" onClick={onLogin}>Войти</button>
            <a href="#contact" className="btn btn-accent btn-sm" onClick={go('contact', '')}>Консультация</a>
            <button type="button" className="burger" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {MENU.map(m => (
              <div key={m.label} className="mm-group">
                <a href={`#${m.id}`} className="mm-top" onClick={go(m.id)}>{m.label}</a>
                {m.sub && (
                  <div className="mm-sub">
                    {m.sub.map(s => <a key={s.label} href={`#${s.id}`} onClick={go(s.id, s.id === 'book-buy' ? 'Книга «Бизнес в диалоге»' : undefined)}>{s.label}</a>)}
                  </div>
                )}
              </div>
            ))}
            <a href="#contact" className="btn btn-accent" onClick={go('contact', '')}>Консультация</a>
            <button type="button" className="btn btn-ghost mm-login" onClick={() => { setMenuOpen(false); onLogin() }}>Войти в кабинет</button>
          </div>
        )}
      </header>

      <section className="hero" ref={heroRef} id="top">
        <div className="glow g1" /><div className="glow g2" />
        <div className="stage">
          <h1 className="sr-only">Бизнес стратег. Анвар Халиков, предприниматель, автор программы «Год в деле»</h1>
          {/* A running line: it leaves to the left and comes back from the right, behind the photo. */}
          <div className="marquee" aria-hidden="true">
            <div className="marquee-track">
              {[0, 1].map(g => (
                <div className="marquee-group" key={g}>
                  <span>Бизнес стратег</span><i />
                  <span>Бизнес стратег</span><i />
                </div>
              ))}
            </div>
          </div>
          <div className="hero-layer">
            <div className="hero-photo">
              <Image src="/landing/anvar-cutout.png" alt="Анвар Халиков" width={868} height={1300} priority sizes="(max-width: 960px) 82vw, 720px" />
            </div>
            <div className="hero-copy">
              <div className="role">Предприниматель<i>.</i></div>
            </div>
            <div className="hero-actions">
              <a href="#contact" className="btn btn-accent" onClick={go('contact', 'Бесплатный тренинг')}>Бесплатный тренинг</a>
              <a href="#program" className="link-arrow" onClick={go('program')}>Программа «Год в деле» <ArrowUpRight size={18} /></a>
            </div>
            <div className="hero-side">
              <div><b>23 <small>года</small></b><span>в найме</span></div>
              <div><b>12 <small>лет</small></b><span>в бизнесе</span></div>
              <div><b>20+</b><span>проектов</span></div>
              <div><b>100+</b><span>учеников</span></div>
            </div>
            <div className="strip">
              <div className="strip-title">Мои{' '}<br />бизнесы</div>
              <div className="logos" role="list" aria-label="Мои бизнесы">
                <div className="logos-track">
                  {[0, 1].map(g => (
                    <div className="logos-group" key={g} aria-hidden={g === 1 ? true : undefined}>
                      {PROJECTS.map(p => (
                        <div className="logo-chip" role={g === 0 ? 'listitem' : undefined} key={p.name}>
                          <i>{p.name[0]}</i>
                          <span><b>{p.name}</b><em>{p.tag}</em></span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="about" id="about">
        <div className="wrap about-grid">
          <div className="about-photo">
            <Image src="/landing/anvar-portrait.jpg" alt="Анвар Халиков" width={1084} height={1100} sizes="(max-width: 960px) 100vw, 520px" />
            <div className="chip"><b>с 2014</b>системная работа с бизнесом</div>
          </div>
          <div>
            <span className="kick">Обо мне</span>
            <h2>Эксперт по систематизации бизнес-проектов</h2>
            <p>Предприниматель, стартап-менеджер и бизнес-стратег. С 2014 года запускает и развивает проекты, участвует в международных конференциях и семинарах в этих странах:</p>
            <div className="geo">{COUNTRIES.map(c => <span key={c}>{c}</span>)}</div>
          </div>
        </div>
        <div className="wrap">
          <div className="counters four" id="awards">
            <div className="card"><b>12</b><span>лет опыта</span></div>
            <div className="card"><b>20+</b><span>проектов</span></div>
            <div className="card"><b>52+</b><span>награды</span></div>
            <div className="card"><b>100+</b><span>учеников</span></div>
          </div>
        </div>
      </section>

      <section className="alt" id="projects">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Мои бизнесы</div>
              <h2>Проекты и опыт</h2>
              <p>Бизнесы, которые я строил: от маркетплейса до микрофинансирования.</p>
            </div>
          </div>
          <div className="projects-list card">
            {PROJECTS.map(p => (
              <div key={p.name} className="prj"><h3>{p.name}</h3><p>{p.text}</p><div className="tg">{p.tag}</div></div>
            ))}
            <a href="#program" className="prj main" onClick={go('program')}><h3>Год в деле</h3><p>Годовая программа наставничества и сопровождения для предпринимателей, которые хотят выстроить системный бизнес.</p><div className="tg">Бизнес-коучинг →</div></a>
          </div>
        </div>
      </section>

      <section id="entrepreneurs">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Предпринимателям</div>
              <h2>Как со мной работать, если у вас свой бизнес</h2>
              <p>Выберите формат: от годовой программы до разговора один на один.</p>
            </div>
          </div>
          <div className="offers">
            {OFFERS.map(o => (
              <div key={o.id} id={o.id} className={`offer card${o.main ? ' main' : ''}`}>
                <div className="offer-top"><span className="chipk">{o.tag}</span></div>
                <h3>{o.title}</h3>
                <p>{o.text}</p>
                <a href="#contact" className={o.main ? 'btn btn-accent' : 'btn btn-ghost'} onClick={go('contact', o.topic)}>{o.cta}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="for" className="alt">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Программа «Год в деле»</div>
              <h2>Узнаёте свой бизнес в одной из трёх ситуаций?</h2>
            </div>
            <a href="#contact" className="btn btn-accent" onClick={go('contact', 'Программа «Год в деле»')}>Оставить заявку</a>
          </div>
          <div className="for-list">
            {SITUATIONS.map(s => (
              <div key={s.title} className="for-row card">
                <div><div className="lab">Ситуация</div><h3>{s.title}</h3></div>
                <ul>{s.points.map(p => <li key={p}>{p}</li>)}</ul>
                <a href="#contact" className="go" aria-label={`Обсудить: ${s.title}`} onClick={go('contact', 'Программа «Год в деле»')}><ArrowUpRight size={22} /></a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="program">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Что вы получите</div>
              <h2>Четыре этапа. Двенадцать месяцев.</h2>
              <p>Каждый квартал — отдельный результат: от диагностики до выхода на новые рынки.</p>
            </div>
          </div>
          <div className="stages">
            {STAGES.map((s, i) => (
              <div key={s.title} className="stage-card card">
                <div className="top"><div className="num">0{i + 1}</div><div className="months">{s.months}</div></div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <div className="year" aria-hidden="true">
                  {Array.from({ length: 12 }, (_, m) => <i key={m} className={m >= i * 3 && m < i * 3 + 3 ? 'on' : ''} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="alt" id="wheel" style={{ overflow: 'hidden' }}>
        <div className="glow" style={{ left: -260, top: '20%', width: 700, height: 700, opacity: 0.5 }} />
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Колесо бизнеса</div>
              <h2>10 сфер, 70 элементов. Ни одного белого пятна.</h2>
              <p>Каждый месяц вы отмечаете, что внедрено в бизнесе, и видите, какая сфера проседает. Нажмите на сегмент, чтобы увидеть темы.</p>
            </div>
          </div>
          <div className="wheel-grid">
            <div className="wheel-box">
              <svg viewBox="0 0 500 500" role="group" aria-label="Колесо бизнеса: 10 сфер">
                {SEGMENTS.map((g, i) => (
                  <g
                    key={i}
                    className={`seg${i === sphere ? ' on' : ''}`}
                    style={{ '--c': WHEEL_COLORS[i] } as React.CSSProperties}
                    tabIndex={0}
                    role="button"
                    aria-label={`Сфера ${i + 1}: ${CATS[i].name}`}
                    aria-pressed={i === sphere}
                    onClick={() => setSphere(i)}
                    onMouseEnter={() => setSphere(i)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSphere(i) } }}
                  >
                    <path className="body" d={g.body} />
                    <path className="rim" d={g.rim} />
                    <text x={g.tx} y={g.ty} textAnchor="middle" dominantBaseline="central">{i + 1}</text>
                  </g>
                ))}
              </svg>
              <div className="hub"><div><b>{sphere + 1}</b><span>{active.name}</span></div></div>
            </div>
            <div className="wheel-panel card" aria-live="polite">
              <div className="num">Сфера {sphere + 1} из 10</div>
              <h3>{active.name}</h3>
              <ol>
                {active.items.map((t, k) => <li key={t}><span>{sphere + 1}.{k + 1}</span>{t}</li>)}
              </ol>
              <div className="wheel-hint">7 элементов · отмечаются ежемесячно в личном кабинете</div>
            </div>
          </div>
        </div>
      </section>

      <section id="companies">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Компаниям</div>
              <h2>Работа с командой и руководителями компании</h2>
              <p>Системный подход к управлению, продажам и финансам: помогаю выстроить цифры, процессы и людей.</p>
            </div>
            <a href="#contact" className="btn btn-accent" onClick={go('contact', 'Для компании')}>Обсудить задачу</a>
          </div>
          <div className="offers five">
            {COMPANY_OFFERS.map(o => (
              <div key={o.id} id={o.id} className="offer card">
                <div className="offer-top"><span className="chipk">Для компаний</span></div>
                <h3>{o.title}</h3>
                <p>{o.text}</p>
                <a href="#contact" className="link-arrow" onClick={go('contact', o.topic)}>Оставить заявку <ArrowUpRight size={18} /></a>
              </div>
            ))}
          </div>
          <div className="focus-title">Чем я могу помочь</div>
          <div className="focus">
            <div className="focus-card card"><Target /><h3>Бизнес-планирование</h3><p>Цели, подробный план действий, ключевые показатели (KPI) и финансовый анализ.</p></div>
            <div className="focus-card card"><Megaphone /><h3>Маркетинг и продажи</h3><p>Привлечение клиентов, уникальное предложение, эффективные кампании и управление брендом.</p></div>
            <div className="focus-card card"><Wallet /><h3>Управление финансами</h3><p>Учёт, планирование и контроль: бюджетирование, оборотный капитал, стратегии финансирования.</p></div>
            <div className="focus-card card"><Search /><h3>Маркетинговый анализ</h3><p>Конкуренты, тренды, спрос, ценовая стратегия, инновации и отличия продукта.</p></div>
          </div>
        </div>
      </section>

      <section className="alt" id="book">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Книга</div>
              <h2>«Бизнес в диалоге»</h2>
              <p>Печатная книга с доступом к ИИ-ассистенту в Telegram: глубже погружайтесь в материал и применяйте идеи на практике.</p>
            </div>
            <a href="#contact" id="book-buy" className="btn btn-accent" onClick={go('contact', 'Книга «Бизнес в диалоге»')}>Заказать книгу</a>
          </div>
          <div className="book-grid">
            {BOOK_POINTS.map((b, i) => (
              <div key={b.title} className="book-card card">
                <div className="num">0{i + 1}</div>
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="events">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Мероприятия</div>
              <h2>Тренинги, сессии и туры</h2>
              <p>Даты ближайших мероприятий сообщим в Telegram: оставьте заявку, и вы узнаете первыми.</p>
            </div>
          </div>
          <div className="events">
            {EVENT_FORMATS.map(ev => (
              <a key={ev.title} href="#contact" className="event card" onClick={go('contact', ev.topic)}>
                <div><h3>{ev.title}</h3><p>{ev.text}</p></div>
                <span className="go" aria-hidden="true"><ArrowUpRight size={22} /></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="contact alt" id="contact" ref={contactRef}>
        <div className="glow" />
        <div className="wrap contact-grid">
          <div>
            <span className="kick">Контакты</span>
            <h2>Свяжитесь со мной</h2>
            <p className="sub">Есть вопросы или хотите обсудить сотрудничество? Оставьте заявку, и команда свяжется с вами.</p>
            <div className="socials">
              <a className="btn btn-accent btn-sm" href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer">Написать в Telegram</a>
              <a className="btn btn-ghost btn-sm" href="https://instagram.com/anvarjon_khalikov" target="_blank" rel="noopener noreferrer">Instagram</a>
              <a className="btn btn-ghost btn-sm" href="https://facebook.com/anvar.halikov.718441" target="_blank" rel="noopener noreferrer">Facebook</a>
            </div>
          </div>
          <form className="card" onSubmit={submit} noValidate>
            {topic && (
              <div className="topic" role="status">
                <span>Заявка: <b>{topic}</b></span>
                <button type="button" aria-label="Убрать тему заявки" onClick={() => setTopic('')}><X size={16} /></button>
              </div>
            )}
            <label>Имя<input value={name} onChange={e => setName(e.target.value)} placeholder="Как к вам обращаться" autoComplete="name" /></label>
            <label>Телефон или Telegram<input value={contact} onChange={e => setContact(e.target.value)} placeholder="+992 … или @username" autoComplete="tel" /></label>
            <label>Чем занимаетесь<textarea value={about} onChange={e => setAbout(e.target.value)} placeholder="Сфера и размер бизнеса, главная задача" /></label>
            {error && <p role="alert" className="form-error">{error}</p>}
            {sent && (
              <p role="status" className="form-note">
                Открываем Telegram: останется нажать «Отправить». Не открылся?{' '}
                <a href={telegramUrl} target="_blank" rel="noopener noreferrer">Открыть вручную</a>
              </p>
            )}
            <button className="btn btn-accent" type="submit">Отправить в Telegram</button>
            <small>Заявка откроется в Telegram с уже заполненным текстом</small>
          </form>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span>© {new Date().getFullYear()} Анвар Халиков. Все права защищены.</span>
          <button type="button" onClick={onLogin} className="foot-link">Вход для участников</button>
        </div>
      </footer>

      <a href="#contact" className={`sticky-cta btn btn-accent${showSticky ? ' show' : ''}`} onClick={go('contact', '')}>Консультация</a>
    </div>
  )
}
