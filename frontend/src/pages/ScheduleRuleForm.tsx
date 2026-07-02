import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ScheduleRule, ScheduleRuleWindow, WhatsAppFilterOptions } from '../types'
import './ScheduleRules.css'

type WindowForm = {
  dayOfWeek: number
  startTime: string
  endTime: string
}

type FormData = {
  name: string
  whatsAppNumbers: string[]
  whatsAppNumber: string
  startTime: string
  endTime: string
  windows: WindowForm[]
  message: string
  isEnabled: boolean
  throttleMinutes: number
  isOutOfBusinessHours: boolean
  maxDailyMessagesPerUser: number | null
}

const DAY_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
]

const DEFAULT_WINDOW: WindowForm = {
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '17:00'
}

function formatDay(dayOfWeek: number): string {
  return DAY_OPTIONS.find(option => option.value === dayOfWeek)?.label ?? `Dia ${dayOfWeek}`
}

function toWindowForm(window: ScheduleRuleWindow): WindowForm {
  return {
    dayOfWeek: window.dayOfWeek,
    startTime: window.startTime,
    endTime: window.endTime,
  }
}

export function ScheduleRuleForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(Boolean(id))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [whatsAppOptions, setWhatsAppOptions] = useState<string[]>([])
  const [form, setForm] = useState<FormData>({
    name: '',
    whatsAppNumbers: [],
    whatsAppNumber: '',
    startTime: '08:00',
    endTime: '17:00',
    windows: [DEFAULT_WINDOW],
    message: '',
    isEnabled: true,
    throttleMinutes: 0,
    isOutOfBusinessHours: false,
    maxDailyMessagesPerUser: null,
  })

  useEffect(() => {
    const loadWhatsAppOptions = async () => {
      try {
        const options = await apiFetch<WhatsAppFilterOptions>('/api/schedule-rules/whatsapp-options')
        setWhatsAppOptions(options.numbers || [])
      } catch {
        // optional metadata endpoint
      }
    }

    void loadWhatsAppOptions()

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
        ? rule.windows.map(toWindowForm)
        : [{ dayOfWeek: 1, startTime: rule.startTime, endTime: rule.endTime }]

      setForm({
        name: rule.name,
        whatsAppNumbers: (rule.whatsAppNumbers && rule.whatsAppNumbers.length > 0)
          ? rule.whatsAppNumbers
          : (rule.whatsAppNumber ? [rule.whatsAppNumber] : []),
        whatsAppNumber: rule.whatsAppNumber,
        startTime: rule.startTime,
        endTime: rule.endTime,
        windows,
        message: rule.message,
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox'
        ? checked
        : type === 'number'
          ? (value === '' ? null : parseInt(value, 10))
          : value,
    }))
  }

  const handleWhatsAppNumberToggle = (number: string, isChecked: boolean) => {
    setForm(prev => {
      const nextNumbers = isChecked
        ? Array.from(new Set([...prev.whatsAppNumbers, number]))
        : prev.whatsAppNumbers.filter(item => item !== number)

      return {
        ...prev,
        whatsAppNumbers: nextNumbers,
        whatsAppNumber: nextNumbers[0] || '',
      }
    })
  }

  const handleWindowChange = (index: number, field: keyof WindowForm, value: string | number) => {
    setForm(prev => {
      const nextWindows = [...prev.windows]
      nextWindows[index] = {
        ...nextWindows[index],
        [field]: field === 'dayOfWeek' ? Number(value) : value,
      }

      return {
        ...prev,
        windows: nextWindows,
      }
    })
  }

  const addWindow = () => {
    setForm(prev => ({
      ...prev,
      windows: [...prev.windows, { ...DEFAULT_WINDOW }],
    }))
  }

  const removeWindow = (index: number) => {
    setForm(prev => ({
      ...prev,
      windows: prev.windows.length > 1
        ? prev.windows.filter((_, currentIndex) => currentIndex !== index)
        : prev.windows,
    }))
  }

  const windowsSummary = useMemo(() => {
    if (form.windows.length === 0) {
      return 'Nenhuma janela configurada'
    }

    return form.windows
      .map(window => `${formatDay(window.dayOfWeek)} ${window.startTime} - ${window.endTime}`)
      .join(' | ')
  }, [form.windows])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    if (!form.name.trim() || !form.message.trim() || form.whatsAppNumbers.length === 0 || form.windows.length === 0) {
      setError('Nome, pelo menos um numero WhatsApp, mensagem e uma janela de horário são obrigatórios')
      setSubmitting(false)
      return
    }

    const payload = {
      name: form.name.trim(),
      whatsAppNumbers: form.whatsAppNumbers,
      whatsAppNumber: form.whatsAppNumbers[0] || '',
      startTime: form.windows[0]?.startTime || form.startTime,
      endTime: form.windows[0]?.endTime || form.endTime,
      windows: form.windows,
      message: form.message,
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
        <p className="form-subtitle">Configure quando e como as mensagens automáticas serão enviadas</p>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit} className="schedule-form">
        <fieldset className="form-section">
          <legend>📋 Informações Básicas</legend>

          <div className="form-group">
            <label htmlFor="whatsAppNumbers">Números WhatsApp conectados *</label>

            <div className="checkbox-number-list" id="whatsAppNumbers" role="group" aria-label="Números WhatsApp conectados">
              {whatsAppOptions.length === 0 && (
                <p className="checkbox-number-empty">Nenhum numero conectado disponivel.</p>
              )}

              {whatsAppOptions.map((number) => {
                const selected = form.whatsAppNumbers.includes(number)
                return (
                  <label
                    key={number}
                    className={`checkbox-number-item ${selected ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => handleWhatsAppNumberToggle(number, event.target.checked)}
                    />
                    <span>{number}</span>
                  </label>
                )
              })}
            </div>

            <small>
              Selecione um ou mais números conectados.
              {whatsAppOptions.length === 0 ? ' Nenhum número disponível para seleção.' : ''}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="name">Nome da Regra *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Ex: Fora do expediente, Mensagem de boas-vindas"
              required
            />
            <small>Identificação da regra no painel</small>
          </div>

          <div className="form-group">
            <label htmlFor="message">Mensagem *</label>
            <textarea
              id="message"
              name="message"
              value={form.message}
              onChange={handleChange}
              placeholder="Digite a mensagem que será enviada automaticamente"
              rows={4}
              required
            />
            <small>Esta mensagem será enviada quando a regra se ativar</small>
          </div>

          <div className="form-checkbox">
            <input
              type="checkbox"
              id="isEnabled"
              name="isEnabled"
              checked={form.isEnabled}
              onChange={handleChange}
            />
            <label htmlFor="isEnabled">✅ Regra Ativa</label>
            <small>Desmarque para desativar esta regra sem deletá-la</small>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>⏰ Agenda Semanal</legend>

          <div className="form-checkbox">
            <input
              type="checkbox"
              id="isOutOfBusinessHours"
              name="isOutOfBusinessHours"
              checked={form.isOutOfBusinessHours}
              onChange={handleChange}
            />
            <label htmlFor="isOutOfBusinessHours">🌙 Enviar fora das janelas configuradas</label>
            <small>
              Marcado: a regra dispara quando estiver fora dos horários informados. Desmarcado: a regra dispara apenas dentro deles.
            </small>
          </div>

          <div className="info-box">
            <strong>Como montar a rotina:</strong>
            <p>
              Adicione uma janela para cada dia e horário. Exemplo: segunda 08:00-14:00, terça 09:00-16:00, quarta a sexta 08:00-17:00.
              Se você marcar a opção de fora das janelas, o bot envia quando estiver fora desses blocos.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <strong>Janelas configuradas</strong>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addWindow} disabled={submitting}>
              ➕ Adicionar janela
            </button>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {form.windows.map((window, index) => (
              <div key={`${window.dayOfWeek}-${index}`} className="schedule-window-card">
                <div className="schedule-window-row">
                  <div className="form-group schedule-window-field">
                    <label>Dia da semana</label>
                    <select
                      value={window.dayOfWeek}
                      onChange={(event) => handleWindowChange(index, 'dayOfWeek', Number(event.target.value))}
                      disabled={submitting}
                    >
                      {DAY_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group schedule-window-field">
                    <label>Início</label>
                    <input
                      type="time"
                      value={window.startTime}
                      onChange={(event) => handleWindowChange(index, 'startTime', event.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="form-group schedule-window-field">
                    <label>Fim</label>
                    <input
                      type="time"
                      value={window.endTime}
                      onChange={(event) => handleWindowChange(index, 'endTime', event.target.value)}
                      disabled={submitting}
                    />
                  </div>

                  <div className="schedule-window-actions">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeWindow(index)}
                      disabled={submitting || form.windows.length === 1}
                    >
                      🗑 Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rule-preview" style={{ marginTop: '16px' }}>
            <h3>📝 Resumo da rotina</h3>
            <div className="preview-content">
              <p><strong>Modo:</strong> {form.isOutOfBusinessHours ? '🌙 Fora das janelas' : '⏰ Dentro das janelas'}</p>
              <p><strong>Agenda:</strong> {windowsSummary}</p>
            </div>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>⏱️ Controle de Frequência</legend>

          <div className="form-group">
            <label htmlFor="throttleMinutes">Intervalo mínimo entre mensagens (minutos)</label>
            <input
              type="number"
              id="throttleMinutes"
              name="throttleMinutes"
              value={form.throttleMinutes}
              onChange={handleChange}
              min="0"
              max="1440"
              placeholder="0"
            />
            <small>
              Quanto tempo esperar antes de enviar outra mensagem para o mesmo usuário.
              Use 0 para "sem restrição".
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="maxDailyMessagesPerUser">Máximo de mensagens por dia</label>
            <input
              type="number"
              id="maxDailyMessagesPerUser"
              name="maxDailyMessagesPerUser"
              value={form.maxDailyMessagesPerUser || ''}
              onChange={handleChange}
              min="1"
              max="999"
              placeholder="Deixe em branco para sem limite"
            />
            <small>
              Número máximo de vezes que esta regra enviará mensagem para o mesmo usuário num dia.
              Deixe em branco para "sem limite".
            </small>
          </div>
        </fieldset>

        <div className="rule-preview">
          <h3>🔎 Resumo completo</h3>
          <div className="preview-content">
            <p><strong>Nome:</strong> {form.name || '(não preenchido)'}</p>
            <p><strong>WhatsApp:</strong> {form.whatsAppNumbers.length > 0 ? form.whatsAppNumbers.join(', ') : '(não preenchido)'}</p>
            <p><strong>Modo:</strong> {form.isOutOfBusinessHours ? '🌙 Fora das janelas configuradas' : '⏰ Dentro das janelas configuradas'}</p>
            <p><strong>Agenda:</strong> {windowsSummary}</p>
            <p><strong>Status:</strong> {form.isEnabled ? '✅ Ativa' : '❌ Inativa'}</p>
            {form.throttleMinutes > 0 && (
              <p><strong>Throttle:</strong> {form.throttleMinutes} minutos entre mensagens</p>
            )}
            {form.maxDailyMessagesPerUser && (
              <p><strong>Limite:</strong> {form.maxDailyMessagesPerUser} mensagens/dia</p>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-lg"
          >
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