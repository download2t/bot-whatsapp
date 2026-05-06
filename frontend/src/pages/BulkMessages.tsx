import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { Contato, Turma } from '../types'
import { Card, CardHeader, CardTitle, Badge, EmptyState } from '../components/UI'
import '../styles/modern.css'

export function BulkMessages() {
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [selectedTurma, setSelectedTurma] = useState<number | ''>('')
  const [contacts, setContacts] = useState<Contato[]>([])
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({})
  const [greeting, setGreeting] = useState('Bom dia')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<any[] | null>(null)
  const [resultsSummary, setResultsSummary] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 })

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
      return
    }

    const load = async () => {
      setLoading(true)
      try {
        const c = await apiFetch<Contato[]>(`/api/contatos?turmaId=${selectedTurma}`)
        const activeContacts = (c || []).filter(x => x.isActive)
        setContacts(activeContacts)
        const map: Record<number, boolean> = {}
        activeContacts.forEach(x => map[x.id] = true)
        setSelectedIds(map)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao carregar contatos')
      } finally { 
        setLoading(false) 
      }
    }

    void load()
  }, [selectedTurma])

  const toggle = (id: number) => setSelectedIds(s => ({ ...s, [id]: !s[id] }))
  const selectAll = () => {
    const map: Record<number, boolean> = {}
    contacts.forEach(c => map[c.id] = true)
    setSelectedIds(map)
  }
  const deselectAll = () => setSelectedIds({})

  const selectedCount = Object.values(selectedIds).filter(Boolean).length

  const send = async () => {
    const ids = Object.keys(selectedIds).filter(k => selectedIds[Number(k)]).map(k => Number(k))
    if (!selectedTurma || ids.length === 0) { 
      alert('Selecione uma turma e pelo menos um contato') 
      return 
    }
    try {
      setSending(true)
      const res = await apiFetch<any[]>('/api/messages/bulk', { 
        method: 'POST', 
        body: JSON.stringify({ turmaId: selectedTurma, contactIds: ids, greeting, message }) 
      })
      setResults(res)
      const summary = res.reduce((acc, r) => ({
        success: acc.success + (r.success ? 1 : 0),
        failed: acc.failed + (r.success ? 0 : 1)
      }), { success: 0, failed: 0 })
      setResultsSummary(summary)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao enviar mensagens')
    } finally { 
      setSending(false) 
    }
  }

  return (
    <div className="container" style={{ padding: '24px' }}>
      <h1>📤 Enviar Mensagens em Lote</h1>

      {/* Step 1: Select Turma */}
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
            {turmas.filter(t => t.isActive).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {selectedTurma && (
        <>
          {/* Step 2: Select Contacts */}
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
                  {contacts.map(c => (
                    <div key={c.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px',
                      borderBottom: '1px solid #f3f4f6'
                    }}>
                      <input
                        type="checkbox"
                        checked={!!selectedIds[c.id]}
                        onChange={() => toggle(c.id)}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>{c.name}</div>
                        <div style={{ fontSize: '12px', color: '#999' }}>{c.phoneNumber}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {selectedCount > 0 && (
            <>
              {/* Step 3: Compose Message */}
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
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Será seguida pelo nome do contato
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
                  />
                  <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
                    Formato final: "[Saudação] [Nome]!\n[Sua mensagem]"
                  </small>
                </div>
              </Card>

              {/* Preview */}
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

              {/* Send Button */}
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

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>📊 Resultados do Envio</CardTitle>
          </CardHeader>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              padding: '16px',
              backgroundColor: '#d1fae5',
              borderRadius: '8px',
              border: '1px solid #10b981'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#065f46' }}>
                {resultsSummary.success}
              </div>
              <div style={{ color: '#065f46', fontSize: '14px' }}>Enviados com sucesso</div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#fee2e2',
              borderRadius: '8px',
              border: '1px solid #ef4444'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7f1d1d' }}>
                {resultsSummary.failed}
              </div>
              <div style={{ color: '#7f1d1d', fontSize: '14px' }}>Falhas no envio</div>
            </div>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>Contato #{r.contactId}</td>
                    <td><code style={{ background: '#f3f4f6', padding: '2px 8px' }}>{r.phoneNumber}</code></td>
                    <td>
                      <Badge variant={r.success ? 'success' : 'danger'}>
                        {r.success ? '✅ Enviado' : '❌ Erro'}
                      </Badge>
                    </td>
                    <td style={{ fontSize: '12px', color: '#666' }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px' }}>
            <button className="btn btn-secondary" onClick={() => { setResults(null); setGreeting('Bom dia'); setMessage(''); setSelectedIds({}); }}>
              🔄 Enviar Novamente
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
