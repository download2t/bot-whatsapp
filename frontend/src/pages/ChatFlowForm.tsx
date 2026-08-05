import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ChatFlow } from '../types'
import '../styles/modern.css'
import './ScheduleRules.css'

type OptionForm = {
  label: string
  keywordsText: string
  nextStepClientId: string
}

type StepForm = {
  clientId: string
  label: string
  messageText: string
  isStartStep: boolean
  isEndStep: boolean
  invalidAnswerMessage: string
  options: OptionForm[]
}

type FormData = {
  name: string
  timeoutMinutes: number
  timeoutMessage: string
  steps: StepForm[]
}

function newClientId(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function newStep(isStart: boolean): StepForm {
  return {
    clientId: newClientId(),
    label: '',
    messageText: '',
    isStartStep: isStart,
    isEndStep: false,
    invalidAnswerMessage: '',
    options: [],
  }
}

export function ChatFlowForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id
  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>({
    name: '',
    timeoutMinutes: 1440,
    timeoutMessage: '',
    steps: [newStep(true)],
  })
  const [activeStepClientId, setActiveStepClientId] = useState<string>(form.steps[0]?.clientId ?? '')

  // Keeps the selected tab valid whenever the step list changes from under it — after loading
  // an existing flow (steps replaced wholesale) or after deleting the currently active step.
  // Adding a step selects it explicitly (see addStep) instead of relying on this effect, so the
  // sidebar jumps straight to the new step rather than staying on whatever was open before.
  useEffect(() => {
    if (form.steps.length === 0) return
    if (!form.steps.some(s => s.clientId === activeStepClientId)) {
      setActiveStepClientId(form.steps[0].clientId)
    }
  }, [form.steps, activeStepClientId])

  useEffect(() => {
    if (!id) return
    void (async () => {
      try {
        setLoading(true)
        const flow = await apiFetch<ChatFlow>(`/api/chat-flows/${id}`)
        setForm({
          name: flow.name,
          timeoutMinutes: flow.timeoutMinutes,
          timeoutMessage: flow.timeoutMessage ?? '',
          steps: flow.steps.map(s => ({
            clientId: String(s.id),
            label: s.label || '',
            messageText: s.messageText,
            isStartStep: s.isStartStep,
            isEndStep: s.isEndStep,
            invalidAnswerMessage: s.invalidAnswerMessage || '',
            options: s.options.map(o => ({
              label: o.label,
              keywordsText: o.matchKeywords.join(', '),
              nextStepClientId: String(o.nextStepId),
            })),
          })),
        })
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar fluxo')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  const stepLabel = (step: StepForm, index: number) =>
    step.label.trim() || step.messageText.trim().slice(0, 30) || `Etapa ${index + 1}`

  const activeStep = form.steps.find(s => s.clientId === activeStepClientId)

  const addStep = () => {
    const step = newStep(false)
    setForm(prev => ({ ...prev, steps: [...prev.steps, step] }))
    setActiveStepClientId(step.clientId)
  }

  const removeStep = (clientId: string) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps
        .filter(s => s.clientId !== clientId)
        // Any option elsewhere that pointed at the removed step needs to be reassigned —
        // clearing it forces the user to pick a valid target before saving instead of silently
        // leaving a dangling reference.
        .map(s => ({
          ...s,
          options: s.options.map(o => o.nextStepClientId === clientId ? { ...o, nextStepClientId: '' } : o),
        })),
    }))
  }

  const updateStep = (clientId: string, patch: Partial<StepForm>) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.clientId === clientId ? { ...s, ...patch } : s),
    }))
  }

  const setStartStep = (clientId: string) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => ({ ...s, isStartStep: s.clientId === clientId })),
    }))
  }

  const addOption = (stepClientId: string) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.clientId === stepClientId
        ? { ...s, options: [...s.options, { label: '', keywordsText: '', nextStepClientId: '' }] }
        : s),
    }))
  }

  const updateOption = (stepClientId: string, index: number, patch: Partial<OptionForm>) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => {
        if (s.clientId !== stepClientId) return s
        const options = [...s.options]
        options[index] = { ...options[index], ...patch }
        return { ...s, options }
      }),
    }))
  }

  const removeOption = (stepClientId: string, index: number) => {
    setForm(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.clientId === stepClientId
        ? { ...s, options: s.options.filter((_, i) => i !== index) }
        : s),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Nome do fluxo é obrigatório')
      return
    }

    if (form.steps.length === 0) {
      setError('O fluxo precisa de pelo menos uma etapa')
      return
    }

    const startCount = form.steps.filter(s => s.isStartStep).length
    if (startCount !== 1) {
      setError('Marque exatamente uma etapa como inicial')
      return
    }

    for (const [index, step] of form.steps.entries()) {
      if (!step.messageText.trim()) {
        setError(`A etapa "${stepLabel(step, index)}" precisa de um texto de mensagem`)
        return
      }

      if (!step.isEndStep) {
        if (step.options.length === 0) {
          setError(`A etapa "${stepLabel(step, index)}" não é final, então precisa de pelo menos uma opção`)
          return
        }

        for (const option of step.options) {
          if (!option.label.trim()) {
            setError(`Toda opção da etapa "${stepLabel(step, index)}" precisa de um rótulo`)
            return
          }

          const keywords = option.keywordsText.split(',').map(k => k.trim()).filter(Boolean)
          if (keywords.length === 0) {
            setError(`A opção "${option.label}" precisa de pelo menos uma palavra-chave`)
            return
          }

          if (!option.nextStepClientId) {
            setError(`A opção "${option.label}" precisa apontar pra uma próxima etapa`)
            return
          }
        }
      }
    }

    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        timeoutMinutes: form.timeoutMinutes > 0 ? form.timeoutMinutes : 1440,
        timeoutMessage: form.timeoutMessage.trim() || null,
        steps: form.steps.map(s => ({
          clientId: s.clientId,
          label: s.label.trim() || null,
          messageText: s.messageText.trim(),
          isStartStep: s.isStartStep,
          isEndStep: s.isEndStep,
          invalidAnswerMessage: s.isEndStep ? null : (s.invalidAnswerMessage.trim() || null),
          options: s.isEndStep ? [] : s.options.map(o => ({
            label: o.label.trim(),
            matchKeywords: o.keywordsText.split(',').map(k => k.trim()).filter(Boolean),
            nextStepClientId: o.nextStepClientId,
          })),
        })),
      }

      const method = isNew ? 'POST' : 'PUT'
      const endpoint = isNew ? '/api/chat-flows' : `/api/chat-flows/${id}`
      await apiFetch(endpoint, { method, body: JSON.stringify(payload) })

      navigate('/chatbot')
    } catch (err) {
      setError(err instanceof Error ? err.message : `Falha ao ${isNew ? 'criar' : 'atualizar'} fluxo`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="container"><div className="loading">Carregando...</div></div>

  return (
    <div className="schedule-rule-page container">
      <div className="form-header">
        <h1>{isNew ? 'Novo Fluxo de Chatbot' : 'Editar Fluxo de Chatbot'}</h1>
        <p className="form-subtitle">Monte a árvore de perguntas e respostas — cada opção leva a uma etapa diferente.</p>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit} className="schedule-form">
        <fieldset className="form-section">
          <legend>⚙️ Configurações</legend>

          <div className="config-top-row">
            <div className="form-group config-name-field">
              <label>Nome do Fluxo *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Atendimento inicial"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Timeout de inatividade (minutos)</label>
            <input
              type="number"
              value={form.timeoutMinutes}
              onChange={(e) => setForm(prev => ({ ...prev, timeoutMinutes: Number(e.target.value) || 1440 }))}
              min="1"
            />
            <small>Depois desse tempo sem resposta, a conversa é encerrada — a próxima mensagem começa o fluxo do zero.</small>
          </div>

          <div className="form-group">
            <label>Mensagem ao encerrar por inatividade</label>
            <input
              type="text"
              value={form.timeoutMessage}
              onChange={(e) => setForm(prev => ({ ...prev, timeoutMessage: e.target.value }))}
              placeholder='Padrão: "Atendimento encerrado por inatividade. Se precisar de algo, é só mandar outra mensagem..."'
            />
            <small>Mandada pro contato quando o timeout acima expira, em vez de simplesmente encerrar em silêncio.</small>
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend>🌳 Etapas</legend>
          <small className="messages-hint">
            Clique numa etapa na lateral pra editar. Marque uma etapa como inicial (ponto de entrada) e, pra cada etapa que não seja final, cadastre as opções de resposta que levam à próxima etapa.
          </small>

          <div className="flow-editor-layout">
            <div className="flow-steps-sidebar">
              {form.steps.map((step, index) => (
                <button
                  type="button"
                  key={step.clientId}
                  className={`flow-step-tab ${activeStepClientId === step.clientId ? 'active' : ''}`}
                  onClick={() => setActiveStepClientId(step.clientId)}
                >
                  <span className="flow-step-tab-title">{stepLabel(step, index)}</span>
                  {(step.isStartStep || step.isEndStep) && (
                    <span className="flow-step-tab-badges">
                      {step.isStartStep && <span className="flow-step-badge start">início</span>}
                      {step.isEndStep && <span className="flow-step-badge end">final</span>}
                    </span>
                  )}
                </button>
              ))}
              <button type="button" className="btn btn-secondary btn-sm flow-add-step-btn" onClick={addStep} disabled={submitting}>
                ➕ Adicionar etapa
              </button>
            </div>

            <div className="flow-step-panel">
              {activeStep ? (
                <>
                  <div className="message-block-header">
                    <strong>{stepLabel(activeStep, form.steps.indexOf(activeStep))}</strong>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeStep(activeStep.clientId)}
                      disabled={submitting || form.steps.length === 1}
                    >
                      🗑 Excluir etapa
                    </button>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label style={{ fontSize: '13px' }}>Rótulo (só pra exibição aqui no editor)</label>
                      <input
                        type="text"
                        value={activeStep.label}
                        onChange={(e) => updateStep(activeStep.clientId, { label: e.target.value })}
                        placeholder="Ex: Boas-vindas"
                        disabled={submitting}
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 400 }}>
                        <input
                          type="radio"
                          name="startStep"
                          checked={activeStep.isStartStep}
                          onChange={() => setStartStep(activeStep.clientId)}
                          disabled={submitting}
                        />
                        Etapa inicial
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={activeStep.isEndStep}
                          onChange={(e) => updateStep(activeStep.clientId, { isEndStep: e.target.checked })}
                          disabled={submitting}
                        />
                        Etapa final (encerra a conversa)
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '13px' }}>Mensagem enviada nessa etapa</label>
                    <textarea
                      value={activeStep.messageText}
                      onChange={(e) => updateStep(activeStep.clientId, { messageText: e.target.value })}
                      placeholder="Digite a mensagem que o bot vai mandar..."
                      rows={3}
                      disabled={submitting}
                    />
                  </div>

                  {!activeStep.isEndStep && (
                    <>
                      <div className="form-group">
                        <label style={{ fontSize: '13px' }}>Mensagem quando a resposta não bater com nenhuma opção</label>
                        <input
                          type="text"
                          value={activeStep.invalidAnswerMessage}
                          onChange={(e) => updateStep(activeStep.clientId, { invalidAnswerMessage: e.target.value })}
                          placeholder='Padrão: "Não entendi sua resposta. Por favor, escolha uma das opções."'
                          disabled={submitting}
                        />
                      </div>

                      <div style={{ marginTop: '8px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Opções de resposta</label>
                        {activeStep.options.map((option, optIndex) => (
                          <div key={optIndex} className="schedule-window-card" style={{ marginBottom: '8px', padding: '10px' }}>
                            <div className="form-row">
                              <div className="form-group" style={{ marginBottom: '8px' }}>
                                <label style={{ fontSize: '12px' }}>Rótulo</label>
                                <input
                                  type="text"
                                  value={option.label}
                                  onChange={(e) => updateOption(activeStep.clientId, optIndex, { label: e.target.value })}
                                  placeholder="Ex: Quero agendar"
                                  disabled={submitting}
                                />
                              </div>
                              <div className="form-group" style={{ marginBottom: '8px' }}>
                                <label style={{ fontSize: '12px' }}>Palavras-chave (separadas por vírgula)</label>
                                <input
                                  type="text"
                                  value={option.keywordsText}
                                  onChange={(e) => updateOption(activeStep.clientId, optIndex, { keywordsText: e.target.value })}
                                  placeholder="Ex: 1, sim, quero agendar"
                                  disabled={submitting}
                                />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
                              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                <label style={{ fontSize: '12px' }}>Vai para</label>
                                <select
                                  value={option.nextStepClientId}
                                  onChange={(e) => updateOption(activeStep.clientId, optIndex, { nextStepClientId: e.target.value })}
                                  disabled={submitting}
                                >
                                  <option value="">— Selecione a próxima etapa —</option>
                                  {form.steps.filter(s => s.clientId !== activeStep.clientId).map((target) => (
                                    <option key={target.clientId} value={target.clientId}>
                                      {stepLabel(target, form.steps.indexOf(target))}{target.isEndStep ? ' (final)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => removeOption(activeStep.clientId, optIndex)}
                                disabled={submitting}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => addOption(activeStep.clientId)}
                          disabled={submitting}
                        >
                          ➕ Adicionar opção
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="messages-hint">Nenhuma etapa ainda — clique em "Adicionar etapa" na lateral.</p>
              )}
            </div>
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" disabled={submitting} className="btn btn-primary btn-lg">
            {submitting ? '⏳ Salvando...' : (isNew ? '➕ Criar Fluxo' : '✅ Salvar Alterações')}
          </button>
          <Link to="/chatbot" className="btn btn-secondary btn-lg">
            ❌ Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
