import { createFileRoute } from "@tanstack/react-router";
import { GuideDays } from "@/features/guide/TripGuide";
import { useT } from "@/i18n";
import { loadPublicGuide } from "@/lib/guide.functions";
import { friendlyRange } from "@/lib/trip-dates";

// The shareable, read-only guide or showcase page (M3-12, M3-13). Readable without signing in;
// the server decides what it may show.
export const Route = createFileRoute("/guide/$token")({
  loader: ({ params }) => loadPublicGuide({ data: { token: params.token } }).catch(() => null),
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.title} | TripJunkies™` : "Guide | TripJunkies™";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: loaderData ? `A travel guide to ${loaderData.place}.` : "",
        },
        { property: "og:title", content: title },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: PublicGuide,
});

function PublicGuide() {
  const t = useT();
  const guide = Route.useLoaderData();
  return (
    <main className="min-h-dvh mx-auto max-w-lg px-[18px] pb-16 pt-8 text-foreground">
      {!guide ? (
        <p className="text-sm">{t("guide.publicMissing")}</p>
      ) : (
        <>
          <h1 className="font-display text-3xl font-extrabold">
            {guide.room === "explore_culture" || guide.room === "show_culture"
              ? t("guide.publicShowcase", { title: guide.title })
              : t("guide.publicTitle", { title: guide.title })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {guide.place} · {friendlyRange(guide.startDate, guide.endDate)}
          </p>
          <GuideDays items={guide.items} startDate={guide.startDate} />
        </>
      )}
      <p className="text-xs text-muted-foreground mt-10 text-center">{t("guide.publicFooter")}</p>
    </main>
  );
}
