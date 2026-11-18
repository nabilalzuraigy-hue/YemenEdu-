import React, { useState, useEffect } from 'react';
import {
  X,
  Home,
  Folder,
  FolderOpen,
  CalendarCheck,
  Award,
  Megaphone,
  Lock,
  LogOut,
  ChevronLeft,
  School,
  Sparkles,
  HelpCircle,
  FileSpreadsheet,
  Clock,
  User,
  AlertTriangle,
  BookOpen,
  Activity,
} from 'lucide-react';
import { UserSession } from '../services/authService';
import { formatArabicSchoolName, getUserInitials } from '../utils/schoolDisplay';

export type StudentArchiveSection =
  | 'weekly_homework'
  | 'monthly_homework'
  | 'monthly_grades'
  | 'monthly_circulars'
  | 'monthly_recommendations';

export type UnifiedSidebarView =
  | 'dashboard'
  | 'archive_monthly'
  | 'archive_teacher_activities'
  | 'archive_cumulative'
  | 'archive_circulars'
  | 'archive_questions'
  | 'archive_grades'
  | StudentArchiveSection;

interface UnifiedSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession;
  activeView: string;
  onSelectView: (view: any) => void;
  onOpenRecommendations?: () => void;
  onOpenAccount?: () => void;
}

export const UnifiedSidebar: React.FC<UnifiedSidebarProps> = ({
  isOpen,
  onClose,
  session,
  activeView,
  onSelectView,
  onOpenRecommendations,
  onOpenAccount,
}) => {
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showLogoutConfirm) {
          setShowLogoutConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, showLogoutConfirm, onClose]);

  const displaySchoolName = formatArabicSchoolName(session.schoolName, session.schoolId);
  const userInitials = getUserInitials(session.name);

  const handleLock = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('trigger-app-lock'));
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    onClose();
    window.dispatchEvent(new CustomEvent('trigger-app-logout'));
  };

  const getRoleTitle = () => {
    switch (session.role) {
      case 'principal':
        return 'مدير المدرسة';
      case 'teacher':
        return 'معلم';
      case 'student':
        return 'طالب';
      default:
        return session.roleTitleAr || 'مستخدم';
    }
  };

  const getMainDashboardLabel = () => {
    switch (session.role) {
      case 'principal':
        return 'لوحة مدير المدرسة';
      case 'teacher':
        return 'لوحة المعلم';
      case 'student':
        return 'لوحة الطالب';
      default:
        return 'لوحة التحكم';
    }
  };

  return (
    <>
      {/* Soft Transparent Backdrop - Click to close while keeping underlying page text crisp */}
      <div
        onClick={onClose}
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-50 bg-black/15 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Right-sliding Full-Screen Overlay (RTL) - Covers 100% of screen like ActionForex with crisp transparency */}
      <aside
        dir="rtl"
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-50 w-full bg-[#2C726B]/72 shadow-2xl flex flex-col font-['Cairo','Tajawal'] text-right text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none overflow-hidden ${
          isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Top Header Strip (Darker transparent teal bar like ActionForex header with crisp white X close button) */}
        <div className="bg-[#1F5650]/60 border-b border-white/20 px-4 sm:px-6 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3 shrink-0">
          <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white/15 border border-white/20 text-white flex items-center justify-center shrink-0">
                <School className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm sm:text-base font-black text-white truncate">
                {displaySchoolName}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق القائمة"
              className="min-h-[40px] min-w-[40px] p-1.5 rounded-lg text-white/95 hover:text-white hover:bg-white/15 active:scale-95 transition cursor-pointer flex items-center justify-center shrink-0"
              title="إغلاق القائمة"
            >
              <X className="w-6 h-6 stroke-[1.75]" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="max-w-2xl mx-auto w-full min-h-full flex flex-col justify-between">
          <div>
            {/* Profile Card (Crisp Transparent Card so background writing remains visible underneath) */}
            <div className="bg-[#1B4B46]/35 rounded-2xl p-3.5 text-center border border-white/25 shadow-2xs">
              {/* Circular User Initials Avatar */}
              <div className="w-14 h-14 rounded-full mx-auto mb-2 border-2 border-white/85 shadow-sm bg-gradient-to-br from-[#10B981] via-[#0284C7] to-[#0F2D4A] text-white font-black text-base flex items-center justify-center select-none">
                {userInitials}
              </div>

              {/* User Name */}
              <h3 className="font-extrabold text-sm text-white leading-tight truncate px-1">
                {session.name || 'المستخدم'}
              </h3>

              {/* Role */}
              <p className="text-[11px] text-white/90 font-semibold mt-0.5">
                {getRoleTitle()}
              </p>

              {/* Code */}
              <p className="text-[11px] text-white/90 font-bold mt-0.5">
                الكود:{' '}
                <span dir="ltr" className="font-mono text-white">
                  {session.code || '—'}
                </span>
              </p>

              {/* Subscription Badge */}
              <div className="mt-2.5 inline-flex items-center justify-center gap-1.5 bg-[#194742]/55 border border-emerald-200/50 text-emerald-50 rounded-full px-3 py-1 text-[11px] font-bold max-w-full">
                <Clock className="w-3 h-3 text-emerald-200 shrink-0" />
                <span className="truncate">
                  {session.isLifetime
                    ? 'اشتراك المدرسة: دائم مدى الحياة'
                    : `اشتراك المدرسة: ${session.daysRemaining ?? 28} يوم متبقي`}
                </span>
              </div>
            </div>

            {/* Section Header: القائمة */}
            <div className="mt-4 mb-1.5 pr-1">
              <span className="text-[11px] text-white/65 font-bold">القائمة</span>
            </div>

            {/* Navigation List (Clean white typography & smooth ActionForex-style expand/collapse) */}
            <div className="space-y-1">
              {/* 1. Main Dashboard Link */}
              <button
                type="button"
                onClick={() => {
                  onSelectView('dashboard');
                  onClose();
                }}
                className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2.5 transition cursor-pointer ${
                  activeView === 'dashboard'
                    ? 'bg-white/18 text-white border-r-4 border-white shadow-2xs'
                    : 'text-white/95 hover:bg-white/10'
                }`}
              >
                <Home className="w-4 h-4 text-white/90 shrink-0" />
                <span className="truncate">{getMainDashboardLabel()}</span>
              </button>

              {/* 2. مجلد الأرشفة (ActionForex-style collapsible row: chevron rotates & label underlines on open) */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsArchiveOpen((prev) => !prev)}
                  aria-expanded={isArchiveOpen}
                  className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-extrabold flex items-center justify-between transition cursor-pointer ${
                    isArchiveOpen
                      ? 'text-white bg-white/10'
                      : 'text-white/95 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isArchiveOpen ? (
                      <FolderOpen className="w-4 h-4 text-white shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-white/90 shrink-0" />
                    )}
                    <span
                      className={`truncate transition-all ${
                        isArchiveOpen ? 'border-b-2 border-white pb-0.5' : ''
                      }`}
                    >
                      مجلد الأرشفة
                    </span>
                  </div>
                  <ChevronLeft
                    className={`w-4 h-4 text-white/85 transition-transform duration-200 shrink-0 ${
                      isArchiveOpen ? '-rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Smooth Collapsible Sub-sections matching ActionForex submenu reveal */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-250 ease-out motion-reduce:transition-none ${
                    isArchiveOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="mr-4 mt-1 mb-1.5 space-y-0.5 pr-3 border-r border-white/25">
                      {/* PRINCIPAL ARCHIVE SUB-SECTIONS */}
                      {session.role === 'principal' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('archive_monthly');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'archive_monthly'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <CalendarCheck className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">أرشيف التقرير الشهري</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('archive_teacher_activities');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'archive_teacher_activities'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Activity className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">أرشيف أنشطة المعلمين</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('archive_cumulative');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'archive_cumulative'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Award className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">أرشيف التقرير التراكمي السنوي</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('archive_circulars');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'archive_circulars'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Megaphone className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">أرشيف التعاميم والملاحظات الشهري</span>
                          </button>
                        </>
                      )}

                      {/* TEACHER ARCHIVE SUB-SECTIONS */}
                      {session.role === 'teacher' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('archive_questions');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'archive_questions'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <HelpCircle className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">ارشيف الاسئلة</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('archive_grades');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'archive_grades'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">ارشيف الدرجات</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('archive_circulars');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'archive_circulars'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Megaphone className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">ارشيف التعاميم</span>
                          </button>

                          {onOpenRecommendations && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenRecommendations();
                              }}
                              className="w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 text-white/90 hover:text-white hover:bg-white/10 transition cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                              <span className="truncate">توصيات المعلم</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* STUDENT ARCHIVE SUB-SECTIONS */}
                      {session.role === 'student' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('weekly_homework');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'weekly_homework'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <BookOpen className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">ارشيف الواجب الاسبوعي</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('monthly_homework');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'monthly_homework'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <CalendarCheck className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">ارشيف الواجب الشهري</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('monthly_grades');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'monthly_grades'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Award className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">ارشيف درجاتي الشهري</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('monthly_circulars');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'monthly_circulars'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Megaphone className="w-3.5 h-3.5 text-white/85 shrink-0" />
                            <span className="truncate">ارشيف التعاميم الإدارية الشهري</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onSelectView('monthly_recommendations');
                              onClose();
                            }}
                            className={`w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                              activeView === 'monthly_recommendations'
                                ? 'bg-white/18 text-white'
                                : 'text-white/90 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                            <span className="truncate">ارشيف توصيات المعلم الشهري</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. حسابي (للطلاب فقط) */}
              {session.role === 'student' && onOpenAccount && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAccount();
                  }}
                  className="w-full min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2.5 text-white/95 hover:bg-white/10 transition cursor-pointer"
                >
                  <User className="w-4 h-4 text-white/90 shrink-0" />
                  <span className="truncate">حسابي</span>
                </button>
              )}

              {/* 4. قفل الشاشة */}
              <button
                type="button"
                onClick={handleLock}
                className="w-full min-h-[44px] px-3 py-2.5 rounded-xl text-sm font-extrabold flex items-center gap-2.5 text-white/95 hover:bg-white/10 transition cursor-pointer"
              >
                <Lock className="w-4 h-4 text-white/90 shrink-0" />
                <span className="truncate">قفل الشاشة</span>
              </button>
            </div>
          </div>

          {/* 5. تسجيل الخروج */}
          <div className="pt-4 border-t border-white/15 mt-4">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-200/40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xs transition"
            >
              <LogOut className="w-4 h-4 text-rose-100" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
          </div>
        </div>
      </aside>

      {/* Confirmation Modal for Logout */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            dir="rtl"
            className="bg-white rounded-3xl max-w-sm w-full max-h-[90dvh] overflow-y-auto p-5 text-right shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 my-auto"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-black text-gray-900 mb-1.5">
              تأكيد تسجيل الخروج
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed mb-5">
              هل أنت متأكد من تسجيل الخروج؟ عند التأكيد سيتم الخروج من الحساب والعودة لشاشة الدخول.
            </p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>نعم، تسجيل الخروج</span>
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition cursor-pointer"
              >
                لا، إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

