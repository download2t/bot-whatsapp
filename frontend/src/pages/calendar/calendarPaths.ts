import { createContext, useContext } from 'react'

// The calendar screens (CalendarHome, CalendarPeopleList, CalendarPersonForm,
// CalendarReminderForm, CalendarNotificationSettings) are mounted in two different places:
//   - standalone, at the router root ("/"), for User.IsCalendarUser accounts (see CalendarApp)
//   - embedded inside the normal Botzap routes, under "/calendario" (see CalendarSection)
// Every navigate()/Link target inside those screens is built from this context's base path
// instead of a hardcoded "/pessoas" etc., so the exact same components work correctly in
// both mounts without duplicating a single line of them.
export const CalendarBasePathContext = createContext('')

export function useCalendarPaths() {
  const basePath = useContext(CalendarBasePathContext)

  return {
    home: basePath || '/',
    people: `${basePath}/pessoas`,
    newPerson: `${basePath}/pessoas/nova`,
    editPerson: (id: number | string) => `${basePath}/pessoas/${id}/editar`,
    newReminder: (dateIso?: string) => `${basePath}/lembretes/novo${dateIso ? `?data=${dateIso}` : ''}`,
    editReminder: (id: number | string) => `${basePath}/lembretes/${id}/editar`,
    notifications: `${basePath}/notificacoes`,
  }
}
