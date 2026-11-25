# Forge Desktop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the first runnable desktop increment: an offline SQLite-backed workspace, a typed utility-process boundary, local read-only CLI, and repeatable packaged-runtime checks.

**Architecture:** Electron main owns the window and single instance; a utility process owns a plain TypeScript Core and the sole Prisma connection. A separate utility process runs the bundled official Prisma CLI before Core starts. Renderer and local CLI only invoke validated contracts.

**Tech Stack:** Electron, electron-vite, electron-builder, React, TypeScript, Zod, SQLite, Prisma 7.10, better-sqlite3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-forge-desktop-design.md` (0.3.3).

## Global Constraints

- 首版仅交付 macOS Apple Silicon；普通用户的执行授权、权限放行和 Merge 仅通过桌面端操作。
- New SQLite only; never read repository `.env` or connect to the old PostgreSQL deployment.
- Core does not import Electron or Prisma types. Renderer has no Node access.
- Official offline Prisma `migrate deploy`; reject unknown/failed/changed migrations, preserve the original DB and backup before upgrades.
- External tool checks do not call models, run setup, push, or create PRs.
- M0 precedes automatic execution. This increment exposes no Start/Merge/Agent execution capability.
- Work in the already dedicated `codex/forge-desktop-spec` checkout. User authorized implementation; proceed inline without another plan-approval round.

## Review Focus

- Paths with spaces/non-ASCII and absent terminal PATH: migration and Git import must work without shell interpolation.
- Replayed requests and stale versions: never create duplicate projects or overwrite persisted settings.
- Unknown schema, failed migration, corrupt DB: maintenance mode preserves data, never silently resets.
- Child crash or malformed/oversized socket input: reject requests, release resources, keep UI responsive.
- Untrusted renderer/frame and local CLI requests: no arbitrary shell/IPC or desktop-only writes through the CLI.

## Scope and subsequent plans

This is a bounded first implementation of M0 plus the settings/project persistence needed to exercise it. Full M1 task board, dependencies and task revisions follow in a separate plan; M2–M4 Agent execution and delivery remain gated. Real model sandbox/approval/interrupt probes need a separately visible execution action and are not silently exercised by environment checks. Signing/notarization remains M5. Do not call M0 fully accepted until these remaining probes are recorded.

### Task 1: Local contracts and durable Core

**Files:** Create `packages/contracts/src/index.ts`, `packages/core/src/{ports,service}.ts`, `packages/local-db/{prisma/schema.prisma,prisma/migrations,prisma.config.ts,src/store.ts,src/maintenance.ts}`, `tests/desktop/core.test.ts`, `tests/desktop/storage.test.ts`; replace root workspace/TypeScript/test configuration.

**Interfaces:** `CoreService.execute(input: unknown): Promise<unknown>`; `Store.snapshot()`, `Store.createProject(input)`, `Store.saveSettings(input)`, `Store.close()`; JSON DTOs expose project list and versioned UI/tool settings. `inspectDatabase(path, migrations)` and `backupDatabase(path, destination)` protect migration startup.

- [x] Write failing tests for validation, project deduplication, stale settings versions, replayed mutation IDs and persistence after reopen.
- [x] Run `pnpm test`; expect missing implementation failures, then implement strict contracts and transactional Prisma Store/Core.
- [x] Generate the initial migration through Prisma, review its SQL and exercise official migrate deploy against a temporary DB.
- [x] Test all Prisma connection PRAGMAs, unknown/failed/changed migration refusal, consistent backup including WAL and preservation after reopen.
- [x] Run `pnpm test` and commit this deliverable when its tests pass.

### Task 2: Local adapters and scoped CLI

**Files:** Create `packages/adapters/src/{process,git,local-rpc}.ts`, replace `packages/cli/src/forge.mjs`, create `tests/desktop/adapters.test.ts`.

**Interfaces:** `runCommand(executable, argv, options)` returns bounded stdout/stderr and exit outcome with timeout; `inspectRepository(path, executable)` returns canonical commonDir/root; `startLocalServer(path)` returns async close; CLI only supports health queries; project snapshots await scoped grants in this increment.

- [x] Write failing real-process, temporary-Git and Unix-socket tests: timeout, nonzero exit, space/Chinese paths, repository/worktree deduplication, CLI mutation refusal, oversized malformed payload.
- [x] Implement spawn without shell, bounded output and cleanup, canonical Git import, owner-only local socket and versioned JSON-RPC framing.
- [x] Run `pnpm test` and commit after all tests pass.

### Task 3: Desktop and packaged migration path

**Files:** Create `apps/desktop/{src/main,src/preload,src/core-host,src/renderer,build}`, root `electron.vite.config.ts`, `electron-builder.yml`, `scripts/test.mjs`, `tests/desktop/desktop.spec.ts`.

**Interfaces:** Preload exposes named `snapshot`, `saveSettings`, `importProject`, `checkEnvironment`, `chooseRepository`, `chooseExecutable` methods only. Host forwards requests to Core; migration utility invokes official Prisma bin from staged resources and sends exit outcome. Main serves trusted top-frame callers only.

- [x] Add Playwright smoke scenarios that fail before desktop exists: launch, save/reload settings, import/reopen project, renderer Node isolation and rejected navigation.
- [x] Implement sandboxed renderer, strict CSP, navigation denial, single instance, Core lifecycle and startup maintenance errors. UI includes environment/settings/project home and makes this increment's limitations explicit.
- [x] Stage only fixed Prisma CLI dependencies/engine, schema/migrations and generated client resources; rebuild native driver for Electron; package an arm64 app.
- [x] Run actual packaged app with a fresh temporary userData and PATH without Node, repeat startup and verify persisted data; test rejected newer/corrupt schema and unavailable Core.
- [x] Run build/typecheck/lint/tests/smoke and commit.

### Task 4: Retire old runtime and record evidence

**Files:** Remove tracked old `apps/{web,server}`, `packages/{db,shared}` and old CLI/server tests, deployment files/scripts/workflows; update `README.md`, `.github/workflows/check.yml`, add `docs/adr/0001-desktop-runtime.md`.

- [x] Ensure old tag exists before retiring tracked source; preserve untracked files and all external deployments.
- [x] Make new CI run only desktop foundations, unit/integration tests and build; no automatic release/deploy.
- [x] Record exact dependency versions, actual results, known unverified M0 gates and run instructions. Correct the incomplete Tauri comparison without switching the chosen architecture.
- [x] Run all required checks and one independent whole-change review; fix important findings with regression tests.
- [x] Commit verified changes; leave branch local, with no merge, release or push.

## Implementation rulings

- Use the existing dedicated spec branch; no extra checkout. Cost: spec and implementation share this branch.
- Retire legacy tracked sources before dependency installation. Cost: this first increment replaces the old runtime before full M1 exists; legacy tag remains available.
- Commit the first runnable vertical slice together after all interfaces/package checks pass, rather than intermediate incomplete desktop commits.
- Use one root application manifest/build config and electron-builder's production dependency collector rather than a custom dependency staging copier. Cost: the unoptimized development app includes the Prisma CLI dependency tree.
- Pin better-sqlite3 13.2.0 with an explicit adapter override after 12.x ABI failures. Cost: outside upstream adapter's declared range; exact lockfile integration tests are required.
- Run the official migration CLI via bundled Electron Node mode under the migration utility, because in-process require did not end that utility. Cost: an extra short-lived managed process group.
- Defer CLI project snapshots until scoped query capabilities exist. Cost: CLI offers health only in this increment.

## Completion evidence

Independent review by `desktop_foundation_review` found development URL/CSP, tool-path authorization, migration child cleanup, receipt replay, environment leakage, socket length/grants, unsaved edits/quit and diagnostic-write handling issues. These were addressed; no review findings were intentionally deferred. Remaining M0 and M1–M5 scope is listed in ADR 0001.

Final check results (2026-11-26, local macOS arm64): Generated artifacts live in ignored `release/` and `test-results/`.

- `pnpm install --frozen-lockfile`: passed.
- `pnpm test`: 16 tests passed across 4 files, using Electron Node.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `git diff --check`: passed.
- `pnpm build`: passed. Upstream Zod pure-annotation comments emit non-fatal Rollup warnings.
- `pnpm test:desktop`: 3 passed (cold start/persistence/recovery/quit, corrupt DB maintenance, development renderer).
- Packaged `.app` desktop tests: 2 passed; development-only URL/CSP test intentionally skipped in packaged mode.
- arm64 `.app` generated in `release/mac-arm64/`; unsigned, unpacked, default Electron icon. No release/remote CI/deployment performed.
- Screenshot `test-results/desktop-settings.png` visually inspected: dark theme, labels, spacing, controls and scroll layout render correctly.
