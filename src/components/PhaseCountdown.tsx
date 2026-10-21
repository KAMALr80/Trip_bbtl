import { useEffect, useState } from "react";

function remaining(target: string, now: number) {
  const ms = Math.max(0, Date.parse(target) - now);
  const total = Math.ceil(ms / 60_000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function PhaseCountdown({
  target,
  prefix,
  expired,
  timeZone,
  connector = " in ",
  suffix = "",
}: {
  target: string;
  prefix: string;
  expired: string;
  timeZone: string;
  connector?: string;
  suffix?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(media.matches);
    const updateTime = () => {
      if (!document.hidden && !media.matches) setNow(Date.now());
    };
    updateMotion();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateTime);
    const timer = window.setInterval(updateTime, 30_000);
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateTime);
      window.clearInterval(timer);
    };
  }, []);
  if (Date.parse(target) <= now) return <>{expired}</>;
  if (reduced) {
    const time = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(target));
    return (
      <>
        {prefix} by {time}
        {suffix}
      </>
    );
  }
  return (
    <>
      {prefix}
      {connector}
      {remaining(target, now)}
      {suffix}
    </>
  );
}
