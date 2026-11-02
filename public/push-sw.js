// Turn alerts for friend games. The generated service worker loads this file
// with importScripts (see workbox.importScripts in vite.config.ts). The Room
// sends {title, body, url, tag}; see Notice in src/domain/push.ts.

self.addEventListener('push', event => {
  const notice = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(notice.title || 'Trash', {
      body: notice.body || "It's your turn.",
      // One alert per game: a newer one replaces the last.
      tag: notice.tag || 'trash',
      icon: '/pwa-192x192-v2.png',
      data: { url: notice.url || '/' },
    }),
  )
})

// Opens the game the alert is about, reusing the app if it's already open.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
    .href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(windows => {
        const open = windows.find(client => client.url === url) || windows[0]
        if (!open) {
          return self.clients.openWindow(url)
        }
        return (
          open.url === url ? Promise.resolve(open) : open.navigate(url)
        ).then(client => (client || open).focus())
      }),
  )
})
