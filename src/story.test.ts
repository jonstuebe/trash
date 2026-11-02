import { Array } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Dialog } from '@foldkit/ui'

import { buildDeck } from './domain/card'
import { type Game, Phase, deal, newGame } from './domain/game'
import {
  ApplyAppUpdate,
  Message,
  type Model,
  ShuffleDeck,
  WaitBeforeBotStep,
  update,
} from './main'
import { AppUpdate, GUIDE_DIALOG_ID, Screen } from './model'

const atTable = (game: Game): Model => ({
  screen: Screen.Table({ game }),
  opponentCount: 1,
  guidePage: 0,
  guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
  appUpdate: AppUpdate.None(),
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
        guidePage: 0,
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
        appUpdate: AppUpdate.None(),
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

  test('a new version shows the banner until the player updates or dismisses it', () => {
    story(
      update,
      given<Model>(atTable(botsTurn())),
      message(Message.FoundAppUpdate()),
      model(next => {
        expect(AppUpdate.guards.Available(next.appUpdate)).toBe(true)
      }),
      message(Message.ClickedDismissAppUpdate()),
      model(next => {
        expect(AppUpdate.guards.None(next.appUpdate)).toBe(true)
      }),
      message(Message.FoundAppUpdate()),
      message(Message.ClickedUpdateApp()),
      Command.expectHas(ApplyAppUpdate),
      model(next => {
        expect(AppUpdate.guards.Applying(next.appUpdate)).toBe(true)
        // The game in progress is untouched until the page reloads.
        expect(gameOf(next).currentIndex).toBe(1)
      }),
      Command.resolveAll([ApplyAppUpdate, Message.CompletedApplyAppUpdate()]),
    )
  })

  test('the guide opens as a sheet and its last page starts a game', () => {
    story(
      update,
      given<Model>({
        screen: Screen.Title(),
        opponentCount: 1,
        guidePage: 2,
        // The enter and leave transitions are the Dialog's business; this
        // story is about the guide's paging.
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID }),
        appUpdate: AppUpdate.None(),
      }),
      message(Message.ClickedHowToPlay()),
      Command.expectHas(Dialog.ShowDialog),
      model(next => {
        expect(next.guideDialog.isOpen).toBe(true)
        expect(next.guidePage).toBe(0)
      }),
      Command.resolveAll([
        Dialog.ShowDialog,
        Dialog.Message.SucceededShowDialog(),
      ]),
      message(Message.ClickedGuideNext()),
      message(Message.ClickedGuideNext()),
      model(next => {
        expect(next.guidePage).toBe(2)
        expect(Screen.guards.Title(next.screen)).toBe(true)
      }),
      message(Message.ClickedGuideNext()),
      Command.expectHas(Dialog.CloseDialog, ShuffleDeck),
      model(next => {
        expect(next.guideDialog.isOpen).toBe(false)
        expect(Screen.guards.Table(next.screen)).toBe(true)
      }),
      Command.resolveAll(
        [Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()],
        [
          ShuffleDeck,
          Message.CompletedShuffleDeck({ sequence: 0, deck: buildDeck(1) }),
        ],
      ),
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
