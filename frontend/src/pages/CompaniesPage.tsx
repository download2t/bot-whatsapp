import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { CompanyListItem } from '../types'
import './CompaniesPage.css'

export function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyListItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      return companies
    }

    return companies.filter((company) =>
      company.name.toLowerCase().includes(term)
      || company.companyCode.toLowerCase().includes(term)
    )
  }, [companies, search])

  const loadCompanies = async () => {
    const data = await apiFetch<CompanyListItem[]>('/api/companies')
    setCompanies(data || [])
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        await loadCompanies()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar empresas')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const handleDeleteCompany = async (company: CompanyListItem) => {
    if (!confirm(`Deseja excluir a empresa "${company.name}"?`)) {
      return
    }

    try {
      await apiFetch(`/api/companies/${company.id}`, { method: 'DELETE' })
      setMessage('Empresa removida com sucesso.')
      await loadCompanies()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao excluir empresa.')
    }
  }

  if (loading) {
    return <div className="container"><div className="loading">Carregando empresas...</div></div>
  }

  return (
    <div className="container companies-page">
      <h1>🏢 Cadastro de Empresas</h1>
      <p className="companies-subtitle">Lista administrativa de empresas.</p>

      {message && <div className="companies-message">{message}</div>}

      <div className="header-actions">
        <Link className="btn btn-primary" to="/companies/new">➕ Cadastrar Nova Empresa</Link>
      </div>

      <section className="companies-card">
        <label htmlFor="company-search"><strong>Filtrar por nome/código</strong></label>
        <input
          id="company-search"
          className="companies-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Digite nome ou código da empresa"
        />
      </section>

      <section className="companies-card">
        <h2>Empresas</h2>
        <div className="companies-list">
          {filteredCompanies.map((company) => (
            <div key={company.id} className="company-row">
              <div className="company-select">
                <strong>{company.name}</strong>
                <span>{company.companyCode}</span>
                <small>{company.usersCount} usuário(s)</small>
              </div>
              <div className="company-actions">
                <Link className="btn btn-sm btn-secondary" to={`/companies/${company.id}/edit`}>Editar</Link>
                <Link className="btn btn-sm btn-primary" to={`/companies/${company.id}/users`}>Vincular usuários</Link>
                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteCompany(company)}>Excluir</button>
              </div>
            </div>
          ))}
          {filteredCompanies.length === 0 && <p>Nenhuma empresa encontrada para o filtro informado.</p>}
        </div>
      </section>
    </div>
  )
}
