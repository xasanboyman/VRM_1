import { GoogleGenAI } from '@google/genai'

// In-memory cache for IP tracking on warm serverless containers
const rateLimitCache = new Map()

// Auto-cleanup interval to prevent memory leaks in long-running container lifecycles
if (global.gc || !global.__rateLimitCleanupActive) {
  global.__rateLimitCleanupActive = true
  setInterval(() => {
    const now = Date.now()
    for (const [ip, data] of rateLimitCache.entries()) {
      if (now > data.resetTime) {
        rateLimitCache.delete(ip)
      }
    }
  }, 60 * 1000).unref?.() // Use unref if available in Node environment
}

export default async function handler(req, res) {
  // Extract client IP address from standard upstream proxy headers
  const clientIp = 
    req.headers['x-real-ip'] || 
    req.headers['x-forwarded-for']?.split(',')[0] || 
    req.socket.remoteAddress || 
    'unknown-ip'

  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window
  const maxRequests = 5      // Max 5 token generations per minute per IP

  let ipData = rateLimitCache.get(clientIp)

  if (!ipData || now > ipData.resetTime) {
    ipData = {
      count: 0,
      resetTime: now + windowMs
    }
  }

  ipData.count++
  rateLimitCache.set(clientIp, ipData)

  // Enforce rate limit check
  if (ipData.count > maxRequests) {
    res.setHeader('Retry-After', Math.ceil((ipData.resetTime - now) / 1000))
    return res.status(429).json({ 
      error: 'Too many requests. Quota protection active. Please try again in a minute.' 
    })
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server env.' })
    }

    const client = new GoogleGenAI({ apiKey })
    
    const model = process.env.VITE_GEMINI_LIVE_MODEL || process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'

    // Create ephemeral session token valid for 30 minutes
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const token = await client.authTokens.create({
      config: {
        uses: 1, // Ephemeral token can only be used to start a single session for maximum security
        expireTime: expireTime,
        newSessionExpireTime: new Date(Date.now() + 1 * 60 * 1000).toISOString(),
        httpOptions: { apiVersion: 'v1alpha' }
      }
    })

    // Include rate-limit headers in response
    res.setHeader('X-RateLimit-Limit', maxRequests)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - ipData.count))
    res.setHeader('X-RateLimit-Reset', Math.ceil(ipData.resetTime / 1000))

    return res.status(200).json({ token: token.name })
  } catch (error) {
    console.error('Server failed to generate token:', error)
    return res.status(500).json({ error: error?.message || 'Token generation failed.' })
  }
}
