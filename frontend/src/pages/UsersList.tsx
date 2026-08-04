import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { UserListItem } from '../types'
import { Badge } from '../components/UI'
import '../styles/modern.css'
import './UsersList.css'

export function UsersList() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentUsername = localStorage.getItem('bot_user')

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await apiFetch<UserListItem[]>('/api/users')
      setUsers(data || [])
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Falha ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este usuário?')) return

    try {
      await apiFetch<null>(`/api/users/${id}`, {
        method: 'DELETE'
      })
      setUsers(users.filter(u => u.id !== id))
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao deletar usuário')
    }
  }

  const handleToggleActive = async (user: UserListItem) => {
    const nextActive = !user.isActive
    if (nextActive === false && !confirm(`Desativar "${user.username}"? A sessão dele será encerrada imediatamente.`)) {
      return
    }

    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          username: user.username,
          email: user.email,
          phone: user.phone,
          fullName: user.fullName,
          isAdmin: user.isAdmin,
          isActive: nextActive,
        }),
      })
      setUsers(users.map(u => u.id === user.id ? { ...u, isActive: nextActive } : u))
    } catch (err) {
      console.error('Erro:', err)
      alert(err instanceof Error ? err.message : 'Falha ao atualizar status do usuário')
    }
  }

  const formatBrazilTime = (utcDate: string): string => {
    const date = new Date(utcDate)
    const brazilDate = new Date(date.getTime() - 3 * 60 * 60 * 1000)
    const day = String(brazilDate.getUTCDate()).padStart(2, '0')
    const month = String(brazilDate.getUTCMonth() + 1).padStart(2, '0')
    const year = brazilDate.getUTCFullYear()
    return `${day}/${month}/${year}`
  }

  if (loading) return <div className="container"><div className="loading">Carregando usuários...</div></div>
  if (error) return <div className="container"><div className="error">{error}</div></div>

  return (
    <div className="container">
      <h1>👥 Gerenciar Usuários</h1>

      <div className="header-actions">
        <Link to="/users/new" className="btn btn-primary">
          ➕ Novo Usuário
        </Link>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum usuário cadastrado</p>
        </div>
      ) : (
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Email</th>
                <th>Telefone</th>
                <th>Nome Completo</th>
                <th>Status</th>
                <th>Data de Cadastro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="username"><strong>{user.username}</strong></td>
                  <td>{user.email || '-'}</td>
                  <td>{user.phone || '-'}</td>
                  <td>{user.fullName || '-'}</td>
                  <td>
                    <div className="status-cell">
                      <Badge variant={user.isActive ? 'success' : 'danger'}>
                        {user.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <label className="toggle" title={user.username === currentUsername ? 'Não é possível desativar sua própria conta' : undefined}>
                        <input
                          type="checkbox"
                          checked={!!user.isActive}
                          disabled={user.username === currentUsername}
                          onChange={() => handleToggleActive(user)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </td>
                  <td>{formatBrazilTime(user.createdAtUtc)}</td>
                  <td className="actions">
                    <Link to={`/users/${user.id}/edit`} className="btn btn-sm btn-secondary">
                      ✏️ Editar
                    </Link>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="btn btn-sm btn-danger"
                    >
                      🗑️ Deletar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
