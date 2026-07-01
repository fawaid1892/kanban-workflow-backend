import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class CacheService {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs = 60_000;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
