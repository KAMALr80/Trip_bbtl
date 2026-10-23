import { useEffect, useRef, useState } from "react";

/** The caller chooses the result; the wheel is presentation only. */
export function GameWheel({
  items,
  winner,
  spinKey,
  onStop,
  compact = false,
}: {
  items: string[];
  winner: number | null;
  spinKey: string | number | null;
  onStop?: () => void;
  compact?: boolean;
}) {
  const [angle, setAngle] = useState(0);
  const [moving, setMoving] = useState(false);
  const prior = useRef<string | number | null>(null);
  const stop = useRef(onStop);
  stop.current = onStop;
  useEffect(() => {
    if (spinKey == null || spinKey === prior.current || winner == null || !items.length) return;
    prior.current = spinKey;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = 360 / items.length;
    const target = (360 - (winner * step + step / 2)) % 360;
    setAngle(
      (previous) => previous + (reduced ? 0 : 1800) + ((target - (previous % 360) + 360) % 360),
    );
    if (reduced) {
      stop.current?.();
      return;
    }
    setMoving(true);
    const timer = window.setTimeout(() => {
      setMoving(false);
      stop.current?.();
    }, 3100);
    return () => window.clearTimeout(timer);
  }, [spinKey, winner, items.length]);
  const count = Math.max(1, items.length);
  return (
    <div
      className={`cinema-wheel ${compact ? "cinema-wheel-compact" : ""}`}
      role="img"
      aria-label={
        moving
          ? "Wheel spinning"
          : winner == null
            ? "Wheel ready"
            : `Wheel landed on ${items[winner] ?? "challenge"}`
      }
    >
      <div className="cinema-wheel-pointer" aria-hidden="true" />
      <div className="cinema-wheel-disc" style={{ transform: `rotate(${angle}deg)` }}>
        {items.map((item, i) => (
          <span
            key={`${i}-${item}`}
            className="cinema-wheel-label"
            style={{
              transform: `rotate(${((i + 0.5) * 360) / count}deg) translateY(calc(var(--wheel-size) * -.32)) rotate(90deg)`,
            }}
            title={item}
          >
            {item}
          </span>
        ))}
        <div className="cinema-wheel-hub" aria-hidden="true">
          ✦
        </div>
      </div>
      <div className="cinema-wheel-lights" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i
            key={i}
            style={{
              transform: `rotate(${i * 15}deg) translateY(calc(var(--wheel-size) * -.485))`,
            }}
          />
        ))}
      </div>
      {!moving && spinKey != null && (
        <div className="cinema-wheel-spark" aria-hidden="true">
          ✦ ✧ ✦
        </div>
      )}
    </div>
  );
}
