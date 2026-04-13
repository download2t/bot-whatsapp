import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Navigation } from './components/Navigation'
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
import './App.css'

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('bot_jwt'))
  const [username, setUsername] = useState<string>(() => localStorage.getItem('bot_user') ?? 'admin')

  const handleLoginSuccess = (newToken: string, loggedUsername: string) => {
    localStorage.setItem('bot_jwt', newToken)
    localStorage.setItem('bot_user', loggedUsername)
    setToken(newToken)
    setUsername(loggedUsername)
  }

  const handleLogout = () => {
    localStorage.removeItem('bot_jwt')
    localStorage.removeItem('bot_user')
    setToken(null)
  }

  useEffect(() => {
    const onAuthExpired = () => {
      setToken(null)
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
      <Navigation username={username} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/rules" element={<ScheduleRulesList />} />
        <Route path="/rules/new" element={<ScheduleRuleForm />} />
        <Route path="/rules/edit/:id" element={<ScheduleRuleForm />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/whatsapp-connections" element={<WhatsAppConnectionsPage />} />
        <Route path="/whitelist" element={<Whitelist />} />
        <Route path="/users" element={<UsersList />} />
        <Route path="/users/new" element={<UserForm />} />
        <Route path="/users/:id/edit" element={<UserForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
