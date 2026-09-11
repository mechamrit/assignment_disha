# Kickoff

The spec for this repo is `docs/PLAN.md`. Every Claude Code session here starts with empty context, so the prompts below are the whole handoff. Launch sessions with this folder as the working directory.

## Prerequisites (once)

```bash
node -v            # 20.x (nvm use 20)
uv --version       # any recent
docker compose version
```

Keys to have ready: `DEEPGRAM_API_KEY`, `GOOGLE_API_KEY` (Gemini). Optional: `GROQ_API_KEY`, `OPENAI_API_KEY`.

Open a session in this folder (desktop app: New session, pick this folder; terminal: `cd` here and run `claude`). Run `/context` once. Until M0 creates the repo's own files, only `~/.claude/CLAUDE.md` should be listed under memory files.

## First session: milestone M0

Paste exactly:

```text
Read docs/PLAN.md in full before doing anything. It is the approved spec for this repo; follow it, do not redesign.
Execute milestone M0 exactly as its row specifies, including the Claude Code layer: CLAUDE.md (≤120 lines, outline in the plan), .claude/settings.json (permissions + hooks), .claude/rules/{api,voice-bot,web,contracts}.md with paths frontmatter, .claude/skills/{run-stack,verify-milestone,resume}/SKILL.md, .claude/agents/plan-reviewer.md, docs/STATE.md.
Pins: pipecat-ai==1.9.0, NestJS 11 + Fastify, Prisma + PostgreSQL 16, Redis 7, npm workspaces (api, web), uv for voice-bot, Node 20.
Verify the M0 definition of done with real commands, fill docs/STATE.md, commit as "feat(m0): scaffold", then stop. Do not start M1.
```

## Every later session: milestones M1 to M9

Use `/resume` (created in M0), or paste:

```text
Read docs/STATE.md, then docs/PLAN.md. Continue from "Next action" for milestone M<n>. Verify that milestone's definition of done with real commands, update docs/STATE.md, commit "feat(m<n>): …", stop.
```

Rules of the loop:
- One milestone per session. `/clear` between milestones. `/rename mcvb-m<n>` per session.
- Before marking a milestone done, run the `plan-reviewer` subagent on the diff against `docs/PLAN.md`. Fix gaps that affect correctness or stated requirements; ignore style-only findings.
- `docs/STATE.md` is rewritten in place and describes current state only. It is never a changelog.
- `make ci` must be green before every commit.
