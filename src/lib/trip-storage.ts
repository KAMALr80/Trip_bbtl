// Trip files in Storage. Server side: the caller passes the service-role client.

/** The buckets that keep files under a `<tripId>/` folder. Deleting a trip empties each one (B-20). */
export const TRIP_FOLDER_BUCKETS = [
  "trip-photos",
  "player-avatars",
  "quest-proofs",
  "window-guide",
] as const;

const PAGE = 100;

type StorageLister = {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        options: { limit: number; offset: number },
      ) => PromiseLike<{
        data: { name: string; id: string | null }[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

/** Every file under a folder, any depth, across as many pages as it takes. */
async function listFolder(admin: StorageLister, bucket: string, prefix: string) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...(await listFolder(admin, bucket, path)));
    }
    if (!data || data.length < PAGE) return paths;
  }
}

/** A trip's files in every bucket that has a folder for it. */
export async function listTripFiles(admin: StorageLister, tripId: string) {
  const files: { bucket: string; paths: string[] }[] = [];
  for (const bucket of TRIP_FOLDER_BUCKETS)
    files.push({ bucket, paths: await listFolder(admin, bucket, tripId) });
  return files;
}
