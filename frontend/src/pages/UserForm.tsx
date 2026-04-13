import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { UserProfile } from '../types'
import './UserForm.css'

export function UserForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    username: '',
    password: '',
    email: '',
    phone: '',
    cpf: '',
    fullName: '',
    title: '',
    notes: ''
  })

  useEffect(() => {
    if (!isNew && id) {
      loadUser(parseInt(id))
    }
  }, [id, isNew])

  const loadUser = async (userId: number) => {
    try {
      setLoading(true)
      const data = await apiFetch<UserProfile>(`/api/users/${userId}`)
      setForm({
        username: data.username,
        password: '',
        email: data.email || '',
        phone: data.phone || '',
        cpf: data.cpf || '',
        fullName: data.fullName || '',
        title: data.title || '',
        notes: data.notes || ''
      })
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Falha ao carregar usuário')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.username.trim()) {
      alert('Digite um nome de usuário')
      return
    }

    if (isNew && !form.password.trim()) {
      alert('Digite uma senha')
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username: form.username.trim(),
            password: form.password.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            cpf: form.cpf.trim() || null,
            fullName: form.fullName.trim() || null,
            title: form.title.trim() || null,
            notes: form.notes.trim() || null
          })
        })
        alert('Usuário criado com sucesso')
      } else {
        await apiFetch(`/api/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            username: form.username.trim(),
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            cpf: form.cpf.trim() || null,
            fullName: form.fullName.trim() || null,
            title: form.title.trim() || null,
            notes: form.notes.trim() || null
          })
        })
        alert('Usuário atualizado com sucesso')
      }
      navigate('/users')
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao salvar usuário')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="container"><div className="loading">Carregando...</div></div>

  return (
    <div className="container">
      <h1>{isNew ? '➕ Novo Usuário' : '✏️ Editar Usuário'}</h1>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="user-form">
        <div className="form-group">
          <label>Nome de Usuário *</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="Digite o nome de usuário"
            disabled={!isNew}
          />
        </div>

        {isNew && (
          <div className="form-group">
            <label>Senha *</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
        )}

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="exemplo@email.com"
          />
        </div>

        <div className="form-group">
          <label>Telefone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="(11) 99999-9999"
          />
        </div>

        <div className="form-group">
          <label>CPF</label>
          <input
            type="text"
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
            placeholder="123.456.789-00"
          />
        </div>

        <div className="form-group">
          <label>Nome Completo</label>
          <input
            type="text"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            placeholder="Digite o nome completo"
          />
        </div>

        <div className="form-group">
          <label>Cargo/Título</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Gerente, Operador"
          />
        </div>

        <div className="form-group">
          <label>Observações</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notas adicionais sobre o usuário"
            rows={4}
          />
        </div>

        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? '⏳ Salvando...' : '💾 Salvar'}
          </button>
          <button type="button" onClick={() => navigate('/users')} className="btn btn-secondary">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
