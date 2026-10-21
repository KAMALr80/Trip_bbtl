import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PublicStampData = { country: string; state: string | null; city: string | null; date: string; trip: string; squad: number; count: number };

export function PublicStamp({ stamp }: { stamp: PublicStampData | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!stamp) return null;
  const place = [stamp.city, stamp.state, stamp.country].filter(Boolean).join(", ");
  return <><Button variant="ghost" size="sm" className="mini-ink ml-2 h-7 max-w-full px-2 text-[10px]" aria-label={`Open ${place} stamp, ${stamp.count} stamps`} onClick={() => setOpen(true)}>{stamp.state || stamp.country} · ×{stamp.count}</Button>{open && <div className="fixed inset-0 z-[80] flex items-end justify-center"><div className="absolute inset-0 bg-foreground/70" onClick={() => setOpen(false)}/><div role="dialog" aria-modal="true" aria-label="Stamp detail" className="relative w-full max-w-lg rounded-t-lg bg-card p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft"><Button variant="ghost" size="icon" className="absolute right-4 top-4" aria-label="Close stamp" onClick={() => setOpen(false)}><X/></Button><p className="eyebrow">PASSPORT STAMP</p><h3 className="mt-2 font-display text-2xl font-extrabold">{place}</h3><p className="mt-3 text-muted-foreground">{stamp.trip} · {new Date(`${stamp.date}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</p><p className="mt-2 text-sm">{stamp.squad} in the squad</p><p className="mt-2 text-sm">Earned by finishing this trip with the squad.</p></div></div>}</>;
}