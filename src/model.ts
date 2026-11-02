import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Dialog } from '@foldkit/ui'

import { Game } from './domain/game'
import { Intent, Refusal } from './domain/room'

// A friend game this device has a seat in, remembered so the app can reopen
// it from the menu hours later.
export const SavedFriendGame = Schema.Struct({
  code: Schema.String,
  intent: Intent,
})
export type SavedFriendGame = typeof SavedFriendGame.Type

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
  maybeSavedFriendGame: Schema.Option(SavedFriendGame),
  guidePage: Schema.Number,
  guideDialog: Dialog.Model,
  appUpdate: AppUpdate,
  turnAlerts: TurnAlerts,
})
export type Model = typeof Model.Type

export const Flags = Schema.Struct({
  deviceId: Schema.String,
  maybeSavedFriendGame: Schema.Option(SavedFriendGame),
  maybeInviteCode: Schema.Option(Schema.String),
  turnAlerts: TurnAlerts,
})
export type Flags = typeof Flags.Type
