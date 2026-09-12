# Architecture decision records

| ADR | Decision |
|---|---|
| [0001](0001-api-owns-game-truth.md) | The NestJS API owns game truth; the bot and the web UI are its clients |
| [0002](0002-deterministic-validation-no-llm.md) | Answer validation is deterministic domain code; the LLM only voices the host |
| [0003](0003-min-words-interruption-policy.md) | Two words interrupt a read-out; Smart Turn decides when an answer ends |
| [0004](0004-postgres-prisma-over-mongo.md) | PostgreSQL through Prisma is the store; Redis is a cache |
| [0005](0005-idempotency-layers.md) | Five layers stop an answer from being scored twice |
| [0006](0006-smallwebrtc-transport.md) | Pipecat SmallWebRTC carries browser audio |

## Adding a record

Follow the shape of the existing files: `# NNNN. Title`, a `Status:` line (`Proposed`, `Accepted`, or `Superseded by NNNN`), then Context, Decision, and Consequences. Number records sequentially and keep each to about a page. A record states the decision as it stands; when a decision changes, write a new record and set the old one's status to `Superseded by NNNN`. Add the new row to the table above.
