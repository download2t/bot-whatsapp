export type LoginResponse = {
  token: string
  expiresAtUtc: string
  username: string
  isAdmin: boolean
  userTitle: string | null
  companyId: number | null
  companyName: string | null
  companyCode: string | null
  requiresCompanySelection: boolean
  companies: CompanyOption[]
}

export type CompanyOption = {
  companyId: number
  companyName: string
  companyCode: string
  isCurrent: boolean
}

export type ScheduleRule = {
  id: number
  name: string
  whatsAppNumbers: string[]
  whatsAppNumber: string
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
  companyId: number
  whatsAppNumber: string
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
  isAdmin?: boolean
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
  isAdmin?: boolean
  email?: string | null
  phone?: string | null
  fullName?: string | null
  createdAtUtc: string
}

export type CompanyListItem = {
  id: number
  name: string
  companyCode: string
  createdAtUtc: string
  usersCount: number
}

export type CompanyUserItem = {
  userId: number
  username: string
  isAdmin: boolean
  email?: string | null
  fullName?: string | null
}

export type CompanyUserOption = {
  userId: number
  username: string
  isAdmin: boolean
  email?: string | null
  fullName?: string | null
  isLinked: boolean
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

export type WhatsAppFilterOptions = {
  numbers: string[]
  fixedNumber: string | null
}

export type Turma = {
  id: number
  name: string
  isActive: boolean
}

export type Contato = {
  id: number
  name: string
  phoneNumber: string
  turmaId: number | null
  isActive: boolean
}
