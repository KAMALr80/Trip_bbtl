import type { QueryClient } from "@tanstack/react-query";
import { releasePushOnThisDevice } from "@/pwa/push";
import { clearOutbox } from "./outbox";
import { dropSnapshot } from "./snapshot";

/**
 * Everything this device keeps for the signed-in player goes when they sign out or the server
 * no longer knows them: the offline snapshot, the outbox, the in-memory query cache and the push
 * subscription. Keys such as ["profile"] or a trip's own journal aren't per user, so after a
 * sign-out without a reload (an expired session) the next account would otherwise see them until
 * they refetch; and a shared phone would keep receiving the last player's reminders.
 */
export function forgetAccount(queryClient: QueryClient) {
  // dropSnapshot stops saving the cache before its first await, so clearing it below writes nothing.
  void dropSnapshot().then(clearOutbox);
  queryClient.clear();
  void releasePushOnThisDevice().catch(() => undefined);
}
