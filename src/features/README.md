# Features

One folder per product area (M1-06, layout in [dev-docs/03 §4](../../dev-docs/03-target-architecture.md)).
Screens import data through `src/data`, never the Supabase client (lint rule; older files are listed in
`eslint-suppressions.json`). `src/components` keeps only `ui/` and pieces shared across features
(`BrandLockup`, `CountryFlag`, `CaptainCrown`, `PlacePicker`, `PlaceBrowser`, `RememberedSection`,
`ShortList`, `ReportSheet`).

| Folder | What lives there |
|---|---|
| `app-shell/` | signed-in shell, tab bar, URL navigation, sheets, update and confirm prompts |
| `auth/` | sign-in screen |
| `onboarding/` | splash, welcome, Explore tour, age gate and private-beta screens, legal consent, About |
| `home/` | Home dashboard |
| `setup/` | trip and room setup sheets (replaced by the M2 Captain wizard) |
| `trip/` | trip overview, itinerary, crew list, invites, journey, unlock/checkout, archived trips |
| `play/` | Play hub, phase notices and countdowns, game scenes, Games on the Flight |
| `quests/`, `missions/` | sealed quests and Showcase; Airport / Home Missions |
| `points/` | season standings, crowning, tie-break wheel |
| `passport/` | passport book and stamps |
| `culture/` | Explore / Show Your Culture rooms, culture cards, sample experiences |
| `window-seat/` | Window Seat guide and crew guide |
| `at-home/` | the old At Home room and its night tools (kept until M3-13) |
| `captain-tools/` | Captain tools, checklist, role tips, trip time zone |
| `players/` | player cards |
| `me/` | Me tab extras: help, bug report, delete account, trip feedback |
| `admin/` | founder dashboard, Test Lab, beta codes, bug inbox, AI spend guard |
| `ai-credits/` | AI credit wallet (kept until M3-02) |
| `offline/` | offline trip cards |
