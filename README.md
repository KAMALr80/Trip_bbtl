# Squad Goals

Build "Squad Season" (working name), a mobile-first web app for group trips. Groups bond before the trip with weekly game nights on video calls, compete during the trip with daily challenges, and get a shareable recap after. It only works for trips with dates (friends trips, bachelorettes, birthdays, weddings, reunions) - it is not a general party game. Never hardcode any destination; every trip's content comes from what its Captain enters. LOOK AND FEEL (most important): it must feel awesome, cute, fun and engaging, like a polished consumer app people want to screenshot - not a dashboard or a template. Bright playful palette inspired by Bangkok taxis (hot pink #E8247C, green #1D9A5B, orange #F2731D, blue #2A5BD7) on a soft pink-tinted off-white, with a matching dark mode (deep plum background). Fonts: Bricolage Grotesque (chunky display, headings and big numbers) and Figtree (body). Rounded cards with soft colored tints, chunky pill buttons, playful emoji accents, bouncy micro-animations on taps, confetti for wins, sticker-like badges, cute empty states with friendly copy. Big tap targets, one-hand phone use. Bottom tab bar with 5 tabs and icons: Home, Play, Trip, Squad, Me. Quick actions open as bottom-sheet pop-ups. For now build the shell of each tab with tasteful placeholder content. AUTH: use Lovable Cloud for database and auth. Sign in with Google, Apple or email; stay signed in. After first sign-in, show 4 swipeable illustrated How it works screens: (1) Join your trip with a link or code, (2) Game nights before you go with a spinning wheel, (3) Play during the trip: daily bingo, quests, secret missions, (4) Get crowned: two seasons, two champions, mystery prizes. Then a welcome screen with two big buttons: Start a trip and Join a trip (wire them up in the next step). Make it an installable web app (PWA): app icon, opens full screen from the iPhone home screen, light and fast on slow mobile data abroad.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ff8fd31b-2c16-4b96-b5ff-87031aed303d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
