/** localStorage writes that never throw (private mode / blocked storage). */
export function safeSetItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
