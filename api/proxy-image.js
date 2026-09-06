export default async function handler(req, res) {
  try {
    const { url } = req.query
    if (!url) {
      res.status(400).json({ error: 'url parameter is required' })
      return
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*'
      },
      redirect: 'follow'
    })

    if (!response.ok) {
      res.status(response.status).json({ error: `Upstream returned ${response.status}` })
      return
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    res.setHeader('content-type', contentType)
    res.setHeader('cache-control', 'public, max-age=86400')

    const arrayBuffer = await response.arrayBuffer()
    res.status(200).send(Buffer.from(arrayBuffer))
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Proxy failed.' })
  }
}
