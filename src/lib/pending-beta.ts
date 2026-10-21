const KEY = "tj-pending-beta";
const AT = "tj-pending-beta-at";
const TTL = 24 * 60 * 60 * 1000;

export function savePendingBeta(code: string) {
  const at = String(Date.now());
  for (const s of [sessionStorage, localStorage]) { s.setItem(KEY, code); s.setItem(AT, at); }
}
export function clearPendingBeta() {
  for (const s of [sessionStorage, localStorage]) { s.removeItem(KEY); s.removeItem(AT); }
}
/** Saved beta codes expire after 24 hours, like trip invite codes. */
export function readPendingBeta(): string | null {
  if (typeof window === "undefined") return null;
  const code = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
  if (!code) return null;
  const at = Number(sessionStorage.getItem(AT) ?? localStorage.getItem(AT));
  if (!at || Date.now() - at > TTL) { clearPendingBeta(); return null; }
  return code;
}
