import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Pais } from '../types'
import { Card, FormGroup, Alert } from '../components/UI'
import '../styles/modern.css'

export function PaisForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [ddi, setDdi] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        setLoading(true)
        const items = await apiFetch<Pais[]>('/api/paises')
        const found = items.find(i => String(i.id) === id)
        if (found) {
          setName(found.name)
          setDdi(found.ddi)
          setIsActive(found.isActive)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar país')
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
      const payload = { name, ddi, isActive }
      if (id) {
        await apiFetch(`/api/paises/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await apiFetch('/api/paises', { method: 'POST', body: JSON.stringify(payload) })
      }
      navigate('/paises')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>{id ? '✏️ Editar País' : '📝 Novo País'}</h1>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <label htmlFor="name">Nome do País</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Brasil, Moçambique, Angola, Portugal, Cabo Verde"
              required
            />
          </FormGroup>

          <FormGroup>
            <label htmlFor="ddi">DDI (código do país, só números)</label>
            <input
              id="ddi"
              type="text"
              inputMode="numeric"
              value={ddi}
              onChange={e => setDdi(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex: 55, 258, 244, 351, 238"
              maxLength={4}
              required
            />
            <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
              Sem o "+". Usado para identificar automaticamente o país de quem está enviando a mensagem.
            </small>
          </FormGroup>

          <div className="checkbox-group" style={{ marginBottom: '24px' }}>
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
            />
            <label htmlFor="isActive" style={{ margin: 0, fontWeight: 500 }}>
              País ativo
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? '⏳ Salvando...' : '💾 Salvar País'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => navigate('/paises')}
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
