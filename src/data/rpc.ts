// Typed RPC calls (M1-05). The one place that bridges two gaps in the generated types:
// - Postgres function parameters carry no nullability, so the generator types every argument as
//   non-null, but the functions accept NULL (often meaning "unchanged" or "none"). `rpc` accepts
//   null for any argument.
// - A few screens pick the function name at runtime; `rpcByName` is for those only.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { rpcOn, type ArgList, type RpcName } from "./rpc-core";

export type { RpcArgs, RpcName } from "./rpc-core";

export function rpc<N extends RpcName>(
  name: N,
  ...args: ArgList<Database["public"]["Functions"][N]["Args"]>
) {
  return rpcOn(supabase, name, ...args);
}

export function rpcByName(name: string, args?: object) {
  return (
    supabase.rpc as unknown as (n: string, a?: object) => ReturnType<typeof supabase.rpc>
  ).call(supabase, name, args);
}
