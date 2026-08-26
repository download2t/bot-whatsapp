import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import type { CalendarPerson, CalendarReminder } from '../../types'
import { useCalendarPaths } from './calendarPaths'

export function CalendarReminderForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const paths = useCalendarPaths()
  const isNew = !id

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    date: searchParams.get('data') ?? '',
    time: '',
    isRecurringYearly: false,
  })

  const [personSearch, setPersonSearch] = useState('')
  const [personResults, setPersonResults] = useState<CalendarPerson[]>([])
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string } | null>(null)

  useEffect(() => {
    if (!isNew && id) {
      void loadReminder(parseInt(id))
    }
  }, [id, isNew])

  useEffect(() => {
    if (!personSearch.trim()) {
      setPersonResults([])
      return
    }

    const timeout = window.setTimeout(async () => {
      try {
        const data = await apiFetch<CalendarPerson[]>(`/api/calendar/people?name=${encodeURIComponent(personSearch.trim())}`)
        setPersonResults((data || []).slice(0, 6))
      } catch {
        setPersonResults([])
      }
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [personSearch])

  const loadReminder = async (reminderId: number) => {
    try {
      setLoading(true)
      const data = await apiFetch<CalendarReminder>(`/api/calendar/reminders/${reminderId}`)
      setForm({
        title: data.title,
        description: data.description ?? '',
        date: data.date,
        time: data.time ? data.time.slice(0, 5) : '',
        isRecurringYearly: data.isRecurringYearly,
      })
      if (data.calendarPersonId && data.calendarPersonName) {
        setSelectedPerson({ id: data.calendarPersonId, name: data.calendarPersonName })
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar lembrete')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim() || !form.date) {
      alert('Preencha título e data')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: form.date,
        time: form.time || null,
        isRecurringYearly: form.isRecurringYearly,
        calendarPersonId: selectedPerson?.id ?? null,
      }

      if (isNew) {
        await apiFetch('/api/calendar/reminders', { method: 'POST', body: JSON.stringify(payload) })
      } else {
        await apiFetch(`/api/calendar/reminders/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      }

      navigate(paths.home)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar lembrete')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    if (!confirm('Excluir este lembrete?')) return

    try {
      await apiFetch(`/api/calendar/reminders/${id}`, { method: 'DELETE' })
      navigate(paths.home)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir lembrete')
    }
  }

  if (loading) return <div className="cal-loading">Carregando...</div>

  return (
    <div>
      <a className="cal-back-link" onClick={() => navigate(paths.home)}>‹ Calendário</a>
      <h2 className="cal-page-title">{isNew ? 'Novo lembrete' : 'Editar lembrete'}</h2>

      {error && <div className="cal-error">{error}</div>}

      <form className="cal-form" onSubmit={handleSubmit}>
        <div>
          <label>Título *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Visitar a família Silva"
          />
        </div>

        <div>
          <label>Data *</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
        </div>

        <div>
          <label>Hora</label>
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
          />
        </div>

        <div>
          <label>Descrição</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Detalhes do lembrete..."
          />
        </div>

        <div className="cal-checkbox-row">
          <input
            type="checkbox"
            id="cal-reminder-recurring"
            checked={form.isRecurringYearly}
            onChange={(e) => setForm({ ...form, isRecurringYearly: e.target.checked })}
          />
          <label htmlFor="cal-reminder-recurring">Repete todo ano (ex: aniversário de casamento)</label>
        </div>

        <div>
          <label>Vincular a uma pessoa (opcional)</label>
          {selectedPerson ? (
            <div className="cal-person-chip">
              {selectedPerson.name}
              <button type="button" onClick={() => setSelectedPerson(null)}>×</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                placeholder="Buscar pessoa por nome..."
              />
              {personResults.length > 0 && (
                <div className="cal-person-picker-results">
                  {personResults.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => {
                        setSelectedPerson({ id: person.id, name: person.name })
                        setPersonSearch('')
                        setPersonResults([])
                      }}
                    >
                      {person.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="cal-form-actions">
          <button type="submit" className="cal-btn cal-btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" className="cal-btn cal-btn-secondary" onClick={() => navigate(paths.home)}>
            Cancelar
          </button>
        </div>

        {!isNew && (
          <button type="button" className="cal-btn cal-btn-danger" onClick={handleDelete}>
            Excluir lembrete
          </button>
        )}
      </form>
    </div>
  )
}
