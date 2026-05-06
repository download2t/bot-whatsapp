import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { CompanyOption, WhatsAppConnectionItem, WhatsAppConnectionStatus } from '../types'
import './Navigation.css'

type NavigationProps = {
  username: string
  isAdmin: boolean
  userTitle: string | null
  onLogout: () => void
  activeCompanyId: number | null
  activeCompanyName: string | null
  activeCompanyCode: string | null
  companies: CompanyOption[]
  onSwitchCompany: (companyId: number) => Promise<void>
}

export function Navigation({
  username,
  isAdmin,
  userTitle,
  onLogout,
  activeCompanyId,
  activeCompanyName,
  activeCompanyCode,
  companies,
  onSwitchCompany,
}: NavigationProps) {
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null)
  const [connections, setConnections] = useState<WhatsAppConnectionItem[]>([])
  const [switchingCompany, setSwitchingCompany] = useState(false)
  const [companyError, setCompanyError] = useState('')
  const profileMenuRef = useRef<HTMLLIElement | null>(null)
  const adminMenuRef = useRef<HTMLLIElement | null>(null)
  const userInitial = username.trim().charAt(0).toUpperCase() || 'U'
  const connectedConnections = useMemo(() => connections.filter((item) => item.isConnected), [connections])

  const closeMenus = () => {
    setIsMenuOpen(false)
    setIsAdminMenuOpen(false)
    setIsNavOpen(false)
  }

  const connectionLabel = useMemo(() => {
    if (!status) return 'Status indisponivel'
    if (status.isConnected) return 'Conectado'
    if (status.hasQr) return 'Aguardando leitura do QR'
    return 'Desconectado'
  }, [status])

  const formatPhone = (value: string | null | undefined) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (!digits) {
      return 'Sem numero vinculado'
    }

    const country = digits.startsWith('55') ? '+55' : `+${digits.slice(0, 2)}`
    const national = digits.startsWith('55') ? digits.slice(2) : digits.slice(2)
    const ddd = national.slice(0, 2)
    const local = national.slice(2)
    if (!ddd || !local) {
      return `+${digits}`
    }

    const firstPart = local.length > 4 ? local.slice(0, local.length - 4) : local
    const lastPart = local.length > 4 ? local.slice(-4) : ''

    return `${country} (${ddd}) ${firstPart}${lastPart ? ` - ${lastPart}` : ''}`.replace(/\s+/g, ' ').trim()
  }

  const loadStatus = async () => {
    try {
      const data = await apiFetch<WhatsAppConnectionStatus>('/api/whatsapp/status')
      setStatus(data)
    } catch {
      // Keep menu usable even if status endpoint is temporarily unavailable.
    }
  }

  const loadConnections = async () => {
    try {
      const data = await apiFetch<WhatsAppConnectionItem[]>('/api/whatsapp/connections')
      setConnections(data)
    } catch {
      // Keep menu usable even if the connections endpoint is temporarily unavailable.
    }
  }

  useEffect(() => {
    void loadStatus()
    void loadConnections()
    const interval = window.setInterval(() => {
      void loadStatus()
      void loadConnections()
    }, 10000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedProfile = profileMenuRef.current?.contains(target)
      const clickedAdmin = adminMenuRef.current?.contains(target)

      if (!clickedProfile) {
        setIsMenuOpen(false)
      }

      if (!clickedAdmin) {
        setIsAdminMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleOpenDocs = () => {
    window.open('http://localhost:5207/swagger', '_blank', 'noopener,noreferrer')
  }

  const handleCompanyChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCompanyId = Number(event.target.value)
    if (!selectedCompanyId || selectedCompanyId === activeCompanyId) {
      return
    }

    setSwitchingCompany(true)
    setCompanyError('')
    try {
      await onSwitchCompany(selectedCompanyId)
      closeMenus()
      window.location.reload()
    } catch (error) {
      setCompanyError(error instanceof Error ? error.message : 'Falha ao trocar empresa.')
    } finally {
      setSwitchingCompany(false)
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand" onClick={closeMenus}>
          Central Operacional
        </Link>

        <button className="hamburger" onClick={() => setIsNavOpen((v) => !v)}>
          <span></span>
          <span></span>
          <span></span>
        </button>

        <ul className={`nav-menu ${isNavOpen ? 'open' : ''}`}>
          {(isAdmin || userTitle === 'Gestor') && (
            <li className="nav-item admin-root" ref={adminMenuRef}>
              <button className="admin-trigger" onClick={() => setIsAdminMenuOpen((value) => !value)}>
                <span className="menu-dot admin-dot" aria-hidden="true" />
                <span>Administração</span>
                <span className="profile-caret">▾</span>
              </button>

              {isAdminMenuOpen && (
                <div className="admin-menu profile-menu">
                  <button className="menu-item" onClick={() => { navigate('/rules'); closeMenus() }}>Regras</button>
                  <button className="menu-item" onClick={() => { navigate('/whitelist'); closeMenus() }}>White List</button>
                  <button className="menu-item" onClick={() => { navigate('/users'); closeMenus() }}>Usuários</button>
                  <button className="menu-item" onClick={() => { navigate('/turmas'); closeMenus() }}>Turmas</button>
                  <button className="menu-item" onClick={() => { navigate('/contatos'); closeMenus() }}>Contatos</button>
                  <button className="menu-item" onClick={() => { navigate('/messages'); closeMenus() }}>Mensagens</button>
                  {isAdmin && <button className="menu-item" onClick={() => { navigate('/companies'); closeMenus() }}>Empresas</button>}
                </div>
              )}
            </li>
          )}
          <li className="nav-item profile-root" ref={profileMenuRef}>
            <button className="profile-trigger" onClick={() => setIsMenuOpen((value) => !value)}>
              <span className="menu-dot profile-dot" aria-hidden="true" />
              <span className="profile-name">{username}</span>
              <span className="profile-caret">▾</span>
              <span className="profile-avatar">{userInitial}</span>
            </button>

            {isMenuOpen && (
              <div className="profile-menu">
                <p className="menu-caption">Conectado como</p>
                <p className="menu-username">{username}</p>
                <p className="menu-caption">Empresa atual</p>
                <p className="menu-company">{activeCompanyName ?? 'Nenhuma selecionada'}</p>
                {activeCompanyCode && <p className="menu-company-code">{activeCompanyCode}</p>}

                {companies.length > 1 && (
                  <>
                    <label className="menu-caption" htmlFor="companySwitcher">Trocar empresa</label>
                    <select
                      id="companySwitcher"
                      className="company-switcher"
                      value={activeCompanyId ?? ''}
                      onChange={(event) => { void handleCompanyChange(event) }}
                      disabled={switchingCompany}
                    >
                      {companies.map((company) => (
                        <option key={company.companyId} value={company.companyId}>
                          {company.companyName}
                        </option>
                      ))}
                    </select>
                    {companyError && <p className="menu-feedback company-feedback">{companyError}</p>}
                  </>
                )}
                <hr />

                <button className="menu-item" onClick={() => { navigate('/profile'); closeMenus() }}>Perfil</button>
                <button className="menu-item" onClick={() => { navigate('/change-password'); closeMenus() }}>Alterar senha</button>
                <button className="menu-item" onClick={() => { handleOpenDocs(); closeMenus() }}>Documentacao</button>
                <button className="menu-item" onClick={() => { navigate('/whatsapp-connections'); closeMenus() }}>Conexoes WhatsApp</button>

                <hr />
                <p className="menu-caption section-caption">WhatsApp Web</p>

                <div className="wa-status-list">
                  {connectedConnections.length > 0 ? connectedConnections.map((connection) => (
                    <div key={connection.id} className="wa-status-row">
                      <span className="wa-phone-inline">{formatPhone(connection.phoneNumber)}</span>
                      <span className="status-badge ok">Conectado</span>
                    </div>
                  )) : (
                    <div className="wa-status-row">
                      <span className={`status-badge ${status?.isConnected ? 'ok' : 'off'}`}>
                        {connectionLabel}
                      </span>
                      {status?.phoneNumber && <span className="wa-phone-inline">{formatPhone(status.phoneNumber)}</span>}
                    </div>
                  )}
                </div>

                <hr />
                <button className="menu-item logout" onClick={() => { onLogout(); closeMenus() }}>
                  Sair
                </button>
              </div>
            )}
          </li>
        </ul>
      </div>
    </nav>
  )
}
