import { describe, expect, it } from "vitest";
import {
  enqueue,
  isDuplicateUpload,
  outcomeOf,
  refOf,
  sendOrder,
  type OutboxAction,
  type OutboxEntry,
} from "./outbox-rules";

let n = 0;
const entry = (action: OutboxAction, extra: Partial<OutboxEntry> = {}): OutboxEntry => ({
  id: `e${++n}`,
  userId: "me",
  createdAt: n,
  action,
  photo: null,
  status: "queued",
  ...extra,
});
const answer = (item: string, choice = 0): OutboxAction => ({
  kind: "answer_daily",
  tripId: "t",
  item,
  choice,
});
const journal = (item: string, body: string): OutboxAction => ({
  kind: "write_journal",
  tripId: "t",
  item,
  body,
  choice: 0,
});

describe("enqueue", () => {
  it("keeps the first daily answer: an answer is never changed once given", () => {
    const first = entry(answer("d1", 0));
    const list = enqueue(enqueue([], first), entry(answer("d1", 1)));
    expect(list).toEqual([first]);
  });

  it("sends a 👍 once", () => {
    const like = entry({ kind: "approve_proof", tripId: "t", proof: "p1" });
    expect(enqueue([like], entry({ kind: "approve_proof", tripId: "t", proof: "p1" }))).toEqual([
      like,
    ]);
  });

  it("replaces a queued journal entry the player edited", () => {
    const draft = entry(journal("j1", "first"));
    const edit = entry(journal("j1", "second"));
    expect(enqueue([draft], edit)).toEqual([edit]);
  });

  it("keeps different items and refused entries apart", () => {
    const refused = entry(journal("j1", "old"), { status: "rejected" });
    const a = entry(answer("d1"));
    const b = entry(journal("j1", "new"));
    expect(enqueue(enqueue([refused], a), b)).toEqual([refused, a, b]);
  });
});

describe("refOf", () => {
  it("names a drop proof by its square", () => {
    expect(
      refOf({
        kind: "submit_drop_proof",
        tripId: "t",
        item: "x",
        part: 3,
        body: null,
        photoPath: null,
      }),
    ).toBe("submit_drop_proof:x:3");
  });
});

describe("sendOrder", () => {
  it("sends this player's queued entries, oldest first", () => {
    const late = entry(answer("d2"), { createdAt: 20 });
    const early = entry(answer("d1"), { createdAt: 10 });
    const other = entry(answer("d3"), { userId: "someone", createdAt: 1 });
    const refused = entry(answer("d4"), { status: "rejected", createdAt: 2 });
    expect(sendOrder([late, other, early, refused], "me")).toEqual([early, late]);
  });
});

describe("outcomeOf", () => {
  it("removes sent actions, and ones an earlier try already delivered", () => {
    expect(outcomeOf(null)).toBe("sent");
    expect(outcomeOf({ message: "You've already played this one", code: "P0001" })).toBe("sent");
  });

  it("keeps actions for later when the network is still down", () => {
    expect(outcomeOf({ message: "TypeError: Failed to fetch", code: "" })).toBe("retry");
    expect(outcomeOf({ message: "That card has closed for the day" }, false)).toBe("retry");
  });

  it("shows the player why the server refused", () => {
    expect(outcomeOf({ message: "That card has closed for the day", code: "P0001" })).toBe(
      "rejected",
    );
    expect(outcomeOf({ message: "This drop has closed" })).toBe("rejected");
  });
});

describe("isDuplicateUpload", () => {
  it("treats 'already there' as uploaded", () => {
    expect(isDuplicateUpload({ statusCode: "409", message: "Duplicate" })).toBe(true);
    expect(isDuplicateUpload({ message: "The resource already exists" })).toBe(true);
    expect(
      isDuplicateUpload({ statusCode: "403", message: "new row violates row-level security" }),
    ).toBe(false);
    expect(isDuplicateUpload(null)).toBe(false);
  });
});
