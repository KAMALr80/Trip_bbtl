import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";

export const ROLE_TIPS: Record<
  "captain" | "co_captain",
  { title: string; emoji: string; tips: string[] }
> = {
  captain: {
    title: "You're the Captain!",
    emoji: "👑",
    tips: [
      "Add the itinerary in Captain Tools.",
      "Paste the call link for your Pre-Flight call nights.",
      "Set the mystery prizes for each season.",
      "Name a Co-Captain once your squad has joined.",
    ],
  },
  co_captain: {
    title: "You're a Co-Captain!",
    emoji: "⭐",
    tips: [
      "You help the Captain run the trip.",
      "You play and earn points the same way as everyone else.",
      "Your extra controls are in Me → Captain tools.",
    ],
  },
};

export function Motto({
  text,
  className = "",
}: {
  text?: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  return <p className={`italic text-green ${className}`}>“{text}”</p>;
}

function BottomSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/50" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-card rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft"
      >
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-5" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-5 top-5"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
        {children}
      </section>
    </div>
  );
}

/** One-time tips the first time someone becomes Captain or Co-Captain. */
export function RoleTips({ trip, userId }: { trip: TripWithRole; userId: string }) {
  const [seen, setSeen] = useState<string[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    void supabase
      .from("profiles")
      .select("seen_tips")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setSeen((data as { seen_tips?: string[] } | null)?.seen_tips ?? []));
  }, [userId]);
  const role = trip.myRole === "captain" || trip.myRole === "co_captain" ? trip.myRole : undefined;
  if (!role || !seen || seen.includes(role) || hidden.includes(role)) return null;
  const tip = ROLE_TIPS[role];
  async function done() {
    if (!role) return;
    const next = [...(seen ?? []), role];
    setHidden((h) => [...h, role]);
    setSeen(next);
    await supabase
      .from("profiles")
      .update({ seen_tips: next } as never)
      .eq("id", userId);
  }
  return (
    <BottomSheet label={tip.title} onClose={() => void done()}>
      <span className="text-5xl">{tip.emoji}</span>
      <h2 className="font-display text-3xl font-extrabold mt-2">{tip.title}</h2>
      <p className="text-muted-foreground mt-1">A few quick tips:</p>
      <ul className="mt-4 space-y-2">
        {tip.tips.map((s) => (
          <li key={s} className="rounded-2xl bg-blue-soft p-3 text-sm font-bold">
            {s}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground mt-4">
        You can find these anytime in Help → Roles.
      </p>
      <Button variant="playful" className="w-full mt-5" onClick={() => void done()}>
        Got it
      </Button>
    </BottomSheet>
  );
}
