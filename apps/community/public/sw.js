const FALLBACK_HREF = '/notifications'

const OFFLINE_URL = '/offline'
const OFFLINE_CACHE = 'meith-offline-v1'

function readPayload(event) {
  if (!event.data) return null

  try {
    const payload = event.data.json()
    if (payload === null || typeof payload !== 'object') return null
    if (typeof payload.title !== 'string' || payload.title === '') return null
    return payload
  } catch (_error) {
    return null
  }
}

function fallbackUrl() {
  return new URL(FALLBACK_HREF, self.location.origin).href
}

function targetUrl(href) {
  const wanted = typeof href === 'string' && href !== '' ? href : FALLBACK_HREF

  try {
    const url = new URL(wanted, self.location.origin)
    return url.origin === self.location.origin ? url.href : fallbackUrl()
  } catch (_error) {
    return fallbackUrl()
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting()

  event.waitUntil(
    fetch(OFFLINE_URL, { cache: 'reload' })
      .then((response) => {
        if (!response.ok) return
        return caches.open(OFFLINE_CACHE).then((cache) => cache.put(OFFLINE_URL, response))
      })
      .catch(() => {}),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('meith-offline-') && key !== OFFLINE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .catch(() => {})
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return

  const retryRequest = event.request.clone()

  try {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || fetch(retryRequest)),
      ),
    )
  } catch (_error) {
    event.respondWith(fetch(retryRequest))
  }
})

self.addEventListener('push', (event) => {
  const payload = readPayload(event)
  if (payload === null) return

  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    tag: typeof payload.id === 'number' ? `meith-${payload.id}` : 'meith',
    data: { href: targetUrl(payload.href) },
    icon: '/brand/icon-192.png',
    badge: '/brand/icon-192.png',
    timestamp: Date.now(),
  }

  if (typeof payload.badge === 'number' && 'setAppBadge' in navigator) {
    navigator.setAppBadge(payload.badge).catch(() => {})
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const href = targetUrl(event.notification.data && event.notification.data.href)

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === href && 'focus' in client) return client.focus()
        }

        const open = clients[0]
        if (open !== undefined && 'navigate' in open) {
          return open.focus().then(() => open.navigate(href))
        }

        return self.clients.openWindow(href)
      })
      .catch(() => self.clients.openWindow(href)),
  )
})
