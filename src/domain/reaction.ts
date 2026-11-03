import { Array, Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

// A quick emoji one player sends the other in a friend game. Only these, so
// there's nothing to moderate. The Room relays a reaction by its name, never
// by the emoji itself, and drops any name it doesn't know.

export const Reaction = Schema.Literals([
  'ThumbsUp',
  'Laugh',
  'Wow',
  'Grimace',
  'Huff',
  'Fire',
  'Trash',
  'Clap',
])
export type Reaction = typeof Reaction.Type

export const REACTIONS: ReadonlyArray<Reaction> = Reaction.literals

const EMOJI: Record<Reaction, string> = {
  ThumbsUp: '👍',
  Laugh: '😂',
  Wow: '😮',
  Grimace: '😬',
  Huff: '😤',
  Fire: '🔥',
  Trash: '🗑️',
  Clap: '👏',
}

const LABEL: Record<Reaction, string> = {
  ThumbsUp: 'Thumbs up',
  Laugh: 'Laugh',
  Wow: 'Wow',
  Grimace: 'Yikes',
  Huff: 'Annoyed',
  Fire: 'Fire',
  Trash: 'Trash',
  Clap: 'Clap',
}

export const emojiOf = (reaction: Reaction): string => EMOJI[reaction]

export const labelOf = (reaction: Reaction): string => LABEL[reaction]

// How long a reaction stays on screen. A player can't send another while
// their last one is still showing.
export const REACTION_SHOW_MS = 2000

// The Room drops a seat's reactions that come faster than this, whatever
// the app on that device does.
export const REACTION_COOLDOWN_MS = 1000

export const isReactionAllowed = (
  maybeLastAtMillis: Option.Option<number>,
  nowMillis: number,
): boolean =>
  Option.match(maybeLastAtMillis, {
    onNone: () => true,
    onSome: lastAtMillis => nowMillis - lastAtMillis >= REACTION_COOLDOWN_MS,
  })

// Who a reaction goes to: the other seat's open sockets, or, with nobody
// there, held for that seat's next connection. Only the latest held
// reaction is kept.
export const Delivery = defineTaggedUnion({
  Live: { seat: Schema.Number },
  Hold: { seat: Schema.Number },
})
export type Delivery = typeof Delivery.Type

export const deliveryOf = (
  senderSeat: number,
  connectedSeats: ReadonlyArray<number>,
): Delivery => {
  const seat = senderSeat === 0 ? 1 : 0
  return Array.contains(connectedSeats, seat)
    ? Delivery.Live({ seat })
    : Delivery.Hold({ seat })
}
