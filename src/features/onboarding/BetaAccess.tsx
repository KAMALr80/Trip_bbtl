import { rpcByName } from "@/data/rpc";
import { rpc } from "@/data/rpc";
import { TripPeekCard } from "@/features/trip/TripList";
import { BetaCodeField, WaitlistField } from "@/features/admin/BetaCodes";
import { GameArcade } from "@/features/play/GameArcade";
import { tripDisplayName } from "@/lib/trip-display-name";
import { confirmInApp } from "@/lib/confirm";
import { readPendingCode } from "@/lib/pending-code";

import { WelcomeLockup } from "@/features/onboarding/WelcomeLockup";
import { friendlyError } from "@/lib/friendly-error";
import { localToday } from "@/lib/itinerary";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { WelcomeExtras } from "@/features/onboarding/WelcomeCopy";
import { canApproveMember } from "@/lib/member-approval";
import { JoinNameField } from "@/features/trip/JoinNameField";
import { useJoinName } from "@/features/trip/use-join-name";
import signinFriends from "@/assets/signin-night-friends.jpg";

export type Vibe = "family" | "chill" | "party";
export const VIBES: Record<Vibe, { emoji: string; label: string; line: string; color: string }> = {
  family: {
    emoji: "👨‍👩‍👧",
    label: "Family",
    line: "All ages. No drinking or party cards.",
    color: "text-green",
  },
  chill: {
    emoji: "😎",
    label: "Chill",
    line: "Adult-friendly. Drink cards swap to alternatives for teens and anyone who opts out.",
    color: "text-blue",
  },
  party: {
    emoji: "🎉",
    label: "Party",
    line: "Bolder party cards for approved 21+ players. Everyone else gets alternatives.",
    color: "text-primary",
  },
};
export const vibeOf = (t: unknown): Vibe => (t as { vibe?: Vibe } | null)?.vibe ?? "chill";

export function VibeBadge({ vibe }: { vibe: Vibe }) {
  const v = VIBES[vibe];
  return (
    <span className={`vibe-badge neon-chip ${v.color}`} aria-label={`Trip vibe: ${v.label}`}>
      {v.emoji} {v.label}
    </span>
  );
}

export function VibePicker({
  value,
  onChange,
  disabled,
}: {
  value: Vibe;
  onChange: (v: Vibe) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Trip vibe">
      {(Object.keys(VIBES) as Vibe[]).map((k) => {
        const v = VIBES[k];
        return (
          <Button
            key={k}
            type="button"
            role="radio"
            aria-checked={value === k}
            disabled={disabled}
            variant={value === k ? "subtle" : "outline"}
            className="h-auto min-h-16 justify-start text-left whitespace-normal px-4 py-3"
            onClick={() => onChange(k)}
          >
            <span className="text-2xl mr-3">{v.emoji}</span>
            <span className="min-w-0">
              <span className="block font-display font-extrabold">{v.label}</span>
              <span className="block text-xs font-normal text-muted-foreground">{v.line}</span>
            </span>
            {value === k && <Check className="ml-auto shrink-0" />}
          </Button>
        );
      })}
    </div>
  );
}

export function TripVibeTools({
  trip,
  onSaved,
}: {
  trip: { id: string; vibe?: string };
  onSaved: () => void | Promise<void>;
}) {
  const [vibe, setVibe] = useState<Vibe>(vibeOf(trip));
  const [msg, setMsg] = useState("");
  async function pick(v: Vibe) {
    setVibe(v);
    setMsg("");
    const r = await rpc("set_trip_vibe", { p_trip: trip.id, p_vibe: v });
    if (r.error) setMsg(friendlyError(r.error));
    else {
      setMsg(`Vibe set to ${VIBES[v].label} ${VIBES[v].emoji}`);
      await onSaved();
    }
  }
  return (
    <div className="mt-3">
      <VibePicker value={vibe} onChange={(v) => void pick(v)} />
      <p className="mt-2 text-xs text-muted-foreground">
        21+ cards still need your approval for each player in the Party vibe.
      </p>
      {msg && (
        <p role="status" className="mt-2 text-sm font-bold text-green">
          {msg}
        </p>
      )}
    </div>
  );
}

export function BetaLock({
  onLogin,
  onExplore,
  onStory,
  signedIn,
  onRedeemed,
  onGames,
  notice,
}: {
  onLogin?: () => void;
  onExplore?: () => void;
  onStory?: () => void;
  signedIn?: boolean;
  onRedeemed?: (() => void) | undefined;
  onGames?: () => void;
  notice?: string | undefined;
}) {
  return (
    <main className="min-h-dvh max-w-lg mx-auto flex flex-col items-center px-6 pb-10 text-center">
      <div className="night-welcome-art w-[calc(100%+3rem)] !mx-[-1.5rem] !mt-0">
        <img
          src={signinFriends}
          alt="Five adult friends traveling together at night"
          width={1408}
          height={912}
        />
      </div>
      <WelcomeLockup />
      {signedIn ? (
        <>
          <h1 className="mt-5 font-display text-2xl font-extrabold">
            TripJunkies is in private beta.
          </h1>
          {/* Why their link didn't let them in — otherwise this screen is a dead end. */}
          {notice && (
            <p
              role="alert"
              className="mt-4 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-ink-soft"
            >
              {notice} Enter a new code below, or ask Ty for one.
            </p>
          )}
          <div className="mt-5 w-full">
            <BetaCodeField signedIn onRedeemed={onRedeemed} />
          </div>
          <div className="mt-5 w-full">
            <WaitlistField />
          </div>
          {onGames && (
            <Button variant="playful" size="lg" className="mt-6 w-full" onClick={onGames}>
              🎮 Play Games on Flight (free)
            </Button>
          )}
          {/* Someone waiting behind the beta wall is the most curious reader there is — give them the story. */}
          <Link
            to="/about"
            className="mt-5 min-h-11 inline-flex items-center justify-center text-sm font-semibold text-primary underline"
          >
            Our story ›
          </Link>
          <Button
            variant="link"
            className="mt-2 min-h-11"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.assign("/");
            }}
          >
            Sign out
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="playful"
            size="lg"
            className="night-primary mt-8 w-full"
            onClick={onLogin}
          >
            Log in
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            No invite yet? Ask your trip's Captain, or{" "}
            <Button variant="link" className="p-0 h-auto text-sm" onClick={onExplore}>
              take a look around.
            </Button>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">✦ Founding Member access during beta</p>
          <div className="w-full">
            <WelcomeExtras onStory={onStory ?? (() => onExplore?.())} />
          </div>
        </>
      )}
    </main>
  );
}

export function PrivacyPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="pb-8">
      <Button variant="ghost" className="-ml-2" onClick={onBack}>
        <ArrowLeft /> Back
      </Button>
      <h1 className="font-display text-3xl font-extrabold mt-2">What we collect and why</h1>
      <div className="mt-4 space-y-3 text-sm leading-relaxed">
        {[
          ["Your account", "Your email (or Google sign-in) so you can log in. We never sell it."],
          [
            "Your date of birth",
            "To confirm the account holder is 13+ (teens get Family content only) and keep 21+ content for verified adults. It stays private: Captains only see an age range (Teen, 18–20 or 21+).",
          ],
          [
            "Your player card",
            "The name, avatar and fun facts you choose, shown only to people in your trips.",
          ],
          [
            "Photos you upload",
            "Shared only with your trip, kept private with expiring links, and cleared after the trip's retention period.",
          ],
          [
            "Game activity",
            "Answers, votes, stamps and costs you track, so the games work. Ballots stay anonymous until the reveal.",
          ],
          [
            "Card ratings",
            "If you tap 👍 or 👎 on a card or challenge, we save only the item and the vote — never who rated it.",
          ],
          [
            "No alcohol setting",
            "Only you can see it. It just swaps drink cards for alternatives.",
          ],
          [
            "Deleting",
            "You can delete your account any time from Me › Settings, which removes your data and photos.",
          ],
        ].map(([t, c]) => (
          <div key={t} className="app-card">
            <h2 className="font-display font-extrabold">{t}</h2>
            <p className="mt-1 text-muted-foreground">{c}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgeGate({ onDone }: { onDone: () => void }) {
  const [dob, setDob] = useState("");
  const [agree, setAgree] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (privacy)
    return (
      <main className="min-h-dvh max-w-lg mx-auto px-6 pt-8">
        <PrivacyPage onBack={() => setPrivacy(false)} />
      </main>
    );
  return (
    <main className="min-h-dvh max-w-lg mx-auto flex flex-col justify-center px-6 py-10">
      <p className="eyebrow">ONE QUICK THING</p>
      <h1 className="font-display text-3xl font-extrabold mt-2">When's your birthday? 🎂</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It stays private. Captains only see an age range, so the games fit everyone.
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg("");
          const code = readPendingCode();
          const r = code
            ? await rpc("set_teen_dob", { p_dob: dob, p_agree: agree, p_invite: code })
            : await rpc("set_my_dob", { p_dob: dob, p_agree: agree });
          setBusy(false);
          if (r.error) setMsg(friendlyError(r.error));
          else onDone();
        }}
      >
        <label className="block">
          <span className="text-sm font-bold">Date of birth</span>
          <input
            type="date"
            required
            value={dob}
            max={localToday()}
            onChange={(e) => setDob(e.target.value)}
            className="mt-1 w-full h-13 px-4 rounded-2xl border border-border bg-card outline-none focus:border-primary"
          />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-[var(--primary)]"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          <span>
            My birthday is real (ages 13 and up; 13–17 join a trip with their Captain's code and
            approval) and I agree to{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-blue"
              onClick={() => setPrivacy(true)}
            >
              what TripJunkies collects and why
            </Button>
            .
          </span>
        </label>
        {msg && (
          <p role="alert" className="text-sm text-destructive">
            {msg}
          </p>
        )}
        <Button
          type="submit"
          variant="playful"
          size="lg"
          className="w-full"
          disabled={busy || !dob || !agree}
        >
          {busy ? "Saving…" : "Continue"}
        </Button>
      </form>
    </main>
  );
}

export function WaitingTrips() {
  const [rows, setRows] = useState<{ trip_id: string; name: string; destination: string }[]>([]);
  const [peeks, setPeeks] = useState<Record<string, any>>({});
  useEffect(() => {
    const load = () =>
      void rpc("my_waiting_trips").then(async (r) => {
        const next = r.data ?? [];
        setRows(next);
        const got = await Promise.all(
          next.map((w: { trip_id: string }) => rpc("trip_peek", { p_trip: w.trip_id })),
        );
        setPeeks(
          Object.fromEntries(
            next.map((w: { trip_id: string }, i: number) => [w.trip_id, got[i]?.data]),
          ),
        );
      });
    load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, []);
  if (!rows.length) return null;
  return (
    <div className="space-y-3 mb-4">
      {rows.map((r) =>
        peeks[r.trip_id] ? (
          <TripPeekCard key={r.trip_id} peek={peeks[r.trip_id]} />
        ) : (
          <div key={r.trip_id} className="app-card text-center">
            <h2 className="font-display text-xl font-extrabold">Waiting for your Captain</h2>
            <p className="text-sm text-muted-foreground mt-1">
              You asked to join <b>{tripDisplayName(r.name)}</b>.
            </p>
          </div>
        ),
      )}
    </div>
  );
}

/** Signed-in without beta: waiting members land on their trip teaser instead of the private-beta screen. */
export function WaitingGate({
  onRedeemed,
  notice,
}: {
  onRedeemed?: (() => void) | undefined;
  notice?: string;
}) {
  const [has, setHas] = useState<boolean | null>(null);
  const [games, setGames] = useState(false);
  useEffect(() => {
    void rpc("my_waiting_trips").then((r) => setHas(!!r.data?.length));
  }, []);
  if (has === null) return null;
  if (games)
    return (
      <main className="min-h-dvh max-w-lg mx-auto px-[18px] pt-[max(1rem,env(safe-area-inset-top))] pb-8">
        <GameArcade guest onBack={() => setGames(false)} />
      </main>
    );
  if (!has)
    return (
      <BetaLock signedIn notice={notice} onRedeemed={onRedeemed} onGames={() => setGames(true)} />
    );
  return (
    <main className="min-h-dvh max-w-lg mx-auto px-[18px] pt-[max(2rem,env(safe-area-inset-top))] pb-8">
      <p className="eyebrow">TRIPJUNKIES</p>
      <h1 className="font-display text-3xl font-extrabold mt-2 mb-5">Almost boarding</h1>
      <WaitingTrips />
    </main>
  );
}

type Pending = {
  user_id: string;
  name: string;
  avatar_style: string;
  avatar_seed: string;
  age_range: string;
};
type Invite = {
  id: string;
  teen?: boolean;
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  cancelled_at: string | null;
};

export function TripAccessTools({
  trip,
  avatarUrl,
  onSaved,
}: {
  trip: {
    id: string;
    join_code: string;
    join_code_enabled?: boolean;
    require_approval?: boolean;
    join_locked?: boolean;
    max_squad?: number;
    myRole: string;
  };
  avatarUrl: (style: string, seed: string) => string;
  onSaved: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [msg, setMsg] = useState("");
  const isCaptain = trip.myRole === "captain";
  async function load() {
    const [p, i] = await Promise.all([
      rpc("pending_members", { p_trip: trip.id }),
      (supabase as any)
        .from("trip_invites")
        .select("*")
        .eq("trip_id", trip.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setPending(p.data ?? []);
    setInvites(i.data ?? []);
  }
  useEffect(() => {
    void load();
  }, [trip.id]);
  async function call(n: string, a: object, ok: string) {
    setMsg("");
    const r = await rpcByName(n, a);
    if (r.error) {
      setMsg(friendlyError(r.error));
      return null;
    }
    setMsg(ok);
    await load();
    return r.data;
  }
  async function invite() {
    const tok = await call("create_trip_invite", { p_trip: trip.id }, "Invite link created");
    if (!tok) return;
    const url = `${window.location.origin}/join/${tok}`;
    try {
      if (navigator.share) await navigator.share({ title: "Join my trip on TripJunkies", url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg("Invite link copied 📋 · single use · expires in 7 days");
      }
    } catch {
      /* cancelled */
    }
  }
  const [teenOpen, setTeenOpen] = useState(false),
    [guardian, setGuardian] = useState(false);
  async function teenInvite() {
    const tok = await call(
      "create_teen_invite",
      { p_trip: trip.id, p_guardian: guardian },
      "Teen invite created",
    );
    if (!tok) return;
    setTeenOpen(false);
    setGuardian(false);
    const url = `${window.location.origin}/join/${tok}`;
    try {
      if (navigator.share) await navigator.share({ title: "Your teen invite to TripJunkies", url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg("Teen invite copied 📋 · single use · expires in 7 days");
      }
    } catch {
      /* cancelled */
    }
  }
  const status = (i: Invite) =>
    i.used_at
      ? ["Joined", "text-green"]
      : i.cancelled_at
        ? ["Cancelled", "text-muted-foreground"]
        : Date.parse(i.expires_at) <= Date.now()
          ? ["Expired", "text-muted-foreground"]
          : ["Unused", "text-orange"];
  return (
    <div className="mt-3 space-y-4">
      {msg && (
        <p role="status" className="text-sm font-bold text-green">
          {msg}
        </p>
      )}
      {pending.length > 0 && (
        <div>
          <h3 className="font-display font-extrabold">Waiting for approval ({pending.length})</h3>
          <div className="mt-2 space-y-2">
            {pending.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3"
              >
                <img
                  src={avatarUrl(p.avatar_style, p.avatar_seed)}
                  alt=""
                  className="size-11 rounded-full bg-muted"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-bold truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.age_range}</p>
                </div>
                {canApproveMember(trip.myRole, p.age_range) ? (
                  <>
                    <Button
                      size="sm"
                      variant="green"
                      onClick={() =>
                        void call(
                          "approve_member",
                          { p_trip: trip.id, p_user: p.user_id, p_approve: true },
                          `${p.name} approved ✓`,
                        ).then(() => onSaved())
                      }
                    >
                      <Check /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Decline ${p.name}`}
                      onClick={async () => {
                        if (await confirmInApp(`Decline ${p.name}?`))
                          void call(
                            "approve_member",
                            { p_trip: trip.id, p_user: p.user_id, p_approve: false },
                            "Request declined",
                          );
                      }}
                    >
                      <X />
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Captain approves</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <Button variant="playful" className="w-full" onClick={() => void invite()}>
        💌 Invite someone
      </Button>
      <p className="text-xs text-muted-foreground -mt-2">
        Each link works once and expires after 7 days. Players 18–20 always wait for your approval.
      </p>
      {isCaptain &&
        (teenOpen ? (
          <div className="bg-card border border-border rounded-2xl p-3 space-y-3">
            <p className="font-bold">Teen invite (ages 13–17)</p>
            <p className="text-xs text-muted-foreground">
              Teens can only sign up with this link. Family-safe content only; you still approve
              them after they join.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-[var(--primary)]"
                checked={guardian}
                onChange={(e) => setGuardian(e.target.checked)}
              />
              <span>I'm this player's parent/guardian or have their parent's permission.</span>
            </label>
            <div className="flex gap-2">
              <Button
                variant="playful"
                className="flex-1"
                disabled={!guardian}
                onClick={() => void teenInvite()}
              >
                Create teen link
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTeenOpen(false);
                  setGuardian(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setTeenOpen(true)}>
            🧒 Invite a teen (13–17)
          </Button>
        ))}
      {invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((i) => {
            const [label, color] = status(i);
            return (
              <div
                key={i.id}
                className="flex items-center gap-2 text-sm bg-card border border-border rounded-2xl px-3 py-2"
              >
                <span className="font-mono text-xs">{i.token.slice(0, 4)}…</span>
                {i.teen && <span className="text-xs font-bold">Teen</span>}
                <span className={`font-bold ${color}`}>{label}</span>
                <span className="text-xs text-muted-foreground flex-1 truncate">
                  {new Date(i.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {label === "Unused" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void call("cancel_trip_invite", { p_invite: i.id }, "Invite cancelled")
                    }
                  >
                    Cancel
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {isCaptain && (
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
            <span>
              <span className="block font-bold">Lock joining</span>
              <span className="block text-xs text-muted-foreground">
                Pauses the shared code and every personal invite link.
              </span>
            </span>
            <input
              type="checkbox"
              className="size-6 accent-[var(--primary)]"
              checked={!!trip.join_locked}
              onChange={(e) =>
                void call(
                  "set_join_controls",
                  { p_trip: trip.id, p_locked: e.target.checked, p_max: null },
                  e.target.checked ? "Joining locked 🔒" : "Joining open",
                ).then(() => onSaved())
              }
            />
          </label>
          <div className="flex items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
            <span>
              <span className="block font-bold">Shared join code {trip.join_code}</span>
              <span className="block text-xs text-muted-foreground">
                Reset makes the old code stop working right away.
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 shrink-0"
              onClick={async () => {
                if (
                  await confirmInApp("Reset the join code? The old code stops working right away.")
                )
                  void call("reset_trip_code", { p_trip: trip.id }, "New join code ready ✓").then(
                    () => onSaved(),
                  );
              }}
            >
              Reset code
            </Button>
          </div>
          <label className="flex items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
            <span>
              <span className="block font-bold">Shared join code on</span>
              <span className="block text-xs text-muted-foreground">
                Turn off so only personal links work.
              </span>
            </span>
            <input
              type="checkbox"
              className="size-6 accent-[var(--primary)]"
              checked={trip.join_code_enabled !== false}
              onChange={(e) =>
                void call(
                  "set_trip_access",
                  { p_trip: trip.id, p_code_enabled: e.target.checked, p_require_approval: null },
                  e.target.checked ? "Join code on" : "Join code off",
                ).then(() => onSaved())
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
            <span>
              <span className="block font-bold">Max squad size</span>
              <span className="block text-xs text-muted-foreground">
                2–40. New joins stop when the squad is full.
              </span>
            </span>
            <input
              type="number"
              min={2}
              max={40}
              aria-label="Max squad size"
              className="min-h-11 w-20 rounded-full border border-border bg-background px-3 text-center"
              defaultValue={trip.max_squad ?? 20}
              onBlur={(e) => {
                const v = Math.max(2, Math.min(40, Number(e.target.value) || 20));
                if (v !== (trip.max_squad ?? 20))
                  void call(
                    "set_join_controls",
                    { p_trip: trip.id, p_locked: null, p_max: v },
                    `Max squad size ${v}`,
                  ).then(() => onSaved());
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
            <span>
              <span className="block font-bold">Approve new members</span>
              <span className="block text-xs text-muted-foreground">
                New people wait until you approve them. Teens and players under 21 always need
                approval.
              </span>
            </span>
            <input
              type="checkbox"
              className="size-6 accent-[var(--primary)]"
              checked={!!trip.require_approval}
              onChange={(e) =>
                void call(
                  "set_trip_access",
                  { p_trip: trip.id, p_code_enabled: null, p_require_approval: e.target.checked },
                  e.target.checked ? "Approval on" : "Approval off",
                ).then(() => onSaved())
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}

export function NoAlcoholToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    void rpc("my_access").then((r) => setOn(!!r.data?.[0]?.no_alcohol));
  }, []);
  if (on === null) return null;
  return (
    <label className="mt-4 flex items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
      <span>
        <span className="block font-bold">No alcohol for me 🧃</span>
        <span className="block text-xs text-muted-foreground">
          Drink cards and challenges swap to alternatives. Only you can see this.
        </span>
        {msg && <span className="block text-xs text-destructive">{msg}</span>}
      </span>
      <input
        type="checkbox"
        className="size-6 accent-[var(--primary)]"
        checked={on}
        onChange={async (e) => {
          const v = e.target.checked;
          setOn(v);
          const r = await rpc("set_no_alcohol", { p_on: v });
          if (r.error) {
            setOn(!v);
            setMsg(friendlyError(r.error));
          }
        }}
      />
    </label>
  );
}

export function LaunchSwitch() {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    void rpc("public_launch").then((r) => setOn(!!r.data));
  }, []);
  if (on === null) return null;
  return (
    <label className="mt-3 flex items-center justify-between gap-3 bg-card border border-border rounded-2xl p-3">
      <span>
        <span className="block font-bold">🚀 Public launch (founder)</span>
        <span className="block text-xs text-muted-foreground">Off = invite-only access.</span>
        {msg && (
          <span role="alert" className="block text-xs text-destructive">
            {msg}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        className="size-6 accent-[var(--primary)]"
        checked={on}
        onChange={async (e) => {
          const v = e.target.checked;
          if (
            !(await confirmInApp(v ? "Open TripJunkies to everyone?" : "Go back to invite-only?"))
          )
            return;
          const r = await rpc("set_public_launch", { p_on: v });
          if (r.error) setMsg(friendlyError(r.error));
          else setOn(v);
        }}
      />
    </label>
  );
}

/** Teens 13–17 without an approved trip: only "Join with code" (plus their waiting request). */
export function TeenJoinGate({ onJoined }: { onJoined: () => void }) {
  const [waiting, setWaiting] = useState<boolean | null>(null);
  const [code, setCode] = useState(readPendingCode() ?? "");
  const name = useJoinName();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => void rpc("my_waiting_trips").then((r) => setWaiting(!!r.data?.length));
  useEffect(() => {
    load();
    const t = window.setInterval(() => {
      load();
      onJoined();
    }, 20000);
    return () => window.clearInterval(t);
  }, []);
  if (waiting === null) return null;
  return (
    <main className="min-h-dvh max-w-lg mx-auto px-[18px] pt-[max(2rem,env(safe-area-inset-top))] pb-8">
      <p className="eyebrow">TRIPJUNKIES</p>
      <h1 className="font-display text-3xl font-extrabold mt-2 mb-5">
        {waiting ? "Almost boarding" : "Join with code"}
      </h1>
      {waiting ? (
        <>
          <WaitingTrips />
          <p className="text-sm text-muted-foreground">
            Your Captain approves you before the trip opens.
          </p>
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMsg("");
            const r = await rpc("join_trip", {
              p_code: code.trim().toUpperCase(),
              p_display_name: name.clean,
            });
            setBusy(false);
            if (r.error) setMsg(friendlyError(r.error));
            else if (!r.data) setMsg("That code wasn't found. Check it and try again.");
            else {
              load();
              onJoined();
            }
          }}
        >
          <p className="text-sm text-muted-foreground">
            Enter the teen invite code from your trip's Captain. They approve you before you can
            play.
          </p>
          <input
            aria-label="Join code"
            required
            minLength={10}
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="TEEN INVITE"
            className="w-full h-14 rounded-2xl border border-border bg-card text-center font-display text-2xl tracking-widest"
          />
          <JoinNameField name={name} />
          {msg && (
            <p role="alert" className="text-sm text-destructive">
              {msg}
            </p>
          )}
          <Button
            type="submit"
            variant="playful"
            size="lg"
            className="w-full min-h-11"
            disabled={busy || code.length < 6 || !name.valid}
          >
            {busy ? "Joining…" : "Join room"}
          </Button>
        </form>
      )}
    </main>
  );
}
