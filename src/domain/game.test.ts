import { Array, Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { type Card, type Suit, buildDeck } from './card'
import {
  type Game,
  Phase,
  type Player,
  Slot,
  botStep,
  canTakeDiscard,
  completeReshuffle,
  deal,
  drawFromStock,
  endGame,
  isComplete,
  newBotGame,
  newFriendGame,
  nextRound,
  placeHeld,
  playableSlotIndexes,
  redact,
  takeDiscard,
  trashHeld,
} from './game'

const card = (rank: number, suit: Suit = 'Spades', id = rank): Card => ({
  id,
  rank,
  suit,
})

const hiddenRow = (count: number, offset = 100): ReadonlyArray<Slot> =>
  Array.makeBy(count, index =>
    Slot.Hidden({ card: card(13, 'Clubs', offset + index) }),
  )

const withSlots = (
  game: Game,
  playerIndex: number,
  slots: ReadonlyArray<Slot>,
): Game =>
  modifyFields(game, {
    players: players =>
      Array.map(players, (player, index) =>
        index === playerIndex
          ? modifyFields(player, {
              slots: () => slots,
              target: () => slots.length,
            })
          : player,
      ),
  })

const playing = (
  overrides: Partial<Pick<Game, 'stock' | 'discard'>> = {},
): Game =>
  modifyFields(newBotGame(), {
    stock: () => overrides.stock ?? [],
    discard: () => overrides.discard ?? [],
    phase: () => Phase.AwaitingDraw(),
  })

const human = (game: Game): Player => Array.getUnsafe(game.players, 0)

describe('deal', () => {
  test('deals ten face-down cards each and turns up one discard', () => {
    const game = deal(newBotGame(), buildDeck(1))

    expect(Array.map(game.players, player => player.slots.length)).toEqual([
      10, 10,
    ])
    expect(game.discard).toHaveLength(1)
    expect(game.stock).toHaveLength(52 - 20 - 1)
    expect(Phase.guards.AwaitingDraw(game.phase)).toBe(true)
  })
})

describe('playableSlotIndexes', () => {
  const player = human(withSlots(newBotGame(), 0, hiddenRow(10)))

  test('a number card fits its own face-down spot', () => {
    expect(playableSlotIndexes(player, card(7))).toEqual([6])
  })

  test('a Jack fits any face-down spot', () => {
    expect(playableSlotIndexes(player, card(11))).toHaveLength(10)
  })

  test('Queens and Kings never fit', () => {
    expect(playableSlotIndexes(player, card(12))).toEqual([])
    expect(playableSlotIndexes(player, card(13))).toEqual([])
  })

  test('a number above the round target does not fit', () => {
    const shortHand = human(withSlots(newBotGame(), 0, hiddenRow(5)))
    expect(playableSlotIndexes(shortHand, card(8))).toEqual([])
  })

  test('a number can replace a wild Jack in its spot', () => {
    const slots = Array.map(hiddenRow(10), (slot, index) =>
      index === 2 ? Slot.Revealed({ card: card(11, 'Hearts', 50) }) : slot,
    )
    const withJack = human(withSlots(newBotGame(), 0, slots))
    expect(playableSlotIndexes(withJack, card(3))).toEqual([2])
  })
})

describe('a turn', () => {
  test('placing a card picks up the one underneath and keeps going', () => {
    const slots = Array.map(hiddenRow(10), (slot, index) =>
      index === 6 ? Slot.Hidden({ card: card(2, 'Hearts', 60) }) : slot,
    )
    const game = withSlots(playing({ stock: [card(7)] }), 0, slots)

    const drawn = drawFromStock(game)
    const placed = placeHeld(drawn, 6)

    expect(Slot.guards.Revealed(Array.getUnsafe(human(placed).slots, 6))).toBe(
      true,
    )
    expect(placed.phase).toEqual(
      Phase.Holding({ card: card(2, 'Hearts', 60), from: 'Slot' }),
    )
  })

  test('trashing a dead card ends the turn', () => {
    const game = withSlots(playing({ stock: [card(12)] }), 0, hiddenRow(10))

    const trashed = trashHeld(drawFromStock(game))

    expect(trashed.currentIndex).toBe(1)
    expect(Option.getOrThrow(Array.last(trashed.discard)).rank).toBe(12)
  })

  test('a playable card cannot be trashed', () => {
    const game = withSlots(playing({ stock: [card(4)] }), 0, hiddenRow(10))
    const drawn = drawFromStock(game)

    expect(trashHeld(drawn)).toBe(drawn)
  })

  test('the discard can be taken only when it fits', () => {
    const fits = withSlots(playing({ discard: [card(5)] }), 0, hiddenRow(10))
    const dead = withSlots(playing({ discard: [card(13)] }), 0, hiddenRow(10))

    expect(canTakeDiscard(fits)).toBe(true)
    expect(canTakeDiscard(dead)).toBe(false)
    expect(Phase.guards.Holding(takeDiscard(fits).phase)).toBe(true)
  })

  test('an empty draw pile asks for a reshuffle, then draws', () => {
    const game = playing({ discard: [card(3), card(4), card(9)] })

    const reshuffling = drawFromStock(game)
    expect(Phase.guards.Reshuffling(reshuffling.phase)).toBe(true)

    const resumed = completeReshuffle(reshuffling, [card(3), card(4)])
    expect(resumed.discard).toEqual([card(9)])
    expect(resumed.phase).toEqual(
      Phase.Holding({ card: card(4), from: 'Stock' }),
    )
  })
})

describe('ending a round', () => {
  const almostDone = (count: number): ReadonlyArray<Slot> =>
    Array.makeBy(count, index =>
      index === count - 1
        ? Slot.Hidden({ card: card(12, 'Hearts', 70) })
        : Slot.Revealed({ card: card(index + 1, 'Clubs', 80 + index) }),
    )

  test('finishing gives everyone else one last turn', () => {
    const game = withSlots(
      withSlots(playing({ stock: [card(13), card(3)] }), 0, almostDone(3)),
      1,
      hiddenRow(10),
    )

    const finished = placeHeld(drawFromStock(game), 2)
    expect(isComplete(human(finished))).toBe(true)
    expect(finished.maybeCloserIndex).toEqual(Option.some(0))
    expect(finished.currentIndex).toBe(1)

    const botTurnOver = botStep(botStep(finished))
    expect(botTurnOver.phase).toEqual(Phase.RoundOver({ finisherIndexes: [0] }))

    const next = nextRound(botTurnOver)
    expect(Array.map(next.players, player => player.target)).toEqual([2, 10])
    expect(Phase.guards.Shuffling(next.phase)).toBe(true)
    expect(next.currentIndex).toBe(1)
  })

  test('finishing a one-card round wins the game', () => {
    const game = withSlots(
      withSlots(playing({ stock: [card(13), card(1)] }), 0, [
        Slot.Hidden({ card: card(12, 'Hearts', 70) }),
      ]),
      1,
      hiddenRow(10),
    )

    const finished = placeHeld(drawFromStock(game), 0)
    const over = botStep(botStep(finished))

    expect(over.phase).toEqual(Phase.GameOver({ winnerIndex: 0 }))
  })
})

describe('endGame', () => {
  const roundOver = (
    targets: ReadonlyArray<number>,
    finisherIndexes: ReadonlyArray<number>,
  ) =>
    modifyFields(playing({}), {
      players: players =>
        Array.map(players, (player, index) =>
          modifyFields(player, {
            target: () => Array.getUnsafe(targets, index),
          }),
        ),
      phase: () => Phase.RoundOver({ finisherIndexes }),
    })

  test('whoever has fewer cards to play next round wins', () => {
    const ended = endGame(roundOver([5, 5], [1]), 0)

    expect(ended.phase).toEqual(
      Phase.Ended({ enderIndex: 0, maybeWinnerIndex: Option.some(1) }),
    )
    expect(Array.map(ended.players, player => player.target)).toEqual([5, 4])
  })

  test('an even count is a tie', () => {
    expect(endGame(roundOver([6, 7], [1]), 1).phase).toEqual(
      Phase.Ended({ enderIndex: 1, maybeWinnerIndex: Option.none() }),
    )
  })

  test('only between rounds', () => {
    const game = playing({})
    expect(endGame(game, 0)).toBe(game)
  })
})

describe('bot', () => {
  test('takes a useful discard before drawing', () => {
    const game = modifyFields(
      withSlots(
        playing({ stock: [card(13)], discard: [card(6)] }),
        1,
        hiddenRow(10),
      ),
      { currentIndex: () => 1 },
    )

    expect(botStep(game).phase).toEqual(
      Phase.Holding({ card: card(6), from: 'Discard' }),
    )
  })
})

describe('redact', () => {
  test('hides face-down cards and the draw pile, and keeps the rest', () => {
    const dealt = deal(newFriendGame(), buildDeck(1))
    const withOneUp = withSlots(dealt, 0, [
      Slot.Revealed({ card: card(1) }),
      ...hiddenRow(9),
    ])
    const seen = redact(withOneUp)

    expect(seen.stock).toHaveLength(withOneUp.stock.length)
    expect(Array.every(seen.stock, stockCard => stockCard.rank === 0)).toBe(
      true,
    )
    expect(Array.getUnsafe(human(seen).slots, 0)).toEqual(
      Slot.Revealed({ card: card(1) }),
    )
    const otherSlots = Array.getUnsafe(seen.players, 1).slots
    expect(
      Array.every(
        otherSlots,
        slot => Slot.guards.Hidden(slot) && slot.card.rank === 0,
      ),
    ).toBe(true)
    expect(seen.discard).toEqual(withOneUp.discard)
  })
})
