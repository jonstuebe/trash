import { Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, it } from 'vitest'

import { Phase, drawFromStock, newFriendGame, trashHeld } from './game'
import { alertsFor, seatToAct } from './push'
import {
  GUEST_SEAT,
  HOST_SEAT,
  openRoom,
  seatOfDevice,
  settle,
  withNames,
} from './room'

const namedRoom = modifyFields(openRoom('host'), {
  maybeHostName: () => Option.some('Sam'),
  maybeGuestName: () => Option.some('Alex'),
})

const dealt = () =>
  withNames(
    namedRoom,
    settle(newFriendGame(), cards => cards),
  )

describe('alertsFor', () => {
  it('tells the host when the guest arrives and the game starts', () => {
    const game = dealt()
    expect(alertsFor(Option.none(), game)).toEqual([
      {
        seat: HOST_SEAT,
        title: 'Your turn',
        body: "Alex joined. It's your turn.",
      },
    ])
  })

  it('says nothing while the same player is still moving', () => {
    const game = dealt()
    expect(alertsFor(Option.some(game), drawFromStock(game))).toEqual([])
  })

  it('tells the other player when the turn passes', () => {
    const game = dealt()
    // Drawing then trashing ends the host's turn whatever the card was,
    // unless it fit a slot; force a trash card on top of the stock.
    const withTrashOnTop = modifyFields(game, {
      stock: () => [
        ...game.stock,
        { id: 99, rank: 13, suit: 'Clubs' as const },
      ],
    })
    const after = trashHeld(drawFromStock(withTrashOnTop))
    expect(seatToAct(after)).toEqual(Option.some(GUEST_SEAT))
    expect(alertsFor(Option.some(withTrashOnTop), after)).toEqual([
      {
        seat: GUEST_SEAT,
        title: 'Your turn',
        body: "Sam played. It's your turn.",
      },
    ])
  })

  it('tells both players when the game ends', () => {
    const game = dealt()
    const over = modifyFields(game, {
      phase: () => Phase.GameOver({ winnerIndex: GUEST_SEAT }),
    })
    expect(alertsFor(Option.some(game), over)).toEqual([
      {
        seat: HOST_SEAT,
        title: 'Game over',
        body: 'Alex won this one.',
      },
      { seat: GUEST_SEAT, title: 'Game over', body: 'You won!' },
    ])
  })

  it('waits on nobody between rounds', () => {
    const game = modifyFields(dealt(), {
      phase: () => Phase.RoundOver({ finisherIndexes: [0] }),
    })
    expect(seatToAct(game)).toEqual(Option.none())
    expect(alertsFor(Option.some(dealt()), game)).toEqual([])
  })
})

describe('seatOfDevice', () => {
  it('finds the host and the guest, and nobody else', () => {
    const room = modifyFields(openRoom('host'), {
      maybeGuestId: () => Option.some('guest'),
    })
    expect(seatOfDevice(room, 'host')).toEqual(Option.some(HOST_SEAT))
    expect(seatOfDevice(room, 'guest')).toEqual(Option.some(GUEST_SEAT))
    expect(seatOfDevice(room, 'stranger')).toEqual(Option.none())
  })
})
