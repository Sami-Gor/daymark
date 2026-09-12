/*
 * Deep-link / App Link routing helpers.
 *
 * Capacitor launches the bundled app at its start URL and reports the external
 * launch URL separately, so the SPA has to navigate itself. Only URLs for
 * Daymark's own origin are accepted.
 */

const ALLOWED_HOSTS = new Set(['daymark-weather.pages.dev', 'localhost']);

export function resolveDeepLink(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) return null;
  const target = `${url.pathname}${url.search}${url.hash}`;
  if (!target || target === '/') return null;
  return target;
}
