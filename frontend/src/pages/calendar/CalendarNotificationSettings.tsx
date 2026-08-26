import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import type { CalendarNotificationLog, CalendarNotificationSetting } from '../../types'

const DEFAULT_TEMPLATE_HINT =
  '🎂 Hoje é aniversário de *{nome}*! Está completando {idade} anos. Prepare uma surpresa ou homenagem! 🎉'

export function CalendarNotificationSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [whatsAppConnected, setWhatsAppConnected] = useState(false)
  const [logs, setLogs] = useState<CalendarNotificationLog[]>([])

  const [form, setForm] = useState({
    isEnabled: false,
    targetPhoneNumber: '',
    messageTemplate: '',
    notifyTime: '08:00',
  })

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      const [setting, logData] = await Promise.all([
        apiFetch<CalendarNotificationSetting>('/api/calendar/notification-settings'),
        apiFetch<CalendarNotificationLog[]>('/api/calendar/notification-settings/log'),
      ])

      setForm({
        isEnabled: setting.isEnabled,
        targetPhoneNumber: setting.targetPhoneNumber ?? '',
        messageTemplate: setting.messageTemplate ?? '',
        notifyTime: `${String(setting.notifyHour).padStart(2, '0')}:${String(setting.notifyMinute).padStart(2, '0')}`,
      })
      setWhatsAppConnected(setting.whatsAppConnected)
      setLogs(logData || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar configurações')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.isEnabled && !form.targetPhoneNumber.trim()) {
      alert('Informe o número que vai receber o aviso')
      return
    }

    const [hourStr, minuteStr] = form.notifyTime.split(':')

    setSaving(true)
    try {
      const setting = await apiFetch<CalendarNotificationSetting>('/api/calendar/notification-settings', {
        method: 'PUT',
        body: JSON.stringify({
          isEnabled: form.isEnabled,
          targetPhoneNumber: form.targetPhoneNumber.trim(),
          messageTemplate: form.messageTemplate.trim() || null,
          notifyHour: Number(hourStr) || 0,
          notifyMinute: Number(minuteStr) || 0,
        }),
      })
      setWhatsAppConnected(setting.whatsAppConnected)
      alert('Configuração salva')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao salvar configuração')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!form.targetPhoneNumber.trim()) {
      alert('Informe o número antes de testar')
      return
    }

    setTesting(true)
    setTestResult(null)
    try {
      const result = await apiFetch<{ success: boolean; status: string }>('/api/calendar/notification-settings/test', {
        method: 'POST',
        body: JSON.stringify({
          targetPhoneNumber: form.targetPhoneNumber.trim(),
          messageTemplate: form.messageTemplate.trim() || null,
        }),
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, status: err instanceof Error ? err.message : 'Falha ao enviar teste' })
    } finally {
      setTesting(false)
    }
  }

  const formatDate = (iso: string) => {
    const [year, month, day] = iso.split('-')
    return `${day}/${month}/${year}`
  }

  if (loading) return <div className="cal-loading">Carregando...</div>

  return (
    <div>
      <h2 className="cal-page-title">Aviso de aniversário</h2>

      {error && <div className="cal-error">{error}</div>}

      <p style={{ fontSize: '0.85rem', color: 'var(--cal-muted)', marginTop: '-0.5rem' }}>
        No dia do aniversário de alguém cadastrado, mandamos um aviso pro número abaixo com o
        nome e a idade, pra essa pessoa preparar uma surpresa ou homenagem.
      </p>

      <div className={`cal-person-chip`} style={{ background: whatsAppConnected ? '#e8f7ee' : '#fdecec', color: whatsAppConnected ? '#1f8a4c' : '#c23a3a' }}>
        {whatsAppConnected ? '✅ Seu WhatsApp está conectado' : '⚠️ Seu WhatsApp não está conectado'}
      </div>

      <form className="cal-form" onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
        <div className="cal-checkbox-row">
          <input
            type="checkbox"
            id="cal-notif-enabled"
            checked={form.isEnabled}
            onChange={(e) => setForm({ ...form, isEnabled: e.target.checked })}
          />
          <label htmlFor="cal-notif-enabled">Ativar aviso automático</label>
        </div>

        <div>
          <label>Número que recebe o aviso</label>
          <input
            type="tel"
            value={form.targetPhoneNumber}
            onChange={(e) => setForm({ ...form, targetPhoneNumber: e.target.value })}
            placeholder="(45) 99999-9999"
          />
        </div>

        <div>
          <label>Horário do aviso</label>
          <input
            type="time"
            value={form.notifyTime}
            onChange={(e) => setForm({ ...form, notifyTime: e.target.value })}
          />
        </div>

        <div>
          <label>Mensagem (opcional)</label>
          <textarea
            value={form.messageTemplate}
            onChange={(e) => setForm({ ...form, messageTemplate: e.target.value })}
            placeholder={DEFAULT_TEMPLATE_HINT}
          />
          <small style={{ color: 'var(--cal-muted)', fontSize: '0.75rem' }}>
            Use <code>{'{nome}'}</code> e <code>{'{idade}'}</code> — deixe em branco para usar a mensagem padrão.
          </small>
        </div>

        <div className="cal-form-actions">
          <button type="submit" className="cal-btn cal-btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            type="button"
            className="cal-btn cal-btn-secondary"
            disabled={testing}
            onClick={handleTest}
          >
            {testing ? 'Enviando...' : '🧪 Testar envio'}
          </button>
        </div>

        {testResult && (
          <div className={testResult.success ? 'cal-event birthday' : 'cal-event reminder'}>
            <span className="cal-event-icon">{testResult.success ? '✅' : '⚠️'}</span>
            <div className="cal-event-body">
              <div className="cal-event-title">
                {testResult.success ? 'Mensagem de teste enviada' : 'Falha ao enviar teste'}
              </div>
              <div className="cal-event-meta">{testResult.status}</div>
            </div>
          </div>
        )}
      </form>

      <div className="cal-agenda">
        <h3>Histórico de envios</h3>
        {logs.length === 0 ? (
          <div className="cal-empty">Nenhum aviso enviado ainda.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`cal-event ${log.success ? 'birthday' : 'reminder'}`}>
              <span className="cal-event-icon">{log.success ? '✅' : '⚠️'}</span>
              <div className="cal-event-body">
                <div className="cal-event-title">{log.personName}</div>
                <div className="cal-event-meta">
                  {formatDate(log.notificationDate)}
                  {!log.success && log.statusDetail ? ` · ${log.statusDetail}` : ''}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
