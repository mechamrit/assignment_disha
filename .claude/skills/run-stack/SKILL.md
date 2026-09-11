---
name: run-stack
description: Start the local stack (postgres, redis, API, voice bot, web) and health-check each part.
disable-model-invocation: true
---

# Run the stack

Work from the repo root, after `nvm use`.

1. Infra: `make infra-up`, then `docker compose ps` shows postgres and redis as `(healthy)`.
2. Migrations: `make db-migrate`.
3. Start each app as a background process, one at a time, and check it before starting the next:
   - API: `make api-dev`, then `curl -s http://localhost:4000/health` returns HTTP 200 with `"redis":"ok"`.
   - Bot: `make bot-dev`, then `curl -s -o /dev/null -w '%{http_code}' http://localhost:7860/client/` prints `200`.
   - Web: `make web-dev`, then `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` prints `200`.
4. Report a table: component, command, check, result.

Rules:
- A target that prints `requires <file>, delivered by milestone M<n>` means that component is not built. Record it as not built and continue with the rest; never create the missing file here.
- If a port is taken, report the owner (`lsof -nP -iTCP:<port> -sTCP:LISTEN`) and stop. Never kill a process this skill did not start.
- The bot needs `voice-bot/.env` with `DEEPGRAM_API_KEY`. An LLM key is optional: without one the host runs scripted.
