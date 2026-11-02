import { Effect, Queue, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { registerSW } from 'virtual:pwa-register'

import { Message } from './message'
import { Model } from './model'

// The service worker precaches the whole app, so it plays offline once
// installed. A new deploy installs a new worker in the background, which then
// waits; this stream reports that as FoundAppUpdate so the banner can offer to
// switch over. Kept out of main.ts because `virtual:pwa-register` only exists
// inside the Vite build, not under Vitest.

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

const serviceWorkerUpdates = Stream.callback<Message>(queue =>
  Effect.acquireRelease(
    Effect.sync(() => {
      let maybeRegistration: ServiceWorkerRegistration | undefined

      // A home-screen app can stay open for days, so look for a new version
      // every hour and whenever it comes back to the foreground.
      const checkForUpdate = () => {
        if (navigator.onLine) {
          maybeRegistration?.update().catch(() => undefined)
        }
      }
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate()
        }
      }

      registerSW({
        onNeedRefresh: () => Queue.offerUnsafe(queue, Message.FoundAppUpdate()),
        onRegisteredSW: (_url, registration) => {
          maybeRegistration = registration
        },
      })

      const interval = window.setInterval(
        checkForUpdate,
        UPDATE_CHECK_INTERVAL_MS,
      )
      document.addEventListener('visibilitychange', onVisibilityChange)

      return () => {
        window.clearInterval(interval)
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }),
    release => Effect.sync(release),
  ).pipe(Effect.andThen(Effect.never)),
)

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  serviceWorkerUpdates: Subscription.persistentEntry(serviceWorkerUpdates),
}))
