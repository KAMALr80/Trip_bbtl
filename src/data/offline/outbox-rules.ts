// The offline outbox's rules (M4-04): what can wait for the network, how queued actions replace
// each other, and what a reply from the server means. Pure, so they are unit-tested.
import { isNetworkError } from "./rules";

/** Actions a player can take with no network. Each is sent as-is once the network is back. */
export type OutboxAction =
  | { kind: "answer_daily"; tripId: string; item: string; choice: number | null }
  | { kind: "write_journal"; tripId: string; item: string; body: string; choice: number }
  | {
      kind: "submit_proof";
      tripId: string;
      item: string;
      body: string | null;
      /** Where the photo goes: chosen once, so a retried upload hits the same path. */
      photoPath: string | null;
    }
  | {
      kind: "submit_drop_proof";
      tripId: string;
      item: string;
      part: number;
      body: string | null;
      photoPath: string | null;
    }
  | { kind: "approve_proof"; tripId: string; proof: string };

export type OutboxEntry = {
  /** Client-made id: the idempotency key, and the photo's file name. */
  id: string;
  userId: string;
  createdAt: number;
  action: OutboxAction;
  /** The compressed photo, kept on the phone until it is uploaded. */
  photo: Blob | null;
  status: "queued" | "rejected";
  /** Why the server refused it (shown to the player). */
  error?: string;
};

/** What the action is about: one queued entry per ref. */
export function refOf(action: OutboxAction): string {
  switch (action.kind) {
    case "answer_daily":
    case "write_journal":
    case "submit_proof":
      return `${action.kind}:${action.item}`;
    case "submit_drop_proof":
      return `${action.kind}:${action.item}:${action.part}`;
    case "approve_proof":
      return `${action.kind}:${action.proof}`;
  }
}

/**
 * Adds an entry. A newer journal entry or proof for the same item replaces the queued one (the
 * player edited it), but a daily answer is never changed once given, and a 👍 is only sent once.
 */
export function enqueue(list: readonly OutboxEntry[], entry: OutboxEntry): OutboxEntry[] {
  const ref = refOf(entry.action);
  const same = list.find((e) => e.status === "queued" && refOf(e.action) === ref);
  if (same && (entry.action.kind === "answer_daily" || entry.action.kind === "approve_proof"))
    return [...list];
  return [...list.filter((e) => e !== same), entry];
}

/** The order to send in: oldest first, so a proof goes after the answer it followed. */
export function sendOrder(list: readonly OutboxEntry[], userId: string): OutboxEntry[] {
  return list
    .filter((e) => e.userId === userId && e.status === "queued")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export type Outcome =
  /** Done (or the server already had it): remove from the queue. */
  | "sent"
  /** Still no network: keep it and stop for now. */
  | "retry"
  /** The server said no (a deadline passed, the item changed): keep it to show the player why. */
  | "rejected";

/** Replies that mean an earlier try already reached the server. */
const ALREADY_DONE = [/already played this one/i];

export function outcomeOf(error: unknown, online = true): Outcome {
  if (!error) return "sent";
  if (isNetworkError(error, online)) return "retry";
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string" && ALREADY_DONE.some((re) => re.test(message))) return "sent";
  return "rejected";
}

/** A storage upload refused because the file is already there: an earlier try worked. */
export function isDuplicateUpload(error: unknown): boolean {
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown } | null;
  if (!e) return false;
  return (
    String(e.statusCode ?? e.status ?? "") === "409" ||
    (typeof e.message === "string" && /already exists|duplicate/i.test(e.message))
  );
}
