import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { BulkCampaign, BulkCampaignListItem, Contato, Turma } from '../types'
import { Card, CardHeader, CardTitle, EmptyState } from '../components/UI'
import { EmojiPicker } from '../components/EmojiPicker'
import { formatBrazilDateTime, toBrazilWallClock } from '../lib/brazilTime'
import './SimulacaoMensagem.css'

type Mode = 'new' | 'history'

// Mesma composição final usada de verdade em BulkMessages.tsx/BulkMessagesController
// ("[Saudação] [Nome]!\n[Mensagem]") — aqui só é montada localmente, pra cada contato,
// sem nenhuma chamada de envio. Nenhum request de mensagem/campanha é feito nesta tela.
function buildMessageBody(greeting: string, contactName: string, message: string): string {
  return `${greeting} ${contactName}!\n${message}`
}

// Reproduz o formato de export do WhatsApp Web ("[HH:mm, M/D/AAAA] Nome: mensagem" — mesma
// lógica de frontend/src/lib/whatsappExport.ts, mas com mês/dia sem zero à esquerda porque foi
// esse o formato pedido, não o "DD/MM/AAAA" já usado em Documentacao.tsx/Messages.tsx).
function formatTimestampPrefix(date: Date, senderName: string): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()
  return `[${hh}:${mm}, ${month}/${day}/${year}] ${senderName || '—'}: `
}

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHhMm(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return formatBrazilDateTime(value) || '—'
}

export function SimulacaoMensagem() {
  const [searchParams] = useSearchParams()
  const fromCampaignParam = searchParams.get('fromCampaign')

  const [mode, setMode] = useState<Mode>(fromCampaignParam ? 'history' : 'new')

  // Modo "Nova simulação": turma -> contatos ativos dela.
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [selectedTurma, setSelectedTurma] = useState<number | ''>('')

  // Modo "A partir de histórico": escolhe uma campanha já enviada; os contatos e os horários
  // reais de envio vêm dos itens dela (BulkCampaignItem.processedAtUtc), não são inventados.
  const [campaigns, setCampaigns] = useState<BulkCampaignListItem[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | ''>('')
  const [campaignDetail, setCampaignDetail] = useState<BulkCampaign | null>(null)
  const [historyTimestamps, setHistoryTimestamps] = useState<Record<number, string | null>>({})

  const [contacts, setContacts] = useState<Contato[]>([])
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({})
  const [greeting, setGreeting] = useState('Bom dia')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const [simulated, setSimulated] = useState<Contato[] | null>(null)
  const [activeContactId, setActiveContactId] = useState<number | null>(null)
  const [tabFilter, setTabFilter] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Envelope opcional "[HH:mm, M/D/AAAA] Nome: " na frente de cada mensagem simulada. No modo
  // novo o horário avança por progressão manual; no modo histórico usa o horário real de envio.
  const [useTimestamp, setUseTimestamp] = useState(false)
  const [senderName, setSenderName] = useState('')
  const [startDate, setStartDate] = useState(todayIsoDate)
  const [startTime, setStartTime] = useState(nowHhMm)
  const [progressionValue, setProgressionValue] = useState(1)
  const [progressionUnit, setProgressionUnit] = useState<'minutes' | 'seconds'>('minutes')

  const insertEmoji = (emoji: string) => {
    const textarea = messageRef.current
    if (!textarea) {
      setMessage((current) => current + emoji)
      return
    }

    const start = textarea.selectionStart ?? message.length
    const end = textarea.selectionEnd ?? message.length
    const next = message.slice(0, start) + emoji + message.slice(end)
    setMessage(next)

    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + emoji.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  const resetAll = () => {
    setSelectedTurma('')
    setContacts([])
    setSelectedIds({})
    setSimulated(null)
    setSelectedCampaignId('')
    setCampaignDetail(null)
    setHistoryTimestamps({})
  }

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    resetAll()
  }

  useEffect(() => {
    void (async () => {
      const t = await apiFetch<Turma[]>('/api/turmas')
      setTurmas(t || [])
    })()
  }, [])

  useEffect(() => {
    if (mode !== 'history') return
    void (async () => {
      try {
        const data = await apiFetch<BulkCampaignListItem[]>('/api/messages/bulk')
        setCampaigns(data || [])
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao carregar histórico de envios')
      }
    })()
  }, [mode])

  const loadCampaign = async (id: number) => {
    setLoading(true)
    try {
      const campaign = await apiFetch<BulkCampaign>(`/api/messages/bulk/${id}`)
      setCampaignDetail(campaign)
      setGreeting(campaign.greeting)
      setMessage(campaign.messageTemplate)

      const mapped: Contato[] = campaign.items.map(item => ({
        id: item.contactId,
        name: item.contactName,
        phoneNumber: item.phoneNumber,
        turmaId: null,
        isActive: true,
      }))
      setContacts(mapped)

      const selMap: Record<number, boolean> = {}
      const tsMap: Record<number, string | null> = {}
      campaign.items.forEach(item => {
        selMap[item.contactId] = true
        tsMap[item.contactId] = item.processedAtUtc
      })
      setSelectedIds(selMap)
      setHistoryTimestamps(tsMap)
      setUseTimestamp(true)
      setSimulated(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao carregar campanha')
    } finally {
      setLoading(false)
    }
  }

  // Se veio de "🧪 Simular esta campanha" em BulkCampaignDetail.tsx, carrega direto.
  useEffect(() => {
    if (fromCampaignParam) {
      const id = Number(fromCampaignParam)
      if (id) {
        setSelectedCampaignId(id)
        void loadCampaign(id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (mode !== 'new' || !selectedTurma) {
      if (mode === 'new' && !selectedTurma) {
        setContacts([])
        setSelectedIds({})
        setSimulated(null)
      }
      return
    }

    const load = async () => {
      setLoading(true)
      try {
        const c = await apiFetch<Contato[]>(`/api/contatos?turmaId=${selectedTurma}`)
        const activeContacts = (c || []).filter(x => x.isActive)
        setContacts(activeContacts)
        const map: Record<number, boolean> = {}
        activeContacts.forEach(x => { map[x.id] = true })
        setSelectedIds(map)
        setSimulated(null)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao carregar contatos')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [selectedTurma, mode])

  const contactsReady = mode === 'new' ? !!selectedTurma : !!campaignDetail

  const selectedContacts = useMemo(
    () => contacts.filter(contact => !!selectedIds[contact.id]),
    [contacts, selectedIds]
  )

  const selectedCount = selectedContacts.length

  const toggle = (id: number) => {
    setSelectedIds(s => ({ ...s, [id]: !s[id] }))
    setSimulated(null)
  }
  const selectAll = () => {
    const map: Record<number, boolean> = {}
    contacts.forEach(contact => { map[contact.id] = true })
    setSelectedIds(map)
    setSimulated(null)
  }
  const deselectAll = () => {
    setSelectedIds({})
    setSimulated(null)
  }

  const runSimulation = () => {
    if (selectedContacts.length === 0) {
      alert('Selecione pelo menos um contato')
      return
    }

    setSimulated(selectedContacts)
    setActiveContactId(selectedContacts[0].id)
    setTabFilter('')
    setCopiedId(null)
  }

  const filteredTabs = useMemo(() => {
    if (!simulated) return []
    const term = tabFilter.trim().toLowerCase()
    if (!term) return simulated
    return simulated.filter(c => c.name.toLowerCase().includes(term))
  }, [simulated, tabFilter])

  // Índice na ordem em que os contatos foram simulados (não na lista filtrada pela busca) —
  // no modo novo é essa ordem que define quantas "progressões" de tempo já passaram.
  const contactIndex = (contactId: number): number =>
    simulated?.findIndex(c => c.id === contactId) ?? -1

  const timestampForIndex = (index: number): Date => {
    const [year, month, day] = startDate.split('-').map(Number)
    const [hour, minute] = startTime.split(':').map(Number)
    const base = new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0)
    const stepMs = (progressionUnit === 'minutes' ? progressionValue * 60 : progressionValue) * 1000
    return new Date(base.getTime() + index * stepMs)
  }

  // No modo histórico usa o horário REAL de quando aquele item foi processado na campanha
  // original; se nunca chegou a ser processado (ficou Pending/Cancelled), cai pra data de
  // criação da campanha como aproximação.
  const resolveTimestamp = (contact: Contato, index: number): Date | null => {
    if (mode === 'history') {
      const iso = historyTimestamps[contact.id]
      if (iso) return toBrazilWallClock(iso)
      return campaignDetail ? toBrazilWallClock(campaignDetail.createdAtUtc) : null
    }
    return timestampForIndex(index)
  }

  const buildPreview = (contact: Contato, index: number): string => {
    const body = buildMessageBody(greeting, contact.name, message)
    if (!useTimestamp) return body
    const ts = resolveTimestamp(contact, index)
    if (!ts) return body
    return formatTimestampPrefix(ts, senderName) + body
  }

  const activeContact = simulated?.find(c => c.id === activeContactId) ?? null
  const activeText = activeContact ? buildPreview(activeContact, contactIndex(activeContact.id)) : ''

  const handleCopy = async (contact: Contato) => {
    const text = buildPreview(contact, contactIndex(contact.id))
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopiedId(contact.id)
    window.setTimeout(() => setCopiedId(current => (current === contact.id ? null : current)), 1500)
  }

  return (
    <div className="container" style={{ padding: '24px' }}>
      <h1>🧪 Simulação de Mensagem</h1>
      <p style={{ color: '#666', marginTop: '-8px', marginBottom: '16px' }}>
        Monte a mensagem e veja exatamente como ela vai ficar pra cada contato — nada é
        enviado de verdade aqui.
      </p>

      <div className="sim-mode-switch">
        <button
          className={`sim-mode-btn ${mode === 'new' ? 'active' : ''}`}
          onClick={() => switchMode('new')}
        >
          🆕 Nova simulação
        </button>
        <button
          className={`sim-mode-btn ${mode === 'history' ? 'active' : ''}`}
          onClick={() => switchMode('history')}
        >
          📜 A partir de um histórico de envios
        </button>
      </div>

      {mode === 'new' ? (
        <Card style={{ marginBottom: '24px' }}>
          <CardHeader>
            <CardTitle>1️⃣ Selecionar Turma</CardTitle>
          </CardHeader>
          <div>
            <label htmlFor="turmaSelect">🎓 Escolha uma turma:</label>
            <select
              id="turmaSelect"
              value={selectedTurma}
              onChange={e => setSelectedTurma(e.target.value ? Number(e.target.value) : '')}
              style={{ marginBottom: '16px' }}
            >
              <option value="">— Selecione uma turma —</option>
              {turmas.filter(turma => turma.isActive).map(turma => (
                <option key={turma.id} value={turma.id}>{turma.name}</option>
              ))}
            </select>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: '24px' }}>
          <CardHeader>
            <CardTitle>1️⃣ Selecionar campanha do histórico</CardTitle>
          </CardHeader>
          <div>
            <label htmlFor="campaignSelect">🗂️ Escolha uma campanha já enviada:</label>
            <select
              id="campaignSelect"
              value={selectedCampaignId}
              onChange={e => {
                const id = e.target.value ? Number(e.target.value) : ''
                setSelectedCampaignId(id)
                if (id) void loadCampaign(id)
              }}
              style={{ marginBottom: '8px' }}
            >
              <option value="">— Selecione uma campanha —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  #{c.id} · {formatDateTime(c.createdAtUtc)} · {c.totalCount} contato(s) · {c.messageTemplate.slice(0, 40)}
                </option>
              ))}
            </select>
            {campaignDetail && (
              <small style={{ display: 'block', color: '#666' }}>
                Carregado: campanha #{campaignDetail.id}, criada em {formatDateTime(campaignDetail.createdAtUtc)},
                {' '}{campaignDetail.items.length} destinatário(s). A mensagem abaixo já veio pré-preenchida — edite à vontade.
              </small>
            )}
          </div>
        </Card>
      )}

      {contactsReady && (
        <>
          <Card style={{ marginBottom: '24px' }}>
            <CardHeader>
              <CardTitle>2️⃣ Selecionar Contatos ({selectedCount}/{contacts.length})</CardTitle>
            </CardHeader>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>⏳ Carregando contatos...</div>
            ) : contacts.length === 0 ? (
              <EmptyState
                icon="👤"
                title="Nenhum contato encontrado"
                text={mode === 'new' ? 'Verifique se existem contatos cadastrados e ativos' : 'Essa campanha não tem destinatários'}
              />
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button className="btn btn-primary btn-sm" onClick={selectAll}>
                    ✓ Selecionar Todos
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={deselectAll}>
                    ✗ Desselecionar Todos
                  </button>
                </div>

                <div style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '12px'
                }}>
                  {contacts.map(contact => (
                    <div key={contact.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px',
                      borderBottom: '1px solid #f3f4f6'
                    }}>
                      <input
                        type="checkbox"
                        checked={!!selectedIds[contact.id]}
                        onChange={() => toggle(contact.id)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{contact.name}</div>
                        <div style={{ fontSize: '12px', color: '#999' }}>{contact.phoneNumber}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {selectedCount > 0 && (
            <>
              <Card style={{ marginBottom: '24px' }}>
                <CardHeader>
                  <CardTitle>3️⃣ Compor Mensagem</CardTitle>
                </CardHeader>

                <div style={{ marginBottom: '16px' }}>
                  <label htmlFor="greeting">👋 Saudação (padrão: "Bom dia")</label>
                  <input
                    id="greeting"
                    type="text"
                    value={greeting}
                    onChange={e => { setGreeting(e.target.value); setSimulated(null) }}
                    placeholder="Ex: Bom dia, Boa tarde, Olá"
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Será seguida pelo nome de cada contato
                  </small>
                </div>

                <div>
                  <label htmlFor="messageBody">📝 Corpo da Mensagem</label>
                  <textarea
                    id="messageBody"
                    ref={messageRef}
                    value={message}
                    onChange={e => { setMessage(e.target.value); setSimulated(null) }}
                    placeholder="Digite sua mensagem aqui..."
                    style={{ minHeight: '150px' }}
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Formato final: "[Saudação] [Nome]!\n[Sua mensagem]" — igual ao envio em massa
                  </small>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                    <EmojiPicker onSelect={insertEmoji} />
                  </div>
                </div>
              </Card>

              <Card style={{ marginBottom: '24px' }}>
                <CardHeader>
                  <CardTitle>4️⃣ Data e hora (opcional)</CardTitle>
                </CardHeader>

                <div className="sim-checkbox-row">
                  <input
                    type="checkbox"
                    id="useTimestamp"
                    checked={useTimestamp}
                    onChange={e => { setUseTimestamp(e.target.checked); setSimulated(null) }}
                  />
                  <label htmlFor="useTimestamp">
                    Mostrar como conversa exportada — adiciona <code>[HH:mm, M/D/AAAA] Nome:</code> na
                    frente de cada mensagem
                    {mode === 'new'
                      ? ', avançando o horário a cada contato'
                      : ', usando a data/hora reais de quando cada mensagem foi enviada'}
                  </label>
                </div>

                {useTimestamp && (
                  mode === 'history' ? (
                    <div className="sim-timestamp-grid">
                      <div>
                        <label htmlFor="senderName">🧑 Nome de quem envia</label>
                        <input
                          id="senderName"
                          type="text"
                          value={senderName}
                          onChange={e => setSenderName(e.target.value)}
                          placeholder="Ex: Patricia Barros"
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <small style={{ color: '#666' }}>
                          📌 Cada contato mantém o horário real em que recebeu essa mensagem na campanha
                          #{campaignDetail?.id} — não dá pra editar aqui, só a mensagem em si.
                        </small>
                      </div>
                    </div>
                  ) : (
                    <div className="sim-timestamp-grid">
                      <div>
                        <label htmlFor="senderName">🧑 Nome de quem envia</label>
                        <input
                          id="senderName"
                          type="text"
                          value={senderName}
                          onChange={e => setSenderName(e.target.value)}
                          placeholder="Ex: Patricia Barros"
                        />
                      </div>

                      <div>
                        <label htmlFor="startDate">📅 Data inicial</label>
                        <input
                          id="startDate"
                          type="date"
                          value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                        />
                      </div>

                      <div>
                        <label htmlFor="startTime">🕒 Hora inicial</label>
                        <input
                          id="startTime"
                          type="time"
                          value={startTime}
                          onChange={e => setStartTime(e.target.value)}
                        />
                      </div>

                      <div>
                        <label htmlFor="progressionValue">⏩ Progressão entre mensagens</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            id="progressionValue"
                            type="number"
                            min={0}
                            step="0.5"
                            value={progressionValue}
                            onChange={e => setProgressionValue(Math.max(0, Number(e.target.value) || 0))}
                            style={{ flex: 1 }}
                          />
                          <select
                            value={progressionUnit}
                            onChange={e => setProgressionUnit(e.target.value as 'minutes' | 'seconds')}
                            style={{ flex: 1 }}
                          >
                            <option value="minutes">minutos</option>
                            <option value="seconds">segundos</option>
                          </select>
                        </div>
                        <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                          Ex: 1 minuto → 1º contato às {startTime}, 2º às +1min, 3º às +2min...
                        </small>
                      </div>
                    </div>
                  )
                )}
              </Card>

              <div style={{ marginBottom: '24px' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={runSimulation}
                  style={{ width: '100%' }}
                >
                  🔍 Simular ({selectedCount} contato{selectedCount !== 1 ? 's' : ''})
                </button>
              </div>
            </>
          )}
        </>
      )}

      {simulated && (
        <Card style={{ marginBottom: '24px' }}>
          <CardHeader>
            <CardTitle>👁️ Pré-visualização por contato ({simulated.length})</CardTitle>
          </CardHeader>

          <div className="sim-layout">
            <div className="sim-tabs-col">
              {simulated.length > 8 && (
                <input
                  className="sim-tab-filter"
                  placeholder="Buscar contato..."
                  value={tabFilter}
                  onChange={e => setTabFilter(e.target.value)}
                />
              )}
              <div className="sim-tabs">
                {filteredTabs.map(contact => (
                  <button
                    key={contact.id}
                    className={`sim-tab ${activeContactId === contact.id ? 'active' : ''}`}
                    onClick={() => setActiveContactId(contact.id)}
                  >
                    <span className="sim-tab-name">{contact.name}</span>
                    <span className="sim-tab-phone">
                      {useTimestamp
                        ? (resolveTimestamp(contact, contactIndex(contact.id))?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? contact.phoneNumber)
                        : contact.phoneNumber}
                    </span>
                  </button>
                ))}
                {filteredTabs.length === 0 && (
                  <div className="sim-tab-empty">Nenhum contato encontrado.</div>
                )}
              </div>
            </div>

            <div className="sim-panel">
              {activeContact && (
                <>
                  <div className="sim-panel-header">
                    <div>
                      <div className="sim-panel-name">{activeContact.name}</div>
                      <div className="sim-panel-phone">{activeContact.phoneNumber}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(activeContact)}>
                      {copiedId === activeContact.id ? '✅ Copiado!' : '📋 Copiar mensagem'}
                    </button>
                  </div>
                  <div className="sim-panel-text">{activeText}</div>
                </>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
