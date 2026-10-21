import { Sparkles } from "lucide-react";

export function ArcadeBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-soft text-blue text-[11px] font-extrabold tracking-wide animate-pulse">
      <Sparkles size={12} />
      LIVE REHEARSAL
    </div>
  );
}
