import { Effect, Layer, Option, Schema } from 'effect'
import { SecureRandom } from 'effect/crypto'
import { KeyValueStore } from 'effect/persistence'

import { BrowserCrypto, BrowserKeyValueStore } from '@effect/platform-browser'

import { roomCodeFromPath } from './domain/room'
import { type Flags, SavedFriendGame } from './model'

// What this device remembers between visits: its own ID, which the Room uses
// to give it back its seat, and the friend game it last played.

const DEVICE_ID_KEY = 'trash.deviceId'
const FRIEND_GAME_KEY = 'trash.friendGame'

const SavedFriendGameJson = Schema.fromJsonString(
  Schema.toCodecJson(SavedFriendGame),
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

const readSavedFriendGame = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  const json = yield* Effect.fromOption(
    Option.fromNullishOr(yield* store.get(FRIEND_GAME_KEY)),
  )
  return yield* Schema.decodeEffect(SavedFriendGameJson)(json)
}).pipe(Effect.option)

export const flags: Effect.Effect<Flags> = Effect.gen(function* () {
  const deviceId = yield* readOrCreateDeviceId
  const maybeSavedFriendGame = yield* readSavedFriendGame
  return {
    deviceId,
    maybeSavedFriendGame,
    maybeInviteCode: roomCodeFromPath(window.location.pathname),
  }
}).pipe(
  // NOTE: without storage (a locked-down private window) the device gets a
  // throwaway ID, so a friend game there lasts only as long as the tab.
  Effect.catch(() =>
    Effect.succeed({
      deviceId: SecureRandom.uuidV4Unsafe(),
      maybeSavedFriendGame: Option.none(),
      maybeInviteCode: roomCodeFromPath(window.location.pathname),
    }),
  ),
  Effect.provide(
    Layer.mergeAll(
      BrowserKeyValueStore.layerLocalStorage,
      BrowserCrypto.layerSecureRandom,
    ),
  ),
)

export const saveFriendGame = (saved: SavedFriendGame) =>
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore
    const json = yield* Schema.encodeEffect(SavedFriendGameJson)(saved)
    yield* store.set(FRIEND_GAME_KEY, json)
  }).pipe(Effect.provide(BrowserKeyValueStore.layerLocalStorage))

export const forgetFriendGame = Effect.gen(function* () {
  const store = yield* KeyValueStore.KeyValueStore
  yield* store.remove(FRIEND_GAME_KEY)
}).pipe(Effect.provide(BrowserKeyValueStore.layerLocalStorage))
