import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import type { CalendarPerson } from '../../types'

export function CalendarPersonForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [age, setAge] = useState<number | null>(null)

  const [form, setForm] = useState({
    name: '',
    birthDate: '',
    phoneNumber: '',
    email: '',
    notes: '',
    isActive: true,
  })

  useEffect(() => {
    if (!isNew && id) {
      void loadPerson(parseInt(id))
    }
  }, [id, isNew])

  const loadPerson = async (personId: number) => {
    try {
      setLoading(true)
      const data = await apiFetch<CalendarPerson>(`/api/calendar/people/${personId}`)
      setForm({
        name: data.name,
        birthDate: data.birthDate ?? '',
        phoneNumber: data.phoneNumber ?? '',
        email: data.email ?? '',
        notes: data.notes ?? '',
        isActive: data.isActive,
      })
      setAge(data.age)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar pessoa')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      alert('Digite o nome')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        birthDate: form.birthDate || null,
        phoneNumber: form.phoneNumber.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
      }

      if (isNew) {
        await apiFetch('/api/calendar/people', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await apiFetch(`/api/calendar/people/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      }

      navigate('/pessoas')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar pessoa')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    if (!confirm('Excluir esta pessoa? Lembretes vinculados perdem o vínculo, mas continuam existindo.')) return

    try {
      await apiFetch(`/api/calendar/people/${id}`, { method: 'DELETE' })
      navigate('/pessoas')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir pessoa')
    }
  }

  if (loading) return <div className="cal-loading">Carregando...</div>

  return (
    <div>
      <a className="cal-back-link" onClick={() => navigate('/pessoas')}>‹ Pessoas</a>
      <h2 className="cal-page-title">{isNew ? 'Nova pessoa' : 'Editar pessoa'}</h2>

      {error && <div className="cal-error">{error}</div>}

      <form className="cal-form" onSubmit={handleSubmit}>
        <div>
          <label>Nome *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome completo"
          />
        </div>

        <div>
          <label>Data de nascimento{age !== null ? ` (${age} anos)` : ''}</label>
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          />
        </div>

        <div>
          <label>Telefone</label>
          <input
            type="tel"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="(45) 99999-9999"
          />
        </div>

        <div>
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="exemplo@email.com"
          />
        </div>

        <div>
          <label>Notas</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Observações..."
          />
        </div>

        <div className="cal-checkbox-row">
          <input
            type="checkbox"
            id="cal-person-active"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          <label htmlFor="cal-person-active">Ativo</label>
        </div>

        <div className="cal-form-actions">
          <button type="submit" className="cal-btn cal-btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" className="cal-btn cal-btn-secondary" onClick={() => navigate('/pessoas')}>
            Cancelar
          </button>
        </div>

        {!isNew && (
          <button type="button" className="cal-btn cal-btn-danger" onClick={handleDelete}>
            Excluir pessoa
          </button>
        )}
      </form>
    </div>
  )
}
