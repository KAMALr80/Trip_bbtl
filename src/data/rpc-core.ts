// Typed RPC calls for any Supabase client (browser or service role). See ./rpc.ts for why
// arguments accept null.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Fns = Database["public"]["Functions"];
export type RpcName = keyof Fns;
type NullableArgs<A> = A extends Record<string, unknown> ? { [K in keyof A]: A[K] | null } : A;
/** The arguments of a database function, as `rpc` accepts them. */
export type RpcArgs<N extends RpcName> = NullableArgs<Fns[N]["Args"]>;
export type ArgList<A> =
  Record<string, never> extends A ? [args?: NullableArgs<A>] : [args: NullableArgs<A>];

export function rpcOn<N extends RpcName>(
  client: SupabaseClient<Database>,
  name: N,
  ...args: ArgList<Fns[N]["Args"]>
) {
  return client.rpc(name, ...(args as [Fns[N]["Args"]]));
}
