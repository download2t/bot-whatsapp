import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { UserProfile } from '../types'
import './ProfilePage.css'

export function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    username: '',
    email: '',
    phone: '',
    cpf: '',
    fullName: '',
    title: 'Operador'
  })

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<UserProfile>('/api/auth/me')
        setForm({
          username: me.username,
          email: me.email || '',
          phone: me.phone || '',
          cpf: me.cpf || '',
          fullName: me.fullName || '',
          title: me.title === 'Gestor' ? 'Gestor' : 'Operador'
        })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar perfil')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const updated = await apiFetch<UserProfile>('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          username: form.username.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          cpf: form.cpf.trim() || null,
          fullName: form.fullName.trim() || null
        })
      })
      setForm({
        username: updated.username,
        email: updated.email || '',
        phone: updated.phone || '',
        cpf: updated.cpf || '',
        fullName: updated.fullName || '',
        title: updated.title === 'Gestor' ? 'Gestor' : 'Operador'
      })
      localStorage.setItem('bot_user', updated.username)
      setMessage('Perfil atualizado com sucesso.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar perfil')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="container"><div className="loading">Carregando perfil...</div></div>
  }

  return (
    <div className="container profile-page">
      <h1>👤 Meu Perfil</h1>
      <p className="profile-description">Atualize suas informações de acesso e perfil</p>

      <form className="profile-card" onSubmit={handleSave}>
        <div className="form-group">
          <label>Nome de Usuário</label>
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="seu@email.com"
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
            placeholder="Digite seu nome completo"
          />
        </div>

        <div className="form-group">
          <label>Cargo/Título</label>
          <input
            type="text"
            value={form.title}
            disabled
            readOnly
          />
        </div>

        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? '⏳ Salvando...' : '💾 Salvar Alterações'}
          </button>
        </div>

        {message && <p className="profile-message">{message}</p>}
      </form>
    </div>
  )
}
