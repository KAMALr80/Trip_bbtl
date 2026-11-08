// The name a player gives before asking to join (N-2). Pre-filled from their card when they have one;
// whatever they have already typed wins over a profile that loads late.
import { useEffect, useState } from "react";
import { loadPlayerProfile } from "@/data/account";
import { useAuth } from "@/lib/auth-context";
import { cleanJoinName, joinNameIsValid } from "@/lib/join-name";

export function useJoinName() {
  const { user } = useAuth();
  const userId = user?.id;
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void loadPlayerProfile(userId).then((profile) => {
      if (alive && profile?.game_name) setValue((typed) => typed || profile.game_name);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return {
    value,
    onChange: setValue,
    clean: cleanJoinName(value),
    valid: joinNameIsValid(value),
  };
}
