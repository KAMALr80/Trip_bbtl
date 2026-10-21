# TripJunkies™ — Avatar set and design spec

Rule (Oct 3, 2026): avatars are **pick-only**. No photo upload, no outside avatar service. Players choose from the built-in cartoon set; the chosen avatar shows on player cards, boarding passes, Squad and leaderboards. Saved picks of any older kind keep resolving.

## Current set
- Seeds 1–24: travelers (`src/assets/avatars/traveler-*`), the glossy cinematic cartoon style used across the app.
- Seeds 25–54: buddies (`src/assets/avatars/buddy-*`), mascot-style companions.
- Seeds 55–60: travelers 25–30 (wanted list items 1–6).
- The picker shows all 54 in a scrollable grid, current pick highlighted, in a cinematic frosted card.

## Style rules for any new avatar
- Same look as the travelers: glossy, vibrant, cartoon-realistic, soft rim light, deep-navy or sunset backdrop, no text, head-and-shoulders, facing slightly left or right.
- Square source at 1024×1024, exported WebP ≤ 90 KB, served at 2× of the largest display size (display sizes: 20 / 34 / 48 / 96 px).
- Diverse by default: skin tones, hair textures, ages (adults), body types, mobility aids and glasses welcome; Black travelers clearly represented. Never a real person, celebrity, brand or licensed character.
- Each avatar gets a short name key (`traveler-25-…`) and is appended to the seed list; existing seed numbers never change.

## Wanted additions (founder's list — edit freely)
Proposed 12 so the traveler set reaches 36:
1. Woman with locs, sunglasses on head, passport in hand
2. Man with a beard and a camera strap
3. Older woman with silver curls and a sun hat
4. Young man in a hoodie with over-ear headphones
5. Woman in a headwrap holding a boarding pass
6. Man with a fade and a neck pillow
7. Woman with braids and a backpack
8. Man with glasses and a travel mug
9. Woman with natural curls and a wide smile, denim jacket
10. Man in a bucket hat with a map
11. Woman with a hijab and a tote bag
12. Man with a cane, blazer and a confident grin

## How to add
1. Generate at 1024×1024 in the style above; save to `src/assets/avatars/`.
2. Append to the seed map in `src/lib/player-cards.ts` (next free seed number).
3. No database change: picks store the seed number only.
