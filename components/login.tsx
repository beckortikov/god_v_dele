'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { AlertCircle, ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { display } from '@/components/landing/fonts'
import '@/components/landing/landing.css'

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
        localStorage.setItem('isAuthenticated', 'true')
        localStorage.setItem('userRole', data.user.role)
        localStorage.setItem('userName', data.user.full_name)
        localStorage.setItem('user', JSON.stringify(data.user))
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
