import founderLabIcon from "@/assets/founder-test-lab.webp";
import founderFeedbackIcon from "@/assets/founder-feedback.webp";
import founderReportsIcon from "@/assets/founder-reports.webp";
import founderFeaturesIcon from "@/assets/founder-features.webp";
import founderMembersIcon from "@/assets/founder-members.webp";
import founderLaunchIcon from "@/assets/founder-launch.webp";

import { tripDisplayName } from "@/lib/trip-display-name";

import { useEffect, useState } from "react";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

import { type TripWithRole } from "@/lib/trips";

import { LaunchSwitch } from "@/features/onboarding/BetaAccess";

export function FounderDashboard({
  trips,
  onOpen,
}: {
  trips: TripWithRole[];
  onOpen: (key: string) => void;
}) {
  const [counts, setCounts] = useState<{ trips: number; testers: number; reports: number } | null>(
    null,
  );
  const [allTrips, setAllTrips] = useState<{ name: string; start_date: string }[] | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([
      supabase.rpc("founder_trips"),
      supabase.rpc("founder_age_tiers"),
      supabase.rpc("founder_bug_reports"),
    ]).then(([list, ages, reports]) => {
      if (!live) return;
      const real = (list.data ?? []).filter((t) => !t.is_sandbox);
      setAllTrips(list.data ? real : null);
      setCounts({
        trips: list.data ? real.length : trips.length,
        testers: (ages.data ?? []).reduce((sum, x) => sum + Number(x.people ?? 0), 0),
        reports: (reports.data ?? []).length,
      });
    });
    return () => {
      live = false;
    };
  }, [trips.length]);
  const tools: [string, string, string][] = [
    ["Test Lab", founderLabIcon, "lab"],
    ["Feedback", founderFeedbackIcon, "feedback"],
    ["Reports", founderReportsIcon, "reports"],
    ["Founding Members", founderMembersIcon, "founding-members"],
    ["Public launch", founderLaunchIcon, "me-explore"],
    ["Beta codes", founderLaunchIcon, "beta-codes"],
    ["AI", founderFeaturesIcon, "ai-guard"],
  ];
  const next = [...(allTrips ?? trips)]
    .filter((t) => new Date(t.start_date + "T23:59:59").getTime() >= Date.now())
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((t) => ({ name: t.name, starts_at: t.start_date + "T12:00:00Z" }))[0];
  return (
    <section className="cinematic-founder mt-8">
      <p className="eyebrow text-gold">CONTROL TOWER</p>
      <h2 className="font-display text-3xl font-extrabold mt-1">Founder tools</h2>
      <div className="cinematic-founder-stats">
        <span>
          <b>{counts?.trips ?? "—"}</b>Trips
        </span>
        <span>
          <b>{counts?.testers ?? "—"}</b>Testers
        </span>
        <span>
          <b>{counts?.reports ?? "—"}</b>Reports
        </span>
      </div>
      <p className="cinematic-founder-departure">
        NEXT DEPARTURE · <strong>{next ? tripDisplayName(next.name) : "AWAITING A TRIP"}</strong> ·{" "}
        {next
          ? new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })
              .format(new Date(next.starts_at))
              .toUpperCase()
          : "NO DATE SET"}
      </p>
      <div className="cinematic-founder-tools">
        {tools.map(([label, icon, key]) => (
          <Button
            variant="outline"
            key={label}
            onClick={() => (key === "me-explore" ? setLaunchOpen((v) => !v) : onOpen(key))}
          >
            <img src={icon} alt="" />
            <span>{label}</span>
            <ChevronRight size={17} />
          </Button>
        ))}
      </div>
      {launchOpen && (
        <div className="mt-3">
          <LaunchSwitch />
        </div>
      )}
    </section>
  );
}
