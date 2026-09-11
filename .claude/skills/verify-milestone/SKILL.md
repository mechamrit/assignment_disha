---
name: verify-milestone
description: Verify one milestone's definition of done from docs/PLAN.md with real commands, then write the result and the next action into docs/STATE.md.
argument-hint: "M<n>"
---

# Verify milestone $ARGUMENTS

1. Read the `$ARGUMENTS` row of the Milestones table in `docs/PLAN.md` and every plan section it relies on. Split its definition of done into numbered clauses.
2. For each clause, run the command that proves it: tests, `curl`, `psql`, `redis-cli`, `docker compose ps`, or the browser preview for UI. Keep the shortest decisive output line. A clause with no real command output is unverified, not passed.
3. Run `make ci`.
4. Run the `plan-reviewer` subagent for `$ARGUMENTS`. Fix findings that affect correctness or a stated requirement, then re-run the checks they touch.
5. Rewrite `docs/STATE.md` in place, 60 lines max, current state only, in this format:

   ```
   Milestone: <Mn in progress | Mn done>        Done: M0 <sha> · M1 <sha>
   Now: <what is true right now>
   Next action: <one concrete step>
   Blocked: <none | what, and who unblocks it>
   Last verified: <checks and results, at <sha> or working tree>
   Env: <keys and local setup the next session needs>
   ```

6. Reply with a table of clause, command, and result (pass, fail, or unverified). The milestone is done only when every clause passes and `make ci` is green.
