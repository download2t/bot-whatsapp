import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, getApiBase } from '../lib/api'
import type { MessageLog, PagedMessageLog, WhatsAppFilterOptions } from '../types'
import './Messages.css'

export function Messages() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<MessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [whatsAppOptions, setWhatsAppOptions] = useState<string[]>([])
  const [selectedWhatsAppNumber, setSelectedWhatsAppNumber] = useState('')
  
  // Inputs temporários (do form)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // Filtros aplicados (para busca efetiva)
  const [appliedPhoneNumber, setAppliedPhoneNumber] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState('')
  const [appliedEndDate, setAppliedEndDate] = useState('')
  const [sortBy, setSortBy] = useState<'timestamp' | 'phone' | 'direction'>('timestamp')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    const loadWhatsAppOptions = async () => {
      try {
        const options = await apiFetch<WhatsAppFilterOptions>('/api/messages/whatsapp-options')
        const numbers = options.numbers || []
        setWhatsAppOptions(numbers)
      } catch {
        // optional metadata endpoint
      }
    }

    void loadWhatsAppOptions()
  }, [])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const handleFilter = () => {
    setAppliedPhoneNumber(phoneNumber)
    setAppliedStartDate(startDate)
    setAppliedEndDate(endDate)
    setPage(1)
  }

  const clearFields = () => {
    setPhoneNumber('')
    setStartDate('')
    setEndDate('')
  }

  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('pageSize', String(pageSize))

        if (filter === 'incoming') {
          params.set('direction', 'Incoming')
        }

        if (filter === 'outgoing') {
          params.set('direction', 'Outgoing')
        }

        if (appliedPhoneNumber.trim()) {
          params.set('phoneNumber', appliedPhoneNumber.trim())
        }

        if (selectedWhatsAppNumber.trim()) {
          params.set('whatsAppNumber', selectedWhatsAppNumber.trim())
        }

        if (appliedStartDate) {
          params.set('startDate', appliedStartDate)
        }

        if (appliedEndDate) {
          params.set('endDate', appliedEndDate)
        }

        params.set('sortBy', sortBy)
        params.set('sortOrder', sortOrder)

        const data = await apiFetch<PagedMessageLog>(`/api/messages/search?${params.toString()}`)
        setMessages(data.items || [])
        setTotalCount(data.totalCount || 0)
        setError(null)
      } catch (err) {
        console.error('Erro:', err)
        setError('Falha ao carregar mensagens')
      } finally {
        setLoading(false)
      }
    }

    loadMessages()
  }, [filter, appliedPhoneNumber, appliedStartDate, appliedEndDate, selectedWhatsAppNumber, sortBy, sortOrder, page, pageSize])

  const downloadCsv = async () => {
    try {
      const params = new URLSearchParams()

      if (filter === 'incoming') {
        params.set('direction', 'Incoming')
      }

      if (filter === 'outgoing') {
        params.set('direction', 'Outgoing')
      }

      if (appliedPhoneNumber.trim()) {
        params.set('phoneNumber', appliedPhoneNumber.trim())
      }

      if (selectedWhatsAppNumber.trim()) {
        params.set('whatsAppNumber', selectedWhatsAppNumber.trim())
      }

      if (appliedStartDate) {
        params.set('startDate', appliedStartDate)
      }

      if (appliedEndDate) {
        params.set('endDate', appliedEndDate)
      }

      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)

      const response = await fetch(`${getApiBase()}/api/messages/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('bot_jwt') ?? ''}`,
        },
      })

      if (!response.ok) {
        throw new Error('Falha ao exportar CSV')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `messages-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao exportar CSV')
    }
  }

  const resetFilters = () => {
    setFilter('all')
    setPhoneNumber('')
    setStartDate('')
    setEndDate('')
    setAppliedPhoneNumber('')
    setAppliedStartDate('')
    setAppliedEndDate('')
    setSelectedWhatsAppNumber('')
    setSortBy('timestamp')
    setSortOrder('desc')
    setPage(1)
  }

  if (loading) return <div className="container"><div className="loading">Carregando mensagens...</div></div>
  if (error) return <div className="container"><div className="error">{error}</div></div>

  return (
    <div className="container">
      <h1>📱 Histórico de Mensagens</h1>

      <div className="filter-buttons">
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
        >
          Todas ({messages.length})
        </button>
        <button
          className={`btn ${filter === 'incoming' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('incoming')}
        >
          📲 Recebidas ({messages.filter(m => m.direction === 'Incoming').length})
        </button>
        <button
          className={`btn ${filter === 'outgoing' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('outgoing')}
        >
          📤 Enviadas ({messages.filter(m => m.direction === 'Outgoing').length})
        </button>
        <button className="btn btn-secondary" onClick={resetFilters}>
          Limpar filtros
        </button>
      </div>

      <div className="message-filters">
        <input
          type="text"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
          placeholder="Filtrar por número"
          className="filter-input"
        />
        <input
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="filter-input"
        />
        <input
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          className="filter-input"
        />
        <button className="btn btn-primary" onClick={handleFilter}>
          🔍 Filtrar
        </button>
        <select
          value={selectedWhatsAppNumber}
          onChange={(event) => setSelectedWhatsAppNumber(event.target.value)}
          className="filter-input"
        >
          <option value="">Todos os numeros WhatsApp</option>
          {whatsAppOptions.map((number) => (
            <option key={number} value={number}>{number}</option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={clearFields}>
          ✕ Limpar campos
        </button>
      </div>

      <div className="pagination-summary">
        Mostrando {messages.length} de {totalCount} mensagens
      </div>

      <div className="message-actions">
        <button className="btn btn-primary" onClick={() => navigate('/messages/bulk')}>
          Enviar mensagens em lote
        </button>
        <button className="btn btn-secondary" onClick={() => void downloadCsv()}>
          Exportar CSV
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="empty-state">
          <p>Nenhuma mensagem encontrada</p>
        </div>
      ) : (
        <div className="messages-table">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Número</th>
                <th>WhatsApp</th>
                <th>Mensagem</th>
                <th>Status</th>
                <th>Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <tr key={msg.id} className={`row-${msg.direction.toLowerCase()}`}>
                  <td>
                    <span className={`badge ${msg.direction.toLowerCase()}`}>
                      {msg.direction === 'Incoming' ? '📲 Recebida' : '📤 Enviada'}
                    </span>
                  </td>
                  <td className="phone"><strong>{msg.phoneNumber}</strong></td>
                  <td className="phone">{msg.whatsAppNumber || '-'}</td>
                  <td className="message">{msg.content}</td>
                  <td>
                    <span className={`status ${msg.status.toLowerCase()}`}>
                      {msg.status}
                    </span>
                  </td>
                  <td className="date">
                    {new Date(msg.timestampUtc).toLocaleString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination-controls">
        <button className="btn btn-secondary" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
          Anterior
        </button>
        <span className="pagination-info">Página {page} de {totalPages}</span>
        <button className="btn btn-secondary" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>
          Próxima
        </button>
      </div>
    </div>
  )
}
