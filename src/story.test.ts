import { Array } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { buildDeck } from './domain/card'
import { type Game, Phase, deal, newGame } from './domain/game'
import {
  Message,
  type Model,
  ShuffleDeck,
  WaitBeforeBotStep,
  update,
} from './main'
import { Guide, Screen } from './model'

const atTable = (game: Game): Model => ({
  screen: Screen.Table({ game }),
  opponentCount: 1,
  guide: Guide.Closed(),
})

const gameOf = (model: Model): Game =>
  Screen.match(model.screen, {
    Title: () => {
      throw new Error('expected the table')
    },
    Table: ({ game }) => game,
  })

const botsTurn = (): Game =>
  modifyFields(deal(newGame(1), buildDeck(1)), { currentIndex: () => 1 })

describe('update', () => {
  test('starting a game shuffles a deck', () => {
    story(
      update,
      given<Model>({
        screen: Screen.Title(),
        opponentCount: 1,
        guide: Guide.Closed(),
      }),
      message(Message.ClickedNewGame()),
      Command.expectHas(ShuffleDeck),
      model(next => {
        expect(Phase.guards.Shuffling(gameOf(next).phase)).toBe(true)
      }),
      Command.resolve(
        ShuffleDeck,
        Message.CompletedShuffleDeck({ sequence: 0, deck: buildDeck(1) }),
      ),
      model(next => {
        const game = gameOf(next)
        expect(Phase.guards.AwaitingDraw(game.phase)).toBe(true)
        expect(Array.map(game.players, player => player.slots.length)).toEqual([
          10, 10,
        ])
      }),
    )
  })

  test('a bot step runs only for the sequence it was scheduled for', () => {
    const game = botsTurn()

    story(
      update,
      given(atTable(game)),
      message(
        Message.CompletedWaitBeforeBotStep({ sequence: game.sequence - 1 }),
      ),
      model(next => {
        expect(gameOf(next)).toEqual(game)
      }),
      message(Message.CompletedWaitBeforeBotStep({ sequence: game.sequence })),
      Command.expectHas(WaitBeforeBotStep),
      model(next => {
        expect(Phase.guards.Holding(gameOf(next).phase)).toBe(true)
      }),
      Command.resolve(
        WaitBeforeBotStep,
        Message.CompletedWaitBeforeBotStep({ sequence: -1 }),
      ),
      model(next => {
        expect(Phase.guards.Holding(gameOf(next).phase)).toBe(true)
      }),
    )
  })

  test('the human cannot act during a bot turn', () => {
    const game = botsTurn()

    story(
      update,
      given(atTable(game)),
      message(Message.ClickedStock()),
      Command.expectNone(),
      model(next => {
        expect(gameOf(next)).toEqual(game)
      }),
    )
  })
})
