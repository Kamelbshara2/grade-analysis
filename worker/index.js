// Proxy kbws.app/student-dev* → Cloudflare Pages
// Strips the /student-dev prefix so Pages serves assets from its root

const PAGES_URL = 'https://grade-analysis-8po.pages.dev'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/student-dev')) {
      const stripped = url.pathname.replace(/^\/student-dev/, '') || '/'
      const target = new URL(stripped + url.search, PAGES_URL)
      return fetch(new Request(target.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow',
      }))
    }

    return new Response('Not found', { status: 404 })
  },
}
