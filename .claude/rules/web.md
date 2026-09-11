---
paths:
  - "web/**"
---

# web rules

- API types come only from the generated `src/shared/api/schema.d.ts`, and the RTVI `game_state` type is generated from `contracts/rtvi/game-state.schema.json`. Never hand-write request, response, or message types.
- `GET /sessions/:id` is truth. RTVI `server-message` updates render immediately; the polled API view wins on conflict.
- Pipecat client: `new PipecatClient({ transport: new SmallWebRTCTransport({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }), enableMic: true, enableCam: false, callbacks })`, connected with `client.connect({ webrtcRequestParams: { endpoint: VITE_BOT_OFFER_URL, requestData: { sessionId, clientToken } } })`.
- Ending a game: `sendClientRequest("end_game")`, falling back to `POST /sessions/:id/end` with `X-Client-Token`.
- Styling: Tailwind classes built on the tokens in `tailwind.config.ts` (`surface`, `ink`, `muted`, `accent`; values in `src/styles.css`). No raw hex values and no arbitrary color classes.
- Copy: minimal microcopy, at most one helper line per screen, no em dashes.
- Env: read `import.meta.env.VITE_*` only, and add every new key to `web/.env.example`.
- Check every UI change visually in the browser preview (`make web-dev`) before committing.
- Tests: `npm run test -w web` (Vitest, React Testing Library, jsdom).
