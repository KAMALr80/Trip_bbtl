import { supabase } from "@/integrations/supabase/client";

type Pending = {
  key: string;
  userId: string;
  tripId: string;
  date: string;
  square: number;
  file: Blob;
};
const STORE = "proofs";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tripjunkies-bingo-proofs", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function operation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
export const bingoProofKey = (userId: string, tripId: string, date: string, square: number) =>
  `${userId}:${tripId}:${date}:${square}`;
export async function savePendingBingo(row: Pending) {
  await operation("readwrite", (store) => store.put(row));
}
export async function pendingBingo(key: string): Promise<Pending | undefined> {
  return operation("readonly", (store) => store.get(key));
}
export async function retryBingoProof(key: string) {
  const row = await pendingBingo(key);
  if (!row) return false;
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user?.id !== row.userId) return false;
  const path = `${row.tripId}/${row.userId}/${row.date}-${crypto.randomUUID()}.${row.file.type === "image/webp" ? "webp" : "jpg"}`;
  const uploaded = await supabase.storage
    .from("trip-photos")
    .upload(path, row.file, { contentType: row.file.type });
  if (uploaded.error) return false;
  const result = await supabase.rpc("mark_bingo", {
    p_trip: row.tripId,
    p_date: row.date,
    p_square: row.square,
    p_photo: path,
  });
  if (result.error) {
    await supabase.storage.from("trip-photos").remove([path]);
    return false;
  }
  await operation("readwrite", (store) => store.delete(key));
  return true;
}
export async function countPendingBingo(userId: string): Promise<number> {
  const rows = await operation<Pending[]>("readonly", (store) => store.getAll());
  return rows.filter((row) => row.userId === userId).length;
}
