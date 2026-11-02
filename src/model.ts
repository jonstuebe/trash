import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Dialog } from '@foldkit/ui'

import { Game } from './domain/game'

export const Screen = defineTaggedUnion({
  Title: {},
  Table: { game: Game },
})
export type Screen = typeof Screen.Type

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
  opponentCount: Schema.Number,
  guidePage: Schema.Number,
  guideDialog: Dialog.Model,
  appUpdate: AppUpdate,
})
export type Model = typeof Model.Type
