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
  ClickedInvite: {},
  CompletedShareInvite: { outcome: ShareOutcome },
  FoundAppUpdate: {},
  ClickedUpdateApp: {},
  ClickedDismissAppUpdate: {},
  CompletedApplyAppUpdate: {},
})
export type Message = typeof Message.Type
