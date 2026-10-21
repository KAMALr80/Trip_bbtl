// Display-only label for trip-day challenges; derived from the text so every challenge (old, AI or typed) gets one.
export const CHALLENGE_CATEGORIES = ["Taste the City", "Culture Hunt", "Landmark Challenge", "Language or Local Expression", "Team Challenge", "Mystery Mission", "Speed Round"] as const;
export type ChallengeCategory = (typeof CHALLENGE_CATEGORIES)[number];

const RULES: [ChallengeCategory, RegExp][] = [
  ["Speed Round", /\b(fastest|first to|race|minute|seconds|quick|speed)\b/i],
  ["Language or Local Expression", /\b(say|phrase|word|learn|language|greet|thank you|hello|pronounce|local slang)\b/i],
  ["Taste the City", /\b(eat|taste|food|dish|snack|drink|coffee|tea|dessert|market stall|street food|menu|restaurant|fruit|sip)\b/i],
  ["Landmark Challenge", /\b(landmark|temple|tower|monument|statue|bridge|view|palace|museum|skyline|famous|sign)\b/i],
  ["Team Challenge", /\b(team|squad|group|together|everyone|all of you|human pyramid)\b/i],
  ["Culture Hunt", /\b(local|tradition|culture|art|craft|music|dance|souvenir|shop|market|festival|find)\b/i],
];

export function challengeCategory(text: string): ChallengeCategory {
  for (const [c, re] of RULES) if (re.test(text)) return c;
  return "Mystery Mission";
}

export const CATEGORY_EMOJI: Record<ChallengeCategory, string> = { "Taste the City": "🍜", "Culture Hunt": "🎨", "Landmark Challenge": "🏛️", "Language or Local Expression": "💬", "Team Challenge": "🤝", "Mystery Mission": "🕵️", "Speed Round": "⚡" };
