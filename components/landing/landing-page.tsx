'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { unbounded } from './fonts'
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
  { name: 'OBBO', text: 'Социально ориентированный маркетплейс в Таджикистане: шоурумы и рассрочка.', tag: 'Маркетплейс' },
  { name: 'KreditMarket', text: 'Сеть магазинов бытовой техники и электроники с продажей в рассрочку.', tag: 'Ритейл' },
  { name: 'MobiCenter', text: 'Мобильная электроника, аксессуары и ремонт.', tag: 'Ритейл' },
  { name: 'AslZar', text: 'Ювелирный дом: изделия из золота и серебра.', tag: 'Ювелирка' },
  { name: 'BaBolo', text: 'Региональный сервис такси и логистики.', tag: 'Транспорт' },
  { name: 'Sanduk', text: 'Сберегательные и микрокредитные услуги.', tag: 'Финансы' },
  { name: 'Manzilsoz', text: 'Поставщик строительных материалов.', tag: 'Стройматериалы' },
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

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function LandingPage({ onLogin }: { onLogin: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const [sphere, setSphere] = useState(6)
  const heroRef = useRef<HTMLElement>(null)
  const contactRef = useRef<HTMLElement>(null)

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

  const telegramText = useMemo(
    () => `Заявка на «Год в деле»\nИмя: ${name.trim()}\nТелефон / Telegram: ${contact.trim()}${about.trim() ? `\nО бизнесе: ${about.trim()}` : ''}`,
    [name, contact, about],
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

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    scrollToId(id)
  }

  const active = CATS[sphere]

  return (
    <div className={`landing ${unbounded.variable}`}>
      <header className={`nav${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap">
          <a href="#top" className="logo" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
            <i>ГВД</i>Год в деле
          </a>
          <ul>
            <li><a href="#program" onClick={go('program')}>Программа</a></li>
            <li><a href="#wheel" onClick={go('wheel')}>Колесо бизнеса</a></li>
            <li><a href="#about" onClick={go('about')}>Об авторе</a></li>
            <li><a href="#projects" onClick={go('projects')}>Проекты</a></li>
            <li><a href="#contact" onClick={go('contact')}>Контакты</a></li>
          </ul>
          <div className="acts">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLogin}>Войти</button>
            <a href="#contact" className="btn btn-gold btn-sm" onClick={go('contact')}>Оставить заявку</a>
          </div>
        </div>
      </header>

      <section className="hero" ref={heroRef} id="top">
        <div className="glow g1" /><div className="glow g2" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="tag">Скоро новый поток · места ограничены</div>
            <h1>Бизнес в цифрах. Рост — <em>кратно.</em></h1>
            <p className="lead">«Год в деле» — годовая программа для предпринимателей: за 12 месяцев вы наведёте порядок в финансах, команде и продажах и выйдете на масштаб.</p>
            <div className="cta">
              <a href="#contact" className="btn btn-gold" onClick={go('contact')}>Записаться на поток</a>
              <a href="#program" className="btn btn-ghost" onClick={go('program')}>Смотреть программу</a>
            </div>
            <div className="stats">
              <div><b>10+</b><span>лет в бизнесе</span></div>
              <div><b>20+</b><span>проектов</span></div>
              <div><b>100+</b><span>учеников</span></div>
            </div>
          </div>
          <div className="hero-photo">
            <Image src="/landing/anvar-cutout.png" alt="Анвар Халиков" width={868} height={1300} priority sizes="(max-width: 960px) 380px, 520px" />
            <div className="badge"><b>Анвар Халиков</b>предприниматель, стартап-менеджер,<br />автор программы</div>
          </div>
        </div>
        <div className="strip">
          <div className="wrap">
            <small>Проекты автора</small>
            <div className="names">{PROJECTS.slice(0, 6).map(p => <span key={p.name}>{p.name}</span>)}</div>
          </div>
        </div>
      </section>

      <section id="for" className="alt">
        <div className="wrap">
          <div className="sec-head">
            <div className="kick">Для кого</div>
            <h2>Узнаёте свой бизнес в одной из трёх ситуаций?</h2>
          </div>
          <div className="for-list">
            {SITUATIONS.map(s => (
              <div key={s.title} className="for-row card">
                <div><div className="lab">Ситуация</div><h3>{s.title}</h3></div>
                <ul>{s.points.map(p => <li key={p}>{p}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="program">
        <div className="wrap">
          <div className="sec-head">
            <div className="kick">Программа</div>
            <h2>Четыре этапа. Двенадцать месяцев.</h2>
            <p>Каждый квартал — отдельный результат: от диагностики до выхода на новые рынки.</p>
          </div>
          <div className="stages">
            {STAGES.map((s, i) => (
              <div key={s.title} className="stage card">
                <div className="top"><div className="num">{i + 1}</div><div className="months">{s.months}</div></div>
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
        <div className="glow" style={{ left: -220, top: '20%', width: 640, height: 640 }} />
        <div className="wrap">
          <div className="sec-head">
            <div className="kick">Колесо бизнеса</div>
            <h2>10 сфер, 70 элементов. Ни одного белого пятна.</h2>
            <p>Каждый месяц вы отмечаете, что внедрено в бизнесе, и видите, какая сфера проседает. Нажмите на сегмент, чтобы увидеть темы.</p>
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

      <section className="about" id="about">
        <div className="wrap about-grid">
          <div className="about-photo">
            <Image src="/landing/anvar-portrait.jpg" alt="Анвар Халиков" width={1084} height={1100} sizes="(max-width: 960px) 100vw, 520px" />
            <div className="chip"><b>с 2014</b>системная работа с бизнесом</div>
          </div>
          <div>
            <div className="kick">Об авторе</div>
            <h2>Анвар Халиков</h2>
            <p>Предприниматель, стартап-менеджер и бизнес-практик. Более 10 лет запускает и развивает проекты и помогает выстраивать стратегии, которые работают в цифрах, а не на словах.</p>
            <div className="about-stats card">
              <div><b>10+</b><span>лет опыта</span></div>
              <div><b>20+</b><span>проектов</span></div>
              <div><b>52+</b><span>награды</span></div>
              <div><b>100+</b><span>учеников</span></div>
            </div>
            <div className="geo">{COUNTRIES.map(c => <span key={c}>{c}</span>)}</div>
            <p style={{ marginTop: '1.2rem', fontSize: '1rem' }}>Участвует в международных конференциях и семинарах в этих странах.</p>
          </div>
        </div>
      </section>

      <section className="alt">
        <div className="wrap">
          <div className="sec-head">
            <div className="kick">Чем помогаю</div>
            <h2>Четыре направления работы</h2>
          </div>
          <div className="bento">
            <div className="b-card card big"><span className="chipk">Основа</span><div><h3>Бизнес-планирование</h3><p>Постановка целей, планы действий, KPI и финансовый анализ. С этого начинается любая работа.</p></div></div>
            <div className="b-card card"><span className="chipk">Рост</span><div><h3>Маркетинг и продажи</h3><p>Привлечение клиентов, уникальные предложения, кампании, управление брендом.</p></div></div>
            <div className="b-card card"><span className="chipk">Деньги</span><div><h3>Управление финансами</h3><p>Бюджетирование, оборотный капитал, стратегии финансирования.</p></div></div>
            <div className="b-card card wide"><span className="chipk">Рынок</span><div><h3>Анализ рынка</h3><p>Конкуренты, тренды, спрос, ценообразование и отличия продукта.</p></div></div>
          </div>
        </div>
      </section>

      <section id="projects">
        <div className="wrap">
          <div className="sec-head">
            <div className="kick">Проекты</div>
            <h2>Бизнесы, которые я строил</h2>
          </div>
          <div className="projects-list card">
            {PROJECTS.map(p => (
              <div key={p.name} className="prj"><h3>{p.name}</h3><p>{p.text}</p><div className="tg">{p.tag}</div></div>
            ))}
            <a href="#contact" className="prj main" onClick={go('contact')}><h3>Год в деле</h3><p>Годовая программа для предпринимателей: сюда вы и попадаете.</p><div className="tg">Записаться →</div></a>
          </div>
        </div>
      </section>

      <section className="contact alt" id="contact" ref={contactRef}>
        <div className="glow" />
        <div className="wrap contact-grid">
          <div>
            <h2>Начните свой<br />«Год в деле»</h2>
            <p className="sub">Оставьте заявку, и команда свяжется с вами, расскажет про ближайший поток и условия участия.</p>
            <div className="socials">
              <a className="btn btn-gold btn-sm" href={`https://t.me/${TELEGRAM_HANDLE}`} target="_blank" rel="noopener noreferrer">Написать в Telegram</a>
              <a className="btn btn-ghost btn-sm" href="https://instagram.com/anvarjon_khalikov" target="_blank" rel="noopener noreferrer">Instagram</a>
              <a className="btn btn-ghost btn-sm" href="https://facebook.com/anvar.halikov.718441" target="_blank" rel="noopener noreferrer">Facebook</a>
            </div>
          </div>
          <form className="card" onSubmit={submit} noValidate>
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
            <button className="btn btn-gold" type="submit">Отправить в Telegram</button>
            <small>Заявка откроется в Telegram с уже заполненным текстом</small>
          </form>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span>© {new Date().getFullYear()} Анвар Халиков · Год в деле</span>
          <button type="button" onClick={onLogin} className="foot-link">Вход для участников</button>
        </div>
      </footer>

      <a href="#contact" className={`sticky-cta btn btn-gold${showSticky ? ' show' : ''}`} onClick={go('contact')}>Записаться на поток</a>
    </div>
  )
}
