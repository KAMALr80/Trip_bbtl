/** Written card pools for Travel From Home and Window Seat experiences, filled in with the chosen place. Card format: title · what to do · backstory · search keywords · points. */
export type CultureCard = {
  day_number: number;
  title: string;
  what_to_do: string;
  backstory: string;
  keywords: string[];
  points: number;
  source: "pool" | "ai" | "manual";
};
export const CULTURE_LAYERS = [
  { id: "food", label: "Food & Drink", theme: "dish, ingredient, and cooking tradition" },
  { id: "music", label: "Music & Dance", theme: "song, rhythm, and dance tradition" },
  { id: "language", label: "Language & Sayings", theme: "phrase, greeting, and local expression" },
  {
    id: "traditions",
    label: "Holidays & Traditions",
    theme: "celebration, custom, and community tradition",
  },
  {
    id: "history",
    label: "History & Heroes",
    theme: "historical figure, landmark, and local history",
  },
  { id: "fashion", label: "Fashion & Art", theme: "artist, pattern, textile, and craft" },
  { id: "games", label: "Games & Fun", theme: "local game, sport, and playful tradition" },
  {
    id: "everyday",
    label: "Everyday Life",
    theme: "daily routine, transport, and neighborhood life",
  },
  {
    id: "mixed",
    label: "A bit of everything",
    theme: "daily food, music, language, art, history, games, and life",
  },
] as const;
export type CultureLayer = (typeof CULTURE_LAYERS)[number]["id"];
type T = { title: string; what: string; back: string; keys: string[]; points: number };

const HOME: T[] = [
  {
    title: "Cook a {place} Street Snack",
    what: "Make one simple street snack from {place} with what you can find nearby.",
    back: "Street food is where most people in {place} taste everyday life — quick, cheap and shared.",
    keys: ["{place} street food recipe", "easy {place} snack"],
    points: 15,
  },
  {
    title: "Learn Five Words",
    what: "Learn hello, thank you, please, delicious and goodbye in the local language of {place}, then use them today.",
    back: "A few local words open doors and smiles everywhere in {place}.",
    keys: ["{place} basic phrases", "{place} pronunciation"],
    points: 10,
  },
  {
    title: "Dance Break",
    what: "Learn 30 seconds of a traditional or popular dance from {place} and show someone.",
    back: "Dance in {place} carries celebrations, stories and community.",
    keys: ["{place} traditional dance tutorial", "{place} dance history"],
    points: 15,
  },
  {
    title: "Soundtrack of {place}",
    what: "Build a 5-song playlist of artists from {place} and play it while you cook or clean.",
    back: "Music shows how people in {place} celebrate, mourn and flirt — across generations.",
    keys: ["famous musicians from {place}", "{place} music genres"],
    points: 10,
  },
  {
    title: "Market Run",
    what: "Find one ingredient or product tied to {place} at a local store and try it.",
    back: "What people buy at the market says a lot about daily life in {place}.",
    keys: ["{place} pantry staples", "{place} ingredients guide"],
    points: 10,
  },
  {
    title: "Local Game Night",
    what: "Learn the rules of a game played in {place} and play one round with someone.",
    back: "Local games show how people in {place} spend time together.",
    keys: ["traditional games of {place}", "how to play {place} game"],
    points: 15,
  },
  {
    title: "Craft Hour",
    what: "Make a small craft inspired by a pattern, textile or art style from {place}.",
    back: "Crafts in {place} keep family skills and regional styles alive.",
    keys: ["{place} traditional crafts", "{place} patterns DIY"],
    points: 15,
  },
  {
    title: "Map It Out",
    what: "Find {place} on a map and name three neighbors, one river or mountain, and one famous landmark.",
    back: "Geography shaped what {place} eats, grows and celebrates.",
    keys: ["{place} geography facts", "{place} landmarks"],
    points: 5,
  },
  {
    title: "Table Manners",
    what: "Practice one table or greeting custom from {place} at your next meal.",
    back: "Etiquette in {place} shows respect in small, daily ways.",
    keys: ["{place} dining etiquette", "{place} greeting customs"],
    points: 10,
  },
  {
    title: "Sweet Treat",
    what: "Make or buy a dessert from {place} and share it.",
    back: "Sweets in {place} often mark holidays and family gatherings.",
    keys: ["{place} dessert recipe", "{place} holiday sweets"],
    points: 15,
  },
  {
    title: "Sports Fan for a Day",
    what: "Watch highlights of a sport loved in {place} and learn one rule or team chant.",
    back: "Sport brings neighbors in {place} together like nothing else.",
    keys: ["most popular sport in {place}", "{place} famous athletes"],
    points: 10,
  },
  {
    title: "Holiday Spotlight",
    what: "Pick one holiday from {place} and recreate a small, safe part of it at home.",
    back: "Holidays in {place} mix food, music and family rituals.",
    keys: ["{place} national holidays", "how {place} celebrates"],
    points: 15,
  },
  {
    title: "Money Talk",
    what: "Learn the currency of {place} and price out a typical lunch there.",
    back: "Knowing everyday prices helps you understand how people in {place} live.",
    keys: ["{place} currency", "cost of living {place}"],
    points: 5,
  },
  {
    title: "Film Night",
    what: "Watch a family-friendly film or show from {place} and note one thing that surprised you.",
    back: "Screen stories show daily life, humor and values in {place}.",
    keys: ["best films from {place}", "{place} TV shows"],
    points: 10,
  },
];

const TRAVEL: T[] = [
  {
    title: "First Bite in {place}",
    what: "Order a dish locals love, snap it, and rate it.",
    back: "Food is the fastest way into the everyday rhythm of {place}.",
    keys: ["must-try food {place}", "{place} local dishes"],
    points: 15,
  },
  {
    title: "Landmark Hunt",
    what: "Visit one landmark and find a detail most people walk past.",
    back: "Landmarks in {place} hold layers of stories beyond the photo spot.",
    keys: ["{place} landmark history", "hidden details {place}"],
    points: 15,
  },
  {
    title: "Ask a Local",
    what: "Politely ask someone for their favorite spot nearby and go there.",
    back: "The best tips in {place} rarely appear in guidebooks.",
    keys: ["{place} local favorites", "{place} neighborhoods"],
    points: 15,
  },
  {
    title: "Market Wander",
    what: "Walk a local market and try one thing you can't name.",
    back: "Markets in {place} show what's in season and who feeds the city.",
    keys: ["{place} markets", "{place} seasonal produce"],
    points: 10,
  },
  {
    title: "Sound Check",
    what: "Find live or street music and record 5 seconds of the vibe.",
    back: "Music fills the streets of {place} in its own way.",
    keys: ["live music {place}", "{place} music scene"],
    points: 10,
  },
  {
    title: "Say It Right",
    what: "Use one local phrase with a shopkeeper or server today.",
    back: "Locals in {place} love it when visitors try their language.",
    keys: ["{place} useful phrases", "{place} pronunciation"],
    points: 10,
  },
  {
    title: "Golden Hour",
    what: "Catch sunrise or sunset somewhere scenic and rate the view.",
    back: "Light and landscape shape the mood of {place}.",
    keys: ["best sunset spots {place}", "{place} viewpoints"],
    points: 10,
  },
  {
    title: "Craft Corner",
    what: "Find a shop or workshop making something by hand and learn how it's made.",
    back: "Handmade goods carry the regional skills of {place}.",
    keys: ["{place} handicrafts", "{place} artisans"],
    points: 15,
  },
  {
    title: "Local Ride",
    what: "Take a local transport you've never used and review the ride.",
    back: "How people move around {place} says a lot about daily life.",
    keys: ["getting around {place}", "{place} public transport"],
    points: 10,
  },
  {
    title: "Sweet Stop",
    what: "Try a local dessert or snack and give it stars.",
    back: "Sweets in {place} often tie to holidays and family traditions.",
    keys: ["{place} desserts", "{place} snacks"],
    points: 10,
  },
  {
    title: "Park Life",
    what: "Spend 20 minutes in a park or plaza and notice how locals hang out.",
    back: "Public spaces in {place} are where community happens.",
    keys: ["{place} parks", "{place} plazas"],
    points: 5,
  },
  {
    title: "History Bite",
    what: "Visit a museum or historic street and bring back one fact.",
    back: "History explains why {place} looks and tastes the way it does.",
    keys: ["{place} history", "{place} museums"],
    points: 15,
  },
];

const fill = (s: string, place: string) => s.replaceAll("{place}", place);
/** Deterministic-but-shuffled pick so two experiences rarely share the same order. */
export function poolCards(
  track: "home" | "travel",
  place: string,
  days: number,
  seed: string,
  layer?: CultureLayer | null,
  from = 1,
): CultureCard[] {
  if (layer && layer !== "mixed" && track === "home") {
    const found = CULTURE_LAYERS.find((x) => x.id === layer);
    const theme = found?.theme ?? "local culture";
    return Array.from({ length: days }, (_, i) => {
      const day = i + from;
      const angles = [
        "Find its roots",
        "Make a small version",
        "Ask what it means",
        "Compare generations",
        "Share the story",
        "Try it together",
        "Pass it on",
      ];
      const angle = angles[(day - 1) % angles.length];
      return {
        day_number: day,
        title: `${found?.label ?? "Culture"} · ${angle} · Day ${day}`,
        what_to_do: `Explore one ${theme} from ${place}. ${angle}: find a reliable source, try a small hands-on activity, and share what you learned.`,
        backstory: `Every ${theme} has a story shaped by people in ${place}; look for local voices rather than guessing.`,
        keywords: [`${place} ${theme}`, `${place} ${theme} history`],
        points: 10,
        source: "pool",
      };
    });
  }
  const src = [...(track === "home" ? HOME : TRAVEL)];
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = src.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [src[i], src[j]] = [src[j]!, src[i]!];
  }
  return Array.from({ length: days }, (_, i) => {
    const day = from + i,
      t = src[(day - 1) % src.length]!;
    const loop = Math.floor((day - 1) / src.length);
    return {
      day_number: day,
      title: `${fill(t.title, place)}${loop ? ` · Day ${day}` : ""}`,
      what_to_do: `${fill(t.what, place)}${loop ? ` This time, find a different example and compare it with your earlier stop.` : ""}`,
      backstory: fill(t.back, place),
      keywords: t.keys.map((k) => fill(k, place)),
      points: t.points,
      source: "pool",
    };
  });
}

export const PLAN_QUESTIONS = [
  "Who's doing this with you (solo, family, friends)?",
  "What do you love most: food, music, crafts, language or games?",
  "Any foods or activities to skip?",
  "How much time per day: 15 minutes, an hour, or more?",
];
