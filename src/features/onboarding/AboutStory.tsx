import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/BrandLockup";
import { RememberedSection } from "@/components/RememberedSection";
import founderAbout from "@/assets/founder-about.jpg";

// The founder's story. Shown in three places: Me › About TripJunkies, the signed-out
// "Our story ›" view, and the public /about page that can be shared as a link.
export function AboutContent({
  onBack,
  backLabel = "Me",
}: {
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <main className="pb-8">
      <Button variant="ghost" className="-ml-2 text-muted-foreground" onClick={onBack}>
        <ArrowLeft /> {backLabel}
      </Button>
      <p className="mt-7 text-xs font-extrabold text-green">THE STORY BEHIND THE FUN</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold">About</h1>
      <BrandLockup className="inline-block text-3xl mt-2" />
      <div className="relative mt-7 aspect-[4/5] w-full overflow-hidden rounded-[24px] border border-border bg-card">
        <img
          src={founderAbout}
          alt="Tymeka Smith at a mountain overlook"
          width={768}
          height={960}
          className="h-full w-full object-cover object-[center_42%]"
        />
        <span
          className="passport-stamp absolute bottom-4 left-1/2 bg-card text-blue px-3 py-1 text-xs font-extrabold text-center whitespace-nowrap"
          style={{ transform: "translateX(-50%) rotate(0deg)" }}
        >
          COLLECT THE MOMENTS
        </span>
      </div>
      <RememberedSection
        id="about-idea"
        center
        title={
          <span className="block">
            <span className="block">The Trip Before the Trip.</span>
            <small className="block text-xs font-normal text-muted-foreground mt-1">
              Let the fun begin.
            </small>
          </span>
        }
        defaultOpen
      >
        <section className="mt-3 rounded-[1.75rem] bg-green-soft p-6">
          <p className="text-xs font-extrabold text-green">💡 CHAPTER ONE</p>
          <p className="mt-4 leading-relaxed">
            Whether it's your ride-or-die crew, the whole family, or a group where you only really
            know one person, every trip is better when everyone's already vibing. TripJunkies turns
            the weeks before takeoff into game nights full of laughs, stories, and inside jokes, so
            old friends get closer and new faces feel like family. Turn any group into one squad,
            and find out who the real Passport Junkie is. 👑
          </p>
          <p className="mt-3 leading-relaxed">
            Pre-Flight game nights bring us together before we go. Trip Season games make memories
            while we're away. Travel From Home welcomes everyone else in; Window Seat brings the
            road along. Next, the phone apps will help more squads find their way here.
          </p>
        </section>
      </RememberedSection>
      <RememberedSection id="about-founder" title="About me">
        <section className="mt-3 rounded-[1.75rem] bg-orange-soft p-6">
          <p className="text-xs font-extrabold text-orange">👋 CHAPTER TWO</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">About me</h2>
          <div className="mt-5">
            <p className="font-display text-xl font-extrabold">Tymeka Smith</p>
            <p className="text-sm text-ink-soft">Founder · Army Veteran</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="neon-chip text-blue">🎖️ VETERAN-OWNED</span>
              <span className="neon-chip text-primary">💪 WOMAN-OWNED</span>
            </div>
          </div>
          <p className="mt-5 leading-relaxed">
            I'm Tymeka Smith, a full-time UNLV student, future doctor, and a forever TripJunkie. ✈️
            I built the TripJunkies app myself, one idea at a time. I want every group to feel like
            family before takeoff. Squad-tested. Passport Junkie approved. 👑
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <a
              href="https://instagram.com/tymeka23"
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 rounded-full bg-card font-bold grid place-items-center text-sm"
            >
              📷 @tymeka23
            </a>
            <a
              href="https://www.facebook.com/search/top?q=Tymeka%20Smith"
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 rounded-full bg-card font-bold grid place-items-center text-sm"
            >
              👍 Tymeka Smith
            </a>
          </div>
        </section>
      </RememberedSection>
      <p className="mt-6 text-sm">
        Contact us:{" "}
        <a className="text-primary underline" href="mailto:hello@tripjunkies.app">
          hello@tripjunkies.app
        </a>
      </p>
      <p className="mt-9 text-center font-display text-3xl font-extrabold text-blue">
        Collect the moments.
        <br />
        <span className="text-primary">Let's go.</span>
      </p>
    </main>
  );
}
