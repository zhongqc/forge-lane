# ADR 0001 — Desktop foundation runtime

Date: 2026-11-25. Status: first implementation; complete M0 acceptance remains open.

## Scope

This increment delivers the desktop foundation, project persistence, versioned UI/tool settings, environment version probes and a local health socket. It retires tracked legacy server/web/database/deployment sources, using the archived tag as the historical reference. It does not implement the task board, authorization workflow, Codex model runs, PR delivery, secret storage or manual backup/restore UI.

## Runtime decision

Keep Electron with a plain TypeScript Core. Both Electron and Tauri can reuse React; Tauri with a Node sidecar is a viable alternative and does not require a Rust business core. Electron is selected to reduce the number of runtimes and process/packaging integrations in the first delivery. The local unpacked development app occupies approximately 621 MiB; no comparative memory/startup benchmark has been run. Tauri remains relevant if footprint becomes a hard requirement.

Pinned versions:

| Component                 | Version | Evidence / constraint                               |
| ------------------------- | ------- | --------------------------------------------------- |
| Electron                  | 45.5.0  | macOS arm64 runtime                                 |
| electron-vite             | 6.0.0   | main, preload and renderer build                    |
| electron-builder          | 26.18.0 | local arm64 app; no publishing                      |
| Prisma CLI/client/adapter | 7.10.0  | same version, SQLite from a new schema              |
| better-sqlite3            | 13.2.0  | explicit override of adapter's `^12.6.0` dependency |
| React                     | 19.3.0  | existing renderer baseline                          |
| Vite                      | 7.1.7   | compatible build baseline                           |
| Zod                       | 4.6.7   | strict cross-process contracts                      |

The adapter's original better-sqlite3 12.6.0 and the available 12.11.1 release both failed to compile against Electron 45 V8 (`GetPrototypeV2` / callback API changes). Version 13.2.0 uses Node-API and loads on the actual Electron runtime. An explicit PNPM override ensures maintenance operations and Prisma load the same driver. This is outside the adapter's declared dependency range: the supported combination is this exact lockfile, not a claim of upstream certification. Retest migrations, transactions, binding and backups before updating any part. No ORM switch or custom migration executor was introduced.

## Official migrations

1. A dedicated migration utility process inspects checksums/history and refuses unknown, failed or inconsistent schemas. Existing data is backed up before pending migrations.
2. On this Prisma 7.10 target, an absent SQLite file produces an empty schema-engine error. Exclusively creating an empty file (`wx`, owner-only) before the official migration resolves this. This creates no tables or migration records and never truncates an existing file.
3. A utility process parent port stays alive after a successful CLI invocation. The migration host therefore launches the bundled Electron executable with `ELECTRON_RUN_AS_NODE=1`, passing the installed official Prisma CLI bin and its explicit config. Completion is the real CLI process exit, not a parsed success line or database polling. No system Node, npx, network fetch or private Prisma API is used.
4. The main process tracks the migration CLI's newly created process group. Cancellation reaps that group before stopping its utility host; failures preserve storage and diagnostics. Core starts only after migration completion and a second history check.
5. All Prisma adapter connections receive foreign_keys=ON, journal_mode=WAL and busy_timeout=5000. Business writes, version checks, mutation receipts and activity records commit together.

## Trust and lifecycle

Renderer is sandboxed, has context isolation, no Node, a narrow preload, trusted-top-frame IPC checks and denied navigation/new windows/permissions. Only development CSP permits the React refresh preamble and local HMR sockets. Manually typed executable paths require a native confirmation; native picker selections are already explicit. Child tool probes use an allowlisted environment and explicit cwd, so ambient Git overrides or unrelated secrets do not leak into probes.

Until scoped terminal grants exist, the local socket returns health only. An owner-only socket does not replace an application capability; project/settings snapshots are deliberately unavailable over CLI. Runtime socket paths use an owned private directory with a hash of the canonical data path, supporting long and multibyte home directories.

Main confirms renderer close before shutting down Core. Core can restart once after an unexpected exit in this foundation increment, which has no external execution operations to reconcile. Future Agent operations must add the spec's process/external-effect reconciliation before enabling execution.

## Verification and remaining gates

Automated checks cover strict input validation; mutation replay after repository relocation; stale writes; persistence; actual official first/repeated/upgrade/failed migrations; WAL backups; connection PRAGMAs; corrupt/newer history refusal; real Git/worktree identity; ambient environment isolation; subprocess timeout/output/cancellation; health-only Unix socket and long paths; native executable authorization.

Desktop smoke covers a clean temporary data directory with PATH restricted to `/usr/bin:/bin`, persisted settings/projects after restart, renderer Node isolation, denied navigation, Core crash recovery, cancelled Quit preserving edits/Core, corrupt-storage maintenance, and development URL/CSP. Local verification completed on 2026-11-26: 16 foundation tests, 3 development desktop scenarios, and 2 packaged desktop scenarios passed (development-only scenario skipped for the package). Packaged and development results are recorded in the plan's completion evidence; generated screenshots are in `test-results/`.

Not yet verified: clean physical-machine installation, read-only/offline network isolation beyond restricted PATH, signed/notarized DMG, supported Codex authentication/model/history/approval/interrupt/recovery/sandbox probes, GitHub identity flow, Keychain, log rotation, manual backup/restore UI, full M1–M4 acceptance. No model call, real PR, push or external account change was performed. These are remaining work, not passed gates. Default Electron icon and unpacked package are development packaging choices, not a release-ready design.

## References

- [Tauri Node sidecar](https://v2.tauri.app/learn/sidecar-nodejs/) and [Electron utility process](https://www.electronjs.org/docs/latest/api/utility-process).
- [better-sqlite3 releases](https://github.com/WiseLibs/better-sqlite3/releases): v13 Node-API packaging; actual compatibility is verified by the tests above.
- [GitHub hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): CI uses the standard macOS 15 arm64 runner. CI configuration has been prepared but has not been run remotely.
