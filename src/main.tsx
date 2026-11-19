import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Capture beforeinstallprompt early before React mounts so 1-click install is always ready
declare global {
  interface Window {
    __deferredPWAInstallPrompt?: any;
    __pwaIsInstalled?: boolean;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__deferredPWAInstallPrompt = e;
    window.dispatchEvent(new Event('pwa-installable-ready'));
  });

  window.addEventListener('appinstalled', () => {
    window.__deferredPWAInstallPrompt = null;
    window.__pwaIsInstalled = true;
    window.dispatchEvent(new Event('pwa-installed-complete'));
  });
}

// Register Service Worker for PWA compliance and offline/weak-network resilience
if (
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
) {
  window.addEventListener('load', () => {
    const isDevPreview =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('ais-dev-');

    if (isDevPreview && 'caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {});
    }

    const hadController = Boolean(navigator.serviceWorker.controller);
    let hasReloadedForNewSW = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !hasReloadedForNewSW) {
        hasReloadedForNewSW = true;
        window.location.reload();
      }
    });

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('[YemenEdu PWA] Service Worker registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
