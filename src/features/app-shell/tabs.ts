import { Home, Users, UserRound, CalendarDays, Play } from "lucide-react";

export const tabs = [
  { name: "Home", icon: Home },
  { name: "Play", icon: Play },
  { name: "Trip", icon: CalendarDays },
  { name: "Squad", icon: Users },
  { name: "Me", icon: UserRound },
] as const;

export type Tab = (typeof tabs)[number]["name"];
