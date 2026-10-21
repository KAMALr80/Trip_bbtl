import { friendlyError } from "@/lib/friendly-error";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { suggestTripMottos } from "@/lib/trip-names.functions";

export function MottoField({ value, onChange, name, destination, tripType, className }: { value: string; onChange: (v: string) => void; name: string; destination: string; tripType?: string; className: string }) {
  const [ideas, setIdeas] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function suggest() {
    if (!name.trim() || !destination.trim()) { setError("Add a trip name and destination first."); return; }
    setBusy(true); setError(""); setIdeas([]);
    try { setIdeas(await suggestTripMottos({ data: { name: name.trim(), destination: destination.trim(), tripType: tripType?.trim() || undefined } })); }
    catch (e) { setError(e instanceof Error ? friendlyError(e) : "Motto ideas aren't available right now."); }
    finally { setBusy(false); }
  }
  return <div>
    <label className="block text-sm font-bold"><span className="flex justify-between">Trip motto <span className="text-muted-foreground font-normal">(optional) · {value.length}/60</span></span><input className={className} maxLength={60} value={value} onChange={(e) => onChange(e.target.value.slice(0, 60))} placeholder="What does the name mean?" /></label>
    <Button type="button" variant="subtle" size="sm" className="mt-2 w-full" disabled={busy} onClick={() => void suggest()}><Sparkles size={16} />{busy ? "Thinking up mottos…" : "Suggest a motto"}</Button>
    {ideas.length > 0 && <div className="mt-2 space-y-2">{ideas.map((m) => <Button key={m} type="button" variant={value === m ? "green" : "outline"} className="w-full h-auto min-h-11 whitespace-normal py-2 italic" onClick={() => onChange(m)}>{m}</Button>)}</div>}
    {error && <p role="alert" className="text-destructive text-sm mt-2">{error}</p>}
  </div>;
}
