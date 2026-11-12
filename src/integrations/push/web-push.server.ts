// Web Push without a library (M4-08), on WebCrypto so it runs in any server runtime:
// - RFC 8292 VAPID: an ES256 JWT that says the push comes from us.
// - RFC 8291 + RFC 8188 "aes128gcm": the payload encrypted for the browser's keys.
// Keys are base64url. VAPID_PUBLIC_KEY is the 65-byte uncompressed P-256 point (the same value the
// app passes to pushManager.subscribe), VAPID_PRIVATE_KEY the 32-byte private scalar.

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushResult =
  | { ok: true }
  /** The subscription is gone (404 / 410): delete it. */
  | { ok: false; gone: true; status: number }
  | { ok: false; gone: false; status: number; error: string };

const enc = new TextEncoder();

export function b64urlDecode(value: string): Uint8Array {
  const b64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u8) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A buffer of exactly these bytes (WebCrypto's types want ArrayBuffer-backed views). */
const buf = (u8: Uint8Array): ArrayBuffer => u8.slice().buffer as ArrayBuffer;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** The private VAPID key as a WebCrypto signing key (from the raw scalar + public point). */
async function vapidSigningKey(keys: VapidKeys) {
  const pub = b64urlDecode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4)
    throw new Error("VAPID_PUBLIC_KEY must be a 65-byte P-256 point");
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** RFC 8292: `Authorization: vapid t=<jwt>, k=<public key>` for this push service. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()) {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await vapidSigningKey(keys),
    buf(enc.encode(unsigned)),
  );
  // WebCrypto already returns the JOSE form (r || s, 64 bytes).
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${keys.publicKey}`;
}

/**
 * RFC 8291: encrypts `payload` for the browser (its p256dh key and auth secret) as one aes128gcm
 * record. `salt` and the sender's key pair are random unless given (tests pass them).
 */
export async function encryptPayload(
  payload: Uint8Array,
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  fixed?: { salt: Uint8Array; senderKeys: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const sender =
    fixed?.senderKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", sender.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    buf(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, sender.privateKey, 256),
  );
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  // One record: the payload, then the 0x02 delimiter that marks the last record (no padding).
  const record = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buf(nonce) },
      aes,
      buf(concat(payload, new Uint8Array([2]))),
    ),
  );
  const rs = 4096;
  const header = concat(
    salt,
    new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]),
    new Uint8Array([asPublic.length]),
    asPublic,
  );
  return concat(header, record);
}

/** Sends one push. `payload` is what the service worker's push event reads (JSON). */
export async function sendWebPush(
  sub: PushSubscriptionKeys,
  payload: unknown,
  keys: VapidKeys,
  {
    ttlSeconds = 24 * 3600,
    fetchImpl = fetch,
    topic,
  }: { ttlSeconds?: number; fetchImpl?: typeof fetch; topic?: string | undefined } = {},
): Promise<PushResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub);
  let res: Response;
  try {
    res = await fetchImpl(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(sub.endpoint, keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "normal",
        // A resend with the same Topic replaces one the push service hasn't delivered yet.
        ...(topic ? { Topic: topic } : {}),
      },
      body: buf(body),
    });
  } catch (error) {
    return { ok: false, gone: false, status: 0, error: String(error).slice(0, 200) };
  }
  if (res.ok) return { ok: true };
  if (res.status === 404 || res.status === 410)
    return { ok: false, gone: true, status: res.status };
  return { ok: false, gone: false, status: res.status, error: (await res.text()).slice(0, 200) };
}
