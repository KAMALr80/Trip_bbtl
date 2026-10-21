# Prompt 7 – Trip games during the trip (Trip Season)

Keeps the orange/blue/lime/yellow colors and the game-like character style. Everything is quick and stays out of the way during the trip.

## What players will see
- During the trip, using the trip's own time zone, the Play tab switches from game nights to **Today's Games**. The games shown depend on the day tag (Party, Explore, Chill, Travel).
- **Daily Bingo** (Party, Explore and Chill days): a 3x3 card that unlocks each morning. Everyone gets the same 9 squares in a different order. Tapping a square asks for an optional photo. Each square is worth 1 stamp, plus 4 bonus stamps for a full card.
- **Daily Quests** (Explore and Party days): 3 tasks based on that day's plan. A quest counts after a photo gets 2 thumbs-up from other members. Each quest is worth 2 stamps.
- **Chill Night Trivia** (Chill days): 6 multiple-choice questions about the destination, 1 stamp per correct answer.
- **Secret Mission** (every day): a private, harmless mission for each person. At night they tap Reveal and the group votes. Pulling it off unnoticed earns 3 stamps, and anyone who caught them earns 1.
- **Photo Challenge** (every day): one theme, one photo per person, and a night vote. The winner gets 3 stamps.
- **Day MVP** (every day): a night vote. The winner gets 5 stamps.
- **Airport Missions** (Travel days): 3 missions picked from the 5 listed. "Predict wheels-up" goes to the closest guess.
- **Daily limits**: 30 stamps on trip days and 10 on travel days. Extra stamps are not counted.
- **Trip Season score**: stamps earned ÷ most stamps possible so far × 100. It starts at 0, is separate from Game Season, and gets its own leaderboard on Home.
- **Captain Tools > Trip Games**: choose Explorer or Local bingo squares, regenerate or edit any square, quest or trivia question, and preview the Trip Season before the trip starts.

## Content
- Lovable AI writes the Local bingo squares, quests, trivia and secret missions from each day's city and spots. It is told to keep everything safe, free and quick.
- Explorer squares, sample missions, photo themes and airport missions come from a built-in starter list, so the games still work without AI.
- Each day's content is created when someone first opens Today's Games that day, or ahead of time by the Captain.

## Technical details
- New tables, all readable by trip members only:
  - `trip_day_games`: one row per trip and date, with the tag, bingo squares, quests, trivia, photo theme and airport missions.
  - `bingo_marks`, `quest_posts`, `quest_thumbs` and `trivia_answers`.
  - `secret_missions`: each person can read only their own mission until it is revealed.
  - `day_votes`: photo, MVP and mission votes.
  - `trip_stamps`: a ledger of trip, date, user, source and amount.
- All scoring runs in identity-checked private functions behind invoker wrappers, which enforce the daily limits. Nobody can write stamps directly.
- Trip photos go in a private storage bucket with signed links for members, the same way avatars work.
- One authenticated server function generates the day's content with Lovable AI, and it is role-checked for regeneration.
- New `TripDayGames.tsx` and `TripSeason` components, live-updated the same way as the useSeason pattern. The Play tab chooses between them by the trip's local date.
