import { Array, Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { type Card, buildDeck, deckCountFor } from './card'
import {
  Game,
  Phase,
  cardsToReshuffle,
  completeReshuffle,
  deal,
  drawFromStock,
  isViewerTurn,
  newFriendGame,
  nextRound,
  placeHeld,
  redact,
  takeDiscard,
  trashHeld,
} from './game'

// A friend game lives in a Room, one Durable Object per invite code. The host
// is the device that opened the room; the guest is the first other device to
// open the invite link. Nobody else gets a seat.

// CODE

// No 0/O or 1/I, so a code read aloud can't be misheard.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/

export const isRoomCode = (value: string): boolean =>
  ROOM_CODE_PATTERN.test(value)

export const roomPath = (code: string): string => `/r/${code}`

export const roomCodeFromPath = (path: string): Option.Option<string> => {
  const match = /^\/r\/([A-Za-z0-9]+)\/?$/.exec(path)
  return Option.filter(
    Option.fromNullishOr(match?.[1]?.toUpperCase()),
    isRoomCode,
  )
}

export const HOST_SEAT = 0
export const GUEST_SEAT = 1

// PROTOCOL

export const Intent = Schema.Literals(['Host', 'Join'])
export type Intent = typeof Intent.Type

export const Move = defineTaggedUnion({
  Draw: {},
  TakeDiscard: {},
  Place: { slotIndex: Schema.Number },
  Trash: {},
  NextRound: {},
  Rematch: {},
})
export type Move = typeof Move.Type

// Every Move names the Game.sequence it was made against, so a double tap or
// a move made on a stale screen is refused instead of applied to a newer state.
export const ClientMessage = Schema.Struct({
  sequence: Schema.Number,
  move: Move,
})
export type ClientMessage = typeof ClientMessage.Type

export const RoomView = defineTaggedUnion({
  WaitingForGuest: {},
  Playing: { game: Game },
})
export type RoomView = typeof RoomView.Type

export const Refusal = Schema.Literals(['Missing', 'Full'])
export type Refusal = typeof Refusal.Type

export const ServerMessage = defineTaggedUnion({
  Seated: { seat: Schema.Number, room: RoomView },
  Refused: { reason: Refusal },
})
export type ServerMessage = typeof ServerMessage.Type

export const ClientMessageJson = Schema.fromJsonString(
  Schema.toCodecJson(ClientMessage),
)
export const ServerMessageJson = Schema.fromJsonString(
  Schema.toCodecJson(ServerMessage),
)

// ROOM

export const Room = Schema.Struct({
  hostId: Schema.String,
  maybeGuestId: Schema.Option(Schema.String),
  maybeGame: Schema.Option(Game),
})
export type Room = typeof Room.Type

export const RoomJson = Schema.fromJsonString(Schema.toCodecJson(Room))

export const openRoom = (hostId: string): Room => ({
  hostId,
  maybeGuestId: Option.none(),
  maybeGame: Option.none(),
})

export type Shuffle = (cards: ReadonlyArray<Card>) => ReadonlyArray<Card>

// Runs the steps nobody takes a turn for: dealing a fresh round and turning
// the discards into a new draw pile.
export const settle = (game: Game, shuffle: Shuffle): Game =>
  Phase.matchOrElse(
    game.phase,
    {
      Shuffling: () =>
        settle(
          deal(game, shuffle(buildDeck(deckCountFor(game.players.length)))),
          shuffle,
        ),
      // NOTE: with nothing under the top discard there's nothing to
      // reshuffle, and drawing again would ask for another reshuffle forever.
      Reshuffling: () =>
        Array.isReadonlyArrayEmpty(cardsToReshuffle(game))
          ? game
          : settle(
              completeReshuffle(game, shuffle(cardsToReshuffle(game))),
              shuffle,
            ),
    },
    () => game,
  )

export type Seating = Readonly<{ room: Room; seat: number }>

// Seats a device, starting the game when the guest first arrives.
export const seat = (
  maybeRoom: Option.Option<Room>,
  deviceId: string,
  intent: Intent,
  shuffle: Shuffle,
): Option.Option<Seating> | Refusal =>
  Option.match(maybeRoom, {
    onNone: () =>
      intent === 'Host'
        ? Option.some({ room: openRoom(deviceId), seat: HOST_SEAT })
        : 'Missing',
    onSome: (room): Option.Option<Seating> | Refusal => {
      if (room.hostId === deviceId) {
        return Option.some({ room, seat: HOST_SEAT })
      }
      return Option.match(room.maybeGuestId, {
        onNone: () =>
          Option.some({
            room: modifyFields(room, {
              maybeGuestId: () => Option.some(deviceId),
              maybeGame: () => Option.some(settle(newFriendGame(), shuffle)),
            }),
            seat: GUEST_SEAT,
          }),
        onSome: guestId =>
          guestId === deviceId
            ? Option.some({ room, seat: GUEST_SEAT })
            : 'Full',
      })
    },
  })

const onTurn =
  (seat: number, transition: (game: Game) => Game) =>
  (game: Game): Game =>
    isViewerTurn(game, seat) ? transition(game) : game

// Applies one player's Move. Returns the same Game when the Move isn't
// allowed, so the caller can tell nothing happened.
export const applyMove = (
  game: Game,
  seat: number,
  message: ClientMessage,
  shuffle: Shuffle,
): Game => {
  if (message.sequence !== game.sequence) {
    return game
  }

  const moved = Move.match(message.move, {
    Draw: () => onTurn(seat, drawFromStock)(game),
    TakeDiscard: () => onTurn(seat, takeDiscard)(game),
    Place: ({ slotIndex }) =>
      onTurn(seat, current => placeHeld(current, slotIndex))(game),
    Trash: () => onTurn(seat, trashHeld)(game),
    NextRound: () => nextRound(game),
    Rematch: () =>
      Phase.guards.GameOver(game.phase)
        ? modifyFields(newFriendGame(), {
            sequence: () => game.sequence + 1,
          })
        : game,
  })

  return moved === game ? game : settle(moved, shuffle)
}

export const viewOf = (room: Room): RoomView =>
  Option.match(room.maybeGame, {
    onNone: () => RoomView.WaitingForGuest(),
    onSome: game => RoomView.Playing({ game: redact(game) }),
  })
