import hurricaneArt from "@/assets/sample-hurricane.jpg";
import cobblerArt from "@/assets/sample-cobbler.jpg";

/** Read-only sample experiences: local display data, same for every signed-in user, never stored or editable. */
export type SampleExperience = {
  id: string;
  sample: true;
  category: "Food";
  title: string;
  country: string;
  region: string;
  city: string | null;
  art: string;
  intro: string;
  needs: string[];
  steps: string[];
  backstory: string;
  meaning: string;
  adultNote?: string;
  quest: { round: string; prompt: string; options: string[]; answer: number; fact: string }[];
  days: { question: string; task: string; creatorQuestion: string; creatorShare: string }[];
};

export const SAMPLE_EXPERIENCES: SampleExperience[] = [
  {
    id: "sample-hurricane",
    sample: true,
    category: "Food",
    title: "Hurricane Mocktail",
    country: "US",
    region: "Louisiana",
    city: "New Orleans",
    art: hurricaneArt,
    intro:
      "A passion-fruit and citrus party drink — mocktail first, made for parades, porches and second lines.",
    needs: [
      "2 oz passion fruit juice (or nectar)",
      "1 oz fresh orange juice",
      "½ oz fresh lime juice",
      "½ oz grenadine",
      "Sparkling water or lemon-lime soda",
      "Ice, an orange slice and a cherry",
    ],
    steps: [
      "Fill a tall glass with ice.",
      "Add the passion fruit, orange and lime juice.",
      "Pour in the grenadine and give it a gentle stir.",
      "Top with sparkling water or soda.",
      "Garnish with an orange slice and a cherry. Raise it to the squad.",
    ],
    backstory:
      "The Hurricane was born in the French Quarter in the 1940s, poured into tall glasses shaped like hurricane lamps. It became the cup people carry down Bourbon Street, along parade routes and into the music spilling out of every doorway.",
    meaning:
      "In New Orleans, Mardi Gras and second-line parades are about joy out loud — brass bands, neighbors dancing behind them, everyone welcome. A bright red glass in your hand says you're part of the celebration.",
    adultNote: "Adult option (21+): add your beverage of choice.",
    days: [
      {
        question: "What makes a New Orleans celebration feel like a community event?",
        task: "Listen to a brass-band song and notice the rhythm.",
        creatorQuestion: "Which celebration should I introduce first?",
        creatorShare: "Share a memory of a neighborhood parade and why it matters.",
      },
      {
        question: "What is a second line?",
        task: "Learn how neighbors join the parade behind the band.",
        creatorQuestion: "What does a second line mean to my community?",
        creatorShare: "Tell the story behind the music and the people who keep it going.",
      },
      {
        question: "Which flavors make a Hurricane mocktail?",
        task: "Gather passion fruit, citrus and your favorite sparkling mixer.",
        creatorQuestion: "Which flavors remind me of home?",
        creatorShare: "Show the ingredients and explain where the recipe came from.",
      },
      {
        question: "How would you welcome someone to the table?",
        task: "Make the mocktail and share it with the group.",
        creatorQuestion: "How do I welcome someone into the celebration?",
        creatorShare: "Make the mocktail, present it and share the story behind it.",
      },
    ],
    quest: [
      {
        round: "Guess It",
        prompt: "Where in New Orleans was the Hurricane first poured?",
        options: [
          "The French Quarter",
          "The Garden District",
          "Lake Pontchartrain",
          "Audubon Park",
        ],
        answer: 0,
        fact: "It started in the French Quarter in the 1940s.",
      },
      {
        round: "Picture It",
        prompt: "Which fruit gives the Hurricane its tropical flavor?",
        options: ["Passion fruit", "Mango", "Pineapple", "Watermelon"],
        answer: 0,
        fact: "Passion fruit plus citrus is the classic base.",
      },
      {
        round: "Live It",
        prompt: "A second line is a…",
        options: [
          "Parade crowd dancing behind a brass band",
          "Backup choir",
          "Line at a café",
          "Type of bead",
        ],
        answer: 0,
        fact: "Challenge: play a brass-band song and second-line around the room for 20 seconds!",
      },
    ],
  },
  {
    id: "sample-cobbler",
    sample: true,
    category: "Food",
    title: "Georgia Peach Cobbler",
    country: "US",
    region: "Georgia",
    city: null,
    art: cobblerArt,
    intro:
      "Warm peaches, a golden buttery crust and a big spoon — the Sunday dinner dessert everybody waits for.",
    needs: [
      "6 ripe peaches, sliced (or 2 cans, drained)",
      "1 cup sugar, divided",
      "1 tsp cinnamon",
      "½ cup butter",
      "1 cup flour",
      "2 tsp baking powder",
      "1 cup milk",
      "Pinch of salt",
    ],
    steps: [
      "Heat the oven to 350°F (175°C). Melt the butter in a baking dish or skillet in the oven.",
      "Toss the peaches with ½ cup sugar and the cinnamon.",
      "Whisk flour, the rest of the sugar, baking powder, salt and milk into a batter.",
      "Pour the batter over the melted butter — don't stir.",
      "Spoon the peaches on top and bake 40–45 minutes until golden.",
      "Serve warm, ideally with vanilla ice cream and the whole table.",
    ],
    backstory:
      "Georgia has been called the Peach State since the late 1800s, when its orchards shipped peaches across the country. Summer means roadside stands, sticky fingers, and grandmothers who never measure anything.",
    meaning:
      "Cobbler is Sunday dinner — the dish that keeps everyone at the table a little longer. It means family, after-church conversations on the porch, and being fed by people who love you.",
    days: [
      {
        question: "Why is Georgia called the Peach State?",
        task: "Read the story of Georgia's peach orchards.",
        creatorQuestion: "Why did I choose peaches for this story?",
        creatorShare: "Share what peach season means where you live.",
      },
      {
        question: "What makes a cobbler different from a pie?",
        task: "Gather peaches and the ingredients for a simple batter.",
        creatorQuestion: "Who first showed me how to make cobbler?",
        creatorShare: "Tell a family kitchen story and show the ingredients.",
      },
      {
        question: "Which goes into the baking dish first?",
        task: "Follow the recipe and prepare the cobbler for the oven.",
        creatorQuestion: "What detail makes my recipe my own?",
        creatorShare: "Walk through the steps and share a cooking tip.",
      },
      {
        question: "What dish keeps your family at the table?",
        task: "Serve the cobbler and tell your group about a favorite shared meal.",
        creatorQuestion: "What does sharing this dish mean to me?",
        creatorShare: "Present the finished cobbler and its story to the group.",
      },
    ],
    quest: [
      {
        round: "Guess It",
        prompt: "What is Georgia's famous nickname?",
        options: ["The Peach State", "The Sunshine State", "The Golden State", "The Garden State"],
        answer: 0,
        fact: "Georgia has been the Peach State since the late 1800s.",
      },
      {
        round: "Picture It",
        prompt: "In this cobbler, what goes into the dish first?",
        options: ["Melted butter", "Peaches", "Ice cream", "Sugar crust"],
        answer: 0,
        fact: "Butter first, batter on top, peaches last — no stirring.",
      },
      {
        round: "Live It",
        prompt: "Cobbler is a classic part of which family moment?",
        options: [
          "Sunday dinner",
          "Breakfast on the go",
          "Midnight snacks only",
          "Road-trip gas stops",
        ],
        answer: 0,
        fact: "Challenge: tell the squad about your family's Sunday-dinner dish.",
      },
    ],
  },
];
