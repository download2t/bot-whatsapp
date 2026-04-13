export type LoginResponse = {
  token: string
  expiresAtUtc: string
  username: string
}

export type ScheduleRule = {
  id: number
  name: string
  startTime: string
  endTime: string
  message: string
  isEnabled: boolean
  throttleMinutes: number
  isOutOfBusinessHours: boolean
  maxDailyMessagesPerUser: number | null
  createdAtUtc: string
}

export type WhitelistItem = {
  id: number
  name: string | null
  phoneNumber: string
  createdAtUtc: string
}

export type MessageLog = {
  id: number
  direction: string
  phoneNumber: string
  content: string
  isAutomatic: boolean
  status: string
  timestampUtc: string
}

export type PagedMessageLog = {
  items: MessageLog[]
  totalCount: number
  page: number
  pageSize: number
}

export type WhatsAppConnectionStatus = {
  status: string
  isConnected: boolean
  hasQr: boolean
  apiAvailable: boolean
  phoneNumber: string | null
  lastError: string | null
}

export type WhatsAppQrResponse = {
  qrDataUrl: string | null
}

export type UserProfile = {
  id: number
  username: string
  email?: string | null
  phone?: string | null
  cpf?: string | null
  fullName?: string | null
  title?: string | null
  notes?: string | null
  createdAtUtc?: string
}

export type UserListItem = {
  id: number
  username: string
  email?: string | null
  phone?: string | null
  fullName?: string | null
  createdAtUtc: string
}

export type WhatsAppConnectionItem = {
  id: string
  status: string
  isConnected: boolean
  hasQr: boolean
  phoneNumber: string | null
  lastError: string | null
}

export type WhatsAppPairingCodeResponse = {
  pairingCode: string | null
}
