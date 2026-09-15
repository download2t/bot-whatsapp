import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { Contato, Turma } from '../types'
import { Card, CardHeader, CardTitle, EmptyState } from '../components/UI'
import { EmojiPicker } from '../components/EmojiPicker'
import './SimulacaoMensagem.css'

// Mesma composição final usada de verdade em BulkMessages.tsx/BulkMessagesController
// ("[Saudação] [Nome]!\n[Mensagem]") — aqui só é montada localmente, pra cada contato,
// sem nenhuma chamada de envio. Nenhum request de mensagem/campanha é feito nesta tela.
function buildPreview(greeting: string, contactName: string, message: string): string {
  return `${greeting} ${contactName}!\n${message}`
}

export function SimulacaoMensagem() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [selectedTurma, setSelectedTurma] = useState<number | ''>('')
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

  useEffect(() => {
    if (!selectedTurma) {
      setContacts([])
      setSelectedIds({})
      setSimulated(null)
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
  }, [selectedTurma])

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

  const activeContact = simulated?.find(c => c.id === activeContactId) ?? null
  const activeText = activeContact ? buildPreview(greeting, activeContact.name, message) : ''

  const handleCopy = async (contact: Contato) => {
    const text = buildPreview(greeting, contact.name, message)
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
      <p style={{ color: '#666', marginTop: '-8px', marginBottom: '24px' }}>
        Monte a mensagem e veja exatamente como ela vai ficar pra cada contato da turma — nada é
        enviado de verdade aqui.
      </p>

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
                    <span className="sim-tab-phone">{contact.phoneNumber}</span>
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
