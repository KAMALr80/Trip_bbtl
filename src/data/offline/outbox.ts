// The offline outbox (M4-04). Actions a player takes with no network wait in IndexedDB and are
// sent, oldest first, once the network is back: when the browser comes online, when the app
// starts or becomes visible, and right after queuing if the network is there. The server keeps
// the rules: a queued action is only a claim, and a deadline that passed meanwhile refuses it.
// Every action is safe to resend (see outbox-rules.ts), so a send cut off halfway is just retried.
import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { checkProof } from "@/lib/proof-check.functions";
import { friendlyError } from "@/lib/friendly-error";
import { rpc } from "../rpc";
import {
  enqueue,
  isDuplicateUpload,
  outcomeOf,
  refOf,
  sendOrder,
  type OutboxAction,
  type OutboxEntry,
  type Outcome,
} from "./outbox-rules";
import { isNetworkError } from "./rules";
import { OUTBOX, run } from "./store";

export type { OutboxAction, OutboxEntry } from "./outbox-rules";

/** A send that was queued instead (no network). Screens show "waiting to send". */
export type Queued = { queued: true; entryId: string };
export const isQueued = (value: unknown): value is Queued =>
  typeof value === "object" && value !== null && (value as Queued).queued === true;

let entries: OutboxEntry[] = [];
let loadedFor: string | null = null;
let client: QueryClient | null = null;
let flushing: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function readAll(): Promise<OutboxEntry[]> {
  return ((await run("readonly", (s) => s.getAll(), OUTBOX)) as OutboxEntry[] | undefined) ?? [];
}
const put = (entry: OutboxEntry) => run("readwrite", (s) => s.put(entry, entry.id), OUTBOX);
const remove = (id: string) => run("readwrite", (s) => s.delete(id), OUTBOX);

let watching = false;
/** Send what's waiting whenever the network comes back or the app is opened again. */
function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("online", () => void flushOutbox());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });
}

/**
 * Starts the outbox for the signed-in player: loads their queue and sends what's waiting. Also
 * called when the app starts offline, so screens can show what is still waiting.
 */
export async function startOutbox(queryClient: QueryClient, userId: string) {
  client = queryClient;
  watch();
  if (loadedFor !== userId) {
    loadedFor = userId;
    entries = (await readAll()).filter((e) => e.userId === userId);
    notify();
  }
  void flushOutbox();
}

/** Signing out: queued actions belong to that player, so they are deleted with them. */
export async function clearOutbox() {
  for (const e of await readAll()) await remove(e.id);
  entries = [];
  loadedFor = null;
  notify();
}

/** Queues an action (with its compressed photo, if any). */
export async function queueAction(
  userId: string,
  action: OutboxAction,
  photo: Blob | null = null,
  id: string = crypto.randomUUID(),
): Promise<Queued> {
  const entry: OutboxEntry = { id, userId, createdAt: Date.now(), action, photo, status: "queued" };
  const next = enqueue(entries, entry);
  for (const gone of entries.filter((e) => !next.includes(e))) await remove(gone.id);
  if (next.includes(entry)) await put(entry);
  entries = next;
  notify();
  if (navigator.onLine) void flushOutbox();
  const kept = next.find((e) => e.status === "queued" && refOf(e.action) === refOf(action));
  return { queued: true, entryId: kept?.id ?? id };
}

/**
 * Sends an action now if the network is there, else queues it. A send that fails for lack of
 * network is queued too. The server's own refusals are thrown as usual.
 */
export async function sendOrQueue<T>(
  userId: string,
  action: OutboxAction,
  photo: Blob | null,
  id: string,
): Promise<T | Queued> {
  if (!navigator.onLine) return queueAction(userId, action, photo, id);
  const { data, error } = await send(action, photo);
  if (error && isNetworkError(error, navigator.onLine))
    return queueAction(userId, action, photo, id);
  if (error) throw error;
  return data as T;
}

/** Sends everything queued, oldest first. One run at a time. */
export function flushOutbox(): Promise<void> {
  if (!flushing)
    flushing = flushAll().finally(() => {
      flushing = null;
    });
  return flushing;
}

async function flushAll() {
  if (!loadedFor || typeof navigator === "undefined" || !navigator.onLine) return;
  for (const entry of sendOrder(entries, loadedFor)) {
    const { error } = await send(entry.action, entry.photo);
    const outcome: Outcome = outcomeOf(error, navigator.onLine);
    if (outcome === "retry") return;
    if (outcome === "sent") {
      await remove(entry.id);
      entries = entries.filter((e) => e.id !== entry.id);
    } else {
      const rejected: OutboxEntry = { ...entry, status: "rejected", error: friendlyError(error) };
      await put(rejected);
      entries = entries.map((e) => (e.id === entry.id ? rejected : e));
    }
    notify();
    void refresh(entry.action);
  }
}

/** The player read why a queued action was refused. */
export async function dismissRejected(id: string) {
  await remove(id);
  entries = entries.filter((e) => e.id !== id);
  notify();
}

type Result = { data: unknown; error: unknown };

/** Sends one action. Returns the server's reply; never throws. */
async function send(action: OutboxAction, photo: Blob | null): Promise<Result> {
  try {
    switch (action.kind) {
      case "answer_daily": {
        const { data, error } = await rpc("answer_daily", {
          p_item: action.item,
          p_choice: action.choice,
        });
        return { data: data?.[0] ?? null, error };
      }
      case "write_journal":
        return await rpc("write_journal", {
          p_item: action.item,
          p_body: action.body,
          p_choice: action.choice,
        });
      case "approve_proof":
        return await rpc("approve_proof", { p_proof: action.proof });
      case "submit_proof":
      case "submit_drop_proof": {
        if (photo && action.photoPath) {
          const up = await supabase.storage
            .from("quest-proofs")
            .upload(action.photoPath, photo, { contentType: photo.type || "image/jpeg" });
          if (up.error && !isDuplicateUpload(up.error)) return { data: null, error: up.error };
        }
        const { data, error } =
          action.kind === "submit_proof"
            ? await rpc("submit_proof", {
                p_item: action.item,
                p_photo_path: action.photoPath,
                p_body: action.body,
              })
            : await rpc("submit_drop_proof", {
                p_item: action.item,
                p_part: action.part,
                p_photo_path: action.photoPath,
                p_body: action.body,
              });
        if (!error && data && action.photoPath)
          await checkProof({ data: { proofId: data } }).catch(() => null);
        return { data, error };
      }
    }
  } catch (error) {
    return { data: null, error };
  }
}

/** After a queued action is sent (or refused), reload what it changed. */
function refresh(action: OutboxAction) {
  if (!client) return;
  const trip = ["trip", action.tripId] as const;
  const parts: Record<OutboxAction["kind"], string[]> = {
    answer_daily: ["daily-answers"],
    write_journal: ["journal", "guide"],
    submit_proof: ["proofs", "schedule"],
    submit_drop_proof: ["proofs"],
    approve_proof: ["crew-check"],
  };
  return Promise.all([
    ...parts[action.kind].map((p) => client!.invalidateQueries({ queryKey: [...trip, p] })),
    client.invalidateQueries({ queryKey: [...trip, "standings"] }),
  ]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in player's outbox: what's waiting to send and what the server refused. */
export function useOutbox(): readonly OutboxEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
}

/** The queued action for this ref (`refOf`), if one is waiting. */
export function usePendingAction(ref: string): OutboxEntry | undefined {
  return useOutbox().find((e) => e.status === "queued" && refOf(e.action) === ref);
}
