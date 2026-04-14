import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { CompanyListItem, CompanyUserItem, CompanyUserOption } from '../types'
import './CompaniesPage.css'

export function CompanyUsersPage() {
  const { id } = useParams()
  const companyId = Number(id)
  const [companyName, setCompanyName] = useState('')
  const [members, setMembers] = useState<CompanyUserItem[]>([])
  const [userOptions, setUserOptions] = useState<CompanyUserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const availableUsers = useMemo(() => userOptions.filter(item => !item.isLinked), [userOptions])

  const loadData = async () => {
    if (!companyId) {
      return
    }

    const [companies, linkedUsers, usersOptions] = await Promise.all([
      apiFetch<CompanyListItem[]>('/api/companies'),
      apiFetch<CompanyUserItem[]>(`/api/companies/${companyId}/users`),
      apiFetch<CompanyUserOption[]>(`/api/companies/${companyId}/users/options`)
    ])

    const company = (companies || []).find(item => item.id === companyId)
    setCompanyName(company?.name || `Empresa #${companyId}`)
    setMembers(linkedUsers || [])
    setUserOptions(usersOptions || [])
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        await loadData()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar vínculos.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [companyId])

  const handleLinkUser = async (userId: number) => {
    try {
      await apiFetch(`/api/companies/${companyId}/users`, {
        method: 'POST',
        body: JSON.stringify({ userId })
      })
      await loadData()
      setMessage('Usuário vinculado com sucesso.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao vincular usuário.')
    }
  }

  const handleUnlinkUser = async (userId: number) => {
    try {
      await apiFetch(`/api/companies/${companyId}/users/${userId}`, {
        method: 'DELETE'
      })
      await loadData()
      setMessage('Usuário desvinculado com sucesso.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao desvincular usuário.')
    }
  }

  return (
    <div className="container companies-page">
      <h1>🔗 Vínculo de Usuários</h1>
      <p className="companies-subtitle">Gerencie vínculos da empresa: {companyName}</p>

      {message && <div className="companies-message">{message}</div>}

      {loading ? (
        <div className="companies-card"><p>Carregando...</p></div>
      ) : (
        <div className="companies-layout membership-layout">
          <section className="companies-card">
            <h2>Usuários Vinculados</h2>
            <div className="companies-list compact">
              {members.length === 0 && <p>Nenhum usuário vinculado.</p>}
              {members.map((member) => (
                <div key={member.userId} className="member-row">
                  <div>
                    <strong>{member.username}</strong>
                    <small>{member.fullName || member.email || '-'}</small>
                    {member.isAdmin && <small className="admin-badge">Admin</small>}
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => handleUnlinkUser(member.userId)}>Desvincular</button>
                </div>
              ))}
            </div>
          </section>

          <section className="companies-card">
            <h2>Usuários Disponíveis</h2>
            <div className="companies-list compact">
              {availableUsers.length === 0 && <p>Todos os usuários já estão vinculados.</p>}
              {availableUsers.map((option) => (
                <div key={option.userId} className="member-row">
                  <div>
                    <strong>{option.username}</strong>
                    <small>{option.fullName || option.email || '-'}</small>
                    {option.isAdmin && <small className="admin-badge">Admin</small>}
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => handleLinkUser(option.userId)}>Vincular</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="header-actions">
        <Link to="/companies" className="btn btn-secondary">Voltar para lista</Link>
      </div>
    </div>
  )
}
