import { Effect, Layer, Option, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { KeyValueStore } from 'effect/persistence'

import { BrowserCrypto, BrowserKeyValueStore } from '@effect/platform-browser'

import { roomCodeFromPath } from './domain/room'
import { type Stats, StatsJson, emptyStats } from './domain/stats'
import { type Flags, SavedFriendGame, SoundSetting } from './model'
import { homeScreenAtStart, turnAlertsAtStart } from './turnAlerts'

// What this device remembers between visits: its own ID, which the Room uses
// to give it back its seat, the player's name, and the friend games it has a
// seat in.

const DEVICE_ID_KEY = 'trash.deviceId'
const PLAYER_NAME_KEY = 'trash.playerName'
const SOUND_KEY = 'trash.sound'
const FRIEND_GAMES_KEY = 'trash.friendGames'
// NOTE: before the game list, a device remembered one game under this key.
// It's read once, moved into the list, and removed.
const LEGACY_FRIEND_GAME_KEY = 'trash.friendGame'
const STATS_KEY = 'trash.stats'

const SavedFriendGameJson = Schema.fromJsonString(
  Schema.toCodecJson(SavedFriendGame),
)

const SavedFriendGamesJson = Schema.fromJsonString(
  Schema.toCodecJson(Schema.Array(SavedFriendGame)),
)

const readOrCreateDeviceId = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const maybeStored = Option.fromNullishOr(yield* store.get(DEVICE_ID_KEY))
  if (Option.isSome(maybeStored)) {
    return maybeStored.value
  }
  const random = yield* SecureRandom.SecureRandom
  const deviceId = yield* random.uuidV4()
  yield* store.set(DEVICE_ID_KEY, deviceId)
  return deviceId
})

const readPlayerName = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  return Option.fromNullishOr(yield* store.get(PLAYER_NAME_KEY))
})

// Sound stays off unless this device turned it on.
const readSound = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  return (yield* store.get(SOUND_KEY)) === 'On'
    ? SoundSetting.On()
    : SoundSetting.Off()
})

const readLegacyFriendGame = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const json = yield* Effect.fromOption(
    Option.fromNullishOr(yield* store.get(LEGACY_FRIEND_GAME_KEY)),
  )
  return yield* Schema.decodeEffect(SavedFriendGameJson)(json)
}).pipe(Effect.option)

const writeFriendGames = (games: ReadonlyArray<SavedFriendGame>) =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    const json = yield* Schema.encodeEffect(SavedFriendGamesJson)(games)
    yield* store.set(FRIEND_GAMES_KEY, json)
  })

const readFriendGames = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const maybeJson = Option.fromNullishOr(yield* store.get(FRIEND_GAMES_KEY))
  if (Option.isSome(maybeJson)) {
    return yield* Schema.decodeEffect(SavedFriendGamesJson)(
      maybeJson.value,
    ).pipe(Effect.orElseSucceed(() => []))
  }
  const games = Option.toArray(yield* readLegacyFriendGame)
  yield* writeFriendGames(games)
  yield* store.remove(LEGACY_FRIEND_GAME_KEY)
  return games
})

// A missing, corrupt or outdated value reads as no games played yet.
const readStats = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const json = yield* Effect.fromOption(
    Option.fromNullishOr(yield* store.get(STATS_KEY)),
  )
  return yield* Schema.decodeEffect(StatsJson)(json)
}).pipe(Effect.orElseSucceed(() => emptyStats))

export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
  const deviceId = yield* readOrCreateDeviceId
  const maybePlayerName = yield* readPlayerName
  const sound = yield* readSound
  const savedFriendGames = yield* readFriendGames
  const stats = yield* readStats
  return {
    deviceId,
    maybePlayerName,
    savedFriendGames,
    stats,
    maybeInviteCode: roomCodeFromPath(window.location.pathname),
    sound,
    turnAlerts: turnAlertsAtStart(),
    homeScreen: homeScreenAtStart(),
  }
}).pipe(
  // NOTE: without storage (a locked-down private window) the device gets a
  // throwaway ID, so a friend game there lasts only as long as the tab.
  Effect.catch(() =>
    Effect.succeed({
      deviceId: SecureRandom.uuidV4Unsafe(),
      maybePlayerName: Option.none(),
      savedFriendGames: [],
      stats: emptyStats,
      maybeInviteCode: roomCodeFromPath(window.location.pathname),
      sound: SoundSetting.Off(),
      turnAlerts: turnAlertsAtStart(),
      homeScreen: homeScreenAtStart(),
    }),
  ),
  Effect.provide(
    Layer.mergeAll(
      BrowserKeyValueStore.layerLocalStorage,
      BrowserCrypto.layerSecureRandom,
    ),
  ),
)

export const saveFriendGames = (games: ReadonlyArray<SavedFriendGame>) =>
  writeFriendGames(games).pipe(
    Effect.provide(BrowserKeyValueStore.layerLocalStorage),
  )

export const saveSound = (sound: SoundSetting) =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set(SOUND_KEY, sound._tag)
  }).pipe(Effect.provide(BrowserKeyValueStore.layerLocalStorage))

export const savePlayerName = (name: string) =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set(PLAYER_NAME_KEY, name)
  }).pipe(Effect.provide(BrowserKeyValueStore.layerLocalStorage))

export const saveStats = (stats: Stats) =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    const json = yield* Schema.encodeEffect(StatsJson)(stats)
    yield* store.set(STATS_KEY, json)
  }).pipe(Effect.provide(BrowserKeyValueStore.layerLocalStorage))
