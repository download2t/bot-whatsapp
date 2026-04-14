import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ScheduleRule, WhatsAppFilterOptions } from '../types'
import './ScheduleRules.css'

type FormData = Omit<ScheduleRule, 'id' | 'createdAtUtc'>

export function ScheduleRuleForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(id ? true : false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [whatsAppOptions, setWhatsAppOptions] = useState<string[]>([])
  const [form, setForm] = useState<FormData>({
    name: '',
    whatsAppNumbers: [],
    whatsAppNumber: '',
    startTime: '08:00',
    endTime: '10:00',
    message: '',
    isEnabled: true,
    throttleMinutes: 0,
    isOutOfBusinessHours: false,
    maxDailyMessagesPerUser: null
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
    }
  }, [id])

  const loadRule = async () => {
    try {
      const rule = await apiFetch<ScheduleRule>(`/api/schedule-rules/${id}`)
      setForm({
        name: rule.name,
        whatsAppNumbers: (rule.whatsAppNumbers && rule.whatsAppNumbers.length > 0)
          ? rule.whatsAppNumbers
          : (rule.whatsAppNumber ? [rule.whatsAppNumber] : []),
        whatsAppNumber: rule.whatsAppNumber,
        startTime: rule.startTime,
        endTime: rule.endTime,
        message: rule.message,
        isEnabled: rule.isEnabled,
        throttleMinutes: rule.throttleMinutes,
        isOutOfBusinessHours: rule.isOutOfBusinessHours,
        maxDailyMessagesPerUser: rule.maxDailyMessagesPerUser
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
          : value
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
        whatsAppNumber: nextNumbers[0] || ''
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    if (!form.name.trim() || !form.message.trim() || form.whatsAppNumbers.length === 0) {
      setError('Nome, pelo menos um numero WhatsApp e mensagem são obrigatórios')
      setSubmitting(false)
      return
    }

    const payload = {
      ...form,
      whatsAppNumbers: form.whatsAppNumbers,
      whatsAppNumber: form.whatsAppNumbers[0] || ''
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
    <div className="container">
      <div className="form-header">
        <h1>{isEdit ? 'Editar Regra' : 'Nova Regra de Agendamento'}</h1>
        <p className="form-subtitle">Configure quando e como as mensagens automáticas serão enviadas</p>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit} className="schedule-form">
        {/* SEÇÃO: INFORMAÇÕES BÁSICAS */}
        <fieldset className="form-section">
          <legend>📋 Informações Básicas</legend>

          <div className="form-group">
            <label htmlFor="whatsAppNumbers">Numeros WhatsApp conectados *</label>

            <div className="checkbox-number-list" id="whatsAppNumbers" role="group" aria-label="Numeros WhatsApp conectados">
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
              Selecione um ou mais numeros conectados.
              {whatsAppOptions.length === 0 ? ' Nenhum numero disponível para seleção.' : ''}
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

        {/* SEÇÃO: AGENDAMENTO */}
        <fieldset className="form-section">
          <legend>⏰ Agendamento</legend>

          <div className="form-checkbox">
            <input
              type="checkbox"
              id="isOutOfBusinessHours"
              name="isOutOfBusinessHours"
              checked={form.isOutOfBusinessHours}
              onChange={handleChange}
            />
            <label htmlFor="isOutOfBusinessHours">
              🌙 Fora do expediente
            </label>
            <small>Se marcado, a regra dispara FORA do horário indicado (ex: 18h-08h)</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="startTime">
                {form.isOutOfBusinessHours ? 'Início da jornada' : 'Início'} *
              </label>
              <input
                type="time"
                id="startTime"
                name="startTime"
                value={form.startTime}
                onChange={handleChange}
                required
              />
              <small>
                {form.isOutOfBusinessHours 
                  ? 'Quando o expediente começa (mensagens disparam antes)'
                  : 'Hora para iniciar o disparo de mensagens'}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="endTime">
                {form.isOutOfBusinessHours ? 'Fim da jornada' : 'Fim'} *
              </label>
              <input
                type="time"
                id="endTime"
                name="endTime"
                value={form.endTime}
                onChange={handleChange}
                required
              />
              <small>
                {form.isOutOfBusinessHours 
                  ? 'Quando o expediente termina (mensagens disparam depois)'
                  : 'Hora para parar o disparo de mensagens'}
              </small>
            </div>
          </div>

          {form.isOutOfBusinessHours && (
            <div className="info-box">
              <strong>💡 Como funciona:</strong>
              <p>
                Se você configurar 08:00-18:00 com "Fora do expediente" marcado,
                as mensagens serão enviadas de 18:00 até 08:00 (fora da jornada comercial).
              </p>
            </div>
          )}
        </fieldset>

        {/* SEÇÃO: CONTROLE DE THROTTLE */}
        <fieldset className="form-section">
          <legend>⏱️ Controle de Frequência</legend>

          <div className="form-group">
            <label htmlFor="throttleMinutes">
              Intervalo mínimo entre mensagens (minutos)
            </label>
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
              Use 0 para "sem restrição" (padrão)
            </small>
          </div>

          <div className="examples">
            <strong>Exemplos:</strong>
            <ul>
              <li>0 = Sem restrição (enviar sempre que a regra se ativar)</li>
              <li>30 = Aguardar 30 minutos entre mensagens</li>
              <li>60 = Máximo 1 mensagem por hora</li>
              <li>1440 = Máximo 1 mensagem por dia</li>
            </ul>
          </div>
        </fieldset>

        {/* SEÇÃO: LIMITE DIÁRIO */}
        <fieldset className="form-section">
          <legend>📊 Limite Diário por Usuário</legend>

          <div className="form-group">
            <label htmlFor="maxDailyMessagesPerUser">
              Máximo de mensagens por dia
            </label>
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
              Deixe em branco para "sem limite"
            </small>
          </div>

          <div className="examples">
            <strong>Exemplos:</strong>
            <ul>
              <li>1 = Máximo 1 mensagem por usuário por dia</li>
              <li>5 = Até 5 mensagens por usuário por dia</li>
              <li>Vazio = Sem limite de mensagens diárias</li>
            </ul>
          </div>
        </fieldset>

        {/* RESUMO DA CONFIGURAÇÃO */}
        <div className="rule-preview">
          <h3>📝 Resumo da Configuração</h3>
          <div className="preview-content">
            <p><strong>Nome:</strong> {form.name || '(não preenchido)'}</p>
            <p><strong>WhatsApp:</strong> {form.whatsAppNumbers.length > 0 ? form.whatsAppNumbers.join(', ') : '(não preenchido)'}</p>
            <p>
              <strong>Horário:</strong> {form.isOutOfBusinessHours ? '🌙 FORA DE' : '⏰'}
              {form.startTime} até {form.endTime}
            </p>
            <p><strong>Status:</strong> {form.isEnabled ? '✅ Ativa' : '❌ Inativa'}</p>
            {form.throttleMinutes > 0 && (
              <p><strong>Throttle:</strong> {form.throttleMinutes} minutos entre mensagens</p>
            )}
            {form.maxDailyMessagesPerUser && (
              <p><strong>Limite:</strong> {form.maxDailyMessagesPerUser} mensagens/dia</p>
            )}
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
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
