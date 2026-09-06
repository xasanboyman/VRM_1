import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl' // <--- IMPORT THIS

const TELEGRAM_API_BASE = 'https://api.telegram.org'
const ALLOWED_TELEGRAM_METHODS = new Set([
  'sendMessage',
  'getUpdates',
])

const createTelegramRelayMiddleware = (botToken, chatID) => {
  return async (req, res) => {
    try {
      const targetChatId = chatID
      const token = botToken

      if (!token) {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            ok: false,
            skipped: true,
            error: 'Telegram relay is not configured. Set TELEGRAM_BOT_TOKEN on server env.',
          }),
        )
        return
      }

      let urlObj
      try {
        urlObj = new URL(req.url, 'http://localhost')
      } catch (e) {
        urlObj = new URL('/sendMessage', 'http://localhost')
      }

      const methodName = urlObj.pathname.replace(/^\/+/, '')

      if (!methodName || !ALLOWED_TELEGRAM_METHODS.has(methodName)) {
        res.statusCode = 404
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'Unknown Telegram method.' }))
        return
      }

      if (targetChatId) {
        urlObj.searchParams.set('chat_id', targetChatId)
      }

      const isGet = req.method === 'GET'
      const isPost = req.method === 'POST'
      if (!isGet && !isPost) {
        res.statusCode = 405
        res.setHeader('allow', 'GET, POST')
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'Method not allowed.' }))
        return
      }

      const upstreamUrl = `${TELEGRAM_API_BASE}/bot${token}/${methodName}${urlObj.search}`

      let upstreamBody
      const upstreamHeaders = {}
      if (isPost) {
        const chunks = []
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        upstreamBody = Buffer.concat(chunks)
        if (req.headers['content-type']) {
          upstreamHeaders['content-type'] = req.headers['content-type']
        }
      }

      const upstreamResponse = await fetch(upstreamUrl, {
        method: isGet ? 'GET' : 'POST',
        headers: Object.keys(upstreamHeaders).length > 0 ? upstreamHeaders : undefined,
        body: isGet ? undefined : upstreamBody,
      })

      const upstreamText = await upstreamResponse.text()
      const upstreamType =
        upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8'

      res.statusCode = upstreamResponse.status
      res.setHeader('content-type', upstreamType)
      res.end(upstreamText)
    } catch (error) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          ok: false,
          error: error?.message || 'Telegram relay failed.',
        }),
      )
    }
  }
}

const createGetTokenMiddleware = (apiKey, model) => {
  return async (req, res) => {
    try {
      if (!apiKey) {
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on server env.' }))
        return
      }

      const { GoogleGenAI } = await import('@google/genai')
      const client = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' })
      const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      const token = await client.authTokens.create({
        config: {
          uses: 1, // Ephemeral token can only be used to start a single session for maximum security
          expireTime: expireTime,
          newSessionExpireTime: new Date(Date.now() + 1 * 60 * 1000).toISOString(),
          httpOptions: { apiVersion: 'v1alpha' }
        }
      })

      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ token: token.name }))
    } catch (error) {
      console.error('Vite local middleware failed to generate token:', error)
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: error?.message || 'Token generation failed.' }))
    }
  }
}

const createGetTokenPlugin = (apiKey, model) => {
  const middleware = createGetTokenMiddleware(apiKey, model)
  return {
    name: 'get-token',
    configureServer(server) {
      server.middlewares.use('/api/get-token', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/get-token', middleware)
    },
  }
}

const createSearchImageMiddleware = (usePlaywright) => {
  return async (req, res) => {
    try {
      const urlObj = new URL(req.url, 'http://localhost')
      const query = urlObj.searchParams.get('q')
      if (!query) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'Query parameter q is required' }))
        return
      }

      // 1. Clean and extract key descriptive nouns from the query
      const stopwords = new Set([
        'a', 'an', 'the', 'and', 'with', 'for', 'from', 'under', 'above', 'near', 'beside', 'in', 'on', 'at', 'of',
        'photo', 'image', 'picture', 'stock', 'dramatic', 'scenic', 'sunset', 'sunrise', 'sunny', 'landscape',
        'view', 'background', 'beautiful', 'gorgeous', 'hd', '4k', 'taking', 'off', 'shot', 'action', 'illustration',
        'generative', 'ai', 'realistic', 'wallpaper', 'art'
      ])

      const words = query.trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/[\s]+/)
        .filter(w => w.length > 2 && !stopwords.has(w))

      // Create optimized queries for each strategy
      const ddgQuery = words.slice(0, 4).join(' ') || query.trim()
      const wikimediaQuery = words.slice(0, 2).join(' ') || 'landscape'
      const loremFlickrTag = words[0] || 'landscape'

      if (usePlaywright) {
        let playwrightResults = null
        // Strategy 1: Headless Playwright DuckDuckGo Search with Stealth Evasion
        let browser = null
        try {
          const { chromium } = await import('playwright-extra')
          const { default: stealth } = await import('puppeteer-extra-plugin-stealth')

          if (!globalThis.__playwrightStealthRegistered) {
            chromium.use(stealth())
            globalThis.__playwrightStealthRegistered = true
          }

          browser = await chromium.launch({
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process'
            ]
          })
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 },
            locale: 'en-US',
            timezoneId: 'America/New_York'
          })
          const page = await context.newPage()
          
          // Inject extra stealth webdriver properties
          await page.addInitScript(() => {
            try {
              Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
              delete Object.getPrototypeOf(navigator).webdriver;
            } catch (e) {}
          });
          
          const searchUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(ddgQuery) + '&iar=images&iax=images&ia=images'
          await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          })
          
          // Wait briefly for the page to initialize and generate VQD
          await page.waitForTimeout(2000)
          
          const html = await page.content()
          const match = html.match(/vqd\s*=\s*['"]?([^'&"<>]+)['"]?/) || 
                        html.match(/vqd\s*:\s*['"]?([^'&"<>]+)['"]?/) ||
                        html.match(/vqd=([^&'"]+)/)
                        
          if (match) {
            const vqd = match[1]
            // Request the search results internally within the page context to inherit the session/cookies
            const data = await page.evaluate(async ({ ddgQuery, vqd }) => {
              const response = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(ddgQuery)}&o=json&vqd=${vqd}`)
              return await response.json()
            }, { ddgQuery, vqd })
            
            if (data && data.results && data.results.length > 0) {
              playwrightResults = data
            }
          }
        } catch (e) {
          console.warn('Playwright image search failed, falling back:', e)
        } finally {
          if (browser) {
            try {
              await browser.close()
            } catch (closeError) {
              // Ignore close errors
            }
          }
        }

        if (playwrightResults) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(playwrightResults))
          return
        }
      } else {
        // Strategy 2: Old fetch-based DuckDuckGo Search (lightweight, zero-dependency, Vercel-compatible)
        let vqd = null
        try {
          const searchUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(ddgQuery)
          const response = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache',
              'Referer': 'https://duckduckgo.com/'
            }
          })
          const html = await response.text()
          const match = html.match(/vqd\s*=\s*['"]?([^'&"<>]+)['"]?/) || 
                        html.match(/vqd\s*:\s*['"]?([^'&"<>]+)['"]?/) ||
                        html.match(/vqd=([^&'"]+)/)
          if (match) {
            vqd = match[1]
          }
        } catch (e) {
          console.warn('DuckDuckGo VQD fetch failed, trying fallbacks:', e)
        }

        // If VQD was found, query DuckDuckGo Image Search
        if (vqd) {
          try {
            const imagesUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(ddgQuery)}&o=json&vqd=${vqd}`
            const imagesResponse = await fetch(imagesUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': 'https://duckduckgo.com/'
              }
            })
            const data = await imagesResponse.json()
            if (data && data.results && data.results.length > 0) {
              res.statusCode = 200
              res.setHeader('content-type', 'application/json; charset=utf-8')
              res.end(JSON.stringify(data))
              return
            }
          } catch (e) {
            console.warn('DuckDuckGo image search query failed, trying fallback:', e)
          }
        }
      }

      // Strategy 3: Fallback to Unsplash Public Search (world's premium photo corpus, keyless napi)
      try {
        const unsplashUrl = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(ddgQuery)}&per_page=15`
        const response = await fetch(unsplashUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://unsplash.com/'
          }
        })
        if (response.ok) {
          const data = await response.json()
          if (data && data.results && data.results.length > 0) {
            const results = data.results.map(r => ({
              title: r.alt_description || r.description || 'Unsplash Image',
              image: r.urls.regular
            }))
            res.statusCode = 200
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ results }))
            return
          }
        }
      } catch (e) {
        console.warn('Unsplash public search failed, trying next fallback:', e)
      }

      // Strategy 4: Fallback to Wikimedia Commons API (completely keyless and open to server environments)
      try {
        const commonsUrl = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
          action: "query",
          format: "json",
          generator: "search",
          gsrsearch: wikimediaQuery,
          gsrnamespace: "6", // File namespace
          prop: "imageinfo",
          iiprop: "url|mime",
          iiurlwidth: "1280",
          iiurlheight: "720",
          gsrlimit: "10"
        })
        
        const response = await fetch(commonsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          }
        })
        const data = await response.json()
        const pages = data?.query?.pages || {}
        const results = []
        for (const id in pages) {
          const imgInfo = pages[id]?.imageinfo?.[0]
          if (imgInfo && imgInfo.url && imgInfo.mime?.startsWith('image/')) {
            results.push({
              title: pages[id].title?.replace(/^File:/, '') || 'Wikimedia Image',
              image: imgInfo.url
            })
          }
        }
        
        if (results.length > 0) {
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ results }))
          return
        }
      } catch (e) {
        console.warn('Wikimedia fallback search failed:', e)
      }

      // Strategy 5: Ultimate Fallback - Single-noun matching using LoremFlickr (strictly 1 tag, guaranteed to return a real, beautiful image)
      const randomSeed = Math.floor(Math.random() * 1000000)
      const fallbackImage = `https://loremflickr.com/1024/576/${loremFlickrTag}?random=${randomSeed}`
      
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        results: [
          {
            title: `Fallback background matching: ${loremFlickrTag}`,
            image: fallbackImage
          }
        ]
      }))
    } catch (error) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: error?.message || 'Search failed.' }))
    }
  }
}

const createSearchImagePlugin = (usePlaywright) => {
  const middleware = createSearchImageMiddleware(usePlaywright)
  return {
    name: 'search-image',
    configureServer(server) {
      server.middlewares.use('/api/search-image', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/search-image', middleware)
    },
  }
}

const createProxyImageMiddleware = () => {
  return async (req, res) => {
    try {
      const urlObj = new URL(req.url, 'http://localhost')
      const imageUrl = urlObj.searchParams.get('url')
      if (!imageUrl) {
        res.statusCode = 400
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: 'url parameter is required' }))
        return
      }

      let refererHeader = ''
      try {
        const parsedImgUrl = new URL(imageUrl)
        refererHeader = parsedImgUrl.origin + '/'
      } catch (e) {
        console.warn('Failed to parse proxy image url origin:', e)
      }

      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept': 'image/*,*/*',
          ...(refererHeader ? { 'Referer': refererHeader } : {})
        },
        redirect: 'follow'
      })

      if (!response.ok) {
        res.statusCode = response.status
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: `Upstream returned ${response.status}` }))
        return
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg'
      res.statusCode = 200
      res.setHeader('content-type', contentType)
      res.setHeader('cache-control', 'public, max-age=86400')

      const arrayBuffer = await response.arrayBuffer()
      res.end(Buffer.from(arrayBuffer))
    } catch (error) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: error?.message || 'Proxy failed.' }))
    }
  }
}

const createProxyImagePlugin = () => {
  const middleware = createProxyImageMiddleware()
  return {
    name: 'proxy-image',
    configureServer(server) {
      server.middlewares.use('/api/proxy-image', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/proxy-image', middleware)
    },
  }
}

const createTelegramRelayPlugin = (botToken, chatID) => {
  const middleware = createTelegramRelayMiddleware(botToken, chatID)
  return {
    name: 'telegram-relay',
    configureServer(server) {
      server.middlewares.use('/api/telegram', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/telegram', middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const telegramBotToken = String(env.TELEGRAM_BOT_TOKEN || '').trim()
  const telegramChatId = String(env.TELEGRAM_CHAT_ID || env.VITE_TELEGRAM_CHAT_ID || '').trim()
  const geminiApiKey = String(env.GEMINI_API_KEY || env.VITE_API_KEY || '').trim()

  const modelName = String(
    env.VITE_GEMINI_LIVE_MODEL || env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'
  ).trim()

  if (!telegramBotToken) {
    console.warn('Warning: TELEGRAM_BOT_TOKEN is missing from environment variables. Local Telegram relay is inactive.')
  }

  return {
    plugins: [
      vue(),
      basicSsl(),
      createTelegramRelayPlugin(telegramBotToken, telegramChatId),
      createGetTokenPlugin(geminiApiKey, modelName),
      createSearchImagePlugin(),
      createProxyImagePlugin(),
    ],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return

            if (id.includes('/three/examples/')) {
              return 'vendor-three-extras'
            }

            if (id.includes('/three/')) {
              return 'vendor-three-core'
            }

            if (id.includes('/@pixiv/three-vrm-animation/')) {
              return 'vendor-vrm-animation'
            }

            if (id.includes('/@pixiv/three-vrm/')) {
              return 'vendor-vrm-core'
            }

            if (
              id.includes('/@google/genai') ||
              id.includes('/openai/')
            ) {
              return 'vendor-ai'
            }

            if (
              id.includes('/vue/') ||
              id.includes('/pinia/') ||
              id.includes('/vue-router/') ||
              id.includes('/@heroicons/')
            ) {
              return 'vendor-vue'
            }

            return 'vendor-misc'
          },
        },
      },
    },
    server: {
      host: true,
      https: true,
      port: 5173,
      proxy: {
        '/api/speech2motion': {
          target: String(env.VITE_SPEECH2MOTION_URL || 'https://xn--dr8haa.uz/oracle/speech2motion').trim(),
          rewrite: (path) => path.replace(/^\/api\/speech2motion/, '/api/v3/speech2motion'),
          changeOrigin: true,
          secure: false,
        },
        '/speech2motion-ws': {
          target: String(env.VITE_SPEECH2MOTION_WS_URL || 'wss://xn--dr8haa.uz/oracle/speech2motion/api/v3/speech2motion/ws').replace(/\/api\/v3\/speech2motion\/ws$/, '').trim(),
          ws: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/speech2motion-ws/, ''),
          changeOrigin: true,
        },
        '/api/audio2face': {
          target: String(env.VITE_AUDIO2FACE_URL || 'https://xn--dr8haa.uz/oracle/audio2face').trim(),
          rewrite: (path) => path.replace(/^\/api\/audio2face/, '/api/v1/audio2face'),
          changeOrigin: true,
          secure: false,
        },
        '/audio2face-ws': {
          target: String(env.VITE_AUDIO2FACE_WS_URL || 'wss://xn--dr8haa.uz/oracle/audio2face/api/v1/audio2face/ws').replace(/\/api\/v1\/audio2face\/ws$/, '').trim(),
          ws: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/audio2face-ws/, '/api/v1/audio2face/ws'),
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
