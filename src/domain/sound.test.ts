import { Array, Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { type Card, type Suit } from './card'
import {
  type Game,
  Phase,
  Slot,
  botStep,
  completeReshuffle,
  drawFromStock,
  endGame,
  newBotGame,
  nextRound,
  placeHeld,
  takeDiscard,
  trashHeld,
} from './game'
import { soundFor } from './sound'

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
  withSlots(
    withSlots(
      modifyFields(newBotGame(), {
        stock: () => overrides.stock ?? [],
        discard: () => overrides.discard ?? [],
        phase: () => Phase.AwaitingDraw(),
      }),
      0,
      hiddenRow(10),
    ),
    1,
    hiddenRow(10, 200),
  )

const almostDone = (count: number): ReadonlyArray<Slot> =>
  Array.makeBy(count, index =>
    index === count - 1
      ? Slot.Hidden({ card: card(12, 'Hearts', 70) })
      : Slot.Revealed({ card: card(index + 1, 'Clubs', 80 + index) }),
  )

const VIEWER = 0

describe('soundFor', () => {
  test('drawing from the stock or taking the discard is a draw', () => {
    const game = playing({ stock: [card(13)], discard: [card(5)] })

    expect(soundFor(game, drawFromStock(game), VIEWER)).toEqual(
      Option.some('Draw'),
    )
    expect(soundFor(game, takeDiscard(game), VIEWER)).toEqual(
      Option.some('Draw'),
    )
  })

  test('a draw that waits on a reshuffle sounds once the card is drawn', () => {
    const game = playing({ discard: [card(3), card(4), card(9)] })
    const reshuffling = drawFromStock(game)

    expect(soundFor(game, reshuffling, VIEWER)).toEqual(Option.none())
    expect(
      soundFor(
        reshuffling,
        completeReshuffle(reshuffling, [card(3), card(4)]),
        VIEWER,
      ),
    ).toEqual(Option.some('Draw'))
  })

  test('placing a card on a face-down spot is a place', () => {
    const drawn = drawFromStock(playing({ stock: [card(7)] }))

    expect(soundFor(drawn, placeHeld(drawn, 6), VIEWER)).toEqual(
      Option.some('Place'),
    )
  })

  test('the real card taking a Jack’s spot is a swap', () => {
    const slots = Array.map(hiddenRow(10), (slot, index) =>
      index === 2 ? Slot.Revealed({ card: card(11, 'Hearts', 50) }) : slot,
    )
    const drawn = drawFromStock(
      withSlots(playing({ stock: [card(3)] }), 0, slots),
    )

    expect(soundFor(drawn, placeHeld(drawn, 2), VIEWER)).toEqual(
      Option.some('Swap'),
    )
  })

  test('trashing a card is a trash', () => {
    const drawn = drawFromStock(playing({ stock: [card(12)] }))

    expect(soundFor(drawn, trashHeld(drawn), VIEWER)).toEqual(
      Option.some('Trash'),
    )
  })

  test('the bot’s moves sound too', () => {
    const botTurn = modifyFields(playing({ stock: [card(13)] }), {
      currentIndex: () => 1,
    })
    const drawn = botStep(botTurn)

    expect(soundFor(botTurn, drawn, VIEWER)).toEqual(Option.some('Draw'))
    expect(soundFor(drawn, botStep(drawn), VIEWER)).toEqual(
      Option.some('Trash'),
    )
  })

  test('finishing is a finish for the viewer and a place for anyone else', () => {
    const game = withSlots(playing({ stock: [card(3)] }), 0, almostDone(3))
    const drawn = drawFromStock(game)
    const finished = placeHeld(drawn, 2)

    expect(soundFor(drawn, finished, 0)).toEqual(Option.some('Finish'))
    expect(soundFor(drawn, finished, 1)).toEqual(Option.some('Place'))
  })

  test('the round ending is a round over', () => {
    const game = withSlots(
      playing({ stock: [card(13), card(3)] }),
      0,
      almostDone(3),
    )
    const finished = placeHeld(drawFromStock(game), 2)
    const botDrew = botStep(finished)
    const roundOver = botStep(botDrew)

    expect(Phase.guards.RoundOver(roundOver.phase)).toBe(true)
    expect(soundFor(botDrew, roundOver, VIEWER)).toEqual(
      Option.some('RoundOver'),
    )
  })

  test('finishing on the last turn of the round is still a finish', () => {
    const game = modifyFields(
      withSlots(playing({ stock: [card(3)] }), 0, almostDone(3)),
      { maybeCloserIndex: () => Option.some(1) },
    )
    const drawn = drawFromStock(game)
    const finished = placeHeld(drawn, 2)

    expect(Phase.guards.RoundOver(finished.phase)).toBe(true)
    expect(soundFor(drawn, finished, VIEWER)).toEqual(Option.some('Finish'))
  })

  test('the game ending is a win, a loss or a tie for the viewer', () => {
    const game = withSlots(playing({ stock: [card(13), card(1)] }), 0, [
      Slot.Hidden({ card: card(12, 'Hearts', 70) }),
    ])
    const finished = placeHeld(drawFromStock(game), 0)
    const botDrew = botStep(finished)
    const over = botStep(botDrew)

    expect(Phase.guards.GameOver(over.phase)).toBe(true)
    expect(soundFor(botDrew, over, 0)).toEqual(Option.some('Win'))
    expect(soundFor(botDrew, over, 1)).toEqual(Option.some('Lose'))
  })

  test('calling the game off sounds its outcome', () => {
    const roundOver = (targets: ReadonlyArray<number>) =>
      modifyFields(playing(), {
        players: players =>
          Array.map(players, (player, index) =>
            modifyFields(player, {
              target: () => Array.getUnsafe(targets, index),
            }),
          ),
        phase: () => Phase.RoundOver({ finisherIndexes: [] }),
      })

    const winning = roundOver([3, 5])
    const tied = roundOver([4, 4])

    expect(soundFor(winning, endGame(winning, 1), 0)).toEqual(
      Option.some('Win'),
    )
    expect(soundFor(winning, endGame(winning, 1), 1)).toEqual(
      Option.some('Lose'),
    )
    expect(soundFor(tied, endGame(tied, 0), 0)).toEqual(Option.some('Tie'))
  })

  test('dealing the next round is silent', () => {
    const roundOver = modifyFields(playing(), {
      phase: () => Phase.RoundOver({ finisherIndexes: [] }),
    })

    expect(soundFor(roundOver, nextRound(roundOver), VIEWER)).toEqual(
      Option.none(),
    )
  })

  test('nothing sounds when nothing changed, or for a stale Game', () => {
    const game = playing({ stock: [card(13)] })
    const drawn = drawFromStock(game)

    expect(soundFor(game, game, VIEWER)).toEqual(Option.none())
    expect(soundFor(drawn, game, VIEWER)).toEqual(Option.none())
  })

  test('nothing sounds after a gap of missed moves', () => {
    const game = playing({ stock: [card(13)] })
    const later = modifyFields(drawFromStock(game), {
      sequence: sequence => sequence + 5,
    })

    expect(soundFor(game, later, VIEWER)).toEqual(Option.none())
  })
})
