import { Array, Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Dialog } from '@foldkit/ui'

import { buildDeck } from './domain/card'
import { type Game, Phase, deal, newBotGame } from './domain/game'
import { newFriendGame } from './domain/game'
import { Move, RoomView, ServerMessage, settle } from './domain/room'
import {
  ApplyAppUpdate,
  EnableTurnAlerts,
  ForgetFriendGame,
  GenerateRoomCode,
  Message,
  type Model,
  RegisterTurnAlerts,
  SaveFriendGame,
  SendMove,
  ShowUrl,
  ShuffleDeck,
  WaitBeforeBotStep,
  update,
} from './main'
import {
  AppUpdate,
  Connection,
  FriendRoom,
  GUIDE_DIALOG_ID,
  Invite,
  Screen,
  TurnAlerts,
} from './model'

const DEVICE_ID = 'device-0000-0000-0000'

const atTable = (game: Game): Model => ({
  screen: Screen.Table({ game }),
  deviceId: DEVICE_ID,
  maybeSavedFriendGame: Option.none(),
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
        maybeSavedFriendGame: Option.none(),
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
        maybeSavedFriendGame: Option.none(),
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
      maybeSavedFriendGame: Option.none(),
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
        Command.expectHas(SaveFriendGame, ShowUrl),
        model(next => {
          const screen = friendScreenOf(next)
          expect(screen.code).toBe('K7QXMP')
          expect(screen.intent).toBe('Host')
          expect(Connection.guards.Connecting(screen.connection)).toBe(true)
          expect(next.maybeSavedFriendGame).toEqual(
            Option.some({ code: 'K7QXMP', intent: 'Host' }),
          )
        }),
        Command.resolveAll(
          [SaveFriendGame, Message.CompletedSaveFriendGame()],
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
        given({
          ...seatedAt(1),
          maybeSavedFriendGame: Option.some({
            code: 'K7QXMP',
            intent: 'Join' as const,
          }),
        }),
        message(
          Message.ReceivedServerMessage({
            message: ServerMessage.Refused({ reason: 'Full' }),
          }),
        ),
        Command.expectHas(ForgetFriendGame),
        model(next => {
          expect(next.maybeSavedFriendGame).toEqual(Option.none())
          expect(friendScreenOf(next).room).toEqual(
            FriendRoom.Refused({ reason: 'Full' }),
          )
        }),
        Command.resolve(ForgetFriendGame, Message.CompletedForgetFriendGame()),
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
    test('turning on alerts asks for permission and hands the room the subscription', () => {
      story(
        update,
        given(seatedAt(1)),
        message(Message.ClickedTurnOnAlerts()),
        Command.expectExact(
          EnableTurnAlerts({ code: 'K7QXMP', deviceId: DEVICE_ID }),
        ),
        model(next => {
          expect(TurnAlerts.guards.Asking(next.turnAlerts)).toBe(true)
        }),
        Command.resolve(
          EnableTurnAlerts,
          Message.CompletedEnableAlerts({ outcome: 'Blocked' }),
        ),
        model(next => {
          expect(TurnAlerts.guards.Blocked(next.turnAlerts)).toBe(true)
        }),
        // Blocked in Settings: tapping again can't ask a second time.
        message(Message.ClickedTurnOnAlerts()),
        Command.expectNone(),
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
})
