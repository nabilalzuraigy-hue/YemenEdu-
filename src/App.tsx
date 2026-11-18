/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { authService, UserSession, initSuperAdmin, getInitialSession } from './services/authService';
import {
  testFirestoreConnection,
  subscribeConnectionStatus,
  dismissFirebaseWarning,
  FirebaseConnectionStatus,
} from './firebase/config';
import { AlertCircle, Lock, LogOut, WifiOff, RefreshCw } from 'lucide-react';
import { Header } from './components/Header';
import { GlassLockScreen } from './components/GlassLockScreen';
import { ActivationPage } from './pages/ActivationPage';
import { SystemAdminDashboard } from './pages/SystemAdminDashboard';
import { PrincipalDashboard } from './pages/PrincipalDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { StudentDashboard } from './pages/StudentDashboard';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { formatArabicSchoolName } from './utils/schoolDisplay';

export default function App() {
  // Synchronous local-first initialization - NEVER waits for Firebase to show UI
  const [session, setSession] = useState<UserSession | null>(() => authService.getSession() || getInitialSession());
  const [showActivationScreen, setShowActivationScreen] = useState(() => !authService.getSession() && !getInitialSession());
  const [isGlassLocked, setIsGlassLocked] = useState(false);
  const [connStatus, setConnStatus] = useState<FirebaseConnectionStatus>({
    isOnline: true,
    hasError: false,
    errorMessage: null,
    lastChecked: Date.now(),
    dismissed: false,
  });
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const hasEverBeenHidden = useRef(false);

  useEffect(() => {
    // 1. Subscribe to Firebase connection state
    const unsubConn = subscribeConnectionStatus((status) => {
      setConnStatus(status);
    });

    // 2. Validate connection to Firestore on initial boot non-blockingly
    testFirestoreConnection().catch(() => {});
    initSuperAdmin().catch(() => {});

    // 3. Check existing active session or saved code
    const existing = authService.getSession();
    if (existing) {
      setSession(existing);
      setShowActivationScreen(false);
      localStorage.setItem('yemenedu_activation_code', existing.code);
    } else {
      const savedCode = localStorage.getItem('yemenedu_activation_code');
      if (savedCode) {
        authService.activateWithCode(savedCode).then((res) => {
          if (res.session) {
            setSession(res.session);
            setShowActivationScreen(false);
            localStorage.setItem('yemenedu_activation_code', res.session.code);
          }
        });
      } else {
        setShowActivationScreen(true);
      }
    }

    const unsubAuth = authService.subscribe(() => {
      const current = authService.getSession();
      if (current) {
        setSession(current);
        setShowActivationScreen(false);
        localStorage.setItem('yemenedu_activation_code', current.code);
      }
    });

    return () => {
      unsubConn();
      unsubAuth();
    };
  }, []);

  // Global events for sidebars lock & logout
  useEffect(() => {
    const handleLockEvent = () => setIsGlassLocked(true);
    const handleLogoutEvent = () => handleLogout();

    window.addEventListener('trigger-app-lock', handleLockEvent);
    window.addEventListener('trigger-app-logout', handleLogoutEvent);

    return () => {
      window.removeEventListener('trigger-app-lock', handleLockEvent);
      window.removeEventListener('trigger-app-logout', handleLogoutEvent);
    };
  }, [session]);

  const handleRetryConnection = async () => {
    setIsRetryingConnection(true);
    try {
      console.log('🔄 [App] Manually retrying Firebase connection...');
      await testFirestoreConnection();
      await authService.syncAllCodesFromFirestore();
    } catch (err) {
      console.error('🔥 [App Retry Error]:', err);
    } finally {
      setIsRetryingConnection(false);
    }
  };

  // Idle inactivity trigger: exactly 5 minutes without touch/interaction (خمول 5 دقائق)
  useEffect(() => {
    if (!session || showActivationScreen) return;

    const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
    let timer: ReturnType<typeof setTimeout>;

    const resetIdleTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsGlassLocked(true);
      }, IDLE_TIMEOUT_MS);
    };

    const userActivityEvents = ['mousemove', 'mousedown', 'keydown', 'click', 'scroll', 'touchstart', 'touchmove'];
    userActivityEvents.forEach((evt) => {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    resetIdleTimer();

    return () => {
      clearTimeout(timer);
      userActivityEvents.forEach((evt) => {
        window.removeEventListener(evt, resetIdleTimer);
      });
    };
  }, [session, showActivationScreen]);

  const handleActivationSuccess = (newSession: UserSession) => {
    localStorage.setItem('yemenedu_activation_code', newSession.code);
    localStorage.setItem('yemenedu_cached_session', JSON.stringify(newSession));
    setSession(newSession);
    setShowActivationScreen(false);
  };

  const handleLogout = () => {
    authService.logout();
    setSession(null);
    setIsGlassLocked(false);
    setShowActivationScreen(true);
  };

  const handleRefreshSession = () => {
    const current = authService.getSession();
    setSession(current);
    if (current) {
      localStorage.setItem('yemenedu_activation_code', current.code);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col font-['Cairo','Tajawal'] text-[#1A3A5F] selection:bg-[#B3CDE8] selection:text-[#1A3A5F] relative overflow-x-clip bg-[#EDF0F5]">
      {/* PWA Install Banner */}
      <PWAInstallBanner />

      {/* Firebase Connection Problem Banner (Timeout or Offline) */}
      {connStatus.hasError && !connStatus.dismissed && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs sm:text-sm shadow-md border-b border-amber-700 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-50 animate-in fade-in">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-200" />
            <span className="font-bold">
              مشكلة اتصال - اضغط إعادة المحاولة أو تابع بالذاكرة المحلية
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetryConnection}
              disabled={isRetryingConnection}
              className="px-3 py-1 bg-white text-amber-800 rounded-lg font-bold text-xs hover:bg-amber-50 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetryingConnection ? 'animate-spin' : ''}`} />
              <span>إعادة المحاولة</span>
            </button>
            <button
              onClick={() => dismissFirebaseWarning()}
              className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-amber-100 rounded-lg font-medium text-xs transition cursor-pointer border border-amber-500"
            >
              المتابعة بدون إنترنت
            </button>
          </div>
        </div>
      )}

      {/* Sky-Blue Header (#B3CDE8) with Ministry Brand (#1A3A5F) */}
      {session && !showActivationScreen && (
        <Header
          session={session}
          onLogout={handleLogout}
          onLock={() => setIsGlassLocked(true)}
        />
      )}

      {/* 3-Day Expiry Warning Banner for Student, Teacher, Principal */}
      {session && !session.isLifetime && session.daysRemaining <= 3 && session.daysRemaining > 0 && !showActivationScreen && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-white px-3 sm:px-4 py-2.5 text-center font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm border-b border-amber-600 animate-in fade-in relative z-30">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-100 animate-bounce" />
          <span className="leading-relaxed">
            ⚠️ تنبيه: اشتراك مدرستك ({formatArabicSchoolName(session.schoolName, session.schoolId)}) ينتهي بعد {session.daysRemaining} {session.daysRemaining === 1 ? 'يوم واحد' : session.daysRemaining === 2 ? 'يومين' : 'أيام'}. يرجى التنسيق مع إدارة المدرسة لتجديد الاشتراك عبر الأدمن المطور.
          </span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        {showActivationScreen || !session ? (
          <ActivationPage
            onSuccess={handleActivationSuccess}
            onCancel={session ? () => setShowActivationScreen(false) : undefined}
          />
        ) : session.daysRemaining <= 0 && !session.isLifetime ? (
          /* Locked School Expiration Screen - only locks this school, never locks developer admin */
          <div className="min-h-[75dvh] flex items-center justify-center p-3 sm:p-4">
            <div className="bg-white rounded-3xl p-5 sm:p-8 max-w-lg w-full max-h-[90dvh] overflow-y-auto text-center border-2 border-red-200 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-red-50 text-red-600 mx-auto flex items-center justify-center border border-red-200">
                <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" />
              </div>
              
              <div className="space-y-2">
                <span className="inline-block px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">
                  حالة الاشتراك: منتهي (0 يوم)
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-[#1A3A5F]">
                  انتهى اشتراك مدرستك
                </h2>
                <p className="text-sm sm:text-base font-bold text-[#1E5AA8]">
                  {formatArabicSchoolName(session.schoolName, session.schoolId)}
                </p>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed font-semibold">
                  انتهى اشتراك مدرستك - تواصل مع الأدمن المطور
                </p>
              </div>

              <div className="bg-[#F0F4F8] rounded-2xl p-3.5 sm:p-4 border border-[#B3CDE8] text-right space-y-2.5 text-xs">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-500 shrink-0">الأدمن المطور:</span>
                  <span className="font-bold text-[#1A3A5F] text-left">أ. نبيل الزريقي (صلاحية دائمة)</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-500 shrink-0">هاتف / واتساب الأدمن:</span>
                  <span className="font-mono font-bold text-[#1E5AA8]">773143897</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-500 shrink-0">كود الحساب المعلق:</span>
                  <span className="font-mono font-bold text-gray-700 bg-white px-2 py-0.5 rounded border border-gray-200 break-all">{session.code}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-500 shrink-0">نوع الحساب:</span>
                  <span className="font-semibold text-gray-700">{session.roleTitleAr}</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 sm:py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md text-xs sm:text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span>تسجيل الخروج / تبديل الكود</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {(session.role === 'admin' || session.role === 'super_admin') && (
              <SystemAdminDashboard
                session={session}
                onRefreshSession={handleRefreshSession}
              />
            )}

            {session.role === 'principal' && (
              <PrincipalDashboard session={session} />
            )}

            {session.role === 'teacher' && (
              <TeacherDashboard session={session} />
            )}

            {session.role === 'student' && (
              <StudentDashboard session={session} />
            )}
          </>
        )}
      </main>

      {/* Glass Lock Screen Overlay - Separate password from activation code */}
      {isGlassLocked && session && !showActivationScreen && (
        <GlassLockScreen
          session={session}
          onUnlock={() => setIsGlassLocked(false)}
        />
      )}
    </div>
  );
}
