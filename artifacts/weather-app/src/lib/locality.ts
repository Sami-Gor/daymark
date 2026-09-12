/*
 * Offline locality naming for device location.
 *
 * The dataset is one static, versioned file served from Daymark's own origin
 * (never from a reverse-geocoding provider) and is cached after first use.
 * Parsing/index preparation runs in a Web Worker; if workers are unavailable
 * the same work falls back to the main thread. Every failure path resolves to
 * "no locality", so naming can never delay or break the weather flow.
 */
import { createLocalityLookup, type LocalityMatch } from './locality-lookup';
import { loadLocalityIndexData, pruneLocalityCaches } from './locality-load';

export type { LocalityMatch } from './locality-lookup';

export const LOCALITY_DATASET_VERSION = 'v1';
const CACHE_PREFIX = 'daymark-locality-';
const CACHE_NAME = `${CACHE_PREFIX}${LOCALITY_DATASET_VERSION}`;
export const LOCALITY_DATASET_URL = `${import.meta.env.BASE_URL}locality/localities-${LOCALITY_DATASET_VERSION}.json`;

type WorkerResponse = { type: 'ready'; ok: boolean } | { type: 'result'; id: number; match: LocalityMatch | null };

let ready = false;
let loadPromise: Promise<boolean> | null = null;
let worker: Worker | null = null;
let mainThreadLookup: ReturnType<typeof createLocalityLookup> | null = null;
let nextRequestId = 1;
const pending = new Map<number, (match: LocalityMatch | null) => void>();

function startWorker(): Promise<boolean> | null {
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('../workers/locality.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    return null;
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    worker!.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        if (!settled) {
          settled = true;
          resolve(message.ok);
        }
        return;
      }
      const resolveLookup = pending.get(message.id);
      if (resolveLookup) {
        pending.delete(message.id);
        resolveLookup(message.match);
      }
    };
    worker!.onerror = () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
      worker?.terminate();
      worker = null;
    };
    worker!.postMessage({ type: 'load', url: LOCALITY_DATASET_URL, cacheName: CACHE_NAME, cachePrefix: CACHE_PREFIX });
  });
}

async function loadOnMainThread(): Promise<boolean> {
  const index = await loadLocalityIndexData(LOCALITY_DATASET_URL, CACHE_NAME);
  if (!index) return false;
  try {
    mainThreadLookup = createLocalityLookup(index);
  } catch {
    return false;
  }
  void pruneLocalityCaches(CACHE_NAME, CACHE_PREFIX);
  return true;
}

export function isLocalityIndexReady(): boolean {
  return ready;
}

/** Idempotent. Starts loading the static dataset; resolves to readiness. */
export function ensureLocalityIndex(): Promise<boolean> {
  if (loadPromise) return loadPromise;
  const workerPromise = startWorker();
  loadPromise = (workerPromise ?? loadOnMainThread())
    .then(async (ok) => {
      if (ok) {
        ready = true;
        return true;
      }
      if (workerPromise) {
        const fallback = await loadOnMainThread();
        ready = fallback;
        return fallback;
      }
      return false;
    })
    .catch(() => false);
  return loadPromise;
}

/** Resolves to a locality match, or null for any failure/low result. */
export async function lookupLocality(latitude: number, longitude: number): Promise<LocalityMatch | null> {
  const ok = await ensureLocalityIndex();
  if (!ok) return null;
  if (worker) {
    return new Promise<LocalityMatch | null>((resolve) => {
      const id = nextRequestId++;
      pending.set(id, resolve);
      try {
        worker!.postMessage({ type: 'lookup', id, latitude, longitude });
      } catch {
        pending.delete(id);
        resolve(null);
      }
    });
  }
  try {
    return mainThreadLookup ? mainThreadLookup.findNearestLocality(latitude, longitude) : null;
  } catch {
    return null;
  }
}
