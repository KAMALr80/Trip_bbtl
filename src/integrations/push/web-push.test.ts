// The Web Push sender against independent implementations: http_ece (the library `web-push` uses)
// decrypts what we encrypt, and Node's crypto verifies our VAPID signature.
import { createECDH, createPublicKey, verify } from "node:crypto";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  sendWebPush,
  vapidAuthorization,
} from "./web-push.server";

const ece = createRequire(import.meta.url)("http_ece") as {
  decrypt(buffer: Buffer, params: Record<string, unknown>): Buffer;
};

/** A browser's push keys: an ECDH key pair and a 16-byte auth secret. */
function browser() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  return { ecdh, sub: { p256dh: b64urlEncode(ecdh.getPublicKey()), auth } };
}

function vapidKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: b64urlEncode(ecdh.getPublicKey()),
    privateKey: b64urlEncode(ecdh.getPrivateKey()),
    subject: "mailto:support@tripjunkies.app",
  };
}

describe("encryptPayload (RFC 8291 aes128gcm)", () => {
  it("is decrypted by http_ece with the browser's private key", async () => {
    const { ecdh, sub } = browser();
    const message = JSON.stringify({ title: "Daily Discovery", body: "Try a pastel de nata 🥐" });
    const body = await encryptPayload(new TextEncoder().encode(message), sub);
    const plain = ece.decrypt(Buffer.from(body), {
      version: "aes128gcm",
      privateKey: ecdh,
      authSecret: sub.auth,
    });
    expect(plain.toString("utf8")).toBe(message);
  });

  it("uses a fresh salt and sender key each time", async () => {
    const { sub } = browser();
    const a = await encryptPayload(new TextEncoder().encode("same"), sub);
    const b = await encryptPayload(new TextEncoder().encode("same"), sub);
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b));
  });
});

describe("vapidAuthorization (RFC 8292)", () => {
  it("signs a JWT for the push service's origin that verifies with the public key", async () => {
    const keys = vapidKeys();
    const now = Date.UTC(2026, 10, 1);
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(m).not.toBeNull();
    const [, h, c, s, k] = m!;
    expect(k).toBe(keys.publicKey);
    const claims = JSON.parse(Buffer.from(b64urlDecode(c!)).toString()) as Record<string, unknown>;
    expect(claims).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: now / 1000 + 12 * 3600,
      sub: "mailto:support@tripjunkies.app",
    });
    const pub = b64urlDecode(keys.publicKey);
    const key = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: b64urlEncode(pub.slice(1, 33)),
        y: b64urlEncode(pub.slice(33)),
      },
      format: "jwk",
    });
    const ok = verify(
      "sha256",
      Buffer.from(`${h}.${c}`),
      { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(b64urlDecode(s!)),
    );
    expect(ok).toBe(true);
  });
});

describe("sendWebPush", () => {
  const sub = { endpoint: "https://push.example.com/send/abc", ...browser().sub };
  const keys = vapidKeys();
  const reply = (status: number) => (async () => new Response("x", { status })) as typeof fetch;

  it("posts an encrypted body with the push headers", async () => {
    let seen: RequestInit | undefined;
    const result = await sendWebPush(sub, { title: "Hi" }, keys, {
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response(null, { status: 201 });
      }) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true });
    const headers = seen?.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["TTL"]).toBe("86400");
    expect(headers["Authorization"]).toMatch(/^vapid t=/);
  });

  it("reports a subscription the push service no longer has", async () => {
    expect(await sendWebPush(sub, {}, keys, { fetchImpl: reply(410) })).toEqual({
      ok: false,
      gone: true,
      status: 410,
    });
    expect(await sendWebPush(sub, {}, keys, { fetchImpl: reply(404) })).toMatchObject({
      gone: true,
    });
  });

  it("other failures are retried, not deleted", async () => {
    expect(await sendWebPush(sub, {}, keys, { fetchImpl: reply(503) })).toMatchObject({
      ok: false,
      gone: false,
      status: 503,
    });
  });
});
