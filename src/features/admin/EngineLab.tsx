// Test Lab for the new engine (M6-06, R-908): make a sandbox for any room × "Who's playing?" with
// bots, jump it to any phase (by moving its dates; real trips can't be moved), and let the bots play
// what is open. Founder only; the server checks (trip_private.lab_guard).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { rpc } from "@/data/rpc";
import { roomIds, rooms, type PlayMode, type RoomId } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";

const jumps = ["preflight", "takeoff", "trip_season", "baggage_claim", "locked"] as const;

export function EngineLab({
  trips,
  activeId,
  selectTrip,
  refresh,
  goPlay,
}: {
  trips: TripWithRole[];
  activeId?: string | undefined;
  selectTrip: (id: string) => void;
  refresh: (id?: string) => Promise<void>;
  goPlay: () => void;
}) {
  const t = useT();
  const [room, setRoom] = useState<RoomId>("trip");
  const [mode, setMode] = useState<PlayMode>("crew");
  const [size, setSize] = useState(4);
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const cfg = rooms[room];
  const modes = cfg.modes;
  const active = trips.find((x) => x.id === activeId && x.is_sandbox && x.rules_version === 2);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg("");
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="mt-5 rounded-[1.5rem] border border-border bg-card p-4"
      aria-label={t("lab.title")}
    >
      <h2 className="font-display text-lg font-extrabold">{t("lab.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("lab.intro")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold">
          {t("lab.room")}
          <select
            className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2"
            value={room}
            onChange={(e) => {
              const next = roomIds.find((r) => r === e.target.value) ?? "trip";
              setRoom(next);
              if (!rooms[next].modes.includes(mode)) setMode(rooms[next].modes[0] ?? "crew");
              setDays(Math.min(Math.max(days, rooms[next].mainDays.min), rooms[next].mainDays.max));
            }}
          >
            {roomIds.map((r) => (
              <option key={r} value={r}>
                {t(`rooms.${r}.name`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("lab.mode")}
          <select
            className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2"
            value={mode}
            onChange={(e) => setMode(modes.find((m) => m === e.target.value) ?? "crew")}
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {t(`modes.${m}.name`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("lab.size")}
          <input
            type="number"
            className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2"
            min={2}
            max={cfg.maxCrew}
            disabled={mode !== "crew"}
            value={mode === "crew" ? size : 1}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
        <label className="text-sm font-semibold">
          {t("lab.days")}
          <input
            type="number"
            className="mt-1 block min-h-11 w-full rounded-md border bg-background px-2"
            min={cfg.mainDays.min}
            max={cfg.mainDays.max}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
      </div>
      <Button
        className="mt-3 min-h-11 w-full"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const { data, error } = await rpc("lab_engine_create", {
              p_room: room,
              p_mode: mode,
              p_size: size,
              p_days: days,
            });
            if (error) throw error;
            if (data) {
              await refresh(data);
              selectTrip(data);
            }
            return t("lab.created");
          })
        }
      >
        {t("lab.create")}
      </Button>
      {active ? (
        <div className="mt-4">
          <p className="text-sm font-bold">{t("lab.activeTitle", { name: active.name })}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {jumps.map((j) => (
              <Button
                key={j}
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const { data, error } = await rpc("lab_jump", {
                      p_trip: active.id,
                      p_phase: j,
                    });
                    if (error) throw error;
                    await refresh(active.id);
                    return t("lab.jumped", { phase: data ?? j });
                  })
                }
              >
                {t(`lab.jump.${j}`)}
              </Button>
            ))}
            <Button
              className="min-h-11"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { data, error } = await rpc("lab_engine_play", { p_trip: active.id });
                  if (error) throw error;
                  await refresh(active.id);
                  return t("lab.played", { result: data ?? "" });
                })
              }
            >
              {t("lab.play")}
            </Button>
          </div>
          <Button variant="ghost" className="mt-2 min-h-11" onClick={goPlay}>
            {t("lab.openPlay")}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{t("lab.pickOne")}</p>
      )}
      {msg && (
        <p className="mt-2 text-sm font-bold" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
