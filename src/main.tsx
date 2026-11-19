import {createRoot} from 'react-dom/client';
import App from './RootApp.tsx';
import './index.css';

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

if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let hasReloadedForNewSW = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !hasReloadedForNewSW) { hasReloadedForNewSW = true; window.location.reload(); }
    });
    navigator.serviceWorker.register('/sw.js').then((reg) => reg.update().catch(() => {})).catch((err) => console.warn('[YemenEdu PWA] Service Worker registration failed:', err));
  });
}

createRoot(document.getElementById('root')!).render(<App />);
