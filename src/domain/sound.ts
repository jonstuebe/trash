import { Array, Option, Schema } from 'effect'

import {
  type Game,
  LastAction,
  Phase,
  type Player,
  isComplete,
  revealedCount,
} from './game'

// Which sound a Game transition makes, as one device hears it. Sounds are
// only for what happens on the table: a draw, a placed card, a Jack swapped
// out, a trashed card, a finish, and how the round or game ends.

export const Sound = Schema.Literals([
  'Draw',
  'Place',
  'Swap',
  'Trash',
  'Finish',
  'RoundOver',
  'Win',
  'Lose',
  'Tie',
])
export type Sound = typeof Sound.Type

// A friend game's Room settles a Move before sending it (a draw that
// empties the stock reshuffles too, a new round is dealt at once), so one
// Move can move the sequence by two. A bigger gap means this device missed
// moves, and a sound for them would be noise.
const MAX_SEQUENCE_STEP = 2

const isOneMove = (before: Game, after: Game): boolean =>
  after.sequence > before.sequence &&
  after.sequence - before.sequence <= MAX_SEQUENCE_STEP

const playerAt = (game: Game, index: number): Option.Option<Player> =>
  Array.get(game.players, index)

const revealedOf = (game: Game, index: number): number =>
  Option.match(playerAt(game, index), {
    onNone: () => 0,
    onSome: revealedCount,
  })

const justCompleted = (before: Game, after: Game, index: number): boolean =>
  Option.exists(playerAt(before, index), player => !isComplete(player)) &&
  Option.exists(playerAt(after, index), isComplete)

const outcomeSound = (
  maybeWinnerIndex: Option.Option<number>,
  viewer: number,
): Sound =>
  Option.match(maybeWinnerIndex, {
    onNone: () => 'Tie',
    onSome: winnerIndex => (winnerIndex === viewer ? 'Win' : 'Lose'),
  })

// What the player whose turn it was did, when the round goes on.
const turnSound = (
  before: Game,
  after: Game,
  viewer: number,
): Option.Option<Sound> => {
  const actorIndex = before.currentIndex
  if (Phase.guards.Holding(after.phase)) {
    if (after.phase.from !== 'Slot') {
      return Option.some('Draw')
    }
    // NOTE: a Jack swapped out leaves as many cards face up as before; a
    // card placed on a face-down slot turns one more up.
    const isSwap =
      revealedOf(before, actorIndex) === revealedOf(after, actorIndex)
    return Option.some(isSwap ? 'Swap' : 'Place')
  }
  if (!Phase.guards.Holding(before.phase)) {
    return Option.none()
  }
  return Option.flatMap(playerAt(after, actorIndex), player =>
    LastAction.matchOrElse(
      player.lastAction,
      {
        Trashed: () => Option.some<Sound>('Trash'),
        Finished: () =>
          Option.some<Sound>(actorIndex === viewer ? 'Finish' : 'Place'),
      },
      () => Option.none(),
    ),
  )
}

export const soundFor = (
  before: Game,
  after: Game,
  viewer: number,
): Option.Option<Sound> => {
  if (!isOneMove(before, after)) {
    return Option.none()
  }
  if (Phase.guards.GameOver(before.phase) || Phase.guards.Ended(before.phase)) {
    return Option.none()
  }
  return Phase.matchOrElse(
    after.phase,
    {
      GameOver: ({ winnerIndex }) =>
        Option.some(outcomeSound(Option.some(winnerIndex), viewer)),
      Ended: ({ maybeWinnerIndex }) =>
        Option.some(outcomeSound(maybeWinnerIndex, viewer)),
      RoundOver: () =>
        Option.some<Sound>(
          justCompleted(before, after, viewer) ? 'Finish' : 'RoundOver',
        ),
    },
    () => turnSound(before, after, viewer),
  )
}
