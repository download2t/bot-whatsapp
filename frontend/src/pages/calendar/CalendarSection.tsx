import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CalendarHome } from './CalendarHome'
import { CalendarPeopleList } from './CalendarPeopleList'
import { CalendarPersonForm } from './CalendarPersonForm'
import { CalendarReminderForm } from './CalendarReminderForm'
import { CalendarNotificationSettings } from './CalendarNotificationSettings'
import { CalendarBasePathContext } from './calendarPaths'
import './CalendarApp.css'
import './CalendarSection.css'

// Mounted at "/calendario/*" inside the normal Botzap router (App.tsx) — the atalho on
// Navigation.tsx points here. Renders the exact same screens as the standalone CalendarApp
// (calendar-only accounts), just without its own BrowserRouter/header/bottom-tabbar, since the
// Botzap layout around it already provides those. See calendarPaths.ts for how the same
// components produce correct links in both mounts.
function SectionNav() {
  const location = useLocation()
  const isHome = location.pathname === '/calendario'
  const isPeople = location.pathname.startsWith('/calendario/pessoas')
  const isNotifications = location.pathname.startsWith('/calendario/notificacoes')

  return (
    <nav className="cal-section-nav">
      <Link to="/calendario" className={`cal-section-tab ${isHome ? 'active' : ''}`}>📅 Calendário</Link>
      <Link to="/calendario/pessoas" className={`cal-section-tab ${isPeople ? 'active' : ''}`}>👥 Pessoas</Link>
      <Link to="/calendario/notificacoes" className={`cal-section-tab ${isNotifications ? 'active' : ''}`}>🔔 Avisos</Link>
    </nav>
  )
}

export function CalendarSection() {
  return (
    <div className="cal-embedded">
      <SectionNav />
      <div className="cal-embedded-body">
        <CalendarBasePathContext.Provider value="/calendario">
          <Routes>
            <Route path="/" element={<CalendarHome />} />
            <Route path="/pessoas" element={<CalendarPeopleList />} />
            <Route path="/pessoas/nova" element={<CalendarPersonForm />} />
            <Route path="/pessoas/:id/editar" element={<CalendarPersonForm />} />
            <Route path="/lembretes/novo" element={<CalendarReminderForm />} />
            <Route path="/lembretes/:id/editar" element={<CalendarReminderForm />} />
            <Route path="/notificacoes" element={<CalendarNotificationSettings />} />
            <Route path="*" element={<Navigate to="/calendario" replace />} />
          </Routes>
        </CalendarBasePathContext.Provider>
      </div>
    </div>
  )
}
