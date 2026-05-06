import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { Card, FormGroup, Alert } from '../components/UI'
import '../styles/modern.css'

export function TurmaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        setLoading(true)
        const items = await apiFetch<any[]>('/api/turmas')
        const found = items.find(i => String(i.id) === id)
        if (found) {
          setName(found.name)
          setIsActive(found.isActive ?? true)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar turma')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id])

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setError(null)
    try {
      setLoading(true)
      if (id) {
        await apiFetch(`/api/turmas/${id}`, { method: 'PUT', body: JSON.stringify({ name, isActive }) })
      } else {
        await apiFetch('/api/turmas', { method: 'POST', body: JSON.stringify({ name, isActive }) })
      }
      navigate('/turmas')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>{id ? '✏️ Editar Turma' : '📝 Nova Turma'}</h1>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <label htmlFor="name">Nome da Turma</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Turma 1, Turma 2"
              required
            />
          </FormGroup>

          <div className="checkbox-group" style={{ marginBottom: '24px' }}>
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
            />
            <label htmlFor="isActive" style={{ margin: 0, fontWeight: 500 }}>
              Turma ativa
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? '⏳ Salvando...' : '💾 Salvar Turma'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => navigate('/turmas')}
              style={{ flex: 1 }}
            >
              ❌ Cancelar
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
