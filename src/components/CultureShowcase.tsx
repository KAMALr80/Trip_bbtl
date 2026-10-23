import { rpc } from "@/data/rpc";
import type { Json } from "@/integrations/supabase/types";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Copy, Heart, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

import { friendlyError } from "@/lib/friendly-error";
import { RoomExperienceCard } from "@/components/RoomExperienceCard";

const call = async (
  action: string,
  exp: string | null,
  code: string | null = null,
  values: Json = {},
) => {
  const { data, error } = await rpc("culture_showcase", {
    p_action: action,
    p_exp: exp,
    p_code: code,
    p: values,
  });
  if (error) throw new Error(error.message);
  return data;
};

export function ShowcaseInvite({
  id,
  finished,
  at,
  place,
  code,
  presented,
  onChanged,
}: {
  id: string;
  finished: boolean;
  at: string | null;
  place: string | null;
  code: string | null;
  presented: string | null;
  onChanged: () => void;
}) {
  const [date, setDate] = useState(""),
    [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const act = async (action: string, values: Json = {}) => {
    setBusy(true);
    setError("");
    try {
      await call(action, id, null, values);
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  if (!finished) return null;
  const link = code
    ? `${typeof window === "undefined" ? "" : window.location.origin}/?showcase=${code}`
    : "";
  return (
    <section className="mt-5 border-t border-border pt-5" aria-label="Showcase Night invitation">
      <h2 className="font-display text-xl font-extrabold">Showcase Night</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Invite people to watch your presentation. They can react and vote, but never join your
        quests or score.
      </p>
      <label className="mt-4 block text-sm font-bold">
        Presentation date and time
        <input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-card p-3 text-foreground"
        />
      </label>
      <label className="mt-3 block text-sm font-bold">
        Meeting place
        <input
          value={location}
          maxLength={120}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="A place you choose"
          className="mt-2 w-full rounded-md border border-border bg-card p-3 text-foreground"
        />
      </label>
      <Button
        variant="playful"
        className="mt-4 w-full min-h-11"
        disabled={busy || !date || location.trim().length < 2}
        onClick={() =>
          void act("invite", { at: new Date(date).toISOString(), place: location.trim() })
        }
      >
        Invite people to your Showcase
      </Button>
      {code && (
        <>
          <p className="mt-4 text-sm">
            <CalendarDays size={16} className="inline" /> {at ? new Date(at).toLocaleString() : ""}{" "}
            · {place}
          </p>
          <p className="mt-2 break-all text-sm">{link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => void navigator.clipboard.writeText(link)}
            >
              <Copy size={16} /> Copy invite
            </Button>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => void act("revoke")}
            >
              Revoke invite
            </Button>
          </div>
        </>
      )}
      {at && !presented && (
        <Button
          variant="outline"
          className="mt-4 min-h-11 w-full"
          disabled={busy || new Date(at).getTime() > Date.now()}
          onClick={() => void act("present")}
        >
          Mark presentation complete · +5 pts
        </Button>
      )}
      {presented && <p className="mt-3 text-sm font-bold">Presentation complete · +5 pts</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

type Guide = {
  id: string;
  title: string;
  culture: string;
  layer: string;
  at: string;
  place: string;
  guide: { day: number; title: string; story: string }[];
  reactions: Record<string, number>;
  votes: Record<string, number>;
  mine: { reaction: string; vote: string } | null;
};
export function ShowcaseGuest({ code, onBack }: { code: string; onBack: () => void }) {
  const [guide, setGuide] = useState<Guide | null>(null),
    [reaction, setReaction] = useState("applause"),
    [vote, setVote] = useState("inspiring"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { id } = (await call("join", null, code)) as { id: string };
        const data = (await call("view", id)) as Guide;
        if (live) setGuide(data);
      } catch (e) {
        if (live) setError(friendlyError(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [code]);
  const save = async () => {
    if (!guide) return;
    setBusy(true);
    setError("");
    try {
      await call("react", guide.id, null, { reaction, vote });
      setGuide((await call("view", guide.id)) as Guide);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="home-culture-content mt-6 pb-8">
      <Button variant="ghost" className="min-h-11" onClick={onBack}>
        <ArrowLeft size={18} /> Home
      </Button>
      <RoomExperienceCard room="home" showSave={false}>
        <p className="eyebrow mt-3">SHOWCASE NIGHT · GUEST</p>
        {guide ? (
          <>
            <h1 className="font-display text-2xl font-extrabold mt-2">{guide.title}</h1>
            <p className="mt-2 text-sm">
              {guide.culture} · {guide.layer} · {new Date(guide.at).toLocaleString()} ·{" "}
              {guide.place}
            </p>
            <div className="mt-5 space-y-4">
              {guide.guide.map((item) => (
                <article key={item.day} className="border-t border-border pt-3">
                  <p className="eyebrow">DAY {item.day}</p>
                  <h2 className="font-display text-lg font-bold">{item.title}</h2>
                  <p className="mt-2">{item.story}</p>
                </article>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Guests don't play quests, earn points, or appear on a leaderboard.
            </p>
            {guide.mine ? (
              <p className="mt-4 font-bold">Your reaction and vote were saved.</p>
            ) : (
              <>
                <p className="mt-5 font-bold">Your reaction</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["applause", "Applause", Sparkles],
                      ["heart", "Heart", Heart],
                      ["star", "Star", Star],
                    ] as const
                  ).map(([key, label, Icon]) => (
                    <Button
                      key={key}
                      variant={reaction === key ? "playful" : "outline"}
                      className="min-h-11"
                      onClick={() => setReaction(key)}
                    >
                      <Icon size={16} />
                      {label}
                    </Button>
                  ))}
                </div>
                <p className="mt-4 font-bold">Your vote</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["inspiring", "Inspiring"],
                      ["learned_something", "Learned something"],
                      ["would_try", "I'd try it"],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      variant={vote === key ? "playful" : "outline"}
                      className="min-h-11"
                      onClick={() => setVote(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="playful"
                  className="mt-4 min-h-11 w-full"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Send reaction and vote
                </Button>
              </>
            )}
            <p className="mt-3 text-sm">
              {Object.values(guide.reactions ?? {}).reduce((a, b) => a + b, 0)} reactions ·{" "}
              {Object.values(guide.votes ?? {}).reduce((a, b) => a + b, 0)} votes
            </p>
          </>
        ) : !error ? (
          <p role="status" className="mt-4">
            Opening Showcase…
          </p>
        ) : null}
        {error && (
          <p role="alert" className="mt-4 text-destructive">
            {error}
          </p>
        )}
      </RoomExperienceCard>
    </section>
  );
}
