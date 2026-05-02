import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { WhitelistItem } from '../types'
import './Whitelist.css'

const formatBrazilTime = (utcDate: string): string => {
  const date = new Date(utcDate)
  // Brasília é UTC-3
  const brazilDate = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  const day = String(brazilDate.getUTCDate()).padStart(2, '0')
  const month = String(brazilDate.getUTCMonth() + 1).padStart(2, '0')
  const year = brazilDate.getUTCFullYear()
  const hours = String(brazilDate.getUTCHours()).padStart(2, '0')
  const minutes = String(brazilDate.getUTCMinutes()).padStart(2, '0')
  const seconds = String(brazilDate.getUTCSeconds()).padStart(2, '0')
  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`
}

export function Whitelist() {
  const [items, setItems] = useState<WhitelistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newNumber, setNewNumber] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editNumber, setEditNumber] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const loadWhitelist = async () => {
    try {
      setLoading(true)
      const data = await apiFetch<WhitelistItem[]>('/api/whitelist')
      setItems(data || [])
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Falha ao carregar whitelist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWhitelist()
  }, [])

  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNumber.trim()) {
      alert('Digite um número de telefone')
      return
    }

    setAdding(true)
    try {
      const newItem = await apiFetch<WhitelistItem>('/api/whitelist', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: newNumber.trim(), name: newName.trim() })
      })
      setItems([...items, newItem])
      setNewNumber('')
      setNewName('')
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao adicionar número')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este número?')) return

    try {
      await apiFetch<null>(`/api/whitelist/${id}`, {
        method: 'DELETE'
      })
      setItems(items.filter(item => item.id !== id))
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao remover número')
    }
  }

  const startEdit = (item: WhitelistItem) => {
    setEditingId(item.id)
    setEditName(item.name ?? '')
    setEditNumber(item.phoneNumber)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditNumber('')
  }

  const saveEdit = async (id: number) => {
    if (!editNumber.trim()) {
      alert('Digite um número de telefone')
      return
    }

    setSavingEdit(true)
    try {
      const updated = await apiFetch<WhitelistItem>(`/api/whitelist/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ phoneNumber: editNumber.trim(), name: editName.trim() })
      })

      setItems((previous) => previous.map((item) => (item.id === id ? updated : item)))
      cancelEdit()
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao editar contato')
    } finally {
      setSavingEdit(false)
    }
  }

  const filteredItems = items.filter((item) => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) return true

    const name = (item.name ?? '').toLowerCase()
    const phone = item.phoneNumber.toLowerCase()
    return name.includes(normalizedSearch) || phone.includes(normalizedSearch)
  })

  if (loading) return <div className="container"><div className="loading">Carregando...</div></div>
  if (error) return <div className="container"><div className="error">{error}</div></div>

  return (
    <div className="container">
      <h1>📋 Whitelist de Números</h1>
      <p className="description">
        Números na whitelist não receberão mensagens automáticas
      </p>

      <form onSubmit={handleAddNumber} className="add-form">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do contato"
          className="input-name"
        />
        <input
          type="tel"
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="Digite o número (com código de país, ex: 5545991459842)"
          className="input-number"
        />
        <button type="submit" disabled={adding} className="btn btn-primary">
          {adding ? '⏳ Adicionando...' : '➕ Adicionar'}
        </button>
      </form>

      <div className="search-box">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou número"
          className="input-search"
        />
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum número na whitelist</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum contato encontrado para a busca informada</p>
        </div>
      ) : (
        <div className="whitelist-list">
          {filteredItems.map((item) => (
            <div key={item.id} className="whitelist-item">
              {editingId === item.id ? (
                <div className="edit-form">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nome do contato"
                    className="input-name"
                  />
                  <input
                    type="tel"
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    placeholder="Número do contato"
                    className="input-number"
                  />
                </div>
              ) : (
                <div className="item-info">
                  <div className="item-name">{item.name || 'Sem nome'}</div>
                  <div className="item-number">{item.phoneNumber}</div>
                  <div className="item-date">
                    Adicionado em {formatBrazilTime(item.createdAtUtc)}
                  </div>
                </div>
              )}

              <div className="item-actions">
                {editingId === item.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(item.id)}
                      className="btn btn-sm btn-primary"
                      disabled={savingEdit}
                    >
                      {savingEdit ? '⏳ Salvando...' : '💾 Salvar'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="btn btn-sm"
                      disabled={savingEdit}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(item)}
                      className="btn btn-sm btn-secondary"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="btn btn-sm btn-danger"
                    >
                      🗑️ Remover
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
