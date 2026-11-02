// The Trip Postcard (M5-04, R-605, R-608): kept photos down both sides, everyone's answers grouped
// by question in the middle (no names), crowns and "most excited for" below. Download or share it
// as an image drawn on the device (./render.ts) from the same layout.
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTripPostcard, type TripPostcardData } from "@/data/postcard";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";
import { sideColumns } from "./layout";
import { renderPostcardPng, shareOrDownload } from "./render";

type TripLike = Pick<
  TripWithRole,
  "id" | "name" | "destination" | "start_date" | "end_date" | "cultures"
>;

export function TripPostcard({ trip }: { trip: TripLike }) {
  const postcard = useTripPostcard(trip.id).data;
  if (!postcard) return null;
  return <PostcardCard trip={trip} postcard={postcard} />;
}

function place(trip: TripLike) {
  return trip.cultures?.[0] ?? trip.destination;
}

function PostcardCard({ trip, postcard }: { trip: TripLike; postcard: TripPostcardData }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { left, right } = sideColumns(postcard.photos);
  const answers = postcard.answers.filter((a) => a.answers.length);
  const subtitle = `${place(trip)} · ${new Date(`${trip.end_date}T12:00:00`).toLocaleDateString(
    undefined,
    {
      month: "long",
      year: "numeric",
    },
  )}`;
  const crownLine = postcard.crowns
    .map((c) => `👑 ${t(`standings.crown.${c.season}`)}: ${c.name}`)
    .join(" · ");
  const excitedLine = postcard.excited.length
    ? t("postcard.excited", { list: postcard.excited.join(" · ") })
    : "";
  const column = (photos: typeof postcard.photos) => (
    <div className="grid content-start gap-1.5">
      {photos.map((p) =>
        p.url ? (
          <img
            key={p.proof_id}
            src={p.url}
            alt=""
            className="aspect-[3/4] w-full rounded object-cover"
            loading="lazy"
          />
        ) : (
          <span key={p.proof_id} className="block aspect-[3/4] w-full rounded bg-muted" />
        ),
      )}
    </div>
  );
  return (
    <section className="app-card mt-4" aria-label={t("postcard.title")}>
      <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 rounded-lg bg-[#fbf6ec] p-2 text-[#14213d]">
        {column(left)}
        <div className="min-w-0 text-center" dir="auto">
          <h2 className="font-display text-lg font-extrabold leading-tight">{trip.name}</h2>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#b07d10]">
            {subtitle}
          </p>
          {answers.length === 0 ? (
            <p className="mt-3 text-xs">{t("postcard.noAnswers")}</p>
          ) : (
            answers.map((g) => (
              <div key={g.key} className="mt-2">
                <p className="text-[10px] font-extrabold uppercase text-[#b07d10]">{g.question}</p>
                <ul className="text-xs">
                  {g.answers.map((a, i) => (
                    <li key={i} dir="auto" className="break-words">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
        {column(right)}
      </div>
      {crownLine && <p className="mt-2 text-sm font-semibold">{crownLine}</p>}
      {excitedLine && <p className="mt-1 text-sm">{excitedLine}</p>}
      <Button
        className="mt-3 min-h-11 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const blob = await renderPostcardPng({
              title: trip.name,
              subtitle,
              photoUrls: postcard.photos.map((p) => p.url),
              answers,
              footer: [crownLine, excitedLine].filter(Boolean),
            });
            const how = await shareOrDownload(
              blob,
              `${trip.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-postcard.png`,
              trip.name,
            );
            if (how === "downloaded") setMessage(t("postcard.savedImage"));
          } catch (e) {
            setMessage(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download aria-hidden /> {busy ? t("postcard.making") : t("postcard.share")}
      </Button>
      {message && (
        <p className="text-xs mt-1" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
