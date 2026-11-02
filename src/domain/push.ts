import { Array, Option, Schema } from 'effect'

import { type Game, Phase } from './game'

// Turn alerts for friend games. A device that turns on notifications hands
// its push subscription to the Room, and the Room sends it a Web Push message
// when that player has something to do and isn't looking at the game.

// The public half of the VAPID key pair (scripts/vapid.ts). The private half
// is the Worker secret VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY =
  'BByMB155Cw-CRZ9gHSPE3SwtxMycIDJKLzNl-HjyC7zED2LN-74xl7mashKx-DjhzDiDx629y_lo_nAd9YoIJA4'

// Push services want a contact for whoever sends the messages.
export const VAPID_SUBJECT = 'https://trash.jonstuebe.com'

// PushSubscription.toJSON(), the part a server needs to reach the device.
export const PushSubscription = Schema.Struct({
  endpoint: Schema.String,
  keys: Schema.Struct({ p256dh: Schema.String, auth: Schema.String }),
})
export type PushSubscription = typeof PushSubscription.Type

export const PushSubscriptionJson = Schema.fromJsonString(
  Schema.toCodecJson(PushSubscription),
)

export const PushRegistration = Schema.Struct({
  device: Schema.String,
  subscription: PushSubscription,
})
export type PushRegistration = typeof PushRegistration.Type

export const PushRegistrationJson = Schema.fromJsonString(
  Schema.toCodecJson(PushRegistration),
)

// What the service worker shows (public/push-sw.js reads these fields).
export const Notice = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  url: Schema.String,
  tag: Schema.String,
})
export type Notice = typeof Notice.Type

export const NoticeJson = Schema.fromJsonString(Schema.toCodecJson(Notice))

export type Alert = Readonly<{ seat: number; title: string; body: string }>

// The seat that has to do something next, if anyone does. Between rounds
// either player can deal, so nobody is waited on.
export const seatToAct = (game: Game): Option.Option<number> =>
  Phase.guards.AwaitingDraw(game.phase) ||
  Phase.guards.Holding(game.phase) ||
  Phase.guards.Reshuffling(game.phase)
    ? Option.some(game.currentIndex)
    : Option.none()

const turnBody = (maybeBefore: Option.Option<Game>): string =>
  Option.match(maybeBefore, {
    onNone: () => "Your friend joined. It's your turn.",
    onSome: before =>
      Phase.matchOrElse(
        before.phase,
        {
          GameOver: () => "Your friend started a new game. It's your turn.",
          RoundOver: () => "A new round started. It's your turn.",
        },
        () => "Your friend played. It's your turn.",
      ),
  })

// Who to tell about the change from one Game to the next. maybeBefore is
// none when the guest's arrival started the game.
export const alertsFor = (
  maybeBefore: Option.Option<Game>,
  after: Game,
): ReadonlyArray<Alert> => {
  const wasOver = Option.exists(maybeBefore, before =>
    Phase.guards.GameOver(before.phase),
  )

  if (Phase.guards.GameOver(after.phase) && !wasOver) {
    const winnerIndex = after.phase.winnerIndex
    return Array.map(after.players, (_player, seat) => ({
      seat,
      title: 'Game over',
      body: seat === winnerIndex ? 'You won!' : 'Your friend won this one.',
    }))
  }

  return Option.match(seatToAct(after), {
    onNone: () => [],
    onSome: seat =>
      Option.getOrUndefined(Option.flatMap(maybeBefore, seatToAct)) === seat
        ? []
        : [{ seat, title: 'Your turn', body: turnBody(maybeBefore) }],
  })
}
