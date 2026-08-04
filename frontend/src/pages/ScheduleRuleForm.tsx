import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { AudienceMode, Pais, ScheduleRule, Turma } from '../types'
import './ScheduleRules.css'

const AUDIENCE_OPTIONS: { value: AudienceMode; label: string; hint: string }[] = [
  { value: 'RegisteredContacts', label: 'Somente contatos cadastrados', hint: 'Comportamento padrão — só responde quem está em Contatos.' },
  { value: 'Anyone', label: 'Qualquer pessoa', hint: 'Responde qualquer número que mandar mensagem, cadastrado ou não.' },
  { value: 'AnyoneExceptRegistered', label: 'Qualquer pessoa, exceto contatos cadastrados', hint: 'Útil pra separar automação de gente que já é atendida manualmente.' },
  { value: 'AnyoneExceptTurma', label: 'Qualquer pessoa, exceto uma turma específica', hint: 'Escolha abaixo qual turma fica de fora da automação.' },
]

type WindowForm = {
  dayOfWeek: number
  startTime: string
  endTime: string
}

type MessageForm = {
  text: string
  days: number[]
  paisId: number | null
  paisName: string | null
}

type FormData = {
  name: string
  windows: WindowForm[]
  messages: MessageForm[]
  isEnabled: boolean
  throttleMinutes: number
  isOutOfBusinessHours: boolean
  maxDailyMessagesPerUser: number | null
  audienceMode: AudienceMode
  excludedTurmaId: number | null
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
    messages: [{ text: '', days: [], paisId: null, paisName: null }],
    isEnabled: true,
    throttleMinutes: 0,
    isOutOfBusinessHours: false,
    maxDailyMessagesPerUser: null,
    audienceMode: 'RegisteredContacts',
    excludedTurmaId: null,
  })
  const [paises, setPaises] = useState<Pais[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [activeTab, setActiveTab] = useState<number | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<Pais[]>('/api/paises')
        setPaises((data || []).filter(p => p.isActive))
      } catch {
        // Não impede o formulário de funcionar só com mensagens padrão
      }
    })()

    void (async () => {
      try {
        const data = await apiFetch<Turma[]>('/api/turmas')
        setTurmas((data || []).filter(t => t.isActive))
      } catch {
        // Não impede o formulário de funcionar sem a opção de excluir turma
      }
    })()
  }, [])

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
          ? rule.messages.map(m => ({ text: m.text, days: m.days, paisId: m.paisId, paisName: m.paisName }))
          : [{ text: '', days: [], paisId: null, paisName: null }],
        isEnabled: rule.isEnabled,
        throttleMinutes: rule.throttleMinutes,
        isOutOfBusinessHours: rule.isOutOfBusinessHours,
        maxDailyMessagesPerUser: rule.maxDailyMessagesPerUser,
        audienceMode: rule.audienceMode ?? 'RegisteredContacts',
        excludedTurmaId: rule.excludedTurmaId,
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
    const activePaisName = activeTab !== null ? paises.find(p => p.id === activeTab)?.name ?? null : null
    setForm(prev => ({ ...prev, messages: [...prev.messages, { text: '', days: [], paisId: activeTab, paisName: activePaisName }] }))
  }

  const removeMessage = (index: number) => {
    setForm(prev => ({
      ...prev,
      messages: prev.messages.filter((_, i) => i !== index),
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

  // Tabs: "Padrão" (paisId null) sempre presente, um por país ativo cadastrado, e um extra pra
  // qualquer paisId que já exista nas mensagens da regra mas não esteja mais na lista de países
  // ativos (país foi desativado depois de já estar em uso aqui) — assim a mensagem nunca some
  // silenciosamente da tela mesmo que o país tenha saído da lista principal.
  const tabs = useMemo(() => {
    const known = new Map<number | null, string>()
    known.set(null, '🌐 Padrão')
    paises.forEach(p => known.set(p.id, `${p.name} (+${p.ddi})`))

    const orphanMessages = form.messages.filter(m => m.paisId !== null && !known.has(m.paisId))
    orphanMessages.forEach(m => known.set(m.paisId, `${m.paisName ?? `País #${m.paisId}`} (inativo)`))

    return Array.from(known.entries()).map(([paisId, label]) => ({ paisId, label }))
  }, [paises, form.messages])

  const messagesWithIndex = useMemo(
    () => form.messages.map((message, index) => ({ ...message, index })),
    [form.messages]
  )

  const visibleMessages = useMemo(
    () => messagesWithIndex.filter(m => m.paisId === activeTab),
    [messagesWithIndex, activeTab]
  )

  const coveredDays = useMemo(() => new Set(visibleMessages.flatMap(m => m.days)), [visibleMessages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const trimmedMessages = form.messages.map(m => ({ text: m.text.trim(), days: m.days, paisId: m.paisId }))
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

    if (form.audienceMode === 'AnyoneExceptTurma' && !form.excludedTurmaId) {
      setError('Escolha qual turma fica de fora quando o público-alvo é "exceto uma turma específica"')
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
      audienceMode: form.audienceMode,
      excludedTurmaId: form.audienceMode === 'AnyoneExceptTurma' ? form.excludedTurmaId : null,
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

        <fieldset className="form-section">
          <legend>🎯 Público-alvo</legend>
          <small className="messages-hint">
            Quem pode receber resposta automática por esta regra.
          </small>

          <div className="audience-options">
            {AUDIENCE_OPTIONS.map(option => (
              <label key={option.value} className={`audience-option ${form.audienceMode === option.value ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="audienceMode"
                  value={option.value}
                  checked={form.audienceMode === option.value}
                  onChange={() => setForm(prev => ({ ...prev, audienceMode: option.value }))}
                  disabled={submitting}
                />
                <div>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </div>
              </label>
            ))}
          </div>

          {form.audienceMode === 'AnyoneExceptTurma' && (
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>Turma a excluir</label>
              <select
                value={form.excludedTurmaId ?? ''}
                onChange={(e) => setForm(prev => ({ ...prev, excludedTurmaId: e.target.value ? Number(e.target.value) : null }))}
                disabled={submitting}
              >
                <option value="">— Selecione uma turma —</option>
                {turmas.map(turma => (
                  <option key={turma.id} value={turma.id}>{turma.name}</option>
                ))}
              </select>
              {turmas.length === 0 && (
                <small style={{ display: 'block', marginTop: '4px', color: '#888' }}>
                  Nenhuma turma ativa cadastrada — crie uma em <Link to="/turmas">Turmas</Link>.
                </small>
              )}
            </div>
          )}
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
              Clique em um país para gerenciar as mensagens específicas dele. Quem não bater com nenhum país cadastrado recebe as mensagens de "Padrão".
            </small>

            {paises.length === 0 && (
              <small className="messages-hint" style={{ display: 'block', marginTop: '4px' }}>
                Cadastre países em <Link to="/paises">Países</Link> para segmentar mensagens por DDI (ex: uma mensagem diferente para Moçambique).
              </small>
            )}

            <div className="pais-tabs">
              {tabs.map(tab => {
                const count = form.messages.filter(m => m.paisId === tab.paisId).length
                return (
                  <button
                    type="button"
                    key={tab.paisId ?? 'default'}
                    className={`pais-tab ${activeTab === tab.paisId ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.paisId)}
                    disabled={submitting}
                  >
                    {tab.label}
                    {count > 0 && <span className="pais-tab-count">{count}</span>}
                  </button>
                )
              })}
            </div>

            <div className="day-coverage">
              {DAY_OPTIONS.map(option => (
                <span key={option.value} className={`day-chip ${coveredDays.has(option.value) ? 'covered' : ''}`}>
                  {option.short}
                </span>
              ))}
            </div>

            <div className="message-block-list">
              {visibleMessages.length === 0 && (
                <p className="messages-hint" style={{ margin: 0 }}>
                  Nenhuma mensagem para {tabs.find(t => t.paisId === activeTab)?.label ?? 'este país'} ainda.
                </p>
              )}

              {visibleMessages.map((message, order) => (
                <div key={message.index} className="message-block">
                  <div className="message-block-header">
                    <strong>Mensagem {order + 1}</strong>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeMessage(message.index)}
                      disabled={submitting}
                    >
                      🗑
                    </button>
                  </div>

                  <textarea
                    value={message.text}
                    onChange={(e) => updateMessageText(message.index, e.target.value)}
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
                        onClick={() => toggleMessageDay(message.index, option.value)}
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
              ➕ Adicionar mensagem {activeTab !== null ? `para ${tabs.find(t => t.paisId === activeTab)?.label}` : 'padrão'}
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
