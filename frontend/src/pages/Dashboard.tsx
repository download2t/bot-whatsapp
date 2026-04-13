import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { MessageLog, ScheduleRule } from '../types'
import './Dashboard.css'

export function Dashboard() {
  const [stats, setStats] = useState({
    totalMessages: 0,
    incomingMessages: 0,
    outgoingMessages: 0,
    activeRules: 0,
    recentMessages: [] as MessageLog[]
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true)

        const [messagesRes, rulesRes] = await Promise.all([
          apiFetch<MessageLog[]>('/api/messages?take=100'),
          apiFetch<ScheduleRule[]>('/api/schedule-rules')
        ])

        const messages = messagesRes || []
        const rules = rulesRes || []

        setStats({
          totalMessages: messages.length,
          incomingMessages: messages.filter((m: MessageLog) => m.direction === 'Incoming').length,
          outgoingMessages: messages.filter((m: MessageLog) => m.direction === 'Outgoing').length,
          activeRules: rules.filter((r: ScheduleRule) => r.isEnabled).length,
          recentMessages: messages.slice(0, 5)
        })
        setError(null)
      } catch (err) {
        console.error('Erro ao carregar dashboard:', err)
        setError('Falha ao carregar dados do dashboard')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
    const interval = setInterval(loadDashboardData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <div className="container"><div className="loading">Carregando...</div></div>
  if (error) return <div className="container"><div className="error">{error}</div></div>

  return (
    <div className="container">
      <h1>Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.totalMessages}</div>
          <div className="stat-label">Total de Mensagens</div>
        </div>
        <div className="stat-card incoming">
          <div className="stat-value">{stats.incomingMessages}</div>
          <div className="stat-label">Mensagens Recebidas</div>
        </div>
        <div className="stat-card outgoing">
          <div className="stat-value">{stats.outgoingMessages}</div>
          <div className="stat-label">Mensagens Enviadas</div>
        </div>
        <div className="stat-card active">
          <div className="stat-value">{stats.activeRules}</div>
          <div className="stat-label">Regras Ativas</div>
        </div>
      </div>

      <div className="recent-section">
        <h2>Mensagens Recentes</h2>
        {stats.recentMessages.length === 0 ? (
          <p className="empty">Nenhuma mensagem encontrada</p>
        ) : (
          <div className="messages-list">
            {stats.recentMessages.map((msg) => (
              <div key={msg.id} className="message-item">
                <div className="message-header">
                  <span className={`direction ${msg.direction.toLowerCase()}`}>
                    {msg.direction === 'Incoming' ? '📲 Recebido' : '📤 Enviado'}
                  </span>
                  <span className="time">{new Date(msg.timestampUtc).toLocaleString('pt-BR')}</span>
                </div>
                <div className="message-body">
                  <strong>{msg.phoneNumber}</strong>: {msg.content.substring(0, 50)}...
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
