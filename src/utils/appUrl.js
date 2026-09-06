/** Resolve a same-origin path against Vite's deployment base. */
export function appUrl(path = '') {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`
}
