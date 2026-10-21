# TripJunkies™ — Brand & art style

Locked by the founder on Oct 4, 2026. Reference art lives in `docs/brand/`. Every new illustration, icon, splash, banner or merch piece follows this look; app code reads colors from the design tokens in `src/styles.css`, this doc describes the *art*.

## The look in one line
Neon tropical sunset, seen from the beach at golden hour: glossy script wordmark, deep-navy night sky, cyan→magenta→orange gradients, palms in silhouette, a white jet on a yellow dotted route.

## Wordmark
- "TripJunkies" in a bold, glossy, slightly italic brush script. "Trip" runs cyan → blue, "Junkies" runs orange → hot pink; a soft white specular highlight sits along the top of each letter.
- The dot of the "i" in Trip is a small cyan palm tree.
- A wave swoosh (cyan under "Trip", pink/orange under "Junkies") finishes the baseline.
- ™ after the final "s" (small, white or light pink).
- Tagline, always sentence case: **Collect the world with your squad.** — clean geometric sans (Figtree/Poppins weight 500–600), white or cream, letter-spaced lightly.
- Secondary lockup (Home header, footer): "TripJunkies" in the display font with the cyan→pink gradient and a small white plane trailing a dotted arc at the top right.

## Monogram
- "TJ" in the same gradient (T cyan→blue, J orange→pink), bold italic, three short speed lines under the T, a yellow dotted arc sweeping from bottom-left up to a white jet at top-right.
- Lives on deep navy with faint star speckle and a soft violet glow behind the letters.

## App icon (chosen: full badge)
- Circular badge: sunset lagoon scene (sun on the horizon, mountains, overwater bungalows, palms left, hibiscus right, white jet + yellow dotted route top-right), wordmark and tagline over the water, gradient ring cyan→pink→orange.
- Delivered as: `public/icons/icon-512.png`, `icon-192.png`, `icon-180.png` (badge at 92% on navy #0E0B1F), `icon-maskable-512.png`, `icon-maskable-192.png` (badge at 78% for Android's safe zone), `public/favicon.ico`.
- Source: `docs/brand/app-icon-badge-728.png`. Replace with a 1024×1024 master when one exists; keep the same framing.
- Alternatives kept for later (monogram "Jet Stream", "Passport Stamp", "Globe Mode", sunset avatar) are on `docs/brand/brand-board-2026-10.jpg` — previews only (~200px), need 1024 masters before use.

## Palette (art, not UI tokens)
- Night sky navy #0E0B1F → indigo #1B1240 → violet glow #5B2A9D
- Cyan #38D6FF · Electric blue #3B6CFF · Magenta #FF3FA4 · Hot pink #FF4FA0 · Orange #FF8A3D · Sun yellow #FFC94B
- Route dots and sun: yellow #FFD24A · Jet: pure white · Palms: near-black silhouettes #0B0820
- Cream for paper/passport surfaces #F7EFDD

## Scenes and motifs
- Sunset lagoons, overwater bungalows, palms, hibiscus, tropical mountains, airplane windows, passports and boarding passes, luggage, cameras, destination sign-posts.
- The jet is always small, white, pointing up-right, trailing a dashed yellow route that loops once.
- Neon glow is soft (outer glow 20–40px, 40–60% opacity), never harsh outlines.
- People, when shown, are a diverse squad mid-laugh, casual travel clothes, warm rim light from the sunset.

## Rules
- Realistic-cartoon render, crisp edges, high detail; no flat vector clip-art, no stock photos.
- Art assets ship at 2x the displayed size, never upscaled (see ART STANDARD in Lovable project knowledge).
- Text over art always sits on a soft dark backdrop.
- Never put the wordmark on a light background without the dark halo; never recolor the gradient.
- Social sizes already drafted on the brand board: avatar 1024², favicon 512², YouTube/LinkedIn banner 2560×1440, X banner 1500×500.
