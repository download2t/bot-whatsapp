const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5207'

function getToken(): string | null {
  return localStorage.getItem('bot_jwt')
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    localStorage.removeItem('bot_jwt')
    localStorage.removeItem('bot_user')
    localStorage.removeItem('bot_company_id')
    localStorage.removeItem('bot_company_name')
    localStorage.removeItem('bot_company_code')
    localStorage.removeItem('bot_companies')
    localStorage.removeItem('bot_is_admin')
    window.dispatchEvent(new Event('auth-expired'))
    throw new Error('Sessao expirada. Faca login novamente.')
  }

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Erro na requisicao')
  }

  if (response.status === 204) {
    return null as T
  }

  const raw = await response.text()
  if (!raw) {
    return null as T
  }

  return JSON.parse(raw) as T
}

export function getApiBase(): string {
  return API_BASE
}
