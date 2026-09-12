/**
 * Identifier and token generation as a dependency, so tests can make both predictable.
 * `clientToken` is handed to the browser once and only its hash is stored.
 */
export interface IdPort {
  uuid(): string;
  clientToken(): string;
  hashToken(token: string): string;
  /** Constant-time comparison for secrets such as the internal API token. */
  safeEquals(a: string, b: string): boolean;
}

export const ID = Symbol('ID');
