import React, { useState } from 'react';
import {
  KeyRound,
  School,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { authService, UserSession } from '../services/authService';

interface ActivationPageProps {
  onSuccess: (session: UserSession) => void;
  onCancel?: () => void;
}

export const ActivationPage: React.FC<ActivationPageProps> = ({ onSuccess }) => {
  const [code, setCode] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('الكود غير صحيح');
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const trimmed = code.trim();
  const isButtonEnabled = trimmed.length >= 6 && !isLoading;

  const handleActivate = async () => {
    if (!isButtonEnabled) return;

    setHasError(false);
    setSuccessInfo(null);
    setIsLoading(true);

    try {
      const res = await authService.activateWithCode(trimmed);
      setIsLoading(false);

      if (res.success && res.session) {
        localStorage.setItem('yemenedu_activation_code', trimmed);
        setSuccessInfo(res.message || `مرحباً بك في ${res.session.schoolName}`);
        try {
          confetti({
            particleCount: 75,
            spread: 65,
            origin: { y: 0.6 },
          });
        } catch {
          // ignore
        }
        setTimeout(() => {
          onSuccess(res.session!);
        }, 900);
      } else {
        setErrorMessage(res.message || 'الكود غير صحيح');
        setHasError(true);
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMessage('حدث خطأ أثناء التحقق من الكود');
      setHasError(true);
    }
  };

  const RoyalCornerOrnament: React.FC<{ className?: string }> = ({ className = '' }) => (
    <svg
      className={`pointer-events-none absolute w-8 h-8 sm:w-10 sm:h-10 text-[#E6C465] drop-shadow-[0_1px_4px_rgba(212,175,55,0.45)] ${className}`}
      viewBox="0 0 48 48"
      fill="none"
    >
      <path
        d="M44 4H23C15.5 4 11 8.5 11 16V19M44 4V25C44 32.5 39.5 37 32 37H29"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M44 4C37 4 33.5 8 30 11.5C27.5 14 23 14.5 21 12.5C19 10.5 20 7.5 22.5 7.5C24.5 7.5 25.5 9.5 24 11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M44 4C44 11 40 14.5 36.5 18C34 20.5 33.5 25 35.5 27C37.5 29 40.5 28 40.5 25.5C40.5 23.5 38.5 22.5 37 24"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="40" cy="8" r="1.4" fill="currentColor" />
      <circle cx="15" cy="8" r="1.1" fill="currentColor" />
      <circle cx="40" cy="33" r="1.1" fill="currentColor" />
    </svg>
  );

  return (
    <div
      dir="rtl"
      className="min-h-dvh relative overflow-x-clip bg-[linear-gradient(135deg,#062A1F_0%,#0B3D2E_38%,#123F32_68%,#062A1F_100%)] flex flex-col justify-between pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] px-3.5 sm:px-6 font-['Cairo','Tajawal']"
    >
      {/* Multi-layered Velvet Fabric Fold Gradients & Soft Draping Shadows */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_15%_10%,rgba(18,63,50,0.85)_0%,transparent_55%),radial-gradient(ellipse_at_85%_20%,rgba(11,61,46,0.9)_0%,transparent_60%),radial-gradient(ellipse_at_50%_95%,rgba(6,42,31,0.95)_0%,transparent_65%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(118deg,rgba(255,255,255,0.03)_0%,transparent_28%,rgba(0,0,0,0.38)_48%,rgba(18,63,50,0.45)_68%,rgba(0,0,0,0.45)_100%)]" />
      <div className="pointer-events-none fixed -top-28 -right-20 w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,rgba(18,63,50,0.75)_0%,rgba(11,61,46,0.2)_55%,transparent_75%)] blur-3xl rotate-12" />
      <div className="pointer-events-none fixed top-1/3 -left-24 w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,rgba(18,63,50,0.65)_0%,rgba(6,42,31,0.25)_60%,transparent_80%)] blur-3xl -rotate-12" />
      <div className="pointer-events-none fixed -bottom-24 right-1/4 w-[440px] h-[440px] rounded-full bg-[radial-gradient(circle,rgba(4,24,18,0.9)_0%,transparent_72%)] blur-3xl" />
      {/* Subtle Golden Stardust Ambient Accent */}
      <div className="pointer-events-none fixed top-12 right-6 w-40 h-40 rounded-full bg-[radial-gradient(circle,rgba(245,214,123,0.16)_0%,transparent_70%)] blur-2xl" />
      <div className="pointer-events-none fixed bottom-16 left-8 w-44 h-44 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.14)_0%,transparent_70%)] blur-2xl" />

      {/* Top Header Card - True Frosted Glass with Royal Gold Frame & Corner Ornaments */}
      <div className="relative z-10 max-w-md w-full mx-auto">
        <div className="relative overflow-hidden rounded-2xl p-5 sm:p-6 text-center bg-white/[0.07] backdrop-blur-[18px] border border-[rgba(212,175,55,0.65)] shadow-[0_18px_45px_rgba(0,0,0,0.45),0_0_26px_rgba(212,175,55,0.16),inset_0_1px_1px_rgba(245,214,123,0.45),inset_0_0_22px_rgba(212,175,55,0.1)]">
          {/* Top Golden Gleam Line */}
          <div className="pointer-events-none absolute top-0 inset-x-10 h-[2px] bg-gradient-to-r from-transparent via-[#F5D67B] to-transparent opacity-85" />
          <div className="pointer-events-none absolute -top-8 inset-x-16 h-14 bg-[radial-gradient(ellipse_at_center,rgba(245,214,123,0.22)_0%,transparent_75%)] blur-xl" />

          {/* Royal Ornamental Corners (Top & Bottom) */}
          <RoyalCornerOrnament className="top-1.5 right-1.5" />
          <RoyalCornerOrnament className="top-1.5 left-1.5 -scale-x-100" />
          <RoyalCornerOrnament className="bottom-1.5 right-1.5 -scale-y-100" />
          <RoyalCornerOrnament className="bottom-1.5 left-1.5 scale-[-1]" />

          <div className="relative z-10 inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[linear-gradient(180deg,#FFFFFF_0%,#FBF5E4_100%)] shadow-[0_10px_28px_rgba(0,0,0,0.4),0_0_18px_rgba(212,175,55,0.25)] mb-3 border border-[rgba(212,175,55,0.7)]">
            <School className="w-10 h-10 sm:w-12 sm:h-12 text-[#C99B2B]" />
          </div>
          <h1 className="relative z-10 text-lg sm:text-2xl font-black text-[#F5D67B] tracking-tight font-['Cairo'] flex flex-col items-center justify-center leading-snug space-y-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)] px-3">
            <span>وزارة التربية والتعليم</span>
            <span>منصة التعليم الرقمية</span>
          </h1>
        </div>
      </div>

      {/* Main Activation Card - True Glassmorphism: rgba(255,255,255,0.08) + blur(18px) + Gold Border & Inner/Outer Glow + Royal Corner Ornaments */}
      <div className="relative z-10 max-w-md w-full mx-auto my-4 sm:my-6 overflow-hidden rounded-2xl bg-[rgba(255,255,255,0.08)] backdrop-blur-[18px] border border-[rgba(212,175,55,0.6)] shadow-[0_22px_55px_rgba(0,0,0,0.5),0_0_32px_rgba(212,175,55,0.2),inset_0_1px_1px_rgba(245,214,123,0.48),inset_0_0_24px_rgba(212,175,55,0.12)] p-5 sm:p-8 text-right">
        {/* Top Golden Gleam */}
        <div className="pointer-events-none absolute top-0 inset-x-8 h-[2px] bg-gradient-to-r from-transparent via-[#F5D67B] to-transparent opacity-90" />
        <div className="pointer-events-none -top-10 inset-x-12 absolute h-16 bg-[radial-gradient(ellipse_at_center,rgba(245,214,123,0.24)_0%,transparent_75%)] blur-2xl" />

        {/* Royal Ornamental Corners on Main Card too */}
        <RoyalCornerOrnament className="top-1.5 right-1.5 opacity-85" />
        <RoyalCornerOrnament className="top-1.5 left-1.5 -scale-x-100 opacity-85" />
        <RoyalCornerOrnament className="bottom-1.5 right-1.5 -scale-y-100 opacity-85" />
        <RoyalCornerOrnament className="bottom-1.5 left-1.5 scale-[-1] opacity-85" />

        {/* Header inside card */}
        <div className="relative z-10 flex items-center justify-between border-b border-[rgba(212,175,55,0.32)] pb-3.5 sm:pb-4 mb-4 sm:mb-5 gap-2">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-[#F5D67B] flex items-center gap-1.5 sm:gap-2 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)] leading-snug">
              <KeyRound className="w-4 h-4 sm:w-5 sm:h-5 text-[#F5D67B] shrink-0" />
              <span>تفعيل الاشتراك المدرسي</span>
            </h2>
          </div>
          <span className="px-2.5 sm:px-3 py-1 rounded-full text-xs font-bold bg-[linear-gradient(135deg,rgba(6,42,31,0.75),rgba(18,63,50,0.65))] backdrop-blur-md text-[#F5D67B] border border-[rgba(212,175,55,0.75)] flex items-center gap-1.5 shadow-[0_4px_14px_rgba(212,175,55,0.22),inset_0_1px_0_rgba(245,214,123,0.3)] shrink-0 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
            <span>30 يوم</span>
          </span>
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleActivate();
          }}
          className="relative z-10 space-y-4"
        >
          <div>
            <label className="block text-xs sm:text-sm font-bold text-[#F5D67B] mb-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
              أدخل كود التفعيل:
            </label>
            <div className="relative">
              <input
                type="text"
                dir="ltr"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (hasError) setHasError(false);
                }}
                placeholder="أدخل كود التفعيل الخاص بك"
                className="w-full px-3.5 sm:px-4 py-3 sm:py-3.5 text-center tracking-wider sm:tracking-widest text-base sm:text-lg font-mono font-bold rounded-xl bg-[linear-gradient(180deg,rgba(4,28,20,0.68)_0%,rgba(6,42,31,0.52)_100%)] backdrop-blur-md text-[#F5D67B] border border-[rgba(212,175,55,0.55)] focus:border-[#F5D67B] focus:ring-2 focus:ring-[#D4AF37]/35 focus:shadow-[0_0_24px_rgba(212,175,55,0.38),inset_0_1px_8px_rgba(245,214,123,0.16)] transition outline-none placeholder:text-[#F5D67B]/65 placeholder:italic placeholder:font-normal placeholder:tracking-normal placeholder:text-xs sm:placeholder:text-sm shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)]"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Success Message Banner */}
          {successInfo && (
            <div className="p-3.5 rounded-xl bg-[linear-gradient(135deg,rgba(6,42,31,0.82),rgba(18,63,50,0.75))] backdrop-blur-md border border-[#D4AF37] text-[#F5D67B] text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in shadow-[0_4px_18px_rgba(212,175,55,0.24)]">
              <CheckCircle2 className="w-5 h-5 text-[#F5D67B] shrink-0" />
              <span>{successInfo}</span>
            </div>
          )}

          {/* Error Message */}
          {hasError && (
            <div className="py-2 text-center animate-in fade-in">
              <p className="text-rose-300 font-bold text-sm">
                {errorMessage}
              </p>
            </div>
          )}

          {/* Submit Button - Glossy Gold Gradient linear-gradient(180deg, #F5D67B, #D4AF37) with Top White Highlight & Gold Shadow */}
          <button
            type="submit"
            disabled={!isButtonEnabled}
            className={`relative overflow-hidden w-full py-3.5 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition duration-200 bg-[linear-gradient(180deg,#F5D67B,#D4AF37)] text-[#062A1F] border border-[#FFF2C2]/70 shadow-[0_8px_25px_rgba(212,175,55,0.5),inset_0_1px_1px_rgba(255,255,255,0.88)] ${
              isButtonEnabled
                ? 'hover:brightness-105 cursor-pointer'
                : 'opacity-85 cursor-not-allowed'
            }`}
          >
            {/* Top White Gloss Sheen */}
            <span className="pointer-events-none absolute top-0 inset-x-0 h-1/2 bg-gradient-to-b from-white/50 via-white/15 to-transparent" />
            <span className="relative z-10 flex items-center justify-center">
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-[#062A1F]/30 border-t-[#062A1F] rounded-full animate-spin" />
              ) : (
                <span>تفعيل الحساب</span>
              )}
            </span>
          </button>
        </form>

        {/* School Admin Contact Notice */}
        <div className="relative z-10 mt-5 p-3 rounded-xl bg-[linear-gradient(135deg,rgba(6,42,31,0.52),rgba(18,63,50,0.42))] backdrop-blur-md border border-[rgba(212,175,55,0.55)] text-center shadow-[inset_0_1px_0_rgba(245,214,123,0.2)]">
          <p className="text-xs font-bold text-[#FBF2D4] leading-relaxed">
            📢 تواصل مع إدارة المدرسة أو استخدم كود التفعيل الممنوح لك
          </p>
        </div>
      </div>

      {/* Footer Info */}
      <footer className="relative z-10 text-center text-xs text-[#D4AF37]/80 font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        تطبيق إلكتروني تجريبي YemenEdu
      </footer>
    </div>
  );
};
