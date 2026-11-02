// Admin area (M6-05, Q24): find a user (disable / re-enable, with a reason) or a trip (archive it
// read-only, or bring it back). Admins only on the server; every action is logged.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { rpc } from "@/data/rpc";
import { useT } from "@/i18n";
import { setUserDisabled } from "@/lib/admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export function AdminDirectory() {
  const t = useT();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  return (
    <section className="mt-4" aria-label={t("admin.title")}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <input
          className="min-h-11 flex-1 rounded-md border bg-background px-2"
          aria-label={t("admin.search")}
          placeholder={t("admin.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" className="min-h-11" disabled={q.trim().length < 2}>
          {t("admin.find")}
        </Button>
      </form>
      {search && (
        <>
          <Users query={search} />
          <Trips query={search} />
        </>
      )}
    </section>
  );
}

function Users({ query }: { query: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ["admin", "users", query],
    queryFn: async () => {
      const { data, error } = await rpc("admin_find_users", { p_query: query });
      if (error) throw error;
      return data ?? [];
    },
  });
  const disable = useServerFn(setUserDisabled);
  const act = useMutation({
    mutationFn: (v: { userId: string; disabled: boolean; note: string }) => disable({ data: v }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const [note, setNote] = useState("");
  return (
    <div className="mt-4">
      <h3 className="font-display text-lg font-extrabold">{t("admin.users")}</h3>
      <input
        className="mt-1 min-h-11 w-full rounded-md border bg-background px-2 text-sm"
        aria-label={t("admin.reason")}
        placeholder={t("admin.reason")}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {users.error && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(users.error)}
        </p>
      )}
      {users.data?.length === 0 && <p className="mt-2 text-sm">{t("admin.none")}</p>}
      <ul className="mt-2 divide-y">
        {(users.data ?? []).map((u) => (
          <li key={u.user_id} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <strong>{u.game_name ?? "—"}</strong> · {u.email}
              <span className="block text-xs text-muted-foreground">
                {u.age_range} · {t("admin.tripsCount", { count: u.trips })}
                {u.disabled ? ` · ${t("admin.disabled")}` : ""}
              </span>
            </span>
            <Button
              variant={u.disabled ? "outline" : "destructive"}
              className="min-h-11"
              disabled={act.isPending || !note.trim()}
              onClick={() => act.mutate({ userId: u.user_id, disabled: !u.disabled, note })}
            >
              {u.disabled ? t("admin.enable") : t("admin.disable")}
            </Button>
          </li>
        ))}
      </ul>
      {act.error && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(act.error)}
        </p>
      )}
    </div>
  );
}

function Trips({ query }: { query: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const trips = useQuery({
    queryKey: ["admin", "trips", query],
    queryFn: async () => {
      const { data, error } = await rpc("admin_find_trips", { p_query: query });
      if (error) throw error;
      return data ?? [];
    },
  });
  const act = useMutation({
    mutationFn: async (v: { id: string; archived: boolean }) => {
      const { error } = await rpc("set_trip_archived", {
        p_trip: v.id,
        p_archived: v.archived,
        p_note: "admin area",
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "trips"] }),
  });
  return (
    <div className="mt-5">
      <h3 className="font-display text-lg font-extrabold">{t("admin.trips")}</h3>
      {trips.error && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(trips.error)}
        </p>
      )}
      {trips.data?.length === 0 && <p className="mt-2 text-sm">{t("admin.none")}</p>}
      <ul className="mt-2 divide-y">
        {(trips.data ?? []).map((x) => (
          <li key={x.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <strong>{x.name}</strong> · {x.destination}
              <span className="block text-xs text-muted-foreground">
                {x.room} · {x.play_mode} · {x.start_date} – {x.end_date} ·{" "}
                {t("admin.members", { count: x.members })} ·{" "}
                {x.archived ? t("admin.archived") : x.phase}
                {x.is_sandbox ? " · sandbox" : ""}
              </span>
            </span>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={act.isPending}
              onClick={() => act.mutate({ id: x.id, archived: !x.archived })}
            >
              {x.archived ? t("admin.unarchive") : t("admin.archive")}
            </Button>
          </li>
        ))}
      </ul>
      {act.error && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(act.error)}
        </p>
      )}
    </div>
  );
}
