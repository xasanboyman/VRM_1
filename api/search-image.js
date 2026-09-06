import process from 'node:process'

async function searchBingImages(query, maxResults = 20) {
  try {
    const url = 'https://www.bing.com/images/search?q=' + encodeURIComponent(query) + '&first=1'
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    })
    if (!res.ok) return []
    const text = await res.text()
    const results = []
    const regex = /m="({.+?})"/g
    let match
    while ((match = regex.exec(text)) !== null) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"')
        const data = JSON.parse(decoded)
        if (data.murl && typeof data.murl === 'string' && data.murl.startsWith('http')) {
          results.push({
            title: data.t || query,
            image: data.murl,
            thumb: data.turl || data.murl
          })
          if (results.length >= maxResults) break
        }
      } catch (_) {}
    }
    return results
  } catch (err) {
    console.warn('Bing search failed:', err)
    return []
  }
}

export default async function handler(req, res) {
  try {
    const { q } = req.query
    if (!q) {
      res.status(400).json({ error: 'Query parameter q is required' })
      return
    }

    // 1. Clean and extract key descriptive nouns from the query
    const stopwords = new Set([
      'a', 'an', 'the', 'and', 'with', 'for', 'from', 'under', 'above', 'near', 'beside', 'in', 'on', 'at', 'of',
      'photo', 'image', 'picture', 'stock', 'dramatic', 'scenic', 'sunset', 'sunrise', 'sunny', 'landscape',
      'view', 'background', 'beautiful', 'gorgeous', 'hd', '4k', 'taking', 'off', 'shot', 'action', 'illustration',
      'generative', 'ai', 'realistic', 'wallpaper', 'art'
    ])

    const words = q.trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/[\s]+/)
      .filter(w => w.length > 2 && !stopwords.has(w))

    // Create optimized queries for each strategy
    const ddgQuery = words.slice(0, 4).join(' ') || q.trim()
    const wikimediaQuery = words.slice(0, 2).join(' ') || 'landscape'
    const loremFlickrTag = words[0] || 'landscape'

    // Strategy 0: Authoritative Oracle Cloud Server API (fast, high capacity, no Lambda timeout)
    const oracleApiUrl = process.env.ORACLE_API_URL || 'https://xn--dr8haa.uz/oracle'
    try {
      const oracleRes = await fetch(`${oracleApiUrl}/api/search-image?q=${encodeURIComponent(ddgQuery)}`, {
        signal: AbortSignal.timeout(3500)
      })
      if (oracleRes.ok) {
        const oracleData = await oracleRes.json()
        if (oracleData?.results && oracleData.results.length > 0) {
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.status(200).json(oracleData)
          return
        }
      }
    } catch (_) {
      // Fall through to local strategies
    }

    // Strategy 1: High-Speed Direct Bing HD Search (instant, 20+ HD images, 100% Vercel compatible)
    const bingResults = await searchBingImages(ddgQuery)
    if (bingResults.length > 0) {
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.status(200).json({ results: bingResults })
      return
    }

    // Strategy 2: Headless Playwright DuckDuckGo Search with Stealth Evasion (if enabled & installed)
    const usePlaywright = process.env.USE_PLAYWRIGHT === 'true'
    if (usePlaywright) {
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
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 800 },
          locale: 'en-US',
          timezoneId: 'America/New_York'
        })
        const page = await context.newPage()
        
        await page.addInitScript(() => {
          try {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
            delete Object.getPrototypeOf(navigator).webdriver
          } catch (_) {}
        })

        const searchUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(ddgQuery) + '&iar=images&iax=images&ia=images'
        await page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        })
        
        await page.waitForTimeout(1500)
        
        const html = await page.content()
        const match = html.match(/vqd\s*=\s*['"]?([^'&"<>]+)['"]?/) || 
                      html.match(/vqd\s*:\s*['"]?([^'&"<>]+)['"]?/) ||
                      html.match(/vqd=([^&'"]+)/)
                      
        if (match) {
          const vqd = match[1]
          const data = await page.evaluate(async ({ ddgQuery, vqd }) => {
            const response = await fetch(`https://duckduckgo.com/i.js?q=${encodeURIComponent(ddgQuery)}&o=json&vqd=${vqd}`)
            return await response.json()
          }, { ddgQuery, vqd })
          
          if (data && data.results && data.results.length > 0) {
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.status(200).json(data)
            return
          }
        }
      } catch (e) {
        console.warn('Playwright search error:', e?.message || e)
      } finally {
        if (browser) {
          try {
            await browser.close()
          } catch (_) {}
        }
      }
    }

    // Strategy 3: Fallback to Unsplash Public Search
    try {
      const unsplashUrl = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(ddgQuery)}&per_page=15`
      const response = await fetch(unsplashUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.status(200).json({ results })
          return
        }
      }
    } catch (e) {
      console.warn('Unsplash public search failed:', e)
    }

    // Strategy 4: Fallback to Wikimedia Commons API
    try {
      const commonsUrl = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: wikimediaQuery,
        gsrnamespace: "6",
        prop: "imageinfo",
        iiprop: "url|mime",
        gsrlimit: "15",
        origin: "*"
      })
      
      const response = await fetch(commonsUrl)
      const data = await response.json()
      if (data?.query?.pages) {
        const pages = Object.values(data.query.pages)
        const results = pages
          .filter(p => {
            if (!p.imageinfo || p.imageinfo.length === 0) return false
            const mime = p.imageinfo[0].mime || ''
            return mime === 'image/jpeg' || mime === 'image/png'
          })
          .map(p => ({
            title: p.title || 'Wikimedia Commons Image',
            image: p.imageinfo[0].url
          }))
        
        if (results.length > 0) {
          res.setHeader('Cache-Control', 'public, max-age=3600')
          res.status(200).json({ results })
          return
        }
      }
    } catch (e) {
      console.warn('Wikimedia fallback search failed:', e)
    }

    // Strategy 5: Ultimate Fallback - Single-noun matching using LoremFlickr
    const randomSeed = Math.floor(Math.random() * 1000000)
    const fallbackImage = `https://loremflickr.com/1024/576/${loremFlickrTag}?random=${randomSeed}`
    
    res.status(200).json({
      results: [
        {
          title: `Fallback background matching: ${loremFlickrTag}`,
          image: fallbackImage
        }
      ]
    })
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Search API failed completely.' })
  }
}
