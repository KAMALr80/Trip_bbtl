import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Request = { message: string; resolve: (answer: boolean) => void };
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  useEffect(() => {
    const handler = (event: Event) => setRequest(previous => { previous?.resolve(false); return (event as CustomEvent<Request>).detail; });
    window.addEventListener("tripjunkies-confirm", handler);
    return () => window.removeEventListener("tripjunkies-confirm", handler);
  }, []);
  useEffect(() => { if (!request) return; const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { request.resolve(false); setRequest(null); } }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [request]);
  if (!request) return null;
  const close = (answer: boolean) => { request.resolve(answer); setRequest(null); };
  return <div className="fixed inset-0 z-[100] flex items-end justify-center" role="presentation"><div className="absolute inset-0 bg-background/80" onClick={() => close(false)}/><section role="dialog" aria-modal="true" aria-label="Confirm action" className="relative w-full max-w-lg rounded-t-3xl border border-border bg-card px-6 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] animate-slide-up"><h2 className="font-display text-xl font-extrabold">Are you sure?</h2><p className="text-sm text-muted-foreground mt-2 break-words">{request.message}</p><div className="grid grid-cols-2 gap-3 mt-6"><Button variant="outline" onClick={() => close(false)}>Cancel</Button><Button variant="playful" onClick={() => close(true)}>Confirm</Button></div></section></div>;
}
