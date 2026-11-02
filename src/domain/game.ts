import { Array, Option, Result, Schema, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'

import { Card, isTrash, isWild, slotIndexForRank } from './card'

// MODEL

export const Slot = defineTaggedUnion({
  Hidden: { card: Card },
  Revealed: { card: Card },
})
export type Slot = typeof Slot.Type

export const Seat = Schema.Literals(['Human', 'Bot'])
export type Seat = typeof Seat.Type

export const LastAction = defineTaggedUnion({
  Idle: {},
  Drew: {},
  TookDiscard: { card: Card },
  Trashed: { card: Card },
  Finished: {},
})
export type LastAction = typeof LastAction.Type

export const Player = Schema.Struct({
  name: Schema.String,
  avatar: Schema.String,
  accent: Schema.String,
  seat: Seat,
  target: Schema.Number,
  slots: Schema.Array(Slot),
  lastAction: LastAction,
})
export type Player = typeof Player.Type

export const HeldFrom = Schema.Literals(['Stock', 'Discard', 'Slot'])
export type HeldFrom = typeof HeldFrom.Type

export const Phase = defineTaggedUnion({
  Shuffling: {},
  AwaitingDraw: {},
  Holding: { card: Card, from: HeldFrom },
  Reshuffling: {},
  RoundOver: { finisherIndexes: Schema.Array(Schema.Number) },
  GameOver: { winnerIndex: Schema.Number },
  // A player called the game off between rounds. Whoever had fewer cards to
  // play next wins; an even count is a tie.
  Ended: {
    enderIndex: Schema.Number,
    maybeWinnerIndex: Schema.Option(Schema.Number),
  },
})
export type Phase = typeof Phase.Type

export const Game = Schema.Struct({
  round: Schema.Number,
  players: Schema.Array(Player),
  stock: Schema.Array(Card),
  discard: Schema.Array(Card),
  currentIndex: Schema.Number,
  maybeCloserIndex: Schema.Option(Schema.Number),
  phase: Phase,
  sequence: Schema.Number,
})
export type Game = typeof Game.Type

// ROSTER

export const STARTING_TARGET = 10

type Persona = Readonly<{ name: string; avatar: string; accent: string }>

const YOU: Persona = { name: 'You', avatar: '😎', accent: '#0A84FF' }

const BOT: Persona = { name: 'Mira', avatar: '🦊', accent: '#FF9F0A' }

// A friend game seats the host first. Every device shows its own seat as
// "You", so these names are only ever shown for the other player.
const HOST: Persona = { name: 'Friend', avatar: '😎', accent: '#0A84FF' }

const GUEST: Persona = { name: 'Friend', avatar: '🦊', accent: '#FF9F0A' }

const makePlayer = (persona: Persona, seat: Seat): Player => ({
  ...persona,
  seat,
  target: STARTING_TARGET,
  slots: [],
  lastAction: LastAction.Idle(),
})

const newGameWith = (players: ReadonlyArray<Player>): Game => ({
  round: 1,
  players,
  stock: [],
  discard: [],
  currentIndex: 0,
  maybeCloserIndex: Option.none(),
  phase: Phase.Shuffling(),
  sequence: 0,
})

export const newBotGame = (): Game =>
  newGameWith([makePlayer(YOU, 'Human'), makePlayer(BOT, 'Bot')])

export const newFriendGame = (): Game =>
  newGameWith([makePlayer(HOST, 'Human'), makePlayer(GUEST, 'Human')])

// QUERIES

const replaceAt = <A>(
  items: ReadonlyArray<A>,
  index: number,
  f: (item: A) => A,
): ReadonlyArray<A> =>
  Array.map(items, (item, itemIndex) => (itemIndex === index ? f(item) : item))

export const currentPlayer = (game: Game): Player =>
  Array.getUnsafe(game.players, game.currentIndex)

export const slotCard = (slot: Slot): Card => slot.card

export const isComplete = (player: Player): boolean =>
  Array.isReadonlyArrayNonEmpty(player.slots) &&
  Array.every(player.slots, Slot.guards.Revealed)

export const revealedCount = (player: Player): number =>
  Array.filter(player.slots, Slot.guards.Revealed).length

export const playableSlotIndexes = (
  player: Player,
  card: Card,
): ReadonlyArray<number> => {
  if (isTrash(card)) {
    return []
  }

  if (isWild(card)) {
    return Array.filterMap(player.slots, (slot, slotIndex) =>
      Slot.guards.Hidden(slot) ? Result.succeed(slotIndex) : Result.failVoid,
    )
  }

  const slotIndex = slotIndexForRank(card.rank)

  return pipe(
    Array.get(player.slots, slotIndex),
    Option.filter(
      slot =>
        Slot.guards.Hidden(slot) ||
        (Slot.guards.Revealed(slot) && isWild(slot.card)),
    ),
    Option.match({
      onNone: () => [],
      onSome: () => [slotIndex],
    }),
  )
}

export const topDiscard = (game: Game): Option.Option<Card> =>
  Array.last(game.discard)

export const canTakeDiscard = (game: Game): boolean =>
  Phase.guards.AwaitingDraw(game.phase) &&
  pipe(
    topDiscard(game),
    Option.exists(card =>
      Array.isReadonlyArrayNonEmpty(
        playableSlotIndexes(currentPlayer(game), card),
      ),
    ),
  )

export const isHumanTurn = (game: Game): boolean =>
  currentPlayer(game).seat === 'Human'

// The viewer is the seat this device plays. A bot game always seats the
// person at 0; a friend game seats the host at 0 and the guest at 1.
export const isViewerTurn = (game: Game, viewer: number): boolean =>
  game.currentIndex === viewer && currentPlayer(game).seat === 'Human'

// HIDDEN CARDS

const UNKNOWN_CARD: Card = { id: -1, rank: 0, suit: 'Spades' }

// What a player may see: face-down cards and the draw pile become blanks. The
// rules only look at whether a slot is face down, never at what's under it,
// so a redacted Game still answers every query the view asks.
export const redact = (game: Game): Game =>
  modifyFields(game, {
    players: players =>
      Array.map(players, player =>
        modifyFields(player, {
          slots: slots =>
            Array.map(slots, slot =>
              Slot.guards.Hidden(slot)
                ? Slot.Hidden({ card: UNKNOWN_CARD })
                : slot,
            ),
        }),
      ),
    stock: stock => Array.map(stock, () => UNKNOWN_CARD),
  })

// TRANSITIONS

const bumpSequence = (game: Game): Game =>
  modifyFields(game, { sequence: sequence => sequence + 1 })

const setCurrentAction = (game: Game, lastAction: LastAction): Game =>
  modifyFields(game, {
    players: players =>
      replaceAt(players, game.currentIndex, player =>
        modifyFields(player, { lastAction: () => lastAction }),
      ),
  })

export const deal = (game: Game, deck: ReadonlyArray<Card>): Game => {
  const dealt = Array.reduce(
    game.players,
    { players: Array.empty<Player>(), remaining: deck },
    (accumulator, player) => {
      const [hand, remaining] = Array.splitAt(
        accumulator.remaining,
        player.target,
      )
      return {
        players: Array.append(
          accumulator.players,
          modifyFields(player, {
            slots: () => Array.map(hand, card => Slot.Hidden({ card })),
            lastAction: () => LastAction.Idle(),
          }),
        ),
        remaining,
      }
    },
  )

  const [discard, stock] = Array.splitAt(dealt.remaining, 1)

  return bumpSequence(
    modifyFields(game, {
      players: () => dealt.players,
      stock: () => stock,
      discard: () => discard,
      phase: () => Phase.AwaitingDraw(),
    }),
  )
}

export const drawFromStock = (game: Game): Game => {
  if (!Phase.guards.AwaitingDraw(game.phase)) {
    return game
  }

  return pipe(
    Array.last(game.stock),
    Option.match({
      onNone: () =>
        bumpSequence(modifyFields(game, { phase: () => Phase.Reshuffling() })),
      onSome: card =>
        bumpSequence(
          setCurrentAction(
            modifyFields(game, {
              stock: stock => Array.dropRight(stock, 1),
              phase: () => Phase.Holding({ card, from: 'Stock' }),
            }),
            LastAction.Drew(),
          ),
        ),
    }),
  )
}

export const takeDiscard = (game: Game): Game => {
  if (!canTakeDiscard(game)) {
    return game
  }

  return pipe(
    topDiscard(game),
    Option.match({
      onNone: () => game,
      onSome: card =>
        bumpSequence(
          setCurrentAction(
            modifyFields(game, {
              discard: discard => Array.dropRight(discard, 1),
              phase: () => Phase.Holding({ card, from: 'Discard' }),
            }),
            LastAction.TookDiscard({ card }),
          ),
        ),
    }),
  )
}

export const cardsToReshuffle = (game: Game): ReadonlyArray<Card> =>
  Array.dropRight(game.discard, 1)

export const completeReshuffle = (
  game: Game,
  stock: ReadonlyArray<Card>,
): Game => {
  if (!Phase.guards.Reshuffling(game.phase)) {
    return game
  }

  return drawFromStock(
    modifyFields(game, {
      stock: () => stock,
      discard: discard => Array.takeRight(discard, 1),
      phase: () => Phase.AwaitingDraw(),
    }),
  )
}

const endRound = (game: Game): Game => {
  const finisherIndexes = Array.filterMap(game.players, (player, index) =>
    isComplete(player) ? Result.succeed(index) : Result.failVoid,
  )

  const lastCardFinisherIndexes = Array.filter(
    finisherIndexes,
    index => Array.getUnsafe(game.players, index).target === 1,
  )

  const maybeWinnerIndex = pipe(
    game.maybeCloserIndex,
    Option.filter(closerIndex =>
      Array.contains(lastCardFinisherIndexes, closerIndex),
    ),
    Option.orElse(() => Array.head(lastCardFinisherIndexes)),
  )

  return bumpSequence(
    modifyFields(game, {
      phase: () =>
        Option.match(maybeWinnerIndex, {
          onNone: () => Phase.RoundOver({ finisherIndexes }),
          onSome: winnerIndex => Phase.GameOver({ winnerIndex }),
        }),
    }),
  )
}

const endTurn = (game: Game): Game => {
  const nextIndex = (game.currentIndex + 1) % game.players.length
  const isRoundClosing = Option.exists(
    game.maybeCloserIndex,
    closerIndex => closerIndex === nextIndex,
  )

  if (isRoundClosing) {
    return endRound(game)
  }

  return bumpSequence(
    modifyFields(game, {
      currentIndex: () => nextIndex,
      phase: () => Phase.AwaitingDraw(),
    }),
  )
}

const discardAndEndTurn = (game: Game, card: Card): Game =>
  endTurn(
    modifyFields(game, { discard: discard => Array.append(discard, card) }),
  )

export const placeHeld = (game: Game, slotIndex: number): Game => {
  if (!Phase.guards.Holding(game.phase)) {
    return game
  }

  const held = game.phase.card
  const player = currentPlayer(game)

  if (!Array.contains(playableSlotIndexes(player, held), slotIndex)) {
    return game
  }

  const displaced = slotCard(Array.getUnsafe(player.slots, slotIndex))

  const placed = modifyFields(game, {
    players: players =>
      replaceAt(players, game.currentIndex, current =>
        modifyFields(current, {
          slots: slots =>
            replaceAt(slots, slotIndex, () => Slot.Revealed({ card: held })),
        }),
      ),
  })

  if (isComplete(currentPlayer(placed))) {
    const closed = modifyFields(placed, {
      maybeCloserIndex: maybeCloserIndex =>
        Option.orElse(maybeCloserIndex, () => Option.some(game.currentIndex)),
    })
    return discardAndEndTurn(
      setCurrentAction(closed, LastAction.Finished()),
      displaced,
    )
  }

  return bumpSequence(
    modifyFields(placed, {
      phase: () => Phase.Holding({ card: displaced, from: 'Slot' }),
    }),
  )
}

export const trashHeld = (game: Game): Game => {
  if (!Phase.guards.Holding(game.phase)) {
    return game
  }

  const held = game.phase.card

  if (
    Array.isReadonlyArrayNonEmpty(
      playableSlotIndexes(currentPlayer(game), held),
    )
  ) {
    return game
  }

  return discardAndEndTurn(
    setCurrentAction(game, LastAction.Trashed({ card: held })),
    held,
  )
}

export const nextRound = (game: Game): Game => {
  if (!Phase.guards.RoundOver(game.phase)) {
    return game
  }

  const finisherIndexes = game.phase.finisherIndexes
  const round = game.round + 1

  return bumpSequence(
    modifyFields(game, {
      round: () => round,
      players: players =>
        Array.map(players, (player, index) =>
          modifyFields(player, {
            target: target =>
              Array.contains(finisherIndexes, index) ? target - 1 : target,
            slots: () => [],
            lastAction: () => LastAction.Idle(),
          }),
        ),
      stock: () => [],
      discard: () => [],
      currentIndex: () => (round - 1) % game.players.length,
      maybeCloserIndex: () => Option.none(),
      phase: () => Phase.Shuffling(),
    }),
  )
}

// Ends the game between rounds instead of dealing the next one. Each target
// becomes what that player would have played next round, so the standings
// stay on the table.
export const endGame = (game: Game, enderIndex: number): Game => {
  if (!Phase.guards.RoundOver(game.phase)) {
    return game
  }

  const finisherIndexes = game.phase.finisherIndexes
  const players = Array.map(game.players, (player, index) =>
    modifyFields(player, {
      target: target =>
        Array.contains(finisherIndexes, index) ? target - 1 : target,
    }),
  )
  const fewest = Math.min(...Array.map(players, player => player.target))
  const leaderIndexes = Array.filterMap(players, (player, index) =>
    player.target === fewest ? Result.succeed(index) : Result.failVoid,
  )

  return bumpSequence(
    modifyFields(game, {
      players: () => players,
      phase: () =>
        Phase.Ended({
          enderIndex,
          maybeWinnerIndex:
            leaderIndexes.length === 1
              ? Array.head(leaderIndexes)
              : Option.none(),
        }),
    }),
  )
}

// BOT

export const botStep = (game: Game): Game =>
  Phase.matchOrElse(
    game.phase,
    {
      AwaitingDraw: () =>
        canTakeDiscard(game) ? takeDiscard(game) : drawFromStock(game),
      Holding: ({ card }) =>
        pipe(
          playableSlotIndexes(currentPlayer(game), card),
          Array.head,
          Option.match({
            onNone: () => trashHeld(game),
            onSome: slotIndex => placeHeld(game, slotIndex),
          }),
        ),
    },
    () => game,
  )

export const isBotActing = (game: Game): boolean =>
  !isHumanTurn(game) &&
  (Phase.guards.AwaitingDraw(game.phase) || Phase.guards.Holding(game.phase))

export const botDelayMs = (game: Game): number =>
  Phase.guards.Holding(game.phase) ? 620 : 760
