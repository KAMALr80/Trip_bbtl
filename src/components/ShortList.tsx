import { safeSetItem } from "@/lib/safe-storage";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Compact, in-place list disclosure with a remembered choice per list. */
export function ShortList<T>({
  items,
  id,
  children,
  limit = 3,
  scrollPanel = false,
  current,
}: {
  items: T[];
  id: string;
  children: (item: T, index: number) => ReactNode;
  limit?: number;
  scrollPanel?: boolean;
  current?: (item: T) => boolean;
}) {
  const [all, setAll] = useState(false);
  useEffect(() => {
    try {
      setAll(localStorage.getItem(`tripjunkie-list-${id}`) === "true");
    } catch {
      /* storage unavailable */
    }
  }, [id]);
  const pinned = current ? items.filter(current) : [];
  const initial = items.slice(0, limit);
  const visible = scrollPanel
    ? [...new Set([...initial, ...pinned])]
    : items.length > limit && !all
      ? initial
      : items;
  const rest = items.filter((item) => !visible.includes(item));
  return (
    <>
      {visible.map((item) => children(item, items.indexOf(item)))}
      {items.length > limit && (
        <Button
          variant="ghost"
          className="w-full mt-2"
          aria-expanded={all}
          onClick={() => {
            setAll(!all);
            try {
              safeSetItem(`tripjunkie-list-${id}`, String(!all));
            } catch {
              /* storage unavailable */
            }
          }}
        >
          {scrollPanel
            ? all
              ? "See less"
              : `See all (${items.length})`
            : all
              ? "Show less"
              : `Show all (${items.length})`}{" "}
          <span className="luggage-toggle">
            <ChevronDown className={`size-5 transition-transform ${all ? "rotate-180" : ""}`} />
          </span>
        </Button>
      )}
      {scrollPanel && all && (
        <div className="cinematic-scroll-list" role="region" aria-label="More people and places">
          {rest.map((item) => children(item, items.indexOf(item)))}
        </div>
      )}
    </>
  );
}
