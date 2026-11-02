// Makes a VAPID key pair for Web Push. The public key goes in
// src/domain/push.ts (VAPID_PUBLIC_KEY); the private key is the Worker secret
// VAPID_PRIVATE_KEY, and goes in .dev.vars for local dev. Replacing the pair
// cuts off every device that already subscribed, so do it only if the private
// key leaks.

const base64Url = (bytes: ArrayBuffer): string =>
  Buffer.from(bytes).toString('base64url')

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
)

const rawPublic = await crypto.subtle.exportKey('raw', publicKey)
const { d } = await crypto.subtle.exportKey('jwk', privateKey)

console.log(`VAPID_PUBLIC_KEY=${base64Url(rawPublic)}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
