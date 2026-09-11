# Developer entry points. `make help` lists targets.
SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose
BOT := voice-bot

# Recipe for a target whose inputs are not in the repo: names the missing file and the
# docs/PLAN.md milestone that delivers it, then fails. $(1) = path, $(2) = milestone.
define unavailable
@echo "make $@: requires $(1), delivered by milestone $(2) in docs/PLAN.md." >&2; exit 1
endef

.PHONY: help node-check install infra-up infra-down db-migrate api-dev bot-dev web-dev \
	contracts-emit contracts-check lint test build ci demo

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  %-16s %s\n", $$1, $$2}'

node-check:
	@node -e 'const m = Number(process.versions.node.split(".")[0]); if (m !== 20) { console.error("Node 20 required, found " + process.version + ". Run: nvm use"); process.exit(1); }'

install: node-check ## npm ci (api, web) and uv sync (voice-bot)
	npm ci
	uv sync --locked --project $(BOT)

infra-up: ## Start postgres and redis, wait until healthy
	$(COMPOSE) up -d --wait postgres redis

infra-down: ## Stop postgres and redis (volumes kept)
	$(COMPOSE) down

db-migrate: ## Apply Prisma migrations
	$(call unavailable,api/prisma/schema.prisma,M1)

api-dev: node-check ## API on :4000 with watch
	npm run start:dev -w api

bot-dev: ## Voice bot on :7860 (native SmallWebRTC runner)
	$(call unavailable,voice-bot/bot.py,M4)

web-dev: node-check ## Web UI on :5173
	npm run dev -w web

contracts-emit: ## Emit OpenAPI, regenerate web types and bot models
	$(call unavailable,api/scripts/emit-openapi.ts,M1)

contracts-check: ## Regenerate contracts and fail on git diff
	$(call unavailable,contracts/openapi.json,M1)

lint: node-check ## ESLint and tsc (api, web), ruff (voice-bot)
	npm run lint -ws
	npm run typecheck -ws
	cd $(BOT) && uv run --locked ruff check .
	cd $(BOT) && uv run --locked ruff format --check .

test: node-check ## jest (api), vitest (web), pytest (voice-bot)
	npm run test -ws
	cd $(BOT) && uv run --locked pytest

build: node-check ## Build api and web
	npm run build -ws

ci: lint test build ## Everything the CI workflow runs

demo: ## Guided demo run
	$(call unavailable,docs/DEMO-SCRIPT.md,M9)
