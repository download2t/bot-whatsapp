import { useState } from 'react'
import { apiFetch } from '../lib/api'
import './ProfilePage.css'

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')

    if (newPassword !== confirmPassword) {
      setMessage('A confirmacao da nova senha nao confere.')
      return
    }

    setSaving(true)
    try {
      await apiFetch<null>('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Senha alterada com sucesso.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao alterar senha')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container profile-page">
      <h1>Alterar senha</h1>
      <p className="profile-description">Defina uma nova senha para sua conta.</p>

      <form className="profile-card" onSubmit={handleSave}>
        <label htmlFor="currentPassword">Senha atual</label>
        <input
          id="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />

        <label htmlFor="newPassword">Nova senha</label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          required
        />

        <label htmlFor="confirmPassword">Confirmar nova senha</label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />

        <button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Alterar senha'}</button>
        {message && <p className="profile-message">{message}</p>}
      </form>
    </div>
  )
}
