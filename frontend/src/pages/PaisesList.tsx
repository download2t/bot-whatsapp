import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Pais } from '../types'
import { Card, Badge, EmptyState } from '../components/UI'
import '../styles/modern.css'

export function PaisesList() {
  const [items, setItems] = useState<Pais[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await apiFetch<Pais[]>('/api/paises')
        setItems(data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este país?')) return
    try {
      await apiFetch<void>(`/api/paises/${id}`, { method: 'DELETE' })
      setItems(items.filter(i => i.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha')
    }
  }

  if (loading) return <div className="container"><div style={{ padding: '40px', textAlign: 'center' }}>⏳ Carregando países...</div></div>
  if (error) return <div className="container"><div style={{ padding: '40px', color: '#dc2626' }}>❌ {error}</div></div>

  return (
    <div className="container" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1>🌎 Países</h1>
        <p style={{ color: '#666', marginBottom: '12px' }}>
          Cadastre os países (com DDI) dos seus contatos para vincular mensagens automáticas específicas por país nas Regras de Negócio.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/paises/new')}>
          ➕ Novo País
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="🌎"
          title="Nenhum país cadastrado"
          text="Cadastre países (ex: Brasil = 55) para segmentar mensagens automáticas por DDI"
          action={<button className="btn btn-primary" onClick={() => navigate('/paises/new')}>Cadastrar País</button>}
        />
      ) : (
        <Card>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>DDI</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td><code style={{ background: '#f3f4f6', padding: '2px 8px' }}>+{p.ddi}</code></td>
                  <td>
                    <Badge variant={p.isActive ? 'success' : 'danger'}>
                      {p.isActive ? '✅ Ativo' : '❌ Inativo'}
                    </Badge>
                  </td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/paises/${p.id}/edit`)}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(p.id)}
                    >
                      🗑️ Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
