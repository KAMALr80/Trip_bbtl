// Captain setup wizard data (M2-05): the draft saved after each screen, and creating the trip.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { SetupDraft } from "@/features/setup/wizard-model";
import { rpc } from "./rpc";

export async function loadDraft(userId: string): Promise<SetupDraft | null> {
  const { data } = await supabase
    .from("trip_drafts")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.data as SetupDraft | null) ?? null;
}

export async function saveDraft(draft: SetupDraft) {
  const { error } = await rpc("save_trip_draft", { p_data: draft as unknown as Json });
  if (error) throw error;
}

export async function discardDraft() {
  await rpc("discard_trip_draft");
}

export async function createTrip(setup: Record<string, unknown>): Promise<string> {
  const { data, error } = await rpc("create_trip_v2", { p_setup: setup as Json });
  if (error) throw error;
  return data as string;
}
