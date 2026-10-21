import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function DeletedTripNotes() {
  const [notes, setNotes] = useState<{ id: string; trip_name: string }[]>([]);
  useEffect(() => { let live = true; void (supabase as any).from("trip_deletion_notes").select("id,trip_name").order("created_at",{ascending:false}).limit(10).then((r: {data: typeof notes}) => { if (live) setNotes((r.data ?? []).filter(n => !sessionStorage.getItem(`tj-deletion-${n.id}`))); }); return () => {live = false;}; }, []);
  return <>{notes.map(note => <div key={note.id} role="status" className="app-card mb-3 flex gap-2 items-center"><p className="text-sm flex-1">{note.trip_name} was deleted by the Captain.</p><Button variant="ghost" size="sm" onClick={() => { sessionStorage.setItem(`tj-deletion-${note.id}`,"1"); setNotes(v => v.filter(n => n.id !== note.id)); }}>OK</Button></div>)}</>;
}