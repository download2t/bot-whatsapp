import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { WhatsAppConnectionItem, WhatsAppPairingCodeResponse, WhatsAppQrResponse } from '../types'
import './WhatsAppConnectionsPage.css'

export function WhatsAppConnectionsPage() {
  const [connections, setConnections] = useState<WhatsAppConnectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [mode, setMode] = useState<'qr' | 'number'>('qr')
  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isQrStarting, setIsQrStarting] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const connectedConnections = connections.filter((item) => item.isConnected)

  const formatPhone = (value: string | null | undefined) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (!digits) {
      return 'Sem numero vinculado'
    }

    if (digits.length < 8) {
      return `+${digits}`
    }

    const country = digits.startsWith('55') ? '+55' : `+${digits.slice(0, 2)}`
    const national = digits.startsWith('55') ? digits.slice(2) : digits.slice(2)
    const ddd = national.slice(0, 2)
    const local = national.slice(2)

    if (!ddd || !local) {
      return `+${digits}`
    }

    const prefix = local.length > 4 ? local.slice(0, local.length - 4) : local
    const suffix = local.length > 4 ? local.slice(-4) : ''

    return `${country} (${ddd}) ${prefix}${suffix ? ` - ${suffix}` : ''}`.replace(/\s+/g, ' ').trim()
  }

  const loadConnections = async () => {
    try {
      const data = await apiFetch<WhatsAppConnectionItem[]>('/api/whatsapp/connections')
      setConnections(data)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao listar conexoes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConnections()
    const timer = window.setInterval(() => {
      void loadConnections()
    }, 7000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null
    let currentSessionId: string | null = null

    const startAndPollQr = async () => {
      if (!showAdd || mode !== 'qr') {
        setActiveSessionId(null)
        return
      }

      setIsQrStarting(true)
      try {
        const created = await apiFetch<{ id: string; status: string }>('/api/whatsapp/connections', { method: 'POST' })
        if (!created?.id) {
          throw new Error('Nao foi possivel criar sessao de conexao.')
        }
        currentSessionId = created.id
        setActiveSessionId(created.id)
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Falha ao iniciar conexao por QR')
        }
      } finally {
        if (!cancelled) {
          setIsQrStarting(false)
        }
      }

      if (cancelled) {
        return
      }

      const poll = async () => {
        if (!currentSessionId) {
          return
        }

        try {
          const qr = await apiFetch<WhatsAppQrResponse>(`/api/whatsapp/qr?sessionId=${encodeURIComponent(currentSessionId)}`)
          if (!cancelled) {
            setQrDataUrl(qr.qrDataUrl)
            if (qr.qrDataUrl) {
              setPairingCode(null)
              setMessage('Escaneie o QR para vincular.')
            }
          }
        } catch {
          // QR can be temporarily unavailable while connecting.
        }
      }

      await poll()
      intervalId = window.setInterval(() => {
        void poll()
        void loadConnections()
      }, 3500)
    }

    void startAndPollQr()

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [showAdd, mode])

  const handleConnectByNumber = async () => {
    setBusy(true)
    try {
      const created = await apiFetch<{ id: string; status: string }>('/api/whatsapp/connections', { method: 'POST' })
      const sessionId = created?.id
      if (!sessionId) {
        throw new Error('Nao foi possivel criar sessao para codigo de vinculacao.')
      }

      setActiveSessionId(sessionId)
      const payload = await apiFetch<WhatsAppPairingCodeResponse>(`/api/whatsapp/pairing-code?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: pairingPhone }),
      })
      setPairingCode(payload.pairingCode)
      setQrDataUrl(null)
      setMessage(payload.pairingCode ? 'Codigo de vinculacao gerado.' : 'Nao foi possivel gerar codigo de vinculacao.')
      await loadConnections()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao vincular por numero')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async (sessionId: string) => {
    const confirmStep1 = window.confirm('Tem certeza que deseja desconectar este WhatsApp?')
    if (!confirmStep1) {
      return
    }

    const confirmStep2 = window.confirm('Confirmacao final: desconectar agora?')
    if (!confirmStep2) {
      return
    }

    setBusy(true)
    try {
      await apiFetch<null>(`/api/whatsapp/disconnect?sessionId=${encodeURIComponent(sessionId)}`, { method: 'POST' })
      setPairingCode(null)
      setQrDataUrl(null)
      if (activeSessionId === sessionId) {
        setActiveSessionId(null)
      }
      setMessage('Conexao encerrada com sucesso.')
      await loadConnections()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao desconectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container wa-connections-page">
      <div className="wa-header">
        <h1>Conexoes WhatsApp</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd((value) => !value)}>
          {showAdd ? 'Fechar' : 'Adicionar conexao'}
        </button>
      </div>

      {message && <p className="wa-message">{message}</p>}

      {showAdd && (
        <section className="wa-add-card">
          <h2>Nova conexao</h2>
          <div className="wa-mode-switch">
            <button className={mode === 'qr' ? 'active' : ''} onClick={() => setMode('qr')}>Vincular com QR</button>
            <button className={mode === 'number' ? 'active' : ''} onClick={() => setMode('number')}>Vincular com numero</button>
          </div>

          {mode === 'qr' && (
            <div className="wa-add-content">
              <p className="wa-hint">
                {isQrStarting ? 'Iniciando conexao...' : 'Aguardando QR. O codigo e atualizado automaticamente.'}
              </p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR de vinculacao" className="wa-qr" />
              ) : (
                <div className="wa-qr-placeholder">QR ainda nao disponivel. Aguarde alguns segundos...</div>
              )}
            </div>
          )}

          {mode === 'number' && (
            <div className="wa-add-content">
              <input
                type="text"
                placeholder="Numero com DDI e DDD. Ex: 5545999999999"
                value={pairingPhone}
                onChange={(event) => setPairingPhone(event.target.value)}
              />
              <button className="btn" onClick={() => void handleConnectByNumber()} disabled={busy}>Gerar codigo</button>
              {pairingCode && <p className="pair-code">Codigo: {pairingCode}</p>}
            </div>
          )}
        </section>
      )}

      <section className="wa-list-card">
        <h2>WhatsApps conectados</h2>
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <ul className="wa-connection-list">
            {connectedConnections.map((item) => (
              <li key={item.id}>
                <div className="wa-connection-main">
                  <strong>{formatPhone(item.phoneNumber)}</strong>
                  <span className="wa-inline-status">Conectado</span>
                </div>
                <button className="btn btn-danger" onClick={() => void handleDisconnect(item.id)} disabled={busy}>Desconectar</button>
              </li>
            ))}
            {connectedConnections.length === 0 && <li>Nenhuma conexão ativa no momento.</li>}
          </ul>
        )}
      </section>
    </div>
  )
}
