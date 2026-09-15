import type { MessageLog } from '../types'
import { toBrazilWallClock } from './brazilTime'

// Reproduces exactly what WhatsApp Web itself writes when you select part of a conversation
// and copy it: "[HH:mm, DD/MM/YYYY] Nome: mensagem" per line, plain text.

export function mediaFallbackText(msg: MessageLog): string {
  if (!msg.mediaUrl) return ''
  if (msg.mediaMimeType?.startsWith('image/')) return '📷 Foto'
  if (msg.mediaMimeType?.startsWith('video/')) return '🎥 Vídeo'
  return '📄 Arquivo'
}

export function isOutgoingMessage(msg: MessageLog): boolean {
  return msg.direction?.toLowerCase() === 'outgoing' || msg.status?.toLowerCase() === 'sent'
}

export function formatExportLine(msg: MessageLog, senderName: string): string | null {
  const d = toBrazilWallClock(msg.timestampUtc)
  if (!d) return null

  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const date = d.toLocaleDateString('pt-BR')
  const text = msg.content || mediaFallbackText(msg)

  return `[${time}, ${date}] ${senderName}: ${text}`
}

export function resolveSenderName(msg: MessageLog, contactPhone: string, myDisplayName: string): string {
  return isOutgoingMessage(msg) ? myDisplayName : msg.contactName || contactPhone
}

// Brazil-time yyyy-mm-dd key, used to group messages by calendar day for the date checkboxes —
// must group by the Brazil calendar day (matching what the export line itself shows), not
// whatever day it happens to be in the viewer's own browser timezone.
export function dateKey(dateStr: string): string | null {
  const d = toBrazilWallClock(dateStr)
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dateKeyLabel(key: string): string {
  const [year, month, day] = key.split('-')
  return `${day}/${month}/${year}`
}
