import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Dialog } from '@foldkit/ui'

import { Card } from './domain/card'
import { Reaction } from './domain/reaction'
import { GameSummary, ServerMessage } from './domain/room'

export const ShareOutcome = Schema.Literals([
  'Shared',
  'Copied',
  'Cancelled',
  'Failed',
])
export type ShareOutcome = typeof ShareOutcome.Type

// What the share sheet sends: the invite link, or just the code for a friend
// who will type it into their Home Screen app.
export const InviteKind = Schema.Literals(['Link', 'Code'])
export type InviteKind = typeof InviteKind.Type

export const CancelOutcome = Schema.Literals(['Cancelled', 'Joined', 'Failed'])
export type CancelOutcome = typeof CancelOutcome.Type

export const AlertsOutcome = Schema.Literals(['On', 'Off', 'Blocked', 'Failed'])
export type AlertsOutcome = typeof AlertsOutcome.Type

export const AlertsPermission = Schema.Literals([
  'granted',
  'denied',
  'default',
])
export type AlertsPermission = typeof AlertsPermission.Type

export const Message = defineMessageUnion({
  ClickedPlayBot: {},
  ClickedPlayFriend: {},
  ClickedJoinWithCode: {},
  UpdatedJoinCodeDraft: { value: Schema.String },
  SubmittedJoinCode: {},
  ClickedCancelJoining: {},
  ClickedGetTheApp: {},
  ClickedResumeFriendGame: { code: Schema.String },
  ClickedRemoveFriendGame: { code: Schema.String },
  ClickedChangeName: {},
  UpdatedNameDraft: { value: Schema.String },
  SubmittedName: {},
  ClickedCancelNaming: {},
  CompletedSavePlayerName: {},
  CompletedFetchGameSummary: {
    code: Schema.String,
    maybeSummary: Schema.Option(GameSummary),
  },
  ClickedHowToPlay: {},
  ClickedStats: {},
  ClickedResetStats: {},
  ClickedConfirmResetStats: {},
  ClickedCancelResetStats: {},
  CompletedSaveStats: {},
  ClickedGuideNext: {},
  ClickedGuidePage: { page: Schema.Number },
  GotGuideDialogMessage: { message: Dialog.Message },
  SwipedDownGuide: {},
  ClickedToggleSound: {},
  CompletedSaveSound: {},
  UnlockedSound: {},
  CompletedPlaySound: {},
  CompletedShuffleDeck: { sequence: Schema.Number, deck: Schema.Array(Card) },
  ClickedStock: {},
  ClickedDiscardPile: {},
  ClickedSlot: { slotIndex: Schema.Number },
  ClickedTrash: {},
  CompletedWaitBeforeBotStep: { sequence: Schema.Number },
  CompletedReshuffleDiscard: {
    sequence: Schema.Number,
    stock: Schema.Array(Card),
  },
  ClickedNextRound: {},
  ClickedEndGame: {},
  ClickedPlayAgain: {},
  ClickedLeaveTable: {},
  CompletedGenerateRoomCode: { code: Schema.String },
  CompletedSaveFriendGames: {},
  CompletedShowUrl: {},
  ConnectedRoomSocket: {},
  FailedConnectRoomSocket: {},
  ReleasedRoomSocket: {},
  DisconnectedRoomSocket: {},
  ReceivedServerMessage: { message: ServerMessage },
  SucceededSendMove: {},
  FailedSendMove: {},
  ClickedReconnect: {},
  ReturnedToApp: {},
  LeftApp: {},
  ClickedReact: {},
  ClickedOutsideReactions: {},
  PressedEscapeOnReactions: {},
  SelectedReaction: { reaction: Reaction },
  SucceededSendReaction: {},
  FailedSendReaction: {},
  CompletedWaitBeforeHideReaction: { id: Schema.Number },
  FinishedConfetti: {},
  ClickedInvite: {},
  ClickedShareCode: {},
  CompletedShareInvite: { kind: InviteKind, outcome: ShareOutcome },
  ClickedCancelInvite: {},
  CompletedCancelInvite: { code: Schema.String, outcome: CancelOutcome },
  ClickedTurnOnAlerts: {},
  AnsweredAlertsPrompt: { permission: AlertsPermission },
  CompletedRegisterAlerts: { outcome: AlertsOutcome },
  FoundAppUpdate: {},
  ClickedUpdateApp: {},
  ClickedDismissAppUpdate: {},
  CompletedApplyAppUpdate: {},
})
export type Message = typeof Message.Type
