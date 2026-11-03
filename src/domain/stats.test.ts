import { Array, Option, Schema } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { type Game, Phase, newBotGame, newFriendGame } from './game'
import {
  COUNTED_FRIEND_GAMES_LIMIT,
  type GameResult,
  StatsJson,
  emptyStats,
  emptyTally,
  hasPlayed,
  recordBotGame,
  recordFriendGame,
  recordResult,
  resetStats,
  resultOf,
  winRate,
} from './stats'

const finished = (game: Game, phase: Phase, round = 3, sequence = 40): Game =>
  modifyFields(game, {
    phase: () => phase,
    round: () => round,
    sequence: () => sequence,
  })

const won = (rounds = 4): GameResult => ({
  opponent: 'Bot',
  outcome: 'Won',
  ending: 'Finished',
  rounds,
})

const lost: GameResult = {
  opponent: 'Bot',
  outcome: 'Lost',
  ending: 'Finished',
  rounds: 5,
}

describe('resultOf', () => {
  test('a game still being played has no result', () => {
    expect(Option.isNone(resultOf(newBotGame(), 0, 'Bot'))).toBe(true)
  })

  test('a finished game is read from the viewer seat', () => {
    const game = finished(newFriendGame(), Phase.GameOver({ winnerIndex: 1 }))
    expect(resultOf(game, 1, 'Friend')).toEqual(
      Option.some({
        opponent: 'Friend',
        outcome: 'Won',
        ending: 'Finished',
        rounds: 3,
      }),
    )
    expect(
      Option.map(resultOf(game, 0, 'Friend'), result => result.outcome),
    ).toEqual(Option.some('Lost'))
  })

  test('an ended game counts by its winner, or as a tie without one', () => {
    const ended = (maybeWinnerIndex: Option.Option<number>) =>
      finished(newBotGame(), Phase.Ended({ enderIndex: 0, maybeWinnerIndex }))

    expect(resultOf(ended(Option.some(0)), 0, 'Bot')).toEqual(
      Option.some({
        opponent: 'Bot',
        outcome: 'Won',
        ending: 'EndedEarly',
        rounds: 3,
      }),
    )
    expect(
      Option.map(
        resultOf(ended(Option.none()), 0, 'Bot'),
        result => result.outcome,
      ),
    ).toEqual(Option.some('Tied'))
  })
})

describe('recordResult', () => {
  test('counts the game under its opponent and in the total', () => {
    const stats = recordResult(emptyStats, won())
    expect(stats.bot.played).toBe(1)
    expect(stats.bot.won).toBe(1)
    expect(stats.total.won).toBe(1)
    expect(stats.friends).toEqual(emptyTally)
  })

  test('a win extends the streak and a loss or tie ends it', () => {
    const stats = Array.reduce(
      [won(), won(), won(), lost, won()],
      emptyStats,
      recordResult,
    )
    expect(stats.bot.currentStreak).toBe(1)
    expect(stats.bot.bestStreak).toBe(3)

    const tied = recordResult(stats, {
      ...won(),
      outcome: 'Tied',
      ending: 'EndedEarly',
    })
    expect(tied.bot.currentStreak).toBe(0)
    expect(tied.bot.tied).toBe(1)
    expect(tied.bot.endedEarly).toBe(1)
  })

  test('keeps the fewest rounds of a game won outright', () => {
    const stats = Array.reduce(
      [won(7), won(5), won(6), lost, { ...won(2), ending: 'EndedEarly' }],
      emptyStats,
      (current, result: GameResult) => recordResult(current, result),
    )
    expect(stats.bot.maybeFewestRoundsToWin).toEqual(Option.some(5))
  })

  test('win rate is wins over games played', () => {
    expect(winRate(emptyTally)).toEqual(Option.none())
    const stats = Array.reduce(
      [won(), lost, lost, won()],
      emptyStats,
      recordResult,
    )
    expect(winRate(stats.bot)).toEqual(Option.some(0.5))
  })
})

describe('recordBotGame', () => {
  const playing = newBotGame()
  const over = finished(playing, Phase.GameOver({ winnerIndex: 0 }))

  test('counts the step that finishes the game', () => {
    const stats = recordBotGame(emptyStats, playing, over)
    expect(stats.bot.won).toBe(1)
  })

  test('ignores steps that leave a finished game finished, or unfinished', () => {
    expect(recordBotGame(emptyStats, over, over)).toBe(emptyStats)
    expect(recordBotGame(emptyStats, playing, playing)).toBe(emptyStats)
  })
})

describe('recordFriendGame', () => {
  const over = finished(newFriendGame(), Phase.GameOver({ winnerIndex: 1 }))

  test('counts a finished game once, however often it is seen', () => {
    const once = recordFriendGame(emptyStats, 'K7QXMP', over, 1)
    expect(once.friends.won).toBe(1)
    expect(recordFriendGame(once, 'K7QXMP', over, 1)).toBe(once)
  })

  test('ignores a game still being played', () => {
    expect(recordFriendGame(emptyStats, 'K7QXMP', newFriendGame(), 0)).toBe(
      emptyStats,
    )
  })

  test('a rematch in the same room is a new game', () => {
    const once = recordFriendGame(emptyStats, 'K7QXMP', over, 0)
    const rematch = finished(
      newFriendGame(),
      Phase.GameOver({ winnerIndex: 0 }),
      2,
      over.sequence + 30,
    )
    const twice = recordFriendGame(once, 'K7QXMP', rematch, 0)
    expect(twice.friends.played).toBe(2)
    expect(twice.friends.won).toBe(1)
    expect(twice.friends.lost).toBe(1)
  })

  test('keeps a bounded list of counted games', () => {
    const stats = Array.reduce(
      Array.makeBy(COUNTED_FRIEND_GAMES_LIMIT + 5, index => `ROOM${index}`),
      emptyStats,
      (current, code) => recordFriendGame(current, code, over, 0),
    )
    expect(stats.countedFriendGames.length).toBe(COUNTED_FRIEND_GAMES_LIMIT)
    expect(stats.friends.played).toBe(COUNTED_FRIEND_GAMES_LIMIT + 5)
  })
})

describe('resetStats', () => {
  test('clears the numbers but still skips games already counted', () => {
    const over = finished(newFriendGame(), Phase.GameOver({ winnerIndex: 0 }))
    const reset = resetStats(recordFriendGame(emptyStats, 'K7QXMP', over, 0))
    expect(hasPlayed(reset)).toBe(false)
    expect(recordFriendGame(reset, 'K7QXMP', over, 0)).toBe(reset)
  })
})

describe('StatsJson', () => {
  test('round-trips stats', () => {
    const stats = recordResult(emptyStats, won())
    const json = Schema.encodeSync(StatsJson)(stats)
    expect(Schema.decodeSync(StatsJson)(json)).toEqual(stats)
  })

  test('rejects a value that is not stats', () => {
    expect(() => Schema.decodeSync(StatsJson)('{"bot":1}')).toThrow()
    expect(() => Schema.decodeSync(StatsJson)('not json')).toThrow()
  })
})
