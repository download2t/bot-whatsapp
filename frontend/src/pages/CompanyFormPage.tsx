import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { CompanyListItem } from '../types'
import './CompaniesPage.css'

export function CompanyFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    name: '',
    companyCode: ''
  })

  useEffect(() => {
    if (!isEdit || !id) {
      return
    }

    const load = async () => {
      try {
        setLoading(true)
        const data = await apiFetch<CompanyListItem[]>('/api/companies')
        const company = (data || []).find(item => item.id === Number(id))
        if (!company) {
          setMessage('Empresa não encontrada.')
          return
        }

        setForm({
          name: company.name,
          companyCode: company.companyCode
        })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar empresa.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id, isEdit])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')

    if (!form.name.trim() || !form.companyCode.trim()) {
      setMessage('Nome e código da empresa são obrigatórios.')
      return
    }

    try {
      setSaving(true)
      if (isEdit && id) {
        await apiFetch(`/api/companies/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name.trim(),
            companyCode: form.companyCode.trim()
          })
        })
      } else {
        await apiFetch('/api/companies', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            companyCode: form.companyCode.trim()
          })
        })
      }

      navigate('/companies')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar empresa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container companies-page">
      <h1>{isEdit ? '✏️ Editar Empresa' : '🏢 Nova Empresa'}</h1>
      <p className="companies-subtitle">Página dedicada para cadastro de empresa.</p>

      {message && <div className="companies-message">{message}</div>}

      <section className="companies-card">
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <form onSubmit={handleSubmit} className="companies-form">
            <div className="form-group">
              <label htmlFor="companyName">Nome</label>
              <input
                id="companyName"
                value={form.name}
                onChange={(event) => setForm(prev => ({ ...prev, name: event.target.value }))}
                placeholder="Ex: Empresa Alpha"
              />
            </div>

            <div className="form-group">
              <label htmlFor="companyCode">Código Único</label>
              <input
                id="companyCode"
                value={form.companyCode}
                onChange={(event) => setForm(prev => ({ ...prev, companyCode: event.target.value }))}
                placeholder="Ex: EMPRESA-ALPHA"
              />
            </div>

            <div className="companies-form-actions">
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
              <Link className="btn btn-secondary" to="/companies">Cancelar</Link>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
