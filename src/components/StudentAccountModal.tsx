import React from 'react';
import {
  X,
  User,
  School,
  BookOpen,
  Clock,
  Calendar,
  Lock,
  LogOut,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { UserSession } from '../services/authService';
import { formatArabicSchoolName } from '../utils/schoolDisplay';

interface StudentAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession;
  gradeLabel: string;
  onLock: () => void;
  onLogout: () => void;
}

export const StudentAccountModal: React.FC<StudentAccountModalProps> = ({
  isOpen,
  onClose,
  session,
  gradeLabel,
  onLock,
  onLogout,
}) => {
  if (!isOpen) return null;

  const formattedExpiry = new Date(session.expiresAt).toLocaleDateString('ar-YE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto font-['Cairo','Tajawal']">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[90dvh] overflow-y-auto shadow-2xl border border-gray-200 text-right animate-in fade-in zoom-in-95 my-auto">
        
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-[#1A3A5F] to-[#1E5AA8] text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-sky-300 border border-white/20 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-base truncate">بيانات حسابي المدرسي</h3>
              <p className="text-xs text-blue-200 truncate">ملف الطالب والبيانات المدرسية</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Card */}
        <div className="p-4 sm:p-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1A3A5F] to-[#1E5AA8] text-white flex items-center justify-center mx-auto mb-3 shadow-md border-2 border-white">
            <User className="w-8 h-8" />
          </div>
          <h2 className="text-base font-black text-[#1A3A5F]">{session.name}</h2>
          <p className="text-xs text-[#1E5AA8] font-bold mt-0.5">{gradeLabel}</p>

          <div className="my-4 divide-y divide-gray-100 text-right text-xs bg-[#F8FAFC] rounded-2xl p-3 border border-gray-200">
            <div className="py-2 flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">كود الطالب:</span>
              <span className="font-mono font-bold text-[#1E5AA8] bg-white px-2 py-0.5 rounded border border-gray-200 break-all">{session.code}</span>
            </div>
            <div className="py-2 flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">المدرسة:</span>
              <span className="font-bold text-[#1A3A5F] text-left break-words">{formatArabicSchoolName(session.schoolName, session.schoolId)}</span>
            </div>
            <div className="py-2 flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">الصف الدراسي:</span>
              <span className="font-bold text-[#1A3A5F]">{gradeLabel}</span>
            </div>
            <div className="py-2 flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">صلاحية الحساب:</span>
              <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {session.daysRemaining} يوماً متبقية
              </span>
            </div>
            <div className="py-2 flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">تاريخ الانتهاء:</span>
              <span className="font-semibold text-gray-700">{formattedExpiry}م</span>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <button
              onClick={() => {
                onClose();
                onLock();
              }}
              className="w-full py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E5AA8] border border-blue-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>قفل الشاشة مؤقتاً</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج والعودة لشاشة التفعيل</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
