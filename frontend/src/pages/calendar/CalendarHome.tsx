import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import type { CalendarPerson, CalendarReminder } from '../../types'
import { useCalendarPaths } from './calendarPaths'

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = monthStart.getDay()
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - firstWeekday)

  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + i)
    days.push(day)
  }
  return days
}

export function CalendarHome() {
  const navigate = useNavigate()
  const paths = useCalendarPaths()
  const today = useMemo(() => new Date(), [])
  const [monthStart, setMonthStart] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [reminders, setReminders] = useState<CalendarReminder[]>([])
  const [people, setPeople] = useState<CalendarPerson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        const gridDays = buildMonthGrid(monthStart)
        const from = toIsoDate(gridDays[0])
        const to = toIsoDate(gridDays[gridDays.length - 1])

        const [reminderData, peopleData] = await Promise.all([
          apiFetch<CalendarReminder[]>(`/api/calendar/reminders?from=${from}&to=${to}`),
          apiFetch<CalendarPerson[]>('/api/calendar/people'),
        ])

        if (!cancelled) {
          setReminders(reminderData || [])
          setPeople(peopleData || [])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar calendário')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [monthStart])

  const gridDays = useMemo(() => buildMonthGrid(monthStart), [monthStart])

  const birthdaysByDay = useMemo(() => {
    const map = new Map<string, CalendarPerson[]>()
    for (const person of people) {
      if (!person.birthDate) continue
      const [, month, day] = person.birthDate.split('-')
      const key = `${month}-${day}`
      const list = map.get(key) ?? []
      list.push(person)
      map.set(key, list)
    }
    return map
  }, [people])

  const remindersByDay = useMemo(() => {
    const map = new Map<string, CalendarReminder[]>()
    for (const reminder of reminders) {
      const list = map.get(reminder.date) ?? []
      list.push(reminder)
      map.set(reminder.date, list)
    }
    return map
  }, [reminders])

  const monthLabel = monthStart.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const goToMonth = (delta: number) => {
    setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + delta, 1))
  }

  const selectedIso = toIsoDate(selectedDate)
  const selectedMonthDayKey = selectedIso.slice(5)
  const dayReminders = remindersByDay.get(selectedIso) ?? []
  const dayBirthdays = birthdaysByDay.get(selectedMonthDayKey) ?? []

  const agendaLabel = selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <div>
      <div className="cal-month-nav">
        <button onClick={() => goToMonth(-1)} aria-label="Mês anterior">‹</button>
        <h2>{monthLabel}</h2>
        <button onClick={() => goToMonth(1)} aria-label="Próximo mês">›</button>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
      </div>

      {loading ? (
        <div className="cal-loading">Carregando...</div>
      ) : error ? (
        <div className="cal-error">{error}</div>
      ) : (
        <div className="cal-grid">
          {gridDays.map((day) => {
            const isOutside = day.getMonth() !== monthStart.getMonth()
            const isToday = sameDay(day, today)
            const isSelected = sameDay(day, selectedDate)
            const iso = toIsoDate(day)
            const monthDayKey = iso.slice(5)
            const hasReminders = (remindersByDay.get(iso)?.length ?? 0) > 0
            const hasBirthdays = (birthdaysByDay.get(monthDayKey)?.length ?? 0) > 0

            return (
              <button
                key={iso}
                className={[
                  'cal-day',
                  isOutside ? 'cal-day-outside' : '',
                  isToday ? 'cal-day-today' : '',
                  isSelected ? 'cal-day-selected' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelectedDate(day)}
              >
                <span>{day.getDate()}</span>
                {(hasReminders || hasBirthdays) && (
                  <span className="cal-day-dots">
                    {hasReminders && <span className="cal-day-dot" />}
                    {hasBirthdays && <span className="cal-day-dot birthday" />}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="cal-agenda">
        <h3>{agendaLabel}</h3>

        {dayBirthdays.length === 0 && dayReminders.length === 0 ? (
          <div className="cal-empty">Nada por aqui.</div>
        ) : (
          <>
            {dayBirthdays.map((person) => {
              // Age turning on this specific date is derived from the viewed year and the
              // birth year — not from person.age (which is always "as of today" and would be
              // wrong here whenever the viewed date isn't today, e.g. browsing a past/future
              // month, or even today after this year's birthday already passed).
              const birthYear = person.birthDate ? Number(person.birthDate.slice(0, 4)) : null
              const turningAge = birthYear !== null ? selectedDate.getFullYear() - birthYear : null

              return (
                <div key={`b-${person.id}`} className="cal-event birthday">
                  <span className="cal-event-icon">🎂</span>
                  <div className="cal-event-body">
                    <div className="cal-event-title">{person.name}</div>
                    <div className="cal-event-meta">
                      Aniversário{turningAge !== null ? ` · completa ${turningAge} anos` : ''}
                    </div>
                  </div>
                </div>
              )
            })}

            {dayReminders.map((reminder) => (
              <div key={`r-${reminder.id}`} className="cal-event reminder" onClick={() => navigate(paths.editReminder(reminder.id))}>
                <span className="cal-event-icon">🔔</span>
                <div className="cal-event-body">
                  <div className="cal-event-title">{reminder.title}</div>
                  <div className="cal-event-meta">
                    {reminder.time ? reminder.time.slice(0, 5) : 'Dia todo'}
                    {reminder.calendarPersonName ? ` · ${reminder.calendarPersonName}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <button
        className="cal-fab"
        onClick={() => navigate(paths.newReminder(selectedIso))}
        aria-label="Novo lembrete"
      >
        +
      </button>
    </div>
  )
}
