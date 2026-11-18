import React, { useEffect, useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { CheckCircle2, X } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const {
    isInstalled,
    isDismissed,
    hasSeenAutoModal,
    install,
    dismiss,
    markAutoModalSeen,
  } = usePWAInstall();

  const [showPromptModal, setShowPromptModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installToast, setInstallToast] = useState<string | null>(null);

  // Show automatic concise prompt to all non-installed users
  useEffect(() => {
    if (isInstalled || hasSeenAutoModal) return;
    const timer = window.setTimeout(() => {
      setShowPromptModal(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [isInstalled, hasSeenAutoModal]);

  // Listen for OS-level completion notification
  useEffect(() => {
    const onInstalled = () => {
      setShowPromptModal(false);
      setInstallToast('✅ تم تثبيت التطبيق على سطح الشاشة بنجاح');
      window.setTimeout(() => setInstallToast(null), 5000);
    };
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('pwa-installed-complete', onInstalled);
    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('pwa-installed-complete', onInstalled);
    };
  }, []);

  const handleCloseModal = () => {
    setShowPromptModal(false);
    markAutoModalSeen();
  };

  const handleConfirmInstall = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    try {
      const result = await install();
      setShowPromptModal(false);
      dismiss();

      if (result === 'accepted') {
        setInstallToast('✅ تم تثبيت التطبيق على سطح الشاشة بنجاح');
      } else if (result === 'unavailable') {
        setInstallToast('✅ تم تجهيز التطبيق للتثبيت — اختر «إضافة إلى الشاشة الرئيسية» من قائمة المتصفح لإظهار الأيقونة');
      } else {
        setInstallToast(null);
      }

      if (result !== 'dismissed') {
        window.setTimeout(() => setInstallToast(null), 5000);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <>
      {/* Installed Confirmation Toast */}
      {installToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[calc(100%-1.5rem)] bg-emerald-700 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500 flex items-center justify-between gap-2.5 text-xs sm:text-sm font-bold font-['Cairo'] animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
            <span className="leading-snug">{installToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setInstallToast(null)}
            className="text-emerald-100 hover:text-white p-1 rounded-lg shrink-0 cursor-pointer"
            aria-label="إغلاق الإشعار"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Minimal Top Bar when Modal is closed and app is not yet installed */}
      {!isInstalled && !isDismissed && !showPromptModal && (
        <aside
          aria-label="تثبيت التطبيق"
          className="bg-gradient-to-r from-[#1A3A5F] to-[#1E5AA8] text-white border-b border-[#2A65B8] shadow-xs relative z-30"
        >
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2 text-right font-['Cairo']">
            <p className="text-xs sm:text-sm font-bold truncate">
              يُنصح بتثبيت التطبيق على سطح الشاشة
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleConfirmInstall}
                disabled={isInstalling}
                className="px-3.5 py-1 bg-white text-[#1A3A5F] hover:bg-blue-50 text-xs font-black rounded-lg transition shadow-xs cursor-pointer active:scale-95 disabled:opacity-60"
              >
                حسناً
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="p-1 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Automatic Minimalist Install Message Modal (No images, no long explanations) */}
      {!isInstalled && showPromptModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-sm w-full text-center shadow-2xl border border-[#D5E2EE] space-y-4 font-['Cairo']">
            <h3
              id="pwa-install-modal-title"
              className="font-black text-base sm:text-lg text-[#1A3A5F] leading-relaxed"
            >
              يُنصح بتثبيت التطبيق على سطح الشاشة
            </h3>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleConfirmInstall}
                disabled={isInstalling}
                className="flex-1 py-2.5 px-4 bg-[#1E5AA8] hover:bg-[#1A3A5F] text-white font-black rounded-xl text-sm shadow-md transition cursor-pointer active:scale-95 disabled:opacity-60"
              >
                {isInstalling ? 'جاري التثبيت...' : 'حسناً'}
              </button>
              <button
                type="button"
                onClick={handleCloseModal}
                className="py-2.5 px-4 bg-[#F0F4F8] hover:bg-[#E2ECF5] text-[#1A3A5F] font-bold rounded-xl text-xs sm:text-sm transition cursor-pointer border border-[#D5E2EE]"
              >
                لاحقاً
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
