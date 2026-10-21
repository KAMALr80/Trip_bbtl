import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { LEGAL_VERSION, legalLinks } from '@/lib/legal';

const db = supabase as unknown as { rpc: (name: string, args?: object) => Promise<{ data: { legal_version: string | null }[] | null; error: { message: string } | null }> };
export function LegalCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" required checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--primary)]"/><span>I'm 18 or older and agree to the {legalLinks.map((item, i) => <span key={item.href}>{i > 0 ? (i === 2 ? ' and ' : ', ') : ''}<Link to="/legal/$document" params={{ document: item.href.split("/").pop() || "terms" }} target="_blank" rel="noopener noreferrer" className="text-primary underline" onClick={e => e.stopPropagation()}>{item.label}</Link></span>)}.</span></label>;
}
export function LegalConsent({ onAccepted }: { onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="min-h-dvh max-w-lg mx-auto flex flex-col justify-center px-6 py-10"><p className="eyebrow">TRIPJUNKIES</p><h1 className="font-display text-3xl font-extrabold mt-2">One quick agreement</h1><p className="mt-3 text-sm text-muted-foreground">Please review these before continuing.</p><div className="mt-7"><LegalCheckbox checked={checked} onChange={setChecked}/></div>{error && <p role="alert" className="mt-3 text-destructive text-sm">{error}</p>}<Button variant="playful" size="lg" className="mt-7 w-full" disabled={!checked || busy} onClick={async () => { setBusy(true); const r=await db.rpc('accept_legal',{p_version:LEGAL_VERSION}); setBusy(false); if(r.error) setError(friendlyError(r.error)); else onAccepted(); }}>{busy ? 'Saving…' : 'Continue'}</Button></main>;
}
export function useLegalStatus(userId: string | undefined) {
  const [status, setStatus] = useState<'loading' | 'required' | 'accepted'>('loading');
  useEffect(() => { if (!userId) { setStatus('loading'); return; } let live=true; void db.rpc('account_status').then(r => { if(live) setStatus(r.error || r.data?.[0]?.legal_version !== LEGAL_VERSION ? 'required':'accepted'); }); return () => { live=false; }; },[userId]);
  return { status, accept: () => setStatus('accepted') };
}
export function FoundingBadge({ userId, straight = false }: { userId: string; straight?: boolean }) {
  const [member, setMember] = useState(false);
  useEffect(() => { let live=true; void (supabase as unknown as { rpc: (n:string,a:object)=>Promise<{data:boolean|null}> }).rpc('founding_member',{p_user:userId}).then(r => {if(live) setMember(!!r.data);}); return () => {live=false;}; },[userId]);
  return member ? <span className={straight ? "founding-member-badge inline-flex items-center whitespace-nowrap rounded-full border-2 border-green bg-green-soft text-green px-3 py-1 text-xs font-extrabold" : "passport-stamp inline-flex border-green text-green px-3 py-1 text-xs font-extrabold"}>✦ Founding Member</span> : null;
}
export function FoundingControls() {
  const [open,setOpen]=useState<boolean|null>(null), [error,setError]=useState('');
  useEffect(()=>{void (supabase as unknown as { rpc:(n:string)=>Promise<{data:{founding_open:boolean}[]|null}> }).rpc('account_status').then(r=>setOpen(r.data?.[0]?.founding_open??null));},[]);
  return <section className="mt-5"><h2 className="font-display font-bold text-xl">Founding Members</h2><p className="text-sm text-muted-foreground mt-1">Enrollment is {open === null ? 'loading' : open ? 'open' : 'closed'}.</p><Button variant="outline" className="mt-3" disabled={open===null} onClick={async()=>{ const next=!open; const r=await (supabase as unknown as {rpc:(n:string,a:object)=>Promise<{error:{message:string}|null}>}).rpc('set_founding_open',{p_open:next});if(r.error)setError(friendlyError(r.error));else {setOpen(next);setError('');}}}>{open ? 'Close enrollment' : 'Open enrollment'}</Button>{error && <p role="alert" className="text-destructive text-sm">{error}</p>}</section>;
}
