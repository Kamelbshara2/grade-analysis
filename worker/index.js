// Cloudflare Worker: proxy /student-dev/* to the Pages project
// Deploy this worker on the kbws.app domain with route: kbws.app/student-dev*

const PAGES_URL = 'https://grade-analysis.pages.dev'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/student-dev')) {
      const target = new URL(url.pathname + url.search, PAGES_URL)
      const proxied = new Request(target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow',
      })
      return fetch(proxied)
    }

    return new Response('Not found', { status: 404 })
  },
}
