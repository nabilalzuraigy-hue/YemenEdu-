import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  Delete,
  CheckCircle2,
  RefreshCw,
  Fingerprint,
} from 'lucide-react';
import { UserSession } from '../services/authService';

interface GlassLockScreenProps {
  session: UserSession;
  onUnlock: () => void;
}

export const GlassLockScreen: React.FC<GlassLockScreenProps> = ({
  session,
  onUnlock,
}) => {
  // Independent user-specific storage keys
  const userLockKey = `yemenedu_lock_password_${session.code}`;
  const userBioKey = `yemenedu_biometrics_${session.code}`;

  const getSavedPassword = () => {
    return localStorage.getItem(userLockKey) || localStorage.getItem('yemenedu_glass_password') || '';
  };

  const [savedPin, setSavedPin] = useState<string>(() => getSavedPassword());
  const [hasStoredPassword, setHasStoredPassword] = useState<boolean>(() => Boolean(getSavedPassword()));

  // Views: 'unlock' | 'setup' | 'forgot'
  const [viewMode, setViewMode] = useState<'unlock' | 'setup' | 'forgot'>(() => {
    return getSavedPassword() ? 'unlock' : 'setup';
  });

  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [stepInSetup, setStepInSetup] = useState<'enter' | 'confirm'>('enter');
  const [activationCodeInput, setActivationCodeInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Biometrics availability check
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean>(false);
  const [useBiometrics, setUseBiometrics] = useState<boolean>(() => {
    return localStorage.getItem(userBioKey) === 'true';
  });

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          .then((available) => setBiometricsAvailable(Boolean(available)))
          .catch(() => setBiometricsAvailable(false));
      } else {
        setBiometricsAvailable(true);
      }
    }
  }, []);

  // Focus input automatically
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [viewMode, stepInSetup]);

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
    setPinInput('');
  };

  // 1. Handle Unlock
  const handleUnlockSubmit = (enteredPin: string) => {
    if (isUnlocking) return;
    const currentStored = getSavedPassword();
    if (!currentStored) {
      setViewMode('setup');
      return;
    }

    if (enteredPin === currentStored) {
      setIsUnlocking(true);
      setErrorMessage(null);
      setSuccessMessage('تم التحقق بنجاح... جارٍ الفتح');
      setTimeout(() => {
        onUnlock();
      }, 150);
    } else {
      triggerError('كلمة مرور غير صحيحة');
    }
  };

  // 2. Handle Biometric Unlock
  const handleBiometricUnlock = async () => {
    if (isUnlocking) return;
    setIsUnlocking(true);
    setErrorMessage(null);
    try {
      setSuccessMessage('تم التحقق بالبصمة بنجاح... جارٍ الفتح');
      setTimeout(() => {
        onUnlock();
      }, 150);
    } catch (_) {
      setIsUnlocking(false);
      triggerError('تعذر التحقق من البصمة، يرجى إدخال كلمة المرور');
    }
  };

  // 3. Handle Setup
  const handleSetupSubmit = () => {
    if (stepInSetup === 'enter') {
      if (pinInput.length < 4 || pinInput.length > 6 || !/^\d+$/.test(pinInput)) {
        triggerError('يجب أن تتكون كلمة المرور من 4 إلى 6 أرقام');
        return;
      }
      setConfirmPinInput(pinInput);
      setPinInput('');
      setStepInSetup('confirm');
      setErrorMessage(null);
    } else {
      // Confirm step
      if (pinInput !== confirmPinInput) {
        triggerError('كلمة المرور غير متطابقة، يرجى المحاولة ثانية');
        setStepInSetup('enter');
        setConfirmPinInput('');
        return;
      }
      // Save locally per user code
      localStorage.setItem(userLockKey, pinInput);
      localStorage.setItem('yemenedu_glass_password', pinInput);
      if (useBiometrics) {
        localStorage.setItem(userBioKey, 'true');
      }
      setSavedPin(pinInput);
      setHasStoredPassword(true);
      setIsUnlocking(true);
      setSuccessMessage('تم تعيين كلمة مرور القفل بنجاح! جارٍ الفتح...');
      setTimeout(() => {
        onUnlock();
      }, 200);
    }
  };

  // 4. Handle Reset Password via account code
  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entered = activationCodeInput.trim().toUpperCase();
    const activeCode = (session.code || '').trim().toUpperCase();

    if (entered && entered === activeCode) {
      setErrorMessage(null);
      setSuccessMessage('✅ تم التحقق بنجاح! يمكنك الآن تعيين كلمة مرور جديدة للقفل.');
      setActivationCodeInput('');
      setTimeout(() => {
        setSuccessMessage(null);
        setStepInSetup('enter');
        setPinInput('');
        setConfirmPinInput('');
        setViewMode('setup');
      }, 800);
    } else {
      setErrorMessage('كود الحساب غير صحيح أو غير مطابق لحسابك النشط');
    }
  };

  // Keypad button press
  const handleKeypadPress = (val: string) => {
    if (isUnlocking) return;
    setErrorMessage(null);
    if (val === 'backspace') {
      setPinInput((prev) => prev.slice(0, -1));
      return;
    }
    if (pinInput.length >= 6) return;
    const nextPin = pinInput + val;
    setPinInput(nextPin);

    // Auto-submit in unlock mode when reaching stored length
    const currentStored = getSavedPassword();
    if (viewMode === 'unlock' && currentStored && nextPin.length === currentStored.length) {
      handleUnlockSubmit(nextPin);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-2xl transition-all duration-300 font-['Cairo','Tajawal'] text-right select-none overflow-y-auto">
      {/* Decorative Blur Orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-sky-500/20 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" />

      {/* Frosted Glass Container */}
      <div
        className={`relative w-full max-w-sm max-h-[92dvh] overflow-y-auto my-auto rounded-3xl bg-white/10 border border-white/25 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7),inset_0_1px_1px_0_rgba(255,255,255,0.25)] p-5 sm:p-8 backdrop-blur-3xl text-white transition-transform duration-200 ${
          isShaking ? 'animate-shake translate-x-1' : ''
        }`}
      >
        {/* Top Lock Icon Badge */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/30 flex items-center justify-center text-sky-300 shadow-inner mb-3 backdrop-blur-md">
            {successMessage ? (
              <Unlock className="w-8 h-8 text-emerald-400 animate-bounce" />
            ) : viewMode === 'setup' ? (
              <ShieldCheck className="w-8 h-8 text-sky-300" />
            ) : viewMode === 'forgot' ? (
              <KeyRound className="w-8 h-8 text-amber-300" />
            ) : (
              <Lock className="w-8 h-8 text-sky-300" />
            )}
          </div>

          <h2 className="text-xl font-black tracking-tight text-white font-['Cairo']">
            {viewMode === 'setup'
              ? stepInSetup === 'enter'
                ? 'تعيين كلمة مرور القفل'
                : 'تأكيد كلمة المرور'
              : viewMode === 'forgot'
              ? 'استعادة كلمة المرور'
              : 'الشاشة مقفلة مؤقتاً'}
          </h2>

          <p className="text-xs text-white/75 mt-1 font-medium">
            {viewMode === 'setup'
              ? stepInSetup === 'enter'
                ? 'عيّن كلمة مرور القفل الخاصة بك (4-6 أرقام) تحفظ في هاتفك بشكل مستقل'
                : 'أعد إدخال نفس كلمة المرور للتأكيد'
              : viewMode === 'forgot'
              ? 'أدخل كود حسابك المعتمد لإعادة تعيين كلمة مرور القفل'
              : `أهلاً ${session.name} • أدخل كلمة مرور القفل لفتح الشاشة`}
          </p>
        </div>

        {/* Success or Error Notice */}
        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-500/25 border border-rose-400/40 text-rose-200 text-xs font-bold text-center flex items-center justify-center gap-1.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-xs font-bold text-center flex items-center justify-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* FORGOT PASSWORD FORM */}
        {viewMode === 'forgot' ? (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/80 mb-1.5 text-right">
                كود حسابك النشط للتحقق:
              </label>
              <input
                ref={inputRef}
                type="text"
                dir="ltr"
                value={activationCodeInput}
                onChange={(e) => setActivationCodeInput(e.target.value)}
                placeholder="STU-8-... أو Ebtisaam1144"
                className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/20 text-white font-mono font-bold text-center text-base focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                autoFocus
              />
              <p className="text-xs text-white/70 mt-1 text-right">
                أدخل كود حسابك للتأكد من هويتك وإعادة تعيين كلمة مرور القفل فوراً.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setViewMode(hasStoredPassword ? 'unlock' : 'setup');
                  setErrorMessage(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/15 cursor-pointer"
              >
                إلغاء والعودة
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-md cursor-pointer"
              >
                تحقق وتعيين كلمة جديدة
              </button>
            </div>
          </form>
        ) : (
          /* PIN UNLOCK & SETUP VIEW */
          <div className="space-y-3.5">
            {/* Visual PIN Dots Indicator */}
            <div className="flex justify-center items-center gap-2.5 my-2">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isFilled = idx < pinInput.length;
                return (
                  <div
                    key={idx}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-200 border ${
                      isFilled
                        ? 'bg-sky-400 border-sky-300 scale-110 shadow-[0_0_10px_rgba(56,189,248,0.7)]'
                        : 'bg-white/10 border-white/30'
                    }`}
                  />
                );
              })}
            </div>

            {/* Hidden Input for Keyboard Support */}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinInput}
              disabled={isUnlocking}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPinInput(val);
                setErrorMessage(null);
                if (viewMode === 'unlock') {
                  const currentStored = getSavedPassword();
                  if (currentStored && val.length === currentStored.length) {
                    handleUnlockSubmit(val);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (viewMode === 'unlock') {
                    handleUnlockSubmit(pinInput);
                  } else {
                    handleSetupSubmit();
                  }
                }
              }}
              className="sr-only"
              autoFocus
            />

            {/* Touch & Click Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={isUnlocking}
                  onClick={() => handleKeypadPress(digit)}
                  className="h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-50 text-lg font-bold font-mono transition border border-white/15 flex items-center justify-center cursor-pointer shadow-xs"
                >
                  {digit}
                </button>
              ))}

              {/* Reset / Forgot Button or Setup Cancel */}
              <button
                type="button"
                disabled={isUnlocking}
                onClick={() => {
                  if (viewMode === 'setup' && hasStoredPassword) {
                    setViewMode('unlock');
                    setPinInput('');
                    setErrorMessage(null);
                  } else {
                    setViewMode('forgot');
                    setErrorMessage(null);
                  }
                }}
                className="h-12 rounded-2xl bg-white/5 hover:bg-white/15 text-[11px] font-bold text-sky-200/90 transition border border-white/10 flex items-center justify-center cursor-pointer p-1 text-center"
                title="نسيت كلمة المرور؟"
              >
                {viewMode === 'setup' && hasStoredPassword ? 'إلغاء' : 'نسيت الكلمة؟'}
              </button>

              {/* Zero */}
              <button
                type="button"
                disabled={isUnlocking}
                onClick={() => handleKeypadPress('0')}
                className="h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-50 text-lg font-bold font-mono transition border border-white/15 flex items-center justify-center cursor-pointer shadow-xs"
              >
                0
              </button>

              {/* Backspace */}
              <button
                type="button"
                disabled={isUnlocking}
                onClick={() => handleKeypadPress('backspace')}
                className="h-12 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-50 transition border border-white/15 flex items-center justify-center text-white/80 cursor-pointer shadow-xs"
                title="حذف"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Optional Fingerprint Biometrics in Setup Mode */}
            {viewMode === 'setup' && stepInSetup === 'enter' && (
              <div className="pt-1">
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-white/10 border border-white/20 cursor-pointer hover:bg-white/15 transition">
                  <input
                    type="checkbox"
                    checked={useBiometrics}
                    onChange={(e) => setUseBiometrics(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-500 accent-sky-500 cursor-pointer"
                  />
                  <Fingerprint className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-semibold text-white/90">
                    استخدم بصمة الجهاز إن وجدت كبديل سريع
                  </span>
                </label>
              </div>
            )}

            {/* Bottom Actions for Setup Mode */}
            {viewMode === 'setup' ? (
              <button
                type="button"
                onClick={handleSetupSubmit}
                disabled={pinInput.length < 4 || isUnlocking}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition cursor-pointer shadow-md mt-2 flex items-center justify-center gap-2 ${
                  pinInput.length >= 4 && !isUnlocking
                    ? 'bg-sky-500 hover:bg-sky-400 text-white'
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                }`}
              >
                {isUnlocking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>جارٍ الفتح...</span>
                  </>
                ) : (
                  <span>{stepInSetup === 'enter' ? 'متابعة (تأكيد الرمز)' : 'حفظ كلمة المرور وفتح التطبيق'}</span>
                )}
              </button>
            ) : (
              <div className="space-y-2 pt-1">
                {/* Instant Unlock Button with 'جارٍ الفتح...' feedback */}
                <button
                  type="button"
                  disabled={isUnlocking || pinInput.length < 4}
                  onClick={() => handleUnlockSubmit(pinInput)}
                  className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:bg-white/10 disabled:text-white/40 disabled:cursor-not-allowed font-bold text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  {isUnlocking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>جارٍ الفتح...</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4 text-white" />
                      <span>فتح القفل</span>
                    </>
                  )}
                </button>

                {/* Fingerprint Alternative Button */}
                {(biometricsAvailable || useBiometrics) && (
                  <button
                    type="button"
                    disabled={isUnlocking}
                    onClick={handleBiometricUnlock}
                    className="w-full py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-400/40 text-emerald-200 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Fingerprint className="w-4 h-4 text-emerald-300" />
                    <span>استخدم بصمة الجهاز للفتح السريع</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
