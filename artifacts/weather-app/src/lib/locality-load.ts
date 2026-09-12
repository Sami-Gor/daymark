/*
 * Loads the static global locality index with Cache Storage when available.
 *
 * Works in both the window and a Web Worker (no DOM APIs). The dataset URL is
 * identical for every user and contains no location information; only this
 * static file is cached, never coordinates or lookup results.
 */
import type { LocalityIndex } from './locality-lookup';

export async function loadLocalityIndexData(url: string, cacheName: string): Promise<LocalityIndex | null> {
  let response: Response | null = null;
  let cache: Cache | null = null;
  try {
    if (typeof caches !== 'undefined') {
      cache = await caches.open(cacheName);
      response = (await cache.match(url)) ?? null;
    }
  } catch {
    cache = null;
  }

  try {
    if (!response) {
      response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) return null;
      const forCache = response.clone();
      if (cache) {
        // Best-effort: caching must never break the lookup.
        void cache.put(url, forCache).catch(() => {});
      }
    }
    const payload = (await response.json()) as LocalityIndex;
    if (!payload || !Array.isArray(payload.records) || typeof payload.cellSize !== 'number' || typeof payload.cells !== 'object') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Deletes locality caches from older dataset versions (best-effort). */
export async function pruneLocalityCaches(currentCacheName: string, prefix: string): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== currentCacheName).map((key) => caches.delete(key)));
  } catch {
    // Cache cleanup is optional.
  }
}
