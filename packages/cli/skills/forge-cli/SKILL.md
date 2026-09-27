---
name: forge-cli
description: Use when a user wants to inspect or change Forge Lane projects, issues, comments, task runs, or CLI configuration through the forge command. For local coding work on a Forge Lane issue, also follow the claim and run reporting workflow below.
---

# Forge Lane CLI

Use `forge` to work with Forge Lane through its API. In the Forge Lane source repository, use `pnpm forge` if `forge` is not installed. Run `forge --help` or `forge <command> --help` for the current flags, and add `--json` when parsing output. Do not read or print the CLI config or token. If authentication is missing, ask the user to run `forge login` in their terminal; passwords and tokens must not appear in command arguments, task text, or logs.

## Find the right command

| Need                     | Commands                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Check access or defaults | `whoami`, `project list`, `project show`, `config show`                                                                |
| Discover valid values    | `status list`, `member list`, `label list`, `sprint list`                                                              |
| Find and read work       | `issue list`, `issue show`, `issue context`, `issue comments`, `issue history`, `issue revisions`, `issue development` |
| Edit work                | `issue create`, `issue update`, `issue transition`, `issue assign`, `issue comment`                                    |
| Execute an issue locally | `issue claim`, `run show`, `run renew`, `run finish`, `issue release`, `run list`                                      |
| Manage authentication    | `login`, `logout`, `token list`, `token revoke`, `config set`                                                          |

Use the project key or issue key supplied by the user. If they did not supply one, use `project list` or `issue list` to locate it; clarify if more than one candidate remains. Statuses, members, labels, and sprints require an exact name or ID. Read the relevant list before choosing a value. A repeated name requires its ID. Read an issue's current `version` and pass `--if-version` on updates, transitions, assignments, and claims.

`issue list` defaults to 100 results and reports `nextOffset`; use `--all` or `--offset` for more. `issue history` and `run list` use cursors and also support `--all`. `issue context` is a compact view: it includes the issue, parent/Epic, recent comments and activity, statuses, repositories, development links, and executions. Use the dedicated history, comments, revisions, or development commands when older or more detailed data is needed.

## Make changes

For descriptions, comments, and run summaries, write the intended Markdown to a local file and pass `--description-file`, `--body-file`, or `--summary-file`. `-` reads stdin. Do not interpolate issue text into shell command syntax. Perform only the requested change; viewing or editing an issue does not imply permission to assign it, transition it, revoke a token, or claim an execution.

On exit code 6, reread the issue or run and reconsider the change against the new state. Do not simply retry with a fresh version. For an uncertain network write, inspect server state before retrying; reuse the returned idempotency key only with the identical command, arguments, and file content. CLI write requests are cached locally for this purpose. Do not switch identity or project scope to bypass an access denial.

## Local coding workflow

When asked to implement a Forge Lane issue:

1. Read `forge issue context KEY --json` and the selected repository's instructions. Resolve ambiguity before dependent changes.
2. Claim the requested issue with `forge issue claim KEY --executor codex --if-version ISSUE_VERSION --json`. Save the returned run ID and lease expiry. If another execution holds the lease, stop acquisition and report the conflict.
3. Implement and test in the user's selected local repository. A claim does not assign the issue or change its workflow status. Include the issue key in a branch or PR when relevant for GitHub linkage.
4. Renew before expiry with `forge run renew RUN_ID --json` (default lease: 30 minutes). If the lease expires, check ownership before reporting a result; never infer ownership from local files.
5. Finish the run with a Markdown summary of changes, tests, and remaining risks: `forge run finish RUN_ID --outcome succeeded --summary-file result.md --json`. Use `failed` or `cancelled` for the actual outcome, and `--pr-url URL` only when a PR exists. Finishing does not mark the issue Done. Transition status only when the user requested it or an established project policy applies.

The CLI does not start a coding agent, push code, create a PR, or operate on a repository for you. A PR URL in `run finish` records the result; development links are synchronized separately through the configured GitHub integration.
