# Sprint overview implementation plan

**Goal:** Historical sprint browsing and accurate per-person current points.
**Spec:** docs/superpowers/specs/2026-09-23-sprint-overview-design.md
**Architecture:** Immutable completion snapshot separate from current Issue state; scoped overview API; reusable compact UI in board and backlog.

- [x] Implement overview contracts, snapshot migration, aggregation and completion hook.
- [x] Add current-member points component and historical Sprint modal/entry.
- [x] Integration test snapshots, totals, permissions; browser verify both entry points.
- [x] Run full checks together with mentions, update preview/docs, commit and push.
