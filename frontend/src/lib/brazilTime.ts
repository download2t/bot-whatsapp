// Toda hora que a API devolve (MessageLog.timestampUtc, BulkCampaign*.processedAtUtc/createdAtUtc,
// User.createdAtUtc etc.) é UTC de verdade — mas o SQLite via EF Core sempre volta com
// Kind=Unspecified, então o JSON nunca carrega o sufixo "Z". Sem isso, `new Date(valor)` do
// JavaScript trata a string como se já fosse hora local (nenhuma conversão), o que faz tudo
// aparecer ~3h adiantado pra quem está no fuso do Brasil. Este módulo centraliza o tratamento
// certo — força UTC na hora de interpretar, converte explicitamente pra America/Sao_Paulo.

const BRAZIL_TIME_ZONE = 'America/Sao_Paulo'

function parseAsUtc(value: string): Date {
  // Se já tem "Z" ou um offset explícito (+HH:mm/-HH:mm), respeita como está.
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(value.trim())
  return new Date(hasTimezone ? value : `${value}Z`)
}

export function formatBrazilDateTime(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return ''
  const date = parseAsUtc(value)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', { timeZone: BRAZIL_TIME_ZONE, ...options })
}

export function formatBrazilTime(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return ''
  const date = parseAsUtc(value)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { timeZone: BRAZIL_TIME_ZONE, hour: '2-digit', minute: '2-digit', ...options })
}

export function formatBrazilDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return ''
  const date = parseAsUtc(value)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { timeZone: BRAZIL_TIME_ZONE, ...options })
}

// "Hora de parede" do Brasil, mas representada como se já fosse hora local do navegador —
// truque pra poder usar Date#getHours()/getMonth()/etc puros (sem se preocupar com fuso) em
// código que precisa montar strings manualmente (ex: SimulacaoMensagem.tsx reproduzindo o
// formato de export do WhatsApp). Funciona porque o valor de retorno é lido de volta com os
// mesmos getters locais que foram usados pra construí-lo — é sempre um round-trip consistente,
// não importa em que fuso o navegador de quem está vendo realmente está.
export function toBrazilWallClock(value: string | null | undefined): Date | null {
  if (!value) return null
  const real = parseAsUtc(value)
  if (isNaN(real.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BRAZIL_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(real)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')

  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}

// Continua em milissegundos desde epoch — comparações/ordenação não mudam com fuso, então não
// precisa de tratamento especial, só reaproveita o parse seguro (garante UTC mesmo sem "Z").
export function brazilTimeMs(value: string | null | undefined): number {
  if (!value) return 0
  const time = parseAsUtc(value).getTime()
  return isNaN(time) ? 0 : time
}

// "É hoje?" precisa comparar no fuso do Brasil, não no fuso de quem está com o navegador aberto
// em outro lugar — por isso usa a *data* já formatada (en-CA dá yyyy-mm-dd, fácil de comparar)
// em vez de Date#toDateString() (que usa o fuso local do navegador).
export function isBrazilToday(value: string | null | undefined): boolean {
  if (!value) return false
  const date = parseAsUtc(value)
  if (isNaN(date.getTime())) return false
  const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: BRAZIL_TIME_ZONE })
  return key(date) === key(new Date())
}
