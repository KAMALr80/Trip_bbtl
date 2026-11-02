// Explore tour (M5-13, R-907): 7 swipe cards, one image per room. Swipe only: the only buttons are
// Skip and Get started. No rules, points or setup details. Works signed out (from the sign-in screen)
// and from Me → Replay tour. Local display copy only; nothing here reads or changes a trip.
// Placeholder art from the app until the founder supplies "real art showing diverse travelers".
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import welcomeArt from "@/assets/home-airport-signoff-diverse.jpg";
import tripArt from "@/assets/how-play-together.jpg";
import windowArt from "@/assets/window-seat-room.webp";
import exploreArt from "@/assets/athome-mexico.jpg";
import showArt from "@/assets/cinematic-culture-collage.jpg";
import nightArt from "@/assets/how-game-nights.jpg";
import crownArt from "@/assets/how-crowning.jpg";

export const tourCards = [
  { id: "welcome", art: welcomeArt },
  { id: "trip", art: tripArt },
  { id: "window_seat", art: windowArt },
  { id: "explore_culture", art: exploreArt },
  { id: "show_culture", art: showArt },
  { id: "game_night", art: nightArt },
  { id: "crowns", art: crownArt },
] as const;

export function ExploreTour({
  onFinish,
  onStartTrip,
  onPlanTrip,
}: {
  onFinish: () => void | Promise<void>;
  destination?: string | undefined;
  onStartTrip?: (() => void) | undefined;
  onPlayNow?: (() => void) | undefined;
  onPlanTrip?: (() => void) | undefined;
}) {
  const t = useT();
  const track = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const last = index === tourCards.length - 1;
  // The card in view follows the swipe (native scroll snapping, so it also works with a trackpad
  // or the arrow keys once the track has focus).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      setIndex(Math.min(tourCards.length - 1, Math.max(0, Math.abs(i))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <main className="page-scene page-scene-home cinematic-tour mx-auto flex min-h-dvh max-w-lg flex-col pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between px-[18px]">
        <BrandLockup className="text-xl" compact />
        {!last && (
          <Button variant="ghost" size="sm" className="min-h-11" onClick={() => void onFinish()}>
            {t("tour.skip")}
          </Button>
        )}
      </div>
      <div
        ref={track}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={t("tour.label")}
        className="mt-3 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-2"
      >
        {tourCards.map((card, i) => (
          <section
            key={card.id}
            aria-roledescription="slide"
            aria-label={t("tour.position", { n: i + 1, total: tourCards.length })}
            aria-hidden={i !== index}
            className="flex w-full shrink-0 snap-center flex-col px-[18px]"
          >
            <img
              src={card.art}
              alt=""
              width={1024}
              height={1024}
              loading={i === 0 ? "eager" : "lazy"}
              draggable={false}
              className="explore-art aspect-square w-full rounded-3xl object-cover"
            />
            <h1 className="mt-4 font-display text-2xl font-extrabold leading-tight">
              {t(`tour.cards.${card.id}.title`)}
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {t(`tour.cards.${card.id}.line`)}
            </p>
          </section>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {t("tour.position", { n: index + 1, total: tourCards.length })}
      </p>
      <div className="flex justify-center gap-2 py-3" aria-hidden="true">
        {tourCards.map((card, i) => (
          <span
            key={card.id}
            className={`size-2.5 rounded-full ${index === i ? "bg-blue" : "bg-muted"}`}
          />
        ))}
      </div>
      <div className="px-[18px]">
        {last ? (
          <Button
            variant="playful"
            size="lg"
            className="min-h-11 w-full"
            onClick={() => void (onPlanTrip ?? onStartTrip ?? onFinish)()}
          >
            {t("tour.getStarted")}
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">{t("tour.swipe")}</p>
        )}
      </div>
    </main>
  );
}
