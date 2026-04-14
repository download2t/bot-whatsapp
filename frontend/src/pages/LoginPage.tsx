import { useState } from 'react'
import { getApiBase } from '../lib/api'
import type { LoginResponse } from '../types'
import './LoginPage.css'

type LoginPageProps = {
  onLoginSuccess: (response: LoginResponse) => void
}

const API_BASE = getApiBase()

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha no login')
      }

      const data: LoginResponse = await response.json()
      onLoginSuccess(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <h1>Painel Operacional</h1>
        <p className="login-subtitle">Acesse para gerenciar regras, mensagens e whitelist.</p>

        <form onSubmit={handleLogin} className="login-form">
          <label htmlFor="username">Usuario</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="login-error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
