# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## This app

- `_shell.tsx` is a pathless layout that renders the app shell (`src/features/app-shell`). It stays
  mounted while its tab routes change: `_shell.index.tsx` (`/`), `_shell.home.tsx`,
  `_shell.play.tsx`, `_shell.trip.tsx`, `_shell.me.tsx`. Sub-screens are search params, validated
  in `src/features/app-shell/nav.ts`.
- `_shell.t.$tripId.tsx` is the trip layout: `/t/$tripId/play` and `/t/$tripId/trip` (and
  `/t/$tripId`, which redirects to Play). Its loader prefetches the trip's roster and cards; the
  shell opens the trip named in the URL. Plain `/play` and `/trip` open the current trip.
- Route files stay thin: no business logic, no Supabase calls.
