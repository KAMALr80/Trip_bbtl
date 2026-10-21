# Architecture decisions

The rules the current code was built on live in four `AGENTS.md` files. They stay next to the code they describe, so coding agents and reviewers working in those folders see them:

| File | Scope |
|---|---|
| [`/AGENTS.md`](../../AGENTS.md) | App-wide rules: roles, privileged mutations, AI, ages, seasons, rooms |
| [`/src/AGENTS.md`](../../src/AGENTS.md) | Frontend: looks and appearance, tour, PWA without a service worker, shared place and schedule helpers |
| [`/src/components/AGENTS.md`](../../src/components/AGENTS.md) | Play phase and mission timing come from the server |
| [`/supabase/AGENTS.md`](../../supabase/AGENTS.md) | Database: per-feature rules for `trip_private` functions, scoring, reveals and access |

New decisions go here as short records, `NNN-title.md`: context → decision → consequences (see [dev-docs/09 §6](../../dev-docs/09-engineering-conventions.md)). When a decision replaces an `AGENTS.md` rule, edit that rule in the same PR.

History from the Lovable build (round plans, the old roadmap) is archived in [`../history/`](../history/).
