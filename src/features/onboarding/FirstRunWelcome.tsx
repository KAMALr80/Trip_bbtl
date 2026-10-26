import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import letterArt from "@/assets/welcome-letter.webp";
import tripArt from "@/assets/welcome-trip.webp";
import stayArt from "@/assets/welcome-stay.webp";
import inspireArt from "@/assets/welcome-inspire.webp";
import gameArt from "@/assets/welcome-game.webp";

export function FirstRunWelcome({
  onTrip,
  onHome,
  onInspire,
  onGames,
  onStory,
  onClose,
  canStart,
}: {
  onTrip: () => void;
  onHome: () => void;
  onInspire: () => void;
  onGames: () => void;
  onStory: () => void;
  onClose: () => void;
  canStart: boolean;
}) {
  const choices = [
    {
      label: "Going on a Trip",
      subline: "Turn your trip into a game",
      art: tripArt,
      action: onTrip,
    },
    {
      label: "Explore a Culture",
      subline: "Travel the world from home",
      art: stayArt,
      action: onHome,
    },
    {
      label: "Inspire Someone",
      subline: "Share the view as you travel",
      art: inspireArt,
      action: onInspire,
    },
    { label: "Game Night", subline: "Quick games, right now", art: gameArt, action: onGames },
  ];
  return (
    <section
      aria-label="Welcome Aboard!"
      className="welcome-letter-page fixed inset-x-0 top-0 bottom-[var(--nav-clearance)] z-10 mx-auto max-w-lg overflow-y-auto bg-background px-[18px] pt-[max(1rem,env(safe-area-inset-top))] pb-6"
    >
      <div className="welcome-letter-content">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" aria-label="Back to Home" onClick={onClose}>
            <ArrowLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close welcome" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="welcome-opening-envelope" aria-hidden="true">
          <img src={letterArt} alt="" width={256} height={256} />
          <img className="welcome-opening-flap" src={letterArt} alt="" width={256} height={256} />
        </div>
        <h1 className="font-display text-3xl font-extrabold text-center">Welcome Aboard!</h1>
        <p className="mt-2 text-center text-base text-muted-foreground">
          What would you like to experience?
        </p>
        <div className="welcome-choices mt-6 grid grid-cols-2 gap-3">
          {choices.map(({ label, subline, art, action }) => (
            <Button
              key={label}
              variant="outline"
              aria-label={label}
              className="welcome-choice h-auto min-h-44 w-full flex-col justify-start gap-0 whitespace-normal text-center"
              onClick={action}
            >
              <img
                src={art}
                alt=""
                width={320}
                height={320}
                loading="lazy"
                className="welcome-choice-art"
              />
              <span className="welcome-choice-label">{label}</span>
              <span className="welcome-choice-subline">{subline}</span>
              {label === "Going on a Trip" && !canStart && (
                <span className="welcome-choice-subline mt-1">
                  Captains are 21+ — ask your crew's Captain to invite you.
                </span>
              )}
            </Button>
          ))}
        </div>
        <div className="welcome-secondary-links mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose}>
            Take a look around ›
          </Button>
          <Button variant="outline" onClick={onStory}>
            Our story ›
          </Button>
        </div>
      </div>
    </section>
  );
}
