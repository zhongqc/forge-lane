# M0 Validation and M1 Local Task Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining M0 investigation with reproducible evidence and complete all M1 local task-management behavior, retaining execution gates for any failed M0 capability.

**Architecture:** Preserve the existing Electron/Core/SQLite boundaries. Add bounded Codex JSON-RPC diagnostics and native-platform probes first; then implement domain policies, transactional task/revision/dependency storage, and a React board/detail/settings UI using the same narrow bridge. No M2 automatic execution is enabled.

**Tech Stack:** Existing pinned Electron 45 / React 19 / TypeScript / Prisma 7.10 / SQLite / Zod; Node test probes, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-forge-desktop-design.md`.

## Global Constraints

- macOS arm64 only; keep existing data and migrations. No legacy PostgreSQL import.
- Task title trim/nonempty/max 200, description max 200000, acceptance max 20000.
- CODE/MANUAL/GROUP, one-level GROUP parents, leaf-only same-project acyclic dependencies.
- Fixed states; creation only Backlog/Todo, CODE cannot be manually marked Done or started before M2 authorization exists.
- MANUAL start/accept and GROUP aggregation follow §6.3; Done/Cancelled do not reopen; tasks archive rather than delete.
- Each write has a UUID requestId and expectedVersion; related parent edits check parent versions. Requirement changes create immutable revisions; labels/position alone do not.
- Main remains the trusted Owner entry. CLI cannot create Owner commands. Secrets are not stored in SQLite/logs.
- M0 real probes use temporary fixtures and bounded model turns only. No remote push/PR/merge, global config edits, Full Access fallback or actual secret-read probes.
- Failed/unknown execution gates stay closed; a failed M0 investigation is recorded honestly and does not block offline M1 management.

## Review Focus

- Concurrent dependency/parent changes, repeated request IDs and stale edits preserve all existing data.
- Empty/cancelled/completed groups and active MANUAL edits cannot bypass completion or parent rules.
- Long Chinese input, IME composition, keyboard actions and unsaved navigation preserve drafts.
- Unavailable tools/auth, lost Core, offline startup or a restored DB never disable offline tasks or invent successful saves.
- Protocol prompts, approvals and extension configs cannot accidentally allow privileged Agent execution.

### Task 1: Complete M0 investigation and capability gates

**Files:** `packages/adapters/src/codex-rpc.ts`, `tests/desktop/codex-rpc.test.ts`, `scripts/m0-*.mjs`, `docs/adr/0002-m0-validation.md`, generated compatible protocol subset in `packages/adapters/src/codex-protocol/` as needed.
**Interfaces:** bounded stdio `CodexRpc.request(method, params)` / notifications / explicit approval replies / close; reports contain status, version, time and redacted evidence only.

- [ ] Write fake-process protocol tests for correlation, notifications, pending server requests, invalid input, timeout, cancellation and child exit; see red before implementation.
- [ ] Inspect generated 0.154.0 schema/config and official docs; run real account/model/config/history/interrupt/approval/resume probes against a newly-created test thread, not existing conversations.
- [ ] Run real sandbox read/write/network/socket and Git worktree/common-dir tests using only fixture sentinels. Record actual restrictions and keep unsupported execution disabled.
- [ ] Verify GitHub identity/auth route and read-only repository/check metadata, Keychain fixture write/read/delete/missing behavior, and actual packaged cold start/upgrade without network/system Node.
- [ ] Record complete gate matrix, evidence, supported version and remaining external limitations; commit M0 results before M1 implementation.

### Task 2: Task contracts and domain rules

**Files:** `packages/contracts/src/tasks.ts`, `packages/core/src/task-policy.ts`, `tests/desktop/task-policy.test.ts`.
**Interfaces:** task DTOs include allowedActions/reasons, revisions, dependencies and parent summary. Explicit commands create/update/move/start-manual/accept/cancel/archive; no arbitrary status write. Project settings include name/description and validated repository metadata.

- [ ] Write failing boundary/state tests including forbidden CODE Done/Start, invalid create state, dependency cycle/cross-project/group endpoints, one-level parent rules, group completion and no reopen.
- [ ] Implement pure policies and strict Zod commands; map unavailable execution to disabled reasons.
- [ ] Run targeted tests, then full suite.

### Task 3: Durable M1 application commands

**Files:** `packages/local-db/prisma/schema.prisma`, new immutable migration, `packages/local-db/src/task-store.ts`, Core ports/service, `tests/desktop/tasks.test.ts`.
**Interfaces:** Store provides projectBoard, taskDetail, create/update/transition/reorder/archive and project settings commands; all writes include optimistic concurrency, receipts and event history in one transaction.

- [ ] Write failing real SQLite tests for complete M1 flow, multi-project numbering, transactional revisions/activity, parent versions, concurrent cycle insertion, replay, sorting and restart persistence.
- [ ] Generate/review new Prisma migration; preserve foundation DBs and backups.
- [ ] Implement same-project FKs/uniqueness, ordered dependency/parent checks and version bumps; group summaries recompute transactionally.
- [ ] Run all tests; verify upgrade from initial schema preserves projects/settings/tasks; commit storage/Core deliverable.

### Task 4: Board, details, project settings and environment diagnostics

**Files:** `apps/desktop/src/renderer/{App,Board,TaskDetail,ProjectSettings}.tsx`, focused form/hooks/components/styles; main/preload/contracts channels.
**Interfaces:** named bridge methods; board query snapshots plus event cursor; refetch after mutations/reconnect; drafts retained on error/conflict; Core controls allowed actions.

- [ ] Add failing user-facing tests for create/edit, keyboard status/sort, dependency errors, MANUAL/GROUP completion, filtering, archive, settings save and restart.
- [ ] Implement selectable projects, fixed columns, title/search/priority/label/group/status filtering, ordered cards and drag-equivalent menu actions.
- [ ] Implement detail Markdown source editing/preview, acceptance, dependencies, group membership/progress, revision/activity history, disabled CODE execution reason and terminal states.
- [ ] Provide project basic/settings skeleton, saved effective environment results and repair controls; expose only implemented settings. Ensure first-launch checks can be skipped and offline management remains usable.
- [ ] Verify dirty navigation/close, IME, focus, long input, empty/no-match, narrow window and large font behavior.

### Task 5: Complete M1 acceptance and review

**Files:** desktop acceptance tests, README/spec status, ADR evidence, PR description.

- [ ] Run full unit/integration/UI suite, lint/format/typecheck/build and actual packaged upgrade/restart smoke.
- [ ] Exercise A01/A03/A05/A20/A31–A34/A36/A38/A39 within M1 scope; record exact later-stage exclusions.
- [ ] Run one independent whole-change review; fix important findings with regression tests.
- [ ] Commit, push current PR branch, update PR around final M0/M1 scope and report any remaining failed M0 execution gates without claiming M2 readiness.
