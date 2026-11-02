import { Duration, Effect, Option, Schema } from 'effect'

import {
  PushRegistrationJson,
  PushSubscription,
  VAPID_PUBLIC_KEY,
} from './domain/push'
import type { AlertsOutcome } from './message'
import { TurnAlerts } from './model'

// The browser side of turn alerts: asking for permission, subscribing this
// device to push, and handing the subscription to the Room it plays in. One
// subscription serves every friend game on the device.

const isIos = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const canPush = (): boolean =>
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const turnAlertsAtStart = (): TurnAlerts => {
  if (!canPush()) {
    return isIos() ? TurnAlerts.NeedsHomeScreen() : TurnAlerts.Unsupported()
  }
  const permission = Notification.permission
  if (permission === 'granted') {
    return TurnAlerts.On()
  }
  return permission === 'denied' ? TurnAlerts.Blocked() : TurnAlerts.Off()
}

const applicationServerKey = (): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(VAPID_PUBLIC_KEY.replaceAll('-', '+').replaceAll('_', '/')),
    char => char.charCodeAt(0),
  )

// NOTE: in `vite dev` there is no service worker, so this times out rather
// than waiting forever.
const serviceWorker = Effect.tryPromise(
  () => navigator.serviceWorker.ready,
).pipe(Effect.timeout(Duration.seconds(5)))

const pushSubscription = Effect.gen(function* () {
  const registration = yield* serviceWorker
  const maybeExisting = Option.fromNullishOr(
    yield* Effect.tryPromise(() => registration.pushManager.getSubscription()),
  )
  if (Option.isSome(maybeExisting)) {
    return maybeExisting.value
  }
  return yield* Effect.tryPromise(() =>
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(),
    }),
  )
})

// Subscribes if needed and tells the Room, which keeps one subscription per
// seat. Safe to repeat: the Room just replaces what it had.
export const registerTurnAlerts = (
  code: string,
  deviceId: string,
): Effect.Effect<AlertsOutcome> =>
  Effect.gen(function* () {
    const subscription = yield* pushSubscription
    const keys = yield* Schema.decodeUnknownEffect(PushSubscription)(
      subscription.toJSON(),
    )
    const body = yield* Schema.encodeEffect(PushRegistrationJson)({
      device: deviceId,
      subscription: keys,
    })
    const response = yield* Effect.tryPromise(() =>
      fetch(`/api/rooms/${code}/push`, { method: 'POST', body }),
    )
    return response.ok ? 'On' : 'Failed'
  }).pipe(Effect.catch(() => Effect.succeed<AlertsOutcome>('Failed')))

// Asks for permission (iOS only allows this from a tap), then registers.
export const enableTurnAlerts = (
  code: string,
  deviceId: string,
): Effect.Effect<AlertsOutcome> =>
  Effect.tryPromise(() => Notification.requestPermission()).pipe(
    Effect.flatMap(permission => {
      if (permission === 'granted') {
        return registerTurnAlerts(code, deviceId)
      }
      return Effect.succeed<AlertsOutcome>(
        permission === 'denied' ? 'Blocked' : 'Off',
      )
    }),
    Effect.catch(() => Effect.succeed<AlertsOutcome>('Failed')),
  )
