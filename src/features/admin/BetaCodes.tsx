import { rpc } from "@/data/rpc";
import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
import { confirmInApp } from "@/lib/confirm";
import { canApproveMember } from "@/lib/member-approval";
import { savePendingBeta } from "@/lib/pending-beta";
const field =
  "min-h-11 w-full rounded-full border border-border bg-card px-4 text-base outline-none focus:border-primary";

/** Redeems a beta code (server-checked). Signed out, it only saves the code so sign-up opens. */
export function BetaCodeField({
  signedIn,
  onRedeemed,
}: {
  signedIn: boolean;
  onRedeemed?: (() => void) | undefined;
}) {
  const [code, setCode] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length !== 8) {
      setMsg("Beta codes are 8 letters and numbers.");
      return;
    }
    if (!signedIn) {
      savePendingBeta(c);
      setMsg("Code saved ✓ Create your account to use it.");
      onRedeemed?.();
      return;
    }
    setBusy(true);
    setMsg("");
    const r = await rpc("redeem_beta_code", { p_code: c });
    setBusy(false);
    if (r.error) return setMsg(friendlyError(r.error));
    if (r.data === "invalid") return setMsg("We couldn't find that code. Check it and try again.");
    setMsg("You're in ✈️");
    onRedeemed?.();
  }
  return (
    <form onSubmit={go} className="w-full text-left space-y-2" aria-label="Have a beta code?">
      <label className="block text-sm font-bold">
        Have a beta code?
        <input
          className={`${field} mt-1 font-mono uppercase tracking-widest`}
          maxLength={12}
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="8-character code"
        />
      </label>
      <Button
        type="submit"
        variant="playful"
        className="w-full min-h-11"
        disabled={busy || !code.trim()}
      >
        {busy ? "Checking…" : "Redeem"}
      </Button>
      {msg && (
        <p role="status" className="text-sm font-bold">
          {msg}
        </p>
      )}
    </form>
  );
}

export function WaitlistField() {
  const [email, setEmail] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="w-full text-left space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await rpc("join_waitlist", { p_email: email });
        setBusy(false);
        setMsg(r.error ? friendlyError(r.error) : "You're on the waitlist 💌 We'll email you.");
      }}
    >
      <label className="block text-sm font-bold">
        No code yet? Join the waitlist
        <input
          type="email"
          required
          className={`${field} mt-1`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
        />
      </label>
      <Button type="submit" variant="outline" className="w-full min-h-11" disabled={busy || !email}>
        Join the waitlist
      </Button>
      {msg && (
        <p role="status" className="text-sm font-bold">
          {msg}
        </p>
      )}
    </form>
  );
}

type Code = {
  code: string;
  note: string | null;
  status: string;
  used_by_name: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};
/** Control Tower › Beta codes (founder-only, server-checked). */
export function BetaCodesDoor() {
  const [rows, setRows] = useState<Code[] | null>(null),
    [wait, setWait] = useState<{ email: string }[]>([]);
  const [count, setCount] = useState(5),
    [note, setNote] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const [a, b] = await Promise.all([rpc("list_beta_codes"), rpc("list_waitlist")]);
    if (a.error) setMsg(friendlyError(a.error));
    setRows(a.data ?? []);
    setWait(b.data ?? []);
  };
  useEffect(() => {
    void load();
  }, []);
  const copy = async (t: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setMsg(ok);
    } catch {
      setMsg("Couldn't copy");
    }
  };
  const color: Record<string, string> = {
    unused: "text-green",
    used: "text-blue",
    expired: "text-muted-foreground",
    revoked: "text-destructive",
  };
  return (
    <>
      <section className="app-card mt-5 space-y-3">
        <p className="eyebrow text-primary">CREATE CODES</p>
        <label className="block text-sm font-bold">
          How many (1–20)
          <input
            type="number"
            min={1}
            max={20}
            className={`${field} mt-1`}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="block text-sm font-bold">
          Note
          <input
            className={`${field} mt-1`}
            maxLength={120}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. first testers"
          />
        </label>
        <Button
          variant="playful"
          className="w-full min-h-11"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await rpc("create_beta_codes", { p_count: count, p_note: note });
            setBusy(false);
            if (r.error) setMsg(friendlyError(r.error));
            else {
              setMsg(`${(r.data ?? []).length} codes created ✓`);
              setNote("");
              await load();
            }
          }}
        >
          Create codes
        </Button>
        {msg && (
          <p role="status" className="text-sm font-bold">
            {msg}
          </p>
        )}
      </section>
      <section className="app-card mt-5">
        <p className="eyebrow text-blue">CODES</p>
        {rows === null ? (
          <p className="text-sm text-muted-foreground mt-2">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">No codes yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((c) => (
              <li key={c.code} className="flex items-center gap-2 rounded-2xl bg-muted p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-bold tracking-widest">{c.code}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <span className={`font-bold capitalize ${color[c.status]}`}>{c.status}</span>
                    {c.used_by_name ? ` · ${c.used_by_name}` : ""}
                    {c.note ? ` · ${c.note}` : ""} ·{" "}
                    {new Date(
                      c.status === "used" && c.used_at ? c.used_at : c.expires_at,
                    ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                {c.status === "unused" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      aria-label={`Copy link for ${c.code}`}
                      onClick={() =>
                        void copy(`${window.location.origin}/beta/${c.code}`, "Link copied 📋")
                      }
                    >
                      <Copy />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-11"
                      aria-label={`Revoke ${c.code}`}
                      onClick={async () => {
                        if (!(await confirmInApp(`Revoke ${c.code}?`))) return;
                        const r = await rpc("revoke_beta_code", { p_code: c.code });
                        setMsg(r.error ? friendlyError(r.error) : "Code revoked");
                        await load();
                      }}
                    >
                      <X />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="app-card mt-5">
        <p className="eyebrow text-green">WAITLIST</p>
        <p className="mt-1 font-bold">
          {wait.length} {wait.length === 1 ? "person" : "people"} waiting
        </p>
        <Button
          variant="outline"
          className="mt-3 w-full min-h-11"
          disabled={!wait.length}
          onClick={() =>
            void copy(wait.map((w) => w.email).join("\n"), "Waitlist copied as text 📋")
          }
        >
          <Copy /> Export as text
        </Button>
      </section>
    </>
  );
}

/** Leader-only count of people waiting to join (server returns 0 for anyone else). */
export function usePendingCount(tripId: string | undefined, leader: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!tripId || !leader) {
      setN(0);
      return;
    }
    const load = () =>
      void rpc("pending_count", { p_trip: tripId }).then((r) => setN(Number(r.data) || 0));
    load();
    const t = window.setInterval(() => {
      if (!document.hidden) load();
    }, 30000);
    window.addEventListener("tj-pending-changed", load);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("tj-pending-changed", load);
    };
  }, [tripId, leader]);
  return n;
}

export function PendingBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} waiting to join`}
      className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-extrabold text-primary-foreground"
    >
      {count}
    </span>
  );
}

type Pending = {
  user_id: string;
  name: string;
  avatar_style: string;
  avatar_seed: string;
  age_range: string;
};
/** Squad tab "Waiting (n)": leaders see it; who can approve follows approve_member (QA-05). */
export function WaitingToJoin({
  trip,
  avatarUrl,
  onChanged,
}: {
  trip: { id: string; myRole: string };
  avatarUrl: (style: string, seed: string) => string;
  onChanged?: () => void;
}) {
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  const [rows, setRows] = useState<Pending[]>([]),
    [msg, setMsg] = useState("");
  const load = async () => {
    if (!leader) return;
    const r = await rpc("pending_members", { p_trip: trip.id });
    setRows(r.data ?? []);
  };
  useEffect(() => {
    void load();
  }, [trip.id, leader]);
  if (!leader || !rows.length) return null;
  const act = async (p: Pending, ok: boolean) => {
    if (!ok && !(await confirmInApp(`Decline ${p.name}?`))) return;
    const r = await rpc("approve_member", { p_trip: trip.id, p_user: p.user_id, p_approve: ok });
    setMsg(r.error ? friendlyError(r.error) : ok ? `${p.name} approved ✓` : "Request declined");
    await load();
    window.dispatchEvent(new Event("tj-pending-changed"));
    onChanged?.();
  };
  return (
    <section className="app-card mt-[14px]" aria-label="Waiting to join">
      <h2 className="font-display text-lg font-extrabold">Waiting ({rows.length})</h2>
      <div className="mt-2 space-y-2">
        {rows.map((p) => (
          <div key={p.user_id} className="flex items-center gap-3 rounded-2xl bg-muted p-3">
            <img
              src={avatarUrl(p.avatar_style, p.avatar_seed)}
              alt=""
              width={44}
              height={44}
              className="size-11 rounded-full bg-card"
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
                  className="min-h-11"
                  onClick={() => void act(p, true)}
                >
                  <Check /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  aria-label={`Decline ${p.name}`}
                  onClick={() => void act(p, false)}
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
      {msg && (
        <p role="status" className="mt-2 text-sm font-bold">
          {msg}
        </p>
      )}
    </section>
  );
}
