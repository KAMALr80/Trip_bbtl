// World map (deck slide 15, R-721). The server decides which trips a viewer may see
// (trip_private.world_map: public adult players' finished trips, the viewer's own, nothing hidden
// or sandboxed); this only reads them.
import { useQuery } from "@tanstack/react-query";
import { z } from "@/lib/zod-setup";
import { rpc } from "./rpc";

const player = z.object({
  user_id: z.string(),
  game_name: z.string().nullable(),
  avatar_style: z.string().nullable(),
  avatar_seed: z.string().nullable(),
});
const mapTrip = z.object({
  trip_id: z.string(),
  trip_name: z.string(),
  room: z.string(),
  kind: z.string().nullable(),
  country: z.string(),
  state: z.string().nullable(),
  culture: z.string().nullable(),
  season_label: z.string(),
  crowns: z.array(z.string()),
  member: z.boolean(),
  players: z.array(player),
});
export type MapTrip = z.infer<typeof mapTrip>;

export function useWorldMap(enabled = true) {
  return useQuery({
    queryKey: ["world-map"],
    queryFn: async (): Promise<MapTrip[]> => {
      const { data, error } = await rpc("world_map");
      if (error) throw error;
      return z.array(mapTrip).parse(data ?? []);
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}
