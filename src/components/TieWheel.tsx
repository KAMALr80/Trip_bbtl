// Tie-break wheel shown at crowning when two players finish level (server picks the winner).
import { useEffect, useState } from "react";

const SLICE = ["var(--primary)", "var(--blue)", "var(--green)", "var(--orange)"];
export function TieWheel({
  ids,
  winner,
  spinAt,
  nameOf,
}: {
  ids: string[];
  winner: string | null;
  spinAt: string | null;
  nameOf: (id: string) => string;
}) {
  const n = ids.length,
    deg = 360 / n;
  const target = winner ? ids.indexOf(winner) : -1;
  const final = target >= 0 ? 360 * 6 + (360 - (target + 0.5) * deg) : 0;
  const fresh = !!spinAt && Date.now() - new Date(spinAt).getTime() < 8000;
  const [angle, setAngle] = useState(fresh ? 0 : final);
  useEffect(() => {
    if (!fresh) {
      setAngle(final);
      return;
    }
    const t = window.setTimeout(() => setAngle(final), 50);
    return () => window.clearTimeout(t);
  }, [final, fresh]);
  const bg = `conic-gradient(${ids.map((_, k) => `${SLICE[k % SLICE.length]} ${k * deg}deg ${(k + 1) * deg}deg`).join(",")})`;
  return (
    <div className="text-center" aria-label="Tie-break wheel">
      <div className="mx-auto w-0 h-0 border-x-[9px] border-x-transparent border-t-[15px] border-t-foreground" />
      <div
        className="relative mx-auto mt-1 size-[170px] rounded-full border-2 border-blue ring-4 ring-wheel-hub overflow-hidden motion-safe:transition-transform motion-safe:duration-[5000ms] motion-safe:ease-[cubic-bezier(.12,.78,.18,1)]"
        style={{ background: bg, transform: `rotate(${angle}deg)` }}
      >
        {ids.map((id, k) => (
          <span
            key={id}
            className="absolute left-1/2 top-1/2 text-[11px] font-extrabold text-background"
            style={{
              transform: `rotate(${(k + 0.5) * deg}deg) translateY(-56px) translateX(-50%)`,
              transformOrigin: "0 0",
            }}
          >
            {nameOf(id).slice(0, 10)}
          </span>
        ))}
      </div>
    </div>
  );
}
