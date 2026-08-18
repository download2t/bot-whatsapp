import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { MessageLog, PagedMessageLog } from '../types'
import { Card, EmptyState } from '../components/UI'
import '../styles/modern.css'

// Local helpers - keeps this page self-contained instead of pulling in Documentacao's
// yyyy-MM-dd-in-local-time logic, which is built around grouping by conversation, not filtering.
function todayIsoDate(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR')
}

export function AutomaticMessages() {
  const [startDate, setStartDate] = useState(todayIsoDate())
  const [endDate, setEndDate] = useState(todayIsoDate())
  const [phoneFilter, setPhoneFilter] = useState('')
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        direction: 'Outgoing',
        isAutomatic: 'true',
        sortBy: 'timestamp',
        sortOrder: 'desc',
        pageSize: '500',
      })
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (phoneFilter.trim()) params.set('phoneNumber', phoneFilter.trim())

      const data = await apiFetch<PagedMessageLog>(`/api/messages/search?${params.toString()}`)
      setMessages(data.items || [])
      setTotalCount(data.totalCount || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar mensagens automáticas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFilter = (event: React.FormEvent) => {
    event.preventDefault()
    void load()
  }

  return (
    <div className="container" style={{ padding: '24px' }}>
      <h1>🤖 Mensagens Automáticas</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Só as mensagens que o bot mandou sozinho, disparadas por alguma das Regras de Negócio — não inclui mensagens
        manuais nem envios em massa. Use o filtro de data para conferir o que foi enviado em um dia específico.
      </p>

      <Card style={{ marginBottom: '20px' }}>
        <form onSubmit={handleFilter} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>De</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Até</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' }}>Telefone (opcional)</label>
            <input
              type="text"
              placeholder="Filtrar por número..."
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary">Filtrar</button>
        </form>
      </Card>

      {error && (
        <Card style={{ marginBottom: '20px', color: '#b91c1c' }}>{error}</Card>
      )}

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>⏳ Carregando...</div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon="📭"
            title="Nenhuma mensagem automática no período"
            text="Ajuste as datas ou o telefone para ver outras mensagens enviadas pelo bot."
          />
        ) : (
          <>
            <p style={{ color: '#666', marginBottom: '12px', fontSize: '13px' }}>
              {totalCount} mensagem(ns) automática(s) encontrada(s).
            </p>
            <div style={{ maxHeight: '650px', overflowY: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Contato</th>
                    <th>Telefone</th>
                    <th>Mensagem</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((msg) => (
                    <tr key={msg.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '13px', color: '#666' }}>{formatDateTime(msg.timestampUtc)}</td>
                      <td>{msg.contactName || '—'}</td>
                      <td>{msg.phoneNumber}</td>
                      <td style={{ maxWidth: '420px' }}>{msg.content}</td>
                      <td style={{ fontSize: '13px' }}>{msg.ackStatus || msg.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
