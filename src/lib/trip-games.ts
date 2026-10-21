import type { DayTag, ItineraryDay, DayTags } from "./itinerary";

export const DAY_CAP = (tag: DayTag) => (tag === "Travel" ? 10 : 30);
export const tagEmoji: Record<DayTag, string> = { Party: "🎉", Explore: "🧭", Chill: "🌴", Travel: "✈️" };

export function dayTag(date: string, days: ItineraryDay[], tags: DayTags): DayTag {
  if (tags[date]) return tags[date];
  const day = days.find((d) => d.date === date);
  return day?.flights?.length || /\b(fly|flight|travel|air|depart|homebound)\b/i.test(day?.note ?? "") ? "Travel" : "Explore";
}

export function gamesFor(tag: DayTag) {
  const list: string[] = [];
  if (tag !== "Travel") list.push("🎱 Daily Bingo");
  if (tag === "Explore" || tag === "Party") list.push("🗺️ Daily Quests");
  if (tag === "Chill") list.push("🧠 Chill Night Trivia");
  return list;
}

export const EXPLORER_SQUARES = [
  "Try a snack you've never had", "Group selfie with everyone in it", "Spot something in your favorite color", "Learn a word from a reliable local guide",
  "Find a cool piece of street art", "High-five a squad mate for no reason", "Take a photo of a funny sign", "Find the best view of the day",
  "Learn how to say a menu item aloud", "Spot a cute animal from a respectful distance", "Get a squad mate to laugh until they snort", "Find something older than all of you combined",
  "Spot a car or bike that matches your outfit", "Take a group photo doing matching poses", "Compliment a squadmate's style", "Find a souvenir under $5 (just look!)",
  "Drink some water — hydrate check 💧", "Take a pic of your shadows together", "Find a door you love", "Recreate a classic tourist pose",
  "Spot a mosaic pattern", "Sketch a skyline in 30 seconds", "Find an interesting window", "Spot three different flowers", "Count five types of wheels", "Find a hand-painted sign", "Notice a patterned pavement", "Spot a building with a bold color", "Find a locally made craft", "Find a public fountain", "Spot an unusual roof", "Find a tiny garden", "Look for a mural", "Notice a bridge", "Find a street musician performing publicly", "Spot a colorful market stall", "Find a quiet public bench", "Spot a bicycle with a basket", "Find a geometric tile", "Spot a public sculpture", "Find a vintage storefront", "Notice a tree taller than a building", "Find a beautiful staircase", "Spot a decorated doorway", "Find a striking shadow", "Notice an interesting street lamp", "Find a handmade menu", "Spot a funny shop name", "Find a bright umbrella", "Notice a public clock", "Find an illustrated map", "Spot a patterned awning", "Find an interesting mailbox", "Notice a colorful bus", "Find a public mural detail", "Spot an outdoor chess board", "Find a pet-friendly sign", "Notice a community noticeboard", "Spot a street with a plant name", "Find a welcoming public square"
];
EXPLORER_SQUARES.push("Take a water break with your squad", "Stretch gently after a long ride", "Spot a shaded public place to rest for five minutes", "Share a simple sleep tip for travel");
export const SECRET_MISSIONS = [
  "Get a squadmate to say the word 'pineapple' without asking directly.",
  "Get a group photo where everyone does the same pose — without telling them why.",
  "Get three willing squadmates to high-five you before dinner.",
  "Work the phrase 'plot twist' into conversation three times.",
  "Get a squadmate to compliment your shoes.",
  "Convince a squad mate to swap seats with you at a meal.",
  "Get the group to sing or hum the same song.",
  "Start a slow clap and get at least two people to join.",
  "Get a squadmate to say 'plot twist' during a funny story.",
  "Get a squad mate to say 'let's go!' out loud.",
  "Make everyone take a sip of water at the same time.",
  "Teach a willing squadmate a new wave or greeting.",
  "Use a made-up word all day until someone asks what it means.",
  "Get a squad mate to take a photo of you doing a superhero pose.",
  "Get the whole group to point at the same thing for a photo.",
  "Ask a willing squadmate for their funniest travel moment.",
];
export const PHOTO_THEMES = ["Best sunset 🌅", "Funniest candid 😂", "Best food pic 🍜", "Best squad selfie 🤳", "Most epic view 🏔️", "Best matching moment 👯", "Coolest color pop 🎨", "Most 'main character' shot 🎬", "Best shadow play", "Most colorful doorway", "Best painted wall", "Most interesting texture", "Best public sculpture", "Best market detail", "Best morning light", "Best rainy reflection", "Best skyline", "Best street pattern", "Best shared laugh", "Best tiny detail", "Best handmade craft", "Best local sign", "Best nature close-up", "Best dramatic angle"];
export const AIRPORT_MISSIONS = [
  { title: "Group pic with your flight on the departures board", stamps: 2, photo: true },
  { title: "Predict wheels-up time — closest guess wins", stamps: 2, photo: false },
  { title: "Find a snack you've never seen before", stamps: 1, photo: true },
  { title: "First bag off the carousel", stamps: 2, photo: false },
  { title: "Say hello and thank you in the local language on arrival", stamps: 1, photo: false },
];
export const FALLBACK_QUESTS = ["Find a snack new to you and share your review", "Get a squad photo at today's main spot", "Sketch your favorite public view together", "Learn a local greeting from a reliable guide and practice it", "Make a one-minute video of a public view", "Find three colorful storefronts", "Choose a public artwork and share what it reminds you of", "Try a locally made snack with an allergy-friendly alternative", "Spot a landmark on a public map and tell the squad one fact about it", "Make a postcard caption for today's favorite moment", "Spot a free cultural exhibit if you're already passing one", "Recreate a favorite pose with your squad", "Find an interesting piece of architecture", "Share a photo of a public garden", "Teach a friend one new thing you learned today"];

export const FIND_IT_SAFETY = "Public places only · never trespass · don't take or touch what isn't yours · respect locals and venues · stay with your squad · daytime for anything unfamiliar · skip anything that feels unsafe.";
export const FIND_IT_KINDS = ["Spot It", "Alphabet Hunt", "Color Hunt", "Taste Trail", "Local Lingo", "Landmark Quest", "Riddle Hunt", "Hidden Gem", "Kindness Quest", "Sound Hunt"] as const;
const findSubjects = ["a public mural", "a market sign", "a public garden", "a local craft", "a public sculpture", "an interesting roof", "a street tree", "a painted doorway", "a public map", "a patterned awning", "a tiled wall", "a public fountain", "a shaded bench", "a colorful storefront", "a community noticeboard", "a public square", "a bicycle", "a flower", "a street musician performing publicly", "a painted wall"];
/** Twenty distinct clean templates per hunt kind; location-aware choices are decided by the day generator. */
export const FIND_IT_QUESTS: Record<(typeof FIND_IT_KINDS)[number], string[]> = Object.fromEntries(FIND_IT_KINDS.map((kind) => [kind, findSubjects.map((subject, i) => {
  switch (kind) {
    case "Spot It": return `Spot ${subject} in {city}; photograph only if allowed and share one detail.`;
    case "Alphabet Hunt": return `Find the letter ${"ABCDEFGHIJKLMNOPQRST"[i]} on a public sign near ${subject}; photograph only if allowed.`;
    case "Color Hunt": return `Find a ${["red", "blue", "green", "yellow", "orange"][i % 5]} detail on ${subject}; photograph only if allowed.`;
    case "Taste Trail": return `Find a local snack near ${subject}; ask about ingredients, try it if suitable, and share your review.`;
    case "Local Lingo": return `In {city}, find a local word on a public sign near ${subject}; look it up in a reliable source and share its meaning.`;
    case "Landmark Quest": return `If a world-famous landmark is in today's itinerary city, find its image on a public map near ${subject} and share one verified fact.`;
    case "Riddle Hunt": return `I could be ${subject}. Find me in public, then write a one-line riddle for your squad.`;
    case "Hidden Gem": return `In {city}, find a publicly accessible detail near ${subject} that your squad might overlook; share why you like it.`;
    case "Kindness Quest": return `With a willing squadmate near ${subject}, share a sincere compliment and capture a squad-only moment.`;
    case "Sound Hunt": return `Notice the sound around ${subject} from a public space; describe its rhythm to your squad.`;
  }
})])) as Record<(typeof FIND_IT_KINDS)[number], string[]>;
export const findItPool = (hasLandmark: boolean) => FIND_IT_KINDS.filter(k => k !== "Landmark Quest" || hasLandmark).flatMap(k => FIND_IT_QUESTS[k].map(text => `${k}: ${text}`));

export function hashSeed(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items]; let h = hashSeed(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; const j = h % (i + 1); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

/** Speed Challenge pool: one task per Speed day, finished with a photo inside the 60-minute clock. */
export const SPEED_CHALLENGES = [
  "Squad photo where everyone points at something the same color in {city}.",
  "Find and photograph five different public signs in {city} that use a word you can't read yet.",
  "Recreate a famous group pose in a public square of {city}.",
  "Photograph a local snack your whole squad has never tried, then share one-word reviews.",
  "Spell TRIP with letters found on public signs around {city}; photo each letter in a collage.",
  "Find a public view of {city} and capture the squad's shadows in it.",
];
