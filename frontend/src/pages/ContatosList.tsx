import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import type { Contato, Turma } from '../types'
import { Card, Badge, EmptyState } from '../components/UI'
import '../styles/modern.css'

export function ContatosList() {
  const [items, setItems] = useState<Contato[]>([])
  const [turmas, setTurmas] = useState<Turma[]>([])
  const [loading, setLoading] = useState(true)
  const [filterName, setFilterName] = useState('')
  const [filterPhone, setFilterPhone] = useState('')
  const [filterTurma, setFilterTurma] = useState<number | ''>('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const navigate = useNavigate()

  const load = async () => {
    try {
      setLoading(true)
      const t = await apiFetch<Turma[]>('/api/turmas')
      setTurmas(t || [])

      const params = new URLSearchParams()
      if (filterTurma) params.set('turmaId', String(filterTurma))
      if (filterName) params.set('name', filterName)
      if (filterPhone) params.set('phone', filterPhone)

      let c = await apiFetch<Contato[]>(`/api/contatos?${params.toString()}`)
      c = c || []
      
      if (filterStatus === 'active') c = c.filter(x => x.isActive)
      else if (filterStatus === 'inactive') c = c.filter(x => !x.isActive)

      setItems(c)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [filterName, filterPhone, filterTurma, filterStatus])

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este contato?')) return
    try {
      await apiFetch<void>(`/api/contatos/${id}`, { method: 'DELETE' })
      setItems(items.filter(i => i.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Falha')
    }
  }

  return (
    <div className="container" style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1>👥 Contatos</h1>
        <button className="btn btn-primary" onClick={() => navigate('/contatos/new')}>
          ➕ Novo Contato
        </button>
      </div>

      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label>🎓 Filtrar por Turma</label>
            <select value={filterTurma} onChange={e => setFilterTurma(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Todas as turmas</option>
              {turmas.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          
          <div>
            <label>📊 Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
              <option value="all">Todos</option>
              <option value="active">✅ Ativos</option>
              <option value="inactive">❌ Inativos</option>
            </select>
          </div>

          <div>
            <label>🔍 Buscar por Nome</label>
            <input 
              type="text"
              placeholder="Digite o nome..." 
              value={filterName} 
              onChange={e => setFilterName(e.target.value)} 
            />
          </div>

          <div>
            <label>📱 Buscar por Telefone</label>
            <input 
              type="text"
              placeholder="Digite o telefone..." 
              value={filterPhone} 
              onChange={e => setFilterPhone(e.target.value)} 
            />
          </div>
        </div>

        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => { setFilterName(''); setFilterPhone(''); setFilterTurma(''); setFilterStatus('all'); }}
          >
            🔄 Limpar Filtros
          </button>
          {items.length > 0 && <span style={{ marginLeft: 'auto', alignSelf: 'center', color: '#666', fontSize: '14px' }}>
            {items.length} contato{items.length !== 1 ? 's' : ''} encontrado{items.length !== 1 ? 's' : ''}
          </span>}
        </div>
      </Card>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>⏳ Carregando contatos...</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="👤"
          title="Nenhum contato encontrado"
          text="Crie seu primeiro contato para começar"
          action={<button className="btn btn-primary" onClick={() => navigate('/contatos/new')}>Criar Contato</button>}
        />
      ) : (
        <Card>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Turma</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td><code style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>{c.phoneNumber}</code></td>
                  <td>{turmas.find(t => t.id === c.turmaId)?.name ?? '—'}</td>
                  <td>
                    <Badge variant={c.isActive ? 'success' : 'danger'}>
                      {c.isActive ? '✅ Ativo' : '❌ Inativo'}
                    </Badge>
                  </td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/contatos/${c.id}/edit`)}>
                      ✏️ Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>
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
