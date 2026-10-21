const KEY = "squad-pending-code";
const AT = "squad-pending-code-at";
const TTL = 24 * 60 * 60 * 1000;

export function savePendingCode(code: string) {
  const at = String(Date.now());
  for (const s of [sessionStorage, localStorage]) { s.setItem(KEY, code); s.setItem(AT, at); }
}

export function clearPendingCode() {
  for (const s of [sessionStorage, localStorage]) { s.removeItem(KEY); s.removeItem(AT); }
}

// Saved invite codes expire after 24 hours.
export function readPendingCode(): string | null {
  const code = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
  if (!code) return null;
  const at = Number(sessionStorage.getItem(AT) ?? localStorage.getItem(AT));
  if (!at || Date.now() - at > TTL) { clearPendingCode(); return null; }
  return code;
}
