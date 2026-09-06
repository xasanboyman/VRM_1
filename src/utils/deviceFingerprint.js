/**
 * Generates a persistent device fingerprint based on browser characteristics.
 * This provides a stable ID across sessions even if localStorage is cleared.
 * Note: This is a best-effort client-side identification, not a security feature.
 */
export async function generateDeviceFingerprint() {
  try {
    const components = []

    // 1. Basic Navigator Properties
    const nav = window.navigator
    if (nav) {
      components.push(nav.userAgent || '')
      components.push(nav.language || '')
      components.push(nav.hardwareConcurrency || '')
      components.push(nav.deviceMemory || '')
      components.push(nav.platform || '')
    }

    // 2. Screen Properties
    const screen = window.screen
    if (screen) {
      components.push(`${screen.width}x${screen.height}`)
      components.push(`${screen.colorDepth}`)
      components.push(`${screen.pixelDepth}`)
    }

    // 3. Timezone
    try {
      components.push(Intl.DateTimeFormat().resolvedOptions().timeZone)
    } catch {
      components.push(new Date().getTimezoneOffset())
    }

    // 4. Canvas Fingerprinting (Rendering distinctive graphics)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        canvas.width = 200
        canvas.height = 50

        // Text with different fonts and styles
        ctx.textBaseline = 'top'
        ctx.font = '14px "Arial"'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = '#f60'
        ctx.fillRect(125, 1, 62, 20)
        ctx.fillStyle = '#069'
        ctx.fillText('VRM_User_Id_v1', 2, 15)
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
        ctx.fillText('VRM_User_Id_v1', 4, 17)

        // Geometric shapes and blending
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = 'rgb(255,0,255)'
        ctx.beginPath()
        ctx.arc(50, 50, 50, 0, Math.PI * 2, true)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgb(0,255,255)'
        ctx.beginPath()
        ctx.arc(100, 50, 50, 0, Math.PI * 2, true)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = 'rgb(255,255,0)'
        ctx.beginPath()
        ctx.arc(75, 100, 50, 0, Math.PI * 2, true)
        ctx.closePath()
        ctx.fill()

        components.push(canvas.toDataURL())
      }
    } catch {
      components.push('canvas-failed')
    }

    // Create a hash from the components
    const joined = components.join('||')
    const encoder = new TextEncoder()
    const data = encoder.encode(joined)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

    // Return a shortened version (first 16 chars)
    return `usr-${hashHex.slice(0, 16)}`
  } catch (error) {
    console.warn('Fingerprint generation failed, falling back to random ID', error)
    // Fallback to a random ID if fingerprinting fails completely
    return `usr-rnd-${Math.random().toString(36).slice(2, 14)}`
  }
}
