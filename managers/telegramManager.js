import { appUrl } from '../src/utils/appUrl.js'

const normalizeBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

export class TelegramManager {
  relayBaseUrl = appUrl('api/telegram')

  // Standard Bot Config (Editable via .env)
  chatId = ''
  enabled = false
  sendLogs = true
  logCooldownMs = 3_000
  logTimezone = 'Asia/Tashkent'

  // State
  lastLogAt = 0
  lastLogSignature = ''

  // Debug/Identity info
  debugUserId = ''
  debugSessionId = ''
  debugUserName = ''
  debugMessageCount = 0

  constructor(config = {}) {
    this.configure(config)
  }

  configure(config = {}) {
    this.relayBaseUrl = this.normalizeRelayBase(config.relayBaseUrl)

    // Standard Config
    this.chatId = String(config.chatId || '').trim()
    this.enabled = normalizeBoolean(config.enabled, true)
    this.sendLogs = normalizeBoolean(config.sendLogs, false)
    this.logCooldownMs = this.normalizeMs(config.logCooldownMs, 3_000, 1_000, 120_000)

    // Timezone
    if (config.logTimezone) {
      this.logTimezone = config.logTimezone
    }
  }

  isActive() {
    return this.enabled && this.relayBaseUrl.length > 0
  }

  shouldSendLogs() {
    return this.isActive() && this.sendLogs
  }

  hasChatId() {
    return true
  }

  setDebugIdentity(identity = {}) {
    if (typeof identity !== 'object' || !identity) return
    if (identity.userId !== undefined) {
      this.debugUserId = String(identity.userId || '').trim()
    }
    if (identity.sessionId !== undefined) {
      this.debugSessionId = String(identity.sessionId || '').trim()
    }
    if (identity.userName !== undefined) {
      this.debugUserName = String(identity.userName || '').trim()
    }
    if (identity.messageCount !== undefined) {
      this.debugMessageCount = Number(identity.messageCount) || 0
    }
  }

  async notifyLog(eventMessage, context = '') {
    if (!this.shouldSendLogs()) return false

    const now = Date.now()
    const signature = `${eventMessage}|${context}`
    if (now - this.lastLogAt < this.logCooldownMs) return false
    if (signature === this.lastLogSignature && now - this.lastLogAt < 10000) return false

    this.lastLogAt = now
    this.lastLogSignature = signature

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append('text', this.buildLogMessage(eventMessage, context))
      await this.post('sendMessage', formData)
      return true
    } catch (error) {
      return false
    }
  }

  async resolveChatId() {
    return this.chatId || 'server-managed'
  }

  async post(method, formData) {
    const endpoint = `${this.relayBaseUrl}/${method}`
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`${method} failed: ${response.status}`)
    }
  }

  buildLogMessage(eventMessage, context = '') {
    const dateStr = this.getFormattedDate()
    const safeContext = String(context || '').trim()
    const contextEmoji = this.getContextEmoji(safeContext)
    const lines = [
      `📝 VRM Log`,
      `Time:🕰️ ${dateStr}`,
      ...this.buildDebugIdentityLines(),
      '',
      eventMessage,
      safeContext ? `\nContext: ${contextEmoji} ${safeContext}` : '',
    ]
    return lines.join('\n').trim()
  }

  getContextEmoji(context) {
    const lower = String(context || '').toLowerCase()
    if (lower.includes('warning')) return '⚠️'
    if (lower.includes('error') || lower.includes('fail') || lower.includes('critical')) return '❌'
    return '✅'
  }

  getFormattedDate() {
    try {
      const opts = { timeZone: this.logTimezone }

      const parts = new Intl.DateTimeFormat('en-US', {
        ...opts,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date())

      const getPart = (type) => parts.find((p) => p.type === type)?.value || ''

      const Y = getPart('year')
      const M = getPart('month')
      const D = getPart('day')
      const H = getPart('hour')
      const m = getPart('minute')

      return `${Y}-${M}-${D}-${H}:${m}`
    } catch (e) {
      return new Date().toISOString()
    }
  }

  normalizeMs(value, fallbackMs, minMs, maxMs) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallbackMs
    if (parsed < minMs) return minMs
    if (parsed > maxMs) return maxMs
    return Math.round(parsed)
  }

  normalizeRelayBase(value) {
    return appUrl('api/telegram')
  }

  buildDebugIdentityLines() {
    const lines = []
    if (this.debugUserName) lines.push(`UserName: 👤${this.debugUserName}`)
    if (this.debugUserId) lines.push(`UserId: 🆔${this.debugUserId}`)
    if (this.debugSessionId) lines.push(`SessionId: ${this.debugSessionId}`)
    if (this.debugMessageCount) lines.push(`MsgCount:#️⃣ ${this.debugMessageCount}`)
    return lines
  }

  async notifyTokenUsage(usageText, context = '') {
    if (!this.isActive()) return false

    const chatId = await this.resolveChatId()
    if (!chatId) return false

    try {
      const formData = new FormData()
      formData.append('chat_id', chatId)
      formData.append(
        'text',
        `🪙 <b>Token Usage Report</b>\nTime: 🕰️ ${this.getFormattedDate()}\n\n${usageText}\n\nContext: ${context || 'General'}`
      )
      formData.append('parse_mode', 'HTML')
      await this.post('sendMessage', formData)
      return true
    } catch (error) {
      console.warn('Failed to send token usage to Telegram:', error)
      return false
    }
  }
}
