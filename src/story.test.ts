import { Array, Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Dialog } from '@foldkit/ui'

import { buildDeck } from './domain/card'
import { type Game, Phase, deal, newBotGame } from './domain/game'
import { newFriendGame } from './domain/game'
import {
  GameSummary,
  Move,
  RoomView,
  ServerMessage,
  settle,
} from './domain/room'
import {
  ApplyAppUpdate,
  FetchGameSummary,
  GenerateRoomCode,
  Message,
  type Model,
  RegisterTurnAlerts,
  SaveFriendGames,
  SavePlayerName,
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
  Invite,
  Screen,
  TurnAlerts,
} from './model'

const DEVICE_ID = 'device-0000-0000-0000'

const atTable = (game: Game): Model => ({
  screen: Screen.Table({ game }),
  deviceId: DEVICE_ID,
  maybePlayerName: Option.some('Sam'),
  friendGames: [],
  guidePage: 0,
  guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
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
        guidePage: 0,
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
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
        guidePage: 2,
        // The enter and leave transitions are the Dialog's business; this
        // story is about the guide's paging.
        guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID }),
        appUpdate: AppUpdate.None(),
        turnAlerts: TurnAlerts.Off(),
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

  describe('friend game', () => {
    const atTitle = (): Model => ({
      screen: Screen.Title(),
      deviceId: DEVICE_ID,
      maybePlayerName: Option.some('Sam'),
      friendGames: [],
      guidePage: 0,
      guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
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
      guidePage: 0,
      guideDialog: Dialog.init({ id: GUIDE_DIALOG_ID, isAnimated: true }),
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
      maybeInviteCode: Option.none(),
      turnAlerts: TurnAlerts.Off(),
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
