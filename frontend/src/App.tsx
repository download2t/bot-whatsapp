import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Navigation } from './components/Navigation'
import type { LoginResponse } from './types'
import { Dashboard } from './pages/Dashboard'
import { LoginPage } from './pages/LoginPage.tsx'
import { Messages } from './pages/Messages'
import { TurmasList } from './pages/TurmasList'
import { TurmaForm } from './pages/TurmaForm'
import { ContatosList } from './pages/ContatosList'
import { ContatoForm } from './pages/ContatoForm'
import { ContatosImportExcel } from './pages/ContatosImportExcel'
import { BulkMessages } from './pages/BulkMessages'
import { ProfilePage } from './pages/ProfilePage'
import { ScheduleRulesList } from './pages/ScheduleRulesList'
import { ScheduleRuleForm } from './pages/ScheduleRuleForm'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { WhatsAppConnectionsPage } from './pages/WhatsAppConnectionsPage'
import { Whitelist } from './pages/Whitelist'
import { UsersList } from './pages/UsersList'
import { UserForm } from './pages/UserForm'
import './App.css'

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('bot_jwt'))
  const [username, setUsername] = useState<string>(() => localStorage.getItem('bot_user') ?? 'admin')
  const [isAdmin, setIsAdmin] = useState<boolean>(() => localStorage.getItem('bot_is_admin') === 'true')
  const [userTitle, setUserTitle] = useState<string | null>(() => localStorage.getItem('bot_user_title') ?? null)

  const applyLoginResponse = (response: LoginResponse) => {
    localStorage.setItem('bot_jwt', response.token)
    localStorage.setItem('bot_user', response.username)
    localStorage.setItem('bot_is_admin', response.isAdmin ? 'true' : 'false')
    localStorage.setItem('bot_user_title', response.userTitle ?? '')
    setToken(response.token)
    setUsername(response.username)
    setIsAdmin(response.isAdmin)
    setUserTitle(response.userTitle)
  }

  const handleLoginSuccess = (response: LoginResponse) => {
    applyLoginResponse(response)
  }

  const handleLogout = () => {
    localStorage.removeItem('bot_jwt')
    localStorage.removeItem('bot_user')
    localStorage.removeItem('bot_is_admin')
    localStorage.removeItem('bot_user_title')
    setToken(null)
    setIsAdmin(false)
    setUserTitle(null)
  }

  useEffect(() => {
    const onAuthExpired = () => {
      setToken(null)
      setIsAdmin(false)
      setUserTitle(null)
    }

    window.addEventListener('auth-expired', onAuthExpired)
    return () => {
      window.removeEventListener('auth-expired', onAuthExpired)
    }
  }, [])

  if (!token) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <BrowserRouter>
      <Navigation
        username={username}
        isAdmin={isAdmin}
        userTitle={userTitle}
        onLogout={handleLogout}
      />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/bulk" element={<BulkMessages />} />
        <Route path="/turmas" element={<TurmasList />} />
        <Route path="/turmas/new" element={<TurmaForm />} />
        <Route path="/turmas/:id/edit" element={<TurmaForm />} />
        <Route path="/contatos" element={<ContatosList />} />
        <Route path="/contatos/new" element={<ContatoForm />} />
        <Route path="/contatos/import-excel" element={<ContatosImportExcel />} />
        <Route path="/contatos/:id/edit" element={<ContatoForm />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
