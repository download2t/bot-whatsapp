import { useEffect, useMemo, useState } from 'react'
import { apiFetch, getApiBase, getAuthHeaders } from '../lib/api'
import type { BulkSendStreamEvent, Contato, Turma } from '../types'
import { Card, CardHeader, CardTitle, Badge, EmptyState } from '../components/UI'
import '../styles/modern.css'

type RowStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'

type RowState = {
  status: RowStatus
  statusText: string
}

type SendSummary = {
  sentCount: number
  failedCount: number
  remainingCount: number
  totalCount: number
  aborted: boolean
  abortReason: string | null
}

const DEFAULT_INTERVAL_SECONDS = 60

function getStatusLabel(status: RowStatus): string {
  switch (status) {
    case 'sending':
      return 'Enviando'
    case 'sent':
      return 'Enviado'
    case 'failed':
      return 'Erro'
    case 'skipped':
      return 'Pendente'
    default:
      return 'Aguardando'
  }
}

function getStatusVariant(status: RowStatus): 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'sent':
      return 'success'
    case 'failed':
      return 'danger'
    case 'sending':
      return 'warning'
    case 'skipped':
      return 'info'
    default:
      return 'info'
  }
}

export function BulkMessages() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [selectedTurma, setSelectedTurma] = useState<number | ''>('')
  const [contacts, setContacts] = useState<Contato[]>([])
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({})
  const [greeting, setGreeting] = useState('Bom dia')
  const [message, setMessage] = useState('')
  const [intervalSeconds, setIntervalSeconds] = useState<number>(DEFAULT_INTERVAL_SECONDS)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [rows, setRows] = useState<Record<number, RowState>>({})
  const [summary, setSummary] = useState<SendSummary | null>(null)
  const [currentContactName, setCurrentContactName] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const t = await apiFetch<Turma[]>('/api/turmas')
      setTurmas(t || [])
    })()
  }, [])

  useEffect(() => {
    if (!selectedTurma) {
      setContacts([])
      setSelectedIds({})
      setRows({})
      setSummary(null)
      setCurrentContactName(null)
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
        setRows({})
        setSummary(null)
        setCurrentContactName(null)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao carregar contatos')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [selectedTurma])

  const selectedContacts = useMemo(
    () => contacts.filter(contact => !!selectedIds[contact.id]),
    [contacts, selectedIds]
  )

  const selectedCount = selectedContacts.length

  const toggle = (id: number) => setSelectedIds(s => ({ ...s, [id]: !s[id] }))
  const selectAll = () => {
    const map: Record<number, boolean> = {}
    contacts.forEach(contact => { map[contact.id] = true })
    setSelectedIds(map)
  }
  const deselectAll = () => setSelectedIds({})

  const parseStreamEvent = (line: string): BulkSendStreamEvent | null => {
    try {
      return JSON.parse(line) as BulkSendStreamEvent
    } catch {
      return null
    }
  }

  const applyEvent = (event: BulkSendStreamEvent, selectedContactIds: number[]) => {
    if (event.type === 'sending') {
      if (event.contactId != null) {
        const contact = contacts.find(item => item.id === event.contactId)
        setCurrentContactName(contact?.name ?? event.phoneNumber ?? null)
        setRows(current => ({
          ...current,
          [event.contactId!]: {
            status: 'sending',
            statusText: event.status || 'Enviando mensagem...',
          },
        }))
      }
      setSummary({
        sentCount: event.sentCount,
        failedCount: event.failedCount,
        remainingCount: event.remainingCount,
        totalCount: event.totalCount,
        aborted: false,
        abortReason: null,
      })
      return
    }

    if (event.type === 'result') {
      if (event.contactId != null) {
        setCurrentContactName(null)
        setRows(current => ({
          ...current,
          [event.contactId!]: {
            status: event.success ? 'sent' : 'failed',
            statusText: event.status || (event.success ? 'Mensagem entregue.' : 'Falha no envio.'),
          },
        }))
      }

      setSummary({
        sentCount: event.sentCount,
        failedCount: event.failedCount,
        remainingCount: event.remainingCount,
        totalCount: event.totalCount,
        aborted: false,
        abortReason: null,
      })

      return
    }

    if (event.type === 'aborted') {
      setRows(current => {
        const next = { ...current }
        const skippedIds = selectedContactIds.filter(contactId => !current[contactId] || current[contactId].status === 'pending')

        skippedIds.forEach(contactId => {
          next[contactId] = {
            status: 'skipped',
            statusText: event.abortReason || event.status || 'Envio interrompido por bloqueio do WhatsApp.',
          }
        })

        return next
      })

      setCurrentContactName(null)
      setSummary({
        sentCount: event.sentCount,
        failedCount: event.failedCount,
        remainingCount: event.remainingCount,
        totalCount: event.totalCount,
        aborted: true,
        abortReason: event.abortReason || event.status,
      })
      return
    }

    if (event.type === 'completed') {
      setCurrentContactName(null)
      setSummary({
        sentCount: event.sentCount,
        failedCount: event.failedCount,
        remainingCount: event.remainingCount,
        totalCount: event.totalCount,
        aborted: event.aborted,
        abortReason: event.abortReason || event.status,
      })
    }
  }

  const send = async () => {
    const ids = selectedContacts.map(contact => contact.id)

    if (!selectedTurma || ids.length === 0) {
      alert('Selecione uma turma e pelo menos um contato')
      return
    }

    const initialRows: Record<number, RowState> = {}
    selectedContacts.forEach(contact => {
      initialRows[contact.id] = { status: 'pending', statusText: 'Aguardando envio' }
    })

    setSending(true)
    setRows(initialRows)
    setSummary({
      sentCount: 0,
      failedCount: 0,
      remainingCount: ids.length,
      totalCount: ids.length,
      aborted: false,
      abortReason: null,
    })
    setCurrentContactName(null)

    try {
      const response = await fetch(`${getApiBase()}/api/messages/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          turmaId: selectedTurma,
          contactIds: ids,
          greeting,
          message,
          intervalSeconds,
          streamUpdates: true,
        }),
      })

      if (!response.ok) {
        const errorMessage = await response.text()
        throw new Error(errorMessage || 'Falha ao enviar mensagens')
      }

      if (!response.body) {
        throw new Error('A resposta de progresso não está disponível neste navegador.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()

          if (!trimmedLine) {
            continue
          }

          const event = parseStreamEvent(trimmedLine)
          if (event) {
            applyEvent(event, ids)
          }
        }
      }

      if (buffer.trim()) {
        const finalEvent = parseStreamEvent(buffer.trim())
        if (finalEvent) {
          applyEvent(finalEvent, ids)
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar mensagens')
    } finally {
      setSending(false)
    }
  }

  const processedCount = summary ? summary.sentCount + summary.failedCount : 0
  const progressPercent = summary && summary.totalCount > 0
    ? Math.min(100, Math.round((processedCount / summary.totalCount) * 100))
    : 0

  return (
    <div className="container" style={{ padding: '24px' }}>
      <h1>📤 Enviar Mensagens em Lote</h1>

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
            disabled={sending}
          >
            <option value="">— Selecione uma turma —</option>
            {turmas.filter(turma => turma.isActive).map(turma => (
              <option key={turma.id} value={turma.id}>{turma.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {selectedTurma && (
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
                title="Nenhum contato ativo nesta turma"
                text="Verifique se existem contatos cadastrados e ativos"
              />
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <button className="btn btn-primary btn-sm" onClick={selectAll} disabled={sending}>
                    ✓ Selecionar Todos
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={deselectAll} disabled={sending}>
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
                        disabled={sending}
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
                    onChange={e => setGreeting(e.target.value)}
                    placeholder="Ex: Bom dia, Boa tarde, Olá"
                    disabled={sending}
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Será seguida pelo nome do contato
                  </small>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label htmlFor="intervalSeconds">⏱ Tempo entre envios (segundos)</label>
                  <input
                    id="intervalSeconds"
                    type="number"
                    min={1}
                    step={1}
                    value={intervalSeconds}
                    onChange={e => setIntervalSeconds(Math.max(1, Number(e.target.value) || DEFAULT_INTERVAL_SECONDS))}
                    disabled={sending}
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Padrão: 60 segundos. Use 5, 10, 30, 60 etc.
                  </small>
                </div>

                <div>
                  <label htmlFor="messageBody">📝 Corpo da Mensagem</label>
                  <textarea
                    id="messageBody"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Digite sua mensagem aqui..."
                    style={{ minHeight: '150px' }}
                    disabled={sending}
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Formato final: "[Saudação] [Nome]!\n[Sua mensagem]"
                  </small>
                </div>
              </Card>

              <Card style={{ marginBottom: '24px', backgroundColor: '#f9fafb' }}>
                <CardHeader>
                  <CardTitle>👁️ Prévia da Mensagem</CardTitle>
                </CardHeader>
                <div style={{
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '1px dashed #d1d5db',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  color: '#374151'
                }}>
                  {greeting} João da Silva!
                  {'\n'}
                  {message}
                </div>
              </Card>

              <div style={{ marginBottom: '24px' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={send}
                  disabled={sending}
                  style={{ width: '100%' }}
                >
                  {sending ? '⏳ Enviando...' : '🚀 Enviar Mensagens'} ({selectedCount})
                </button>
              </div>
            </>
          )}
        </>
      )}

      {(sending || summary) && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Progresso do Envio</CardTitle>
          </CardHeader>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
              <span>{processedCount}/{summary?.totalCount || 0} processados</span>
              <span>{progressPercent}%</span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: summary?.aborted ? '#ef4444' : '#10b981',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #10b981' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#065f46' }}>{summary?.sentCount || 0}</div>
              <div style={{ color: '#065f46', fontSize: '14px' }}>Enviados</div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #ef4444' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7f1d1d' }}>{summary?.failedCount || 0}</div>
              <div style={{ color: '#7f1d1d', fontSize: '14px' }}>Falhas</div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #3b82f6' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1e3a8a' }}>{summary?.remainingCount ?? selectedCount}</div>
              <div style={{ color: '#1e3a8a', fontSize: '14px' }}>Restantes</div>
            </div>

            <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #d1d5db' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{intervalSeconds}s</div>
              <div style={{ color: '#374151', fontSize: '14px' }}>Intervalo</div>
            </div>
          </div>

          {currentContactName && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e' }}>
              Enviando agora: {currentContactName}
            </div>
          )}

          {summary?.aborted && summary.abortReason && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #ef4444', color: '#7f1d1d' }}>
              Envio interrompido: {summary.abortReason}
            </div>
          )}

          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {selectedContacts.map(contact => {
                  const row = rows[contact.id] || { status: 'pending' as RowStatus, statusText: 'Aguardando envio' }

                  return (
                    <tr key={contact.id}>
                      <td>{contact.name}</td>
                      <td><code style={{ background: '#f3f4f6', padding: '2px 8px' }}>{contact.phoneNumber}</code></td>
                      <td>
                        <Badge variant={getStatusVariant(row.status)}>
                          {getStatusLabel(row.status)}
                        </Badge>
                      </td>
                      <td style={{ fontSize: '12px', color: '#666' }}>{row.statusText}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setRows({})
                setSummary(null)
                setCurrentContactName(null)
                setGreeting('Bom dia')
                setMessage('')
              }}
              disabled={sending}
            >
              🔄 Limpar resultados
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}