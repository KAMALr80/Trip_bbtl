import { safeSetItem } from "@/lib/safe-storage";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RememberedSection({ id, title, defaultOpen = false, center = false, children }: { id: string; title: ReactNode; defaultOpen?: boolean; center?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { const saved = localStorage.getItem(`tripjunkie-section-${id}`); if (saved !== null) setOpen(saved === "true"); }, [id]);
  useEffect(() => { const on = (e: Event) => { if ((e as CustomEvent<string>).detail === id) setOpen(true); }; window.addEventListener("tripjunkie-open-section", on); return () => window.removeEventListener("tripjunkie-open-section", on); }, [id]);
  function toggle() { setOpen(value => { safeSetItem(`tripjunkie-section-${id}`, String(!value)); return !value; }); }
  return <section id={`sec-${id}`} className="mt-4 border-b border-border pb-3 scroll-mt-4"><Button variant="ghost" data-view-navigation="true" className={`w-full min-h-14 px-0 text-left font-display text-lg font-extrabold ${center ? "justify-center text-center gap-2" : "justify-between"}`} aria-expanded={open} aria-controls={`panel-${id}`} onClick={toggle}>{title}<span className="luggage-toggle"><ChevronDown className={`size-5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}/></span></Button>{open && <div id={`panel-${id}`} className="section-enter">{children}</div>}</section>;
}