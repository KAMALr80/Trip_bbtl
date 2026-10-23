import * as Flags from "country-flag-icons/react/3x2";

export function CountryFlag({
  code,
  className = "inline-block h-4 w-6 shrink-0 align-middle",
}: {
  code: string;
  className?: string;
}) {
  const normalized = code.trim().toUpperCase();
  const Flag = /^[A-Z]{2}$/.test(normalized) ? Flags[normalized as keyof typeof Flags] : undefined;
  return Flag ? <Flag title={normalized} className={className} /> : null;
}
