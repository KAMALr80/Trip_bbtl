// Content library admin (M3-02): list the content items by kind / review state / text, and edit one
// (wording, tags, reviewed + note, on/off). Admins only on the server; every save is logged. Items
// are never deleted here; switching one off stops new deals.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { rpc } from "@/data/rpc";
import type { Database, Json } from "@/integrations/supabase/types";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";

type Item = Database["public"]["Functions"]["admin_content_items"]["Returns"][number];

// The values public.content_items' checks allow.
const KINDS = [
  "daily_discovery",
  "daily_card",
  "sealed_quest",
  "showcase",
  "airport_mission",
  "home_mission",
  "drop_bingo",
  "drop_scavenger",
  "drop_speed",
  "drop_photo",
  "trip_quest",
  "ws_quest",
  "journal_prompt",
  "wrapup_question",
  "flight_game",
] as const;
const ROOMS = ["trip", "window_seat", "explore_culture", "show_culture", "game_night"] as const;
const MODES = ["trip", "at_home", "solo"] as const;
const FOCUSES = [
  "food",
  "music",
  "language",
  "fashion",
  "holidays",
  "history",
  "art",
  "games",
  "manners",
  "folklore",
  "film",
] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;
const MIN_AGES = [13, 18, 21] as const;
const PAGE = 50;

const field = "mt-1 block min-h-11 w-full rounded-md border bg-background px-2";

export function ContentAdmin() {
  const t = useT();
  const [kind, setKind] = useState("");
  const [reviewed, setReviewed] = useState<"" | "yes" | "no">("no");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Item | null>(null);
  const filters = {
    p_kind: kind || null,
    p_query: search || null,
    p_reviewed: reviewed === "" ? null : reviewed === "yes",
    p_offset: offset,
  };
  const items = useQuery({
    queryKey: ["admin", "content", filters],
    queryFn: async () => {
      const { data, error } = await rpc("admin_content_items", filters);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (editing)
    return <ContentEditor key={editing.id} item={editing} onDone={() => setEditing(null)} />;
  return (
    <section className="mt-4" aria-label={t("contentAdmin.title")}>
      <p className="text-sm text-muted-foreground">{t("contentAdmin.intro")}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold">
          {t("contentAdmin.kind")}
          <select
            className={field}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">{t("contentAdmin.allKinds")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("contentAdmin.review")}
          <select
            className={field}
            value={reviewed}
            onChange={(e) => {
              setReviewed(e.target.value as "" | "yes" | "no");
              setOffset(0);
            }}
          >
            <option value="no">{t("contentAdmin.toReview")}</option>
            <option value="yes">{t("contentAdmin.reviewed")}</option>
            <option value="">{t("contentAdmin.all")}</option>
          </select>
        </label>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
          setOffset(0);
        }}
      >
        <input
          className="min-h-11 flex-1 rounded-md border bg-background px-2"
          aria-label={t("contentAdmin.search")}
          placeholder={t("contentAdmin.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" className="min-h-11">
          {t("admin.find")}
        </Button>
      </form>
      {items.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {friendlyError(items.error)}
        </p>
      )}
      {items.data?.length === 0 && <p className="mt-2 text-sm">{t("admin.none")}</p>}
      <ul className="mt-2 divide-y">
        {(items.data ?? []).map((x) => (
          <li key={x.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">
                {x.kind} · {x.modes.join(", ")}
                {x.reviewed ? ` · ${t("contentAdmin.reviewedTag")}` : ""}
                {x.active ? "" : ` · ${t("contentAdmin.off")}`}
              </span>
              {x.title && <strong className="block">{x.title}</strong>}
              <span className="line-clamp-2">{x.body}</span>
            </span>
            <Button variant="outline" className="min-h-11" onClick={() => setEditing(x)}>
              {t("contentAdmin.edit")}
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between gap-2">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE))}
        >
          {t("contentAdmin.previous")}
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={(items.data?.length ?? 0) < PAGE}
          onClick={() => setOffset(offset + PAGE)}
        >
          {t("contentAdmin.next")}
        </Button>
      </div>
    </section>
  );
}

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function ContentEditor({ item, onDone }: { item: Item; onDone: () => void }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(item.title ?? "");
  const [body, setBody] = useState(item.body);
  const [insight, setInsight] = useState(item.insight ?? "");
  const [itemsText, setItemsText] = useState(item.items.join("\n"));
  const [choicesText, setChoicesText] = useState(item.choices.join("\n"));
  const [answer, setAnswer] = useState(item.answer === null ? "" : String(item.answer));
  const [rooms, setRooms] = useState<string[]>(item.rooms);
  const [modes, setModes] = useState<string[]>(item.modes);
  const [focus, setFocus] = useState(item.focus ?? "");
  const [culture, setCulture] = useState(item.culture ?? "");
  const [vibe, setVibe] = useState(item.vibe ?? "");
  const [difficulty, setDifficulty] = useState(item.difficulty ?? "");
  const [minAge, setMinAge] = useState(item.min_age);
  const [alcohol, setAlcohol] = useState(item.alcohol);
  const [active, setActive] = useState(item.active);
  const [reviewed, setReviewed] = useState(item.reviewed);
  const [note, setNote] = useState(item.review_note ?? "");

  // Only the fields that changed go to the server (and into the log).
  const patch = (): { [key: string]: Json } => {
    const next: { [key: string]: Json } = {
      title: title.trim() || null,
      body: body.trim(),
      insight: insight.trim() || null,
      items: lines(itemsText),
      choices: lines(choicesText),
      answer: answer === "" ? null : Number(answer),
      rooms,
      modes,
      focus: focus || null,
      culture: culture.trim() || null,
      vibe: vibe.trim() || null,
      difficulty: difficulty || null,
      min_age: minAge,
      alcohol,
      active,
      reviewed,
      review_note: note.trim() || null,
    };
    return Object.fromEntries(
      Object.entries(next).filter(
        ([k, v]) => JSON.stringify(v) !== JSON.stringify(item[k as keyof Item]),
      ),
    );
  };
  const save = useMutation({
    mutationFn: async () => {
      const changes = patch();
      if (Object.keys(changes).length === 0) return;
      const { error } = await rpc("admin_save_content_item", { p_id: item.id, p_patch: changes });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "content"] });
      onDone();
    },
  });
  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...list, value] : list.filter((v) => v !== value);

  return (
    <form
      className="mt-4 space-y-3"
      aria-label={t("contentAdmin.editTitle")}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-xs text-muted-foreground">
        {item.kind} · {item.source} · {item.source_ref}
      </p>
      <label className="block text-sm font-semibold">
        {t("contentAdmin.fields.title")}
        <input
          className={field}
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-sm font-semibold">
        {t("contentAdmin.fields.body")}
        <textarea
          className={`${field} py-2`}
          rows={4}
          maxLength={1000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <label className="block text-sm font-semibold">
        {t("contentAdmin.fields.insight")}
        <textarea
          className={`${field} py-2`}
          rows={2}
          maxLength={500}
          value={insight}
          onChange={(e) => setInsight(e.target.value)}
        />
      </label>
      <label className="block text-sm font-semibold">
        {t("contentAdmin.fields.items")}
        <textarea
          className={`${field} py-2`}
          rows={4}
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
        />
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="block text-sm font-semibold">
          {t("contentAdmin.fields.choices")}
          <textarea
            className={`${field} py-2`}
            rows={3}
            value={choicesText}
            onChange={(e) => setChoicesText(e.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold">
          {t("contentAdmin.fields.answer")}
          <input
            type="number"
            min={0}
            max={5}
            className={`${field} w-20`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </label>
      </div>
      <fieldset className="text-sm">
        <legend className="font-semibold">{t("contentAdmin.fields.rooms")}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {ROOMS.map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={rooms.includes(r)}
                onChange={(e) => setRooms(toggle(rooms, r, e.target.checked))}
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="text-sm">
        <legend className="font-semibold">{t("contentAdmin.fields.modes")}</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {MODES.map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={modes.includes(m)}
                onChange={(e) => setModes(toggle(modes, m, e.target.checked))}
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold">
          {t("contentAdmin.fields.focus")}
          <select className={field} value={focus} onChange={(e) => setFocus(e.target.value)}>
            <option value="">—</option>
            {FOCUSES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("contentAdmin.fields.difficulty")}
          <select
            className={field}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">—</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t("contentAdmin.fields.culture")}
          <input className={field} value={culture} onChange={(e) => setCulture(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          {t("contentAdmin.fields.vibe")}
          <input className={field} value={vibe} onChange={(e) => setVibe(e.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          {t("contentAdmin.fields.minAge")}
          <select
            className={field}
            value={minAge}
            onChange={(e) => setMinAge(Number(e.target.value))}
          >
            {MIN_AGES.map((a) => (
              <option key={a} value={a}>
                {a}+
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={alcohol}
            onChange={(e) => setAlcohol(e.target.checked)}
          />
          {t("contentAdmin.fields.alcohol")}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          {t("contentAdmin.fields.active")}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          {t("contentAdmin.fields.reviewed")}
        </label>
      </div>
      <label className="block text-sm font-semibold">
        {t("contentAdmin.fields.note")}
        <input className={field} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyError(save.error)}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="min-h-11 flex-1" disabled={save.isPending}>
          {t("contentAdmin.save")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onDone}>
          {t("contentAdmin.cancel")}
        </Button>
      </div>
    </form>
  );
}
