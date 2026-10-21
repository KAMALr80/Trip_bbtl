import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlacePicker } from "@/components/PlacePicker";
import { countryName, placeLabel, type Place } from "@/lib/places";

export type PlaceItem = Place & { id: string; title: string; sample?: boolean };

/** Shared three-field filter for experiences, destinations and rooms. */
export function PlaceBrowser<T extends PlaceItem>({
  items,
  renderItem,
  renderEmpty,
  onAdd,
  noun = "experience",
  headline = "Explore by place",
  addLabel,
  picker = false,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
  renderEmpty?: (place: Place) => ReactNode;
  onAdd?: (place: Place) => void;
  noun?: string;
  headline?: string;
  addLabel?: string;
  picker?: boolean;
}) {
  const [path, setPath] = useState<Place>({ country: null, region: null, city: null });
  const filtered = items.filter(
    (i) =>
      (!path.country || i.country === path.country) &&
      (!path.region || i.region === path.region) &&
      (!path.city || i.city === path.city),
  );
  const title = placeLabel(path) || (path.country ? countryName(path.country) : "");
  return (
    <section className="mt-8 min-w-0 max-w-full">
      <h2 className="mb-4 font-display text-xl font-extrabold">{headline}</h2>
      <PlacePicker value={path} onChange={setPath} items={items} browse={!picker} />
      {!picker && (
        <div className="mt-5">
          {filtered.length
            ? filtered.map((i) => <div key={i.id}>{renderItem(i)}</div>)
            : path.country
              ? (renderEmpty?.(path) ?? (
                  <p className="text-sm text-muted-foreground">No {noun}s here yet.</p>
                ))
              : null}
        </div>
      )}
      {path.country && onAdd && (
        <Button variant="playful" className="mt-4 min-h-11 w-full" onClick={() => onAdd(path)}>
          <Plus size={16} /> {addLabel ? `${addLabel} ${title}` : `Share from ${title}`}
        </Button>
      )}
    </section>
  );
}
