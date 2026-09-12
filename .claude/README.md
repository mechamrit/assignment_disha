# Claude Code setup

How this repository configures Claude Code. Launch sessions from the repo root; everything below is read from there.

## What loads, and when

| File | Loads | Purpose |
|---|---|---|
| `CLAUDE.md` | Every session start | Commands, layout, invariants, workflow, gotchas |
| `docs/STATE.md` | Every session start (imported by `CLAUDE.md`) | Milestone ledger: now, next action, blockers, last verification |
| `CLAUDE.local.md` | Every session start; gitignored | Notes about your own machine |
| `.claude/rules/*.md` | When Claude reads a file matching the rule's `paths:` | Conventions for `api`, `voice-bot`, `web`, `contracts` |
| `.claude/skills/*/SKILL.md` | Description at start, full text when invoked | Session workflows (below) |
| `.claude/agents/plan-reviewer.md` | When invoked | Fresh-context review against `docs/PLAN.md` |

Module READMEs are written for people and are not loaded automatically.

## Permissions (`settings.json`)

Allowed without a prompt:
- `make`, `npm run`, `npm test`, `docker compose ps`, `docker compose up -d`, `git status`, `git diff`
- `uv run pytest` and `uv run ruff` (with or without `--locked`)
- the three exact `curl` health checks the skills run (API `/health`, bot `/client/`, web `/`)

`uv run` and `curl` are allowed only with a specific inner command. `uv run <anything>` executes any program, and a pattern such as `curl -s http://localhost*` also matches `http://localhost@other.host`, which sends the request elsewhere. This allow list is narrower than the one sketched in `docs/PLAN.md` for that reason.

Denied: `rm -rf` and `rm -fr`, force pushes, `prisma migrate reset`, `docker compose down -v`, and reading any `.env` or `.env.local` file (they hold provider keys). Bash deny rules match the command text Claude writes, so they are a guard rail, not a security boundary.

Claude Code applies the allow list only after the workspace trust dialog has been accepted once in an interactive session. Hooks and deny rules apply either way. Personal overrides go in `.claude/settings.local.json` (gitignored).

## Hooks (`settings.json`, scripts in `hooks/`)

- **PostToolUse, `format-file.sh`.** After every Edit or Write it formats that file: `.ts` and `.mjs` in `api/`, and `.ts`, `.tsx`, and `.js` in `web/`, through `eslint --fix` (Prettier runs inside ESLint); `.py` in `voice-bot/` through `ruff format` and `ruff check --fix`. Generated contract files are skipped. It needs `jq` and installed dependencies (`make install`), and it never blocks an edit.
- **Stop, `state-reminder.sh`.** When the working tree has uncommitted changes outside `docs/` and outside Markdown files, and `docs/STATE.md` is not among the changes, it shows a reminder to update the ledger. Advisory only.

## Skills and agent

| Invoke | Does |
|---|---|
| `/resume` | Reads `docs/STATE.md`, the milestone row, git state, and service health, then restates the next action before any edit |
| `/verify-milestone M<n>` | Proves each definition-of-done clause with a real command, runs `make ci` and the reviewer, rewrites `docs/STATE.md` |
| `/run-stack` | Starts infra, API, bot, and web and health-checks each. Invoked by you only, never by Claude on its own |
| `plan-reviewer` subagent | Reports gaps between the repository and `docs/PLAN.md` for one milestone |

## Session loop

1. Launch from the repo root and run `/resume`.
2. Work the next action from `docs/STATE.md`.
3. Run `/verify-milestone M<n>` and fix what it reports.
4. Commit `feat(m<n>): <summary>` with `make ci` green, then `/clear` before the next milestone.

## Browser preview

`launch.json` defines `web` (Vite on 5173) and `api` (Nest watch mode on 4000) for the preview pane of the Claude desktop app, which reads it only in sessions launched from the repo root. Each command sources nvm when it is installed and runs `make node-check` before starting, so a wrong Node version stops with a clear message.
