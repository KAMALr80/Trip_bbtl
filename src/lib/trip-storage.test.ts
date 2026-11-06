import { describe, expect, it } from "vitest";
import { listTripFiles, TRIP_FOLDER_BUCKETS } from "./trip-storage";

const TRIP = "00000000-0000-4000-8000-0000000000a1";

/** A fake Storage: folders are entries without an id, as in the real list(). */
function fakeStorage(objects: Record<string, string[]>) {
  return {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string, { limit, offset }: { limit: number; offset: number }) => {
          const names = new Set<string>();
          for (const path of objects[bucket] ?? [])
            if (path.startsWith(`${prefix}/`))
              names.add(path.slice(prefix.length + 1).split("/")[0]!);
          const data = [...names].sort().map((name) => ({
            name,
            id: (objects[bucket] ?? []).includes(`${prefix}/${name}`) ? `id-${name}` : null,
          }));
          return { data: data.slice(offset, offset + limit), error: null };
        },
      }),
    },
  };
}

describe("listTripFiles (B-20)", () => {
  it("covers proof and guide photos, not only the older photo wall", () => {
    expect(TRIP_FOLDER_BUCKETS).toEqual(
      expect.arrayContaining(["trip-photos", "player-avatars", "quest-proofs", "window-guide"]),
    );
  });

  it("finds a trip's nested files in every bucket, and no other trip's", async () => {
    const proof = `${TRIP}/user-1/item-1/a.jpg`;
    const guide = `${TRIP}/user-1/g.jpg`;
    const files = await listTripFiles(
      fakeStorage({
        "quest-proofs": [proof, "other-trip/user-1/item-1/secret.jpg"],
        "window-guide": [guide],
      }),
      TRIP,
    );
    const byBucket = Object.fromEntries(files.map((f) => [f.bucket, f.paths]));
    expect(byBucket["quest-proofs"]).toEqual([proof]);
    expect(byBucket["window-guide"]).toEqual([guide]);
    expect(byBucket["trip-photos"]).toEqual([]);
  });

  it("reads past the first page", async () => {
    const many = Array.from(
      { length: 250 },
      (_, i) => `${TRIP}/u/${String(i).padStart(3, "0")}.jpg`,
    );
    const files = await listTripFiles(fakeStorage({ "trip-photos": many }), TRIP);
    expect(files.find((f) => f.bucket === "trip-photos")?.paths).toHaveLength(250);
  });

  it("stops rather than deleting from a partial list when Storage fails", async () => {
    const failing = {
      storage: {
        from: () => ({ list: async () => ({ data: null, error: { message: "storage down" } }) }),
      },
    };
    await expect(listTripFiles(failing, TRIP)).rejects.toThrow("storage down");
  });
});
