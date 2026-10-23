import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  Crown,
  Heart,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountryFlag } from "@/components/CountryFlag";
import { placeLabel } from "@/lib/places";
import { RoomExperienceCard } from "@/components/RoomExperienceCard";
import type { SampleExperience as Sample } from "@/lib/inspiration-samples";

export const SampleBadge = () => (
  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
    Sample
  </span>
);

/** Compact card used inside lists and empty place pages. */
export function SampleCard({
  sample,
  onOpen,
  tile = false,
}: {
  sample: Sample;
  onOpen: () => void;
  tile?: boolean;
}) {
  return (
    <article
      className={`app-card culture-sample-card min-w-0 overflow-hidden p-0 ${tile ? "culture-sample-tile" : "mt-4"}`}
    >
      <img
        src={sample.art}
        alt={sample.title}
        width={1024}
        height={704}
        loading="lazy"
        sizes={
          tile
            ? "(max-width: 430px) 45vw, (max-width: 1100px) 46vw, 512px"
            : "(max-width: 1100px) 90vw, 1024px"
        }
        className="h-auto w-full"
      />
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {!tile && <SampleBadge />}
          <p className="eyebrow text-orange">{sample.category} · CULTURE QUEST</p>
        </div>
        <h3 className="mt-2 font-display text-xl font-extrabold">{sample.title}</h3>
        <p className="text-sm text-muted-foreground">
          <CountryFlag code={sample.country} /> {placeLabel(sample)}
        </p>
        <Button variant="playful" className="mt-3" onClick={onOpen}>
          Open sample <ArrowRight size={16} />
        </Button>
      </div>
    </article>
  );
}

/** Full read-only sample with a local 3-question quest. Nothing is saved. */
export function SampleExperienceView({
  sample,
  onBack,
  backLabel = "Travel From Home",
  room = "home",
  side = "experience",
}: {
  sample: Sample;
  onBack: () => void;
  backLabel?: string;
  room?: "home" | "window";
  side?: "experience" | "show";
}) {
  const [tab, setTab] = useState<"plays" | "guide">("plays");
  const [q, setQ] = useState(-1),
    [pick, setPick] = useState<number | null>(null),
    [score, setScore] = useState(0);
  const item = sample.quest[q];
  const answer = (i: number) => {
    if (pick !== null || !item) return;
    setPick(i);
    if (i === item.answer) setScore((s) => s + 100);
  };
  return (
    <section className="max-w-full overflow-x-hidden pb-8">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> {backLabel}
      </Button>
      <img
        src={sample.art}
        alt={sample.title}
        width={1024}
        height={704}
        sizes="(max-width: 700px) 100vw, 700px"
        className="mx-auto mt-3 h-auto w-full max-w-[700px] rounded-lg object-cover"
      />
      <RoomExperienceCard room={room} showSave={tab === "guide" && q < 0}>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SampleBadge />
          <p className="eyebrow">{sample.category}</p>
        </div>
        <h1 className="mt-2 font-display text-3xl font-extrabold">{sample.title}</h1>
        <p className="text-sm text-muted-foreground">{placeLabel(sample)}</p>
        {q < 0 ? (
          <>
            <div
              className="sample-experience-tabs"
              role="tablist"
              aria-label="Sample experience details"
            >
              <Button
                role="tab"
                aria-selected={tab === "plays"}
                aria-controls="sample-plays"
                variant="outline"
                onClick={() => setTab("plays")}
              >
                <CalendarDays size={17} /> How it plays
              </Button>
              <Button
                role="tab"
                aria-selected={tab === "guide"}
                aria-controls="sample-guide"
                variant="outline"
                onClick={() => setTab("guide")}
              >
                <BookOpen size={17} /> Recipe &amp; guide
              </Button>
            </div>
            {tab === "plays" ? (
              <div id="sample-plays" role="tabpanel" className="sample-play-sheet">
                <p className="sample-lead">
                  {side === "show"
                    ? "A creator's four-day culture story, from the first question to the final share."
                    : "Four days of questions and things to try together before Game Night."}
                </p>
                <ol className="sample-timeline">
                  {sample.days.map((day, index) => (
                    <li key={index} className="sample-day">
                      <span className="sample-day-number" aria-hidden="true">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-display text-lg font-extrabold">Day {index + 1}</h2>
                        <p>
                          <CircleHelp size={16} aria-hidden="true" />
                          <span>
                            <strong>Question of the Day</strong>
                            {side === "show" ? day.creatorQuestion : day.question}
                          </span>
                        </p>
                        <p>
                          <ClipboardCheck size={16} aria-hidden="true" />
                          <span>
                            <strong>{side === "show" ? "What they shared" : "Task"}</strong>
                            {side === "show" ? day.creatorShare : day.task}
                          </span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="sample-play-section">
                  <h2 className="font-display text-xl font-extrabold">
                    <Sparkles size={19} aria-hidden="true" /> Culture Quest
                  </h2>
                  {sample.quest.map((challenge, index) => (
                    <div className="sample-challenge" key={index}>
                      <div>
                        <span className="sample-challenge-round">{challenge.round}</span>
                        <p>{challenge.prompt}</p>
                      </div>
                      <span className="sample-points">100 pts</span>
                    </div>
                  ))}
                </div>
                <div className="sample-play-section sample-finale">
                  <h2 className="font-display text-xl font-extrabold">
                    <Crown size={19} aria-hidden="true" /> Game Night
                  </h2>
                  <p>Everyone presents what they made, votes, and one person is crowned.</p>
                  {side === "show" && (
                    <p className="mt-2">
                      <Heart size={16} aria-hidden="true" /> Share your days and what you made.
                      Likes are coming soon; completing the experience earns a culture stamp.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div id="sample-guide" role="tabpanel" className="sample-guide">
                <p className="mt-3 text-lg">{sample.intro}</p>
                <h2 className="mt-6 font-display text-xl font-extrabold">What you need</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {sample.needs.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <h2 className="mt-6 font-display text-xl font-extrabold">How to make it</h2>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  {sample.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <h2 className="mt-6 font-display text-xl font-extrabold">The story</h2>
                <p className="mt-2">{sample.backstory}</p>
                <h2 className="mt-6 font-display text-xl font-extrabold">What it means</h2>
                <p className="mt-2">{sample.meaning}</p>
              </div>
            )}
            <Button
              variant="playful"
              size="lg"
              className="sample-play-cta mt-7 w-full min-h-14"
              onClick={() => {
                setQ(0);
                setPick(null);
                setScore(0);
              }}
            >
              Play this experience <ArrowRight size={18} />
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Sample · nothing is saved
            </p>
          </>
        ) : item ? (
          <div className="sample-quest-sheet mt-6">
            <p className="eyebrow">
              ROUND {q + 1} OF 3 · {item.round}
            </p>
            <h2 className="mt-2 font-display text-xl font-extrabold">{item.prompt}</h2>
            <div className="mt-4 grid gap-2">
              {item.options.map((o, i) => (
                <Button
                  key={o}
                  variant="outline"
                  aria-pressed={pick === i}
                  disabled={pick !== null}
                  className={`sample-answer h-auto min-h-11 whitespace-normal text-left ${pick !== null && i === item.answer ? "sample-answer-correct" : ""}`}
                  onClick={() => answer(i)}
                >
                  {o}
                </Button>
              ))}
            </div>
            {pick !== null && (
              <>
                <p className="mt-3 text-sm">
                  {pick === item.answer ? "Correct! +100" : "Not quite."} {item.fact}
                </p>
                <Button
                  variant="playful"
                  className="mt-3 w-full min-h-11"
                  onClick={() => {
                    setQ(q + 1);
                    setPick(null);
                  }}
                >
                  {q < 2 ? "Next round" : "Finish"} <ArrowRight size={16} />
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="sample-quest-sheet mt-6 text-center">
            <p className="eyebrow">SAMPLE QUEST DONE</p>
            <p className="mt-2 font-display text-3xl font-extrabold">{score} pts</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Real quests from your squad earn Culture Points and a culture stamp, not a trip
              passport stamp.
            </p>
            <Button variant="outline" className="mt-4 min-h-11" onClick={() => setQ(-1)}>
              Back to the experience
            </Button>
          </div>
        )}
      </RoomExperienceCard>
    </section>
  );
}
