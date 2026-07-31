import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ScheduleRule } from '../types'
import './ScheduleRules.css'

type WindowForm = {
  dayOfWeek: number
  startTime: string
  endTime: string
}

type MessageForm = {
  text: string
  days: number[]
}

type FormData = {
  name: string
  windows: WindowForm[]
  messages: MessageForm[]
  isEnabled: boolean
  throttleMinutes: number
  isOutOfBusinessHours: boolean
  maxDailyMessagesPerUser: number | null
}

const DAY_OPTIONS = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terça', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
]

const DEFAULT_RANGE = { startTime: '08:00', endTime: '17:00' }

export function ScheduleRuleForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(Boolean(id))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>({
    name: '',
    windows: [{ dayOfWeek: 1, ...DEFAULT_RANGE }, { dayOfWeek: 2, ...DEFAULT_RANGE }, { dayOfWeek: 3, ...DEFAULT_RANGE }, { dayOfWeek: 4, ...DEFAULT_RANGE }, { dayOfWeek: 5, ...DEFAULT_RANGE }],
    messages: [{ text: '', days: [] }],
    isEnabled: true,
    throttleMinutes: 0,
    isOutOfBusinessHours: false,
    maxDailyMessagesPerUser: null,
  })

  useEffect(() => {
    if (id) {
      void loadRule()
    } else {
      setLoading(false)
    }
  }, [id])

  const loadRule = async () => {
    try {
      const rule = await apiFetch<ScheduleRule>(`/api/schedule-rules/${id}`)
      const windows = rule.windows && rule.windows.length > 0
        ? rule.windows.map(w => ({ dayOfWeek: w.dayOfWeek, startTime: w.startTime, endTime: w.endTime }))
        : [{ dayOfWeek: 1, startTime: rule.startTime, endTime: rule.endTime }]

      setForm({
        name: rule.name,
        windows,
        messages: rule.messages && rule.messages.length > 0
          ? rule.messages.map(m => ({ text: m.text, days: m.days }))
          : [{ text: '', days: [] }],
        isEnabled: rule.isEnabled,
        throttleMinutes: rule.throttleMinutes,
        isOutOfBusinessHours: rule.isOutOfBusinessHours,
        maxDailyMessagesPerUser: rule.maxDailyMessagesPerUser,
      })
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Falha ao carregar regra')
    } finally {
      setLoading(false)
    }
  }

  // ----- Weekly schedule grid helpers -----

  const getRangesForDay = (day: number) =>
    form.windows.filter(w => w.dayOfWeek === day).map(w => ({ startTime: w.startTime, endTime: w.endTime }))

  const setRangesForDay = (day: number, ranges: { startTime: string; endTime: string }[]) => {
    setForm(prev => ({
      ...prev,
      windows: [
        ...prev.windows.filter(w => w.dayOfWeek !== day),
        ...ranges.map(range => ({ dayOfWeek: day, ...range })),
      ],
    }))
  }

  const toggleDay = (day: number, active: boolean) => {
    setRangesForDay(day, active ? [{ ...DEFAULT_RANGE }] : [])
  }

  const updateRange = (day: number, index: number, field: 'startTime' | 'endTime', value: string) => {
    const ranges = getRangesForDay(day)
    ranges[index] = { ...ranges[index], [field]: value }
    setRangesForDay(day, ranges)
  }

  const addRange = (day: number) => {
    setRangesForDay(day, [...getRangesForDay(day), { ...DEFAULT_RANGE }])
  }

  const removeRange = (day: number, index: number) => {
    const ranges = getRangesForDay(day)
    setRangesForDay(day, ranges.filter((_, i) => i !== index))
  }

  const windowsSummary = useMemo(() => {
    if (form.windows.length === 0) {
      return 'Nenhum dia configurado'
    }

    return DAY_OPTIONS
      .filter(option => form.windows.some(w => w.dayOfWeek === option.value))
      .map(option => {
        const ranges = getRangesForDay(option.value)
        return `${option.short} ${ranges.map(r => `${r.startTime}-${r.endTime}`).join(', ')}`
      })
      .join(' • ')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.windows])

  // ----- Per-day messages helpers -----

  const addMessage = () => {
    setForm(prev => ({ ...prev, messages: [...prev.messages, { text: '', days: [] }] }))
  }

  const removeMessage = (index: number) => {
    setForm(prev => ({
      ...prev,
      messages: prev.messages.length > 1 ? prev.messages.filter((_, i) => i !== index) : prev.messages,
    }))
  }

  const updateMessageText = (index: number, text: string) => {
    setForm(prev => {
      const next = [...prev.messages]
      next[index] = { ...next[index], text }
      return { ...prev, messages: next }
    })
  }

  const toggleMessageDay = (index: number, day: number) => {
    setForm(prev => {
      const next = [...prev.messages]
      const current = next[index].days
      next[index] = {
        ...next[index],
        days: current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort(),
      }
      return { ...prev, messages: next }
    })
  }

  const coveredDays = useMemo(() => new Set(form.messages.flatMap(m => m.days)), [form.messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const trimmedMessages = form.messages.map(m => ({ text: m.text.trim(), days: m.days }))
    const hasEmptyMessageText = trimmedMessages.some(m => !m.text)
    const hasMessageWithoutDay = trimmedMessages.some(m => m.days.length === 0)

    if (!form.name.trim() || form.windows.length === 0) {
      setError('Nome e ao menos um dia de horário são obrigatórios')
      setSubmitting(false)
      return
    }

    if (trimmedMessages.length === 0 || hasEmptyMessageText) {
      setError('Toda mensagem precisa ter um texto preenchido')
      setSubmitting(false)
      return
    }

    if (hasMessageWithoutDay) {
      setError('Toda mensagem precisa estar vinculada a pelo menos um dia da semana')
      setSubmitting(false)
      return
    }

    const firstRange = getRangesForDay(form.windows[0]?.dayOfWeek ?? 1)[0] || DEFAULT_RANGE

    const payload = {
      name: form.name.trim(),
      startTime: firstRange.startTime,
      endTime: firstRange.endTime,
      windows: form.windows,
      messages: trimmedMessages,
      isEnabled: form.isEnabled,
      throttleMinutes: form.throttleMinutes,
      isOutOfBusinessHours: form.isOutOfBusinessHours,
      maxDailyMessagesPerUser: form.maxDailyMessagesPerUser,
    }

    try {
      const method = id ? 'PUT' : 'POST'
      const endpoint = id ? `/api/schedule-rules/${id}` : '/api/schedule-rules'

      await apiFetch<ScheduleRule>(endpoint, {
        method,
        body: JSON.stringify(payload)
      })

      navigate('/rules')
    } catch (err) {
      console.error('Erro:', err)
      setError(`Falha ao ${id ? 'atualizar' : 'criar'} regra. Verifique os dados e tente novamente.`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="container"><div className="loading">Carregando...</div></div>

  const isEdit = !!id

  return (
    <div className="schedule-rule-page container">
      <div className="form-header">
        <h1>{isEdit ? 'Editar Regra' : 'Nova Regra de Agendamento'}</h1>
        <p className="form-subtitle">Configure quando e com qual mensagem o bot responde automaticamente</p>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit} className="schedule-form">
        <fieldset className="form-section">
          <legend>⚙️ Configurações</legend>

          <div className="config-top-row">
            <div className="form-group config-name-field">
              <label>Nome da Regra *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Horário comercial"
              />
            </div>

            <label className="config-active-toggle">
              <input
                type="checkbox"
                checked={form.isEnabled}
                onChange={(e) => setForm(prev => ({ ...prev, isEnabled: e.target.checked }))}
              />
              <span>✅ Ativa</span>
            </label>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Intervalo mínimo entre mensagens (min)</label>
              <input
                type="number"
                value={form.throttleMinutes}
                onChange={(e) => setForm(prev => ({ ...prev, throttleMinutes: Number(e.target.value) || 0 }))}
                min="0"
                max="1440"
                placeholder="0 = sem restrição"
              />
            </div>

            <div className="form-group">
              <label>Máximo de mensagens por dia</label>
              <input
                type="number"
                value={form.maxDailyMessagesPerUser || ''}
                onChange={(e) => setForm(prev => ({ ...prev, maxDailyMessagesPerUser: e.target.value === '' ? null : parseInt(e.target.value, 10) }))}
                min="1"
                max="999"
                placeholder="Sem limite"
              />
            </div>
          </div>
        </fieldset>

        <div className="schedule-columns">
          <fieldset className="form-section">
            <legend>⏰ Horário de funcionamento</legend>

            <div className="mode-toggle">
              <button
                type="button"
                className={`mode-toggle-btn ${!form.isOutOfBusinessHours ? 'active' : ''}`}
                onClick={() => setForm(prev => ({ ...prev, isOutOfBusinessHours: false }))}
              >
                ⏰ DENTRO do horário
              </button>
              <button
                type="button"
                className={`mode-toggle-btn ${form.isOutOfBusinessHours ? 'active' : ''}`}
                onClick={() => setForm(prev => ({ ...prev, isOutOfBusinessHours: true }))}
              >
                🌙 FORA do horário
              </button>
            </div>

            <div className="weekly-grid">
              {DAY_OPTIONS.map(option => {
                const ranges = getRangesForDay(option.value)
                const active = ranges.length > 0

                return (
                  <div key={option.value} className={`weekly-day-row ${active ? 'active' : ''}`}>
                    <label className="weekly-day-toggle">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => toggleDay(option.value, e.target.checked)}
                        disabled={submitting}
                      />
                      <span>{option.label}</span>
                    </label>

                    {active && (
                      <div className="weekly-day-ranges">
                        {ranges.map((range, index) => (
                          <div className="time-range-row" key={index}>
                            <input
                              type="time"
                              value={range.startTime}
                              onChange={(e) => updateRange(option.value, index, 'startTime', e.target.value)}
                              disabled={submitting}
                            />
                            <span>até</span>
                            <input
                              type="time"
                              value={range.endTime}
                              onChange={(e) => updateRange(option.value, index, 'endTime', e.target.value)}
                              disabled={submitting}
                            />
                            <button
                              type="button"
                              className="range-remove"
                              onClick={() => removeRange(option.value, index)}
                              disabled={submitting || ranges.length === 1}
                              title="Remover horário"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="range-add"
                          onClick={() => addRange(option.value)}
                          disabled={submitting}
                        >
                          + horário
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>💬 Mensagens automáticas</legend>
            <small className="messages-hint">
              Crie quantas mensagens precisar e vincule cada uma aos dias em que ela deve ser usada.
            </small>

            <div className="day-coverage">
              {DAY_OPTIONS.map(option => (
                <span key={option.value} className={`day-chip ${coveredDays.has(option.value) ? 'covered' : ''}`}>
                  {option.short}
                </span>
              ))}
            </div>

            <div className="message-block-list">
              {form.messages.map((message, index) => (
                <div key={index} className="message-block">
                  <div className="message-block-header">
                    <strong>Mensagem {index + 1}</strong>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeMessage(index)}
                      disabled={submitting || form.messages.length === 1}
                    >
                      🗑
                    </button>
                  </div>

                  <textarea
                    value={message.text}
                    onChange={(e) => updateMessageText(index, e.target.value)}
                    placeholder="Digite a mensagem que será enviada..."
                    rows={2}
                    disabled={submitting}
                  />

                  <div className="message-day-picker">
                    {DAY_OPTIONS.map(option => (
                      <button
                        type="button"
                        key={option.value}
                        className={`day-chip clickable ${message.days.includes(option.value) ? 'active' : ''}`}
                        onClick={() => toggleMessageDay(index, option.value)}
                        disabled={submitting}
                      >
                        {option.short}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={addMessage} disabled={submitting} style={{ marginTop: '10px' }}>
              ➕ Adicionar mensagem
            </button>
          </fieldset>
        </div>

        <div className="rule-preview compact">
          <span><strong>Agenda:</strong> {windowsSummary}</span>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={submitting} className="btn btn-primary btn-lg">
            {submitting ? '⏳ Salvando...' : (isEdit ? '✅ Salvar Alterações' : '➕ Criar Regra')}
          </button>
          <Link to="/rules" className="btn btn-secondary btn-lg">
            ❌ Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
