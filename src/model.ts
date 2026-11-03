import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Dialog } from '@foldkit/ui'

import { Game } from './domain/game'
import { GameSummary, Intent, Refusal } from './domain/room'
import { Stats } from './domain/stats'
import { InviteKind } from './message'

// A friend game this device has a seat in, remembered so the app can reopen
// it from the menu hours later.
export const SavedFriendGame = Schema.Struct({
  code: Schema.String,
  intent: Intent,
})
export type SavedFriendGame = typeof SavedFriendGame.Type

// What the menu knows about a saved game: nothing until its Room answers
// (or ever, offline), then whose turn it is.
export const GameStatus = defineTaggedUnion({
  Unknown: {},
  Known: { summary: GameSummary },
})
export type GameStatus = typeof GameStatus.Type

// One row of the menu's game list, most recently opened first.
export const FriendGameRow = Schema.Struct({
  code: Schema.String,
  intent: Intent,
  status: GameStatus,
})
export type FriendGameRow = typeof FriendGameRow.Type

// Where the name screen goes once the player has typed their name.
export const AfterNaming = defineTaggedUnion({
  StartGame: {},
  OpenGame: { code: Schema.String, intent: Intent },
  BackToMenu: {},
})
export type AfterNaming = typeof AfterNaming.Type

export const Connection = defineTaggedUnion({
  Connecting: {},
  Connected: {},
  Disconnected: {},
})
export type Connection = typeof Connection.Type

export const FriendRoom = defineTaggedUnion({
  Loading: {},
  WaitingForGuest: {},
  Playing: { game: Game },
  Refused: { reason: Refusal },
})
export type FriendRoom = typeof FriendRoom.Type

export const Invite = defineTaggedUnion({
  Idle: {},
  Sharing: {},
  Copied: { kind: InviteKind },
  Failed: {},
})
export type Invite = typeof Invite.Type

export const Screen = defineTaggedUnion({
  Title: {},
  Naming: { draft: Schema.String, next: AfterNaming },
  JoiningGame: { draft: Schema.String },
  Table: { game: Game },
  StartingFriendGame: {},
  Friend: {
    code: Schema.String,
    intent: Intent,
    seat: Schema.Number,
    room: FriendRoom,
    connection: Connection,
    invite: Invite,
  },
})
export type Screen = typeof Screen.Type

// Whether this device gets a push notification when it's the player's turn
// in a friend game. iPhones only allow it once Trash is on the Home Screen.
export const TurnAlerts = defineTaggedUnion({
  Unsupported: {},
  NeedsHomeScreen: {},
  Off: {},
  Asking: {},
  On: {},
  Blocked: {},
  Failed: {},
})
export type TurnAlerts = typeof TurnAlerts.Type

// Whether Trash runs as a Home Screen app, and if not, how this phone adds
// it to the Home Screen. Only the Home Screen app gets turn alerts on an
// iPhone, and it's where a typed-in code opens a game.
export const HomeScreen = defineTaggedUnion({
  Added: {},
  AddOnIos: {},
  AddOnAndroid: {},
  Unavailable: {},
})
export type HomeScreen = typeof HomeScreen.Type

// Where the Stats sheet is: showing the numbers, or asking before it
// clears them.
export const StatsStep = defineTaggedUnion({
  Viewing: {},
  ConfirmingReset: {},
})
export type StatsStep = typeof StatsStep.Type

// What the sheet is showing.
export const Guide = defineTaggedUnion({
  HowToPlay: { page: Schema.Number },
  GetTheApp: {},
  Stats: { step: StatsStep },
})
export type Guide = typeof Guide.Type

// A new version of the app has installed in the background and is waiting
// for the player to switch to it.
export const AppUpdate = defineTaggedUnion({
  None: {},
  Available: {},
  Applying: {},
})
export type AppUpdate = typeof AppUpdate.Type

export const GUIDE_PAGE_COUNT = 3
export const GUIDE_DIALOG_ID = 'guide'

export const Model = Schema.Struct({
  screen: Screen,
  deviceId: Schema.String,
  maybePlayerName: Schema.Option(Schema.String),
  friendGames: Schema.Array(FriendGameRow),
  stats: Stats,
  guide: Guide,
  guideDialog: Dialog.Model,
  homeScreen: HomeScreen,
  appUpdate: AppUpdate,
  turnAlerts: TurnAlerts,
})
export type Model = typeof Model.Type

export const Flags = Schema.Struct({
  deviceId: Schema.String,
  maybePlayerName: Schema.Option(Schema.String),
  savedFriendGames: Schema.Array(SavedFriendGame),
  stats: Stats,
  maybeInviteCode: Schema.Option(Schema.String),
  turnAlerts: TurnAlerts,
  homeScreen: HomeScreen,
})
export type Flags = typeof Flags.Type
