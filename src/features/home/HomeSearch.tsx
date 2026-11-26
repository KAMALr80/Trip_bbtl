// Home search (founder review): the "Search destinations and games" bar used to open the welcome
// tour. It now searches what Home can open: the rooms, the Games on Flight, a few doors (Passport,
// Join with Code, Journey, the tour) and countries ("Plan a trip to Portugal"). Local lists only;
// nothing here reads trip data or calls the server.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { roomIds, type RoomId } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { displayGameTitle } from "@/lib/display-game-title";
import { COUNTRIES } from "@/lib/places";

/** The Games on Flight titles, as on the arcade grid. */
export const SEARCH_GAMES = [
  "Mix It Up",
  "Card flip",
  "Spin the wheel",
  "30-sec Draw",
  "Guess the song",
  "Never Have I Ever",
  "Vote showdown",
  "Two truths & lie",
  "Bingo",
  "Scavenger hunt",
] as const;

type Hit = { key: string; label: string; line?: string; go: () => void };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Items whose label contains every word typed, in any order. */
export function matches(label: string, query: string) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const hay = norm(label);
  return words.every((w) => hay.includes(w));
}

export function HomeSearch({
  onClose,
  onRoom,
  onGames,
  onPassport,
  onJoin,
  onJourney,
  onTour,
}: {
  onClose: () => void;
  onRoom: (room: RoomId, country?: string) => void;
  onGames: () => void;
  onPassport: () => void;
  onJoin: () => void;
  onJourney: () => void;
  onTour: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const sections = useMemo(() => {
    const rooms: Hit[] = roomIds.map((id) => ({
      key: `room-${id}`,
      label: t(`rooms.${id}.name`),
      line: t(`rooms.${id}.line`),
      go: () => onRoom(id),
    }));
    const games: Hit[] = SEARCH_GAMES.map((g) => ({
      key: `game-${g}`,
      // The same title the arcade grid shows ("Spin the Wheel", "Two Truths & a Lie").
      label: displayGameTitle(g),
      line: t("search.gamesLine"),
      go: onGames,
    }));
    const more: Hit[] = [
      { key: "passport", label: t("search.passport"), go: onPassport },
      { key: "join", label: t("search.join"), go: onJoin },
      { key: "journey", label: t("search.journey"), go: onJourney },
      { key: "tour", label: t("search.tour"), go: onTour },
    ];
    const query = q.trim();
    if (!query)
      return [
        { title: t("search.rooms"), hits: rooms },
        { title: t("search.games"), hits: games },
        { title: t("search.more"), hits: more },
      ];
    const places: Hit[] = COUNTRIES.filter((c) => matches(c.name, query))
      .slice(0, 6)
      .map((c) => ({
        key: `place-${c.code}`,
        label: t("search.planTo", { place: c.name }),
        go: () => onRoom("trip", c.code),
      }));
    return [
      { title: t("search.places"), hits: places },
      {
        title: t("search.rooms"),
        hits: rooms.filter((h) => matches(`${h.label} ${h.line}`, query)),
      },
      { title: t("search.games"), hits: games.filter((h) => matches(h.label, query)) },
      { title: t("search.more"), hits: more.filter((h) => matches(h.label, query)) },
    ].filter((s) => s.hits.length);
  }, [q, t, onRoom, onGames, onPassport, onJoin, onJourney, onTour]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-background/80" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("search.title")}
        className="relative w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-[2rem] border border-border bg-card p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-2xl border-2 border-border bg-background px-3 focus-within:border-primary">
            <Search size={18} aria-hidden />
            <input
              ref={input}
              className="h-12 w-full bg-transparent outline-none"
              aria-label={t("search.label")}
              placeholder={t("search.placeholder")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("search.close")}>
            <X />
          </Button>
        </div>
        {sections.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground" role="status">
            {t("search.none", { q: q.trim() })}
          </p>
        )}
        {sections.map((s) => (
          <div key={s.title} className="mt-5">
            <p className="eyebrow text-blue">{s.title}</p>
            <ul className="mt-2 grid gap-2">
              {s.hits.map((h) => (
                <li key={h.key}>
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 w-full flex-col items-start gap-0 py-2 text-left"
                    onClick={() => {
                      onClose();
                      h.go();
                    }}
                  >
                    <span className="font-bold">{h.label}</span>
                    {h.line && (
                      <span className="text-xs font-normal text-muted-foreground whitespace-normal">
                        {h.line}
                      </span>
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
