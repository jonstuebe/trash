import { Array, Duration, Option, Schema, pipe } from 'effect'
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
  endGame,
  isViewerTurn,
  newFriendGame,
  nextRound,
  placeHeld,
  redact,
  takeDiscard,
  trashHeld,
} from './game'
import { seatToAct } from './push'

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

// What a player typed into the join screen: the code itself, in any case and
// with spaces or dashes, or a whole invite link pasted in.
export const roomCodeFromInput = (input: string): Option.Option<string> => {
  const linkMatch = /\/r\/([A-Za-z0-9]+)/.exec(input)
  if (linkMatch) {
    return roomCodeFromPath(linkMatch[0])
  }
  return Option.liftPredicate(
    input.replace(/[\s-]/g, '').toUpperCase(),
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
  EndGame: {},
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

// NAMES

// Each player types their own name once; the device sends it every time it
// connects, and the Room shows it to the other player.
export const PLAYER_NAME_MAX_LENGTH = 20

export const cleanPlayerName = (raw: string): Option.Option<string> =>
  pipe(
    raw
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
    name => Array.fromIterable(name).slice(0, PLAYER_NAME_MAX_LENGTH).join(''),
    name => name.trim(),
    Option.liftPredicate(name => name !== ''),
  )

// ROOM

// The names are optional keys so rooms saved before players had names still
// load.
export const Room = Schema.Struct({
  hostId: Schema.String,
  maybeGuestId: Schema.Option(Schema.String),
  maybeGame: Schema.Option(Game),
  maybeHostName: Schema.OptionFromOptionalKey(Schema.String),
  maybeGuestName: Schema.OptionFromOptionalKey(Schema.String),
})
export type Room = typeof Room.Type

export const RoomJson = Schema.fromJsonString(Schema.toCodecJson(Room))

export const openRoom = (hostId: string): Room => ({
  hostId,
  maybeGuestId: Option.none(),
  maybeGame: Option.none(),
  maybeHostName: Option.none(),
  maybeGuestName: Option.none(),
})

// Records the name a seated device connected with. A device that sent no
// name keeps the one it had.
export const nameSeat = (
  room: Room,
  seatIndex: number,
  maybeName: Option.Option<string>,
): Room => {
  if (Option.isNone(maybeName)) {
    return room
  }
  return seatIndex === HOST_SEAT
    ? modifyFields(room, { maybeHostName: () => maybeName })
    : modifyFields(room, { maybeGuestName: () => maybeName })
}

const maybeNameOf = (room: Room, seatIndex: number): Option.Option<string> =>
  seatIndex === HOST_SEAT ? room.maybeHostName : room.maybeGuestName

// The Game with each player's own name in place of the stand-in.
export const withNames = (room: Room, game: Game): Game =>
  modifyFields(game, {
    players: players =>
      Array.map(players, (player, seatIndex) =>
        Option.match(maybeNameOf(room, seatIndex), {
          onNone: () => player,
          onSome: name => modifyFields(player, { name: () => name }),
        }),
      ),
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

// The seat a device already holds, without seating it.
export const seatOfDevice = (
  room: Room,
  deviceId: string,
): Option.Option<number> => {
  if (room.hostId === deviceId) {
    return Option.some(HOST_SEAT)
  }
  return Option.exists(room.maybeGuestId, guestId => guestId === deviceId)
    ? Option.some(GUEST_SEAT)
    : Option.none()
}

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
    EndGame: () => endGame(game, seat),
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
    onSome: game => RoomView.Playing({ game: redact(withNames(room, game)) }),
  })

// SUMMARY

// What the menu shows for one game, without its cards.
export const GameSummary = defineTaggedUnion({
  Missing: {},
  NotSeated: {},
  WaitingForGuest: {},
  YourTurn: { opponentName: Schema.String, round: Schema.Number },
  TheirTurn: { opponentName: Schema.String, round: Schema.Number },
  BetweenRounds: { opponentName: Schema.String, round: Schema.Number },
  Over: { opponentName: Schema.String, didWin: Schema.Boolean },
  Ended: {
    opponentName: Schema.String,
    round: Schema.Number,
    outcome: Schema.Literals(['Won', 'Lost', 'Tied']),
  },
})
export type GameSummary = typeof GameSummary.Type

export const GameSummaryJson = Schema.fromJsonString(
  Schema.toCodecJson(GameSummary),
)

const otherSeat = (seatIndex: number): number =>
  seatIndex === HOST_SEAT ? GUEST_SEAT : HOST_SEAT

export const summaryOf = (
  maybeRoom: Option.Option<Room>,
  deviceId: string,
): GameSummary =>
  Option.match(maybeRoom, {
    onNone: () => GameSummary.Missing(),
    onSome: room =>
      Option.match(seatOfDevice(room, deviceId), {
        onNone: () => GameSummary.NotSeated(),
        onSome: seatIndex =>
          Option.match(room.maybeGame, {
            onNone: () => GameSummary.WaitingForGuest(),
            onSome: unnamed => {
              const game = withNames(room, unnamed)
              const opponentName = Array.getUnsafe(
                game.players,
                otherSeat(seatIndex),
              ).name
              const round = game.round
              if (Phase.guards.Ended(game.phase)) {
                return GameSummary.Ended({
                  opponentName,
                  round,
                  outcome: Option.match(game.phase.maybeWinnerIndex, {
                    onNone: () => 'Tied',
                    onSome: winnerIndex =>
                      winnerIndex === seatIndex ? 'Won' : 'Lost',
                  }),
                })
              }
              if (Phase.guards.GameOver(game.phase)) {
                return GameSummary.Over({
                  opponentName,
                  didWin: game.phase.winnerIndex === seatIndex,
                })
              }
              return Option.match(seatToAct(game), {
                onNone: () =>
                  GameSummary.BetweenRounds({ opponentName, round }),
                onSome: actingSeat =>
                  actingSeat === seatIndex
                    ? GameSummary.YourTurn({ opponentName, round })
                    : GameSummary.TheirTurn({ opponentName, round }),
              })
            },
          }),
      }),
  })

// CANCELLING

// Only the host can call off an invite, and only before anyone has joined.
// A Room that's already gone has nothing left to cancel.
export type Cancellation = 'Delete' | 'Gone' | 'Joined' | 'NotHost'

export const cancellationOf = (
  maybeRoom: Option.Option<Room>,
  deviceId: string,
): Cancellation =>
  Option.match(maybeRoom, {
    onNone: () => 'Gone',
    onSome: room => {
      if (room.hostId !== deviceId) {
        return 'NotHost'
      }
      return Option.isSome(room.maybeGuestId) ? 'Joined' : 'Delete'
    },
  })

// EXPIRY

// A Room deletes itself once nobody has touched it for a while. Every change
// pushes the deadline back, so only a game both players walked away from
// expires.
export const UNJOINED_INVITE_LIFETIME = Duration.days(7)
export const IDLE_GAME_LIFETIME = Duration.days(30)
export const FINISHED_GAME_LIFETIME = Duration.days(7)

export const lifetimeOf = (room: Room): Duration.Duration =>
  Option.match(room.maybeGame, {
    onNone: () => UNJOINED_INVITE_LIFETIME,
    onSome: game =>
      Phase.guards.GameOver(game.phase) || Phase.guards.Ended(game.phase)
        ? FINISHED_GAME_LIFETIME
        : IDLE_GAME_LIFETIME,
  })
