import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { BulkCampaignListItem, BulkCampaignStatus } from '../types'
import { Card, Badge, EmptyState } from '../components/UI'
import '../styles/modern.css'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR')
}

function getStatusLabel(status: BulkCampaignStatus): string {
  switch (status) {
    case 'Running': return 'Em andamento'
    case 'Completed': return 'Concluído'
    case 'Cancelled': return 'Cancelado'
    case 'Aborted': return 'Interrompido (erro)'
    case 'Interrupted': return 'Interrompido (servidor reiniciou)'
    default: return status
  }
}

function getStatusVariant(status: BulkCampaignStatus): 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'Completed': return 'success'
    case 'Running': return 'info'
    case 'Cancelled': return 'warning'
    default: return 'danger'
  }
}

export function BulkCampaignHistory() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState<BulkCampaignListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch<BulkCampaignListItem[]>('/api/messages/bulk')
        setCampaigns(data || [])
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Falha ao carregar histórico de envios')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="container" style={{ padding: '24px' }}>
      <h1>🗂️ Histórico de Envios em Lote</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Auditoria de todas as campanhas de envio em massa — inclusive as que continuaram rodando depois que você saiu da tela.
        Aqui também dá para cancelar uma campanha em andamento a qualquer momento.
      </p>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>⏳ Carregando...</div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon="📭"
            title="Nenhum envio em lote ainda"
            text="Quando você disparar um envio em massa, ele vai aparecer aqui."
          />
        ) : (
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Mensagem</th>
                  <th>Status</th>
                  <th>Enviados</th>
                  <th>Falhas</th>
                  <th>Total</th>
                  <th>Criada em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(campaign => (
                  <tr
                    key={campaign.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/messages/bulk/${campaign.id}`)}
                  >
                    <td>{campaign.id}</td>
                    <td style={{ maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {campaign.messageTemplate}
                    </td>
                    <td><Badge variant={getStatusVariant(campaign.status)}>{getStatusLabel(campaign.status)}</Badge></td>
                    <td>{campaign.sentCount}</td>
                    <td>{campaign.failedCount}</td>
                    <td>{campaign.totalCount}</td>
                    <td style={{ fontSize: '13px', color: '#666' }}>{formatDateTime(campaign.createdAtUtc)}</td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => { e.stopPropagation(); navigate(`/messages/bulk/${campaign.id}`) }}
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
