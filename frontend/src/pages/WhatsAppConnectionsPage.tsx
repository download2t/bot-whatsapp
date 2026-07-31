import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { WhatsAppConnectionStatus, WhatsAppPairingCodeResponse, WhatsAppQrResponse } from '../types'
import './WhatsAppConnectionsPage.css'

export function WhatsAppConnectionsPage() {
  const [status, setStatus] = useState<WhatsAppConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'qr' | 'number'>('qr')
  const [pairingPhone, setPairingPhone] = useState('')
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [message, setMessage] = useState('')

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

  const loadStatus = async () => {
    try {
      const data = await apiFetch<WhatsAppConnectionStatus>('/api/whatsapp/status')
      setStatus(data)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao consultar status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
    const timer = window.setInterval(() => void loadStatus(), 5000)
    return () => window.clearInterval(timer)
  }, [])

  // While disconnected and QR mode selected, kick off a connection and poll for the QR code.
  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null

    const startAndPollQr = async () => {
      if (status?.isConnected || mode !== 'qr') {
        return
      }

      try {
        await apiFetch('/api/whatsapp/connect', { method: 'POST' })
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Falha ao iniciar conexao por QR')
        }
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
        void loadStatus()
      }

      await poll()
      intervalId = window.setInterval(() => void poll(), 3500)
    }

    void startAndPollQr()

    return () => {
      cancelled = true
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, status?.isConnected])

  const handleConnectByNumber = async () => {
    setBusy(true)
    try {
      await apiFetch('/api/whatsapp/connect', { method: 'POST' })
      const payload = await apiFetch<WhatsAppPairingCodeResponse>('/api/whatsapp/pairing-code', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: pairingPhone }),
      })
      setPairingCode(payload.pairingCode)
      setQrDataUrl(null)
      setMessage(payload.pairingCode ? 'Codigo de vinculacao gerado.' : 'Nao foi possivel gerar codigo de vinculacao.')
      await loadStatus()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao vincular por numero')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    const confirmStep1 = window.confirm('Tem certeza que deseja desconectar seu WhatsApp?')
    if (!confirmStep1) {
      return
    }

    setBusy(true)
    try {
      await apiFetch('/api/whatsapp/disconnect', { method: 'POST' })
      setPairingCode(null)
      setQrDataUrl(null)
      setMessage('Conexao encerrada com sucesso.')
      await loadStatus()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao desconectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container wa-connections-page">
      <div className="wa-header">
        <h1>Meu WhatsApp</h1>
      </div>

      {message && <p className="wa-message">{message}</p>}

      <section className="wa-list-card">
        <h2>Status da conexão</h2>
        {loading ? (
          <p>Carregando...</p>
        ) : status?.isConnected ? (
          <div className="wa-connection-main">
            <strong>{formatPhone(status.phoneNumber)}</strong>
            <span className="wa-inline-status">Conectado</span>
          </div>
        ) : (
          <p>Nenhum WhatsApp conectado no momento.</p>
        )}

        {status?.isConnected && (
          <button className="btn btn-danger" onClick={() => void handleDisconnect()} disabled={busy} style={{ marginTop: '12px' }}>
            Desconectar
          </button>
        )}
      </section>

      {!status?.isConnected && (
        <section className="wa-add-card">
          <h2>Vincular WhatsApp</h2>
          <div className="wa-mode-switch">
            <button className={mode === 'qr' ? 'active' : ''} onClick={() => setMode('qr')}>Vincular com QR</button>
            <button className={mode === 'number' ? 'active' : ''} onClick={() => setMode('number')}>Vincular com numero</button>
          </div>

          {mode === 'qr' && (
            <div className="wa-add-content">
              <p className="wa-hint">O codigo e atualizado automaticamente.</p>
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
    </div>
  )
}
