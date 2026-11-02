import { Effect, Layer, Option, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { KeyValueStore } from 'effect/persistence'

import { BrowserCrypto, BrowserKeyValueStore } from '@effect/platform-browser'

import { roomCodeFromPath } from './domain/room'
import { type Flags, SavedFriendGame } from './model'
import { turnAlertsAtStart } from './turnAlerts'

// What this device remembers between visits: its own ID, which the Room uses
// to give it back its seat, the player's name, and the friend games it has a
// seat in.

const DEVICE_ID_KEY = 'trash.deviceId'
const PLAYER_NAME_KEY = 'trash.playerName'
const FRIEND_GAMES_KEY = 'trash.friendGames'
// NOTE: before the game list, a device remembered one game under this key.
// It's read once, moved into the list, and removed.
const LEGACY_FRIEND_GAME_KEY = 'trash.friendGame'

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

export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
  const deviceId = yield* readOrCreateDeviceId
  const maybePlayerName = yield* readPlayerName
  const savedFriendGames = yield* readFriendGames
  return {
    deviceId,
    maybePlayerName,
    savedFriendGames,
    maybeInviteCode: roomCodeFromPath(window.location.pathname),
    turnAlerts: turnAlertsAtStart(),
  }
}).pipe(
  // NOTE: without storage (a locked-down private window) the device gets a
  // throwaway ID, so a friend game there lasts only as long as the tab.
  Effect.catch(() =>
    Effect.succeed({
      deviceId: SecureRandom.uuidV4Unsafe(),
      maybePlayerName: Option.none(),
      savedFriendGames: [],
      maybeInviteCode: roomCodeFromPath(window.location.pathname),
      turnAlerts: turnAlertsAtStart(),
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

export const savePlayerName = (name: string) =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    yield* store.set(PLAYER_NAME_KEY, name)
  }).pipe(Effect.provide(BrowserKeyValueStore.layerLocalStorage))
