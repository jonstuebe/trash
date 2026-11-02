import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Dialog } from '@foldkit/ui'

import { Card } from './domain/card'
import { ServerMessage } from './domain/room'

export const ShareOutcome = Schema.Literals([
  'Shared',
  'Copied',
  'Cancelled',
  'Failed',
])
export type ShareOutcome = typeof ShareOutcome.Type

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
  ClickedResumeFriendGame: {},
  ClickedHowToPlay: {},
  ClickedGuideNext: {},
  ClickedGuidePage: { page: Schema.Number },
  GotGuideDialogMessage: { message: Dialog.Message },
  SwipedDownGuide: {},
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
  ClickedPlayAgain: {},
  ClickedLeaveTable: {},
  CompletedGenerateRoomCode: { code: Schema.String },
  CompletedSaveFriendGame: {},
  CompletedForgetFriendGame: {},
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
  ClickedInvite: {},
  CompletedShareInvite: { outcome: ShareOutcome },
  ClickedTurnOnAlerts: {},
  AnsweredAlertsPrompt: { permission: AlertsPermission },
  CompletedRegisterAlerts: { outcome: AlertsOutcome },
  FoundAppUpdate: {},
  ClickedUpdateApp: {},
  ClickedDismissAppUpdate: {},
  CompletedApplyAppUpdate: {},
})
export type Message = typeof Message.Type
