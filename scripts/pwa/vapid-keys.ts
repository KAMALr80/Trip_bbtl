// Makes a VAPID key pair for web push reminders (M4-08), once per environment:
//   bun scripts/pwa/vapid-keys.ts
// Store both as environment secrets (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); scripts/deploy.sh puts
// the public one in the build (VITE_VAPID_PUBLIC_KEY) and both in the Worker. Changing the pair
// later means every browser has to turn reminders on again.
const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
  "deriveBits",
])) as CryptoKeyPair;
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64url(await crypto.subtle.exportKey("raw", pair.publicKey))}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
