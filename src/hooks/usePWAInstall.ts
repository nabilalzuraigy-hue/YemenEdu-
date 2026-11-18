import { useState, useEffect } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISSED_KEY = 'yemenedu_pwa_dismissed';
const AUTO_MODAL_SEEN_KEY = 'yemenedu_pwa_auto_modal_seen';

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && window.__deferredPWAInstallPrompt) {
      return window.__deferredPWAInstallPrompt as BeforeInstallPromptEvent;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      Boolean(window.__pwaIsInstalled) ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [hasSeenAutoModal, setHasSeenAutoModal] = useState(() => {
    try {
      return sessionStorage.getItem(AUTO_MODAL_SEEN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncPrompt = () => {
      if (window.__deferredPWAInstallPrompt) {
        setDeferredPrompt(window.__deferredPWAInstallPrompt as BeforeInstallPromptEvent);
      }
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__deferredPWAInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      window.__deferredPWAInstallPrompt = null;
      window.__pwaIsInstalled = true;
      setIsInstalled(true);
      setDeferredPrompt(null);
      setHasSeenAutoModal(true);
      try {
        sessionStorage.setItem(AUTO_MODAL_SEEN_KEY, 'true');
        sessionStorage.setItem(DISMISSED_KEY, 'true');
      } catch {
        // ignore
      }
    };

    syncPrompt();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-installable-ready', syncPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed-complete', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-installable-ready', syncPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed-complete', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent =
      deferredPrompt ||
      (typeof window !== 'undefined' ? (window.__deferredPWAInstallPrompt as BeforeInstallPromptEvent | undefined) : undefined);

    if (!promptEvent) return 'unavailable';
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      window.__deferredPWAInstallPrompt = null;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsInstalled(true);
        markAutoModalSeen();
        return 'accepted';
      }
      return 'dismissed';
    } catch (err) {
      console.warn('Install prompt error:', err);
      return 'unavailable';
    }
  };

  const markAutoModalSeen = () => {
    setHasSeenAutoModal(true);
    try {
      sessionStorage.setItem(AUTO_MODAL_SEEN_KEY, 'true');
    } catch {
      // ignore
    }
  };

  const dismiss = () => {
    setIsDismissed(true);
    markAutoModalSeen();
    try {
      sessionStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isDismissed,
    hasSeenAutoModal,
    install,
    dismiss,
    markAutoModalSeen,
  };
}
