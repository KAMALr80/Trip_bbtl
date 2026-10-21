import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
};

export type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);