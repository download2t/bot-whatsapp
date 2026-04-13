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

    const startAndPollQr = async () => {
      if (!showAdd || mode !== 'qr') {
        return
      }

      setIsQrStarting(true)
      try {
        await apiFetch<null>('/api/whatsapp/connect', { method: 'POST' })
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
        try {
          const qr = await apiFetch<WhatsAppQrResponse>('/api/whatsapp/qr')
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
      await apiFetch<null>('/api/whatsapp/connect', { method: 'POST' })
      const payload = await apiFetch<WhatsAppPairingCodeResponse>('/api/whatsapp/pairing-code', {
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

  const handleDisconnect = async () => {
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
      await apiFetch<null>('/api/whatsapp/disconnect', { method: 'POST' })
      setPairingCode(null)
      setQrDataUrl(null)
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
            {connections.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.phoneNumber || 'Sem numero vinculado'}</strong>
                  <p>Status: {item.status}</p>
                </div>
                {item.isConnected ? (
                  <button className="btn btn-danger" onClick={() => void handleDisconnect()} disabled={busy}>Desconectar</button>
                ) : (
                  <span className="wa-disconnected">Desconectado</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
