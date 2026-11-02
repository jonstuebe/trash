import { DurableObject } from 'cloudflare:workers'
import { Clock, Effect, Option, Schema } from 'effect'
import * as SecureRandom from 'effect/crypto/SecureRandom'

import type { Game } from '../src/domain/game'
import {
  type Alert,
  NoticeJson,
  PushRegistrationJson,
  PushSubscriptionJson,
  VAPID_PUBLIC_KEY,
  VAPID_SUBJECT,
  alertsFor,
} from '../src/domain/push'
import {
  ClientMessageJson,
  Intent,
  type Refusal,
  RoomJson,
  type Room as RoomState,
  ServerMessage,
  ServerMessageJson,
  type Shuffle,
  applyMove,
  isRoomCode,
  roomPath,
  seat,
  seatOfDevice,
  viewOf,
} from '../src/domain/room'
import { type Freshness, sendPush } from './webPush'

const ROOM_KEY = 'room'
const CODE_KEY = 'code'
const pushKey = (seatIndex: number) => `push:${seatIndex}`

const ROOM_PATH = /^\/api\/rooms\/([A-Z0-9]+)\/(socket|push)$/

const shuffle: Shuffle = cards =>
  Effect.runSync(
    SecureRandom.SecureRandom.use(random => random.shuffle(cards)).pipe(
      Effect.provide(SecureRandom.layerWebCrypto),
    ),
  )

const SALT_BYTES = 16

const freshness = (): Freshness =>
  Effect.runSync(
    Effect.gen(function* () {
      const random = yield* SecureRandom.SecureRandom
      const salt = yield* random.randomBytes(SALT_BYTES)
      const nowMillis = yield* Clock.currentTimeMillis
      return { salt, nowSeconds: Math.floor(nowMillis / 1000) }
    }).pipe(Effect.provide(SecureRandom.layerWebCrypto)),
  )

const encodeServerMessage = Schema.encodeSync(ServerMessageJson)
const decodeClientMessage = Schema.decodeUnknownOption(ClientMessageJson)
const encodeRoom = Schema.encodeSync(RoomJson)
const decodeRoom = Schema.decodeUnknownOption(RoomJson)
const decodeIntent = Schema.decodeUnknownOption(Intent)
const decodeRegistration = Schema.decodeUnknownOption(PushRegistrationJson)
const encodeSubscription = Schema.encodeSync(PushSubscriptionJson)
const decodeSubscription = Schema.decodeUnknownOption(PushSubscriptionJson)
const encodeNotice = Schema.encodeSync(NoticeJson)

// Each socket carries its seat, so it survives the Room hibernating.
const Attachment = Schema.Struct({ seat: Schema.Number })
type Attachment = typeof Attachment.Type

const decodeAttachment = Schema.decodeUnknownOption(Attachment)

const seatOf = (socket: WebSocket): Option.Option<number> =>
  Option.map(
    decodeAttachment(socket.deserializeAttachment()),
    attachment => attachment.seat,
  )

// One Room per invite code. Sockets use the hibernation API, so a game that
// sits for days between turns costs nothing while nobody is connected.
export class Room extends DurableObject<Env> {
  private load(): Option.Option<RoomState> {
    return Option.flatMap(
      Option.fromNullishOr(this.ctx.storage.kv.get<string>(ROOM_KEY)),
      decodeRoom,
    )
  }

  private save(room: RoomState): void {
    this.ctx.storage.kv.put(ROOM_KEY, encodeRoom(room))
  }

  private sendTo(socket: WebSocket, room: RoomState): void {
    Option.match(seatOf(socket), {
      onNone: () => undefined,
      onSome: seatIndex =>
        socket.send(
          encodeServerMessage(
            ServerMessage.Seated({ seat: seatIndex, room: viewOf(room) }),
          ),
        ),
    })
  }

  private broadcast(room: RoomState): void {
    this.ctx.getWebSockets().forEach(socket => this.sendTo(socket, room))
  }

  // Tells each player who has something to do and isn't connected. An open
  // socket means the game is on their screen, so they need no alert.
  private async alert(maybeBefore: Option.Option<Game>, after: Game) {
    const code = this.ctx.storage.kv.get<string>(CODE_KEY)
    const privateKey = this.env.VAPID_PRIVATE_KEY
    if (code === undefined || !privateKey) {
      return
    }

    const connectedSeats = this.ctx
      .getWebSockets()
      .flatMap(socket => Option.toArray(seatOf(socket)))
    const vapid = {
      publicKey: VAPID_PUBLIC_KEY,
      privateKey,
      subject: VAPID_SUBJECT,
    }

    const send = async ({ seat: seatIndex, title, body }: Alert) => {
      const maybeSubscription = Option.flatMap(
        Option.fromNullishOr(
          this.ctx.storage.kv.get<string>(pushKey(seatIndex)),
        ),
        decodeSubscription,
      )
      if (Option.isNone(maybeSubscription)) {
        return
      }
      const notice = encodeNotice({
        title,
        body,
        url: roomPath(code),
        tag: `trash-${code}`,
      })
      const result = await sendPush(
        maybeSubscription.value,
        notice,
        vapid,
        freshness(),
      )
      if (result === 'Gone') {
        this.ctx.storage.kv.delete(pushKey(seatIndex))
      }
    }

    await Promise.all(
      alertsFor(maybeBefore, after)
        .filter(({ seat: seatIndex }) => !connectedSeats.includes(seatIndex))
        .map(send),
    )
  }

  // Keeps the device's push subscription for its seat, replacing any older
  // one, so turn alerts reach whichever device that player last turned them
  // on from.
  private async register(request: Request): Promise<Response> {
    const maybeRegistration = decodeRegistration(await request.text())
    const maybeSeat = Option.flatMap(
      Option.all({ room: this.load(), registration: maybeRegistration }),
      ({ room, registration }) => seatOfDevice(room, registration.device),
    )
    if (Option.isNone(maybeRegistration) || Option.isNone(maybeSeat)) {
      return new Response('Not seated', { status: 403 })
    }
    this.ctx.storage.kv.put(
      pushKey(maybeSeat.value),
      encodeSubscription(maybeRegistration.value.subscription),
    )
    return new Response(null, { status: 204 })
  }

  private refuse(reason: Refusal): Response {
    const { 0: client, 1: server } = new WebSocketPair()
    server.accept()
    server.send(encodeServerMessage(ServerMessage.Refused({ reason })))
    server.close(4000, reason)
    return new Response(null, { status: 101, webSocket: client })
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const [, code = '', route] = ROOM_PATH.exec(url.pathname) ?? []
    this.ctx.storage.kv.put(CODE_KEY, code)

    if (route === 'push') {
      return this.register(request)
    }

    const deviceId = url.searchParams.get('device') ?? ''
    const maybeIntent = decodeIntent(url.searchParams.get('intent'))

    if (deviceId.length < 16 || Option.isNone(maybeIntent)) {
      return new Response('Bad request', { status: 400 })
    }

    const maybeRoom = this.load()
    const seating = seat(maybeRoom, deviceId, maybeIntent.value, shuffle)

    if (typeof seating === 'string') {
      return this.refuse(seating)
    }
    if (Option.isNone(seating)) {
      return new Response('Bad request', { status: 400 })
    }

    const { room, seat: seatIndex } = seating.value
    this.save(room)

    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ seat: seatIndex } satisfies Attachment)

    this.broadcast(room)

    // The guest's arrival deals the first round.
    const wasWaiting = Option.match(maybeRoom, {
      onNone: () => true,
      onSome: before => Option.isNone(before.maybeGame),
    })
    if (wasWaiting && Option.isSome(room.maybeGame)) {
      await this.alert(Option.none(), room.maybeGame.value)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    const maybeMessage =
      typeof data === 'string' ? decodeClientMessage(data) : Option.none()

    const maybeTurn = Option.all({
      room: this.load(),
      seat: seatOf(socket),
      message: maybeMessage,
    })
    if (Option.isNone(maybeTurn)) {
      return
    }

    const { room, seat: seatIndex, message } = maybeTurn.value
    if (Option.isNone(room.maybeGame)) {
      this.sendTo(socket, room)
      return
    }

    const game = room.maybeGame.value
    const nextGame = applyMove(game, seatIndex, message, shuffle)

    // A refused move (out of turn, or made on an old screen) gets the current
    // game back, so that player's screen catches up.
    if (nextGame === game) {
      this.sendTo(socket, room)
      return
    }

    const nextRoom: RoomState = {
      hostId: room.hostId,
      maybeGuestId: room.maybeGuestId,
      maybeGame: Option.some(nextGame),
    }
    this.save(nextRoom)
    this.broadcast(nextRoom)
    await this.alert(Option.some(game), nextGame)
  }

  // Echoes the player's close. Codes like 1005 and 1006 only describe how a
  // socket ended (no code, or the connection just dropped, as when a phone
  // suspends the app) and can't be sent back, so those get a normal close.
  override async webSocketClose(
    socket: WebSocket,
    code: number,
  ): Promise<void> {
    const isSendable = code === 1000 || (code >= 3000 && code <= 4999)
    try {
      socket.close(isSendable ? code : 1000)
    } catch {
      // Already closed.
    }
  }
}

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url)
    const [, code = '', route] = ROOM_PATH.exec(url.pathname) ?? []

    if (!isRoomCode(code)) {
      return new Response('Not found', { status: 404 })
    }
    if (route === 'push' && request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
    if (route === 'socket' && request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 })
    }

    const rooms = ctx.exports.Room
    const room = rooms.get(rooms.idFromName(code))
    return room.fetch(request)
  },
} satisfies ExportedHandler<Env>
