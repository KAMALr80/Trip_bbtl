// The offline snapshot's storage (M4-03): one IndexedDB record per device, for the player signed
// in last. Signing out (or another player signing in) clears it. Every call fails soft: private
// mode, blocked storage or an old browser simply means no offline snapshot.
import type { DehydratedState } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

/** The account facts the app checks before showing anything, as last seen online. */
export type OfflineAccount = {
  user?: User;
  profile?: unknown;
  playerProfile?: unknown;
  /** The legal version this player had accepted. */
  legalVersion?: string;
  access?: { beta: boolean; has_dob: boolean; age_range: string };
};

export type Snapshot = {
  version: 1;
  userId: string;
  /** When the newest saved query was loaded from the server (null: nothing saved yet). */
  syncedAt: number | null;
  account: OfflineAccount;
  queries: DehydratedState;
};

const DB = "tj-offline";
const STORE = "snapshot";
/** Actions waiting for the network (M4-04), keyed by entry id. */
export const OUTBOX = "outbox";
const KEY = "current";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        for (const name of [STORE, OUTBOX])
          if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
  store: string = STORE,
) {
  const db = await open();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve) => {
    try {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(undefined);
      };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

export async function readSnapshot(): Promise<Snapshot | null> {
  const value = (await run("readonly", (s) => s.get(KEY))) as Snapshot | undefined;
  return value?.version === 1 ? value : null;
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await run("readwrite", (s) => s.put(snapshot, KEY));
}

export async function clearSnapshot(): Promise<void> {
  await run("readwrite", (s) => s.delete(KEY));
}
