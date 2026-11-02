import { Duration, Effect, Option, Random, Schema } from 'effect'
import { Command, Runtime, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { Dialog } from '@foldkit/ui'

import { Card, buildDeck, deckCountFor } from './domain/card'
import {
  type Game,
  MAX_OPPONENTS,
  Phase,
  botDelayMs,
  botStep,
  cardsToReshuffle,
  completeReshuffle,
  deal,
  drawFromStock,
  isBotActing,
  isHumanTurn,
  newGame,
  nextRound,
  placeHeld,
  takeDiscard,
  trashHeld,
} from './domain/game'
import { Message } from './message'
import {
  AppUpdate,
  GUIDE_DIALOG_ID,
  GUIDE_PAGE_COUNT,
  Model,
  Screen,
} from './model'

export { Message } from './message'
export { Model } from './model'
export { view } from './view'

type UpdateReturn = Update.Return<Model, Message>

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    screen: Screen.Title(),
    opponentCount: 2,
    guidePage: 0,
    guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
    appUpdate: AppUpdate.None(),
  },
})

// COMMAND

export const ShuffleDeck = Command.define('ShuffleDeck', {
  args: { sequence: Schema.Number, deckCount: Schema.Number },
  messages: [Message.CompletedShuffleDeck],
  execute: ({ sequence, deckCount }) =>
    Random.shuffle(buildDeck(deckCount)).pipe(
      Effect.map(deck => Message.CompletedShuffleDeck({ sequence, deck })),
    ),
})

export const ReshuffleDiscard = Command.define('ReshuffleDiscard', {
  args: { sequence: Schema.Number, cards: Schema.Array(Card) },
  messages: [Message.CompletedReshuffleDiscard],
  execute: ({ sequence, cards }) =>
    Random.shuffle(cards).pipe(
      Effect.map(stock =>
        Message.CompletedReshuffleDiscard({ sequence, stock }),
      ),
    ),
})

export const WaitBeforeBotStep = Command.define('WaitBeforeBotStep', {
  args: { sequence: Schema.Number, delayMs: Schema.Number },
  messages: [Message.CompletedWaitBeforeBotStep],
  execute: ({ sequence, delayMs }) =>
    Effect.sleep(Duration.millis(delayMs)).pipe(
      Effect.as(Message.CompletedWaitBeforeBotStep({ sequence })),
    ),
})

// Tells the waiting service worker to take over. registerSW (src/subscription.ts)
// reloads the page once it does, so the new version starts fresh.
export const ApplyAppUpdate = Command.define('ApplyAppUpdate', {
  messages: [Message.CompletedApplyAppUpdate],
  execute: Effect.promise(async () => {
    const registration = await navigator.serviceWorker?.getRegistration()
    const waiting = registration?.waiting
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' })
    } else {
      window.location.reload()
    }
  }).pipe(Effect.as(Message.CompletedApplyAppUpdate())),
})

const followUpCommands = (game: Game) =>
  Phase.matchOrElse(
    game.phase,
    {
      Shuffling: () => [
        ShuffleDeck({
          sequence: game.sequence,
          deckCount: deckCountFor(game.players.length),
        }),
      ],
      Reshuffling: () => [
        ReshuffleDiscard({
          sequence: game.sequence,
          cards: cardsToReshuffle(game),
        }),
      ],
    },
    () =>
      isBotActing(game)
        ? [
            WaitBeforeBotStep({
              sequence: game.sequence,
              delayMs: botDelayMs(game),
            }),
          ]
        : [],
  )

// UPDATE

const readGuideDialog = (model: Model) => Option.some(model.guideDialog)

const writeGuideDialog = (model: Model, guideDialog: Dialog.Model): Model =>
  modifyFields(model, { guideDialog: () => guideDialog })

const toGotGuideDialogMessage = (message: Dialog.Message): Message =>
  Message.GotGuideDialogMessage({ message })

const ignoreGuideDialogOutMessage =
  () =>
  (model: Model): UpdateReturn => ({ model })

const foldGuideDialog = Update.foldChild({
  update: Dialog.update,
  read: readGuideDialog,
  write: writeGuideDialog,
  toParentMessage: toGotGuideDialogMessage,
  foldOutMessage: ignoreGuideDialogOutMessage,
})

const openGuide = Update.foldChildStep({
  update: Dialog.open,
  read: readGuideDialog,
  write: writeGuideDialog,
  toParentMessage: toGotGuideDialogMessage,
  foldOutMessage: ignoreGuideDialogOutMessage,
})

const closeGuide = Update.foldChildStep({
  update: Dialog.close,
  read: readGuideDialog,
  write: writeGuideDialog,
  toParentMessage: toGotGuideDialogMessage,
  foldOutMessage: ignoreGuideDialogOutMessage,
})

const startGame = (model: Model): UpdateReturn => {
  const game = newGame(model.opponentCount)
  return {
    model: modifyFields(model, {
      screen: () => Screen.Table({ game }),
    }),
    commands: followUpCommands(game),
  }
}

const stepGame = (
  model: Model,
  transition: (game: Game) => Game,
): UpdateReturn =>
  Screen.match(model.screen, {
    Title: () => ({ model }),
    Table: ({ game }) => {
      const nextGame = transition(game)
      if (nextGame === game) {
        return { model }
      }
      return {
        model: modifyFields(model, {
          screen: () => Screen.Table({ game: nextGame }),
        }),
        commands: followUpCommands(nextGame),
      }
    },
  })

const humanStep =
  (transition: (game: Game) => Game) =>
  (game: Game): Game =>
    isHumanTurn(game) ? transition(game) : game

const whenSequence =
  (sequence: number, transition: (game: Game) => Game) =>
  (game: Game): Game =>
    game.sequence === sequence ? transition(game) : game

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedOpponentCount: ({ count }) => ({
      model: modifyFields(model, {
        opponentCount: () => Math.min(MAX_OPPONENTS, Math.max(1, count)),
      }),
    }),

    ClickedNewGame: () => startGame(model),

    ClickedPlayAgain: () => startGame(model),

    ClickedHowToPlay: () =>
      Update.combine(model, [
        stepModel => ({
          model: modifyFields(stepModel, { guidePage: () => 0 }),
        }),
        openGuide,
      ]),

    ClickedGuideNext: () => {
      if (model.guidePage + 1 < GUIDE_PAGE_COUNT) {
        return {
          model: modifyFields(model, {
            guidePage: () => model.guidePage + 1,
          }),
        }
      }
      return Screen.match(model.screen, {
        Title: () => Update.combine(model, [closeGuide, startGame]),
        Table: () => closeGuide(model),
      })
    },

    ClickedGuidePage: ({ page }) => ({
      model: modifyFields(model, {
        guidePage: () => Math.min(GUIDE_PAGE_COUNT - 1, Math.max(0, page)),
      }),
    }),

    GotGuideDialogMessage: ({ message }) => foldGuideDialog(model, message),

    SwipedDownGuide: () => closeGuide(model),

    CompletedShuffleDeck: ({ sequence, deck }) =>
      stepGame(
        model,
        whenSequence(sequence, game =>
          Phase.guards.Shuffling(game.phase) ? deal(game, deck) : game,
        ),
      ),

    CompletedReshuffleDiscard: ({ sequence, stock }) =>
      stepGame(
        model,
        whenSequence(sequence, game => completeReshuffle(game, stock)),
      ),

    CompletedWaitBeforeBotStep: ({ sequence }) =>
      stepGame(
        model,
        whenSequence(sequence, game =>
          isBotActing(game) ? botStep(game) : game,
        ),
      ),

    ClickedStock: () => stepGame(model, humanStep(drawFromStock)),

    ClickedDiscardPile: () =>
      stepGame(
        model,
        humanStep(game =>
          Phase.guards.Holding(game.phase)
            ? trashHeld(game)
            : takeDiscard(game),
        ),
      ),

    ClickedSlot: ({ slotIndex }) =>
      stepGame(
        model,
        humanStep(game => placeHeld(game, slotIndex)),
      ),

    ClickedTrash: () => stepGame(model, humanStep(trashHeld)),

    ClickedNextRound: () => stepGame(model, nextRound),

    ClickedLeaveTable: () => ({
      model: modifyFields(model, {
        screen: () => Screen.Title(),
      }),
    }),

    FoundAppUpdate: () => ({
      model: modifyFields(model, { appUpdate: () => AppUpdate.Available() }),
    }),

    ClickedUpdateApp: () => ({
      model: modifyFields(model, { appUpdate: () => AppUpdate.Applying() }),
      commands: [ApplyAppUpdate()],
    }),

    ClickedDismissAppUpdate: () => ({
      model: modifyFields(model, { appUpdate: () => AppUpdate.None() }),
    }),

    // The page reloads when the new worker takes over; nothing to do here.
    CompletedApplyAppUpdate: () => ({ model }),
  })
