import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { ChatFlowListItem } from '../types'
import { Card, EmptyState } from '../components/UI'
import '../styles/modern.css'

export function ChatFlowsList() {
  const [flows, setFlows] = useState<ChatFlowListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      setLoading(true)
      const data = await apiFetch<ChatFlowListItem[]>('/api/chat-flows')
      setFlows(data || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar fluxos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este fluxo? Conversas em andamento nele serão encerradas.')) return
    try {
      await apiFetch<void>(`/api/chat-flows/${id}`, { method: 'DELETE' })
      setFlows(flows.filter(f => f.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha ao remover fluxo')
    }
  }

  if (loading) return <div className="container"><div style={{ padding: '40px', textAlign: 'center' }}>⏳ Carregando fluxos...</div></div>
  if (error) return <div className="container"><div style={{ padding: '40px', color: '#dc2626' }}>❌ {error}</div></div>

  return (
    <div className="container" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1>🤖 Chatbot</h1>
        <p style={{ color: '#666', marginBottom: '12px' }}>
          Fluxos de perguntas e respostas programadas. Um fluxo só é disparado quando uma mensagem de uma Regra de
          Negócio for configurada para usá-lo — não existe mais "fluxo sempre ativo".
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/chatbot/new')}>
          ➕ Novo Fluxo
        </button>
      </div>

      {flows.length === 0 ? (
        <EmptyState
          icon="🤖"
          title="Nenhum fluxo cadastrado"
          text="Crie um fluxo de perguntas e respostas pra automatizar a conversa"
          action={<button className="btn btn-primary" onClick={() => navigate('/chatbot/new')}>Criar Fluxo</button>}
        />
      ) : (
        <Card>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Etapas</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {flows.map(flow => (
                <tr key={flow.id}>
                  <td style={{ fontWeight: 500 }}>{flow.name}</td>
                  <td>{flow.stepCount}</td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/chatbot/${flow.id}/edit`)}>
                      ✏️ Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(flow.id)}>
                      🗑️ Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
