import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type Activity = { kind: "bingo" | "quest" | "trivia"; item_index: number; prompt: string; alternative: string; options?: string[] | null };
export type ActivitySwap = { kind: string; item_index: number; user_id: string; alternative: string };
const db = supabase as unknown as { rpc: (name: string, args: object) => PromiseLike<{error: {message: string}|null}> };

export function ActivityAlternative({tripId,date,kind,index,userId,captainId,host,defaultText,swaps,onChanged}:{tripId:string;date:string;kind:string;index:number;userId:string;captainId:string|undefined;host:boolean;defaultText:string;swaps:ActivitySwap[];onChanged:()=>void}) {
  const [editing,setEditing]=useState(false), [value,setValue]=useState(""),[group,setGroup]=useState(false),[error,setError]=useState("");
  const isFoodDrink = /\b(food|drink|sip|beer|wine|cocktail|soda|tea|coffee|snack|meal|dessert|restaurant|café|cafe|taste|eat|dine|local cuisine|market|street food)\b/i.test(defaultText);
  if (!isFoodDrink) return null;
  const personal=swaps.find(s=>s.kind===kind&&s.item_index===index&&s.user_id===userId);
  const shared=swaps.find(s=>s.kind===kind&&s.item_index===index&&s.user_id===captainId);
  async function save() { if (!value.trim()) return;setError("");const {error:failure}=await db.rpc("use_item_alternative",{p_trip:tripId,p_date:date,p_kind:kind,p_index:index,p_alternative:value.trim(),p_group:group});if(failure){console.error("Alternative failed",failure);setError("Couldn't save the alternative. Try again.");}else{setEditing(false);onChanged();} }
  return <div className="mt-2 text-xs"><p className="text-green">{personal?.alternative||shared?.alternative ? `Alternative: ${personal?.alternative||shared?.alternative}` : "Any drink counts. Drinking never earns stamps."}</p><Button variant="link" size="sm" className="h-9 px-0 text-blue" onClick={()=>{setValue(personal?.alternative||shared?.alternative||"");setEditing(!editing);}}>Use alternative</Button>{editing && <div className="space-y-2"><input className="w-full h-12 rounded-xl border-2 border-border bg-background px-3 text-foreground" value={value} maxLength={160} onChange={e=>setValue(e.target.value)} placeholder="e.g. local soda or street-food snack" aria-label="Alternative activity"/>{host&&<label className="flex gap-2 items-center"><input type="checkbox" className="size-5 accent-primary" checked={group} onChange={e=>setGroup(e.target.checked)}/>Swap for everyone</label>}<Button size="sm" variant="green" disabled={!value.trim()} onClick={()=>void save()}>Save alternative</Button>{error&&<p role="alert" className="text-destructive">{error}</p>}</div>}</div>;
}