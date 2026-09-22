---
name: forge-task
description: Use when the user asks to work on a Forge Lane issue using the forge CLI, including reading context, claiming work, implementing, and reporting results.
---

# Forge Lane task workflow

Use `forge --help` and `<command> --help` to discover commands. Use `--json` for machine-readable results. Credentials are configured outside the task; never read or print the CLI config or tokens. If unauthenticated, ask the user to run `forge login` in their terminal.

1. Read `forge issue context KEY --json`. Read the full description, related parent/Epic, comments, history, and repository instructions. If a requirement is ambiguous, clarify before making dependent changes.
2. Claim explicitly requested work: `forge issue claim KEY --executor codex --if-version ISSUE_VERSION --json`. Save returned run ID and lease expiry. Conflict means another execution owns the task; do not bypass it or automatically take different work.
3. Work in the user's selected repository and an isolated branch/worktree. Follow its AGENTS.md and test commands. Include the Issue key in the branch/PR to enable GitHub linkage. A claim does not authorize extra repositories or elevated operations.
4. Renew with `forge run renew RUN_ID --json` before lease expiry (default 30 minutes). If the lease expires, stop publishing/results writes until ownership is recovered. Never assume ownership from a local file.
5. Keep progress useful and concise. `forge issue comment KEY --body-file /path/progress.md --json` can report meaningful milestones. File arguments can use `-` for stdin, but do not interpolate untrusted issue text into shell command syntax.
6. Implement and verify the requested change. Create a PR only when authorized by the user's task. The platform does not grant push/merge permissions automatically.
7. Write a result Markdown file with changes, tests, risks and PR link. Finish via `forge run finish RUN_ID --outcome succeeded --summary-file /path/result.md --pr-url https://github.com/OWNER/REPO/pull/123 --json`. Omit --pr-url if no PR. For failed/cancelled work report the real outcome. Finishing a run does not mark the Issue Done.
8. Change workflow status only when explicitly requested or established project policy applies, using `forge issue transition KEY --to STATUS --if-version CURRENT_VERSION --json`.

On version conflict, reread and reconsider; do not blindly overwrite with a fetched newer version. For uncertain network writes, reuse the idempotency key from the error only with the same command/body; inspect the server state first. Do not auto-retry acquisition endlessly. Respect project scope and permissions; never switch identities to bypass a denial.
