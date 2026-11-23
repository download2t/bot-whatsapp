import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api'
import { formatBrazilDateTime } from '../lib/brazilTime'
import { Badge } from '../components/UI'
import type { HealthAction, HealthFinding, HealthLevel, HealthSession, SystemHealth } from '../types'
import '../styles/modern.css'
import './SystemHealthPage.css'

const AUTO_REFRESH_MS = 15000

const LEVEL_BADGE: Record<HealthLevel, 'danger' | 'warning' | 'info' | 'success'> = {
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  ok: 'success',
}

const LEVEL_LABEL: Record<HealthLevel, string> = {
  danger: 'Problema',
  warning: 'Atenção',
  info: 'Aviso',
  ok: 'Tudo certo',
}

const SESSION_STATUS_LABEL: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' }> = {
  connected: { label: 'Conectada', variant: 'success' },
  'qr-required': { label: 'Aguardando QR', variant: 'warning' },
  connecting: { label: 'Conectando', variant: 'info' },
  authenticating: { label: 'Autenticando', variant: 'info' },
  initializing: { label: 'Iniciando', variant: 'info' },
  disconnected: { label: 'Desconectada', variant: 'warning' },
  'auth-failure': { label: 'Falha de login', variant: 'danger' },
  error: { label: 'Erro', variant: 'danger' },
}

type LogEntry = { id: number; at: string; ok: boolean; text: string }

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}min`
  if (minutes > 0) return `${minutes} min`
  return `${seconds}s`
}

function formatMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${mb} MB`
}

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  try {
    const parsed = JSON.parse(raw) as { error?: string }
    if (parsed?.error) return parsed.error
  } catch {
    // not JSON
  }
  return raw || 'Erro desconhecido'
}

function overallLevel(findings: HealthFinding[]): 'danger' | 'warning' | 'ok' {
  if (findings.some((item) => item.level === 'danger')) return 'danger'
  if (findings.some((item) => item.level === 'warning')) return 'warning'
  return 'ok'
}

const BANNER: Record<'danger' | 'warning' | 'ok', { icon: string; title: string }> = {
  danger: { icon: '🔴', title: 'Há problemas que precisam de atenção' },
  warning: { icon: '🟡', title: 'Funcionando, mas com pontos de atenção' },
  ok: { icon: '🟢', title: 'Sistema saudável' },
}

export function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bridgeDown, setBridgeDown] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const logId = useRef(0)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SystemHealth>('/api/system-health')
      setHealth(data)
      setLoadError(null)
      setBridgeDown(false)
      return true
    } catch (error) {
      const text = errorText(error)
      if (/bridge n[ãa]o responde/i.test(text)) {
        setBridgeDown(true)
        setLoadError(null)
      } else {
        setLoadError(text)
      }
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!autoRefresh || restarting) return
    const timer = window.setInterval(() => {
      if (busyKey === null) void load()
    }, AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [autoRefresh, restarting, busyKey, load])

  const addLog = (ok: boolean, text: string) => {
    logId.current += 1
    const entry: LogEntry = { id: logId.current, at: new Date().toISOString(), ok, text }
    setLog((current) => [entry, ...current].slice(0, 12))
  }

  const waitForBridge = async () => {
    setRestarting(true)
    // The bridge needs a moment to go down before it can come back; give it a head start.
    await new Promise((resolve) => window.setTimeout(resolve, 4000))
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await load()) {
        addLog(true, 'Bridge reiniciado e respondendo de novo. As sessões podem levar 1-2 minutos para reconectar.')
        setRestarting(false)
        return
      }
      await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }
    addLog(false, 'O bridge não voltou em 1,5 minuto. Verifique no servidor: systemctl status mydev_bridge')
    setRestarting(false)
  }

  const run = async (key: string, confirmations: string[], path: string, describe: (result: unknown) => string) => {
    for (const message of confirmations) {
      if (!window.confirm(message)) return
    }

    setBusyKey(key)
    try {
      const result = await apiFetch<unknown>(path, { method: 'POST' })
      addLog(true, describe(result))
      if (key === 'restart-bridge') {
        await waitForBridge()
      } else {
        await load()
      }
    } catch (error) {
      addLog(false, `Falhou: ${errorText(error)}`)
    } finally {
      setBusyKey(null)
    }
  }

  const cleanupChrome = () =>
    run(
      'cleanup-chrome',
      ['Finalizar os processos Chrome órfãos e limpar bloqueios antigos?\n\nSessões ativas não são afetadas.'],
      '/api/system-health/actions/cleanup-chrome',
      (result) => {
        const killed = (result as { killedProcesses?: number } | null)?.killedProcesses ?? 0
        return killed > 0
          ? `Limpeza concluída: ${killed} processo(s) Chrome órfão(s) finalizado(s).`
          : 'Limpeza concluída: não havia Chrome órfão rodando (bloqueios antigos foram removidos, se existiam).'
      },
    )

  const restartSession = (sessionId: string) =>
    run(
      `restart-${sessionId}`,
      [`Reiniciar a sessão "${sessionId}"?\n\nEla fica fora do ar por alguns segundos e reconecta sozinha. Se o QR Code for pedido de novo, o dono precisa escanear.`],
      `/api/system-health/sessions/${encodeURIComponent(sessionId)}/restart`,
      () => `Sessão "${sessionId}" reiniciada. Acompanhe o status abaixo.`,
    )

  const removeSession = (sessionId: string) => {
    const isUserSession = /^user-\d+$/.test(sessionId)
    const confirmations = [
      `Remover DEFINITIVAMENTE a sessão "${sessionId}"?\n\nO WhatsApp dela é desconectado e apagado do servidor. Para voltar, será preciso escanear um QR Code novo. Não dá para desfazer.`,
    ]
    if (isUserSession) {
      confirmations.push(
        `Atenção: "${sessionId}" é a conexão de um usuário real do sistema, não uma sessão de teste.\n\nTem certeza de que quer remover?`,
      )
    }

    return run(
      `remove-${sessionId}`,
      confirmations,
      `/api/system-health/sessions/${encodeURIComponent(sessionId)}/remove`,
      () => `Sessão "${sessionId}" removida do servidor.`,
    )
  }

  const restartBridge = () =>
    run(
      'restart-bridge',
      [
        'Reiniciar o bridge do WhatsApp?\n\nTODAS as sessões caem e reconectam sozinhas em 1-2 minutos (pode demorar mais se a CPU estiver limitada). Mensagens recebidas nesse intervalo podem não ser respondidas automaticamente.',
      ],
      '/api/system-health/actions/restart-bridge',
      () => 'Reinício do bridge solicitado. Aguardando ele voltar...',
    )

  const runAction = (action: HealthAction) => {
    if (action.type === 'cleanup-chrome') return cleanupChrome()
    if (action.type === 'restart-session') return restartSession(action.sessionId)
    return removeSession(action.sessionId)
  }

  const actionLabel = (action: HealthAction): string => {
    if (action.type === 'cleanup-chrome') return '🧹 Limpar Chrome órfão'
    if (action.type === 'restart-session') return `🔄 Reiniciar sessão ${action.sessionId}`
    return `🗑️ Remover sessão ${action.sessionId}`
  }

  const actionKey = (action: HealthAction): string =>
    action.type === 'cleanup-chrome' ? 'cleanup-chrome' : `${action.type === 'restart-session' ? 'restart' : 'remove'}-${action.sessionId}`

  const busy = busyKey !== null || restarting

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Verificando o sistema...</div>
      </div>
    )
  }

  const level = health ? overallLevel(health.findings) : 'danger'
  const memory = health?.system.memory
  const availablePercent = memory && memory.totalMb > 0 ? Math.round((memory.availableMb / memory.totalMb) * 100) : null
  const chromeTotal =
    (health?.sessions.reduce((sum, item) => sum + (item.chrome?.processCount ?? 0), 0) ?? 0) +
    (health?.orphanChrome.reduce((sum, item) => sum + item.processCount, 0) ?? 0)

  return (
    <div className="container sh-page">
      <div className="sh-header">
        <div>
          <h1>🩺 Saúde do Sistema</h1>
          {health && <p className="sh-muted">Atualizado em {formatBrazilDateTime(health.generatedAtUtc)}</p>}
        </div>
        <div className="sh-header-actions">
          <label className="sh-check">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            Atualizar sozinho (15s)
          </label>
          <button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>
            🔄 Atualizar agora
          </button>
        </div>
      </div>

      {restarting && (
        <div className="alert alert-info">⏳ Reiniciando o bridge... aguardando ele voltar. Isso leva de alguns segundos a 1 minuto.</div>
      )}

      {loadError && <div className="alert alert-danger">{loadError}</div>}

      {bridgeDown && !restarting && (
        <div className="sh-card sh-bridge-down">
          <h2>🔴 O bridge do WhatsApp não está respondendo</h2>
          <p>
            Sem o bridge ninguém consegue conectar nem enviar mensagens, e este painel não consegue reiniciá-lo (ele é quem
            executa as ações). Reinicie pelo servidor:
          </p>
          <pre className="sh-code">systemctl restart mydev_bridge{'\n'}systemctl status mydev_bridge --no-pager</pre>
          <p className="sh-muted">Se ele cair de novo logo em seguida, veja o motivo com: journalctl -u mydev_bridge -n 60 --no-pager</p>
        </div>
      )}

      {health && (
        <>
          <div className={`sh-banner sh-banner-${level}`}>
            <span className="sh-banner-icon">{BANNER[level].icon}</span>
            <strong>{BANNER[level].title}</strong>
          </div>

          <section className="sh-card">
            <h2>Diagnóstico</h2>
            <ul className="sh-findings">
              {health.findings.map((finding) => (
                <li key={finding.id} className={`sh-finding sh-finding-${finding.level}`}>
                  <div className="sh-finding-head">
                    <Badge variant={LEVEL_BADGE[finding.level]}>{LEVEL_LABEL[finding.level]}</Badge>
                    <strong>{finding.title}</strong>
                  </div>
                  <p>{finding.detail}</p>
                  {finding.action && (
                    <button
                      className={`btn btn-sm ${finding.action.type === 'remove-session' ? 'btn-danger' : 'btn-primary'}`}
                      disabled={busy}
                      onClick={() => void runAction(finding.action as HealthAction)}
                    >
                      {busyKey === actionKey(finding.action) ? 'Executando...' : actionLabel(finding.action)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="sh-metrics">
            <div className="sh-metric">
              <span className="sh-metric-label">Carga (1 / 5 / 15 min)</span>
              <strong>{health.system.supported ? health.system.loadAverage.join(' / ') : '—'}</strong>
              <span className="sh-muted">{health.system.cpuCount} núcleo(s) — ideal abaixo de {health.system.cpuCount}</span>
            </div>
            <div className="sh-metric">
              <span className="sh-metric-label">CPU roubada pelo provedor</span>
              <strong>{health.system.cpu ? `${health.system.cpu.stealPercent}%` : '—'}</strong>
              <span className="sh-muted">Normal: perto de 0%. Alto = limite da VPS</span>
            </div>
            <div className="sh-metric">
              <span className="sh-metric-label">Memória disponível</span>
              <strong>{memory && memory.totalMb > 0 ? `${formatMb(memory.availableMb)} (${availablePercent}%)` : '—'}</strong>
              <span className="sh-muted">{memory && memory.totalMb > 0 ? `de ${formatMb(memory.totalMb)}` : ''}</span>
            </div>
            <div className="sh-metric">
              <span className="sh-metric-label">Swap em uso</span>
              <strong>{memory && memory.swapTotalMb > 0 ? `${formatMb(memory.swapUsedMb)}` : '—'}</strong>
              <span className="sh-muted">{memory && memory.swapTotalMb > 0 ? `de ${formatMb(memory.swapTotalMb)}` : ''}</span>
            </div>
            <div className="sh-metric">
              <span className="sh-metric-label">Processos Chrome</span>
              <strong>{health.system.supported ? chromeTotal : '—'}</strong>
              <span className="sh-muted">Esperado: ~12 por sessão conectada</span>
            </div>
            <div className="sh-metric">
              <span className="sh-metric-label">Servidor ligado há</span>
              <strong>{formatDuration(health.system.hostUptimeSeconds)}</strong>
              <span className="sh-muted">Bridge: {formatDuration(health.bridge.uptimeSeconds)}</span>
            </div>
          </section>

          <section className="sh-card">
            <h2>Sessões do WhatsApp</h2>
            {health.sessions.length === 0 ? (
              <p className="sh-muted">Nenhuma sessão registrada no bridge agora.</p>
            ) : (
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th>Sessão</th>
                      <th>Tipo</th>
                      <th>Status</th>
                      <th>Chrome</th>
                      <th>CPU</th>
                      <th>Memória</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.sessions.map((session: HealthSession) => {
                      const status = SESSION_STATUS_LABEL[session.status] ?? { label: session.status, variant: 'info' as const }
                      const legacy = session.ownerUserId === null
                      return (
                        <tr key={session.id}>
                          <td>
                            <strong>{session.id}</strong>
                            {session.lastError && <div className="sh-error-text">{session.lastError}</div>}
                          </td>
                          <td>{legacy ? <Badge variant="warning">Legada (sem dono)</Badge> : <Badge variant="info">Usuário {session.ownerUserId}</Badge>}</td>
                          <td>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </td>
                          <td>
                            {session.chrome ? (
                              <>
                                {session.chrome.processCount} proc.
                                {session.chrome.mainProcessCount > 1 && <span className="sh-warn"> ({session.chrome.mainProcessCount} principais!)</span>}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{session.chrome ? `${session.chrome.cpuPercent}%` : '—'}</td>
                          <td>{session.chrome ? formatMb(session.chrome.memMb) : '—'}</td>
                          <td className="sh-row-actions">
                            <button className="btn btn-sm btn-secondary" disabled={busy} onClick={() => void restartSession(session.id)}>
                              🔄 Reiniciar
                            </button>
                            <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => void removeSession(session.id)}>
                              🗑️ Remover
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {health.orphanChrome.length > 0 && (
              <p className="sh-warn">
                ⚠️ Chrome órfão detectado: {health.orphanChrome.map((item) => `${item.sessionId} (${item.processCount} proc.)`).join(', ')}
              </p>
            )}
          </section>

          <section className="sh-card">
            <h2>Processos que mais usam CPU agora</h2>
            {!health.system.supported ? (
              <p className="sh-muted">Disponível só no servidor Linux.</p>
            ) : health.system.topProcesses.length === 0 ? (
              <p className="sh-muted">Nenhum processo relevante consumindo CPU neste instante.</p>
            ) : (
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th>Processo</th>
                      <th>PID</th>
                      <th>CPU</th>
                      <th>Memória</th>
                      <th>Rodando há</th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.system.topProcesses.map((proc) => (
                      <tr key={proc.pid}>
                        <td>
                          <strong>{proc.name}</strong>
                          {proc.sessionId && <span className="sh-muted"> — sessão {proc.sessionId}</span>}
                          {proc.detail && <div className="sh-muted sh-detail">{proc.detail}</div>}
                        </td>
                        <td>{proc.pid}</td>
                        <td>{proc.cpuPercent}%</td>
                        <td>{formatMb(proc.memMb)}</td>
                        <td>{formatDuration(proc.uptimeSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="sh-muted">100% = um núcleo inteiro. Processos que não são do bot (.NET, SQL Server...) também aparecem aqui.</p>
          </section>

          <section className="sh-card">
            <h2>Manutenção</h2>
            <div className="sh-maintenance">
              <div>
                <button className="btn btn-secondary" disabled={busy} onClick={() => void cleanupChrome()}>
                  {busyKey === 'cleanup-chrome' ? 'Executando...' : '🧹 Limpar Chrome órfão'}
                </button>
                <p className="sh-muted">Finaliza Chromes que não pertencem a nenhuma sessão e remove bloqueios antigos. Não derruba sessões ativas.</p>
              </div>
              <div>
                <button className="btn btn-danger" disabled={busy || !health.bridge.canRestart} onClick={() => void restartBridge()}>
                  {busyKey === 'restart-bridge' ? 'Executando...' : '⚡ Reiniciar bridge do WhatsApp'}
                </button>
                <p className="sh-muted">
                  {health.bridge.canRestart
                    ? 'Derruba TODAS as sessões por 1-2 minutos. Use quando o resto não resolver.'
                    : 'Indisponível neste ambiente (só funciona no servidor Linux com systemd).'}
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {log.length > 0 && (
        <section className="sh-card">
          <h2>Registro das ações desta tela</h2>
          <ul className="sh-log">
            {log.map((entry) => (
              <li key={entry.id} className={entry.ok ? 'sh-log-ok' : 'sh-log-fail'}>
                <span className="sh-muted">{formatBrazilDateTime(entry.at, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> {entry.ok ? '✅' : '❌'} {entry.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
