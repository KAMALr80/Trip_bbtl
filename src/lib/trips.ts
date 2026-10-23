import type { Tables } from "@/integrations/supabase/types";

export type Trip = Tables<"trips">;
export type Member = {
  user_id: string;
  role: string;
  display_name: string | null;
  avatar_url: string | null;
  joined_at: string;
};
export type TripWithRole = Trip & { myRole: string };

export function inviteUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}
export async function shareInvite(code: string, name: string) {
  const url = inviteUrl(code);
  if (navigator.share) {
    try {
      await navigator.share({
        title: `Join ${name} on TripJunkies`,
        text: `You're invited to ${name}!`,
        url,
      });
      return "shared";
    } catch (error) {
      if ((error as Error).name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
