import { Array, Match, Schema, pipe } from 'effect'

// MODEL

export const Suit = Schema.Literals(['Spades', 'Hearts', 'Diamonds', 'Clubs'])
export type Suit = typeof Suit.Type

export const Card = Schema.Struct({
  id: Schema.Number,
  rank: Schema.Number,
  suit: Suit,
})
export type Card = typeof Card.Type

export const ACE = 1
export const JACK = 11
export const QUEEN = 12
export const KING = 13

const SUITS: ReadonlyArray<Suit> = ['Spades', 'Hearts', 'Diamonds', 'Clubs']
const RANKS_PER_SUIT = 13

// DECK

export const buildDeck = (deckCount: number): ReadonlyArray<Card> =>
  pipe(
    Array.makeBy(deckCount, deckIndex =>
      Array.flatMap(SUITS, (suit, suitIndex) =>
        Array.makeBy(RANKS_PER_SUIT, rankIndex => ({
          id:
            deckIndex * SUITS.length * RANKS_PER_SUIT +
            suitIndex * RANKS_PER_SUIT +
            rankIndex,
          rank: rankIndex + 1,
          suit,
        })),
      ),
    ),
    Array.flatten,
  )

export const deckCountFor = (playerCount: number): number =>
  playerCount <= 2 ? 1 : 2

// RULES

export const isWild = (card: Card): boolean => card.rank === JACK

export const isTrash = (card: Card): boolean =>
  card.rank === QUEEN || card.rank === KING

export const slotIndexForRank = (rank: number): number => rank - 1

// DISPLAY

export const rankLabel = (rank: number): string =>
  Match.value(rank).pipe(
    Match.withReturnType<string>(),
    Match.when(ACE, () => 'A'),
    Match.when(JACK, () => 'J'),
    Match.when(QUEEN, () => 'Q'),
    Match.when(KING, () => 'K'),
    Match.orElse(value => `${value}`),
  )

export const slotLabel = (slotIndex: number): string => rankLabel(slotIndex + 1)

export const isRed = (suit: Suit): boolean =>
  suit === 'Hearts' || suit === 'Diamonds'

export const cardName = (card: Card): string =>
  `${rankLabel(card.rank)} of ${card.suit.toLowerCase()}`
