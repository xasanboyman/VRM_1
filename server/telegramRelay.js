import { Buffer } from 'node:buffer'

const TELEGRAM_API_BASE = 'https://api.telegram.org'

const json = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const readRequestBody = async (req) => {
  if (req.body && Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body)

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

const buildQueryString = (query = {}) => {
  const entries = Object.entries(query)
  if (entries.length === 0) return ''

  const search = new URLSearchParams()
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item))
      }
      continue
    }
    search.append(key, String(value))
  }

  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

export const relayTelegramMethod = async (req, res, methodName) => {
  try {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()

    if (!token) {
      return json(res, 500, {
        ok: false,
        error: 'Telegram relay is not configured. Set TELEGRAM_BOT_TOKEN on server env.',
      })
    }

    const targetChatId = String(process.env.TELEGRAM_CHAT_ID || '').trim()

    const isGet = req.method === 'GET'
    const isPost = req.method === 'POST'
    if (!isGet && !isPost) {
      res.setHeader('allow', 'GET, POST')
      return json(res, 405, { ok: false, error: 'Method not allowed.' })
    }

    // Parse the query parameters from either req.query (Vercel) or req.url (Vite)
    let queryObj = {}
    if (req.query && typeof req.query === 'object') {
      queryObj = { ...req.query }
    } else if (req.url) {
      try {
        const parsedUrl = new URL(req.url, 'http://localhost')
        for (const [key, val] of parsedUrl.searchParams.entries()) {
          queryObj[key] = val
        }
      } catch (e) {
        console.warn('Failed to parse URL query:', e)
      }
    }

    // Set or override chat_id if targetChatId is configured
    if (targetChatId && !queryObj['chat_id']) {
      queryObj['chat_id'] = targetChatId
    }

    const queryString = buildQueryString(queryObj)
    const upstreamUrl = `${TELEGRAM_API_BASE}/bot${token}/${methodName}${queryString}`

    const headers = {}
    let body
    if (isPost) {
      body = await readRequestBody(req)
      if (req.headers['content-type']) {
        headers['content-type'] = req.headers['content-type']
      }
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: isGet ? 'GET' : 'POST',
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: isGet ? undefined : body,
    })

    const upstreamText = await upstreamResponse.text()
    const upstreamType =
      upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8'

    res.statusCode = upstreamResponse.status
    res.setHeader('content-type', upstreamType)
    res.end(upstreamText)
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error?.message || 'Telegram relay failed.',
    })
  }
}
