import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { compressImage } from "@/lib/compress-image";

type Item = { id: string; author_id: string; kind: "photo" | "review" | "tip"; body: string; photo_path: string | null; status: string; position: number };
const field = "mt-2 w-full rounded-xl border border-border bg-card p-3 text-base text-foreground outline-none focus:border-primary";
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));

/** One shared Window Seat guide per trip: crew propose, only the Captain curates and publishes. */
export function CrewGuide({ tripId, tripName, userId, isCaptain, publishedAt, onChanged }: { tripId: string; tripName: string; userId: string; isCaptain: boolean; publishedAt: string | null; onChanged?: () => void }) {
  const [isWindow, setIsWindow] = useState(false), [items, setItems] = useState<Item[]>([]), [urls, setUrls] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<Item["kind"]>("tip"), [body, setBody] = useState(""), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [published, setPublished] = useState(publishedAt);
  async function load() {
    const seats = await supabase.rpc("seat_status", { p_trip: tripId });
    const win = !!seats.data?.[0]?.is_window; setIsWindow(win); if (!win) return;
    const { data } = await supabase.from("window_guide_items").select("id,author_id,kind,body,photo_path,status,position").eq("trip_id", tripId).neq("status", "removed").order("position");
    const rows = (data ?? []) as Item[]; setItems(rows);
    const paths = rows.map(r => r.photo_path).filter((p): p is string => !!p);
    if (paths.length) { const signed = await supabase.storage.from("window-guide").createSignedUrls(paths, 3600); setUrls(Object.fromEntries((signed.data ?? []).filter(s => s.path && s.signedUrl).map(s => [s.path as string, s.signedUrl as string]))); }
  }
  useEffect(() => { void load(); }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isWindow) return null;
  const run = async (fn: () => PromiseLike<{ error: unknown }>) => { setBusy(true); setError(""); const { error: e } = await fn(); if (e) setError(friendlyError(e)); await load(); setBusy(false); };
  async function propose() {
    setBusy(true); setError("");
    try {
      let path: string | null = null;
      if (kind === "photo") {
        if (!file) throw new Error("Choose a photo");
        const blob = await compressImage(file);
        path = `${tripId}/${userId}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from("window-guide").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
      }
      const { error: e } = await supabase.rpc("guide_propose", { p_trip: tripId, p_kind: kind, p_body: body, ...(path ? { p_photo: path } : {}) });
      if (e) throw e;
      setBody(""); setFile(null); await load();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  const approved = items.filter(i => i.status === "approved");
  function download() {
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(tripName)} guide</title><body style="font-family:sans-serif;max-width:640px;margin:auto;padding:16px"><h1>${esc(tripName)}</h1>${approved.map(i => `<section><h3>${i.kind === "photo" ? "Photo" : i.kind === "review" ? "Review" : "Tip"}</h3>${i.photo_path && urls[i.photo_path] ? `<img src="${urls[i.photo_path]}" style="max-width:100%" alt="">` : ""}<p>${esc(i.body)}</p></section>`).join("")}</body>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = `${tripName.replace(/[^\w-]+/g, "-")}-guide.html`; a.click(); URL.revokeObjectURL(a.href);
  }
  const visible = isCaptain ? items : published ? approved : items.filter(i => i.author_id === userId);
  return <section className="crew-guide-postcard mt-4 border-t border-border pt-4" aria-label="Crew guide">
    <h2 className="font-display font-extrabold text-xl">Our crew guide</h2>
    <p className="text-sm text-muted-foreground mt-1">{isCaptain ? "Your crew sends photos, reviews and tips. You choose what goes in." : published ? "The Captain published the guide." : "Send photos, reviews and tips. The Captain chooses what goes in."}</p>
    <div className="mt-3 grid grid-cols-3 gap-2">{(["photo", "review", "tip"] as const).map(k => <Button key={k} variant={kind === k ? "playful" : "outline"} className="min-h-11" onClick={() => setKind(k)}>{k === "photo" ? "Photo" : k === "review" ? "Review" : "Tip"}</Button>)}</div>
    {kind === "photo" && <input type="file" accept="image/*" className="mt-3 block w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)}/>}
    <textarea className={field} rows={2} maxLength={600} placeholder={kind === "photo" ? "Caption" : kind === "review" ? "What did you think?" : "A tip for the next traveler"} value={body} onChange={e => setBody(e.target.value)}/>
    <Button variant="playful" className="mt-2 w-full min-h-11" disabled={busy || !body.trim()} onClick={() => void propose()}>{isCaptain ? "Add to guide" : "Send to Captain"}</Button>
    <ul className="mt-4 grid gap-2">{visible.map((i, idx) => <li key={i.id} className="app-card min-w-0">
      {i.photo_path && urls[i.photo_path] && <img src={urls[i.photo_path]} alt={i.body} width={640} height={400} loading="lazy" className="w-full rounded-xl object-cover aspect-[16/10]"/>}
      <p className="mt-2 text-sm"><strong>{i.kind === "photo" ? "Photo" : i.kind === "review" ? "Review" : "Tip"}</strong>{i.status === "proposed" ? " · waiting for the Captain" : ""}</p>
      <p className="text-sm">{i.body}</p>
      {isCaptain && <div className="mt-2 flex flex-wrap gap-2">
        {i.status === "proposed" && <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void run(() => supabase.rpc("guide_review", { p_item: i.id, p_action: "approve" }))}><Check size={16}/> Add</Button>}
        {i.status === "approved" && <><Button size="sm" variant="outline" className="min-h-11" aria-label="Move up" disabled={busy || idx === 0} onClick={() => void run(() => supabase.rpc("guide_review", { p_item: i.id, p_action: "up" }))}><ArrowUp size={16}/></Button><Button size="sm" variant="outline" className="min-h-11" aria-label="Move down" disabled={busy} onClick={() => void run(() => supabase.rpc("guide_review", { p_item: i.id, p_action: "down" }))}><ArrowDown size={16}/></Button></>}
        <Button size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => void run(() => supabase.rpc("guide_review", { p_item: i.id, p_action: "remove" }))}><Trash2 size={16}/> Remove</Button>
      </div>}
    </li>)}</ul>
    {isCaptain && <Button variant="outline" className="mt-3 w-full min-h-11" disabled={busy} onClick={() => void run(async () => { const r = await supabase.rpc("guide_publish", { p_trip: tripId, p_on: !published }); if (!r.error) { setPublished(published ? null : new Date().toISOString()); onChanged?.(); } return r; })}>{published ? "Unpublish guide" : "Publish guide for the crew"}</Button>}
    {(isCaptain || published) && approved.length > 0 && <Button variant="playful" className="mt-2 w-full min-h-11" onClick={download}><Download size={16}/> Download guide</Button>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
}
