import {
  Array,
  Duration,
  Effect,
  Match,
  Option,
  Random,
  Schema,
  pipe,
} from 'effect'
import { SecureRandom } from 'effect/crypto'
import { Command, Runtime, Update } from 'foldkit'
import { replaceUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'

import { BrowserCrypto } from '@effect/platform-browser'
import { Dialog } from '@foldkit/ui'

import { Card, buildDeck, deckCountFor } from './domain/card'
import {
  type Game,
  Phase,
  botDelayMs,
  botStep,
  cardsToReshuffle,
  completeReshuffle,
  deal,
  drawFromStock,
  isBotActing,
  isHumanTurn,
  isViewerTurn,
  newBotGame,
  nextRound,
  placeHeld,
  takeDiscard,
  trashHeld,
} from './domain/game'
import {
  ClientMessageJson,
  type Intent,
  Move,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomView,
  ServerMessage,
  roomPath,
} from './domain/room'
import { Message, type ShareOutcome } from './message'
import {
  AppUpdate,
  Connection,
  type Flags,
  FriendRoom,
  GUIDE_DIALOG_ID,
  GUIDE_PAGE_COUNT,
  Invite,
  Model,
  SavedFriendGame,
  Screen,
} from './model'
import { RoomSocket, type RoomSocketService } from './roomSocket'
import { forgetFriendGame, saveFriendGame } from './storage'

export { Message } from './message'
export { Flags, Model } from './model'
export { managedResources } from './roomSocket'
export { flags } from './storage'
export { view } from './view'

type UpdateReturn = Update.Return<Model, Message, RoomSocketService>

// INIT

const friendScreen = (code: string, intent: Intent): Screen =>
  Screen.Friend({
    code,
    intent,
    seat: 0,
    room: FriendRoom.Loading(),
    connection: Connection.Connecting(),
    invite: Invite.Idle(),
  })

// Opening an invite link takes this device straight to that game. A device
// that already sits in the room (the host, or a returning guest) gets its own
// seat back; the Room decides that from the device ID, not the intent.
export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => {
  const baseModel: Model = {
    screen: Screen.Title(),
    deviceId: flags.deviceId,
    maybeSavedFriendGame: flags.maybeSavedFriendGame,
    guidePage: 0,
    guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
    appUpdate: AppUpdate.None(),
  }

  return Option.match(flags.maybeInviteCode, {
    onNone: () => ({ model: baseModel }),
    onSome: code => {
      const intent: Intent = pipe(
        flags.maybeSavedFriendGame,
        Option.filter(saved => saved.code === code),
        Option.match({
          onNone: () => 'Join',
          onSome: saved => saved.intent,
        }),
      )
      return {
        model: modifyFields(baseModel, {
          screen: () => friendScreen(code, intent),
          maybeSavedFriendGame: () => Option.some({ code, intent }),
        }),
        commands: [SaveFriendGame({ saved: { code, intent } })],
      }
    },
  })
}

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

export const GenerateRoomCode = Command.define('GenerateRoomCode', {
  messages: [Message.CompletedGenerateRoomCode],
  execute: Effect.gen(function* () {
    const random = yield* SecureRandom.SecureRandom
    const indexes = yield* Effect.all(
      Array.makeBy(ROOM_CODE_LENGTH, () =>
        random.intBetween(0, ROOM_CODE_ALPHABET.length, { halfOpen: true }),
      ),
    )
    const code = Array.join(
      Array.map(indexes, index => ROOM_CODE_ALPHABET.charAt(index)),
      '',
    )
    return Message.CompletedGenerateRoomCode({ code })
  }).pipe(Effect.provide(BrowserCrypto.layerSecureRandom)),
})

export const SaveFriendGame = Command.define('SaveFriendGame', {
  args: { saved: SavedFriendGame },
  messages: [Message.CompletedSaveFriendGame],
  execute: ({ saved }) =>
    saveFriendGame(saved).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedSaveFriendGame()),
    ),
})

export const ForgetFriendGame = Command.define('ForgetFriendGame', {
  messages: [Message.CompletedForgetFriendGame],
  execute: forgetFriendGame.pipe(
    Effect.ignore,
    Effect.as(Message.CompletedForgetFriendGame()),
  ),
})

// Keeps the address bar on the game being shown, so reloading the page or
// sharing it from the browser lands in the same place.
export const ShowUrl = Command.define('ShowUrl', {
  args: { path: Schema.String },
  messages: [Message.CompletedShowUrl],
  execute: ({ path }) =>
    replaceUrl(path).pipe(Effect.as(Message.CompletedShowUrl())),
})

export const SendMove = Command.define('SendMove', {
  args: { sequence: Schema.Number, move: Move },
  messages: [Message.SucceededSendMove, Message.FailedSendMove],
  execute: ({ sequence, move }) =>
    Effect.gen(function* () {
      const connection = yield* RoomSocket.get
      const json = yield* Schema.encodeEffect(ClientMessageJson)({
        sequence,
        move,
      })
      yield* Effect.try(() => connection.socket.send(json))
    }).pipe(
      Effect.as(Message.SucceededSendMove()),
      Effect.catch(() => Effect.succeed(Message.FailedSendMove())),
    ),
})

const INVITE_TEXT = "Let's play Trash. Tap to join my game:"

// The share sheet is the invite: on a phone it offers Messages first. Where
// there's no share sheet, the link goes on the clipboard instead.
export const ShareInvite = Command.define('ShareInvite', {
  args: { code: Schema.String },
  messages: [Message.CompletedShareInvite],
  execute: ({ code }) =>
    Effect.promise(async (): Promise<ShareOutcome> => {
      const url = new URL(roomPath(code), window.location.origin).toString()
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Trash', text: INVITE_TEXT, url })
          return 'Shared'
        } catch (error) {
          return error instanceof DOMException && error.name === 'AbortError'
            ? 'Cancelled'
            : 'Failed'
        }
      }
      try {
        await navigator.clipboard.writeText(`${INVITE_TEXT} ${url}`)
        return 'Copied'
      } catch {
        return 'Failed'
      }
    }).pipe(Effect.map(outcome => Message.CompletedShareInvite({ outcome }))),
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

const startBotGame = (model: Model): UpdateReturn => {
  const game = newBotGame()
  return {
    model: modifyFields(model, {
      screen: () => Screen.Table({ game }),
    }),
    commands: followUpCommands(game),
  }
}

const humanStep =
  (transition: (game: Game) => Game) =>
  (game: Game): Game =>
    isHumanTurn(game) ? transition(game) : game

const whenSequence =
  (sequence: number, transition: (game: Game) => Game) =>
  (game: Game): Game =>
    game.sequence === sequence ? transition(game) : game

const stepBotGame = (
  model: Model,
  transition: (game: Game) => Game,
): UpdateReturn =>
  Screen.matchOrElse(
    model.screen,
    {
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
    },
    () => ({ model }),
  )

// FRIEND GAME

type FriendScreen = typeof Screen.Friend.Type

const withFriendScreen = (
  model: Model,
  f: (screen: FriendScreen) => UpdateReturn,
): UpdateReturn =>
  Screen.matchOrElse(model.screen, { Friend: f }, () => ({ model }))

const setFriendScreen = (model: Model, screen: FriendScreen): Model =>
  modifyFields(model, { screen: () => screen })

const openFriendGame = (
  model: Model,
  code: string,
  intent: Intent,
): UpdateReturn => ({
  model: modifyFields(model, {
    screen: () => friendScreen(code, intent),
    maybeSavedFriendGame: () => Option.some({ code, intent }),
  }),
  commands: [
    SaveFriendGame({ saved: { code, intent } }),
    ShowUrl({ path: roomPath(code) }),
  ],
})

const forgetCurrentFriendGame = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    screen: () => Screen.Title(),
    maybeSavedFriendGame: () => Option.none(),
  }),
  commands: [ForgetFriendGame(), ShowUrl({ path: '/' })],
})

const leaveFriendGame = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { screen: () => Screen.Title() }),
  commands: [ShowUrl({ path: '/' })],
})

// Sends a Move for the friend game on screen. The local Game doesn't change:
// the Room applies the Move and sends the new Game back to both players.
const sendFriendMove =
  (toMove: (game: Game, seat: number) => Option.Option<Move>) =>
  (model: Model): UpdateReturn =>
    withFriendScreen(model, screen =>
      FriendRoom.matchOrElse(
        screen.room,
        {
          Playing: ({ game }) =>
            Connection.guards.Connected(screen.connection)
              ? Option.match(toMove(game, screen.seat), {
                  onNone: () => ({ model }),
                  onSome: move => ({
                    model,
                    commands: [SendMove({ sequence: game.sequence, move })],
                  }),
                })
              : { model },
        },
        () => ({ model }),
      ),
    )

const onMyTurn =
  (move: (game: Game) => Move) =>
  (game: Game, seat: number): Option.Option<Move> =>
    isViewerTurn(game, seat) ? Option.some(move(game)) : Option.none()

const whenPhase =
  (isPhase: (phase: Phase) => boolean, move: Move) =>
  (game: Game): Option.Option<Move> =>
    isPhase(game.phase) ? Option.some(move) : Option.none()

const receiveServerMessage = (
  model: Model,
  message: ServerMessage,
): UpdateReturn =>
  withFriendScreen(model, screen =>
    ServerMessage.match(message, {
      Seated: ({ seat, room }) => ({
        model: setFriendScreen(
          model,
          modifyFields(screen, {
            seat: () => seat,
            connection: () => Connection.Connected(),
            room: () =>
              RoomView.match(room, {
                WaitingForGuest: () => FriendRoom.WaitingForGuest(),
                Playing: ({ game }) => FriendRoom.Playing({ game }),
              }),
          }),
        ),
      }),
      Refused: ({ reason }) => ({
        model: modifyFields(model, {
          screen: () =>
            modifyFields(screen, {
              room: () => FriendRoom.Refused({ reason }),
              connection: () => Connection.Disconnected(),
            }),
          maybeSavedFriendGame: () => Option.none(),
        }),
        commands: [ForgetFriendGame()],
      }),
    }),
  )

const reconnect = (model: Model): UpdateReturn =>
  withFriendScreen(model, screen =>
    Connection.guards.Disconnected(screen.connection) &&
    !FriendRoom.guards.Refused(screen.room)
      ? {
          model: setFriendScreen(
            model,
            modifyFields(screen, {
              connection: () => Connection.Connecting(),
            }),
          ),
        }
      : { model },
  )

const markDisconnected = (model: Model): UpdateReturn =>
  withFriendScreen(model, screen => ({
    model: setFriendScreen(
      model,
      modifyFields(screen, { connection: () => Connection.Disconnected() }),
    ),
  }))

const isFinishedFriendGame = (screen: FriendScreen): boolean =>
  FriendRoom.matchOrElse(
    screen.room,
    { Playing: ({ game }) => Phase.guards.GameOver(game.phase) },
    () => false,
  )

const setInvite = (model: Model, invite: Invite): Model =>
  Screen.matchOrElse(
    model.screen,
    {
      Friend: screen =>
        setFriendScreen(model, modifyFields(screen, { invite: () => invite })),
    },
    () => model,
  )

const inviteAfterShare = (outcome: ShareOutcome): Invite =>
  Match.value(outcome).pipe(
    Match.withReturnType<Invite>(),
    Match.when('Copied', () => Invite.Copied()),
    Match.when('Failed', () => Invite.Failed()),
    Match.orElse(() => Invite.Idle()),
  )

// One handler per tap, whichever kind of game is on screen.
const onTableTap = (
  model: Model,
  botTransition: (game: Game) => Game,
  friendMove: (game: Game, seat: number) => Option.Option<Move>,
): UpdateReturn =>
  Screen.matchOrElse(
    model.screen,
    {
      Table: () => stepBotGame(model, botTransition),
      Friend: () => sendFriendMove(friendMove)(model),
    },
    () => ({ model }),
  )

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedPlayBot: () => startBotGame(model),

    ClickedPlayFriend: () => ({
      model: modifyFields(model, {
        screen: () => Screen.StartingFriendGame(),
      }),
      commands: [GenerateRoomCode()],
    }),

    CompletedGenerateRoomCode: ({ code }) =>
      Screen.guards.StartingFriendGame(model.screen)
        ? openFriendGame(model, code, 'Host')
        : { model },

    ClickedResumeFriendGame: () =>
      Option.match(model.maybeSavedFriendGame, {
        onNone: () => ({ model }),
        onSome: ({ code, intent }) => openFriendGame(model, code, intent),
      }),

    ClickedPlayAgain: () =>
      Screen.matchOrElse(
        model.screen,
        {
          Table: () => startBotGame(model),
          Friend: () =>
            sendFriendMove((game, _seat) =>
              whenPhase(Phase.guards.GameOver, Move.Rematch())(game),
            )(model),
        },
        () => ({ model }),
      ),

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
      return Screen.guards.Title(model.screen)
        ? Update.combine(model, [closeGuide, startBotGame])
        : closeGuide(model)
    },

    ClickedGuidePage: ({ page }) => ({
      model: modifyFields(model, {
        guidePage: () => Math.min(GUIDE_PAGE_COUNT - 1, Math.max(0, page)),
      }),
    }),

    GotGuideDialogMessage: ({ message }) => foldGuideDialog(model, message),

    SwipedDownGuide: () => closeGuide(model),

    CompletedShuffleDeck: ({ sequence, deck }) =>
      stepBotGame(
        model,
        whenSequence(sequence, game =>
          Phase.guards.Shuffling(game.phase) ? deal(game, deck) : game,
        ),
      ),

    CompletedReshuffleDiscard: ({ sequence, stock }) =>
      stepBotGame(
        model,
        whenSequence(sequence, game => completeReshuffle(game, stock)),
      ),

    CompletedWaitBeforeBotStep: ({ sequence }) =>
      stepBotGame(
        model,
        whenSequence(sequence, game =>
          isBotActing(game) ? botStep(game) : game,
        ),
      ),

    ClickedStock: () =>
      onTableTap(
        model,
        humanStep(drawFromStock),
        onMyTurn(() => Move.Draw()),
      ),

    ClickedDiscardPile: () =>
      onTableTap(
        model,
        humanStep(game =>
          Phase.guards.Holding(game.phase)
            ? trashHeld(game)
            : takeDiscard(game),
        ),
        onMyTurn(game =>
          Phase.guards.Holding(game.phase) ? Move.Trash() : Move.TakeDiscard(),
        ),
      ),

    ClickedSlot: ({ slotIndex }) =>
      onTableTap(
        model,
        humanStep(game => placeHeld(game, slotIndex)),
        onMyTurn(() => Move.Place({ slotIndex })),
      ),

    ClickedTrash: () =>
      onTableTap(
        model,
        humanStep(trashHeld),
        onMyTurn(() => Move.Trash()),
      ),

    ClickedNextRound: () =>
      onTableTap(model, nextRound, (game, _seat) =>
        whenPhase(Phase.guards.RoundOver, Move.NextRound())(game),
      ),

    ClickedLeaveTable: () =>
      Screen.matchOrElse(
        model.screen,
        {
          Friend: screen =>
            isFinishedFriendGame(screen) ||
            FriendRoom.guards.Refused(screen.room)
              ? forgetCurrentFriendGame(model)
              : leaveFriendGame(model),
        },
        () => ({
          model: modifyFields(model, { screen: () => Screen.Title() }),
        }),
      ),

    CompletedSaveFriendGame: () => ({ model }),

    CompletedForgetFriendGame: () => ({ model }),

    CompletedShowUrl: () => ({ model }),

    ConnectedRoomSocket: () =>
      withFriendScreen(model, screen => ({
        model: setFriendScreen(
          model,
          modifyFields(screen, { connection: () => Connection.Connected() }),
        ),
      })),

    FailedConnectRoomSocket: () => markDisconnected(model),

    DisconnectedRoomSocket: () => markDisconnected(model),

    ReleasedRoomSocket: () => ({ model }),

    ReceivedServerMessage: ({ message }) =>
      receiveServerMessage(model, message),

    SucceededSendMove: () => ({ model }),

    FailedSendMove: () => markDisconnected(model),

    ClickedReconnect: () => reconnect(model),

    // Phones drop sockets in the background, and the other player may have
    // moved since, so coming back to the app fetches the game again.
    ReturnedToApp: () => reconnect(model),

    ClickedInvite: () =>
      withFriendScreen(model, screen => ({
        model: setInvite(model, Invite.Sharing()),
        commands: [ShareInvite({ code: screen.code })],
      })),

    CompletedShareInvite: ({ outcome }) => ({
      model: setInvite(model, inviteAfterShare(outcome)),
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
