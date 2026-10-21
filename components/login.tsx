'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2, Send } from 'lucide-react'
import { display } from '@/components/landing/fonts'
import '@/components/landing/landing.css'

interface SignedInUser {
  role: string
  full_name: string
}

function rememberUser(user: SignedInUser) {
  localStorage.setItem('isAuthenticated', 'true')
  localStorage.setItem('userRole', user.role)
  localStorage.setItem('userName', user.full_name)
  localStorage.setItem('user', JSON.stringify(user))
}

const POLL_MS = 2000

/** «Войти через Telegram»: the bot asks «Это вы?», meanwhile the page waits for the answer. */
function TelegramSignIn({ onSignedIn }: { onSignedIn: (user: SignedInUser) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [attempt, setAttempt] = useState<{ token: string; secret: string; url: string; expiresAt: number } | null>(null)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState('')
  const stop = useRef(false)

  useEffect(() => {
    stop.current = false
    fetch('/api/auth/telegram')
      .then(r => r.json())
      .then(d => !stop.current && setEnabled(Boolean(d?.enabled)))
      .catch(() => {})
    return () => {
      stop.current = true
    }
  }, [])

  // Ask the server every couple of seconds until the person answers in the bot or the time is up
  useEffect(() => {
    if (!attempt) return
    const { token, secret, expiresAt } = attempt
    let busy = false
    const timer = setInterval(async () => {
      if (busy || stop.current) return
      if (Date.now() > expiresAt) {
        setAttempt(null)
        setMessage('Время вышло. Нажмите «Войти через Telegram» ещё раз.')
        return
      }
      busy = true
      try {
        const res = await fetch('/api/auth/telegram/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, secret }),
        })
        const data = await res.json()
        if (stop.current) return
        if (data.success) {
          setAttempt(null)
          onSignedIn(data.user)
        } else if (data.status === 'denied') {
          setAttempt(null)
          setMessage('Вход отменён в Telegram.')
        } else if (data.status === 'expired') {
          setAttempt(null)
          setMessage('Запрос устарел. Нажмите «Войти через Telegram» ещё раз.')
        }
      } catch {
        // No connection for a moment: try again on the next tick
      } finally {
        busy = false
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [attempt, onSignedIn])

  if (!enabled) return null

  const start = async () => {
    setMessage('')
    setStarting(true)
    try {
      const res = await fetch('/api/auth/telegram', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setMessage(data.error || 'Не удалось начать вход через Telegram')
        return
      }
      setAttempt({ token: data.token, secret: data.secret, url: data.url, expiresAt: new Date(data.expiresAt).getTime() })
      // Some browsers refuse to open a window after a request; the link below always works
      window.open(data.url, '_blank', 'noopener')
    } catch {
      setMessage('Нет связи с сервером. Проверьте интернет и попробуйте снова.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="login-tg">
      <div className="login-or"><span>или</span></div>
      {message && <p className="login-tg-note" role="status">{message}</p>}
      {attempt ? (
        <div className="login-tg-wait">
          <p><Loader2 size={16} className="animate-spin" /> Ждём подтверждения в Telegram…</p>
          <p className="login-tg-note">Откройте бота и нажмите «Да, это я». Если Telegram не открылся сам, нажмите на кнопку ниже.</p>
          <a className="btn btn-accent" href={attempt.url} target="_blank" rel="noopener noreferrer">
            <Send size={18} /> Открыть Telegram
          </a>
          <button type="button" className="login-back" onClick={() => setAttempt(null)}>Отмена</button>
        </div>
      ) : (
        <>
          <button type="button" className="btn btn-ghost" onClick={start} disabled={starting}>
            {starting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Войти через Telegram
          </button>
          <p className="login-tg-note">Работает после того, как вы привяжете Telegram в личном кабинете.</p>
        </>
      )}
    </div>
  )
}

export function LoginPage({ onLoginSuccess, onBack }: { onLoginSuccess: () => void; onBack?: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        rememberUser(data.user)
        onLoginSuccess()
      } else {
        setError(res.status === 401 ? 'Неверный логин или пароль' : data.error || 'Ошибка входа')
        setPassword('')
      }
    } catch {
      setError('Нет связи с сервером. Проверьте интернет и попробуйте снова.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`landing login-screen ${display.variable}`}>
      <aside className="login-side">
        <div className="glow" />
        <div className="logo"><i>ГВД</i>Год в деле</div>
        <p className="quote">Бизнес в цифрах. Рост — <em>кратно.</em></p>
        <div className="who">
          <Image src="/landing/anvar-cutout.png" alt="" width={868} height={1300} sizes="420px" />
        </div>
      </aside>

      <main className="login-main">
        <div className="glow" />
        <div className="login-box">
          <div className="logo"><i>ГВД</i>Год в деле</div>
          <h1>Вход</h1>
          <p className="lead">Финансы, участники и команда в одном месте</p>

          <form onSubmit={handleLogin} className="login-card card">
            {error && (
              <div role="alert" className="form-error" style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start' }}>
                <AlertCircle size={18} style={{ marginTop: 3, flexShrink: 0 }} />
                <p>{error}</p>
              </div>
            )}

            <label>
              Логин
              <input
                id="login"
                autoComplete="username"
                autoFocus
                value={login}
                onChange={e => setLogin(e.target.value)}
                disabled={isLoading}
              />
            </label>

            <label>
              Пароль
              <div className="pw">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <button type="submit" className="btn btn-accent" disabled={isLoading || !login || !password}>
              {isLoading && <Loader2 size={18} className="animate-spin" />}
              {isLoading ? 'Вход…' : 'Войти'}
            </button>
          </form>

          <TelegramSignIn
            onSignedIn={user => {
              rememberUser(user)
              onLoginSuccess()
            }}
          />

          {onBack && (
            <button type="button" onClick={onBack} className="login-back">
              <ArrowLeft size={18} />
              На главную
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
