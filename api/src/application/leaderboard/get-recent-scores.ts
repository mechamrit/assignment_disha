import { Inject, Injectable } from '@nestjs/common';
import { CACHE, type CachePort } from '../ports/cache.port';
import type { RecentScore } from '../ports/records';
import { REPOSITORIES, type RepositoryBundle } from '../ports/unit-of-work.port';

/** The last finished games, newest first. Cache first, database when the cache is cold. */
@Injectable()
export class GetRecentScores {
  constructor(
    @Inject(REPOSITORIES) private readonly repos: RepositoryBundle,
    @Inject(CACHE) private readonly cache: CachePort,
  ) {}

  async execute(limit: number): Promise<RecentScore[]> {
    const cached = await this.cache.readRecentScores(limit);
    if (cached && cached.length > 0) return cached;

    return this.repos.sessions.recentScores(limit);
  }
}
