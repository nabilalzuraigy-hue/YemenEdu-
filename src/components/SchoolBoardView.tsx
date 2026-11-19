import React, { useState, useEffect } from 'react';
import {
  Activity,
  BookOpen,
  Calendar,
  CheckCircle2,
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
  SupervisorActivity,
  SupervisorActivityCategory,
} from '../services/appData';

interface SchoolBoardViewProps {
  schoolId: string;
  schoolName: string;
  heroTitle?: string;
  heroSubtitle?: string;
  topSlot?: React.ReactNode;
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

const formatTargetClassLabel = (targetGrade?: string, targetClass?: string): string => {
  const gradePart =
    !targetGrade || targetGrade === 'الكل' ? 'جميع الصفوف' : getGradeLabelAr(targetGrade);
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
  heroSubtitle = 'التقارير والأنشطة والفعاليات المعتمدة من مدير المدرسة (للقراءة فقط)',
  topSlot,
}) => {
  const [approvedActivities, setApprovedActivities] = useState<SupervisorActivity[]>(() =>
    appDataService
      .getSupervisorActivities(schoolId)
      .filter((a) => a.approvalStatus === 'approved')
      .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0))
  );

  const [sectionFilter, setSectionFilter] = useState<'الكل' | 'تقرير' | 'نشاط' | 'فعالية'>('الكل');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) {
      setApprovedActivities([]);
      return;
    }

    const normalizedSchool = schoolId.trim().toLowerCase();

    const syncLocal = () => {
      setApprovedActivities(
        appDataService
          .getSupervisorActivities(schoolId)
          .filter((a) => a.approvalStatus === 'approved')
          .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0))
      );
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
          setApprovedActivities(list);
        },
        () => {}
      );
    } catch {}

    return () => {
      unsubApp();
      unsubAct();
    };
  }, [schoolId]);

  const filteredActivities = approvedActivities.filter((act) => {
    if (sectionFilter === 'الكل') return true;
    return normalizeCategoryBucket(act.category) === sectionFilter;
  });

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
              <span>{totalBoardItems} منشور معتمد</span>
            </span>
          </div>
        </div>
      </div>

      {/* Optional top slot (e.g., Student Term 1 Schedule & Private Attendance shortcuts) */}
      {topSlot}

      {/* Filter Bar (Reports / Activities / Events only — NO Attendance on public School Board) */}
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
          مرتبة من الأحدث للأقدم
        </span>
      </div>

      {/* Empty State */}
      {filteredActivities.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2 shadow-sm">
          <Sparkles className="w-10 h-10 text-[#9BBEDF] mx-auto" />
          <h3 className="font-black text-sm sm:text-base text-[#1A3A5F]">
            لا توجد منشورات معتمدة في لوحة المدرسة حالياً
          </h3>
          <p className="text-xs text-[#5C7085] font-semibold max-w-md mx-auto leading-relaxed">
            تظهر هنا تلقائياً التقارير والأنشطة والفعاليات فور اعتمادها من مدير المدرسة، مرتبة من الأحدث إلى الأقدم.
          </p>
        </div>
      )}

      {/* Approved Reports, Activities, and Events (Read-Only, Newest First) */}
      {filteredActivities.length > 0 && (
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
                        <span>الفصل: {classLabel}</span>
                      </span>
                      <span>اعتماد: {act.approvedBy || 'مدير المدرسة'}</span>
                    </div>
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
