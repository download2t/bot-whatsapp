import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { WhatsAppConnectionStatus } from '../types'
import './Navigation.css'

type NavigationProps = {
  username: string
  onLogout: () => void
}

export function Navigation({ username, onLogout }: NavigationProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null)
  const profileMenuRef = useRef<HTMLLIElement | null>(null)
  const userInitial = username.trim().charAt(0).toUpperCase() || 'U'

  const closeMenus = () => {
    setIsMenuOpen(false)
    setIsNavOpen(false)
  }

  const isActive = (path: string) => location.pathname === path ? 'active' : ''

  const connectionLabel = useMemo(() => {
    if (!status) return 'Status indisponivel'
    if (status.isConnected) return 'Conectado'
    if (status.hasQr) return 'Aguardando leitura do QR'
    return 'Desconectado'
  }, [status])

  const loadStatus = async () => {
    try {
      const data = await apiFetch<WhatsAppConnectionStatus>('/api/whatsapp/status')
      setStatus(data)
    } catch {
      // Keep menu usable even if status endpoint is temporarily unavailable.
    }
  }

  useEffect(() => {
    void loadStatus()
    const interval = window.setInterval(() => {
      void loadStatus()
    }, 10000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleOpenDocs = () => {
    window.open('http://localhost:5207/swagger', '_blank', 'noopener,noreferrer')
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
          <li className="nav-item">
            <Link to="/" className={`nav-link ${isActive('/')}`} onClick={closeMenus}>
              Dashboard
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/messages" className={`nav-link ${isActive('/messages')}`} onClick={closeMenus}>
              Mensagens
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/rules" className={`nav-link ${isActive('/rules')}`} onClick={closeMenus}>
              Regras
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/whitelist" className={`nav-link ${isActive('/whitelist')}`} onClick={closeMenus}>
              Whitelist
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/users" className={`nav-link ${isActive('/users')}`} onClick={closeMenus}>
              Usuários
            </Link>
          </li>
          <li className="nav-item profile-root" ref={profileMenuRef}>
            <button className="profile-trigger" onClick={() => setIsMenuOpen((value) => !value)}>
              <span className="profile-caret">▾</span>
              <span className="profile-avatar">{userInitial}</span>
            </button>

            {isMenuOpen && (
              <div className="profile-menu">
                <p className="menu-caption">Conectado como</p>
                <p className="menu-username">{username}</p>
                <hr />

                <button className="menu-item" onClick={() => { navigate('/profile'); closeMenus() }}>Perfil</button>
                <button className="menu-item" onClick={() => { navigate('/change-password'); closeMenus() }}>Alterar senha</button>
                <button className="menu-item" onClick={() => { handleOpenDocs(); closeMenus() }}>Documentacao</button>
                <button className="menu-item" onClick={() => { navigate('/whatsapp-connections'); closeMenus() }}>Conexoes WhatsApp</button>

                <hr />
                <p className="menu-caption section-caption">WhatsApp Web</p>

                <div className="wa-status">
                  <span className={`status-badge ${status?.isConnected ? 'ok' : 'off'}`}>
                    {connectionLabel}
                  </span>
                  {status?.phoneNumber && <span className="wa-phone">{status.phoneNumber}</span>}
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
