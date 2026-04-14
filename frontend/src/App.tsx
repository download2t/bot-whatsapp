import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Navigation } from './components/Navigation'
import { getApiBase } from './lib/api'
import type { CompanyOption, LoginResponse } from './types'
import { Dashboard } from './pages/Dashboard'
import { LoginPage } from './pages/LoginPage.tsx'
import { Messages } from './pages/Messages'
import { ProfilePage } from './pages/ProfilePage'
import { ScheduleRulesList } from './pages/ScheduleRulesList'
import { ScheduleRuleForm } from './pages/ScheduleRuleForm'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { WhatsAppConnectionsPage } from './pages/WhatsAppConnectionsPage'
import { Whitelist } from './pages/Whitelist'
import { UsersList } from './pages/UsersList'
import { UserForm } from './pages/UserForm'
import { CompaniesPage } from './pages/CompaniesPage'
import { CompanyFormPage } from './pages/CompanyFormPage'
import { CompanyUsersPage } from './pages/CompanyUsersPage'
import './App.css'

const API_BASE = getApiBase()

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('bot_jwt'))
  const [username, setUsername] = useState<string>(() => localStorage.getItem('bot_user') ?? 'admin')
  const [isAdmin, setIsAdmin] = useState<boolean>(() => localStorage.getItem('bot_is_admin') === 'true')
  const [userTitle, setUserTitle] = useState<string | null>(() => localStorage.getItem('bot_user_title') ?? null)
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(() => {
    const raw = localStorage.getItem('bot_company_id')
    return raw ? Number(raw) : null
  })
  const [activeCompanyName, setActiveCompanyName] = useState<string | null>(() => localStorage.getItem('bot_company_name'))
  const [activeCompanyCode, setActiveCompanyCode] = useState<string | null>(() => localStorage.getItem('bot_company_code'))
  const [companies, setCompanies] = useState<CompanyOption[]>(() => {
    const raw = localStorage.getItem('bot_companies')
    if (!raw) {
      return []
    }

    try {
      return JSON.parse(raw) as CompanyOption[]
    } catch {
      return []
    }
  })
  const [selectingCompany, setSelectingCompany] = useState(false)
  const [companySelectionError, setCompanySelectionError] = useState('')

  const persistCompanyState = (selectedCompanyId: number | null, selectedCompanyName: string | null, selectedCompanyCode: string | null, items: CompanyOption[]) => {
    if (selectedCompanyId === null) {
      localStorage.removeItem('bot_company_id')
    } else {
      localStorage.setItem('bot_company_id', String(selectedCompanyId))
    }

    if (!selectedCompanyName) {
      localStorage.removeItem('bot_company_name')
    } else {
      localStorage.setItem('bot_company_name', selectedCompanyName)
    }

    if (!selectedCompanyCode) {
      localStorage.removeItem('bot_company_code')
    } else {
      localStorage.setItem('bot_company_code', selectedCompanyCode)
    }

    localStorage.setItem('bot_companies', JSON.stringify(items))
    setActiveCompanyId(selectedCompanyId)
    setActiveCompanyName(selectedCompanyName)
    setActiveCompanyCode(selectedCompanyCode)
    setCompanies(items)
  }

  const applyLoginResponse = (response: LoginResponse) => {
    localStorage.setItem('bot_jwt', response.token)
    localStorage.setItem('bot_user', response.username)
    localStorage.setItem('bot_is_admin', response.isAdmin ? 'true' : 'false')
    localStorage.setItem('bot_user_title', response.userTitle ?? '')
    setToken(response.token)
    setUsername(response.username)
    setIsAdmin(response.isAdmin)
    setUserTitle(response.userTitle)

    persistCompanyState(response.companyId, response.companyName, response.companyCode, response.companies)
    setSelectingCompany(response.requiresCompanySelection)
    setCompanySelectionError('')
  }

  const handleLoginSuccess = (response: LoginResponse) => {
    applyLoginResponse(response)
  }

  const handleSelectCompany = async (companyId: number) => {
    setSelectingCompany(true)
    setCompanySelectionError('')

    try {
      const response = await fetch(`${API_BASE}/api/auth/select-company`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ companyId }),
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha ao selecionar empresa.')
      }

      const data = await response.json() as LoginResponse
      applyLoginResponse(data)
      window.dispatchEvent(new Event('company-changed'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao selecionar empresa.'
      setCompanySelectionError(message)
      throw new Error(message)
    } finally {
      setSelectingCompany(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('bot_jwt')
    localStorage.removeItem('bot_user')
    localStorage.removeItem('bot_company_id')
    localStorage.removeItem('bot_company_name')
    localStorage.removeItem('bot_company_code')
    localStorage.removeItem('bot_companies')
    localStorage.removeItem('bot_is_admin')
    localStorage.removeItem('bot_user_title')
    setToken(null)
    setIsAdmin(false)
    setUserTitle(null)
    setActiveCompanyId(null)
    setActiveCompanyName(null)
    setActiveCompanyCode(null)
    setCompanies([])
    setSelectingCompany(false)
    setCompanySelectionError('')
  }

  useEffect(() => {
    const onAuthExpired = () => {
      setToken(null)
      setActiveCompanyId(null)
      setActiveCompanyName(null)
      setActiveCompanyCode(null)
      setCompanies([])
      setIsAdmin(false)
      setUserTitle(null)
      setSelectingCompany(false)
      setCompanySelectionError('')
    }

    window.addEventListener('auth-expired', onAuthExpired)
    return () => {
      window.removeEventListener('auth-expired', onAuthExpired)
    }
  }, [])

  if (!token) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  if (companies.length > 1 && !activeCompanyId) {
    return (
      <main className="login-screen">
        <section className="login-card">
          <h1>Escolha sua empresa</h1>
          <p className="login-subtitle">Seu usuario possui mais de uma empresa. Selecione uma para continuar.</p>

          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault()
              const form = event.currentTarget
              const formData = new FormData(form)
              const selected = Number(formData.get('companyId'))
              if (selected > 0) {
                void handleSelectCompany(selected).catch(() => undefined)
              }
            }}
          >
            <label htmlFor="companyId">Empresa</label>
            <select id="companyId" name="companyId" defaultValue="" required>
              <option value="" disabled>Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.companyId} value={company.companyId}>
                  {company.companyName}
                </option>
              ))}
            </select>

            {companySelectionError && <p className="login-error">{companySelectionError}</p>}

            <button type="submit" disabled={selectingCompany}>
              {selectingCompany ? 'Selecionando...' : 'Continuar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <BrowserRouter>
      <Navigation
        username={username}
        isAdmin={isAdmin}
        userTitle={userTitle}
        onLogout={handleLogout}
        activeCompanyId={activeCompanyId}
        activeCompanyName={activeCompanyName}
        activeCompanyCode={activeCompanyCode}
        companies={companies}
        onSwitchCompany={(companyId) => handleSelectCompany(companyId)}
      />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/rules" element={!isAdmin && userTitle === 'Operador' ? <Navigate to="/" replace /> : <ScheduleRulesList />} />
        <Route path="/rules/new" element={!isAdmin && userTitle === 'Operador' ? <Navigate to="/" replace /> : <ScheduleRuleForm />} />
        <Route path="/rules/edit/:id" element={!isAdmin && userTitle === 'Operador' ? <Navigate to="/" replace /> : <ScheduleRuleForm />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/whatsapp-connections" element={<WhatsAppConnectionsPage />} />
        <Route path="/whitelist" element={!isAdmin && userTitle === 'Operador' ? <Navigate to="/" replace /> : <Whitelist />} />
        <Route path="/users" element={!isAdmin && userTitle === 'Operador' ? <Navigate to="/" replace /> : <UsersList />} />
        <Route path="/users/new" element={!isAdmin && userTitle === 'Operador' ? <Navigate to="/" replace /> : <UserForm />} />
        <Route path="/users/:id/edit" element={!isAdmin && userTitle === 'Operador' ? <Navigate to="/" replace /> : <UserForm />} />
        <Route path="/companies" element={isAdmin ? <CompaniesPage /> : <Navigate to="/" replace />} />
        <Route path="/companies/new" element={isAdmin ? <CompanyFormPage /> : <Navigate to="/" replace />} />
        <Route path="/companies/:id/edit" element={isAdmin ? <CompanyFormPage /> : <Navigate to="/" replace />} />
        <Route path="/companies/:id/users" element={isAdmin ? <CompanyUsersPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
