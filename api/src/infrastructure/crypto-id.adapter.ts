import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IdPort } from '../application/ports/id.port';

/**
 * Identifiers and secrets. The client token is shown to the browser once; only its SHA-256 hash is
 * stored, so a database dump cannot be used to take over a session.
 */
@Injectable()
export class CryptoIdAdapter implements IdPort {
  uuid(): string {
    return randomUUID();
  }

  clientToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  safeEquals(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}
