import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Dialog } from '@foldkit/ui'

import { Game } from './domain/game'
import { GameSummary, Intent, Refusal } from './domain/room'

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
  Copied: {},
  Failed: {},
})
export type Invite = typeof Invite.Type

export const Screen = defineTaggedUnion({
  Title: {},
  Naming: { draft: Schema.String, next: AfterNaming },
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
  guidePage: Schema.Number,
  guideDialog: Dialog.Model,
  appUpdate: AppUpdate,
  turnAlerts: TurnAlerts,
})
export type Model = typeof Model.Type

export const Flags = Schema.Struct({
  deviceId: Schema.String,
  maybePlayerName: Schema.Option(Schema.String),
  savedFriendGames: Schema.Array(SavedFriendGame),
  maybeInviteCode: Schema.Option(Schema.String),
  turnAlerts: TurnAlerts,
})
export type Flags = typeof Flags.Type
