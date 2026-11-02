// Web Push with nothing but WebCrypto: the payload is encrypted for the
// device (RFC 8291, aes128gcm) and the request is signed with the app's VAPID
// key (RFC 8292), so any browser's push service accepts it.

export type Subscription = Readonly<{
  endpoint: string
  keys: Readonly<{ p256dh: string; auth: string }>
}>

export type Vapid = Readonly<{
  publicKey: string
  privateKey: string
  subject: string
}>

const encoder = new TextEncoder()

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char =>
    char.charCodeAt(0),
  )

export const toBase64Url = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

const concat = (...parts: ReadonlyArray<Uint8Array>): Uint8Array<ArrayBuffer> =>
  parts.reduce<Uint8Array<ArrayBuffer>>((joined, part) => {
    const next = new Uint8Array(joined.length + part.length)
    next.set(joined)
    next.set(part, joined.length)
    return next
  }, new Uint8Array(0))

const hmac = async (
  key: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data))
}

// HKDF with a single 32-byte block, which is all RFC 8291 ever needs.
const hkdf = async (
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const prk = await hmac(salt, ikm)
  const block = await hmac(prk, concat(info, new Uint8Array([1])))
  return block.slice(0, length)
}

const RECORD_SIZE = 4096

const newEcdhKeys = async (): Promise<CryptoKeyPair> => {
  const keys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  if (!('privateKey' in keys)) {
    throw new Error('Expected an ECDH key pair')
  }
  return keys
}

const exportRaw = async (key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> => {
  const exported = await crypto.subtle.exportKey('raw', key)
  if (!(exported instanceof ArrayBuffer)) {
    throw new Error('Expected raw key bytes')
  }
  return new Uint8Array(exported)
}

// The aes128gcm body for one message: a header carrying the salt and this
// message's own public key, then the payload as a single encrypted record.
export const encryptPayload = async (
  subscription: Subscription,
  payload: string,
  salt: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> => {
  const userAgentPublic = fromBase64Url(subscription.keys.p256dh)
  const authSecret = fromBase64Url(subscription.keys.auth)

  const userAgentKey = await crypto.subtle.importKey(
    'raw',
    userAgentPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const serverKeys = await newEcdhKeys()
  const serverPublic = await exportRaw(serverKeys.publicKey)
  // NOTE: the Workers types call this field $public, but WebCrypto (and
  // workerd at runtime) reads `public`.
  const ecdh = { name: 'ECDH', public: userAgentKey }
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdh, serverKeys.privateKey, 256),
  )

  const keyInfo = concat(
    encoder.encode('WebPush: info\0'),
    userAgentPublic,
    serverPublic,
  )
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32)

  const saltBytes = Uint8Array.from(salt)
  const contentKey = await hkdf(
    saltBytes,
    ikm,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16,
  )
  const nonce = await hkdf(
    saltBytes,
    ikm,
    encoder.encode('Content-Encoding: nonce\0'),
    12,
  )

  // 0x02 marks the last (and only) record.
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey,
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      plaintext,
    ),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE)

  return concat(
    saltBytes,
    recordSize,
    new Uint8Array([serverPublic.length]),
    serverPublic,
    ciphertext,
  )
}

const VAPID_TOKEN_SECONDS = 12 * 60 * 60

// A short-lived ES256 JWT proving the message comes from this app's key.
export const vapidAuthorization = async (
  endpoint: string,
  vapid: Vapid,
  nowSeconds: number,
): Promise<string> => {
  const publicKey = fromBase64Url(vapid.publicKey)
  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(publicKey.slice(1, 33)),
      y: toBase64Url(publicKey.slice(33, 65)),
      d: vapid.privateKey,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const encodePart = (value: object) =>
    toBase64Url(encoder.encode(JSON.stringify(value)))
  const unsigned = `${encodePart({ typ: 'JWT', alg: 'ES256' })}.${encodePart({
    aud: new URL(endpoint).origin,
    exp: nowSeconds + VAPID_TOKEN_SECONDS,
    sub: vapid.subject,
  })}`
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      encoder.encode(unsigned),
    ),
  )

  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${vapid.publicKey}`
}

// A day is long enough for a turn alert; after that it's stale news.
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60

export type PushResult = 'Sent' | 'Gone' | 'Failed'

// Each message needs a fresh random salt (16 bytes) and the current time.
export type Freshness = Readonly<{ salt: Uint8Array; nowSeconds: number }>

export const sendPush = async (
  subscription: Subscription,
  payload: string,
  vapid: Vapid,
  { salt, nowSeconds }: Freshness,
): Promise<PushResult> => {
  try {
    const body = await encryptPayload(subscription, payload, salt)
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(
          subscription.endpoint,
          vapid,
          nowSeconds,
        ),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TIME_TO_LIVE_SECONDS),
        Urgency: 'high',
      },
      body,
    })
    // 404 and 410 mean the device unsubscribed or the subscription expired.
    if (response.status === 404 || response.status === 410) {
      return 'Gone'
    }
    return response.ok ? 'Sent' : 'Failed'
  } catch {
    return 'Failed'
  }
}
