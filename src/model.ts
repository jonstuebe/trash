import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { Game } from './domain/game'

export const Screen = defineTaggedUnion({
  Title: {},
  Table: { game: Game },
})
export type Screen = typeof Screen.Type

export const Guide = defineTaggedUnion({
  Closed: {},
  Open: { page: Schema.Number },
})
export type Guide = typeof Guide.Type

export const GUIDE_PAGE_COUNT = 3

export const Model = Schema.Struct({
  screen: Screen,
  opponentCount: Schema.Number,
  guide: Guide,
})
export type Model = typeof Model.Type
