import { Effect, Queue, Schema, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { registerSW } from 'virtual:pwa-register'

import { Message } from './message'
import { Connection, Model, Screen } from './model'
import {
  RoomSocket,
  type RoomSocketService,
  roomSocketMessages,
} from './roomSocket'

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

// The socket's messages, while a friend game is connected.
const roomSocketStream = (isConnected: boolean) =>
  Stream.when(
    Stream.unwrap(
      RoomSocket.get.pipe(
        Effect.map(roomSocketMessages),
        Effect.catchTag('ResourceNotAvailable', () =>
          Effect.succeed(Stream.empty),
        ),
      ),
    ),
    Effect.sync(() => isConnected),
  )

// NOTE: only once the socket is up. Started any earlier, the stream would
// find no socket and never look again.
const isFriendSocketOpen = (model: Model): boolean =>
  Screen.matchOrElse(
    model.screen,
    { Friend: ({ connection }) => Connection.guards.Connected(connection) },
    () => false,
  )

// Leaving the app drops the game's socket, so the Room knows this player
// isn't looking and sends them a turn alert. Phones suspend a backgrounded
// app without closing its sockets, which otherwise look open for minutes.
const returnsToApp = Stream.callback<Message>(queue =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const onVisibilityChange = () => {
        Queue.offerUnsafe(
          queue,
          document.visibilityState === 'visible'
            ? Message.ReturnedToApp()
            : Message.LeftApp(),
        )
      }
      const onOnline = () => Queue.offerUnsafe(queue, Message.ReturnedToApp())
      document.addEventListener('visibilitychange', onVisibilityChange)
      window.addEventListener('online', onOnline)
      return () => {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        window.removeEventListener('online', onOnline)
      }
    }),
    release => Effect.sync(release),
  ).pipe(Effect.andThen(Effect.never)),
)

export const subscriptions = Subscription.make<
  Model,
  Message,
  RoomSocketService
>()(entry => ({
  serviceWorkerUpdates: Subscription.persistentEntry(serviceWorkerUpdates),
  returnsToApp: Subscription.persistentEntry(returnsToApp),
  roomSocket: entry(
    { isOpen: Schema.Boolean },
    {
      modelToDependencies: model => ({ isOpen: isFriendSocketOpen(model) }),
      dependenciesToStream: ({ isOpen }) => roomSocketStream(isOpen),
    },
  ),
}))
