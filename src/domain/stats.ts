import { Array, Option, Schema, pipe } from 'effect'
import { modifyFields } from 'foldkit/struct'

import { type Game, Phase } from './game'

// MODEL

// How one kind of game has gone for the person on this device.
export const Tally = Schema.Struct({
  played: Schema.Number,
  won: Schema.Number,
  lost: Schema.Number,
  tied: Schema.Number,
  endedEarly: Schema.Number,
  currentStreak: Schema.Number,
  bestStreak: Schema.Number,
  maybeFewestRoundsToWin: Schema.Option(Schema.Number),
})
export type Tally = typeof Tally.Type

// The tallies, plus the friend games already counted. A finished friend game
// is shown again every time it's reopened, so each one is counted under its
// key (see friendGameKey) and skipped after that.
export const Stats = Schema.Struct({
  bot: Tally,
  friends: Tally,
  total: Tally,
  countedFriendGames: Schema.Array(Schema.String),
})
export type Stats = typeof Stats.Type

export const Opponent = Schema.Literals(['Bot', 'Friend'])
export type Opponent = typeof Opponent.Type

export const Outcome = Schema.Literals(['Won', 'Lost', 'Tied'])
export type Outcome = typeof Outcome.Type

// Played to the end, or called off between rounds with "I'm done".
export const Ending = Schema.Literals(['Finished', 'EndedEarly'])
export type Ending = typeof Ending.Type

export type GameResult = Readonly<{
  opponent: Opponent
  outcome: Outcome
  ending: Ending
  rounds: number
}>

// Old keys fall off once this many friend games have been counted. A finished
// Room expires after a week, so a game this far back can't be reopened.
export const COUNTED_FRIEND_GAMES_LIMIT = 200

export const emptyTally: Tally = {
  played: 0,
  won: 0,
  lost: 0,
  tied: 0,
  endedEarly: 0,
  currentStreak: 0,
  bestStreak: 0,
  maybeFewestRoundsToWin: Option.none(),
}

export const emptyStats: Stats = {
  bot: emptyTally,
  friends: emptyTally,
  total: emptyTally,
  countedFriendGames: [],
}

export const StatsJson = Schema.fromJsonString(Schema.toCodecJson(Stats))

// QUERIES

export const hasPlayed = (stats: Stats): boolean => stats.total.played > 0

// Wins as a share of games played, from 0 to 1.
export const winRate = (tally: Tally): Option.Option<number> =>
  tally.played > 0 ? Option.some(tally.won / tally.played) : Option.none()

const outcomeFor = (
  maybeWinnerIndex: Option.Option<number>,
  viewer: number,
): Outcome =>
  Option.match(maybeWinnerIndex, {
    onNone: () => 'Tied',
    onSome: winnerIndex => (winnerIndex === viewer ? 'Won' : 'Lost'),
  })

// How a finished game went for the viewer's seat. A game still being played
// has no result.
export const resultOf = (
  game: Game,
  viewer: number,
  opponent: Opponent,
): Option.Option<GameResult> =>
  Phase.matchOrElse(
    game.phase,
    {
      GameOver: ({ winnerIndex }) =>
        Option.some<GameResult>({
          opponent,
          outcome: outcomeFor(Option.some(winnerIndex), viewer),
          ending: 'Finished',
          rounds: game.round,
        }),
      Ended: ({ maybeWinnerIndex }) =>
        Option.some<GameResult>({
          opponent,
          outcome: outcomeFor(maybeWinnerIndex, viewer),
          ending: 'EndedEarly',
          rounds: game.round,
        }),
    },
    () => Option.none(),
  )

export const isFinished = (game: Game): boolean =>
  Option.isSome(resultOf(game, 0, 'Bot'))

// A Room's code names it, and a rematch in the same Room carries the
// sequence on, so the code and the finished Game's sequence name one game.
export const friendGameKey = (code: string, game: Game): string =>
  `${code}:${game.sequence}`

// TRANSITIONS

const fewer = (
  maybeFewest: Option.Option<number>,
  rounds: number,
): Option.Option<number> =>
  Option.some(
    Option.match(maybeFewest, {
      onNone: () => rounds,
      onSome: fewest => Math.min(fewest, rounds),
    }),
  )

// Only a game played to its last card counts toward the fewest rounds: one
// called off early was never won outright.
export const tallyResult = (tally: Tally, result: GameResult): Tally => {
  const isWin = result.outcome === 'Won'
  const currentStreak = isWin ? tally.currentStreak + 1 : 0
  return {
    played: tally.played + 1,
    won: tally.won + (isWin ? 1 : 0),
    lost: tally.lost + (result.outcome === 'Lost' ? 1 : 0),
    tied: tally.tied + (result.outcome === 'Tied' ? 1 : 0),
    endedEarly: tally.endedEarly + (result.ending === 'EndedEarly' ? 1 : 0),
    currentStreak,
    bestStreak: Math.max(tally.bestStreak, currentStreak),
    maybeFewestRoundsToWin:
      isWin && result.ending === 'Finished'
        ? fewer(tally.maybeFewestRoundsToWin, result.rounds)
        : tally.maybeFewestRoundsToWin,
  }
}

export const recordResult = (stats: Stats, result: GameResult): Stats =>
  modifyFields(stats, {
    bot: bot => (result.opponent === 'Bot' ? tallyResult(bot, result) : bot),
    friends: friends =>
      result.opponent === 'Friend' ? tallyResult(friends, result) : friends,
    total: total => tallyResult(total, result),
  })

// Records a bot game the moment it finishes: `before` is the Game as it was,
// `after` as it is now. Any other step returns the same Stats. The person is
// always seat 0 against the bot.
export const recordBotGame = (
  stats: Stats,
  before: Game,
  after: Game,
): Stats =>
  isFinished(before)
    ? stats
    : Option.match(resultOf(after, 0, 'Bot'), {
        onNone: () => stats,
        onSome: result => recordResult(stats, result),
      })

// Records a finished friend game the first time this device sees it, from
// the viewer's seat. Seeing it again (reconnecting, reopening it from the
// menu, reloading) returns the same Stats.
export const recordFriendGame = (
  stats: Stats,
  code: string,
  game: Game,
  viewer: number,
): Stats => {
  const key = friendGameKey(code, game)
  if (Array.contains(stats.countedFriendGames, key)) {
    return stats
  }
  return Option.match(resultOf(game, viewer, 'Friend'), {
    onNone: () => stats,
    onSome: result =>
      modifyFields(recordResult(stats, result), {
        countedFriendGames: counted =>
          pipe(
            Array.prepend(counted, key),
            Array.take(COUNTED_FRIEND_GAMES_LIMIT),
          ),
      }),
  })
}

// Clears the numbers but keeps the friend games already counted, so
// reopening one of them after a reset doesn't count it again.
export const resetStats = (stats: Stats): Stats =>
  modifyFields(emptyStats, {
    countedFriendGames: () => stats.countedFriendGames,
  })
