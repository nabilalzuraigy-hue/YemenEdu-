import React, { useState, useEffect } from 'react';
import {
  Activity,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  FileText,
  Flag,
  GraduationCap,
  Image as ImageIcon,
  Megaphone,
  Sparkles,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  appDataService,
  AttendanceRecord,
  AttendanceStatus,
  getGradeLabelAr,
  SupervisorActivity,
  SupervisorActivityCategory,
} from '../services/appData';

interface SchoolBoardViewProps {
  schoolId: string;
  schoolName: string;
  heroTitle?: string;
  heroSubtitle?: string;
  topSlot?: React.ReactNode;
  defaultGradeFilter?: string;
}

const normalizeCategoryBucket = (cat: SupervisorActivityCategory): 'تقرير' | 'نشاط' | 'فعالية' => {
  if (cat === 'تقرير') return 'تقرير';
  if (cat === 'فعالية') return 'فعالية';
  return 'نشاط';
};

const getBucketIcon = (bucket: 'تقرير' | 'نشاط' | 'فعالية', subType?: string) => {
  if (bucket === 'تقرير') return FileText;
  if (bucket === 'فعالية') return Flag;
  if (subType?.includes('ثقافي') || subType?.includes('مسابقة')) return BookOpen;
  if (subType?.includes('رحلة')) return Compass;
  return Trophy;
};

const getStatusCardStyle = (status: AttendanceStatus) => {
  switch (status) {
    case 'حاضر':
      return {
        card: 'bg-emerald-50/90 border-emerald-300',
        badge: 'bg-emerald-600 text-white',
        label: 'حاضر',
      };
    case 'غائب بعذر':
      return {
        card: 'bg-sky-50/90 border-sky-300',
        badge: 'bg-[#1F5AAA] text-white',
        label: 'غائب بعذر',
      };
    case 'متأخر':
      return {
        card: 'bg-amber-50/90 border-amber-300',
        badge: 'bg-amber-500 text-white',
        label: 'متأخر',
      };
    case 'غائب بدون عذر':
    case 'غائب':
    default:
      return {
        card: 'bg-rose-50/90 border-rose-300',
        badge: 'bg-rose-600 text-white',
        label: 'غائب بدون عذر',
      };
  }
};

export const SchoolBoardView: React.FC<SchoolBoardViewProps> = ({
  schoolId,
  schoolName,
  heroTitle = 'لوحة المدرسة',
  heroSubtitle = 'التقارير والأنشطة والفعاليات وكشوفات الحضور والغياب المعتمدة من إدارة المدرسة',
  topSlot,
}) => {
  const [approvedActivities, setApprovedActivities] = useState<SupervisorActivity[]>(() =>
    appDataService.getSupervisorActivities(schoolId).filter((a) => a.approvalStatus === 'approved')
  );
  const [approvedAttendance, setApprovedAttendance] = useState<AttendanceRecord[]>(() =>
    appDataService.getAttendanceRecords(schoolId).filter((r) => r.approvalStatus === 'approved')
  );

  const [sectionFilter, setSectionFilter] = useState<
    'الكل' | 'تقرير' | 'نشاط' | 'فعالية' | 'الحضور والغياب'
  >('الكل');
  const [expandedAttIds, setExpandedAttIds] = useState<Record<string, boolean>>({});
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) {
      setApprovedActivities([]);
      setApprovedAttendance([]);
      return;
    }

    const normalizedSchool = schoolId.trim().toLowerCase();

    const syncLocal = () => {
      setApprovedActivities(
        appDataService
          .getSupervisorActivities(schoolId)
          .filter((a) => a.approvalStatus === 'approved')
      );
      setApprovedAttendance(
        appDataService
          .getAttendanceRecords(schoolId)
          .filter((r) => r.approvalStatus === 'approved')
      );
    };
    syncLocal();
    const unsubApp = appDataService.subscribe(syncLocal);

    let unsubAct = () => {};
    let unsubAtt = () => {};

    try {
      const qAct = query(collection(db, 'supervisor_activities'), where('schoolId', '==', schoolId));
      unsubAct = onSnapshot(
        qAct,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as SupervisorActivity))
            .filter(
              (a) =>
                (a.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                a.approvalStatus === 'approved'
            )
            .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0));
          setApprovedActivities(list);
        },
        () => {}
      );
    } catch {}

    try {
      const qAtt = query(collection(db, 'attendance_records'), where('schoolId', '==', schoolId));
      unsubAtt = onSnapshot(
        qAtt,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as AttendanceRecord))
            .filter(
              (r) =>
                (r.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                r.approvalStatus === 'approved'
            )
            .sort(
              (a, b) =>
                (b.date || '').localeCompare(a.date || '') ||
                (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0)
            );
          setApprovedAttendance(list);
        },
        () => {}
      );
    } catch {}

    return () => {
      unsubApp();
      unsubAct();
      unsubAtt();
    };
  }, [schoolId]);

  const filteredActivities = approvedActivities.filter((act) => {
    if (sectionFilter === 'الحضور والغياب') return false;
    if (sectionFilter === 'الكل') return true;
    return normalizeCategoryBucket(act.category) === sectionFilter;
  });

  const showAttendance = sectionFilter === 'الكل' || sectionFilter === 'الحضور والغياب';
  const showActivities = sectionFilter !== 'الحضور والغياب';

  const totalBoardItems = approvedActivities.length + approvedAttendance.length;

  return (
    <div dir="rtl" className="space-y-5 text-right font-['Cairo','Tajawal']">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] shadow-[0_6px_20px_rgba(26,58,95,0.08)] p-5 sm:p-6 text-[#1A3A5F]">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white text-[#1F5AAA] border border-[#DCE7F3] flex items-center justify-center shadow-xs shrink-0">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[#1A3A5F] tracking-tight">
                {heroTitle}
              </h2>
              <p className="text-xs sm:text-sm font-bold text-[#28486B] mt-0.5">
                {schoolName} • {heroSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1.5 rounded-full bg-white/95 border border-[#C6DCF2] text-xs font-black text-[#1F5AAA] flex items-center gap-1.5 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{totalBoardItems} منشور معتمد</span>
            </span>
          </div>
        </div>
      </div>

      {/* Optional top slot (e.g., Student Term 1 Schedule shortcut) */}
      {topSlot}

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-[#DCE7F3] shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'الكل', label: `الكل (${totalBoardItems})` },
              {
                id: 'تقرير',
                label: `التقارير (${approvedActivities.filter((a) => normalizeCategoryBucket(a.category) === 'تقرير').length})`,
              },
              {
                id: 'نشاط',
                label: `الأنشطة (${approvedActivities.filter((a) => normalizeCategoryBucket(a.category) === 'نشاط').length})`,
              },
              {
                id: 'فعالية',
                label: `الفعاليات (${approvedActivities.filter((a) => normalizeCategoryBucket(a.category) === 'فعالية').length})`,
              },
              {
                id: 'الحضور والغياب',
                label: `الحضور والغياب (${approvedAttendance.length})`,
              },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setSectionFilter(pill.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                sectionFilter === pill.id
                  ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-2xs'
                  : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {((showActivities && filteredActivities.length === 0 && (!showAttendance || approvedAttendance.length === 0)) ||
        (!showActivities && approvedAttendance.length === 0)) && (
        <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2 shadow-sm">
          <Sparkles className="w-10 h-10 text-[#9BBEDF] mx-auto" />
          <h3 className="font-black text-sm sm:text-base text-[#1A3A5F]">
            لا توجد منشورات معتمدة في لوحة المدرسة حالياً
          </h3>
          <p className="text-xs text-[#5C7085] font-semibold max-w-md mx-auto leading-relaxed">
            تظهر هنا تلقائياً التقارير والأنشطة والفعاليات وكشوفات الحضور والغياب فور اعتمادها من مدير المدرسة.
          </p>
        </div>
      )}

      {/* Approved Attendance Records (Prominent Cards per grade & class) */}
      {showAttendance && approvedAttendance.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-[#1F5AAA]" />
              <span>كشوفات الحضور والغياب المعتمدة</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
              {approvedAttendance.length} كشف معتمد
            </span>
          </div>

          <div className="space-y-3">
            {approvedAttendance.map((rec) => {
              const excusedCount =
                rec.absentExcusedCount ??
                rec.entries.filter((e) => e.status === 'غائب بعذر').length;
              const unexcusedCount =
                rec.absentUnexcusedCount ??
                rec.entries.filter((e) => e.status === 'غائب بدون عذر' || e.status === 'غائب').length;
              const isExpanded = expandedAttIds[rec.id] ?? approvedAttendance.length <= 2;

              return (
                <div
                  key={rec.id}
                  className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-emerald-300 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>معتمد</span>
                        </span>
                        <h4 className="font-black text-sm sm:text-base text-[#1A3A5F]">
                          {rec.gradeLabel} — فصل {rec.classNumber}
                        </h4>
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-mono font-bold">
                          {rec.date}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-[#5C7085]">
                        رفع المشرف: {rec.recordedBy} • اعتمد بواسطة: {rec.approvedBy || 'مدير المدرسة'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAttIds((prev) => ({ ...prev, [rec.id]: !isExpanded }))
                      }
                      className="px-3 py-1.5 rounded-xl bg-[#F4F8FC] hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#DCE7F3] text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{isExpanded ? 'طي الكروت' : `عرض الكروت (${rec.entries.length})`}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Summary Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                      حاضر: {rec.presentCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-sky-50 text-[#1F5AAA] border border-[#C6DCF2] tabular-nums">
                      غائب بعذر: {excusedCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 tabular-nums">
                      غائب بدون عذر: {unexcusedCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 tabular-nums">
                      متأخر: {rec.lateCount}
                    </span>
                  </div>

                  {/* Prominent Student Cards (كروت بارزة) */}
                  {isExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
                      {rec.entries.map((entry, idx) => {
                        const style = getStatusCardStyle(entry.status);
                        return (
                          <div
                            key={`${rec.id}_${idx}`}
                            className={`rounded-2xl p-3 border shadow-2xs flex flex-col justify-between gap-1.5 ${style.card}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-[10px] font-black text-[#5C7085] block">
                                  طالب #{idx + 1}
                                </span>
                                <span className="font-black text-xs sm:text-sm text-[#1A3A5F] break-words">
                                  {entry.studentName}
                                </span>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-black shrink-0 shadow-2xs ${style.badge}`}
                              >
                                {style.label}
                              </span>
                            </div>
                            {entry.note && (
                              <p className="text-[11px] font-semibold text-[#1A3A5F]/80 bg-white/75 rounded-lg px-2 py-1 border border-white">
                                ملاحظة: {entry.note}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Approved Reports, Activities, and Events */}
      {showActivities && filteredActivities.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#1F5AAA]" />
              <span>التقارير والأنشطة والفعاليات المعتمدة</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
              {filteredActivities.length} منشور
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredActivities.map((act) => {
              const bucket = normalizeCategoryBucket(act.category);
              const Icon = getBucketIcon(bucket, act.subType);
              const images = Array.isArray(act.images) ? act.images : [];
              return (
                <article
                  key={act.id}
                  className="bg-white rounded-2xl p-4 sm:p-5 border-2 border-emerald-300 shadow-sm flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                          <Icon className="w-3.5 h-3.5" />
                          <span>{bucket}</span>
                        </span>
                        {(act.subType || (act.category !== bucket && act.category)) && (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-[#1A3A5F] border border-slate-200 text-[11px] font-bold">
                            {act.subType || act.category}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>معتمد</span>
                        </span>
                      </div>

                      <span className="text-[11px] font-bold text-[#5C7085] flex items-center gap-1 tabular-nums">
                        <Calendar className="w-3 h-3 text-[#1F5AAA]" />
                        <span>{act.activityDate}</span>
                      </span>
                    </div>

                    <h4 className="font-black text-sm sm:text-base text-[#1A3A5F] leading-snug">
                      {act.title}
                    </h4>

                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                      {act.details}
                    </p>

                    {images.length > 0 && (
                      <div
                        className={`grid gap-2 pt-1 ${
                          images.length === 1
                            ? 'grid-cols-1'
                            : images.length === 2
                            ? 'grid-cols-2'
                            : 'grid-cols-3'
                        }`}
                      >
                        {images.map((imgUrl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setLightboxImage(imgUrl)}
                            className="group relative rounded-xl overflow-hidden border border-[#DCE7F3] bg-[#F4F8FC] aspect-video cursor-pointer"
                            title="عرض الصورة بالحجم الكامل"
                          >
                            <img
                              src={imgUrl}
                              alt={`${act.title} - صورة ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-bold flex items-center gap-1">
                              <ImageIcon className="w-2.5 h-2.5" />
                              <span>{idx + 1}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C7085] font-semibold">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5 text-[#1F5AAA]" />
                      <span>
                        {act.targetGrade === 'الكل' || !act.targetGrade
                          ? 'جميع الصفوف'
                          : getGradeLabelAr(act.targetGrade)}
                      </span>
                    </span>
                    <span>
                      المشرف: {act.createdBy} • اعتماد: {act.approvedBy || 'مدير المدرسة'}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-white rounded-2xl p-2 shadow-2xl border border-[#DCE7F3]"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center cursor-pointer"
              aria-label="إغلاق الصورة"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="معاينة الصورة"
              className="w-full max-h-[82dvh] object-contain rounded-xl bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
};
