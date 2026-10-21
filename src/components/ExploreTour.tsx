import { useLook } from "@/lib/look";
import { BrandLockup } from "@/components/BrandLockup";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
// Placeholder art: existing app images stand in until Ty approves the new set for each slide.
import ideaArt from "@/assets/home-airport-signoff-diverse.jpg";
import tripArt from "@/assets/how-play-together.jpg";
import homeArt from "@/assets/athome-mexico.jpg";
import windowArt from "@/assets/window-seat-room.webp";
import nightArt from "@/assets/how-game-nights.jpg";
import dailyArt from "@/assets/play-sealed-pass.webp";

// Everything in this tour is local display copy; no live trip or session data is loaded.
const slides = [
  {
    title: "Every trip is a game",
    line: "TripJunkies turns any trip into a game, so your squad bonds before you go and learns the culture while you travel.",
    art: ideaArt,
    alt: "Friends setting off on a trip together",
  },
  {
    title: "Going on a Trip",
    line: "Your squad plays all the way to the destination. Game nights before you fly, missions on travel day, challenges while you're there, and a crowning at the end.",
    art: tripArt,
    alt: "A squad playing together on their phones",
  },
  {
    title: "Travel From Home",
    line: "Bring a culture into your living room. No flight needed. Cook it, learn it, play it with your people over a few days, then crown someone at the finale.",
    art: homeArt,
    alt: "A culture brought into a living room",
  },
  {
    title: "Window Seat",
    line: "Travelling without the squad? Document the trip your way and turn it into a guide that inspires someone's next adventure.",
    art: windowArt,
    alt: "A view from a window seat",
  },
  {
    title: "Game Night",
    line: "Everyone's phone shows the same step. Check in, pick a song, play the games, show what you made, then see the scores.",
    art: nightArt,
    alt: "Friends at a game night",
  },
  {
    title: "Something new every day",
    line: "A quick card to learn something, plus sealed quests that drop out of nowhere. Open one and the clock starts.",
    art: dailyArt,
    alt: "A sealed quest boarding pass",
  },
  {
    title: "Become a Passport Junkie",
    line: "Earn points, win crowns, and collect stamps from every trip.",
    art: null,
    alt: "",
  },
] as const;

export function ExploreTour({
  onFinish,
  destination,
  onStartTrip,
  onPlayNow: _onPlayNow,
  onPlanTrip,
}: {
  onFinish: () => void | Promise<void>;
  destination?: string | undefined;
  onStartTrip?: (() => void) | undefined;
  onPlayNow?: (() => void) | undefined;
  onPlanTrip?: (() => void) | undefined;
}) {
  const [index, setIndex] = useState(0);
  const cinematic = useLook("explore") === "cinematic";
  const startX = useRef<number | null>(null);
  const slide = slides[index] ?? slides[0];
  const last = index === slides.length - 1;
  const next = () => setIndex((i) => Math.min(slides.length - 1, i + 1));
  const previous = () => setIndex((i) => Math.max(0, i - 1));
  return (
    <main
      className={`page-scene page-scene-home min-h-dvh max-w-lg mx-auto flex flex-col px-[18px] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] ${cinematic ? "cinematic-tour" : ""}`}
    >
      <div className="flex items-center justify-between">
        <BrandLockup className="text-xl" compact />
        <Button variant="ghost" size="sm" className="min-h-11" onClick={() => void onFinish()}>
          Skip
        </Button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-center pt-3">
        <div
          className="explore-art relative w-full"
          onTouchStart={(e) => {
            startX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const end = e.changedTouches[0]?.clientX;
            const start = startX.current;
            if (start !== null && end !== undefined && Math.abs(start - end) > 45)
              (start > end ? next : previous)();
            startX.current = null;
          }}
        >
          {slide.art ? (
            <img
              src={slide.art}
              alt={slide.alt}
              width={1024}
              height={1024}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="explore-art-placeholder"
              role="img"
              aria-label="Passport Junkie art coming soon"
            >
              <Crown size={56} aria-hidden="true" />
              <span>Finale art coming soon</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous slide"
            disabled={index === 0}
            onClick={previous}
            className="absolute left-2 top-1/2 -translate-y-1/2 border border-border bg-card/90 size-11"
          >
            <ArrowLeft size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next slide"
            disabled={last}
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 border border-border bg-card/90 size-11"
          >
            <ArrowRight size={18} />
          </Button>
        </div>
        <div className="mt-4 shrink-0">
          <p className="eyebrow">
            {destination ? `${destination.toUpperCase()} · SAMPLE PREVIEW` : "THE TRIPJUNKIES TOUR"}{" "}
            · {index + 1}/{slides.length}
          </p>
          <h1 className="font-display text-2xl leading-tight font-extrabold mt-1 flex items-center gap-2">
            {slide.title}
            {last && <Crown size={22} className="text-orange shrink-0" aria-hidden="true" />}
          </h1>
          <p className="text-base text-muted-foreground mt-2">{slide.line}</p>
          {last && (
            <p className="mt-3 font-display text-lg font-extrabold text-blue">
              Collect the world with your squad.
            </p>
          )}
        </div>
      </div>
      <div
        className="flex justify-center gap-1 py-2"
        aria-label={`Step ${index + 1} of ${slides.length}`}
      >
        {slides.map((_, i) => (
          <Button
            key={i}
            variant="ghost"
            size="icon"
            className="size-11 p-0"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={index === i ? "step" : undefined}
            onClick={() => setIndex(i)}
          >
            <span className={`size-2.5 rounded-full ${index === i ? "bg-blue" : "bg-muted"}`} />
          </Button>
        ))}
      </div>
      {last ? (
        <>
          <Button
            variant="playful"
            size="lg"
            className="w-full shrink-0 min-h-11"
            onClick={() => (onPlanTrip ?? onStartTrip ?? onFinish)()}
          >
            Start your first trip <ArrowRight size={18} />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full shrink-0 mt-2 min-h-11"
            onClick={() => void onFinish()}
          >
            Back to Home
          </Button>
        </>
      ) : (
        <Button
          variant="playful"
          size="lg"
          className={`w-full shrink-0 min-h-11 ${cinematic ? "tour-next" : ""}`}
          onClick={next}
        >
          Next
          <ArrowRight size={18} />
        </Button>
      )}
    </main>
  );
}
