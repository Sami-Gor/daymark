import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { LocaleProvider } from '@/hooks/use-locale';

import './index.css';

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </ErrorBoundary>,
);

// Inside the Capacitor native shell the web assets are already bundled, so a
// service worker would only add a redundant (and potentially stale) cache.
// Remove registrations left behind by earlier installations.
if (Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    })
    .catch(() => {
      // Cleanup is best-effort.
    });
}

// PWA: register the app-shell service worker in production web builds only.
// BASE_URL keeps the scope correct under any BASE_PATH deployment.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The service worker is a progressive enhancement; ignore failures.
    });
  });
}
