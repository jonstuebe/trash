import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Card } from './domain/card'

export const Message = defineMessageUnion({
  ClickedOpponentCount: { count: Schema.Number },
  ClickedNewGame: {},
  ClickedHowToPlay: {},
  ClickedGuideNext: {},
  ClickedGuidePage: { page: Schema.Number },
  ClickedCloseGuide: {},
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
})
export type Message = typeof Message.Type
