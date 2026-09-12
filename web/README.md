# web

Player UI: Vite 8, React 18, TypeScript, Tailwind 3. It creates a session through the API, connects the microphone to the voice bot over Pipecat SmallWebRTC, and renders the game. RTVI `game_state` messages from the bot update the screen immediately; when they disagree with the polled `GET /sessions/:id` view, the API view wins.

Screens and client wiring are specified under "Web" in `docs/PLAN.md`.

## Commands

From the repo root, after `nvm use`:

| Command | Does |
|---|---|
| `make web-dev` | Dev server on http://localhost:5173 with hot module replacement; fails if the port is taken |
| `npm run test -w web` | Vitest and React Testing Library in jsdom |
| `npm run lint -w web` | ESLint (TypeScript, React hooks, React refresh, Prettier); any warning fails |
| `npm run typecheck -w web` | `tsc --noEmit` |
| `npm run build -w web` | Type-check, then build static assets into `dist/` |
| `npm run preview -w web` | Serve `dist/` on port 5173 |
| `docker compose --profile full up -d --build web` | Rebuild and run the nginx container on http://localhost:5173. Because `web` depends on `api`, this also builds and starts api, Postgres, and Redis |

## Files

| Path | Role |
|---|---|
| `index.html` | HTML shell that mounts `#root` |
| `src/main.tsx` | Creates the React root in `StrictMode` |
| `src/App.tsx` | Top-level screen |
| `src/App.test.tsx` | Renders `App` and checks the page heading |
| `src/styles.css` | Tailwind layers and the color token values |
| `tailwind.config.ts` | Maps token names to the CSS variables in `src/styles.css` |
| `vite.config.ts` | React plugin, PostCSS (Tailwind, autoprefixer), strict dev and preview port, Vitest environment |
| `eslint.config.js` | Lint rules |
| `Dockerfile` | Builds with Node 20, serves `dist/` from `nginx-unprivileged` as a non-root user on container port 8080 |
| `nginx.conf` | Container config: SPA fallback to `index.html`, `no-cache` on `index.html`, one-year immutable cache on hashed assets |

Feature code goes under `src/features/` (`session`, `game`, `leaderboard`) and shared code under `src/shared/` (`api`, `pipecat`, `ui`), as laid out in `docs/PLAN.md`. API request and response types come only from the generated `src/shared/api/schema.d.ts`; never write them by hand.

## Styling

Use the color tokens, never raw hex values or arbitrary color classes:

| Token | Classes | Use |
|---|---|---|
| `surface` | `bg-surface` | Page and card background |
| `ink` | `text-ink` | Primary text |
| `muted` | `text-muted` | Secondary text |
| `accent` | `bg-accent`, `text-accent` | Primary action and highlights |

Token values live in `src/styles.css`, and opacity modifiers work (`bg-accent/10`). Copy stays minimal: at most one helper line per screen, no em dashes.

## Configuration

Vite reads `VITE_*` variables at build time through `import.meta.env`, so a Docker image has them baked in (compose passes them as build args). For local overrides copy `web/.env.example` to `web/.env.local`.

| Variable | Meaning |
|---|---|
| `VITE_API_BASE_URL` | API base URL (http://localhost:4000) |
| `VITE_BOT_OFFER_URL` | Bot runner WebRTC offer endpoint (http://localhost:7860/api/offer) |
| `VITE_POLL_MS` | Session polling interval while a game is running |

No code in this tree reads these variables.
