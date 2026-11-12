import { describe, expect, it, vi } from "vitest";
import { sweepOrphanFiles, TRIP_FOLDER_BUCKETS } from "./trip-storage";

type Row = { bucket: string; path: string };

/** A fake service-role client: the database lists `rows`; Storage removes them unless told to fail. */
function fakeAdmin(rows: Row[], failing: { bucket?: string; throws?: boolean } = {}) {
  const stored = [...rows];
  const removeCalls: { bucket: string; paths: string[] }[] = [];
  const admin = {
    rpc: vi.fn(async () => ({ data: [...stored], error: null })),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removeCalls.push({ bucket, paths });
          if (failing.throws) throw new Error("network");
          if (failing.bucket === bucket) return { data: null, error: { message: "storage down" } };
          for (const p of paths) {
            const i = stored.findIndex((r) => r.bucket === bucket && r.path === p);
            if (i >= 0) stored.splice(i, 1);
          }
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  return { admin, removeCalls, stored };
}

const rows: Row[] = [
  { bucket: "quest-proofs", path: "t1/u/i/a.jpg" },
  { bucket: "quest-proofs", path: "t1/u/i/b.jpg" },
  { bucket: "window-guide", path: "t1/u/g.jpg" },
];

describe("sweepOrphanFiles (B-27)", () => {
  it("deletes only what the database listed, bucket by bucket", async () => {
    const { admin, removeCalls, stored } = fakeAdmin(rows);
    expect(await sweepOrphanFiles(admin)).toEqual({ listed: 3, removed: 3, failed: 0 });
    expect(removeCalls).toEqual([
      { bucket: "quest-proofs", paths: ["t1/u/i/a.jpg", "t1/u/i/b.jpg"] },
      { bucket: "window-guide", paths: ["t1/u/g.jpg"] },
    ]);
    expect(stored).toEqual([]);
  });

  it("with nothing orphaned, it removes nothing", async () => {
    const { admin, removeCalls } = fakeAdmin([]);
    expect(await sweepOrphanFiles(admin)).toEqual({ listed: 0, removed: 0, failed: 0 });
    expect(removeCalls).toEqual([]);
  });

  it("if the list fails, it deletes nothing", async () => {
    const { admin, removeCalls } = fakeAdmin(rows);
    admin.rpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } } as never);
    expect(await sweepOrphanFiles(admin)).toMatchObject({ removed: 0, error: "db down" });
    expect(removeCalls).toEqual([]);
  });

  it("a Storage failure doesn't stop the other buckets, and the next run retries", async () => {
    const { admin, stored } = fakeAdmin(rows, { bucket: "quest-proofs" });
    expect(await sweepOrphanFiles(admin)).toEqual({ listed: 3, removed: 1, failed: 2 });
    expect(stored.map((r) => r.path)).toEqual(["t1/u/i/a.jpg", "t1/u/i/b.jpg"]);

    // The next run lists what's left and finishes the job.
    const retry = fakeAdmin(stored);
    expect(await sweepOrphanFiles(retry.admin)).toEqual({ listed: 2, removed: 2, failed: 0 });
    expect(retry.stored).toEqual([]);
  });

  it("a thrown network error counts as failed, not as a crash", async () => {
    const { admin } = fakeAdmin(rows, { throws: true });
    expect(await sweepOrphanFiles(admin)).toEqual({ listed: 3, removed: 0, failed: 3 });
  });

  it("running it twice is harmless", async () => {
    const { admin } = fakeAdmin(rows);
    await sweepOrphanFiles(admin);
    expect(await sweepOrphanFiles(admin)).toEqual({ listed: 0, removed: 0, failed: 0 });
  });

  it("removes in batches", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      bucket: "trip-photos",
      path: `t/${i}.jpg`,
    }));
    const { admin, removeCalls } = fakeAdmin(many);
    expect(await sweepOrphanFiles(admin)).toMatchObject({ removed: 250, failed: 0 });
    expect(removeCalls.map((c) => c.paths.length)).toEqual([100, 100, 50]);
  });

  it("the Test Lab's bucket list covers proof and guide photos", () => {
    expect(TRIP_FOLDER_BUCKETS).toEqual(
      expect.arrayContaining(["trip-photos", "player-avatars", "quest-proofs", "window-guide"]),
    );
  });
});
