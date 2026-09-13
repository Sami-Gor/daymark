import { useEffect } from 'react';

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useLocation } from 'wouter';

import { resolveDeepLink } from '@/lib/deep-links';

/*
 * Native navigation glue for the Android shell:
 * - routes App Links (https://daymark-weather.pages.dev/...) into the SPA;
 * - handles the hardware back button through the SPA history, because the
 *   WebView's native canGoBack() does not track pushState entries;
 * - keeps the task in the background when back is pressed at the root.
 */
export function useNativeNavigation() {
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    const removeListeners: Array<() => void> = [];

    const handleUrl = (rawUrl: string | undefined) => {
      const target = resolveDeepLink(rawUrl);
      if (target) navigate(target);
    };

    const handleBackButton = () => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const path = window.location.pathname;
      const isRoot = path === '/' || path === base || path === `${base}/`;
      if (!isRoot) {
        window.history.back();
        return;
      }
      void CapacitorApp.minimizeApp();
    };

    void CapacitorApp.getLaunchUrl()
      .then((result) => {
        if (active) handleUrl(result?.url);
      })
      .catch(() => {
        // Launch URL is best-effort.
      });

    void CapacitorApp.addListener('appUrlOpen', (event) => handleUrl(event.url)).then((handle) => {
      if (active) {
        removeListeners.push(() => handle.remove());
      } else {
        handle.remove();
      }
    });

    void CapacitorApp.addListener('backButton', handleBackButton).then((handle) => {
      if (active) {
        removeListeners.push(() => handle.remove());
      } else {
        handle.remove();
      }
    });

    return () => {
      active = false;
      removeListeners.forEach((remove) => remove());
    };
  }, [navigate]);
}
