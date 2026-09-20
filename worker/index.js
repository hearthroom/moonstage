/** Same-origin public API proxy. No cookies, credential storage, or request logging. */
export async function fetchPlayground(request, env, upstream = fetch) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

  const path = url.pathname.slice(4)
  if (!path.startsWith('/open/v1/') && !/^\/oauth\/(register|authorize|token)$/.test(path)) {
    return new Response('Not found', { status: 404 })
  }
  const origin = new URL(env.API_ORIGIN)
  const target = new URL(path + url.search, origin)
  if (target.origin !== origin.origin) return new Response('Not found', { status: 404 })

  const headers = new Headers(request.headers)
  headers.delete('cookie')
  headers.delete('host')
  const forwarded = new Request(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
    duplex: 'half',
  })
  const response = await upstream(forwarded)
  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('set-cookie')
  responseHeaders.set('cache-control', 'no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders })
}

export default { fetch: (request, env) => fetchPlayground(request, env) }
