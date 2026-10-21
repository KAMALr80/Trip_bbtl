// Local-only practice material. Never load the live trip decks into Boarding practice.
const places = ["at a rainy station", "beside a lighthouse", "at a night market", "on a ferry", "at a mountain café", "in an airport lounge", "on a beach boardwalk", "at a tiny museum"];
const topics = ["a surprising snack", "a kind stranger", "a forgotten souvenir", "a lucky detour", "a silly photo", "a hidden garden", "an unexpected sound", "a colorful doorway"];
const drawThings = ["a suitcase", "a paper airplane", "a pineapple", "a telescope", "a tiny boat", "a sun hat", "a street sign", "a postcard"];
const songMoods = ["joyful", "dreamy", "dramatic", "sleepy", "upbeat", "nostalgic", "mysterious", "celebratory"];
const formats = ["Tell a story about", "Describe your first impression of", "Invent a postcard about", "Give a nickname to", "Share a memory inspired by"];
const combine = (make: (a: number, b: number) => string) => Array.from({ length: 40 }, (_, i) => make(Math.floor(i / 8), i % 8));
export const practicePrompts: Record<number, string[]> = {
  0: combine((a,b) => `${formats[a]} ${topics[b]} ${places[(a+b)%8]}.`),
  1: combine((a,b) => `${["Act it out", "Describe it in three words", "Make a sound for it", "Tell a ten-second story about it", "Strike a pose for it"][a]}: ${topics[b]} ${places[(a+b)%8]}.`),
  2: combine((a,b) => `Draw ${drawThings[b]} ${places[(a+b)%8]}. Let your squad guess!`),
  3: combine((a,b) => `Hum a ${songMoods[b]} tune as if you were ${["arriving", "packing", "wandering", "waiting", "celebrating"][a]} ${places[(a+b)%8]}. No lyrics needed.`),
  4: combine((a,b) => `Never have I ever ${["imagined", "sketched", "photographed", "named", "looked for"][a]} ${topics[b]} while traveling.`),
  5: combine((a,b) => `Who would be first to ${["spot", "recommend", "photograph", "describe", "find"][a]} ${topics[b]} ${places[(a+b)%8]}?`),
  6: combine((a,b) => `Tell two truths and one lie about ${["finding", "losing", "sharing", "drawing", "remembering"][a]} ${topics[b]}. Which story is the lie?`),
  7: combine((a,b) => `Bingo: spot ${["a shape like", "a color matching", "something smaller than", "a pattern near", "a reflection of"][a]} ${drawThings[b]}.`),
  8: combine((a,b) => `Find something nearby that reminds you of ${topics[b]} ${places[(a+b)%8]}. Tell its story.`),
  9: combine((a,b) => `${["Act out", "Sketch", "Describe", "Mime", "Make a sound for"][a]} ${topics[b]} ${places[(a+b)%8]}.`),
};

// Hand-written one-phone extras: quick interactions, questions and small challenges. Clean, fun, policy-safe.
const extras: Record<number, string[]> = {
  0: ["What's the best meal you've had on a trip?", "Show the group your best 'just landed' face.", "Which snack would you pack for a 12-hour flight?", "Describe your dream hotel room in five words.", "Give the person on your left a travel nickname.", "What's a small habit you always keep on vacation?", "Teach the group a hand wave from anywhere in the world.", "What's one place you'd revisit tomorrow?", "Swap seats with someone and introduce yourself as them.", "Name three things in your bag right now."],
  1: ["Hot seat: answer three quick questions from the group in 30 seconds.", "Talk like a flight attendant for the whole turn.", "Name five capital cities before time runs out.", "Do your best tour-guide intro for this room.", "Keep a straight face while the group tries to make you laugh.", "Sell the group your hometown in 30 seconds.", "List as many fruits as you can, A to Z.", "Act out ordering food without speaking.", "Answer every question with a question.", "Plan a perfect day out in 30 seconds."],
  2: ["Draw a famous landmark — no letters allowed.", "Draw your favorite food with your other hand.", "Draw the group as a band on tour.", "Draw a map of your street from memory.", "Draw a cloud that looks like an animal.", "Draw the best souvenir you ever got.", "Draw a city skyline at night.", "Draw a camel on a skateboard.", "Draw your dream vacation in three shapes.", "Draw the face you make when a flight is delayed."],
  3: ["Hum a theme song from a cartoon.", "Hum a song that feels like summer.", "Clap the rhythm of a famous song.", "Hum a song you'd play on a road trip.", "Whistle or hum a birthday tune in a new style.", "Hum the first song you ever loved.", "Hum a song from a movie set somewhere sunny.", "Beatbox a song — the group guesses.", "Hum a song in slow motion.", "Hum a song that makes you want to dance."],
  4: ["Never have I ever missed a train or bus.", "Never have I ever tried a food I couldn't pronounce.", "Never have I ever gotten lost with a map in my hand.", "Never have I ever slept in an airport.", "Never have I ever packed something completely useless.", "Never have I ever learned a dance on vacation.", "Never have I ever waved at someone who wasn't waving at me.", "Never have I ever taken 100 photos of one sunset.", "Never have I ever forgotten my phone charger on a trip.", "Never have I ever sung karaoke in another language."],
  5: ["Who would win a staring contest? Everyone points on three.", "Who is most likely to make friends with a local cat?", "Who would pack the night before?", "Who would find the best street food?", "Who would get the group lost — and turn it into a story?", "Who would bring home the weirdest souvenir?", "Who would wake up first for sunrise?", "Who would talk their way into a free dessert?", "Who would take the best group photo?", "Who would learn the local phrases first?"],
  6: ["Two truths and a lie about your first trip.", "Two truths and a lie about your favorite food.", "Two truths and a lie about a hobby.", "Two truths and a lie about your childhood pet.", "Two truths and a lie about a job you had.", "Two truths and a lie about something you can cook.", "Two truths and a lie about your music taste.", "Two truths and a lie about a place you've lived.", "Two truths and a lie about a talent you have.", "Two truths and a lie about a time you laughed too hard."],
};
for (const [k, list] of Object.entries(extras)) practicePrompts[Number(k)] = [...(practicePrompts[Number(k)] ?? []), ...list];
export function shuffledPractice(index: number) {
  const items = [...(practicePrompts[index] ?? practicePrompts[0] ?? [])];
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const current = items[i]; const swap = items[j]; if (current === undefined || swap === undefined) continue; items[i] = swap; items[j] = current; }
  return items;
}
