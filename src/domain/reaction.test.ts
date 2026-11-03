import { Option, Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  Delivery,
  REACTIONS,
  REACTION_COOLDOWN_MS,
  deliveryOf,
  emojiOf,
  isReactionAllowed,
} from './reaction'
import { ClientReactionJson, ServerMessage, ServerMessageJson } from './room'

describe('reactions', () => {
  test('each reaction has its own emoji', () => {
    const emoji = REACTIONS.map(emojiOf)
    expect(new Set(emoji).size).toBe(REACTIONS.length)
  })

  test('the first reaction from a seat is always allowed', () => {
    expect(isReactionAllowed(Option.none(), 5000)).toBe(true)
  })

  test('a reaction inside the cooldown is dropped, one after it goes', () => {
    expect(
      isReactionAllowed(Option.some(5000), 5000 + REACTION_COOLDOWN_MS - 1),
    ).toBe(false)
    expect(
      isReactionAllowed(Option.some(5000), 5000 + REACTION_COOLDOWN_MS),
    ).toBe(true)
  })

  test('a reaction goes live to the other seat when it is connected', () => {
    expect(deliveryOf(0, [0, 1])).toStrictEqual(Delivery.Live({ seat: 1 }))
    expect(deliveryOf(1, [0])).toStrictEqual(Delivery.Live({ seat: 0 }))
  })

  test('a reaction is held for the other seat when it is away', () => {
    expect(deliveryOf(0, [0])).toStrictEqual(Delivery.Hold({ seat: 1 }))
    expect(deliveryOf(1, [])).toStrictEqual(Delivery.Hold({ seat: 0 }))
  })

  test('the room only accepts reactions it knows', () => {
    const decode = Schema.decodeUnknownOption(ClientReactionJson)
    expect(decode('{"reaction":"Laugh"}')).toStrictEqual(
      Option.some({ reaction: 'Laugh' }),
    )
    expect(Option.isNone(decode('{"reaction":"🖕"}'))).toBe(true)
    expect(Option.isNone(decode('{"sequence":3,"move":{"_tag":"Draw"}}'))).toBe(
      true,
    )
  })

  test('a reaction round-trips as a server message', () => {
    const message = ServerMessage.Reacted({ seat: 1, reaction: 'Fire' })
    const json = Schema.encodeSync(ServerMessageJson)(message)
    expect(Schema.decodeSync(ServerMessageJson)(json)).toStrictEqual(message)
  })
})
