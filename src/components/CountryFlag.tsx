import { useEffect, useState, type ComponentType } from "react";

type FlagComponent = ComponentType<{ title?: string; className?: string }>;
type FlagSet = Record<string, FlagComponent | undefined>;

// Every country's flag is about 320 KB of SVG, so it stays out of the first chunk and loads the first
// time a flag is shown. A same-sized blank holds its place until then, or if it can't load offline.
let flagSet: Promise<FlagSet> | undefined;
function loadFlags() {
  flagSet ??= import("country-flag-icons/react/3x2").then((m) => m as unknown as FlagSet);
  return flagSet;
}

const DEFAULT_CLASS = "inline-block h-4 w-6 shrink-0 align-middle";

export function CountryFlag({
  code,
  className = DEFAULT_CLASS,
}: {
  code: string;
  className?: string;
}) {
  const normalized = code.trim().toUpperCase();
  const valid = /^[A-Z]{2}$/.test(normalized);
  const [flags, setFlags] = useState<FlagSet | null>(null);
  useEffect(() => {
    if (!valid) return;
    let live = true;
    loadFlags()
      .then((set) => {
        if (live) setFlags(set);
      })
      .catch(() => {
        flagSet = undefined; // try again next time, once there's a network
      });
    return () => {
      live = false;
    };
  }, [valid]);
  if (!valid) return null;
  if (!flags) return <span aria-hidden="true" className={className} />;
  const Flag = flags[normalized];
  return Flag ? <Flag title={normalized} className={className} /> : null;
}
