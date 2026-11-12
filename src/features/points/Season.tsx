// Confetti burst used by the unlock and checkout screens. The older game-night season board that
// lived here (stamps, game_board, finalize_season) was retired with the points ledger (M3-16).
import { useEffect, useMemo, useState } from "react";

const barColors = ["bg-primary", "bg-green", "bg-orange", "bg-blue"];

export function Confetti({ burst }: { burst: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!burst || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 1200);
    return () => window.clearTimeout(t);
  }, [burst]);
  const bits = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: 35 + Math.random() * 30,
        delay: Math.random() * 0.12,
        dur: 0.85 + Math.random() * 0.3,
        rot: Math.random() * 360,
        color: barColors[i % 4],
      })),
    // A new burst re-rolls the confetti on purpose, though the pieces don't read `burst`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [burst],
  );
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className={`confetti-bit absolute -top-4 h-3 w-2 rounded-sm ${b.color}`}
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            rotate: `${b.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
