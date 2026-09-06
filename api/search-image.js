import process from 'node:process'

// 1. DuckDuckGo Instant Images (Super-fast, 100% accurate, high-resolution)
async function getDuckDuckGoVqd(query) {
  try {
    const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iar=images&iax=images&ia=images`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(4000)
    })
    if (!res.ok) return null
    const html = await res.text()
    const match = html.match(/vqd=["']([^"']+)["']/) ||
                  html.match(/vqd:\s*["']([^"']+)["']/) ||
                  html.match(/vqd=([^&"'\s]+)/)
    return match ? match[1] : null
  } catch (_) {
    return null
  }
}

async function searchDuckDuckGo(query, maxResults = 25) {
  const vqd = await getDuckDuckGoVqd(query)
  if (!vqd) return []
  try {
    const imgUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,;&p=1`
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
        'Accept': '*/*'
      },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return []
    const data = await res.json()
    const items = data.results || []
    return items.slice(0, maxResults).map(r => ({
      title: r.title || query,
      image: r.image,
      thumb: r.thumbnail || r.image
    }))
  } catch (_) {
    return []
  }
}

// 2. Direct Bing HD Search with strict class="iusc" extraction & keyword validation
async function searchBingImages(query, queryWords = [], maxResults = 20) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&setmkt=en-US&setlang=en-US&first=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'SRCHHPGUSR=ADLT=OFF&NRSLT=50; _EDGE_S=mkt=en-us&ui=en-us;',
        'Cache-Control': 'no-cache'
      },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return []
    const text = await res.text()
    const results = []
    // Only match actual search result cards (<a class="iusc" ... m="{...}">)
    const regex = /class="iusc"[^>]*m="({.+?})"/g
    let match
    while ((match = regex.exec(text)) !== null) {
      try {
        const decoded = match[1].replace(/&quot;/g, '"')
        const data = JSON.parse(decoded)
        if (data.murl && typeof data.murl === 'string' && data.murl.startsWith('http')) {
          const title = (data.t || '').toLowerCase()
          const murl = data.murl.toLowerCase()
          // Relevance check: ensure it matches at least one salient keyword
          const isRelevant = queryWords.length === 0 || queryWords.some(w => title.includes(w) || murl.includes(w))
          if (isRelevant) {
            results.push({
              title: data.t || query,
              image: data.murl,
              thumb: data.turl || data.murl
            })
            if (results.length >= maxResults) break
          }
        }
      } catch (_) {}
    }
    return results
  } catch (err) {
    return []
  }
}

// 3. Fallback to Wikimedia Commons API
async function searchWikimedia(query, maxResults = 15) {
  try {
    const commonsUrl = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      prop: 'imageinfo',
      iiprop: 'url|mime',
      gsrlimit: String(maxResults),
      origin: '*'
    })
    const response = await fetch(commonsUrl, { signal: AbortSignal.timeout(4000) })
    if (!response.ok) return []
    const data = await response.json()
    if (!data?.query?.pages) return []
    const pages = Object.values(data.query.pages)
    return pages
      .filter(p => {
        if (!p.imageinfo || p.imageinfo.length === 0) return false
        const mime = p.imageinfo[0].mime || ''
        return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp'
      })
      .map(p => ({
        title: p.title || 'Wikimedia Image',
        image: p.imageinfo[0].url,
        thumb: p.imageinfo[0].url
      }))
  } catch (_) {
    return []
  }
}

// 4. Fallback to Unsplash Public Search
async function searchUnsplash(query, maxResults = 15) {
  try {
    const unsplashUrl = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=${maxResults}`
    const response = await fetch(unsplashUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://unsplash.com/'
      },
      signal: AbortSignal.timeout(4000)
    })
    if (response.ok) {
      const data = await response.json()
      if (data && data.results && data.results.length > 0) {
        return data.results.map(r => ({
          title: r.alt_description || r.description || 'Unsplash Image',
          image: r.urls.regular,
          thumb: r.urls.small || r.urls.regular
        }))
      }
    }
    return []
  } catch (_) {
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
      'generative', 'ai', 'realistic', 'wallpaper', 'art', 'setting', 'decor', 'natural', 'light', 'large', 'through'
    ])

    const words = q.trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/[\s]+/)
      .filter(w => w.length > 2 && !stopwords.has(w))

    const ddgQuery = words.slice(0, 5).join(' ') || q.trim()
    const broadQuery = words.slice(0, 3).join(' ') || q.trim()
    const loremFlickrTag = words[0] || 'landscape'

    // Strategy 1: High-Speed DuckDuckGo Instant Images (Primary, fast, ultra-accurate)
    let results = await searchDuckDuckGo(ddgQuery, 25)
    if (!results.length && broadQuery !== ddgQuery) {
      results = await searchDuckDuckGo(broadQuery, 25)
    }

    // Strategy 2: Direct Bing Search with strict iusc & relevance filter
    if (!results.length) {
      results = await searchBingImages(ddgQuery, words, 20)
    }
    if (!results.length && broadQuery !== ddgQuery) {
      results = await searchBingImages(broadQuery, words, 20)
    }

    // Strategy 3: Authoritative Oracle Cloud Server API (if available and returns relevant results)
    if (!results.length) {
      const oracleApiUrl = process.env.ORACLE_API_URL || 'https://xn--dr8haa.uz/oracle'
      try {
        const oracleRes = await fetch(`${oracleApiUrl}/api/search-image?q=${encodeURIComponent(ddgQuery)}`, {
          signal: AbortSignal.timeout(3500)
        })
        if (oracleRes.ok) {
          const oracleData = await oracleRes.json()
          if (oracleData?.results && oracleData.results.length > 0) {
            results = oracleData.results
          }
        }
      } catch (_) {}
    }

    // Strategy 4: Unsplash Public Search
    if (!results.length) {
      results = await searchUnsplash(ddgQuery, 15)
    }

    // Strategy 5: Wikimedia Commons
    if (!results.length) {
      results = await searchWikimedia(broadQuery, 15)
    }

    // Strategy 6: Fallback placeholder matching main keyword
    if (!results.length) {
      const randomSeed = Math.floor(Math.random() * 1000000)
      results = [
        {
          title: `Image: ${ddgQuery}`,
          image: `https://loremflickr.com/1024/576/${loremFlickrTag}?random=${randomSeed}`,
          thumb: `https://loremflickr.com/320/240/${loremFlickrTag}?random=${randomSeed}`
        }
      ]
    }

    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.status(200).json({ results })
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Search API failed completely.' })
  }
}
