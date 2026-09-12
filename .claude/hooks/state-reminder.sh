#!/usr/bin/env bash
# Stop hook (advisory): when the working tree has uncommitted changes outside docs/ and outside
# Markdown files, and docs/STATE.md is not among them, show a reminder to update the ledger.
# Never blocks stopping.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0
changes="$(git status --porcelain --untracked-files=all 2>/dev/null)" || exit 0
[[ -n "$changes" ]] || exit 0

# STATE.md already touched: nothing to remind.
grep -qE '^.. docs/STATE\.md$' <<<"$changes" && exit 0
# Only docs/ or Markdown files changed: nothing to remind.
grep -qvE '^.. (docs/|.*\.md$)' <<<"$changes" || exit 0

printf '%s\n' '{"systemMessage": "Code has uncommitted changes but docs/STATE.md does not. Update Now, Next action, and Last verified before ending the session."}'
exit 0
