/**
 * Typed access to an injected response body. `inject().json()` is `any`, which the type-aware
 * lint rules reject for good reason; one cast here keeps every assertion in the suites typed.
 */
export function body<T>(response: { json: () => unknown }): T {
  return response.json() as T;
}

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CreateSessionBody {
  sessionId: string;
  clientToken: string;
  player: { id: string; name: string };
  status: string;
  bot: { offerUrl: string };
  config: { maxStrikes: number; maxRounds: number };
}

export interface SessionViewBody {
  id: string;
  player: { name: string };
  status: string;
  score: number;
  roundsCleared: number;
  strikes: number;
  maxStrikes: number;
  maxRounds: number;
  currentRound: { number: number; length: number; status: string; repeats: number } | null;
  lastRound: {
    number: number;
    sequence: string[];
    heard: string[];
    outcome: string;
    pointsAwarded: number;
  } | null;
  endReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}

export interface AttachBody {
  session: SessionViewBody;
  vocabulary: { keyterms: string[]; fillers: string[] };
  config: {
    maxStrikes: number;
    maxRounds: number;
    ladder: { baseLength: number; maxLength: number; hardFromRound: number };
    answerIdleSecs: number;
  };
  currentRound: {
    id: string;
    number: number;
    sequence: string[];
    separator: string;
    status: string;
    repeats: number;
  } | null;
}

export interface OpenApiBody {
  paths: Record<string, unknown>;
}
