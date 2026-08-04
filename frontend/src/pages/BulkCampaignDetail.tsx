import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { BulkCampaign, BulkCampaignItemStatus, BulkCampaignStatus } from '../types'
import { Card, CardHeader, CardTitle, Badge, EmptyState } from '../components/UI'
import '../styles/modern.css'

const POLL_INTERVAL_MS = 1500

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR')
}

function getCampaignStatusLabel(status: BulkCampaignStatus): string {
  switch (status) {
    case 'Running': return 'Em andamento'
    case 'Completed': return 'Concluído'
    case 'Cancelled': return 'Cancelado'
    case 'Aborted': return 'Interrompido (erro)'
    case 'Interrupted': return 'Interrompido (servidor reiniciou)'
    default: return status
  }
}

function getCampaignStatusVariant(status: BulkCampaignStatus): 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'Completed': return 'success'
    case 'Running': return 'info'
    case 'Cancelled': return 'warning'
    default: return 'danger'
  }
}

function getItemStatusLabel(status: BulkCampaignItemStatus): string {
  switch (status) {
    case 'Sending': return 'Enviando'
    case 'Sent': return 'Enviado'
    case 'Failed': return 'Erro'
    case 'Cancelled': return 'Cancelado'
    default: return 'Pendente'
  }
}

function getItemStatusVariant(status: BulkCampaignItemStatus): 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'Sent': return 'success'
    case 'Failed': return 'danger'
    case 'Sending': return 'warning'
    case 'Cancelled': return 'warning'
    default: return 'info'
  }
}

export function BulkCampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState<BulkCampaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const pollRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const data = await apiFetch<BulkCampaign>(`/api/messages/bulk/${id}`)
      setCampaign(data)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!campaign || campaign.status !== 'Running') {
      return
    }

    pollRef.current = window.setInterval(() => {
      void load()
    }, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [campaign, load])

  const cancel = async () => {
    if (!id) return
    setCancelling(true)
    try {
      const updated = await apiFetch<BulkCampaign>(`/api/messages/bulk/${id}/cancel`, { method: 'POST' })
      setCampaign(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao cancelar envio')
    } finally {
      setCancelling(false)
    }
  }

  const retry = () => navigate(`/messages/bulk?retryFrom=${id}`)

  if (loading) {
    return <div className="container" style={{ padding: '24px', textAlign: 'center' }}>⏳ Carregando campanha...</div>
  }

  if (notFound || !campaign) {
    return (
      <div className="container" style={{ padding: '24px' }}>
        <EmptyState icon="🔍" title="Campanha não encontrada" text="Ela pode ter sido removida ou pertence a outro usuário." />
      </div>
    )
  }

  const processedCount = campaign.sentCount + campaign.failedCount
  const cancelledCount = campaign.items.filter(i => i.status === 'Cancelled').length
  const progressPercent = campaign.totalCount > 0
    ? Math.min(100, Math.round(((processedCount + cancelledCount) / campaign.totalCount) * 100))
    : 0
  const hasRetryCandidates = campaign.status !== 'Running' && campaign.items.some(i => i.status !== 'Sent')

  return (
    <div className="container" style={{ padding: '24px' }}>
      <h1>📊 Campanha de Envio #{campaign.id}</h1>

      <Card style={{ marginBottom: '24px' }}>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Badge variant={getCampaignStatusVariant(campaign.status)}>{getCampaignStatusLabel(campaign.status)}</Badge>
          <span style={{ fontSize: '13px', color: '#666' }}>
            Criada em {formatDateTime(campaign.createdAtUtc)}
            {campaign.finishedAtUtc ? ` · Finalizada em ${formatDateTime(campaign.finishedAtUtc)}` : ''}
          </span>
        </div>

        <div style={{
          padding: '12px',
          backgroundColor: '#f9fafb',
          borderRadius: '6px',
          border: '1px dashed #d1d5db',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#374151',
          marginBottom: '16px'
        }}>
          {campaign.greeting} [Nome]!
          {'\n'}
          {campaign.messageTemplate}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>{processedCount + cancelledCount}/{campaign.totalCount} processados</span>
            <span>{progressPercent}%</span>
          </div>
          <div style={{ width: '100%', height: '10px', background: '#e5e7eb', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: campaign.status === 'Aborted' ? '#ef4444' : campaign.status === 'Cancelled' ? '#f59e0b' : '#10b981',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div style={{ padding: '16px', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #10b981' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#065f46' }}>{campaign.sentCount}</div>
            <div style={{ color: '#065f46', fontSize: '14px' }}>Enviados</div>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #ef4444' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7f1d1d' }}>{campaign.failedCount}</div>
            <div style={{ color: '#7f1d1d', fontSize: '14px' }}>Falhas</div>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#92400e' }}>{cancelledCount}</div>
            <div style={{ color: '#92400e', fontSize: '14px' }}>Cancelados</div>
          </div>

          <div style={{ padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #d1d5db' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>{campaign.intervalSeconds}s</div>
            <div style={{ color: '#374151', fontSize: '14px' }}>Intervalo</div>
          </div>
        </div>

        {campaign.abortReason && (
          <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #ef4444', color: '#7f1d1d' }}>
            Envio interrompido: {campaign.abortReason}
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px' }}>
          {campaign.status === 'Running' && (
            <button className="btn btn-danger" onClick={cancel} disabled={cancelling}>
              {cancelling ? '⏳ Cancelando...' : '🛑 Cancelar envio'}
            </button>
          )}
          {hasRetryCandidates && (
            <button className="btn btn-primary" onClick={retry}>
              🔁 Reenviar pendentes/falhas
            </button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Destinatários ({campaign.items.length})</CardTitle>
        </CardHeader>

        <div style={{ maxHeight: '480px', overflowY: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Contato</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Detalhe</th>
                <th>Processado em</th>
              </tr>
            </thead>
            <tbody>
              {campaign.items.map(item => (
                <tr key={item.id}>
                  <td>{item.contactName}</td>
                  <td><code style={{ background: '#f3f4f6', padding: '2px 8px' }}>{item.phoneNumber}</code></td>
                  <td>
                    <Badge variant={getItemStatusVariant(item.status)}>
                      {getItemStatusLabel(item.status)}
                    </Badge>
                  </td>
                  <td style={{ fontSize: '12px', color: '#666' }}>{item.statusDetail || '—'}</td>
                  <td style={{ fontSize: '12px', color: '#666' }}>{formatDateTime(item.processedAtUtc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
