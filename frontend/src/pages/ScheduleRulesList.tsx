import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ScheduleRule, WhatsAppFilterOptions } from '../types'
import './ScheduleRules.css'

export function ScheduleRulesList() {
  const [rules, setRules] = useState<ScheduleRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [whatsAppOptions, setWhatsAppOptions] = useState<string[]>([])
  const [selectedWhatsAppNumber, setSelectedWhatsAppNumber] = useState('')

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const options = await apiFetch<WhatsAppFilterOptions>('/api/schedule-rules/whatsapp-options')
        setWhatsAppOptions(options.numbers || [])
      } catch {
        // optional metadata endpoint
      }
    }

    void loadOptions()
  }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      const query = selectedWhatsAppNumber ? `?whatsAppNumber=${encodeURIComponent(selectedWhatsAppNumber)}` : ''
      const data = await apiFetch<ScheduleRule[]>(`/api/schedule-rules${query}`)
      setRules(data || [])
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError(err instanceof Error ? err.message : 'Falha ao carregar regras. Verifique a conexão com o servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRules()
  }, [selectedWhatsAppNumber])

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja eliminar esta regra?')) return

    try {
      await apiFetch<null>(`/api/schedule-rules/${id}`, {
        method: 'DELETE'
      })
      setRules(rules.filter(r => r.id !== id))
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao eliminar regra')
    }
  }

  const handleToggleEnabled = async (rule: ScheduleRule) => {
    try {
      const updated: ScheduleRule = { ...rule, isEnabled: !rule.isEnabled }
      await apiFetch<ScheduleRule>(`/api/schedule-rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: updated.name,
          whatsAppNumbers: updated.whatsAppNumbers,
          startTime: updated.startTime,
          endTime: updated.endTime,
          message: updated.message,
          isEnabled: updated.isEnabled,
          throttleMinutes: updated.throttleMinutes,
          whatsAppNumber: updated.whatsAppNumber,
          isOutOfBusinessHours: updated.isOutOfBusinessHours,
          maxDailyMessagesPerUser: updated.maxDailyMessagesPerUser
        })
      })
      setRules(rules.map(r => r.id === rule.id ? updated : r))
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao atualizar regra')
    }
  }

  if (loading) return <div className="container"><div className="loading">Carregando regras...</div></div>
  if (error) return <div className="container"><div className="error">{error}</div></div>

  return (
    <div className="container">
      <div className="rules-header">
        <h1>Regras de Agendamento</h1>
        <select
          className="filter-input"
          value={selectedWhatsAppNumber}
          onChange={(event) => setSelectedWhatsAppNumber(event.target.value)}
        >
          <option value="">Todos os numeros WhatsApp</option>
          {whatsAppOptions.map((number) => (
            <option key={number} value={number}>{number}</option>
          ))}
        </select>
        <Link to="/rules/new" className="btn btn-primary">
          ➕ Nova Regra
        </Link>
      </div>

      {rules.length === 0 ? (
        <div className="empty-state">
          <p>Nenhuma regra configurada</p>
          <Link to="/rules/new" className="btn btn-primary">
            Criar primeira regra
          </Link>
        </div>
      ) : (
        <div className="rules-grid">
          {rules.map((rule) => (
            <div key={rule.id} className={`rule-card ${!rule.isEnabled ? 'disabled' : ''}`}>
              <div className="rule-header">
                <div className="rule-title">
                  <h3>{rule.name}</h3>
                  <div className="rule-time">
                    {rule.isOutOfBusinessHours ? '🕐 Fora de:' : '⏰ De:'} {rule.startTime} até {rule.endTime}
                  </div>
                  <div className="rule-time">📱 WhatsApp: {(rule.whatsAppNumbers && rule.whatsAppNumbers.length > 0) ? rule.whatsAppNumbers.join(', ') : (rule.whatsAppNumber || '-')}</div>
                </div>
                <div className="rule-status">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={rule.isEnabled}
                      onChange={() => handleToggleEnabled(rule)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="rule-content">
                <p className="message-preview">{rule.message}</p>
              </div>

              <div className="rule-config">
                {rule.throttleMinutes > 0 && (
                  <span className="config-badge">⏱️ {rule.throttleMinutes}min throttle</span>
                )}
                {rule.maxDailyMessagesPerUser && (
                  <span className="config-badge">📊 Max {rule.maxDailyMessagesPerUser}/dia</span>
                )}
                {rule.isOutOfBusinessHours && (
                  <span className="config-badge">🌙 Fora do expediente</span>
                )}
              </div>

              <div className="rule-actions">
                <Link to={`/rules/edit/${rule.id}`} className="btn btn-sm btn-secondary">
                  ✏️ Editar
                </Link>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="btn btn-sm btn-danger"
                >
                  🗑️ Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
