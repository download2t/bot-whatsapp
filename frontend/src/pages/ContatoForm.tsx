import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Turma } from '../types'
import { Card, FormGroup, Alert } from '../components/UI'
import '../styles/modern.css'

export function ContatoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [turmaId, setTurmaId] = useState<number | ''>('')
  const [isActive, setIsActive] = useState(true)
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const t = await apiFetch<Turma[]>('/api/turmas')
        setTurmas(t || [])

        if (id) {
          const all = await apiFetch<any[]>('/api/contatos')
          const found = all.find(i => String(i.id) === id)
          if (found) {
            setName(found.name)
            setPhone(found.phoneNumber)
            setTurmaId(found.turmaId ?? '')
            setIsActive(found.isActive ?? true)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
      }
    }

    void load()
  }, [id])

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setError(null)
    try {
      setLoading(true)
      const payload = { name, phoneNumber: phone, turmaId: turmaId === '' ? null : turmaId, isActive }
      if (id) await apiFetch(`/api/contatos/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      else await apiFetch('/api/contatos', { method: 'POST', body: JSON.stringify(payload) })
      navigate('/contatos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>{id ? '✏️ Editar Contato' : '📝 Novo Contato'}</h1>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <label htmlFor="name">👤 Nome do Contato</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Digite o nome completo"
              required
            />
          </FormGroup>

          <FormGroup>
            <label htmlFor="phone">📱 Número de Telefone</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999 ou +55..."
              required
            />
          </FormGroup>

          <FormGroup>
            <label htmlFor="turma">🎓 Turma (opcional)</label>
            <select id="turma" value={turmaId} onChange={e => setTurmaId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Nenhuma turma</option>
              {turmas.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {!t.isActive && '(Inativo)'}
                </option>
              ))}
            </select>
          </FormGroup>

          <div className="checkbox-group" style={{ marginBottom: '24px' }}>
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
            />
            <label htmlFor="isActive" style={{ margin: 0, fontWeight: 500 }}>
              Contato ativo
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? '⏳ Salvando...' : '💾 Salvar Contato'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => navigate('/contatos')}
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
