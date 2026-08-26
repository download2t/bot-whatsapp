import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import type { CalendarPerson } from '../../types'
import { useCalendarPaths } from './calendarPaths'

export function CalendarPeopleList() {
  const navigate = useNavigate()
  const paths = useCalendarPaths()
  const [people, setPeople] = useState<CalendarPerson[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (name: string) => {
    try {
      setLoading(true)
      const query = name.trim() ? `?name=${encodeURIComponent(name.trim())}` : ''
      const data = await apiFetch<CalendarPerson[]>(`/api/calendar/people${query}`)
      setPeople(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar pessoas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(search), 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  const formatBirthDate = (iso: string | null) => {
    if (!iso) return null
    const [year, month, day] = iso.split('-')
    return `${day}/${month}/${year}`
  }

  return (
    <div>
      <h2 className="cal-page-title">Pessoas ({people.length})</h2>

      <input
        className="cal-list-search"
        placeholder="Buscar por nome..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <div className="cal-loading">Carregando...</div>
      ) : error ? (
        <div className="cal-error">{error}</div>
      ) : people.length === 0 ? (
        <div className="cal-empty">Nenhuma pessoa encontrada.</div>
      ) : (
        people.map((person) => (
          <div key={person.id} className="cal-person-card" onClick={() => navigate(paths.editPerson(person.id))}>
            <div>
              <div className="cal-person-name">{person.name}</div>
              <div className="cal-person-meta">
                {person.age !== null ? `${person.age} anos` : 'Sem data de nascimento'}
                {formatBirthDate(person.birthDate) ? ` · ${formatBirthDate(person.birthDate)}` : ''}
                {person.phoneNumber ? ` · ${person.phoneNumber}` : ''}
              </div>
            </div>
          </div>
        ))
      )}

      <button
        className="cal-fab"
        onClick={() => navigate(paths.newPerson)}
        aria-label="Nova pessoa"
      >
        +
      </button>
    </div>
  )
}
