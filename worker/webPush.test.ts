// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { encryptPayload, toBase64Url, vapidAuthorization } from './webPush'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

const fromBase64Url = (value: string) =>
  Uint8Array.from(Buffer.from(value, 'base64url'))

const hkdf = async (
  salt: Uint8Array,
  ikm: Uint8Array,
  info: string | Uint8Array,
  length: number,
) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: typeof info === 'string' ? encoder.encode(info) : info,
    },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

// Decrypts the way a browser does, using Node's own HKDF rather than the
// hand-rolled one under test.
const decrypt = async (
  body: Uint8Array,
  userAgentKeys: CryptoKeyPair,
  authSecret: Uint8Array,
) => {
  const salt = body.slice(0, 16)
  const keyLength = body[20] ?? 0
  const serverPublic = body.slice(21, 21 + keyLength)
  const ciphertext = body.slice(21 + keyLength)

  const userAgentPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', userAgentKeys.publicKey),
  )
  const serverKey = await crypto.subtle.importKey(
    'raw',
    serverPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: serverKey },
      userAgentKeys.privateKey,
      256,
    ),
  )
  const keyInfo = new Uint8Array([
    ...encoder.encode('WebPush: info\0'),
    ...userAgentPublic,
    ...serverPublic,
  ])
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32)
  const contentKey = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16)
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12)

  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey,
    'AES-GCM',
    false,
    ['decrypt'],
  )
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      ciphertext,
    ),
  )
  return { plaintext, recordSize: new DataView(body.buffer).getUint32(16) }
}

describe('encryptPayload', () => {
  it('produces an aes128gcm body the subscribed device can decrypt', async () => {
    const userAgentKeys = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    )
    const authSecret = crypto.getRandomValues(new Uint8Array(16))
    const p256dh = toBase64Url(
      new Uint8Array(
        await crypto.subtle.exportKey('raw', userAgentKeys.publicKey),
      ),
    )

    const body = await encryptPayload(
      {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh, auth: toBase64Url(authSecret) },
      },
      '{"title":"Your turn"}',
      crypto.getRandomValues(new Uint8Array(16)),
    )

    const { plaintext, recordSize } = await decrypt(
      body,
      userAgentKeys,
      authSecret,
    )
    expect(recordSize).toBe(4096)
    expect(plaintext.at(-1)).toBe(2)
    expect(decoder.decode(plaintext.slice(0, -1))).toBe('{"title":"Your turn"}')
  })
})

describe('vapidAuthorization', () => {
  it('signs a JWT for the push service origin with the VAPID key', async () => {
    const keys = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    const publicKey = toBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)),
    )
    const { d } = await crypto.subtle.exportKey('jwk', keys.privateKey)

    const header = await vapidAuthorization(
      'https://web.push.apple.com/QGuQyavXutnMfpu',
      { publicKey, privateKey: d ?? '', subject: 'https://example.com' },
      1_000,
    )

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(match).not.toBeNull()
    const [, head = '', claims = '', signature = '', k] = match ?? []
    expect(k).toBe(publicKey)
    expect(JSON.parse(decoder.decode(fromBase64Url(claims)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: 1_000 + 12 * 60 * 60,
      sub: 'https://example.com',
    })
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.publicKey,
      fromBase64Url(signature),
      encoder.encode(`${head}.${claims}`),
    )
    expect(verified).toBe(true)
  })
})
