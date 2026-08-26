import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CalendarHome } from './CalendarHome'
import { CalendarPeopleList } from './CalendarPeopleList'
import { CalendarPersonForm } from './CalendarPersonForm'
import { CalendarReminderForm } from './CalendarReminderForm'
import { CalendarNotificationSettings } from './CalendarNotificationSettings'
import { CalendarBasePathContext } from './calendarPaths'
import './CalendarApp.css'

type CalendarAppProps = {
  username: string
  onLogout: () => void
}

function TabBar() {
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isPeople = location.pathname.startsWith('/pessoas')
  const isNotifications = location.pathname.startsWith('/notificacoes')

  return (
    <nav className="cal-tabbar">
      <Link to="/" className={`cal-tab ${isHome ? 'active' : ''}`}>
        <span className="cal-tab-icon">📅</span>
        Calendário
      </Link>
      <Link to="/pessoas" className={`cal-tab ${isPeople ? 'active' : ''}`}>
        <span className="cal-tab-icon">👥</span>
        Pessoas
      </Link>
      <Link to="/notificacoes" className={`cal-tab ${isNotifications ? 'active' : ''}`}>
        <span className="cal-tab-icon">🔔</span>
        Avisos
      </Link>
    </nav>
  )
}

export function CalendarApp({ username, onLogout }: CalendarAppProps) {
  return (
    <div className="cal-shell">
      <BrowserRouter>
        <div className="cal-viewport">
          <header className="cal-header">
            <div>
              <h1>Calendário</h1>
              <div className="cal-user">{username}</div>
            </div>
            <button className="cal-logout-btn" onClick={onLogout}>Sair</button>
          </header>

          <div className="cal-content">
            <CalendarBasePathContext.Provider value="">
              <Routes>
                <Route path="/" element={<CalendarHome />} />
                <Route path="/pessoas" element={<CalendarPeopleList />} />
                <Route path="/pessoas/nova" element={<CalendarPersonForm />} />
                <Route path="/pessoas/:id/editar" element={<CalendarPersonForm />} />
                <Route path="/lembretes/novo" element={<CalendarReminderForm />} />
                <Route path="/lembretes/:id/editar" element={<CalendarReminderForm />} />
                <Route path="/notificacoes" element={<CalendarNotificationSettings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </CalendarBasePathContext.Provider>
          </div>

          <TabBar />
        </div>
      </BrowserRouter>
    </div>
  )
}
