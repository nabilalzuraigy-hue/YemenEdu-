import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Archive,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Compass,
  FileText,
  Flag,
  GraduationCap,
  Image as ImageIcon,
  Megaphone,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  appDataService,
  getGradeLabelAr,
  isSchoolActivityArchivedForDay,
  normalizeGradeCode,
  SupervisorActivity,
  SupervisorActivityCategory,
} from '../services/appData';

interface SchoolBoardViewProps {
  schoolId: string;
  schoolName: string;
  heroTitle?: string;
  heroSubtitle?: string;
  topSlot?: React.ReactNode;
  onOpenSchoolActivitiesArchive?: () => void;
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

const resolveActivityGradeKey = (targetGrade?: string): string => {
  const raw = String(targetGrade || '').trim();
  if (!raw || raw === 'الكل' || raw === 'عام' || raw === 'all') return 'عام';
  const norm = normalizeGradeCode(raw);
  return norm && norm !== 'all' ? norm : raw;
};

const formatTargetClassLabel = (targetGrade?: string, targetClass?: string): string => {
  const gKey = resolveActivityGradeKey(targetGrade);
  const gradePart = gKey === 'عام' ? 'عام لجميع الصفوف' : getGradeLabelAr(gKey);
  const classPart =
    targetClass && targetClass.trim() && targetClass.trim() !== 'الكل'
      ? ` — فصل ${targetClass.trim()}`
      : '';
  return `${gradePart}${classPart}`;
};

export const SchoolBoardView: React.FC<SchoolBoardViewProps> = ({
  schoolId,
  schoolName,
  heroTitle = 'لوحة المدرسة',
  heroSubtitle = 'التقارير والأنشطة والفعاليات المعتمدة مصنفة حسب الصفوف (للقراءة فقط)',
  topSlot,
  onOpenSchoolActivitiesArchive,
}) => {
  const [allApprovedActivities, setAllApprovedActivities] = useState<SupervisorActivity[]>(() =>
    appDataService
      .getSupervisorActivities(schoolId)
      .filter((a) => a.approvalStatus === 'approved')
      .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0))
  );

  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [sectionFilter, setSectionFilter] = useState<'الكل' | 'تقرير' | 'نشاط' | 'فعالية'>('الكل');
  const [gradeFilter, setGradeFilter] = useState<string>('الكل');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!schoolId) {
      setAllApprovedActivities([]);
      return;
    }

    const normalizedSchool = schoolId.trim().toLowerCase();

    const syncLocal = () => {
      const localList = appDataService
        .getSupervisorActivities(schoolId)
        .filter((a) => a.approvalStatus === 'approved')
        .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0));
      setAllApprovedActivities(localList);
    };
    syncLocal();
    const unsubApp = appDataService.subscribe(syncLocal);

    let unsubAct = () => {};
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
            .sort(
              (a, b) =>
                (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0) ||
                (b.activityDate || '').localeCompare(a.activityDate || '')
            );
          setAllApprovedActivities(list);
          if (list.length > 0) {
            appDataService.syncDailySchoolActivitiesArchive(schoolId, list, Date.now()).catch(() => {});
          }
        },
        () => {}
      );
    } catch {}

    return () => {
      unsubApp();
      unsubAct();
    };
  }, [schoolId]);

  // Keep Firestore daily School Activities Archive synced before the start of the next calendar day
  useEffect(() => {
    if (!schoolId || allApprovedActivities.length === 0) return;
    appDataService
      .syncDailySchoolActivitiesArchive(schoolId, allApprovedActivities, nowTick)
      .catch(() => {});
  }, [schoolId, allApprovedActivities, nowTick]);

  // Live board shows today's/upcoming approved items; past days archive automatically before start of next day
  const approvedActivities = useMemo(
    () => allApprovedActivities.filter((a) => !isSchoolActivityArchivedForDay(a, nowTick)),
    [allApprovedActivities, nowTick]
  );

  const archivedPastDaysCount = allApprovedActivities.length - approvedActivities.length;

  const availableGradeKeys = useMemo(() => {
    const base = new Set<string>(['7', '8', '9']);
    approvedActivities.forEach((act) => {
      const k = resolveActivityGradeKey(act.targetGrade);
      if (k !== 'عام') base.add(k);
    });
    return Array.from(base).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b, 'ar');
    });
  }, [approvedActivities]);

  const filteredActivities = useMemo(() => {
    return approvedActivities.filter((act) => {
      if (sectionFilter !== 'الكل' && normalizeCategoryBucket(act.category) !== sectionFilter) {
        return false;
      }
      if (gradeFilter !== 'الكل') {
        const gKey = resolveActivityGradeKey(act.targetGrade);
        if (gKey !== gradeFilter) return false;
      }
      return true;
    });
  }, [approvedActivities, sectionFilter, gradeFilter]);

  // Group filtered activities clearly by Grade (الصف السابع، الصف الثامن، الصف التاسع... + عام)
  const groupedByGrade = useMemo(() => {
    const map = new Map<string, SupervisorActivity[]>();
    filteredActivities.forEach((act) => {
      const gKey = resolveActivityGradeKey(act.targetGrade);
      const list = map.get(gKey) || [];
      list.push(act);
      map.set(gKey, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'عام') return 1;
      if (b === 'عام') return -1;
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b, 'ar');
    });
  }, [filteredActivities]);

  const totalBoardItems = approvedActivities.length;

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
              <span>{totalBoardItems} منشور اليوم</span>
            </span>
          </div>
        </div>
      </div>

      {/* Optional top slot (e.g., Student Term 1 Schedule & Private Attendance shortcuts) */}
      {topSlot}

      {/* Filter Bar (Category + Grade Filters) */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#DCE7F3] shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setSectionFilter(pill.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                  sectionFilter === pill.id
                    ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-2xs'
                    : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-bold text-[#5C7085]">
            تُعرض حسب الصفوف • تُؤرشف قبل بداية اليوم التالي تلقائياً
          </span>
        </div>

        {/* Grade Selector Row */}
        <div className="pt-2.5 border-t border-[#DCE7F3] flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-black text-[#1A3A5F] flex items-center gap-1 ml-1">
            <GraduationCap className="w-3.5 h-3.5 text-[#1F5AAA]" />
            <span>حسب الصف:</span>
          </span>
          <button
            type="button"
            onClick={() => setGradeFilter('الكل')}
            className={`px-3 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
              gradeFilter === 'الكل'
                ? 'bg-[#1A3A5F] text-white border-[#1A3A5F]'
                : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
            }`}
          >
            كل الصفوف ({approvedActivities.length})
          </button>
          {availableGradeKeys.map((gKey) => {
            const count = approvedActivities.filter(
              (a) => resolveActivityGradeKey(a.targetGrade) === gKey
            ).length;
            return (
              <button
                key={`sb-grade-${gKey}`}
                type="button"
                onClick={() => setGradeFilter(gKey)}
                className={`px-3 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                  gradeFilter === gKey
                    ? 'bg-[#1F5AAA] text-white border-[#194B91]'
                    : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                }`}
              >
                {getGradeLabelAr(gKey)} ({count})
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setGradeFilter('عام')}
            className={`px-3 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
              gradeFilter === 'عام'
                ? 'bg-[#1F5AAA] text-white border-[#194B91]'
                : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
            }`}
          >
            عام لجميع الصفوف (
            {approvedActivities.filter((a) => resolveActivityGradeKey(a.targetGrade) === 'عام').length}
            )
          </button>
        </div>
      </div>

      {/* Notice banner when past-day approved activities were auto-archived before start of next day */}
      {archivedPastDaysCount > 0 && (
        <div className="bg-[#EEF5FC] rounded-2xl px-4 py-3 border border-[#C6DCF2] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-[#1A3A5F] font-bold">
            <Archive className="w-4 h-4 text-[#1F5AAA] shrink-0" />
            <span>
              تمت أرشفة {archivedPastDaysCount} تقرير/نشاط من الأيام السابقة تلقائياً في أرشفة الأنشطة المدرسية حسب الصف
            </span>
          </div>
          {onOpenSchoolActivitiesArchive && (
            <button
              type="button"
              onClick={onOpenSchoolActivitiesArchive}
              className="px-3 py-1.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black inline-flex items-center gap-1 shadow-2xs cursor-pointer transition"
            >
              <span>فتح أرشفة الأنشطة المدرسية</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {filteredActivities.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2 shadow-sm">
          <Sparkles className="w-10 h-10 text-[#9BBEDF] mx-auto" />
          <h3 className="font-black text-sm sm:text-base text-[#1A3A5F]">
            لا توجد منشورات معتمدة لليوم الحالي في هذا التصنيف
          </h3>
          <p className="text-xs text-[#5C7085] font-semibold max-w-md mx-auto leading-relaxed">
            تظهر هنا تلقائياً التقارير والأنشطة والفعاليات فور اعتمادها من مدير المدرسة مصنفة حسب الصفوف، وتنتقل تلقائياً قبل بداية اليوم التالي إلى أرشفة الأنشطة المدرسية.
          </p>
        </div>
      )}

      {/* Approved Reports, Activities, and Events Grouped by Grade */}
      {groupedByGrade.length > 0 && (
        <div className="space-y-5">
          {groupedByGrade.map(([gradeKey, gradeItems]) => {
            const gradeSectionTitle =
              gradeKey === 'عام'
                ? 'أنشطة وتقارير وفعاليات عامة لجميع الصفوف'
                : getGradeLabelAr(gradeKey);

            return (
              <section key={`board-grade-${gradeKey}`} className="space-y-3">
                <div className="bg-[#EEF5FC] border border-[#C6DCF2] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-[#1F5AAA]" />
                    <span>{gradeSectionTitle}</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-white text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black tabular-nums">
                    {gradeItems.length} منشور
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {gradeItems.map((act) => {
                    const bucket = normalizeCategoryBucket(act.category);
                    const Icon = getBucketIcon(bucket, act.subType);
                    const images = Array.isArray(act.images) ? act.images : [];
                    const classLabel = formatTargetClassLabel(act.targetGrade, act.targetClass);
                    return (
                      <article
                        key={act.id}
                        className="bg-white rounded-2xl overflow-hidden border border-[#DCE7F3] shadow-sm flex flex-col justify-between"
                      >
                        {/* Primary Cover Photo or Clean Visual Header */}
                        {images.length > 0 ? (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setLightboxImage(images[0])}
                              className="block w-full aspect-video bg-[#F4F8FC] overflow-hidden cursor-pointer group"
                              title="عرض الصورة بالحجم الكامل"
                            >
                              <img
                                src={images[0]}
                                alt={act.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            </button>
                            {images.length > 1 && (
                              <div className="grid grid-cols-2 gap-1.5 p-2 bg-[#F4F8FC] border-t border-[#DCE7F3]">
                                {images.slice(1).map((imgUrl, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setLightboxImage(imgUrl)}
                                    className="relative rounded-xl overflow-hidden border border-[#DCE7F3] bg-white aspect-video cursor-pointer group"
                                    title="عرض الصورة بالحجم الكامل"
                                  >
                                    <img
                                      src={imgUrl}
                                      alt={`${act.title} - صورة ${idx + 2}`}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/55 text-white text-[10px] font-bold flex items-center gap-0.5">
                                      <ImageIcon className="w-2.5 h-2.5" />
                                      <span>{idx + 2}</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="px-4 py-3 bg-gradient-to-l from-[#EEF5FC] to-[#F4F8FC] border-b border-[#DCE7F3] flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#1F5AAA]">
                              <Icon className="w-4 h-4" />
                              <span>{bucket} مدرسي معتمد</span>
                            </span>
                            <span className="text-[11px] font-bold text-[#5C7085] tabular-nums">
                              {act.activityDate}
                            </span>
                          </div>
                        )}

                        <div className="p-4 sm:p-5 space-y-3 flex-1 flex flex-col justify-between">
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
                              {act.formalText || act.details}
                            </p>
                          </div>

                          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C7085] font-semibold">
                            <span className="flex items-center gap-1 text-[#1A3A5F] font-bold">
                              <GraduationCap className="w-3.5 h-3.5 text-[#1F5AAA]" />
                              <span>الصف: {classLabel}</span>
                            </span>
                            <span>اعتماد: {act.approvedBy || 'مدير المدرسة'}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
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
