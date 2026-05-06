import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getApiBase } from '../lib/api'
import { Alert, Card, FormGroup } from '../components/UI'
import '../styles/modern.css'

type ImportResult = {
  turmaId: number
  turmaName: string
  importedContacts: number
}

export function ContatosImportExcel() {
  const navigate = useNavigate()
  const [turmaName, setTurmaName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const token = useMemo(() => localStorage.getItem('bot_jwt') ?? '', [])

  const downloadTemplate = async () => {
    setError(null)
    try {
      const response = await fetch(`${getApiBase()}/api/contatos/import-excel/template`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'modelo-contatos.xlsx'
      anchor.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao baixar modelo')
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setResult(null)

    if (!turmaName.trim()) {
      setError('Informe o nome da nova turma.')
      return
    }

    if (!file) {
      setError('Selecione um arquivo Excel.')
      return
    }

    try {
      setLoading(true)
      const formData = new FormData()
      formData.append('turmaName', turmaName.trim())
      formData.append('file', file)

      const response = await fetch(`${getApiBase()}/api/contatos/import-excel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data = await response.json() as ImportResult
      setResult(data)
      setTurmaName('')
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar contatos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container" style={{ padding: '24px', maxWidth: '980px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1>📥 Importar Contatos via Excel</h1>
          <p style={{ marginBottom: 0, color: '#6b7280' }}>
            Baixe o modelo, preencha com nome e telefone, informe o nome da nova turma e importe tudo de uma vez.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => navigate('/contatos')}>
          ← Voltar para Contatos
        </button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {result && <Alert variant="success">{result.importedContacts} contatos importados para a turma “{result.turmaName}”.</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.4fr', gap: '24px' }}>
        <Card>
          <h2 style={{ marginBottom: '12px' }}>1. Baixar modelo</h2>
          <p style={{ marginBottom: '16px' }}>
            O arquivo possui as colunas obrigatórias <strong>Nome</strong> e <strong>Telefone</strong>.
          </p>
          <button className="btn btn-primary" type="button" onClick={() => void downloadTemplate()}>
            ⬇️ Baixar modelo Excel
          </button>
          <div style={{ marginTop: '18px', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
            <p style={{ marginBottom: 0, color: '#475569', fontSize: '14px' }}>
              Exemplo de uso: <strong>João Silva</strong> / <strong>5545999999999</strong>
            </p>
          </div>
        </Card>

        <Card>
          <h2 style={{ marginBottom: '12px' }}>2. Importar arquivo</h2>
          <form onSubmit={handleSubmit}>
            <FormGroup>
              <label htmlFor="turmaName">Nome da nova turma</label>
              <input
                id="turmaName"
                type="text"
                value={turmaName}
                onChange={(event) => setTurmaName(event.target.value)}
                placeholder="Ex: Turma Abril 2026"
                required
              />
            </FormGroup>

            <FormGroup>
              <label htmlFor="excelFile">Arquivo Excel</label>
              <input
                id="excelFile"
                type="file"
                accept=".xlsx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </FormGroup>

            <div style={{ marginBottom: '18px', padding: '14px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <strong style={{ display: 'block', marginBottom: '6px' }}>Como funciona</strong>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#1e3a8a', lineHeight: 1.6 }}>
                <li>Uma nova turma será criada com o nome informado.</li>
                <li>Todos os contatos válidos do Excel serão vinculados a essa turma.</li>
                <li>O telefone será normalizado automaticamente no formato usado pelo sistema.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ flex: 1, minWidth: '220px' }}>
                {loading ? '⏳ Importando...' : '📥 Importar contatos'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => navigate('/contatos')} style={{ flex: 1, minWidth: '220px' }}>
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}