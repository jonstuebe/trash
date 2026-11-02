import { Array, Duration, Effect, Match, Option, Random, Schema } from 'effect'
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
  GameSummary,
  GameSummaryJson,
  type Intent,
  Move,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomView,
  ServerMessage,
  cleanPlayerName,
  roomCodeFromInput,
  roomPath,
} from './domain/room'
import {
  type AlertsOutcome,
  type AlertsPermission,
  Message,
  type ShareOutcome,
} from './message'
import {
  AfterNaming,
  AppUpdate,
  Connection,
  type Flags,
  type FriendGameRow,
  FriendRoom,
  GUIDE_DIALOG_ID,
  GUIDE_PAGE_COUNT,
  GameStatus,
  Guide,
  Invite,
  Model,
  SavedFriendGame,
  Screen,
  TurnAlerts,
} from './model'
import { RoomSocket, type RoomSocketService } from './roomSocket'
import { saveFriendGames, savePlayerName } from './storage'
import { registerTurnAlerts } from './turnAlerts'

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

const unknownRow = (saved: SavedFriendGame): FriendGameRow => ({
  code: saved.code,
  intent: saved.intent,
  status: GameStatus.Unknown(),
})

const savedOf = (
  rows: ReadonlyArray<FriendGameRow>,
): ReadonlyArray<SavedFriendGame> =>
  Array.map(rows, row => ({ code: row.code, intent: row.intent }))

const findRow = (
  rows: ReadonlyArray<FriendGameRow>,
  code: string,
): Option.Option<FriendGameRow> =>
  Array.findFirst(rows, row => row.code === code)

const withoutGame = (
  rows: ReadonlyArray<FriendGameRow>,
  code: string,
): ReadonlyArray<FriendGameRow> => Array.filter(rows, row => row.code !== code)

// The game just opened moves to the top of the list.
const withGameFirst = (
  rows: ReadonlyArray<FriendGameRow>,
  code: string,
  intent: Intent,
): ReadonlyArray<FriendGameRow> =>
  Array.prepend(
    withoutGame(rows, code),
    Option.match(findRow(rows, code), {
      onNone: () => unknownRow({ code, intent }),
      onSome: row => row,
    }),
  )

// A game this device already sits in reopens as whatever it was; any other
// code is one to join.
const intentFor = (rows: ReadonlyArray<FriendGameRow>, code: string): Intent =>
  Option.match(findRow(rows, code), {
    onNone: () => 'Join',
    onSome: row => row.intent,
  })

// Opening an invite link takes this device straight to that game, once the
// player has a name. A device that already sits in the room (the host, or a
// returning guest) gets its own seat back; the Room decides that from the
// device ID, not the intent.
export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => {
  const baseModel: Model = {
    screen: Screen.Title(),
    deviceId: flags.deviceId,
    maybePlayerName: flags.maybePlayerName,
    friendGames: Array.map(flags.savedFriendGames, unknownRow),
    guide: Guide.HowToPlay({ page: 0 }),
    guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
    homeScreen: flags.homeScreen,
    appUpdate: AppUpdate.None(),
    turnAlerts: flags.turnAlerts,
  }

  return Option.match(flags.maybeInviteCode, {
    onNone: () => ({
      model: baseModel,
      commands: fetchSummaries(baseModel),
    }),
    onSome: code => {
      const intent = intentFor(baseModel.friendGames, code)
      return Option.match(baseModel.maybePlayerName, {
        onNone: () => ({
          model: modifyFields(baseModel, {
            screen: () =>
              Screen.Naming({
                draft: '',
                next: AfterNaming.OpenGame({ code, intent }),
              }),
          }),
        }),
        onSome: () => {
          const friendGames = withGameFirst(baseModel.friendGames, code, intent)
          return {
            model: modifyFields(baseModel, {
              screen: () => friendScreen(code, intent),
              friendGames: () => friendGames,
            }),
            commands: [SaveFriendGames({ games: savedOf(friendGames) })],
          }
        },
      })
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

export const SaveFriendGames = Command.define('SaveFriendGames', {
  args: { games: Schema.Array(SavedFriendGame) },
  messages: [Message.CompletedSaveFriendGames],
  execute: ({ games }) =>
    saveFriendGames(games).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedSaveFriendGames()),
    ),
})

export const SavePlayerName = Command.define('SavePlayerName', {
  args: { name: Schema.String },
  messages: [Message.CompletedSavePlayerName],
  execute: ({ name }) =>
    savePlayerName(name).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedSavePlayerName()),
    ),
})

// Asks a game's Room whose turn it is, for the menu. Offline, or with the
// Room unreachable, the row just shows no status.
export const FetchGameSummary = Command.define('FetchGameSummary', {
  args: { code: Schema.String, deviceId: Schema.String },
  messages: [Message.CompletedFetchGameSummary],
  execute: ({ code, deviceId }) =>
    Effect.gen(function* () {
      const url = new URL(`/api/rooms/${code}/summary`, window.location.href)
      url.searchParams.set('device', deviceId)
      const response = yield* Effect.tryPromise(() =>
        fetch(url, { cache: 'no-store' }),
      )
      if (!response.ok) {
        return Option.none()
      }
      const text = yield* Effect.tryPromise(() => response.text())
      return Option.some(yield* Schema.decodeEffect(GameSummaryJson)(text))
    }).pipe(
      Effect.catch(() => Effect.succeed(Option.none())),
      Effect.map(maybeSummary =>
        Message.CompletedFetchGameSummary({ code, maybeSummary }),
      ),
    ),
})

const fetchSummaries = (model: Model) =>
  Array.map(model.friendGames, row =>
    FetchGameSummary({ code: row.code, deviceId: model.deviceId }),
  )

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

// The code is in the text as well as the link: a friend with Trash on their
// Home Screen types it in there, since the link opens in the browser.
const inviteText = (code: string): string =>
  `Let's play Trash. Join my game with the code ${code}, or tap the link:`

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
          await navigator.share({ title: 'Trash', text: inviteText(code), url })
          return 'Shared'
        } catch (error) {
          return error instanceof DOMException && error.name === 'AbortError'
            ? 'Cancelled'
            : 'Failed'
        }
      }
      try {
        await navigator.clipboard.writeText(`${inviteText(code)} ${url}`)
        return 'Copied'
      } catch {
        return 'Failed'
      }
    }).pipe(Effect.map(outcome => Message.CompletedShareInvite({ outcome }))),
})

export const RegisterTurnAlerts = Command.define('RegisterTurnAlerts', {
  args: { code: Schema.String, deviceId: Schema.String },
  messages: [Message.CompletedRegisterAlerts],
  execute: ({ code, deviceId }) =>
    registerTurnAlerts(code, deviceId).pipe(
      Effect.map(outcome => Message.CompletedRegisterAlerts({ outcome })),
    ),
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
): UpdateReturn => {
  const friendGames = withGameFirst(model.friendGames, code, intent)
  return {
    model: modifyFields(model, {
      screen: () => friendScreen(code, intent),
      friendGames: () => friendGames,
    }),
    commands: [
      SaveFriendGames({ games: savedOf(friendGames) }),
      ShowUrl({ path: roomPath(code) }),
    ],
  }
}

const forgetFriendGame = (model: Model, code: string): UpdateReturn => {
  const friendGames = withoutGame(model.friendGames, code)
  return {
    model: modifyFields(model, { friendGames: () => friendGames }),
    commands: [SaveFriendGames({ games: savedOf(friendGames) })],
  }
}

// The menu asks every game's Room for its status each time it appears.
const goToMenu = (model: Model): UpdateReturn => {
  const nextModel = modifyFields(model, { screen: () => Screen.Title() })
  return {
    model: nextModel,
    commands: [ShowUrl({ path: '/' }), ...fetchSummaries(nextModel)],
  }
}

const startFriendGame = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    screen: () => Screen.StartingFriendGame(),
  }),
  commands: [GenerateRoomCode()],
})

const continueAfterNaming = (model: Model, next: AfterNaming): UpdateReturn =>
  AfterNaming.match(next, {
    StartGame: () => startFriendGame(model),
    OpenGame: ({ code, intent }) => openFriendGame(model, code, intent),
    BackToMenu: () => goToMenu(model),
  })

// A friend game needs the player's name, so the other player sees who
// they're playing. It's asked for once and remembered.
const withPlayerName = (model: Model, next: AfterNaming): UpdateReturn =>
  Option.match(model.maybePlayerName, {
    onNone: () => ({
      model: modifyFields(model, {
        screen: () => Screen.Naming({ draft: '', next }),
      }),
    }),
    onSome: () => continueAfterNaming(model, next),
  })

type NamingScreen = typeof Screen.Naming.Type

const withNamingScreen = (
  model: Model,
  f: (screen: NamingScreen) => UpdateReturn,
): UpdateReturn =>
  Screen.matchOrElse(model.screen, { Naming: f }, () => ({ model }))

const submitName = (model: Model, screen: NamingScreen): UpdateReturn =>
  Option.match(cleanPlayerName(screen.draft), {
    onNone: () => ({ model }),
    onSome: name => {
      const continued = continueAfterNaming(
        modifyFields(model, { maybePlayerName: () => Option.some(name) }),
        screen.next,
      )
      return {
        model: continued.model,
        commands: [SavePlayerName({ name }), ...(continued.commands ?? [])],
      }
    },
  })

type JoiningScreen = typeof Screen.JoiningGame.Type

const withJoiningScreen = (
  model: Model,
  f: (screen: JoiningScreen) => UpdateReturn,
): UpdateReturn =>
  Screen.matchOrElse(model.screen, { JoiningGame: f }, () => ({ model }))

// NOTE: an invite link opens in the browser, not in the Home Screen app, so
// a player with the app joins by typing the code in instead.
const submitJoinCode = (model: Model, screen: JoiningScreen): UpdateReturn =>
  Option.match(roomCodeFromInput(screen.draft), {
    onNone: () => ({ model }),
    onSome: code =>
      withPlayerName(
        model,
        AfterNaming.OpenGame({
          code,
          intent: intentFor(model.friendGames, code),
        }),
      ),
  })

const openSheet = (model: Model, guide: Guide): UpdateReturn =>
  Update.combine(model, [
    stepModel => ({
      model: modifyFields(stepModel, { guide: () => guide }),
    }),
    openGuide,
  ])

const turnGuidePage = (model: Model, toPage: (page: number) => number) =>
  modifyFields(model, {
    guide: guide =>
      Guide.match(guide, {
        HowToPlay: ({ page }) =>
          Guide.HowToPlay({
            page: Math.min(GUIDE_PAGE_COUNT - 1, Math.max(0, toPage(page))),
          }),
        GetTheApp: () => guide,
      }),
  })

// A Room that's gone (it expired) or that has no seat for this device drops
// off the list.
const receiveSummary = (
  model: Model,
  code: string,
  summary: GameSummary,
): UpdateReturn =>
  GameSummary.guards.Missing(summary) || GameSummary.guards.NotSeated(summary)
    ? forgetFriendGame(model, code)
    : {
        model: modifyFields(model, {
          friendGames: rows =>
            Array.map(rows, row =>
              row.code === code
                ? modifyFields(row, {
                    status: () => GameStatus.Known({ summary }),
                  })
                : row,
            ),
        }),
      }

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
      Refused: ({ reason }) =>
        forgetFriendGame(
          setFriendScreen(
            model,
            modifyFields(screen, {
              room: () => FriendRoom.Refused({ reason }),
              connection: () => Connection.Disconnected(),
            }),
          ),
          screen.code,
        ),
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

const setInvite = (model: Model, invite: Invite): Model =>
  Screen.matchOrElse(
    model.screen,
    {
      Friend: screen =>
        setFriendScreen(model, modifyFields(screen, { invite: () => invite })),
    },
    () => model,
  )

const turnAlertsAfter = (outcome: AlertsOutcome): TurnAlerts =>
  Match.value(outcome).pipe(
    Match.withReturnType<TurnAlerts>(),
    Match.when('On', () => TurnAlerts.On()),
    Match.when('Blocked', () => TurnAlerts.Blocked()),
    Match.when('Failed', () => TurnAlerts.Failed()),
    Match.orElse(() => TurnAlerts.Off()),
  )

const afterPermission = (
  model: Model,
  permission: AlertsPermission,
): UpdateReturn => {
  if (permission !== 'granted') {
    return {
      model: modifyFields(model, {
        turnAlerts: () =>
          permission === 'denied' ? TurnAlerts.Blocked() : TurnAlerts.Off(),
      }),
    }
  }
  return Screen.matchOrElse(
    model.screen,
    {
      Friend: screen => ({
        model,
        commands: [
          RegisterTurnAlerts({ code: screen.code, deviceId: model.deviceId }),
        ],
      }),
    },
    () => ({
      model: modifyFields(model, { turnAlerts: () => TurnAlerts.On() }),
    }),
  )
}

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

    ClickedPlayFriend: () => withPlayerName(model, AfterNaming.StartGame()),

    CompletedGenerateRoomCode: ({ code }) =>
      Screen.guards.StartingFriendGame(model.screen)
        ? openFriendGame(model, code, 'Host')
        : { model },

    ClickedResumeFriendGame: ({ code }) =>
      Option.match(findRow(model.friendGames, code), {
        onNone: () => ({ model }),
        onSome: row =>
          withPlayerName(
            model,
            AfterNaming.OpenGame({ code: row.code, intent: row.intent }),
          ),
      }),

    ClickedJoinWithCode: () => ({
      model: modifyFields(model, {
        screen: () => Screen.JoiningGame({ draft: '' }),
      }),
    }),

    UpdatedJoinCodeDraft: ({ value }) =>
      withJoiningScreen(model, screen => ({
        model: modifyFields(model, {
          screen: () => modifyFields(screen, { draft: () => value }),
        }),
      })),

    SubmittedJoinCode: () =>
      withJoiningScreen(model, screen => submitJoinCode(model, screen)),

    ClickedCancelJoining: () => goToMenu(model),

    ClickedGetTheApp: () => openSheet(model, Guide.GetTheApp()),

    ClickedRemoveFriendGame: ({ code }) => forgetFriendGame(model, code),

    ClickedChangeName: () => ({
      model: modifyFields(model, {
        screen: () =>
          Screen.Naming({
            draft: Option.getOrElse(model.maybePlayerName, () => ''),
            next: AfterNaming.BackToMenu(),
          }),
      }),
    }),

    UpdatedNameDraft: ({ value }) =>
      withNamingScreen(model, screen => ({
        model: modifyFields(model, {
          screen: () => modifyFields(screen, { draft: () => value }),
        }),
      })),

    SubmittedName: () =>
      withNamingScreen(model, screen => submitName(model, screen)),

    ClickedCancelNaming: () => goToMenu(model),

    CompletedSavePlayerName: () => ({ model }),

    CompletedFetchGameSummary: ({ code, maybeSummary }) =>
      Option.match(maybeSummary, {
        onNone: () => ({ model }),
        onSome: summary => receiveSummary(model, code, summary),
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

    ClickedHowToPlay: () => openSheet(model, Guide.HowToPlay({ page: 0 })),

    ClickedGuideNext: () =>
      Guide.match(model.guide, {
        HowToPlay: ({ page }) => {
          if (page + 1 < GUIDE_PAGE_COUNT) {
            return { model: turnGuidePage(model, () => page + 1) }
          }
          return Screen.guards.Title(model.screen)
            ? Update.combine(model, [closeGuide, startBotGame])
            : closeGuide(model)
        },
        GetTheApp: () => closeGuide(model),
      }),

    ClickedGuidePage: ({ page }) => ({
      model: turnGuidePage(model, () => page),
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
        { Friend: () => goToMenu(model) },
        () => ({
          model: modifyFields(model, { screen: () => Screen.Title() }),
        }),
      ),

    CompletedSaveFriendGames: () => ({ model }),

    CompletedShowUrl: () => ({ model }),

    // Each connection hands the Room this device's push subscription again,
    // so a Room always has the device's current one.
    ConnectedRoomSocket: () =>
      withFriendScreen(model, screen => ({
        model: setFriendScreen(
          model,
          modifyFields(screen, { connection: () => Connection.Connected() }),
        ),
        commands: TurnAlerts.guards.On(model.turnAlerts)
          ? [
              RegisterTurnAlerts({
                code: screen.code,
                deviceId: model.deviceId,
              }),
            ]
          : [],
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
    // On the menu, it refreshes whose turn it is instead.
    ReturnedToApp: () =>
      Screen.guards.Title(model.screen)
        ? { model, commands: fetchSummaries(model) }
        : reconnect(model),

    LeftApp: () =>
      withFriendScreen(model, screen =>
        FriendRoom.guards.Refused(screen.room)
          ? { model }
          : markDisconnected(model),
      ),

    ClickedInvite: () =>
      withFriendScreen(model, screen => ({
        model: setInvite(model, Invite.Sharing()),
        commands: [ShareInvite({ code: screen.code })],
      })),

    CompletedShareInvite: ({ outcome }) => ({
      model: setInvite(model, inviteAfterShare(outcome)),
    }),

    // The button's Mount has already asked for permission (see
    // AskForTurnAlerts); this only shows that it's waiting.
    ClickedTurnOnAlerts: () =>
      TurnAlerts.guards.Off(model.turnAlerts) ||
      TurnAlerts.guards.Failed(model.turnAlerts)
        ? {
            model: modifyFields(model, {
              turnAlerts: () => TurnAlerts.Asking(),
            }),
          }
        : { model },

    AnsweredAlertsPrompt: ({ permission }) =>
      afterPermission(model, permission),

    CompletedRegisterAlerts: ({ outcome }) => ({
      model: modifyFields(model, {
        turnAlerts: () => turnAlertsAfter(outcome),
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
