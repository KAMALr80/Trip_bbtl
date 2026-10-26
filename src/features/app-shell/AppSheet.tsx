import { useState } from "react";

import { ChevronRight, Plus, X, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadTrip } from "@/data/account";

import { TripSheets } from "@/features/setup/TripSheets";
import { SeatCap } from "@/features/trip/SeatCap";
import { InviteCode } from "@/features/trip/InviteCode";

import { inviteUrl, shareInvite, type TripWithRole } from "@/lib/trips";
import { Clipboard, Share2 } from "lucide-react";

import { AtHomeSetup } from "@/features/at-home/AtHome";

export function AppSheet({
  title,
  onClose,
  onSelect,
  onDone,
  active,
}: {
  title: string | null;
  onClose: () => void;
  onSelect: (value: string) => void;
  onDone: (id: string) => void;
  active: TripWithRole | null;
}) {
  const [copied, setCopied] = useState(false);
  if (title === "Start a trip" || title === "Join a trip" || title === "celebrate")
    return (
      <TripSheets
        key={title}
        mode={title === "Start a trip" ? "create" : title === "Join a trip" ? "join" : "celebrate"}
        trip={active}
        onClose={onClose}
        onDone={onDone}
      />
    );
  if (title === "At Home")
    return (
      <AtHomeSetup
        onClose={onClose}
        onDone={onDone}
        loadTrip={async (id) => {
          const data = await loadTrip(id);
          return data ? ({ ...data, myRole: "captain" } as TripWithRole) : null;
        }}
      />
    );
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg bg-card rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft"
      >
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-6" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-5 right-5"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
        {title === "Invite" && active ? (
          <>
            <span className="text-4xl">💌</span>
            <h2 className="font-display font-extrabold text-3xl mt-3">Bring your people.</h2>
            <p className="text-muted-foreground mt-2">
              Anyone in your squad can share this invite.
            </p>
            <div className="mt-6 rounded-2xl bg-pink-soft p-5 text-center">
              <p className="text-xs font-extrabold">JOIN CODE</p>
              <div className="mt-3">
                <InviteCode code={active.join_code} />
              </div>
            </div>
            <SeatCap
              tripId={active.id}
              isCaptain={active.myRole === "captain"}
              room={active.kind === "at_home" || active.a2e_room ? "culture" : "trip"}
            />
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl(active.join_code));
                  setCopied(true);
                }}
              >
                <Clipboard />
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button
                variant="playful"
                onClick={async () => {
                  if ((await shareInvite(active.join_code, active.name)) === "copied")
                    setCopied(true);
                }}
              >
                <Share2 />
                Share
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-4xl">✨</span>
            <h2 className="font-display font-extrabold text-3xl mt-3">What are we doing?</h2>
            <div className="grid gap-3 mt-6">
              <Button
                variant="subtle"
                className="justify-between h-14"
                onClick={() => onSelect("Start a trip")}
              >
                <span className="flex gap-3 items-center">
                  <Plus /> Start a trip
                </span>
                <ChevronRight />
              </Button>
              <Button
                variant="subtle"
                className="justify-between h-14"
                onClick={() => onSelect("At Home")}
              >
                <span className="flex gap-3 items-center">Start an At Home experience</span>
                <ChevronRight />
              </Button>
              <Button
                variant="subtle"
                className="justify-between h-14"
                onClick={() => onSelect("Join a trip")}
              >
                <span className="flex gap-3 items-center">
                  <Ticket /> Join a trip
                </span>
                <ChevronRight />
              </Button>
              {active && (
                <Button
                  variant="subtle"
                  className="justify-between h-14"
                  onClick={() => onSelect("Invite")}
                >
                  <span className="flex gap-3 items-center">
                    <Share2 /> Share invite
                  </span>
                  <ChevronRight />
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
