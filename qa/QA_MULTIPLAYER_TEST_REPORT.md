# QA multiplayer test report

**Live status: BLOCKED.** This audit had no staging credentials and no second or third real account, so no two-browser session was run. What *is* known comes from the database suite, which simulates several users with `tests.authenticate_as`.

| Flow (PDF p.4) | Server rules verified by pgTAP | Live E2E | Live case |
|---|---|---|---|
| Crew Check: A submits, B approves, points post once | `21_proofs_crew_check` (22 ok): can't approve your own proof, points written once | BLOCKED | TC-MP-01 |
| Game Night Live Show & Tell 👍 = 20 pts, can't tap yourself | `22_live_and_crowns` (27 ok) | BLOCKED | TC-MP-02 |
| Secret award votes hidden until Close | `22_live_and_crowns`, `23_reveal_and_drops` (20 ok) | BLOCKED | TC-MP-03 |
| Award tie-break | No explicit tie assertion; rule is open question **Q7** | BLOCKED | TC-MP-04 |
| Fresh third account sees Crew Check / Game Night Live | Not a DB question (client role cache) | BLOCKED | TC-MP-05 |
| Captain ↔ Co-Captain ↔ Player changes, logged | `16_limits_and_leaders` (15 ok), `01_membership` | BLOCKED | TC-MP-06 |
| Crew sizes: 2, 12, 13th refused; Window Seat 4 | `13_room_rules`, `16_limits_and_leaders` (pending counts toward the cap) | BLOCKED | TC-MP-07 |
| Friends off the app (one phone) | Nothing saved server-side (by design, R-006) | BLOCKED | TC-MP-08 |

## About the "account bug" (PDF p.3, 4, 7)

Batch 1 (`4c43574`) found that the affected account's trips were a solo room, which has no Crew Check, and crew trips already past Trip Season. Crew Check also rendered nothing when no proof was waiting. Empty states were added. That explanation fits the symptoms, but it hasn't been confirmed live. **TC-MP-05 is the deciding test:** a brand-new account, a brand-new crew trip in Trip Season, and a role switched back and forth.

## Risks to watch in the live run

- Role changes reach the other browser only on refetch. Check the Play tab updates without a hard reload (TC-MP-06 step 4).
- Votes cast offline and sent from the outbox later must not double-count (TC-MP-03 variant).
