import React from 'react';
import { Menu, Lock, LogOut, School } from 'lucide-react';
import { UserSession } from '../services/authService';
import { formatArabicSchoolName, getUserInitials } from '../utils/schoolDisplay';

interface HeaderProps {
  session: UserSession;
  onLogout?: () => void;
  onOpenActivation?: () => void;
  onLock?: () => void;
  onOpenSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  session,
  onLogout,
  onLock,
  onOpenSidebar,
}) => {
  const displaySchoolName = formatArabicSchoolName(session.schoolName, session.schoolId);
  const userInitials = getUserInitials(session.name);

  const handleToggle = () => {
    if (onOpenSidebar) {
      onOpenSidebar();
    } else {
      window.dispatchEvent(new CustomEvent('toggle-sidebar'));
    }
  };

  // System Admin keeps its admin lock/logout header
  if (session.role === 'admin' || session.role === 'super_admin') {
    return (
      <header className="sticky top-0 z-40 bg-[#B3CDE8] text-[#1A3A5F] shadow-sm border-b border-[#9BBEDF] px-3 sm:px-6 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/90 border border-[#9BBEDF] flex items-center justify-center shadow-xs shrink-0">
              <School className="w-5 h-5 sm:w-6 sm:h-6 text-[#1E5AA8]" />
            </div>
            <div className="text-right min-w-0">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-[#1A3A5F] block truncate">
                {displaySchoolName}
              </span>
              <span className="text-[11px] font-bold text-[#1E5AA8] block truncate">
                {session.name} • مدير النظام
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {onLock && (
              <button
                type="button"
                onClick={onLock}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-sky-50 text-[#1E5AA8] border border-[#9BBEDF] flex items-center gap-1.5 transition cursor-pointer shadow-xs font-bold text-xs"
              >
                <Lock className="w-4 h-4" />
                <span className="hidden sm:inline">قفل مؤقت</span>
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-red-50 text-red-600 border border-red-200 flex items-center gap-1.5 transition cursor-pointer shadow-xs font-bold text-xs"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">خروج نهائي</span>
              </button>
            )}
          </div>
        </div>
      </header>
    );
  }

  // Unified Clean Header for Principal, Teacher, and Student (Calm Pure White & Azure matching reference)
  return (
    <header dir="rtl" className="sticky top-0 z-40 bg-white border-b border-[#DCE7F3] shadow-xs px-3 sm:px-6 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        {/* Right side (RTL start): Hamburger Menu Button ☰ */}
        <button
          type="button"
          onClick={handleToggle}
          aria-label="فتح القائمة"
          className="w-10 h-10 rounded-2xl bg-[#F4F8FC] hover:bg-[#E8F1FB] border border-[#DCE7F3] flex items-center justify-center text-[#1A3A5F] shadow-2xs transition cursor-pointer active:scale-95 shrink-0"
          title="القائمة"
        >
          <Menu className="w-5 h-5 text-[#1A3A5F]" />
        </button>

        {/* Center: Dynamic School Name in Arabic (from Excel / school record) */}
        <div className="flex items-center justify-center min-w-0 px-2">
          <span className="text-base sm:text-xl font-black text-[#1E88E5] truncate">
            {displaySchoolName}
          </span>
        </div>

        {/* Left side (RTL end): Circular User Initials Avatar */}
        <div
          title={session.name}
          aria-label={session.name}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-[#B3CDE8] shadow-2xs bg-[#EEF5FC] text-[#1F5AAA] font-black text-xs sm:text-sm flex items-center justify-center shrink-0 select-none"
        >
          {userInitials}
        </div>
      </div>
    </header>
  );
};
