'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { ArrowUpRight, ChevronDown, Menu, UserRound, X } from 'lucide-react'
import { display } from './fonts'
import './landing.css'

/** Applications are sent to this Telegram account (opens a chat with the text pre-filled). */
const TELEGRAM_HANDLE = 'gelosl3'

/** The 16 modules of the programme: the segments of the wheel. */
const MODULES = [
  'Бизнес как система',
  'Ниша',
  'Клиенты и рынок',
  'Продукт и доп. доход',
  'Командообразование / управление',
  'Трафик, лидогенерация',
  'Маркетинг / брендинг / PR / реклама',
  'Продажи',
  'Финансовый менеджмент',
  'Юридическая и правовая база',
  'Бизнес-процессы / регламентация',
  'Стратегия',
  'Цифровизация / IT / автоматизация',
  'Клиентский опыт и удержание',
  'Личность',
  'Масштабирование',
]

const WHEEL_COLORS = MODULES.map((_, i) => `oklch(0.77 0.13 ${(268 + i * 22.5) % 360})`)

const STAGES = [
  { months: 'Месяцы 1–3', title: 'Фундамент и диагностика', text: 'Диагностика финансов, процессов и команды, поиск узких мест и план изменений.' },
  { months: 'Месяцы 4–6', title: 'Системы и команда', text: 'Системы управления, KPI, распределение ролей и контроль выполнения задач.' },
  { months: 'Месяцы 7–9', title: 'Финансы, продажи, рост', text: 'Прибыль, убытки, кэшфлоу, инструменты продаж и маркетинга, масштабирование.' },
  { months: 'Месяцы 10–12', title: 'Масштаб и новые горизонты', text: 'Стратегия масштабирования, новые направления, расширение команды, другие рынки.' },
]

const PROJECTS = [
  { name: 'OBBO', logo: '/landing/logos/obbo.png', text: 'Первый социально ориентированный маркетплейс Таджикистана: шоурумы в Худжанде и Душанбе, доставка по всей стране и оплата в рассрочку.', tag: 'Маркетплейс' },
  { name: 'KreditMarket', logo: '/landing/logos/kreditmarket.png', text: 'Сеть магазинов бытовой техники и электроники по продаже в рассрочку.', tag: 'Ритейл' },
  { name: 'MobiCenter', logo: '/landing/logos/mobicenter.png', text: 'Сеть розничных магазинов мобильной электроники, аксессуаров и сервисного обслуживания смартфонов.', tag: 'Ритейл' },
  { name: 'AslZar', logo: '/landing/logos/aslzar.png', text: 'Ювелирный дом с авторскими украшениями: изделия из золота и серебра для особых случаев.', tag: 'Ювелирный дом' },
  { name: 'BaBolo', logo: '/landing/logos/babolo.png', text: 'Региональный сервис заказа такси: быстрый заказ, онлайн-отслеживание груза и поддержка 24/7.', tag: 'Такси и логистика' },
  { name: 'Sanduk', logo: '/landing/logos/sanduk.png', text: 'Сберегательное и микрокредитное обслуживание: доступные займы и финансовые услуги для населения.', tag: 'Микрофинансирование' },
  { name: 'Manzilsoz', logo: '/landing/logos/manzilsoz.png', text: 'Поставщик строительных материалов: широкий ассортимент для частного и коммерческого строительства.', tag: 'Стройматериалы' },
]

const COUNTRIES = ['Таджикистан', 'Узбекистан', 'Казахстан', 'Кыргызстан', 'Россия', 'Турция', 'Германия', 'США', 'Китай', 'ОАЭ']

// Wheel geometry (viewBox 0 0 500 500)
const CX = 250, CY = 250, R_OUT = 238, R_IN = 112, GAP = 1.2
const pt = (rad: number, a: number) => [CX + rad * Math.cos(a), CY + rad * Math.sin(a)]

const SEGMENTS = MODULES.map((_, i) => {
  const n = MODULES.length
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
    label: 'Услуги',
    id: 'services',
    sub: [
      { label: 'Программа «Год в деле»', id: 'program' },
      { label: 'Консультация', id: 'svc-consult' },
      { label: 'Бизнес-разбор', id: 'svc-review' },
      { label: 'Сопровождение', id: 'svc-support' },
      { label: 'Стратегическая сессия', id: 'svc-strategy' },
      { label: 'Обучение персонала', id: 'svc-training' },
      { label: 'Тур по бизнесам', id: 'svc-tour' },
    ],
  },
  { label: 'Книга', id: 'book', sub: [{ label: 'О книге', id: 'book' }, { label: 'Купить', id: 'book-buy' }] },
  { label: 'Мероприятия', id: 'events' },
  { label: 'Контакты', id: 'contact' },
]

/** Services for entrepreneurs and companies alike. Descriptions are short drafts: confirm the wording with the author. */
const SERVICES = [
  { id: 'svc-program', tag: 'Бизнес-программа', title: '«Год в деле»', text: 'Годовая программа и мастермайнд-проект, созданные для перехода бизнеса от хаоса к системе и роста выручки.', cta: 'Записаться на поток', topic: 'Программа «Год в деле»', main: true },
  { id: 'svc-consult', tag: 'Один на один', title: 'Консультация', text: 'Разговор по вашему бизнесу или задаче компании: разбираем вопрос и выходим с понятным планом действий.', cta: 'Записаться', topic: 'Консультация' },
  { id: 'svc-review', tag: 'Диагностика', title: 'Бизнес-разбор', text: 'Смотрим бизнес в цифрах: финансы, продажи, процессы и команду, и находим, где теряются деньги и время.', cta: 'Заказать разбор', topic: 'Бизнес-разбор' },
  { id: 'svc-support', tag: 'Рядом с командой', title: 'Сопровождение', text: 'Постоянная работа с собственником и командой: система управления, цели и контроль результата.', cta: 'Обсудить', topic: 'Сопровождение' },
  { id: 'svc-strategy', tag: 'Для руководителей', title: 'Стратегическая сессия', text: 'Совместная работа руководителей над стратегией роста и приоритетами на год.', cta: 'Заказать сессию', topic: 'Стратегическая сессия' },
  { id: 'svc-training', tag: 'Для команды', title: 'Обучение персонала', text: 'Обучение сотрудников управлению, продажам и работе с цифрами.', cta: 'Обсудить обучение', topic: 'Обучение персонала' },
  { id: 'svc-tour', tag: 'Живой формат', title: 'Тур по бизнесам', text: 'Поездка по действующим бизнесам автора: можно увидеть изнутри, как устроены процессы и команда.', cta: 'Узнать про тур', topic: 'Тур по бизнесам' },
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
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: id.startsWith('svc-') ? 'center' : 'start' })
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
  const [sphere, setSphere] = useState(0)
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
            {/* Phones: the sign-in is an icon next to the burger */}
            <button type="button" className="icon-login" aria-label="Войти в кабинет" onClick={() => { setMenuOpen(false); onLogin() }}>
              <UserRound size={21} />
            </button>
            <button type="button" className="burger" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {MENU.map(m => (
              <div key={m.label} className="mm-group">
                <a href={`#${m.id}`} className={`mm-top${m.sub ? ' accent' : ''}`} onClick={go(m.id)}>{m.label}</a>
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
          <h1 className="sr-only">Бизнес-архитектор. Анвар Халиков, предприниматель, автор программы «Год в деле»</h1>
          {/* A running line: it leaves to the left and comes back from the right, behind the photo. */}
          <div className="marquee" aria-hidden="true">
            <div className="marquee-track">
              {[0, 1].map(g => (
                <div className="marquee-group" key={g}>
                  <span>Бизнес-архитектор</span><i />
                  <span>Бизнес-архитектор</span><i />
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
              <a href="#contact" className="btn btn-ghost hero-consult" onClick={go('contact', 'Консультация')}>Консультация</a>
              <a href="#contact" className="btn btn-accent" onClick={go('contact', 'Бесплатный тренинг')}>Бесплатный тренинг</a>
              <a href="#program" className="link-arrow" onClick={go('program')}>Программа «Год в деле» <ArrowUpRight size={18} /></a>
            </div>
            <div className="hero-side">
              <div><b>20+ <small>лет</small></b><span>в найме</span></div>
              <div><b>10+ <small>лет</small></b><span>в бизнесе</span></div>
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
                          <Image src={p.logo} alt="" width={40} height={40} className="logo-img" />
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
            <h2 className="about-title">Приветствую!<br />Я — Анвар Халиков, предприниматель и <span className="nowrap">бизнес-архитектор.</span></h2>
            <p>За моими плечами — более 20 лет работы в найме и 10+ лет параллельного ведения собственных бизнес-проектов.</p>
            <p>За это время я прошёл через самые разные кризисы и ошибки, и сегодня помогаю предпринимателям строить системный бизнес, который работает как часы. Без скучной теории из учебников — только проверенная практика!</p>
            <p>Также я участвую в международных конференциях и семинарах в следующих странах:</p>
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
              <div key={p.name} className="prj"><div className="prj-name"><Image src={p.logo} alt="" width={56} height={56} className="logo-img" /><h3>{p.name}</h3></div><p>{p.text}</p><div className="tg">{p.tag}</div></div>
            ))}
          </div>
        </div>
      </section>

      <section id="services">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Услуги</div>
              <h2>Как со мной работать</h2>
              <p>Для предпринимателей и компаний: от разговора один на один до годовой программы и работы с командой.</p>
            </div>
          </div>
          <div className="offers services">
            {SERVICES.map(o => (
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

      <section className="alt" id="program" style={{ overflow: 'hidden' }}>
        <div className="glow" style={{ left: -260, bottom: -120, width: 700, height: 700, opacity: 0.5 }} />
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Бизнес-программа «Год в деле»</div>
              <h2>12 месяцев. 16 модулей. Практика и обмен опытом.</h2>
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
          <div className="wheel-grid" id="wheel">
            <div className="wheel-box">
              <svg viewBox="0 0 500 500" role="group" aria-label="Колесо программы: 16 модулей">
                {SEGMENTS.map((g, i) => (
                  <g
                    key={i}
                    className={`seg${i === sphere ? ' on' : ''}`}
                    style={{ '--c': WHEEL_COLORS[i] } as React.CSSProperties}
                    tabIndex={0}
                    role="button"
                    aria-label={`Модуль ${i + 1}: ${MODULES[i]}`}
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
              <div className="hub"><div><b>{sphere + 1}</b><span>{MODULES[sphere]}</span></div></div>
            </div>
            <div className="wheel-panel card">
              <div className="num">16 модулей программы</div>
              <ol>
                {MODULES.map((m, i) => (
                  <li key={m}>
                    <button type="button" className={i === sphere ? 'on' : undefined} aria-pressed={i === sphere} onClick={() => setSphere(i)} onMouseEnter={() => setSphere(i)}>
                      <span>{i + 1}</span>{m}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section id="book">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <div className="kick">Книга</div>
              <h2>«Бизнес в диалоге»</h2>
              <p>Печатная книга с доступом к ИИ-ассистенту в Telegram: глубже погружайтесь в материал и применяйте идеи на практике.</p>
            </div>
            <a href="#contact" id="book-buy" className="btn btn-accent" onClick={go('contact', 'Книга «Бизнес в диалоге»')}>Заказать книгу</a>
          </div>
          <div className="book-layout">
            <Image src="/landing/book-cover.jpeg" alt="Обложка книги «Бизнес в диалоге», автор Анвар Халиков" width={968} height={1280} className="book-cover" sizes="(max-width: 960px) 300px, 360px" />
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
        </div>
      </section>

      <section className="alt" id="events">
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

      <section className="contact" id="contact" ref={contactRef}>
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
          <span className="foot-links">
            <a href="/privacy" className="foot-link">Политика конфиденциальности</a>
            <button type="button" onClick={onLogin} className="foot-link">Вход для участников</button>
          </span>
        </div>
      </footer>

      <a href="#contact" className={`sticky-cta btn btn-accent${showSticky ? ' show' : ''}`} onClick={go('contact', '')}>Консультация</a>
    </div>
  )
}
