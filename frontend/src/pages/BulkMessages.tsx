import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { BulkCampaign, Contato, Turma } from '../types'
import { Card, CardHeader, CardTitle, EmptyState } from '../components/UI'
import { EmojiPicker } from '../components/EmojiPicker'
import { MediaAttachment, type SelectedMedia } from '../components/MediaAttachment'
import '../styles/modern.css'

const DEFAULT_INTERVAL_SECONDS = 60

export function BulkMessages() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const retryFromId = searchParams.get('retryFrom')

  const [turmas, setTurmas] = useState<Turma[]>([])
  const [selectedTurma, setSelectedTurma] = useState<number | ''>('')
  const [contacts, setContacts] = useState<Contato[]>([])
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({})
  const [greeting, setGreeting] = useState('Bom dia')
  const [message, setMessage] = useState('')
  const [intervalSeconds, setIntervalSeconds] = useState<number>(DEFAULT_INTERVAL_SECONDS)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [media, setMedia] = useState<SelectedMedia | null>(null)
  const [retryNotice, setRetryNotice] = useState<string | null>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)

  const isRetryMode = Boolean(retryFromId)

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

  useEffect(() => {
    void (async () => {
      const t = await apiFetch<Turma[]>('/api/turmas')
      setTurmas(t || [])
    })()
  }, [])

  // Retry mode: pull the original campaign + all owned contacts, then preselect only the
  // recipients that didn't get a "Sent" result last time — still editable by hand, like today.
  useEffect(() => {
    if (!retryFromId) return

    void (async () => {
      setLoading(true)
      try {
        const [campaign, allContacts] = await Promise.all([
          apiFetch<BulkCampaign>(`/api/messages/bulk/${retryFromId}`),
          apiFetch<Contato[]>('/api/contatos'),
        ])

        const contactIds = campaign.items.map((item) => item.contactId)
        const nonSentIds = new Set(
          campaign.items.filter((item) => item.status !== 'Sent').map((item) => item.contactId),
        )

        const relevantContacts = allContacts.filter((c) => contactIds.includes(c.id))
        setContacts(relevantContacts)

        const map: Record<number, boolean> = {}
        relevantContacts.forEach((c) => {
          map[c.id] = nonSentIds.has(c.id)
        })
        setSelectedIds(map)

        setGreeting(campaign.greeting)
        setMessage(campaign.messageTemplate)
        setIntervalSeconds(campaign.intervalSeconds)

        const missing = contactIds.length - relevantContacts.length
        setRetryNotice(
          `Reenviando pendentes/falhas da campanha #${retryFromId}. ` +
          `${nonSentIds.size} de ${relevantContacts.length} contato(s) pré-selecionado(s).` +
          (missing > 0 ? ` ${missing} contato(s) daquela campanha não existem mais e foram ignorados.` : '') +
          (campaign.mediaUrl ? ' Obs.: anexos não são copiados automaticamente — anexe novamente se precisar.' : '')
        )
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao carregar campanha para reenvio')
      } finally {
        setLoading(false)
      }
    })()
  }, [retryFromId])

  useEffect(() => {
    if (isRetryMode || !selectedTurma) {
      if (!isRetryMode) {
        setContacts([])
        setSelectedIds({})
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
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao carregar contatos')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [selectedTurma, isRetryMode])

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

  const send = async () => {
    const ids = selectedContacts.map(contact => contact.id)

    if (ids.length === 0) {
      alert('Selecione pelo menos um contato')
      return
    }

    setSubmitting(true)

    try {
      const campaign = await apiFetch<BulkCampaign>('/api/messages/bulk', {
        method: 'POST',
        body: JSON.stringify({
          turmaId: isRetryMode ? 0 : (selectedTurma || 0),
          contactIds: ids,
          greeting,
          message,
          intervalSeconds,
          mediaBase64: media?.base64 ?? null,
          mediaMimeType: media?.mimeType ?? null,
          mediaFileName: media?.fileName ?? null,
        }),
      })

      navigate(`/messages/bulk/${campaign.id}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar mensagens')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container" style={{ padding: '24px' }}>
      <h1>📤 Enviar Mensagens em Lote</h1>

      {!isRetryMode && (
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
              disabled={submitting}
            >
              <option value="">— Selecione uma turma —</option>
              {turmas.filter(turma => turma.isActive).map(turma => (
                <option key={turma.id} value={turma.id}>{turma.name}</option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {isRetryMode && retryNotice && (
        <div style={{ marginBottom: '24px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid #3b82f6', color: '#1e3a8a', fontSize: '14px' }}>
          {retryNotice}
        </div>
      )}

      {(selectedTurma || isRetryMode) && (
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
                  <button className="btn btn-primary btn-sm" onClick={selectAll} disabled={submitting}>
                    ✓ Selecionar Todos
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={deselectAll} disabled={submitting}>
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
                        disabled={submitting}
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
                    disabled={submitting}
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
                    disabled={submitting}
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Padrão: 60 segundos. Use 5, 10, 30, 60 etc.
                  </small>
                </div>

                <div>
                  <label htmlFor="messageBody">📝 Corpo da Mensagem</label>
                  <textarea
                    id="messageBody"
                    ref={messageRef}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Digite sua mensagem aqui..."
                    style={{ minHeight: '150px' }}
                    disabled={submitting}
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Formato final: "[Saudação] [Nome]!\n[Sua mensagem]"
                  </small>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                    <EmojiPicker onSelect={insertEmoji} disabled={submitting} />
                    <MediaAttachment onChange={setMedia} disabled={submitting} />
                  </div>
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
                {media && (
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {media.previewUrl ? (
                      <img src={media.previewUrl} alt={media.fileName} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                    ) : (
                      <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb', borderRadius: 6, fontSize: 24 }}>📄</div>
                    )}
                    <span style={{ fontSize: '13px', color: '#374151' }}>Anexo: {media.fileName}</span>
                  </div>
                )}
              </Card>

              <div style={{ marginBottom: '24px' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={send}
                  disabled={submitting}
                  style={{ width: '100%' }}
                >
                  {submitting ? '⏳ Iniciando envio...' : '🚀 Enviar Mensagens'} ({selectedCount})
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
