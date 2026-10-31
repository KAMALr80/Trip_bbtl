// Keeps the offline snapshot (M4-03) in step with the app while online, and puts it back when the
// app starts with no network. The snapshot is TanStack Query's own dehydrated cache, filtered by
// ./rules.ts, plus the account facts the app checks before showing anything.
import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { keepQuery, lastSynced } from "./rules";
import {
  clearSnapshot,
  readSnapshot,
  writeSnapshot,
  type OfflineAccount,
  type Snapshot,
} from "./store";
import { setSyncedAt } from "./status";

const WRITE_DELAY_MS = 1000;

let userId: string | null = null;
let account: OfflineAccount = {};
let client: QueryClient | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;
/** Resolves once the saved account facts are merged into `account` (see startSnapshot). */
let merged: Promise<void> = Promise.resolve();

function build(): Snapshot | null {
  if (!userId || !client) return null;
  const id = userId;
  const queries = dehydrate(client, {
    shouldDehydrateQuery: (q) => q.state.status === "success" && keepQuery(q.queryKey, id),
  });
  return { version: 1, userId: id, syncedAt: lastSynced(queries.queries), account, queries };
}

function write() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  const snapshot = build();
  if (!snapshot) return;
  setSyncedAt(snapshot.syncedAt);
  void writeSnapshot(snapshot);
}

/** Query results come in bursts, so they are written together a moment later. */
function scheduleWrite(delay = WRITE_DELAY_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(write, delay);
}

/** The app is being hidden or closed: write what's pending now, or it is lost. */
function flush() {
  if (timer) write();
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/**
 * Starts saving for this signed-in player (call after the server confirmed the session). Another
 * player's snapshot on this device is dropped first. Safe to call again for the same player.
 */
export async function startSnapshot(queryClient: QueryClient, user: User) {
  if (userId === user.id && client === queryClient) {
    account = { ...account, user };
    return;
  }
  stopSnapshot();
  // Set synchronously, so account facts that arrive while the old snapshot is read are kept.
  userId = user.id;
  client = queryClient;
  account = { user };
  unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (keepQuery(event.query.queryKey, user.id)) scheduleWrite();
  });
  askPersistentStorage();
  merged = (async () => {
    const saved = await readSnapshot();
    if (userId !== user.id) return;
    if (saved?.userId === user.id) {
      account = { ...saved.account, ...account };
      setSyncedAt(saved.syncedAt);
    } else if (saved) await clearSnapshot();
  })();
  await merged;
  if (userId === user.id) scheduleWrite();
}

/**
 * Installed app only: ask the browser not to clear this site's storage under pressure, so the
 * snapshot is still there on the plane. Browsers decide; a "no" just leaves the default.
 */
function askPersistentStorage() {
  try {
    if (!window.matchMedia("(display-mode: standalone)").matches) return;
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* not supported */
  }
}

function stopSnapshot() {
  unsubscribe?.();
  unsubscribe = undefined;
  if (timer) clearTimeout(timer);
  timer = undefined;
  userId = null;
  client = null;
  account = {};
}

/** Signing out: stop saving and delete this device's snapshot. */
export async function dropSnapshot() {
  stopSnapshot();
  setSyncedAt(null);
  await clearSnapshot();
}

/** Records an account fact seen online (profile, accepted legal version, access). */
export function saveAccount(patch: OfflineAccount) {
  if (!userId) return;
  account = { ...account, ...patch };
  // Few and important (they decide what the app shows offline): write without waiting.
  scheduleWrite(0);
}

/**
 * The app started with no network: the last signed-in player from this device, with their saved
 * queries put back into the cache. Null when there is no snapshot.
 */
export async function restoreSnapshot(queryClient: QueryClient): Promise<OfflineAccount | null> {
  const saved = await readSnapshot();
  if (!saved?.account.user) return null;
  hydrate(queryClient, saved.queries);
  setSyncedAt(saved.syncedAt);
  return saved.account;
}

/** The account facts saved for this player, for screens that need them while offline. */
export async function savedAccount(forUser: string): Promise<OfflineAccount | null> {
  if (userId === forUser) {
    await merged;
    if (userId === forUser) return account;
  }
  const saved = await readSnapshot();
  return saved?.userId === forUser ? saved.account : null;
}
