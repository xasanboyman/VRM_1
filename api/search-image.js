import process from 'node:process'

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

    const usePlaywright = process.env.USE_PLAYWRIGHT === 'true'

    if (usePlaywright) {
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
            res.status(200).json(data)
            return
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
            res.status(200).json(data)
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
          res.status(200).json({ results })
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
          res.status(200).json({ results })
          return
        }
      }
    } catch (e) {
      console.warn('Wikimedia fallback search failed:', e)
    }

    // Strategy 5: Ultimate Fallback - Single-noun matching using LoremFlickr (strictly 1 tag, guaranteed to return a real, beautiful image)
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
