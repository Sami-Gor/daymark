/*
 * Web Worker entry for offline locality lookup.
 *
 * Loading, JSON parsing and grid-index preparation happen here so the weather
 * UI thread is never blocked by the dataset. Lookups are message-based; the
 * worker never receives user intent, only the rounded coordinates needed for a
 * single lookup, and nothing is stored or transmitted.
 */
import { createLocalityLookup, type LocalityMatch } from '@/lib/locality-lookup';
import { loadLocalityIndexData, pruneLocalityCaches } from '@/lib/locality-load';

type WorkerRequest =
  | { type: 'load'; url: string; cacheName: string; cachePrefix: string }
  | { type: 'lookup'; id: number; latitude: number; longitude: number };

type WorkerResponse =
  | { type: 'ready'; ok: boolean }
  | { type: 'result'; id: number; match: LocalityMatch | null };

const scope = self as unknown as { postMessage: (message: WorkerResponse) => void; onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null };

let lookup: ReturnType<typeof createLocalityLookup> | null = null;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'load') {
    const index = await loadLocalityIndexData(message.url, message.cacheName);
    if (!index) {
      scope.postMessage({ type: 'ready', ok: false });
      return;
    }
    try {
      lookup = createLocalityLookup(index);
    } catch {
      lookup = null;
      scope.postMessage({ type: 'ready', ok: false });
      return;
    }
    void pruneLocalityCaches(message.cacheName, message.cachePrefix);
    scope.postMessage({ type: 'ready', ok: true });
    return;
  }

  if (message.type === 'lookup') {
    let match: LocalityMatch | null = null;
    try {
      match = lookup ? lookup.findNearestLocality(message.latitude, message.longitude) : null;
    } catch {
      match = null;
    }
    scope.postMessage({ type: 'result', id: message.id, match });
  }
};
