export class ConfigManager {
  config = {}

  getApiKey() {
    return import.meta.env.VITE_API_KEY || ''
  }

  getModel() {
    const configuredModel = String(import.meta.env.VITE_GEMINI_LIVE_MODEL || '').trim()
    return configuredModel || 'gemini-3.1-flash-live-preview'
  }

  getRenderSettings() {
    // Cap the device pixel ratio. Default 2 (sharp on HiDPI without melting the
    // GPU). Falls back gracefully when the env var is unset/garbage instead of
    // collapsing to 1 (which renders a blurry half-resolution avatar on retina).
    const envCap = parseFloat(import.meta.env.VITE_RENDER_PIXEL_RATIO_CAP)
    const pixelRatioCap = Number.isFinite(envCap) && envCap > 0 ? Math.min(envCap, 3) : 2

    // Optional supersampling multiplier (>1 renders above native res then lets
    // the GPU downscale = the cleanest possible edges/textures). Costs fill rate.
    const envSS = parseFloat(import.meta.env.VITE_RENDER_SUPERSAMPLE)
    const supersample = Number.isFinite(envSS) && envSS > 0 ? Math.min(envSS, 2) : 1

    return {
      antialias: this.parseBoolean(import.meta.env.VITE_RENDER_ANTIALIAS, true),
      alpha: this.parseBoolean(import.meta.env.VITE_RENDER_ALPHA, false),
      shadows: this.parseBoolean(import.meta.env.VITE_RENDER_SHADOWS, false),
      powerPreference: import.meta.env.VITE_RENDER_POWER_PREFERENCE || 'high-performance',
      pixelRatioCap,
      supersample,
    }
  }

  getTelegramSettings() {
    const logCooldownSeconds = this.parseNumber(
      import.meta.env.VITE_TELEGRAM_LOG_COOLDOWN_SECONDS,
      3,
      1,
      120,
    )

    return {
      enabled: this.parseBoolean(import.meta.env.VITE_TELEGRAM_ENABLED, true),
      relayBaseUrl: String(import.meta.env.VITE_TELEGRAM_RELAY_BASE_URL || appUrl('api/telegram')).trim(),
      chatId: import.meta.env.VITE_TELEGRAM_CHAT_ID || '',
      sendLogs: this.parseBoolean(import.meta.env.VITE_TELEGRAM_SEND_LOGS, false),
      logCooldownMs: Math.round(logCooldownSeconds * 1000),
      logTimezone: String(import.meta.env.VITE_TELEGRAM_LOG_TIMEZONE || 'Asia/Tashkent').trim(),
    }
  }

  parseBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value
    if (typeof value !== 'string') return fallback
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
    return fallback
  }

  parseNumber(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    if (parsed < min) return min
    if (parsed > max) return max
    return parsed
  }
}
import { appUrl } from '../src/utils/appUrl.js'
