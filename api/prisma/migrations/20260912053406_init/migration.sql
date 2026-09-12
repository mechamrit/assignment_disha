-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EndReason" AS ENUM ('FAILED', 'MAX_ROUNDS', 'QUIT', 'DISCONNECTED', 'IDLE_TIMEOUT', 'EXPIRED', 'CLIENT_END');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('CREATED', 'AWAITING_ANSWER', 'EVALUATED');

-- CreateEnum
CREATE TYPE "RoundOutcome" AS ENUM ('PASS', 'FAIL', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "ResponseKind" AS ENUM ('ANSWER', 'TIMEOUT', 'GIVE_UP', 'COMMAND', 'CHATTER', 'INTERRUPTION');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'HARD');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
    "score" INTEGER NOT NULL DEFAULT 0,
    "roundsCleared" INTEGER NOT NULL DEFAULT 0,
    "strikes" INTEGER NOT NULL DEFAULT 0,
    "maxStrikes" INTEGER NOT NULL,
    "maxRounds" INTEGER NOT NULL,
    "currentRoundNumber" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "clientTokenHash" TEXT NOT NULL,
    "botInstanceId" TEXT,
    "endReason" "EndReason",
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "sequence" TEXT[],
    "difficulty" "Difficulty" NOT NULL,
    "separator" TEXT NOT NULL DEFAULT '. ',
    "status" "RoundStatus" NOT NULL DEFAULT 'CREATED',
    "outcome" "RoundOutcome",
    "repeats" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "presentedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "acceptedResponseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "attemptSeq" INTEGER NOT NULL,
    "kind" "ResponseKind" NOT NULL,
    "transcriptRaw" TEXT NOT NULL,
    "normalizedTokens" TEXT[],
    "vocabTokens" TEXT[],
    "isCorrect" BOOLEAN,
    "idempotencyKey" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "botInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_nameKey_key" ON "Player"("nameKey");

-- CreateIndex
CREATE INDEX "GameSession_status_lastActivityAt_idx" ON "GameSession"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "GameSession_playerId_createdAt_idx" ON "GameSession"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "GameSession_status_score_idx" ON "GameSession"("status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Round_acceptedResponseId_key" ON "Round"("acceptedResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_sessionId_number_key" ON "Round"("sessionId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Response_idempotencyKey_key" ON "Response"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Response_roundId_attemptSeq_key" ON "Response"("roundId", "attemptSeq");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_createdAt_idx" ON "SessionEvent"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_acceptedResponseId_fkey" FOREIGN KEY ("acceptedResponseId") REFERENCES "Response"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
