import { Array, Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Dialog } from '@foldkit/ui'

import { buildDeck } from './domain/card'
import {
  type Game,
  Phase,
  deal,
  drawFromStock,
  newBotGame,
} from './domain/game'
import { newFriendGame } from './domain/game'
import {
  GameSummary,
  Move,
  RoomView,
  ServerMessage,
  settle,
} from './domain/room'
import { emptyStats, recordResult } from './domain/stats'
import {
  ApplyAppUpdate,
  CancelInvite,
  FetchGameSummary,
  GenerateRoomCode,
  Message,
  type Model,
  PlaySound,
  RegisterTurnAlerts,
  SaveFriendGames,
  SavePlayerName,
  SaveSound,
  SaveStats,
  SendMove,
  ShowUrl,
  ShuffleDeck,
  WaitBeforeBotStep,
  init,
  update,
} from './main'
import {
  AfterNaming,
  AppUpdate,
  Connection,
  FriendRoom,
  GUIDE_DIALOG_ID,
  GameStatus,
  Guide,
  HomeScreen,
  Invite,
  Screen,
  SoundSetting,
  StatsStep,
  TurnAlerts,
} from './model'

const DEVICE_ID = 'device-0000-0000-0000'

const atTable = (game: Game): Model => ({
  screen: Screen.Table({ game }),
  deviceId: DEVICE_ID,
  maybePlayerName: Option.some('Sam'),
  friendGames: [],
  stats: emptyStats,
  guide: Guide.HowToPlay({ page: 0 }),
  guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
  homeScreen: HomeScreen.Unavailable(),
  sound: SoundSetting.Off(),
  appUpdate: AppUpdate.None(),
  turnAlerts: TurnAlerts.Off(),
})

const gameOf = (model: Model): Game =>
  Screen.match(model.screen, {
    Table: ({ game }) => game,
    Title: () => {
      throw new Error('expected the table')
    },
    StartingFriendGame: () => {
      throw new Error('expected the table')
    },
    Naming: () => {
      throw new Error('expected the table')
    },
    JoiningGame: () => {
      throw new Error('expected the table')
    },
    Friend: () => {
      throw new Error('expected the table')
    },
  })

const botsTurn = (): Game =>
  modifyFields(deal(newBotGame(), buildDeck(1)), { currentIndex: () => 1 })

describe('update', () => {
  test('starting a game shuffles a deck', () => {
    story(
      update,
      given<Model>({
        screen: Screen.Title(),
        deviceId: DEVICE_ID,
        maybePlayerName: Option.some('Sam'),
        friendGames: [],
        stats: emptyStats,
        guide: Guide.HowToPlay({ page: 0 }),
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
        homeScreen: HomeScreen.Unavailable(),
        sound: SoundSetting.Off(),
        appUpdate: AppUpdate.None(),
        turnAlerts: TurnAlerts.Off(),
      }),
      message(Message.ClickedPlayBot()),
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
        deviceId: DEVICE_ID,
        maybePlayerName: Option.some('Sam'),
        friendGames: [],
        stats: emptyStats,
        guide: Guide.HowToPlay({ page: 2 }),
        // The enter and leave transitions are the Dialog's business; this
        // story is about the guide's paging.
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID }),
        homeScreen: HomeScreen.Unavailable(),
        sound: SoundSetting.Off(),
        appUpdate: AppUpdate.None(),
        turnAlerts: TurnAlerts.Off(),
      }),
      message(Message.ClickedHowToPlay()),
      Command.expectHas(Dialog.ShowDialog),
      model(next => {
        expect(next.guideDialog.isOpen).toBe(true)
        expect(next.guide).toEqual(Guide.HowToPlay({ page: 0 }))
      }),
      Command.resolveAll([
        Dialog.ShowDialog,
        Dialog.Message.SucceededShowDialog(),
      ]),
      message(Message.ClickedGuideNext()),
      message(Message.ClickedGuideNext()),
      model(next => {
        expect(next.guide).toEqual(Guide.HowToPlay({ page: 2 }))
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

  test('the Get the app sheet opens on its own and closes without starting a game', () => {
    story(
      update,
      given<Model>({
        ...atTable(botsTurn()),
        screen: Screen.Title(),
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID }),
        homeScreen: HomeScreen.AddOnIos(),
      }),
      message(Message.ClickedGetTheApp()),
      Command.expectHas(Dialog.ShowDialog),
      model(next => {
        expect(next.guideDialog.isOpen).toBe(true)
        expect(next.guide).toEqual(Guide.GetTheApp())
      }),
      Command.resolveAll([
        Dialog.ShowDialog,
        Dialog.Message.SucceededShowDialog(),
      ]),
      message(Message.ClickedGuideNext()),
      Command.expectExact(Dialog.CloseDialog),
      model(next => {
        expect(next.guideDialog.isOpen).toBe(false)
        expect(Screen.guards.Title(next.screen)).toBe(true)
      }),
      Command.resolve(
        Dialog.CloseDialog,
        Dialog.Message.CompletedCloseDialog(),
      ),
    )
  })

  test('ending a bot game counts it once and saves the stats', () => {
    const roundOver = modifyFields(deal(newBotGame(), buildDeck(1)), {
      phase: () => Phase.RoundOver({ finisherIndexes: [0] }),
    })

    story(
      update,
      given(atTable(roundOver)),
      message(Message.ClickedEndGame()),
      Command.expectHas(SaveStats),
      model(next => {
        expect(Phase.guards.Ended(gameOf(next).phase)).toBe(true)
        expect(next.stats.bot.won).toBe(1)
        expect(next.stats.bot.endedEarly).toBe(1)
        expect(next.stats.total.played).toBe(1)
      }),
      Command.resolve(SaveStats, Message.CompletedSaveStats()),
      message(Message.ClickedEndGame()),
      Command.expectNone(),
      model(next => {
        expect(next.stats.total.played).toBe(1)
      }),
    )
  })

  test('the Stats sheet resets the numbers only once confirmed', () => {
    const played = recordResult(emptyStats, {
      opponent: 'Bot',
      outcome: 'Won',
      ending: 'Finished',
      rounds: 6,
    })

    story(
      update,
      given<Model>({
        ...atTable(botsTurn()),
        screen: Screen.Title(),
        stats: played,
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID }),
      }),
      message(Message.ClickedStats()),
      Command.expectHas(Dialog.ShowDialog),
      model(next => {
        expect(next.guideDialog.isOpen).toBe(true)
        expect(next.guide).toEqual(Guide.Stats({ step: StatsStep.Viewing() }))
      }),
      Command.resolveAll([
        Dialog.ShowDialog,
        Dialog.Message.SucceededShowDialog(),
      ]),
      message(Message.ClickedResetStats()),
      model(next => {
        expect(next.guide).toEqual(
          Guide.Stats({ step: StatsStep.ConfirmingReset() }),
        )
      }),
      message(Message.ClickedCancelResetStats()),
      Command.expectNone(),
      model(next => {
        expect(next.stats).toEqual(played)
        expect(next.guide).toEqual(Guide.Stats({ step: StatsStep.Viewing() }))
      }),
      message(Message.ClickedConfirmResetStats()),
      Command.expectNone(),
      message(Message.ClickedResetStats()),
      message(Message.ClickedConfirmResetStats()),
      Command.expectExact(SaveStats({ stats: emptyStats })),
      model(next => {
        expect(next.stats).toEqual(emptyStats)
        expect(next.guide).toEqual(Guide.Stats({ step: StatsStep.Viewing() }))
      }),
      Command.resolve(SaveStats, Message.CompletedSaveStats()),
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

  describe('sound effects', () => {
    const humansTurn = (): Game => deal(newBotGame(), buildDeck(1))

    const withSound = (game: Game): Model => ({
      ...atTable(game),
      sound: SoundSetting.On(),
    })

    test('sound is off until the player turns it on, and the choice is saved', () => {
      story(
        update,
        given(atTable(humansTurn())),
        message(Message.ClickedStock()),
        Command.expectNone(),
        message(Message.ClickedToggleSound()),
        Command.expectExact(
          SaveSound({ sound: SoundSetting.On() }),
          PlaySound({ sound: 'Place' }),
        ),
        model(next => {
          expect(SoundSetting.guards.On(next.sound)).toBe(true)
        }),
        Command.resolveAll(
          [SaveSound, Message.CompletedSaveSound()],
          [PlaySound, Message.CompletedPlaySound()],
        ),
        message(Message.ClickedToggleSound()),
        Command.expectExact(SaveSound({ sound: SoundSetting.Off() })),
        model(next => {
          expect(SoundSetting.guards.Off(next.sound)).toBe(true)
        }),
        Command.resolve(SaveSound, Message.CompletedSaveSound()),
      )
    })

    test("the player's own move plays its sound", () => {
      story(
        update,
        given(withSound(humansTurn())),
        message(Message.ClickedStock()),
        Command.expectExact(PlaySound({ sound: 'Draw' })),
        Command.resolve(PlaySound, Message.CompletedPlaySound()),
      )
    })

    test('a stale bot step plays nothing', () => {
      const game = botsTurn()

      story(
        update,
        given(withSound(game)),
        message(
          Message.CompletedWaitBeforeBotStep({ sequence: game.sequence - 1 }),
        ),
        Command.expectNone(),
        message(
          Message.CompletedWaitBeforeBotStep({ sequence: game.sequence }),
        ),
        Command.expectHas(WaitBeforeBotStep, PlaySound),
        Command.resolveAll(
          [
            WaitBeforeBotStep,
            Message.CompletedWaitBeforeBotStep({ sequence: -1 }),
          ],
          [PlaySound, Message.CompletedPlaySound()],
        ),
      )
    })

    test("a friend's move plays as it arrives over the socket", () => {
      const before = settle(newFriendGame(), cards => cards)
      const after = drawFromStock(before)

      story(
        update,
        given<Model>({
          ...withSound(before),
          screen: Screen.Friend({
            code: 'K7QXMP',
            intent: 'Join',
            seat: 1,
            room: FriendRoom.Playing({ game: before }),
            connection: Connection.Connected(),
            invite: Invite.Idle(),
          }),
        }),
        message(
          Message.ReceivedServerMessage({
            message: ServerMessage.Seated({
              seat: 1,
              room: RoomView.Playing({ game: after }),
            }),
          }),
        ),
        Command.expectExact(PlaySound({ sound: 'Draw' })),
        Command.resolve(PlaySound, Message.CompletedPlaySound()),
      )
    })
  })

  describe('friend game', () => {
    const atTitle = (): Model => ({
      screen: Screen.Title(),
      deviceId: DEVICE_ID,
      maybePlayerName: Option.some('Sam'),
      friendGames: [],
      stats: emptyStats,
      guide: Guide.HowToPlay({ page: 0 }),
      guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
      homeScreen: HomeScreen.Unavailable(),
      sound: SoundSetting.Off(),
      appUpdate: AppUpdate.None(),
      turnAlerts: TurnAlerts.Off(),
    })

    const friendGame = (): Game => settle(newFriendGame(), cards => cards)

    const friendScreenOf = (next: Model) => {
      if (!Screen.guards.Friend(next.screen)) {
        throw new Error('expected the friend screen')
      }
      return next.screen
    }

    test('playing a friend opens a room, remembers it, and waits for them', () => {
      story(
        update,
        given(atTitle()),
        message(Message.ClickedPlayFriend()),
        Command.expectHas(GenerateRoomCode),
        Command.resolve(
          GenerateRoomCode,
          Message.CompletedGenerateRoomCode({ code: 'K7QXMP' }),
        ),
        Command.expectHas(
          SaveFriendGames({ games: [{ code: 'K7QXMP', intent: 'Host' }] }),
          ShowUrl,
        ),
        model(next => {
          const screen = friendScreenOf(next)
          expect(screen.code).toBe('K7QXMP')
          expect(screen.intent).toBe('Host')
          expect(Connection.guards.Connecting(screen.connection)).toBe(true)
          expect(next.friendGames).toEqual([
            {
              code: 'K7QXMP',
              intent: 'Host',
              status: GameStatus.Unknown(),
            },
          ])
        }),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
        ),
        message(Message.ConnectedRoomSocket()),
        model(next => {
          expect(
            Connection.guards.Connected(friendScreenOf(next).connection),
          ).toBe(true)
        }),
        message(
          Message.ReceivedServerMessage({
            message: ServerMessage.Seated({
              seat: 0,
              room: RoomView.WaitingForGuest(),
            }),
          }),
        ),
        model(next => {
          const screen = friendScreenOf(next)
          expect(FriendRoom.guards.WaitingForGuest(screen.room)).toBe(true)
          expect(Connection.guards.Connected(screen.connection)).toBe(true)
        }),
      )
    })

    const inLobby = (): Model => ({
      ...atTitle(),
      friendGames: [
        { code: 'K7QXMP', intent: 'Host', status: GameStatus.Unknown() },
      ],
      screen: Screen.Friend({
        code: 'K7QXMP',
        intent: 'Host',
        seat: 0,
        room: FriendRoom.WaitingForGuest(),
        connection: Connection.Connected(),
        invite: Invite.Idle(),
      }),
    })

    test('cancelling an invite forgets the game and deletes its Room', () => {
      story(
        update,
        given(inLobby()),
        message(Message.ClickedCancelInvite()),
        Command.expectExact(
          SaveFriendGames({ games: [] }),
          ShowUrl({ path: '/' }),
          CancelInvite({ code: 'K7QXMP', deviceId: DEVICE_ID }),
        ),
        model(next => {
          expect(Screen.guards.Title(next.screen)).toBe(true)
          expect(next.friendGames).toEqual([])
        }),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
          [
            CancelInvite,
            Message.CompletedCancelInvite({
              code: 'K7QXMP',
              outcome: 'Cancelled',
            }),
          ],
        ),
        model(next => {
          expect(next.friendGames).toEqual([])
        }),
      )
    })

    test('a friend who joined before the cancel keeps the game', () => {
      story(
        update,
        given(inLobby()),
        message(Message.ClickedCancelInvite()),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
          [
            CancelInvite,
            Message.CompletedCancelInvite({
              code: 'K7QXMP',
              outcome: 'Joined',
            }),
          ],
        ),
        Command.expectExact(
          SaveFriendGames({ games: [{ code: 'K7QXMP', intent: 'Host' }] }),
          FetchGameSummary({ code: 'K7QXMP', deviceId: DEVICE_ID }),
        ),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [
            FetchGameSummary,
            Message.CompletedFetchGameSummary({
              code: 'K7QXMP',
              maybeSummary: Option.none(),
            }),
          ],
        ),
      )
    })

    test('a typed-in code opens that game to join it', () => {
      story(
        update,
        given(atTitle()),
        message(Message.ClickedJoinWithCode()),
        message(Message.UpdatedJoinCodeDraft({ value: 'k7q' })),
        message(Message.SubmittedJoinCode()),
        Command.expectNone(),
        model(next => {
          expect(Screen.guards.JoiningGame(next.screen)).toBe(true)
        }),
        message(Message.UpdatedJoinCodeDraft({ value: 'k7q xmp' })),
        message(Message.SubmittedJoinCode()),
        Command.expectHas(
          SaveFriendGames({ games: [{ code: 'K7QXMP', intent: 'Join' }] }),
          ShowUrl,
        ),
        model(next => {
          const screen = friendScreenOf(next)
          expect(screen.code).toBe('K7QXMP')
          expect(screen.intent).toBe('Join')
        }),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
        ),
      )
    })

    test('a typed-in code for a game this device hosts reopens it as host', () => {
      story(
        update,
        given({
          ...atTitle(),
          friendGames: [
            { code: 'K7QXMP', intent: 'Host', status: GameStatus.Unknown() },
          ],
          screen: Screen.JoiningGame({ draft: 'K7QXMP' }),
        }),
        message(Message.SubmittedJoinCode()),
        model(next => {
          expect(friendScreenOf(next).intent).toBe('Host')
        }),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
        ),
      )
    })

    test('joining by code asks for a name first', () => {
      story(
        update,
        given({
          ...atTitle(),
          maybePlayerName: Option.none(),
          screen: Screen.JoiningGame({ draft: 'K7QXMP' }),
        }),
        message(Message.SubmittedJoinCode()),
        Command.expectNone(),
        model(next => {
          expect(next.screen).toEqual(
            Screen.Naming({
              draft: '',
              next: AfterNaming.OpenGame({ code: 'K7QXMP', intent: 'Join' }),
            }),
          )
        }),
      )
    })

    const seatedAt = (seatIndex: number): Model => ({
      ...atTitle(),
      screen: Screen.Friend({
        code: 'K7QXMP',
        intent: 'Join',
        seat: seatIndex,
        room: FriendRoom.Playing({ game: friendGame() }),
        connection: Connection.Connected(),
        invite: Invite.Idle(),
      }),
    })

    test('a tap on your turn sends the move and leaves the game to the room', () => {
      const game = friendGame()

      story(
        update,
        given(seatedAt(0)),
        message(Message.ClickedStock()),
        Command.expectExact(
          SendMove({ sequence: game.sequence, move: Move.Draw() }),
        ),
        model(next => {
          expect(friendScreenOf(next).room).toEqual(
            FriendRoom.Playing({ game }),
          )
        }),
        Command.resolve(SendMove, Message.SucceededSendMove()),
      )
    })

    test('a finished game counts once from this seat, however often it comes back', () => {
      const over = modifyFields(friendGame(), {
        phase: () => Phase.GameOver({ winnerIndex: 1 }),
      })
      const seated = Message.ReceivedServerMessage({
        message: ServerMessage.Seated({
          seat: 1,
          room: RoomView.Playing({ game: over }),
        }),
      })

      story(
        update,
        given(seatedAt(1)),
        message(seated),
        Command.expectHas(SaveStats),
        model(next => {
          expect(next.stats.friends.won).toBe(1)
          expect(next.stats.bot.played).toBe(0)
        }),
        Command.resolve(SaveStats, Message.CompletedSaveStats()),
        message(seated),
        Command.expectNone(),
        model(next => {
          expect(next.stats.friends.played).toBe(1)
        }),
      )
    })

    test("a tap on the other player's turn sends nothing", () => {
      story(
        update,
        given(seatedAt(1)),
        message(Message.ClickedStock()),
        Command.expectNone(),
      )
    })

    test('a full room is forgotten', () => {
      story(
        update,
        given(
          modifyFields(seatedAt(1), {
            friendGames: () => [
              { code: 'K7QXMP', intent: 'Join', status: GameStatus.Unknown() },
              { code: 'ABCDEF', intent: 'Host', status: GameStatus.Unknown() },
            ],
          }),
        ),
        message(
          Message.ReceivedServerMessage({
            message: ServerMessage.Refused({ reason: 'Full' }),
          }),
        ),
        Command.expectExact(
          SaveFriendGames({ games: [{ code: 'ABCDEF', intent: 'Host' }] }),
        ),
        model(next => {
          expect(Array.map(next.friendGames, row => row.code)).toEqual([
            'ABCDEF',
          ])
          expect(friendScreenOf(next).room).toEqual(
            FriendRoom.Refused({ reason: 'Full' }),
          )
        }),
        Command.resolve(SaveFriendGames, Message.CompletedSaveFriendGames()),
      )
    })

    test('coming back to the app reconnects a dropped game', () => {
      story(
        update,
        given(seatedAt(0)),
        message(Message.DisconnectedRoomSocket()),
        model(next => {
          expect(
            Connection.guards.Disconnected(friendScreenOf(next).connection),
          ).toBe(true)
        }),
        message(Message.ReturnedToApp()),
        model(next => {
          expect(
            Connection.guards.Connecting(friendScreenOf(next).connection),
          ).toBe(true)
        }),
      )
    })
    test('turning on alerts registers this device once permission is granted', () => {
      story(
        update,
        given(seatedAt(1)),
        message(Message.ClickedTurnOnAlerts()),
        Command.expectNone(),
        model(next => {
          expect(TurnAlerts.guards.Asking(next.turnAlerts)).toBe(true)
        }),
        message(Message.AnsweredAlertsPrompt({ permission: 'granted' })),
        Command.expectExact(
          RegisterTurnAlerts({ code: 'K7QXMP', deviceId: DEVICE_ID }),
        ),
        Command.resolve(
          RegisterTurnAlerts,
          Message.CompletedRegisterAlerts({ outcome: 'On' }),
        ),
        model(next => {
          expect(TurnAlerts.guards.On(next.turnAlerts)).toBe(true)
        }),
      )
    })

    test('a refused permission shows alerts as blocked', () => {
      story(
        update,
        given(seatedAt(1)),
        message(Message.ClickedTurnOnAlerts()),
        message(Message.AnsweredAlertsPrompt({ permission: 'denied' })),
        Command.expectNone(),
        model(next => {
          expect(TurnAlerts.guards.Blocked(next.turnAlerts)).toBe(true)
        }),
      )
    })

    test('leaving the app drops the socket so the room can alert this player', () => {
      story(
        update,
        given(seatedAt(0)),
        message(Message.LeftApp()),
        model(next => {
          expect(
            Connection.guards.Disconnected(friendScreenOf(next).connection),
          ).toBe(true)
        }),
        message(Message.ReturnedToApp()),
        model(next => {
          expect(
            Connection.guards.Connecting(friendScreenOf(next).connection),
          ).toBe(true)
        }),
      )
    })

    test('with alerts on, every connection re-registers this device', () => {
      story(
        update,
        given({
          ...seatedAt(0),
          turnAlerts: TurnAlerts.On(),
        }),
        message(Message.DisconnectedRoomSocket()),
        message(Message.ReturnedToApp()),
        message(Message.ConnectedRoomSocket()),
        Command.expectExact(
          RegisterTurnAlerts({ code: 'K7QXMP', deviceId: DEVICE_ID }),
        ),
        Command.resolve(
          RegisterTurnAlerts,
          Message.CompletedRegisterAlerts({ outcome: 'Failed' }),
        ),
        model(next => {
          expect(TurnAlerts.guards.Failed(next.turnAlerts)).toBe(true)
        }),
      )
    })
  })

  describe('game list', () => {
    const menu = (overrides: Partial<Model> = {}): Model => ({
      screen: Screen.Title(),
      deviceId: DEVICE_ID,
      maybePlayerName: Option.some('Sam'),
      friendGames: [
        { code: 'AAAAAA', intent: 'Host', status: GameStatus.Unknown() },
        { code: 'BBBBBB', intent: 'Join', status: GameStatus.Unknown() },
      ],
      stats: emptyStats,
      guide: Guide.HowToPlay({ page: 0 }),
      guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
      homeScreen: HomeScreen.Unavailable(),
      sound: SoundSetting.Off(),
      appUpdate: AppUpdate.None(),
      turnAlerts: TurnAlerts.Off(),
      ...overrides,
    })

    const flagsWith = (
      overrides: Partial<Parameters<typeof init>[0]> = {},
    ): Parameters<typeof init>[0] => ({
      deviceId: DEVICE_ID,
      maybePlayerName: Option.some('Sam'),
      savedFriendGames: [
        { code: 'AAAAAA', intent: 'Host' },
        { code: 'BBBBBB', intent: 'Join' },
      ],
      stats: emptyStats,
      maybeInviteCode: Option.none(),
      sound: SoundSetting.Off(),
      turnAlerts: TurnAlerts.Off(),
      homeScreen: HomeScreen.Unavailable(),
      ...overrides,
    })

    test('the menu asks every saved game whose turn it is', () => {
      const init_ = init(flagsWith())
      expect(init_.model.friendGames).toHaveLength(2)
      expect(
        Array.map(init_.commands ?? [], command => [
          command.name,
          command.args,
        ]),
      ).toEqual([
        ['FetchGameSummary', { code: 'AAAAAA', deviceId: DEVICE_ID }],
        ['FetchGameSummary', { code: 'BBBBBB', deviceId: DEVICE_ID }],
      ])
    })

    test('an invite link without a name asks for one before joining', () => {
      const init_ = init(
        flagsWith({
          maybePlayerName: Option.none(),
          savedFriendGames: [],
          maybeInviteCode: Option.some('K7QXMP'),
        }),
      )
      expect(init_.model.screen).toEqual(
        Screen.Naming({
          draft: '',
          next: AfterNaming.OpenGame({ code: 'K7QXMP', intent: 'Join' }),
        }),
      )
      expect(init_.commands).toBeUndefined()

      story(
        update,
        given(init_.model),
        message(Message.UpdatedNameDraft({ value: '  Alex  ' })),
        message(Message.SubmittedName()),
        Command.expectHas(
          SavePlayerName({ name: 'Alex' }),
          SaveFriendGames({ games: [{ code: 'K7QXMP', intent: 'Join' }] }),
          ShowUrl,
        ),
        model(next => {
          expect(next.maybePlayerName).toEqual(Option.some('Alex'))
          expect(Screen.guards.Friend(next.screen)).toBe(true)
        }),
        Command.resolveAll(
          [SavePlayerName, Message.CompletedSavePlayerName()],
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
        ),
      )
    })

    test('playing a friend asks for a name once, then starts the game', () => {
      story(
        update,
        given(menu({ maybePlayerName: Option.none() })),
        message(Message.ClickedPlayFriend()),
        Command.expectNone(),
        model(next => {
          expect(next.screen).toEqual(
            Screen.Naming({ draft: '', next: AfterNaming.StartGame() }),
          )
        }),
        message(Message.UpdatedNameDraft({ value: '   ' })),
        message(Message.SubmittedName()),
        Command.expectNone(),
        message(Message.UpdatedNameDraft({ value: 'Sam' })),
        message(Message.SubmittedName()),
        Command.expectExact(
          SavePlayerName({ name: 'Sam' }),
          GenerateRoomCode(),
        ),
        model(next => {
          expect(Screen.guards.StartingFriendGame(next.screen)).toBe(true)
        }),
        Command.resolveAll(
          [SavePlayerName, Message.CompletedSavePlayerName()],
          [
            GenerateRoomCode,
            Message.CompletedGenerateRoomCode({ code: 'K7QXMP' }),
          ],
        ),
        model(next => {
          expect(Array.map(next.friendGames, row => row.code)).toEqual([
            'K7QXMP',
            'AAAAAA',
            'BBBBBB',
          ])
        }),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
        ),
      )
    })

    test('a known name goes straight to the game', () => {
      story(
        update,
        given(menu()),
        message(Message.ClickedPlayFriend()),
        Command.expectExact(GenerateRoomCode()),
        Command.resolve(
          GenerateRoomCode,
          Message.CompletedGenerateRoomCode({ code: 'K7QXMP' }),
        ),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
        ),
      )
    })

    test('each row shows what its Room reports', () => {
      const summary = GameSummary.YourTurn({ opponentName: 'Alex', round: 3 })
      story(
        update,
        given(menu()),
        message(
          Message.CompletedFetchGameSummary({
            code: 'BBBBBB',
            maybeSummary: Option.some(summary),
          }),
        ),
        Command.expectNone(),
        message(
          Message.CompletedFetchGameSummary({
            code: 'AAAAAA',
            maybeSummary: Option.none(),
          }),
        ),
        Command.expectNone(),
        model(next => {
          expect(Array.map(next.friendGames, row => row.status)).toEqual([
            GameStatus.Unknown(),
            GameStatus.Known({ summary }),
          ])
        }),
      )
    })

    test('a game whose Room has expired drops off the list', () => {
      story(
        update,
        given(menu()),
        message(
          Message.CompletedFetchGameSummary({
            code: 'AAAAAA',
            maybeSummary: Option.some(GameSummary.Missing()),
          }),
        ),
        Command.expectExact(
          SaveFriendGames({ games: [{ code: 'BBBBBB', intent: 'Join' }] }),
        ),
        model(next => {
          expect(Array.map(next.friendGames, row => row.code)).toEqual([
            'BBBBBB',
          ])
        }),
        Command.resolve(SaveFriendGames, Message.CompletedSaveFriendGames()),
      )
    })

    test('removing a game forgets it on this device only', () => {
      story(
        update,
        given(menu()),
        message(Message.ClickedRemoveFriendGame({ code: 'BBBBBB' })),
        Command.expectExact(
          SaveFriendGames({ games: [{ code: 'AAAAAA', intent: 'Host' }] }),
        ),
        Command.resolve(SaveFriendGames, Message.CompletedSaveFriendGames()),
      )
    })

    test('opening a game moves it to the top of the list', () => {
      story(
        update,
        given(menu()),
        message(Message.ClickedResumeFriendGame({ code: 'BBBBBB' })),
        Command.expectHas(
          SaveFriendGames({
            games: [
              { code: 'BBBBBB', intent: 'Join' },
              { code: 'AAAAAA', intent: 'Host' },
            ],
          }),
          ShowUrl({ path: '/r/BBBBBB' }),
        ),
        model(next => {
          const screen = next.screen
          expect(Screen.guards.Friend(screen) && screen.intent).toBe('Join')
        }),
        Command.resolveAll(
          [SaveFriendGames, Message.CompletedSaveFriendGames()],
          [ShowUrl, Message.CompletedShowUrl()],
        ),
        message(Message.ClickedLeaveTable()),
        Command.expectExact(
          ShowUrl({ path: '/' }),
          FetchGameSummary({ code: 'BBBBBB', deviceId: DEVICE_ID }),
          FetchGameSummary({ code: 'AAAAAA', deviceId: DEVICE_ID }),
        ),
        model(next => {
          expect(Screen.guards.Title(next.screen)).toBe(true)
          expect(next.friendGames).toHaveLength(2)
        }),
        Command.resolveAll(
          [ShowUrl, Message.CompletedShowUrl()],
          [
            FetchGameSummary,
            Message.CompletedFetchGameSummary({
              code: 'BBBBBB',
              maybeSummary: Option.none(),
            }),
          ],
          [
            FetchGameSummary,
            Message.CompletedFetchGameSummary({
              code: 'AAAAAA',
              maybeSummary: Option.none(),
            }),
          ],
        ),
      )
    })

    test('the player can change their name from the menu', () => {
      story(
        update,
        given(menu()),
        message(Message.ClickedChangeName()),
        model(next => {
          expect(next.screen).toEqual(
            Screen.Naming({ draft: 'Sam', next: AfterNaming.BackToMenu() }),
          )
        }),
        message(Message.UpdatedNameDraft({ value: 'Samantha' })),
        message(Message.SubmittedName()),
        Command.expectHas(SavePlayerName({ name: 'Samantha' }), ShowUrl),
        model(next => {
          expect(next.maybePlayerName).toEqual(Option.some('Samantha'))
          expect(Screen.guards.Title(next.screen)).toBe(true)
        }),
        Command.resolveAll(
          [SavePlayerName, Message.CompletedSavePlayerName()],
          [ShowUrl, Message.CompletedShowUrl()],
          [
            FetchGameSummary,
            Message.CompletedFetchGameSummary({
              code: 'AAAAAA',
              maybeSummary: Option.none(),
            }),
          ],
          [
            FetchGameSummary,
            Message.CompletedFetchGameSummary({
              code: 'BBBBBB',
              maybeSummary: Option.none(),
            }),
          ],
        ),
      )
    })
  })
})
