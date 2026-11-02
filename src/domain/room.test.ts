import { Array, Option, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { type Card } from './card'
import { type Game, Phase, Slot } from './game'
import {
  FINISHED_GAME_LIFETIME,
  GUEST_SEAT,
  GameSummary,
  HOST_SEAT,
  IDLE_GAME_LIFETIME,
  Move,
  type Room,
  RoomJson,
  RoomView,
  type Seating,
  UNJOINED_INVITE_LIFETIME,
  applyMove,
  cleanPlayerName,
  lifetimeOf,
  nameSeat,
  openRoom,
  roomCodeFromPath,
  seat,
  settle,
  summaryOf,
  viewOf,
} from './room'

const HOST = 'host-device-0000-0000'
const GUEST = 'guest-device-0000-0000'
const STRANGER = 'stranger-device-0000'

const unshuffled = (cards: ReadonlyArray<Card>) => cards

const seated = (result: Option.Option<Seating> | string): Seating => {
  if (typeof result === 'string' || Option.isNone(result)) {
    throw new Error(`expected a seat, got ${String(result)}`)
  }
  return result.value
}

const startedRoom = (): Room =>
  seated(seat(Option.some(openRoom(HOST)), GUEST, 'Join', unshuffled)).room

const gameOf = (room: Room): Game => Option.getOrThrow(room.maybeGame)

describe('roomCodeFromPath', () => {
  test('reads an invite link, in any case', () => {
    expect(roomCodeFromPath('/r/K7QXMP')).toEqual(Option.some('K7QXMP'))
    expect(roomCodeFromPath('/r/k7qxmp/')).toEqual(Option.some('K7QXMP'))
  })

  test('ignores other paths and codes with confusable characters', () => {
    expect(roomCodeFromPath('/')).toEqual(Option.none())
    expect(roomCodeFromPath('/r/K7QX0P')).toEqual(Option.none())
    expect(roomCodeFromPath('/r/K7QX')).toEqual(Option.none())
  })
})

describe('seat', () => {
  test('the host opens a room and waits for a guest', () => {
    const seating = seated(seat(Option.none(), HOST, 'Host', unshuffled))

    expect(seating.seat).toBe(HOST_SEAT)
    expect(viewOf(seating.room)).toEqual(RoomView.WaitingForGuest())
  })

  test('a guest cannot open a room that does not exist', () => {
    expect(seat(Option.none(), GUEST, 'Join', unshuffled)).toBe('Missing')
  })

  test('the first guest starts the game with both hands dealt', () => {
    const room = startedRoom()
    const game = gameOf(room)

    expect(room.maybeGuestId).toEqual(Option.some(GUEST))
    expect(Phase.guards.AwaitingDraw(game.phase)).toBe(true)
    expect(Array.map(game.players, player => player.slots.length)).toEqual([
      10, 10,
    ])
  })

  test('each device gets its own seat back, and a third is turned away', () => {
    const room = startedRoom()

    expect(seated(seat(Option.some(room), HOST, 'Join', unshuffled)).seat).toBe(
      HOST_SEAT,
    )
    expect(seated(seat(Option.some(room), GUEST, 'Join', unshuffled))).toEqual({
      room,
      seat: GUEST_SEAT,
    })
    expect(seat(Option.some(room), STRANGER, 'Join', unshuffled)).toBe('Full')
  })
})

describe('applyMove', () => {
  test('the player whose turn it is can draw', () => {
    const game = gameOf(startedRoom())
    const moved = applyMove(
      game,
      HOST_SEAT,
      { sequence: game.sequence, move: Move.Draw() },
      unshuffled,
    )

    expect(Phase.guards.Holding(moved.phase)).toBe(true)
  })

  test('a move out of turn changes nothing', () => {
    const game = gameOf(startedRoom())

    expect(
      applyMove(
        game,
        GUEST_SEAT,
        { sequence: game.sequence, move: Move.Draw() },
        unshuffled,
      ),
    ).toBe(game)
  })

  test('a move made against an older sequence changes nothing', () => {
    const game = gameOf(startedRoom())

    expect(
      applyMove(
        game,
        HOST_SEAT,
        { sequence: game.sequence - 1, move: Move.Draw() },
        unshuffled,
      ),
    ).toBe(game)
  })

  test('an empty draw pile is reshuffled from the discards without a turn', () => {
    const started = gameOf(startedRoom())
    const game = modifyFields(started, {
      stock: () => [],
      discard: discard => [...Array.take(started.stock, 5), ...discard],
    })
    const moved = applyMove(
      game,
      HOST_SEAT,
      { sequence: game.sequence, move: Move.Draw() },
      unshuffled,
    )

    expect(Phase.guards.Holding(moved.phase)).toBe(true)
    expect(moved.stock).toHaveLength(4)
    expect(moved.discard).toHaveLength(1)
  })

  test('with nothing to reshuffle, the room waits instead of looping', () => {
    const game = modifyFields(gameOf(startedRoom()), { stock: () => [] })
    const moved = applyMove(
      game,
      HOST_SEAT,
      { sequence: game.sequence, move: Move.Draw() },
      unshuffled,
    )

    expect(Phase.guards.Reshuffling(moved.phase)).toBe(true)
  })

  test('a rematch only starts once the game is over', () => {
    const game = gameOf(startedRoom())
    const rematch = { sequence: game.sequence, move: Move.Rematch() }

    expect(applyMove(game, GUEST_SEAT, rematch, unshuffled)).toBe(game)

    const over = modifyFields(game, {
      phase: () => Phase.GameOver({ winnerIndex: 0 }),
    })
    const next = applyMove(over, GUEST_SEAT, rematch, unshuffled)

    expect(next.round).toBe(1)
    expect(next.sequence).toBeGreaterThan(over.sequence)
    expect(Phase.guards.AwaitingDraw(next.phase)).toBe(true)
  })
})

describe('viewOf', () => {
  test('never sends a face-down card', () => {
    const view = viewOf(startedRoom())

    if (!RoomView.guards.Playing(view)) {
      throw new Error('expected a game')
    }
    const slots = Array.flatMap(view.game.players, player => player.slots)
    expect(
      Array.every(
        slots,
        slot => Slot.guards.Hidden(slot) && slot.card.rank === 0,
      ),
    ).toBe(true)
  })
})

describe('settle', () => {
  test('leaves a game that is waiting on a player alone', () => {
    const game = gameOf(startedRoom())

    expect(settle(game, unshuffled)).toBe(game)
  })
})

describe('turn order', () => {
  test('the player who sent the invite goes first', () => {
    const game = gameOf(startedRoom())
    expect(game.currentIndex).toBe(HOST_SEAT)
    expect(Phase.guards.AwaitingDraw(game.phase)).toBe(true)
  })

  test('a rematch starts with the player who sent the invite', () => {
    const over = modifyFields(gameOf(startedRoom()), {
      currentIndex: () => GUEST_SEAT,
      phase: () => Phase.GameOver({ winnerIndex: GUEST_SEAT }),
    })
    const rematch = applyMove(
      over,
      GUEST_SEAT,
      { sequence: over.sequence, move: Move.Rematch() },
      unshuffled,
    )
    expect(rematch.currentIndex).toBe(HOST_SEAT)
  })
})

describe('names', () => {
  test('a name is trimmed, kept to one line, and capped', () => {
    expect(cleanPlayerName('  Sam  ')).toEqual(Option.some('Sam'))
    expect(cleanPlayerName('Mary\n  Jane')).toEqual(Option.some('Mary Jane'))
    expect(cleanPlayerName('   ')).toEqual(Option.none())
    expect(cleanPlayerName('A'.repeat(40))).toEqual(Option.some('A'.repeat(20)))
  })

  test('each player sees the other by the name they gave', () => {
    const room = nameSeat(
      nameSeat(startedRoom(), HOST_SEAT, Option.some('Sam')),
      GUEST_SEAT,
      Option.some('Alex'),
    )
    const view = viewOf(room)
    if (!RoomView.guards.Playing(view)) {
      throw new Error('expected a game')
    }
    expect(Array.map(view.game.players, player => player.name)).toEqual([
      'Sam',
      'Alex',
    ])
  })

  test('connecting without a name keeps the one the seat had', () => {
    const named = nameSeat(startedRoom(), GUEST_SEAT, Option.some('Alex'))
    expect(nameSeat(named, GUEST_SEAT, Option.none())).toBe(named)
  })

  test('a room saved before players had names still loads', () => {
    const encoded = Schema.encodeSync(RoomJson)(startedRoom())
    const legacy = JSON.stringify(
      Object.fromEntries(
        Object.entries(JSON.parse(encoded)).filter(
          ([key]) => key !== 'maybeHostName' && key !== 'maybeGuestName',
        ),
      ),
    )
    const decoded = Schema.decodeSync(RoomJson)(legacy)
    expect(decoded.maybeHostName).toEqual(Option.none())
    expect(decoded.maybeGuestName).toEqual(Option.none())
    expect(decoded.maybeGame).toEqual(startedRoom().maybeGame)
  })
})

describe('summaryOf', () => {
  const named = (): Room =>
    nameSeat(
      nameSeat(startedRoom(), HOST_SEAT, Option.some('Sam')),
      GUEST_SEAT,
      Option.some('Alex'),
    )

  test('a missing room, or one without this device, says so', () => {
    expect(summaryOf(Option.none(), HOST)).toEqual(GameSummary.Missing())
    expect(summaryOf(Option.some(named()), STRANGER)).toEqual(
      GameSummary.NotSeated(),
    )
  })

  test('the host waits until the guest arrives', () => {
    expect(summaryOf(Option.some(openRoom(HOST)), HOST)).toEqual(
      GameSummary.WaitingForGuest(),
    )
  })

  test("tells each player whose turn it is, by the other one's name", () => {
    const room = Option.some(named())
    expect(summaryOf(room, HOST)).toEqual(
      GameSummary.YourTurn({ opponentName: 'Alex', round: 1 }),
    )
    expect(summaryOf(room, GUEST)).toEqual(
      GameSummary.TheirTurn({ opponentName: 'Sam', round: 1 }),
    )
  })

  test('between rounds and after the game, nobody is waited on', () => {
    const at = (phase: Phase): Option.Option<Room> =>
      Option.some(
        modifyFields(named(), {
          maybeGame: maybeGame =>
            Option.map(maybeGame, game =>
              modifyFields(game, { phase: () => phase }),
            ),
        }),
      )
    expect(
      summaryOf(at(Phase.RoundOver({ finisherIndexes: [0] })), GUEST),
    ).toEqual(GameSummary.BetweenRounds({ opponentName: 'Sam', round: 1 }))
    const over = at(Phase.GameOver({ winnerIndex: GUEST_SEAT }))
    expect(summaryOf(over, GUEST)).toEqual(
      GameSummary.Over({ opponentName: 'Sam', didWin: true }),
    )
    expect(summaryOf(over, HOST)).toEqual(
      GameSummary.Over({ opponentName: 'Alex', didWin: false }),
    )
  })
})

describe('lifetimeOf', () => {
  test('an unanswered invite and a finished game go after a week, a game in play after a month', () => {
    expect(lifetimeOf(openRoom(HOST))).toEqual(UNJOINED_INVITE_LIFETIME)
    expect(lifetimeOf(startedRoom())).toEqual(IDLE_GAME_LIFETIME)
    const finished = modifyFields(startedRoom(), {
      maybeGame: maybeGame =>
        Option.map(maybeGame, game =>
          modifyFields(game, {
            phase: () => Phase.GameOver({ winnerIndex: HOST_SEAT }),
          }),
        ),
    })
    expect(lifetimeOf(finished)).toEqual(FINISHED_GAME_LIFETIME)
  })
})
