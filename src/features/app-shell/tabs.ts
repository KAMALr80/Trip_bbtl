// Bottom tab bar (Q6): Home · Play · Trip · Me. The crew list lives in Trip.
import { Home, UserRound, CalendarDays, Play } from "lucide-react";

export const tabs = [
  { name: "Home", icon: Home },
  { name: "Play", icon: Play },
  { name: "Trip", icon: CalendarDays },
  { name: "Me", icon: UserRound },
] as const;

export type Tab = (typeof tabs)[number]["name"];
