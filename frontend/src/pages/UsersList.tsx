import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { CompanyListItem, UserListItem } from '../types'
import './UsersList.css'

export function UsersList() {
  const [searchParams] = useSearchParams()
  const [users, setUsers] = useState<UserListItem[]>([])
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(() => Number(searchParams.get('companyId') || localStorage.getItem('bot_company_id') || '0'))
  const [companyQuery, setCompanyQuery] = useState('')
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false)
  const isCurrentUserAdmin = localStorage.getItem('bot_is_admin') === 'true'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const companyFilterRef = useRef<HTMLDivElement | null>(null)

  const filteredCompanies = useMemo(() => {
    const query = companyQuery.trim().toLowerCase()
    if (!query) {
      return companies.slice(0, 100)
    }

    const startsWith = companies.filter((company) =>
      company.name.toLowerCase().startsWith(query)
      || company.companyCode.toLowerCase().startsWith(query)
    )

    const contains = companies.filter((company) =>
      !startsWith.some((item) => item.id === company.id)
      && (
        company.name.toLowerCase().includes(query)
        || company.companyCode.toLowerCase().includes(query)
      )
    )

    return [...startsWith, ...contains].slice(0, 100)
  }, [companies, companyQuery])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const query = isCurrentUserAdmin && selectedCompanyId > 0 ? `?companyId=${selectedCompanyId}` : ''
      const data = await apiFetch<UserListItem[]>(`/api/users${query}`)
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
    const load = async () => {
      if (isCurrentUserAdmin) {
        try {
          const companyData = await apiFetch<CompanyListItem[]>('/api/companies')
          setCompanies(companyData || [])
          if ((selectedCompanyId <= 0) && companyData && companyData.length > 0) {
            setSelectedCompanyId(companyData[0].id)
            return
          }
        } catch (err) {
          console.error('Erro ao carregar empresas:', err)
        }
      }

      await loadUsers()
    }

    void load()
  }, [isCurrentUserAdmin, selectedCompanyId])

  useEffect(() => {
    if (!isCurrentUserAdmin) {
      return
    }

    const selectedCompany = companies.find((company) => company.id === selectedCompanyId)
    if (selectedCompany) {
      setCompanyQuery(selectedCompany.name)
    }
  }, [companies, selectedCompanyId, isCurrentUserAdmin])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!companyFilterRef.current?.contains(event.target as Node)) {
        setIsCompanyDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este usuário?')) return

    try {
      const query = isCurrentUserAdmin && selectedCompanyId > 0 ? `?companyId=${selectedCompanyId}` : ''
      await apiFetch<null>(`/api/users/${id}${query}`, {
        method: 'DELETE'
      })
      setUsers(users.filter(u => u.id !== id))
    } catch (err) {
      console.error('Erro:', err)
      alert('Falha ao deletar usuário')
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
        {isCurrentUserAdmin && (
          <div className="company-filter-wrapper" ref={companyFilterRef}>
            <input
              type="text"
              value={companyQuery}
              onFocus={() => setIsCompanyDropdownOpen(true)}
              onChange={(event) => {
                setCompanyQuery(event.target.value)
                setIsCompanyDropdownOpen(true)
              }}
              className="company-filter"
              placeholder="Digite para filtrar empresa (ex: TESTE LTDA)"
            />

            {isCompanyDropdownOpen && (
              <div className="company-dropdown">
                {filteredCompanies.length === 0 ? (
                  <div className="company-dropdown-empty">Nenhuma empresa encontrada.</div>
                ) : (
                  filteredCompanies.map((company) => (
                    <button
                      type="button"
                      key={company.id}
                      className={`company-dropdown-item ${selectedCompanyId === company.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCompanyId(company.id)
                        setCompanyQuery(company.name)
                        setIsCompanyDropdownOpen(false)
                      }}
                    >
                      <strong>{company.name}</strong>
                      <small>{company.companyCode}</small>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <Link to={isCurrentUserAdmin && selectedCompanyId > 0 ? `/users/new?companyId=${selectedCompanyId}` : '/users/new'} className="btn btn-primary">
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
                  <td>{formatBrazilTime(user.createdAtUtc)}</td>
                  <td className="actions">
                    <Link to={isCurrentUserAdmin && selectedCompanyId > 0 ? `/users/${user.id}/edit?companyId=${selectedCompanyId}` : `/users/${user.id}/edit`} className="btn btn-sm btn-secondary">
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
