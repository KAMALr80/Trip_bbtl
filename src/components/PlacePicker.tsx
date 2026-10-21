import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COUNTRIES, US_STATES, countryName, type Place } from "@/lib/places";

export type PlaceSuggestion = Place & { sample?: boolean };
const empty: Place = { country: null, region: null, city: null };

/** One place control for entry and browsing; all stored country values remain ISO codes. */
export function PlacePicker({ value, onChange, items = [], browse = false }: { value: Place; onChange: (value: Place) => void; items?: PlaceSuggestion[]; browse?: boolean }) {
  const id = useId();
  const [focused, setFocused] = useState<keyof Place | null>(null);
  const [query, setQuery] = useState({ country: "", region: "", city: "" });
  const [active, setActive] = useState(0);
  const refs = { country: useRef<HTMLInputElement>(null), region: useRef<HTMLInputElement>(null), city: useRef<HTMLInputElement>(null) };
  useEffect(() => { setQuery({ country: value.country ? countryName(value.country) : "", region: value.region ?? "", city: value.city ?? "" }); }, [value.country, value.region, value.city]);
  const select = (key: keyof Place, text: string) => {
    const next = key === "country" ? { ...empty, country: COUNTRIES.find(c => c.name.toLowerCase() === text.toLowerCase())?.code ?? text } : key === "region" ? { ...value, region: text || null, city: null } : { ...value, city: text || null };
    onChange(next); setQuery(q => ({ ...q, [key]: text })); setFocused(null); setActive(0);
    if (key !== "city") requestAnimationFrame(() => refs[key === "country" ? "region" : "city"].current?.focus());
  };
  const options = (key: keyof Place) => {
    const typed = query[key].trim().toLocaleLowerCase();
    if (key === "country") {
      const counts = new Map<string, number>(); items.forEach(i => { if (i.country) counts.set(i.country, (counts.get(i.country) ?? 0) + (i.sample ? 0 : 1)); });
      return COUNTRIES.filter(c => !typed || c.name.toLowerCase().includes(typed)).sort((a,b) => !typed ? (counts.get(b.code) ?? 0) - (counts.get(a.code) ?? 0) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)).slice(0,8).map(c => ({ label: c.name, count: counts.get(c.code) ?? 0 }));
    }
    const names = key === "region" ? [...(value.country === "US" ? US_STATES : []), ...items.filter(i => i.country === value.country).map(i => i.region).filter((s): s is string => !!s)] : items.filter(i => i.country === value.country && (!value.region || i.region === value.region)).map(i => i.city).filter((s): s is string => !!s);
    return [...new Set(names)].filter(s => !typed || s.toLowerCase().includes(typed)).slice(0,8).map(label => ({ label, count: 0 }));
  };
  return <div className="grid gap-3">
    {(["country", "region", "city"] as const).map(key => {
      const list = options(key), enabled = key === "country" || !!value.country;
      const custom = query[key].trim() && !list.some(o => o.label.toLowerCase() === query[key].trim().toLowerCase());
      const total = list.length + (custom ? 1 : 0);
      return <div key={key} className="relative min-w-0"><label className="mb-1 block text-sm font-bold" htmlFor={`${id}-place-${key}`}>{key === "country" ? "Country" : key === "region" ? "Region / State" : "City"}{key !== "country" && <span className="font-normal text-muted-foreground"> · optional</span>}</label>
        <div className="relative"><input id={`${id}-place-${key}`} ref={refs[key]} disabled={!enabled} autoComplete="off" className="min-h-11 w-full rounded-full border border-border bg-card px-4 pr-11 text-base text-foreground outline-none focus:border-primary disabled:opacity-50" placeholder={key === "country" ? "Search countries" : key === "region" ? "Search regions or states" : "Search cities"} value={query[key]} onFocus={() => { setFocused(key); setActive(0); }} onChange={e => { setQuery(q => ({ ...q, [key]: e.target.value })); setFocused(key); setActive(0); }} onKeyDown={e => { if (e.key === "ArrowDown" && total) { e.preventDefault(); setActive(a => Math.min(a+1, total-1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a-1,0)); } if (e.key === "Enter" && focused === key && total) { e.preventDefault(); select(key, active < list.length ? (list[active]?.label ?? "") : query[key].trim()); } if (e.key === "Escape") setFocused(null); }} aria-expanded={focused === key} aria-controls={`${id}-place-options-${key}`} role="combobox" />
           {(query[key] || value[key]) && <Button type="button" variant="ghost" size="icon" aria-label={`Clear ${key}`} className="absolute right-0 top-0 min-h-11 min-w-11" onClick={() => { onChange(key === "country" ? empty : key === "region" ? { ...value, region: null, city: null } : { ...value, city: null }); setQuery(q => key === "country" ? { country: "", region: "", city: "" } : key === "region" ? { ...q, region: "", city: "" } : { ...q, city: "" }); refs[key].current?.focus(); }}><X size={16}/></Button>}</div>
        {focused === key && enabled && <div id={`${id}-place-options-${key}`} role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">{list.map((o,i) => <Button type="button" variant="ghost" key={o.label} role="option" aria-selected={i === active} className="flex min-h-11 w-full justify-between rounded-none text-left" onMouseDown={e => e.preventDefault()} onClick={() => select(key,o.label)}>{o.label}{browse && key === "country" && o.count > 0 && <span className="text-xs text-muted-foreground">{o.count}</span>}</Button>)}{custom && <Button type="button" variant="ghost" role="option" aria-selected={active === list.length} className="min-h-11 w-full justify-start rounded-none text-left" onMouseDown={e => e.preventDefault()} onClick={() => select(key,query[key].trim())}>Use what I typed: {query[key].trim()}</Button>}</div>}
        {key !== "country" && enabled && <Button type="button" variant="ghost" size="sm" className="mt-1 min-h-11" onClick={() => { if (key === "region") { onChange({ ...value, region: null, city: null }); setQuery(q => ({ ...q, region: "", city: "" })); refs.city.current?.focus(); } else { onChange({ ...value, city: null }); setQuery(q => ({ ...q, city: "" })); setFocused(null); } }}>Skip {key === "region" ? "region" : "city"}</Button>}
      </div>;
    })}
  </div>;
}