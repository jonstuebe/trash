import {
  type Cause,
  Duration,
  Effect,
  Option,
  Queue,
  Schema,
  Stream,
} from 'effect'
import { ManagedResource } from 'foldkit'

import { Intent, ServerMessageJson } from './domain/room'
import { Message } from './message'
import { Connection, type Model, Screen } from './model'

// The WebSocket to a friend game's Room. It's open while the friend screen
// wants a connection, and closes when the player leaves or the socket drops.

const CONNECTION_TIMEOUT_MS = 8000

export const RoomSocket = ManagedResource.tag<RoomConnection>()('RoomSocket')
export type RoomSocketService = ManagedResource.ServiceOf<typeof RoomSocket>

const RoomSocketRequirements = Schema.Struct({
  code: Schema.String,
  intent: Intent,
  deviceId: Schema.String,
  name: Schema.String,
})
type RoomSocketRequirements = typeof RoomSocketRequirements.Type

const socketUrl = ({
  code,
  intent,
  deviceId,
  name,
}: RoomSocketRequirements) => {
  const url = new URL(`/api/rooms/${code}/socket`, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('device', deviceId)
  url.searchParams.set('intent', intent)
  url.searchParams.set('name', name)
  return url.toString()
}

const decodeServerMessage = Schema.decodeUnknownOption(ServerMessageJson)

// The Room sends the seat and game the moment the socket opens, before any
// Subscription could be listening. So the socket fills its inbox from the
// start, and the Subscription drains it.
export type RoomConnection = Readonly<{
  socket: WebSocket
  inbox: Queue.Queue<Message, Cause.Done>
}>

const openSocket = (requirements: RoomSocketRequirements) =>
  Effect.flatMap(Queue.unbounded<Message, Cause.Done>(), inbox =>
    Effect.callback<RoomConnection, Error>(resume => {
      const socket = new WebSocket(socketUrl(requirements))

      const handleMessage = (event: MessageEvent) => {
        Option.match(decodeServerMessage(event.data), {
          onNone: () => undefined,
          onSome: message => {
            Queue.offerUnsafe(inbox, Message.ReceivedServerMessage({ message }))
          },
        })
      }
      const handleClose = () => {
        Queue.offerUnsafe(inbox, Message.DisconnectedRoomSocket())
        Queue.endUnsafe(inbox)
      }
      const handleOpen = () => {
        socket.removeEventListener('error', handleError)
        socket.addEventListener('error', handleClose)
        socket.addEventListener('close', handleClose)
        resume(Effect.succeed({ socket, inbox }))
      }
      const handleError = () => {
        socket.removeEventListener('open', handleOpen)
        resume(Effect.fail(new Error('Could not reach the game')))
      }

      socket.addEventListener('message', handleMessage)
      socket.addEventListener('open', handleOpen)
      socket.addEventListener('error', handleError)

      return Effect.sync(() => {
        socket.removeEventListener('open', handleOpen)
        socket.removeEventListener('error', handleError)
        socket.close()
      })
    }),
  ).pipe(
    Effect.timeout(Duration.millis(CONNECTION_TIMEOUT_MS)),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(new Error('Timed out reaching the game')),
    ),
  )

const modelToMaybeRequirements = (
  model: Model,
): Option.Option<RoomSocketRequirements> =>
  Screen.match(model.screen, {
    Title: () => Option.none(),
    Naming: () => Option.none(),
    JoiningGame: () => Option.none(),
    Table: () => Option.none(),
    StartingFriendGame: () => Option.none(),
    Friend: ({ code, intent, connection }) =>
      Connection.guards.Disconnected(connection)
        ? Option.none()
        : Option.some({
            code,
            intent,
            deviceId: model.deviceId,
            name: Option.getOrElse(model.maybePlayerName, () => ''),
          }),
  })

export const managedResources = ManagedResource.make<Model, Message>()(
  entry => ({
    roomSocket: entry(Schema.Option(RoomSocketRequirements), {
      resource: RoomSocket,
      modelToMaybeRequirements,
      acquire: openSocket,
      release: connection => Effect.sync(() => connection.socket.close()),
      onAcquired: () => Message.ConnectedRoomSocket(),
      onReleased: () => Message.ReleasedRoomSocket(),
      onAcquireError: () => Message.FailedConnectRoomSocket(),
    }),
  }),
)

export const roomSocketMessages = (connection: RoomConnection) =>
  Stream.fromQueue(connection.inbox)
