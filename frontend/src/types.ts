export type LoginResponse = {
  token: string
  expiresAtUtc: string
  username: string
  isAdmin: boolean
  userTitle: string | null
}

export type AudienceMode = 'RegisteredContacts' | 'Anyone' | 'AnyoneExceptRegistered' | 'AnyoneExceptTurma'

export type ScheduleRule = {
  id: number
  name: string
  startTime: string
  endTime: string
  windows: ScheduleRuleWindow[]
  messages: ScheduleRuleMessage[]
  isEnabled: boolean
  throttleMinutes: number
  isOutOfBusinessHours: boolean
  maxDailyMessagesPerUser: number | null
  createdAtUtc: string
  audienceMode: AudienceMode
  excludedTurmaId: number | null
  excludedTurmaName: string | null
}

export type ScheduleRuleWindow = {
  dayOfWeek: number
  dayName: string
  startTime: string
  endTime: string
}

export type ScheduleRuleMessage = {
  text: string
  days: number[]
  dayNames: string[]
  paisId: number | null
  paisName: string | null
  paisDdi: string | null
}

export type Pais = {
  id: number
  name: string
  ddi: string
  isActive: boolean
}

export type MessageLog = {
  id: number;
  whatsAppNumber: string;
  direction: string;
  phoneNumber: string;
  contactName: string | null;
  content: string;
  isAutomatic: boolean;
  status: string;
  timestampUtc: string;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  ackStatus?: string | null;
};

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
  isActive?: boolean
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
  isActive?: boolean
  email?: string | null
  phone?: string | null
  fullName?: string | null
  createdAtUtc: string
}

export type WhatsAppPairingCodeResponse = {
  pairingCode: string | null
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

export type BulkCampaignStatus = 'Running' | 'Completed' | 'Cancelled' | 'Aborted' | 'Interrupted'
export type BulkCampaignItemStatus = 'Pending' | 'Sending' | 'Sent' | 'Failed' | 'Cancelled'

export type BulkCampaignItem = {
  id: number
  contactId: number
  contactName: string
  phoneNumber: string
  status: BulkCampaignItemStatus
  statusDetail: string | null
  processedAtUtc: string | null
}

export type BulkCampaign = {
  id: number
  greeting: string
  messageTemplate: string
  intervalSeconds: number
  mediaUrl: string | null
  mediaMimeType: string | null
  mediaFileName: string | null
  status: BulkCampaignStatus
  abortReason: string | null
  totalCount: number
  sentCount: number
  failedCount: number
  createdAtUtc: string
  finishedAtUtc: string | null
  items: BulkCampaignItem[]
}

export type BulkCampaignListItem = {
  id: number
  messageTemplate: string
  status: BulkCampaignStatus
  totalCount: number
  sentCount: number
  failedCount: number
  createdAtUtc: string
  finishedAtUtc: string | null
}
