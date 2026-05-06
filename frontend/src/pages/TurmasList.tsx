import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Turma } from '../types'
import { Card, Badge, EmptyState } from '../components/UI'
import '../styles/modern.css'

export function TurmasList() {
  const [items, setItems] = useState<Turma[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await apiFetch<Turma[]>('/api/turmas')
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
    if (!confirm('Tem certeza que deseja remover esta turma?')) return
    try {
      await apiFetch<void>(`/api/turmas/${id}`, { method: 'DELETE' })
      setItems(items.filter(i => i.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha')
    }
  }

  if (loading) return <div className="container"><div style={{ padding: '40px', textAlign: 'center' }}>⏳ Carregando turmas...</div></div>
  if (error) return <div className="container"><div style={{ padding: '40px', color: '#dc2626' }}>❌ {error}</div></div>

  return (
    <div className="container" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1>🎓 Turmas</h1>
        <button className="btn btn-primary" onClick={() => navigate('/turmas/new')}>
          ➕ Nova Turma
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="📚"
          title="Nenhuma turma cadastrada"
          text="Crie sua primeira turma para começar a organizar contatos"
          action={<button className="btn btn-primary" onClick={() => navigate('/turmas/new')}>Criar Turma</button>}
        />
      ) : (
        <Card>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nome da Turma</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td>
                    <Badge variant={t.isActive ? 'success' : 'danger'}>
                      {t.isActive ? '✅ Ativo' : '❌ Inativo'}
                    </Badge>
                  </td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => navigate(`/turmas/${t.id}/edit`)}
                    >
                      ✏️ Editar
                    </button>
                    <button 
                      className="btn btn-danger btn-sm" 
                      onClick={() => handleDelete(t.id)}
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
