// Trip files in Storage. Server side: the caller passes the service-role client.

/** The buckets that keep files under a `<tripId>/` folder (the Test Lab empties these for a sandbox). */
export const TRIP_FOLDER_BUCKETS = [
  "trip-photos",
  "player-avatars",
  "quest-proofs",
  "window-guide",
] as const;

const REMOVE_BATCH = 100;

type SweepClient = {
  rpc: (
    fn: "orphan_files",
    args: { p_limit: number },
  ) => PromiseLike<{
    data: { bucket: string; path: string }[] | null;
    error: { message: string } | null;
  }>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/**
 * Deletes files whose trip, card or experience no longer exists (B-27). The database decides what's
 * orphaned and keeps anything another row still points at. Nothing is remembered between runs: what
 * fails here is simply listed again by the next one, so this is safe to retry and to run twice.
 * Called after a trip is deleted and by the daily cleanup route, so it doesn't depend on any page
 * staying open.
 */
export async function sweepOrphanFiles(admin: SweepClient, limit = 1000) {
  const { data, error } = await admin.rpc("orphan_files", { p_limit: limit });
  if (error) return { listed: 0, removed: 0, failed: 0, error: error.message };
  const byBucket = new Map<string, string[]>();
  for (const row of data ?? [])
    byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);
  let removed = 0;
  let failed = 0;
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const batch = paths.slice(i, i + REMOVE_BATCH);
      try {
        const { data: gone, error: removeError } = await admin.storage.from(bucket).remove(batch);
        if (removeError) failed += batch.length;
        else removed += gone?.length ?? 0;
      } catch {
        failed += batch.length;
      }
    }
  }
  return { listed: data?.length ?? 0, removed, failed };
}
