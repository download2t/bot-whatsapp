import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ScheduleRule } from '../types'
import './ScheduleRules.css'

const DAY_LABELS = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
]

function formatWindowSummary(rule: ScheduleRule): string {
  if (rule.windows && rule.windows.length > 0) {
    return rule.windows
      .map(window => `${DAY_LABELS[window.dayOfWeek] || window.dayName} ${window.startTime}-${window.endTime}`)
      .join(' • ')
  }

  return `${rule.startTime} até ${rule.endTime}`
}

// Resumo compacto em vez de listar cada mensagem por inteiro — o card só precisa dar uma
// visão geral; os detalhes completos ficam na tela de edição.
function summarizeMessages(rule: ScheduleRule): string {
  const count = rule.messages?.length ?? 0
  if (count === 0) return 'Nenhuma mensagem configurada'

  const daysCovered = new Set(rule.messages.flatMap(m => m.days)).size
  const messageLabel = count === 1 ? 'mensagem' : 'mensagens'
  const dayLabel = daysCovered === 1 ? 'dia' : 'dias'
  return `${count} ${messageLabel} · cobre ${daysCovered} ${dayLabel} da semana`
}

function getCoveredPaisNames(rule: ScheduleRule): string[] {
  const names = new Set(
    rule.messages
      .filter(m => m.paisId !== null && m.paisName)
      .map(m => m.paisName as string)
  )
  return Array.from(names)
}

// null quando é o padrão ("RegisteredContacts") — só mostra o badge quando a regra
// realmente desvia do comportamento usual, pra não poluir todo card com a mesma info.
function getAudienceLabel(rule: ScheduleRule): string | null {
  switch (rule.audienceMode) {
    case 'Anyone': return '👥 Qualquer pessoa'
    case 'AnyoneExceptRegistered': return '👥 Qualquer um, exceto cadastrados'
    case 'AnyoneExceptTurma': return `👥 Exceto turma "${rule.excludedTurmaName ?? '?'}"`
    default: return null
  }
}

export function ScheduleRulesList() {
  const [rules, setRules] = useState<ScheduleRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRules = async () => {
    try {
      setLoading(true)
      const data = await apiFetch<ScheduleRule[]>('/api/schedule-rules')
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
  }, [])

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
          startTime: updated.startTime,
          endTime: updated.endTime,
          windows: updated.windows,
          messages: updated.messages.map(m => ({ text: m.text, days: m.days, paisId: m.paisId })),
          isEnabled: updated.isEnabled,
          throttleMinutes: updated.throttleMinutes,
          isOutOfBusinessHours: updated.isOutOfBusinessHours,
          maxDailyMessagesPerUser: updated.maxDailyMessagesPerUser,
          audienceMode: updated.audienceMode,
          excludedTurmaId: updated.excludedTurmaId
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
                    {rule.isOutOfBusinessHours ? '🕐 Fora das janelas:' : '⏰ Dentro das janelas:'} {formatWindowSummary(rule)}
                  </div>
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
                <p className="message-summary">💬 {summarizeMessages(rule)}</p>
                {getCoveredPaisNames(rule).length > 0 && (
                  <p className="message-summary" style={{ marginTop: '4px' }}>
                    🌎 Países: {getCoveredPaisNames(rule).map(name => (
                      <span key={name} className="config-badge" style={{ marginRight: '4px' }}>{name}</span>
                    ))}
                  </p>
                )}
                {rule.messages[0] && (
                  <p className="message-preview-compact">
                    <strong>{rule.messages[0].dayNames.join(', ')}:</strong> {rule.messages[0].text}
                    {rule.messages.length > 1 && <span className="message-more"> +{rule.messages.length - 1}</span>}
                  </p>
                )}
              </div>

              <div className="rule-config">
                {getAudienceLabel(rule) && (
                  <span className="config-badge">{getAudienceLabel(rule)}</span>
                )}
                {rule.throttleMinutes > 0 && (
                  <span className="config-badge">⏱️ {rule.throttleMinutes}min throttle</span>
                )}
                {rule.maxDailyMessagesPerUser ? (
                  <span className="config-badge">📊 Max {rule.maxDailyMessagesPerUser}/dia</span>
                ) : (
                  <span className="config-badge">📊 Sem limite diário</span>
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
