---
name: resume
description: Re-establish context at the start of a session. Reads docs/STATE.md, checks git and service state, and restates the next action before any code is touched.
---

# Resume

Edit nothing until step 5 is done.

1. Read `docs/STATE.md`: milestone, Next action, Blocked.
2. Read that milestone's row in the Milestones table of `docs/PLAN.md`.
3. Repo state: `git status --short` and `git log --oneline -5`.
4. Services the milestone needs: `docker compose ps`; if the API should be running, `curl -s http://localhost:4000/health`.
5. Reply in at most six lines: milestone, definition of done, next action, blockers, and any disagreement between `docs/STATE.md` and steps 3 and 4 (for example uncommitted changes the ledger does not mention). If they disagree, ask before proceeding.
