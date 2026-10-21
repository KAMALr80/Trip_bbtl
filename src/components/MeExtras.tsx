import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { CALL_HELP_NOTE, CALL_HELP_STEPS, ROLE_TIPS } from "./GameNightExtras";
import { useEffect, useState } from "react";
import { ArrowLeft, Bug, Camera, ChevronDown, Trash2, Sun, Moon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { deleteMyAccount } from "@/lib/account.functions";
import type { TripWithRole } from "@/lib/trips";
import { tripClosed } from "@/components/Seasons";
import { RememberedSection } from "./RememberedSection";
import { allZones, deviceZone, setViewerZone, zoneLabel } from "@/lib/viewer-time";
import { PassportBook } from "./PassportBook";
import { APP_VERSION } from "@/lib/app-version";
import { Link } from "@tanstack/react-router";
import { legalLinks } from "@/lib/legal";

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (f: string, a?: Record<string, unknown>) => any;
};

export function Skeleton({ className = "h-16" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton-shimmer rounded-lg bg-muted ${className}`} />;
}
function Back({ onBack, label = "Me" }: { onBack: () => void; label?: string }) {
  return (
    <Button variant="ghost" className="-ml-2 text-muted-foreground" onClick={onBack}>
      <ArrowLeft /> {label}
    </Button>
  );
}

export function AppearanceToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const sync = () => setLight(document.documentElement.classList.contains("light"));
    sync();
    window.addEventListener("tripjunkie-appearance-change", sync);
    return () => window.removeEventListener("tripjunkie-appearance-change", sync);
  }, []);
  const choose = (value: "light" | "dark") => {
    safeSetItem("tripjunkie-appearance", value);
    document.documentElement.classList.toggle("light", value === "light");
    setLight(value === "light");
    window.dispatchEvent(new Event("tripjunkie-appearance-change"));
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user)
        void supabase.from("profiles").update({ appearance: value }).eq("id", data.user.id);
    });
  };
  return (
    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <span className="font-bold">Appearance</span>
      <div className="flex gap-1" role="group" aria-label="Appearance">
        <Button
          size="sm"
          variant={!light ? "green" : "outline"}
          aria-pressed={!light}
          onClick={() => choose("dark")}
        >
          Night
        </Button>
        <Button
          size="sm"
          variant={light ? "green" : "outline"}
          aria-pressed={light}
          onClick={() => choose("light")}
        >
          Day
        </Button>
      </div>
    </div>
  );
}

export function HomeLayoutSetting({ userId }: { userId: string }) {
  const [layout, setLayout] = useState<"classic" | "trips_first">("trips_first");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void supabase
      .from("profiles")
      .select("home_layout")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error: readError }) => {
        if (!current) return;
        if (readError) setError("Couldn't load your Home choice.");
        else setLayout(data?.home_layout === "trips_first" ? "trips_first" : "classic");
      });
    return () => {
      current = false;
    };
  }, [userId]);
  async function choose(next: "classic" | "trips_first") {
    setSaving(true);
    setError("");
    const { data, error: saveError } = await supabase
      .from("profiles")
      .update({ home_layout: next })
      .eq("id", userId)
      .select("home_layout")
      .maybeSingle();
    if (saveError || !data) setError("Couldn't save your Home choice. Try again.");
    else setLayout(data.home_layout === "trips_first" ? "trips_first" : "classic");
    setSaving(false);
  }
  return (
    <div className="mt-3 border-y border-border py-4">
      <p className="font-bold">Home layout</p>
      <div role="group" aria-label="Home layout" className="flex flex-wrap gap-2 mt-3">
        <Button
          className="min-h-11"
          variant={layout === "classic" ? "playful" : "outline"}
          aria-pressed={layout === "classic"}
          disabled={saving}
          onClick={() => void choose("classic")}
        >
          Classic
        </Button>
        <Button
          className="min-h-11"
          variant={layout === "trips_first" ? "playful" : "outline"}
          aria-pressed={layout === "trips_first"}
          disabled={saving}
          onClick={() => void choose("trips_first")}
        >
          Trips first
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Trips first is the default. Switch to Classic any time.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </div>
  );
}

export function AppearanceQuickToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const sync = () => setLight(document.documentElement.classList.contains("light"));
    sync();
    window.addEventListener("tripjunkie-appearance-change", sync);
    return () => window.removeEventListener("tripjunkie-appearance-change", sync);
  }, []);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0"
      aria-label={light ? "Switch to night appearance" : "Switch to day appearance"}
      title={light ? "Night" : "Day"}
      onClick={() => {
        const next = !document.documentElement.classList.contains("light");
        document.documentElement.classList.toggle("light", next);
        safeSetItem("tripjunkie-appearance", next ? "light" : "dark");
        window.dispatchEvent(new Event("tripjunkie-appearance-change"));
        void supabase.auth.getUser().then(({ data }) => {
          if (data.user)
            void supabase
              .from("profiles")
              .update({ appearance: next ? "light" : "dark" })
              .eq("id", data.user.id);
        });
      }}
    >
      {light ? <Moon /> : <Sun />}
    </Button>
  );
}

export function PublicLeaderboardSetting({ userId }: { userId: string }) {
  const [on, setOn] = useState(false),
    [minor, setMinor] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      db.from("player_profiles").select("public_leaderboard").eq("user_id", userId).maybeSingle(),
      db.rpc("my_access"),
    ]).then(([profile, access]) => {
      if (!live) return;
      const isMinor = access.data?.[0]?.age_range === "Teen 13–17";
      setMinor(isMinor);
      setOn(!isMinor && (profile.data?.public_leaderboard ?? true));
    });
    return () => {
      live = false;
    };
  }, [userId]);
  async function change(value: boolean) {
    const { data, error: err } = await db.rpc("set_public_leaderboard", { p_public: value });
    if (err) setError(friendlyError(err));
    else {
      setOn(data === true);
      setError("");
    }
  }
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-y border-border py-4">
      <span>
        <strong className="block">Show me on public leaderboards</strong>
        <small className="text-muted-foreground">
          Your own squad always sees your score. {minor && "Under 18 stays private."}
        </small>
      </span>
      <input
        type="checkbox"
        className="size-6 shrink-0 accent-primary"
        aria-label="Show me on public leaderboards"
        checked={on}
        disabled={minor}
        onChange={(e) => void change(e.target.checked)}
      />
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- My Passport ---------- */
export function MyPassport({
  trips,
  selectTrip,
  userId,
  onNavigate,
}: {
  trips: TripWithRole[];
  selectTrip: (id: string) => void;
  userId: string;
  onNavigate?: (screen: "preflight" | "touchdown" | "athome" | "culture") => void;
}) {
  return (
    <PassportBook
      trips={trips}
      selectTrip={selectTrip}
      userId={userId}
      {...(onNavigate ? { onNavigate } : {})}
    />
  );
}

/* ---------- Memories reminder (photos kept 12 months after a trip closes) ---------- */
export function photoExpiry(t: TripWithRole) {
  const closed = t.ended_at
    ? new Date(t.ended_at)
    : new Date(new Date(`${t.end_date}T00:00:00`).getTime() + 2 * 86400000);
  return new Date(closed.getTime() + 365 * 86400000);
}
export function MemoriesReminder({ trip }: { trip: TripWithRole }) {
  const purged = (trip as TripWithRole & { photos_purged_at?: string | null }).photos_purged_at;
  if (purged)
    return (
      <div className="mt-5 rounded-2xl bg-muted p-4 text-sm">
        <b>📦 Photos from this trip have expired.</b> Leaderboards, winners and Trip Wrapped are
        still here forever.
      </div>
    );
  if (!tripClosed(trip)) return null;
  const days = Math.ceil((photoExpiry(trip).getTime() - Date.now()) / 86400000);
  if (days > 30) return null;
  const urgent = days <= 7;
  return (
    <div
      role="status"
      className={`mt-5 rounded-2xl p-4 ${urgent ? "bg-orange text-primary-foreground" : "bg-orange-soft"}`}
    >
      <p className="font-display text-lg font-extrabold">📸 Download your memories</p>
      <p className="text-sm mt-1">
        Photos from this trip disappear in {Math.max(0, days)} day{days === 1 ? "" : "s"}. Grab them
        all from the photo wall.
      </p>
      <Button
        variant={urgent ? "secondary" : "playful"}
        size="sm"
        className="mt-3"
        onClick={() =>
          document.getElementById("photo-wall")?.scrollIntoView({ behavior: "smooth" })
        }
      >
        Go to photos ↓
      </Button>
    </div>
  );
}

/* ---------- Help ---------- */
const faqs: [string, string][] = [
  [
    "What is TripJunkies?",
    "A game you play around real travel. It turns any trip into a game, so your squad bonds before you go and learns the culture while you travel.",
  ],
  [
    "How does a trip work?",
    "Pick your dates and invite your squad. You play game nights in the days before you fly, missions on travel day, challenges while you're there, and crown a winner at the end.",
  ],
  [
    "What are Travel From Home and Window Seat?",
    "Travel From Home brings a culture into your living room over a few days, no flight needed. Window Seat is for travelling without your squad: you document the trip and turn it into a guide for someone else.",
  ],
  [
    "Does everyone need the app?",
    "Everyone who's scoring points does, so the leaderboard means something. People around you can join in for fun without an account.",
  ],
  [
    "What does it cost?",
    "Nothing during the beta. Later a trip is a one-time cost for the squad, priced by length and group size.",
  ],
  [
    "How do I invite my squad?",
    "Share your trip's join code or invite link. As Captain you approve who gets in.",
  ],
  [
    "Is it safe for teens and families?",
    "Yes. Under 13 can't join. Teens 13 to 17 need a Captain's code and approval, see only that one trip and get family-friendly content only. Any trip with someone under 18 is family-friendly throughout.",
  ],
];
export function HelpPage({
  onBack,
  onReplay,
  backLabel = "Me",
}: {
  onBack: () => void;
  onReplay: () => void;
  backLabel?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const block = (tint: string, emoji: string, title: string, body: React.ReactNode) => (
    <section className={`mt-4 rounded-[1.75rem] p-5 ${tint}`}>
      <h2 className="font-display text-xl font-extrabold">
        {emoji} {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed">{body}</div>
    </section>
  );
  return (
    <main className="pb-8">
      <Back onBack={onBack} label={backLabel} />
      <h1 className="mt-6 font-display text-4xl font-extrabold">Help & how it works</h1>
      <Button variant="playful" className="mt-5 w-full" onClick={onReplay}>
        ▶️ Replay the intro
      </Button>
      <RememberedSection id="help-stamps" title="The stamp scale" defaultOpen>
        {block(
          "bg-orange-soft",
          "🛂",
          "The stamp scale",
          <ul className="space-y-2">
            {[
              ["1", "Easy, or you showed up"],
              ["2", "Took some effort"],
              ["3", "You won something"],
              ["5", "Big win"],
            ].map(([n, t]) => (
              <li key={n} className="flex items-center gap-3">
                <span className="passport-stamp bg-card px-2 font-display font-extrabold text-orange">
                  {n}
                </span>
                {t}
              </li>
            ))}
          </ul>,
        )}
      </RememberedSection>
      <RememberedSection id="help-roles" title="Roles">
        {block(
          "bg-blue-soft",
          "👑",
          "Roles",
          <>
            <ul className="space-y-1">
              <li>
                <b>Captain</b> — runs the trip: settings, itinerary, prizes, members.
              </li>
              <li>
                <b>Co-Captain</b> — same powers, except removing or replacing the Captain.
              </li>
              <li>
                <b>Weekly host</b> — runs that week's game night and spins the wheel.
              </li>
              <li>
                <b>Player</b> — plays, votes, posts and collects stamps.
              </li>
            </ul>
            {(["captain", "co_captain", "host"] as const).map((r) => (
              <div key={r} className="mt-4">
                <p className="font-bold">
                  {ROLE_TIPS[r].emoji}{" "}
                  {r === "captain" ? "Captain" : r === "co_captain" ? "Co-Captain" : "Host"} tips
                </p>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {ROLE_TIPS[r].tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>,
        )}
      </RememberedSection>
      <RememberedSection id="help-seasons" title="Seasons & prizes">
        {block(
          "bg-green-soft",
          "🏆",
          "Seasons & prizes",
          <p>
            <b>Pre-Flight</b> runs on weekly game nights before the trip. <b>Trip Season</b> runs on
            daily games during it. Each has its own leaderboard, champion and mystery prize,
            revealed at the crowning the Captain sets.
          </p>,
        )}
      </RememberedSection>
      <RememberedSection id="help-skips" title="Skip passes">
        {block(
          "bg-orange-soft",
          "🎟️",
          "Skip passes",
          <p>
            Pre-Flight gives 1 pass per 4 game nights (1 to 3); Trip Season gives 3. Use one to
            redraw a card, swap a bingo square or quest, or get a new secret mission. The host can
            spend one to re-spin the wheel. No penalty — the skipped item just earns no stamps.
          </p>,
        )}
      </RememberedSection>
      <RememberedSection id="help-faq" title="FAQ">
        <div className="mt-3 space-y-2">
          {faqs
            .map((_, i) => i)
            .map((i) => {
              const [q, a] = faqs[i] ?? ["", ""];
              return (
                <div key={q} className="rounded-2xl border border-border bg-card">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-3 p-4 text-left font-bold"
                    aria-expanded={open === i}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    {q}
                    <ChevronDown
                      size={18}
                      className={`shrink-0 transition ${open === i ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open === i && <p className="px-4 pb-4 text-sm text-ink-soft">{a}</p>}
                </div>
              );
            })}
        </div>
      </RememberedSection>
      <section className="mt-8">
        <h2 className="font-display text-2xl font-extrabold">Contact</h2>
        <div className="mt-3 space-y-3 text-sm">
          <p>
            General questions:{" "}
            <a className="text-primary underline" href="mailto:hello@tripjunkies.app">
              hello@tripjunkies.app
            </a>
          </p>
          <p>
            Bug reports and account help:{" "}
            <a className="text-primary underline" href="mailto:support@tripjunkies.app">
              support@tripjunkies.app
            </a>
          </p>
          <p>
            Safety, harassment and copyright:{" "}
            <a className="text-primary underline" href="mailto:safety@tripjunkies.app">
              safety@tripjunkies.app
            </a>
          </p>
        </div>
        <nav className="mt-5 flex flex-wrap gap-3 text-sm">
          {legalLinks.map((item) => (
            <Link
              key={item.href}
              to="/legal/$document"
              params={{ document: item.href.split("/").pop() || "terms" }}
              className="text-primary underline"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

/* ---------- Bug report ---------- */
export function BugReport({
  onBack,
  tripId,
  page,
}: {
  onBack: () => void;
  tripId: string | undefined;
  page: string;
}) {
  const [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [done, setDone] = useState(false);
  const [underage, setUnderage] = useState(false);
  async function send() {
    setBusy(true);
    setMsg("");
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      let path: string | null = null;
      if (file) {
        const small = await compressImage(file);
        path = `${uid}/${crypto.randomUUID()}.${small.type === "image/webp" ? "webp" : "jpg"}`;
        const { error } = await supabase.storage
          .from("bug-screenshots")
          .upload(path, small, { contentType: small.type });
        if (error) throw new Error("Screenshot upload failed.");
      }
      const { error } = await db.from("bug_reports").insert({
        user_id: uid,
        trip_id: tripId ?? null,
        page: underage ? "Safety · Report underage user" : page,
        description: `${underage ? "Report underage user: " : ""}${text.trim()}`,
        screenshot_path: path,
        user_agent: navigator.userAgent.slice(0, 400),
        app_version: APP_VERSION,
      });
      if (error) throw new Error(error.message);
      setDone(true);
    } catch (e) {
      setMsg(friendlyError(e));
    }
    setBusy(false);
  }
  return (
    <main className="pb-8">
      <Back onBack={onBack} />
      <h1 className="mt-6 font-display text-4xl font-extrabold">Report something 🐞</h1>
      <a
        href={`mailto:support@tripjunkies.app?subject=${encodeURIComponent("Bug report")}&body=${encodeURIComponent(`App version: ${APP_VERSION}\nPage: ${page}\n\n`)}`}
        className="mt-3 inline-block text-sm text-primary underline"
      >
        Email support
      </a>
      <label className="mt-4 flex items-center gap-2 text-sm font-bold">
        <input
          type="checkbox"
          checked={underage}
          onChange={(e) => setUnderage(e.target.checked)}
          className="size-5 accent-primary"
        />
        Report underage user
      </label>
      {underage && (
        <a
          href="mailto:safety@tripjunkies.app?subject=Report%20underage%20user"
          className="mt-2 block text-sm text-primary underline"
        >
          Email safety@tripjunkies.app for urgent concerns
        </a>
      )}
      {done ? (
        <div className="mt-8 rounded-[1.75rem] bg-green-soft p-6 text-center">
          <p className="text-5xl">🙏</p>
          <p className="font-display text-2xl font-extrabold mt-2">Thanks — got it!</p>
          <p className="text-sm text-ink-soft mt-1">
            Your report is saved with the time and page so it's easy to track down.
          </p>
          <Button variant="playful" className="mt-5" onClick={onBack}>
            Back to Me
          </Button>
        </div>
      ) : (
        <>
          <label className="mt-6 block text-sm font-bold">
            What happened?
            <textarea
              className="mt-2 w-full min-h-36 rounded-2xl border-2 border-border bg-card p-4 outline-none focus:border-primary"
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="I tapped… and then…"
            />
          </label>
          <label className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-blue-soft p-4 cursor-pointer">
            <Camera className="text-blue" />
            <span className="text-sm font-bold flex-1 truncate">
              {file ? file.name : "Add a screenshot (optional)"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {msg && (
            <p role="alert" className="text-sm text-destructive mt-3">
              {msg}
            </p>
          )}
          <Button
            variant="playful"
            size="lg"
            className="mt-5 w-full"
            disabled={busy || !text.trim()}
            onClick={() => void send()}
          >
            <Bug /> {busy ? "Sending…" : "Send report"}
          </Button>
        </>
      )}
    </main>
  );
}
type BugRow = {
  id: string;
  description: string;
  page: string;
  created_at: string;
  screenshot_path: string | null;
};
export function BugReportsList({ tripId }: { tripId: string }) {
  const [rows, setRows] = useState<BugRow[] | null>(null),
    [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    void db
      .from("bug_reports")
      .select("id,description,page,created_at,screenshot_path")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(async ({ data }: { data: BugRow[] | null }) => {
        setRows(data ?? []);
        const paths = (data ?? []).map((r) => r.screenshot_path).filter((p): p is string => !!p);
        if (paths.length) {
          const { data: s } = await supabase.storage
            .from("bug-screenshots")
            .createSignedUrls(paths, 3600);
          setUrls(
            Object.fromEntries(
              (s ?? [])
                .filter((x) => x.path && x.signedUrl)
                .map((x) => [x.path as string, x.signedUrl as string]),
            ),
          );
        }
      });
  }, [tripId]);
  return (
    <>
      <h2 className="font-display font-extrabold text-xl mt-9">Bug reports 🐞</h2>
      {rows === null ? (
        <Skeleton className="h-20 mt-3" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-soft mt-2">No bugs reported in this trip. 🎉</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl bg-card border border-border p-4">
              <p className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString()} · {r.page}
              </p>
              <p className="text-sm mt-1 whitespace-pre-wrap">{r.description}</p>
              {r.screenshot_path && urls[r.screenshot_path] && (
                <a href={urls[r.screenshot_path]} target="_blank" rel="noopener noreferrer">
                  <img
                    src={urls[r.screenshot_path]}
                    alt="Bug screenshot"
                    className="mt-2 max-h-48 rounded-xl"
                  />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Delete account ---------- */
export function DeleteAccount({ onBack }: { onBack: () => void }) {
  const del = useServerFn(deleteMyAccount);
  const [typed, setTyped] = useState(""),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      await del();
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }
  return (
    <main className="pb-8">
      <Back onBack={onBack} />
      <h1 className="mt-6 font-display text-4xl font-extrabold">Delete my account</h1>
      <div className="mt-6 rounded-[1.75rem] bg-orange-soft p-5 text-sm leading-relaxed">
        <p className="font-bold">This permanently removes:</p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>Your profile and player cards</li>
          <li>Your avatar and every photo you posted</li>
          <li>Your sign-in</li>
        </ul>
        <p className="mt-3">If you're Captain of a trip with other people, pass the crown first.</p>
      </div>
      <label className="mt-6 block text-sm font-bold">
        Type DELETE to confirm
        <input
          className="mt-2 w-full h-12 rounded-2xl border-2 border-border bg-card px-4 outline-none focus:border-destructive"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
        />
      </label>
      {err && (
        <p role="alert" className="text-sm text-destructive mt-3">
          {err}
        </p>
      )}
      <Button
        variant="outline"
        size="lg"
        className="mt-5 w-full bg-card text-destructive border-destructive"
        disabled={busy || typed.trim().toUpperCase() !== "DELETE"}
        onClick={() => void go()}
      >
        <Trash2 /> {busy ? "Deleting…" : "Delete forever"}
      </Button>
    </main>
  );
}

/* ---------- Personal time zone (display only) ---------- */
export function TimeZoneSetting({ userId, onChange }: { userId: string; onChange?: () => void }) {
  const [zone, setZone] = useState<string>(""),
    [manual, setManual] = useState(false),
    [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [msg, setMsg] = useState("");
  useEffect(() => {
    void db
      .from("profiles")
      .select("time_zone,time_zone_manual")
      .eq("id", userId)
      .maybeSingle()
      .then(
        ({ data }: { data: { time_zone: string | null; time_zone_manual: boolean } | null }) => {
          setZone(data?.time_zone || deviceZone());
          setManual(!!data?.time_zone_manual);
        },
      );
  }, [userId]);
  const zones = allZones()
    .filter((z) => !query || z.toLowerCase().replace(/_/g, " ").includes(query.toLowerCase()))
    .slice(0, 60);
  async function save(next: string | null) {
    const value = next ?? deviceZone();
    const { error } = await db
      .from("profiles")
      .update({ time_zone: value, time_zone_manual: next !== null })
      .eq("id", userId);
    if (error) {
      setMsg("Couldn't save. Try again.");
      return;
    }
    setZone(value);
    setManual(next !== null);
    setOpen(false);
    setQuery("");
    setViewerZone(value);
    setMsg("Saved ✓");
    onChange?.();
  }
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">Your time zone</p>
          <p className="text-xs text-muted-foreground truncate">
            {zoneLabel(zone || deviceZone())} · {manual ? "chosen by you" : "from this phone"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Change"}
        </Button>
      </div>
      {open && (
        <div className="mt-3">
          <input
            className="w-full h-11 rounded-xl bg-background border-2 border-border px-3"
            placeholder="Search a city or zone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search time zones"
            autoFocus
          />
          <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-border rounded-xl border border-border">
            {zones.map((z) => (
              <button
                key={z}
                type="button"
                className={`w-full text-left px-3 py-2.5 text-sm ${z === zone ? "font-bold text-blue" : ""}`}
                onClick={() => void save(z)}
              >
                {z.replace(/_/g, " ")}{" "}
                <span className="text-xs text-muted-foreground">· {zoneLabel(z)}</span>
              </button>
            ))}
          </div>
          {manual && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => void save(null)}>
              Use my phone's time zone
            </Button>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="text-xs mt-2">
          {msg}
        </p>
      )}
    </div>
  );
}
