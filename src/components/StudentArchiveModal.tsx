import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  FileText,
  Award,
  Megaphone,
  Sparkles,
  Clock,
  CheckCircle2,
  BookOpen,
  Lock,
  Trophy,
  Flag,
  GraduationCap,
  Image as ImageIcon,
  Folder,
  FolderOpen,
  ArrowRight,
  ChevronDown,
  UserCheck,
} from 'lucide-react';
import { UserSession, authService, getSubjectsForGrade } from '../services/authService';
import {
  Question,
  HomeworkSubmission,
  GradeRecord,
  MonthlyGradebookRecord,
  MonthlyHomeworkArchiveBatch,
  SchoolActivityArchiveBatch,
  SupervisorActivity,
  Announcement,
  TeacherRecommendation,
  ACADEMIC_MONTHS,
  getCurrentAcademicMonth,
  getGradeLabelAr,
  isObjectiveQuestion,
  getQuestionTimestamp,
  formatDayKeyFromTimestamp,
  formatArabicDayLabel,
  formatArabicDateTime,
  formatAnnouncementTargetGradesAr,
  normalizeGradeCode,
  isSchoolActivityArchivedForDay,
  getSchoolActivityDayKey,
  getSchoolActivityTimestamp,
} from '../services/appData';
import { StudentArchiveSection } from './UnifiedSidebar';
import { formatArabicSchoolName, getSchoolPrincipalName, isGenericPrincipalSender, isSimulationAnnouncement } from '../utils/schoolDisplay';
import {
  StudentSubjectGradeTables,
  canonicalSubjectName,
  getAcademicMonthFromTimestamp,
  resolveRecordTimestamp,
} from './StudentSubjectGradeTables';

interface StudentArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: StudentArchiveSection | null;
  session: UserSession;
  questions: Question[];
  archivedHomeworkBatches?: MonthlyHomeworkArchiveBatch[];
  archivedSchoolActivityBatches?: SchoolActivityArchiveBatch[];
  approvedSchoolActivities?: SupervisorActivity[];
  submissions: HomeworkSubmission[];
  studentGrades: GradeRecord[];
  archivedGradebooks: MonthlyGradebookRecord[];
  announcements: Announcement[];
  recommendations: TeacherRecommendation[];
}

export const StudentArchiveModal: React.FC<StudentArchiveModalProps> = ({
  isOpen,
  onClose,
  section,
  session,
  archivedHomeworkBatches = [],
  archivedSchoolActivityBatches = [],
  approvedSchoolActivities = [],
  submissions,
  studentGrades,
  archivedGradebooks,
  announcements,
  recommendations,
}) => {
  const [openedMonthFolder, setOpenedMonthFolder] = useState<string | null>(null);
  const [expandedHwDayKeys, setExpandedHwDayKeys] = useState<Record<string, boolean>>({});
  const [selectedHwSubject, setSelectedHwSubject] = useState<string>('الكل');
  const [selectedGradeSubject, setSelectedGradeSubject] = useState<string>('الكل');
  const [selectedRecSubject, setSelectedRecSubject] = useState<string>('الكل');
  const [selectedSchoolActivityCat, setSelectedSchoolActivityCat] = useState<'الكل' | 'تقرير' | 'نشاط' | 'فعالية'>('الكل');
  const [selectedSchoolActivityGrade, setSelectedSchoolActivityGrade] = useState<string>('الكل');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOpenedMonthFolder(null);
      setExpandedHwDayKeys({});
      setSelectedHwSubject('الكل');
      setSelectedGradeSubject('الكل');
      setSelectedRecSubject('الكل');
      setSelectedSchoolActivityCat('الكل');
      setSelectedSchoolActivityGrade('الكل');
    }
  }, [isOpen, section]);

  if (!isOpen || !section) return null;

  const gradeSubjects = getSubjectsForGrade(session.grade || session.class || '8').map((s) => s.nameAr);
  const currentAcademicMonth = getCurrentAcademicMonth();

  const resolveItemMonth = (item: any): string => {
    if (item?.month && (ACADEMIC_MONTHS as readonly string[]).includes(item.month)) {
      return item.month;
    }
    const ts = resolveRecordTimestamp(item);
    return ts > 0 ? getAcademicMonthFromTimestamp(ts) : currentAcademicMonth;
  };

  const resolveAnnouncementMonth = (anc: Announcement): string => {
    if ((anc as any)?.month && (ACADEMIC_MONTHS as readonly string[]).includes((anc as any).month)) {
      return (anc as any).month;
    }
    const ts = getQuestionTimestamp(anc);
    return ts > 0 ? getAcademicMonthFromTimestamp(ts) : currentAcademicMonth;
  };

  const sectionMeta = {
    monthly_homework: {
      title: 'أرشيف الواجبات الشهرية',
      subtitle: 'تصفح مجلدات الواجبات والتسليمات الشهرية حسب الشهور الدراسية',
      icon: FileText,
      color: 'from-[#1F5AAA] to-[#163F7A]',
    },
    monthly_grades: {
      title: 'أرشيف درجاتي الشهري',
      subtitle: 'مجلدات كشف الدرجات والتقييمات الشهرية لكل مادة',
      icon: Award,
      color: 'from-emerald-600 to-teal-800',
    },
    monthly_circulars: {
      title: 'أرشيف التعاميم الإدارية الشهري',
      subtitle: 'التوجيهات والتعاميم المدرسية الرسمية المؤرشفة في مجلدات شهرية',
      icon: Megaphone,
      color: 'from-amber-600 to-orange-700',
    },
    monthly_recommendations: {
      title: 'أرشيف توصيات المعلم الشهري',
      subtitle: 'توصيات وتعليمات المعلمين التربوية المؤرشفة في مجلدات شهرية',
      icon: Sparkles,
      color: 'from-emerald-600 via-[#1E5AA8] to-amber-600',
    },
    school_activities_archive: {
      title: 'أرشفة الأنشطة المدرسية',
      subtitle: 'التقارير والأنشطة والفعاليات المعتمدة المؤرشفة في مجلدات شهرية',
      icon: Trophy,
      color: 'from-[#1F5AAA] via-[#17488F] to-emerald-700',
    },
  }[section];

  const IconComponent = sectionMeta.icon;

  const resolveArchivedQuestionMonth = (item: any, fallbackMonth?: string): string => {
    if (item?.month && (ACADEMIC_MONTHS as readonly string[]).includes(item.month)) {
      return item.month;
    }
    const ts = item?.timestamp || getQuestionTimestamp(item) || resolveRecordTimestamp(item);
    if (ts > 0) return getAcademicMonthFromTimestamp(ts);
    return fallbackMonth || currentAcademicMonth;
  };

  // Deduplicated archived homework questions across all batches
  const getArchivedHwItemsForMonth = (monthName: string) => {
    const byKey = new Map<string, any>();
    archivedHomeworkBatches.forEach((b) => {
      (b.questions || []).forEach((q) => {
        const qMonth = resolveArchivedQuestionMonth(q, b.monthName);
        if (qMonth !== monthName) return;
        const key = q.id || `${q.subject}_${q.questionText}_${q.timestamp}`;
        if (!byKey.has(key)) {
          byKey.set(key, { kind: 'question' as const, data: q, timestamp: q.timestamp || getQuestionTimestamp(q) || Date.now(), subject: (q.subject || 'المادة').trim() });
        }
      });
    });

    const batchQIds = new Set(Array.from(byKey.values()).map((v) => v.data.id).filter(Boolean));
    const todayKey = formatDayKeyFromTimestamp(Date.now());
    submissions.forEach((s, idx) => {
      const ts = resolveRecordTimestamp(s);
      const sMonth = ts > 0 ? getAcademicMonthFromTimestamp(ts) : resolveItemMonth(s);
      if (sMonth !== monthName) return;
      if (s.questionId && batchQIds.has(s.questionId)) return;
      if (ts > 0 && formatDayKeyFromTimestamp(ts) >= todayKey) return;
      const key = s.questionId || s.id || `sub_${idx}`;
      if (!byKey.has(key)) {
        byKey.set(key, { kind: 'submission' as const, data: s, timestamp: ts || Date.now(), subject: (s.subject || 'المادة').trim() });
      }
    });

    return Array.from(byKey.values());
  };

  // Count items per academic month folder for visual badges
  const getFolderItemCount = (monthName: string): number => {
    if (section === 'monthly_homework') {
      return getArchivedHwItemsForMonth(monthName).length;
    }
    if (section === 'monthly_grades') {
      const monthGrades = studentGrades.filter((g) => resolveItemMonth(g) === monthName);
      const monthSubs = submissions.filter((s) => resolveItemMonth(s) === monthName);
      const normalizedStudentCode = (session.code || '').trim().toLowerCase();
      const monthArcs = archivedGradebooks.filter(
        (a) =>
          a.month === monthName &&
          (!a.roster ||
            a.roster.some((r) => (r.code || '').trim().toLowerCase() === normalizedStudentCode))
      );
      const uniqueKeys = new Set<string>();
      monthGrades.forEach((g, idx) => uniqueKeys.add(g.questionId || g.id || `g-${idx}`));
      monthSubs.forEach((s, idx) => uniqueKeys.add(s.questionId || s.id || `s-${idx}`));
      return Math.max(uniqueKeys.size, monthArcs.length);
    }
    if (section === 'monthly_circulars') {
      return announcements
        .filter((a) => !isSimulationAnnouncement(a))
        .filter((a) => resolveAnnouncementMonth(a) === monthName).length;
    }
    if (section === 'monthly_recommendations') {
      return recommendations.filter((r) => resolveItemMonth(r) === monthName).length;
    }
    if (section === 'school_activities_archive') {
      const uniqueIds = new Set<string>();
      const resolveActivityMonth = (dKey: string, ts: number, fallback?: string) => {
        if (dKey && /^\d{4}-\d{2}-\d{2}$/.test(dKey)) {
          const parsed = Date.parse(`${dKey}T09:00:00`);
          if (!Number.isNaN(parsed)) return getAcademicMonthFromTimestamp(parsed);
        }
        if (ts > 0) return getAcademicMonthFromTimestamp(ts);
        return fallback || currentAcademicMonth;
      };
      archivedSchoolActivityBatches.forEach((b) => {
        (b.activities || []).forEach((act) => {
          const dKey = getSchoolActivityDayKey(act) || b.thursdayKey || '';
          const ts = act.timestamp || b.archivedTimestamp || 0;
          if (resolveActivityMonth(dKey, ts, b.monthName) === monthName) {
            uniqueIds.add(act.id);
          }
        });
      });
      approvedSchoolActivities.forEach((act) => {
        if (!isSchoolActivityArchivedForDay(act)) return;
        const dKey = getSchoolActivityDayKey(act);
        const ts = getSchoolActivityTimestamp(act);
        if (resolveActivityMonth(dKey, ts) === monthName) uniqueIds.add(act.id);
      });
      return uniqueIds.size;
    }
    return 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto font-['Cairo','Tajawal']">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90dvh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden text-right animate-in fade-in zoom-in-95 my-auto">
        {/* Modal Header */}
        <div className={`p-3.5 sm:p-5 bg-gradient-to-r ${sectionMeta.color} text-white flex items-center justify-between gap-2 shadow-xs shrink-0`}>
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/15 flex items-center justify-center text-white border border-white/20 shadow-xs shrink-0">
              <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-sm sm:text-lg text-white truncate">
                {sectionMeta.title}
              </h3>
              <p className="text-[11px] sm:text-xs text-white/85 font-medium truncate">
                {sectionMeta.subtitle} • {formatArabicSchoolName(session.schoolName, session.schoolId)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
            title="إغلاق الأرشيف"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Opened Folder Navigation Bar */}
        {openedMonthFolder && (
          <div className="px-4 py-2.5 bg-[#F4F8FC] border-b border-[#DCE7F3] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="text-xs sm:text-sm font-black text-[#1A3A5F]">
                مجلد شهر ({openedMonthFolder})
              </span>
              {openedMonthFolder === currentAcademicMonth && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                  الشهر الحالي
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpenedMonthFolder(null);
                setExpandedHwDayKeys({});
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة إلى مجلدات الشهور</span>
            </button>
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F8FAFD]">
          {/* COMPUTER-STYLE MONTH FOLDERS GRID */}
          {!openedMonthFolder && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 rounded-2xl border border-[#DCE7F3] shadow-2xs">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-amber-600 fill-amber-300" />
                  <span className="text-xs sm:text-sm font-black text-[#1A3A5F]">
                    اختر مجلد الشهر لفتح محتوياته:
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#5C7085]">
                  {ACADEMIC_MONTHS.length} مجلدات شهرية
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 pt-1">
                {ACADEMIC_MONTHS.map((monthName) => {
                  const itemCount = getFolderItemCount(monthName);
                  const isCurrent = monthName === currentAcademicMonth;
                  return (
                    <button
                      key={`folder-${monthName}`}
                      type="button"
                      onClick={() => {
                        setOpenedMonthFolder(monthName);
                        setExpandedHwDayKeys({});
                      }}
                      className="group text-right focus:outline-none cursor-pointer"
                    >
                      {/* Computer Desktop Folder Tab */}
                      <div className="flex items-end pr-1.5">
                        <div
                          className={`w-14 h-3 rounded-t-lg border-t-2 border-x-2 transition-colors ${
                            itemCount > 0 || isCurrent
                              ? 'bg-[#E5A926] border-[#B7791F] group-hover:bg-[#D99B16]'
                              : 'bg-[#CBD5E1] border-[#94A3B8] group-hover:bg-[#E5A926] group-hover:border-[#B7791F]'
                          }`}
                        />
                      </div>

                      {/* Computer Desktop Folder Body */}
                      <div
                        className={`relative rounded-b-2xl rounded-tl-2xl border-2 p-3.5 transition-all shadow-xs group-hover:-translate-y-1 group-hover:shadow-md ${
                          itemCount > 0 || isCurrent
                            ? 'bg-gradient-to-b from-[#FFE699] via-[#FFD86B] to-[#F4C144] border-[#C68A1E]'
                            : 'bg-gradient-to-b from-[#F1F5F9] via-[#E2E8F0] to-[#CBD5E1] border-[#94A3B8] group-hover:from-[#FFE699] group-hover:via-[#FFD86B] group-hover:to-[#F4C144] group-hover:border-[#C68A1E]'
                        }`}
                      >
                        {/* White paper sheet peek inside folder when non-empty */}
                        {itemCount > 0 && (
                          <div className="mx-1 mb-2 h-1.5 rounded-full bg-white/90 border border-amber-700/20 shadow-2xs" />
                        )}

                        {/* Inner folder crease line */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <Folder
                            className={`w-7 h-7 transition-transform group-hover:scale-105 ${
                              itemCount > 0 || isCurrent
                                ? 'text-[#8C5A08] fill-[#B7791F]/20'
                                : 'text-slate-600 fill-slate-400/20 group-hover:text-[#8C5A08]'
                            }`}
                          />
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                              itemCount > 0
                                ? 'bg-white/95 text-[#1A3A5F] border-amber-700/25 shadow-2xs'
                                : 'bg-white/75 text-slate-600 border-slate-300'
                            }`}
                          >
                            {itemCount > 0 ? `${itemCount} سجل` : 'فارغ'}
                          </span>
                        </div>

                        <div className="font-black text-xs sm:text-sm text-[#1A3A5F] leading-snug">
                          مجلد {monthName}
                        </div>
                        <div className="text-[10px] font-bold text-[#4A3B12]/80 mt-0.5">
                          {isCurrent ? 'الشهر الحالي' : 'اضغط لفتح المجلد'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* OPENED FOLDER CONTENT: SECTION 1 - ارشيف الواجب الشهري (مطوي حسب اليوم والتاريخ مثل المعلم) */}
          {openedMonthFolder && section === 'monthly_homework' && (() => {
            const allMonthItems = getArchivedHwItemsForMonth(openedMonthFolder);
            const hwSubjectsList = Array.from(
              new Set<string>([
                ...gradeSubjects,
                ...allMonthItems.map((it) => it.subject).filter(Boolean),
              ])
            );

            const filteredItems = allMonthItems.filter(
              (it) => selectedHwSubject === 'الكل' || it.subject === selectedHwSubject
            );

            const dayGroupMap = new Map<string, typeof filteredItems>();
            for (const item of filteredItems) {
              const dKey = formatDayKeyFromTimestamp(item.timestamp);
              const arr = dayGroupMap.get(dKey) || [];
              arr.push(item);
              dayGroupMap.set(dKey, arr);
            }
            const dayGroups = Array.from(dayGroupMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
            const staggerDelays = [
              'delay-[0ms]',
              'delay-[45ms]',
              'delay-[90ms]',
              'delay-[135ms]',
              'delay-[180ms]',
              'delay-[225ms]',
            ];

            return (
              <div className="space-y-4">
                <div className="p-3 bg-[#EEF5FC] rounded-2xl border border-[#C6DCF2] flex flex-wrap items-center justify-between gap-2 text-xs text-[#1A3A5F]">
                  <div>
                    <span className="font-black block">أرشيف واجبات شهر ({openedMonthFolder})</span>
                    <span className="text-[11px] text-[#5C7085] font-semibold">
                      الواجبات المؤرشفة منظمة ومطوية حسب التاريخ واليوم — اضغط على اليوم لعرضها
                    </span>
                  </div>
                  <span className="font-black text-[#1F5AAA] bg-white px-2.5 py-1 rounded-xl border border-[#C6DCF2] tabular-nums">
                    {filteredItems.length} واجب
                  </span>
                </div>

                {/* Subject filter bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {['الكل', ...hwSubjectsList].map((subjName, sIdx) => (
                    <button
                      key={`arc-hw-subj-${subjName}-${sIdx}`}
                      type="button"
                      onClick={() => setSelectedHwSubject(subjName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer whitespace-nowrap ${
                        selectedHwSubject === subjName
                          ? 'bg-[#1F5AAA] text-white shadow-xs'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {subjName}
                    </button>
                  ))}
                </div>

                {dayGroups.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-[#DCE7F3] text-xs space-y-1.5">
                    <BookOpen className="w-9 h-9 text-[#9BBEDF] mx-auto" />
                    <p className="font-black text-[#1A3A5F]">
                      لا توجد واجبات مؤرشفة في مجلد شهر ({openedMonthFolder}) حتى الآن.
                    </p>
                    <p className="text-[11px] text-[#5C7085]">
                      تُرحّل الواجبات المجاب عليها من الأيام السابقة تلقائياً إلى هنا عند ظهور يوم جديد.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dayGroups.map(([dayKey, dayItems]) => {
                      const isExpanded = Boolean(expandedHwDayKeys[dayKey]);
                      const sortedDayItems = [...dayItems].sort((a, b) => b.timestamp - a.timestamp);

                      return (
                        <div
                          key={`stu-hw-day-${dayKey}`}
                          className="bg-white rounded-2xl border border-[#DCE7F3] shadow-2xs overflow-hidden transition-colors"
                        >
                          {/* Collapsible Day & Date Trigger Header (Collapsed by default matching Teacher Archive) */}
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedHwDayKeys((prev) => ({
                                ...prev,
                                [dayKey]: !prev[dayKey],
                              }))
                            }
                            className={`w-full px-4 py-3.5 flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                              isExpanded
                                ? 'bg-[#EEF5FC] border-b border-[#C6DCF2]'
                                : 'bg-white hover:bg-[#F4F8FC]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isExpanded ? (
                                <FolderOpen className="w-5 h-5 text-amber-600 shrink-0" />
                              ) : (
                                <Folder className="w-5 h-5 text-amber-500 fill-amber-200/60 shrink-0" />
                              )}
                              <span className="text-xs sm:text-sm font-black text-[#1A3A5F] truncate">
                                {formatArabicDayLabel(dayKey)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="text-xs font-black text-[#1F5AAA] tabular-nums">
                                {sortedDayItems.length} واجب
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-[#1F5AAA] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </button>

                          {/* Smooth Staggered Accordion Body */}
                          <div
                            className={`grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                              isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                            }`}
                          >
                            <div className="overflow-hidden">
                              <div className="p-3 sm:p-4 bg-[#F8FAFD] grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                {sortedDayItems.map((entry, idx) => {
                                  const delayClass = isExpanded
                                    ? staggerDelays[Math.min(idx, staggerDelays.length - 1)]
                                    : 'delay-[0ms]';

                                  if (entry.kind === 'question') {
                                    const q = entry.data;
                                    const matchedSub = submissions.find(
                                      (s) =>
                                        s.questionId === q.id ||
                                        (s.title && (s.title === q.questionText || s.title === q.text))
                                    );
                                    const matchedGrade = studentGrades.find((g) => g.questionId === q.id);
                                    const earnedScore =
                                      matchedGrade?.score ??
                                      matchedGrade?.obtained ??
                                      matchedSub?.score;
                                    const isAnswered = Boolean(matchedSub || matchedGrade);
                                    const correctOpt = q.correctOption !== undefined ? q.correctOption : q.correctIndex;
                                    const chosenOpt = matchedSub?.selectedOption;

                                    return (
                                      <div
                                        key={q.id ? `stu-arch-q-${q.id}-${idx}` : `stu-arch-q-${dayKey}-${idx}`}
                                        className={`bg-white rounded-2xl p-4 border border-[#DCE7F3] shadow-2xs flex flex-col justify-between transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${delayClass} ${
                                          isExpanded
                                            ? 'opacity-100 translate-y-0'
                                            : 'opacity-0 translate-y-2'
                                        }`}
                                      >
                                        <div>
                                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-[11px]">
                                            <span className="font-black text-[#1F5AAA]">
                                              {q.subject} • {isObjectiveQuestion(q.type) ? 'سؤال موضوعي' : 'واجب مقالي'}
                                            </span>
                                            {isAnswered ? (
                                              <span className="font-black text-emerald-700 flex items-center gap-1 tabular-nums">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                <span>
                                                  تم الحل{earnedScore !== undefined ? ` (${earnedScore}/${q.points || 5})` : ''}
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="font-bold text-slate-500">مؤرشف</span>
                                            )}
                                          </div>

                                          <p className="text-xs sm:text-sm font-black text-[#1A3A5F] leading-relaxed mb-2.5">
                                            {q.questionText || q.text}
                                          </p>

                                          {Array.isArray(q.options) && q.options.length > 0 && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] mb-2.5">
                                              {q.options.map((opt: string, optIdx: number) => {
                                                const isCorrect = String(correctOpt) === String(optIdx);
                                                const isChosen =
                                                  chosenOpt !== undefined && String(chosenOpt) === String(optIdx);
                                                return (
                                                  <div
                                                    key={`stu-arch-opt-${q.id || idx}-${optIdx}`}
                                                    className={`p-1.5 rounded-lg border ${
                                                      isCorrect
                                                        ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                                                        : isChosen
                                                        ? 'bg-rose-50 border-rose-300 font-bold text-rose-900'
                                                        : 'bg-[#F8FAFD] border-slate-200 text-slate-700'
                                                    }`}
                                                  >
                                                    <span className="font-black text-[#1F5AAA]">
                                                      {optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د'}:{' '}
                                                    </span>
                                                    {opt}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>

                                        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C7085]">
                                          <span className="font-bold text-[#1A3A5F]">
                                            المعلم: {q.teacherName || 'معلم المادة'}
                                          </span>
                                          <span className="flex items-center gap-1 text-[#1F5AAA] font-bold">
                                            <Clock className="w-3 h-3" />
                                            <span>{q.createdAtFormatted || formatArabicDateTime(q.timestamp)}</span>
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  }

                                  // Fallback: Direct submission entry without matched question record
                                  const sub = entry.data;
                                  return (
                                    <div
                                      key={sub.id ? `stu-arch-sub-${sub.id}-${idx}` : `stu-arch-sub-${dayKey}-${idx}`}
                                      className={`bg-white rounded-2xl p-4 border border-[#DCE7F3] shadow-2xs flex flex-col justify-between transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${delayClass} ${
                                        isExpanded
                                          ? 'opacity-100 translate-y-0'
                                          : 'opacity-0 translate-y-2'
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-center justify-between gap-2 mb-2 text-[11px]">
                                          <span className="font-black text-[#1F5AAA]">مادة {sub.subject}</span>
                                          <span className="font-black text-emerald-700 tabular-nums">
                                            درجة: {sub.score ?? 0} / {sub.maxScore ?? 5}
                                          </span>
                                        </div>
                                        <p className="text-xs sm:text-sm text-[#1A3A5F] font-bold line-clamp-3 mb-2">
                                          {sub.title || sub.questionText || sub.studentNotes || sub.notes || 'إجابة واجب منزلي'}
                                        </p>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] text-[#5C7085] pt-2.5 border-t border-slate-100">
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-3 h-3 text-[#1F5AAA]" />
                                          <span>{sub.submittedAtFormatted || sub.submittedAt || 'تم التسليم'}</span>
                                        </span>
                                        <span className="text-emerald-700 font-bold">
                                          {sub.status === 'تم التصحيح' || sub.status === 'graded' ? 'تم التصحيح والاعتماد' : sub.status || 'مرسل'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* OPENED FOLDER CONTENT: SECTION 2 - ارشيف درجاتي الشهري (جدول كشف الدرجات جميع المواد) */}
          {openedMonthFolder && section === 'monthly_grades' && (() => {
            const monthGrades = studentGrades.filter((g) => resolveItemMonth(g) === openedMonthFolder);
            const monthSubmissions = submissions.filter((s) => resolveItemMonth(s) === openedMonthFolder);
            const matchArchives = archivedGradebooks.filter((a) => a.month === openedMonthFolder);
            const normalizedStudentCode = (session.code || '').trim().toLowerCase();

            const monthSubjectOptions = Array.from(
              new Set<string>([
                ...gradeSubjects.map((s) => canonicalSubjectName(s)).filter(Boolean),
                ...monthGrades.map((g) => canonicalSubjectName(g.subjectName || g.subject)).filter(Boolean),
                ...monthSubmissions.map((s) => canonicalSubjectName(s.subject)).filter(Boolean),
                ...matchArchives.map((a) => canonicalSubjectName(a.subject)).filter(Boolean),
              ])
            );

            const monthSubjectCards = monthSubjectOptions.map((subjName) => {
              const subjGrades = monthGrades.filter(
                (g) => canonicalSubjectName(g.subjectName || g.subject) === subjName
              );
              const subjSubs = monthSubmissions.filter(
                (s) => canonicalSubjectName(s.subject) === subjName
              );
              const arcForSubj = matchArchives.find(
                (a) => canonicalSubjectName(a.subject) === subjName
              );
              const arcEntry = arcForSubj?.roster?.find(
                (r) => (r.code || '').trim().toLowerCase() === normalizedStudentCode
              );
              const earned =
                subjGrades.length > 0
                  ? subjGrades.reduce((sum, g) => sum + (Number(g.score ?? g.obtained) || 0), 0)
                  : Number(arcEntry?.totalEarned || 0);
              const max =
                subjGrades.length > 0
                  ? subjGrades.reduce((sum, g) => sum + (Number(g.maxScore || g.total) || 5), 0)
                  : Number(arcEntry?.totalPossible || 0);
              const count = Math.max(subjGrades.length, subjSubs.length, Number(arcEntry?.submissionsCount || 0));
              return { name: subjName, count, earned, max };
            });

            return (
              <div className="space-y-4">
                {/* All Subjects Summary Cards (تظهر جميع المواد السبع وأي مادة إضافية) */}
                <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#DCE7F3] shadow-2xs space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#1A3A5F] flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-[#1F5AAA]" />
                      <span>جميع المواد في أرشيف شهر ({openedMonthFolder}) — ({monthSubjectOptions.length} مواد)</span>
                    </span>
                    {selectedGradeSubject !== 'الكل' && (
                      <button
                        type="button"
                        onClick={() => setSelectedGradeSubject('الكل')}
                        className="text-[11px] font-black text-[#1F5AAA] hover:underline cursor-pointer"
                      >
                        عرض جميع المواد
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {monthSubjectCards.map((item, idx) => {
                      const isSelected = selectedGradeSubject === item.name;
                      return (
                        <button
                          key={`arc-grade-card-${item.name}-${idx}`}
                          type="button"
                          onClick={() => setSelectedGradeSubject(isSelected ? 'الكل' : item.name)}
                          className={`min-w-0 p-2.5 rounded-xl border text-right transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-xs'
                              : 'bg-[#F4F8FC] hover:bg-[#EEF5FC] text-[#1A3A5F] border-[#DCE7F3]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-[11px] font-black leading-snug truncate">{item.name}</span>
                            <span
                              className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                                isSelected
                                  ? 'bg-white text-[#1F5AAA]'
                                  : item.count > 0 || item.max > 0
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {item.max > 0 ? `${item.earned}/${item.max}` : '0'}
                            </span>
                          </div>
                          <p className={`text-[10px] ${isSelected ? 'text-[#DCE7F3] font-bold' : 'text-[#5C7085] font-semibold'}`}>
                            {item.count > 0 ? `${item.count} تقييم / تسليم` : 'لا توجد درجات بعد'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subject Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {['الكل', ...monthSubjectOptions].map((subjName, idx) => (
                    <button
                      key={`arc-grade-subj-${subjName}-${idx}`}
                      type="button"
                      onClick={() => setSelectedGradeSubject(subjName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition shrink-0 cursor-pointer ${
                        selectedGradeSubject === subjName
                          ? 'bg-[#1F5AAA] text-white border border-[#194B91] shadow-2xs'
                          : 'bg-white text-[#1A3A5F] hover:bg-[#EEF5FC] border border-[#DCE7F3]'
                      }`}
                    >
                      {subjName === 'الكل' ? `جميع المواد (${monthSubjectOptions.length})` : subjName}
                    </button>
                  ))}
                </div>

                {/* Same Subject Gradebook Tables as "درجاتي" Tab — always showing all subjects */}
                <StudentSubjectGradeTables
                  grades={monthGrades}
                  submissions={monthSubmissions}
                  subjectOptions={monthSubjectOptions}
                  selectedSubject={selectedGradeSubject}
                  monthLabel={openedMonthFolder}
                  showAllSubjects={true}
                  archivedGradebooks={matchArchives}
                  studentCode={session.code}
                  emptyTitle={`لا توجد درجات مرصودة في مجلد شهر (${openedMonthFolder})`}
                  emptySubtitle="ستظهر جداول كشف الدرجات لكل مادة داخل هذا المجلد فور رصد التقييمات والتسليمات."
                />

                {/* Official Teacher Monthly Rollover Summaries (if available for this month) */}
                {matchArchives.map((arc) => {
                  const studentInArchive = arc.roster?.find(
                    (s) => (s.code || '').trim().toLowerCase() === normalizedStudentCode
                  );
                  if (!studentInArchive) return null;
                  const arcSubj = canonicalSubjectName(arc.subject);
                  if (selectedGradeSubject !== 'الكل' && arcSubj !== canonicalSubjectName(selectedGradeSubject)) {
                    return null;
                  }
                  return (
                    <div
                      key={arc.id}
                      className="bg-emerald-50/60 rounded-2xl p-4 sm:p-5 border border-emerald-200 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-black text-xs sm:text-sm text-emerald-950">
                          ملخص اعتماد المعلم لشهر ({openedMonthFolder}) — مادة {arcSubj || arc.subject}
                        </span>
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-200">
                          {studentInArchive.rating}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                        <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                          <span className="text-gray-500 block text-[11px]">الدرجة المحصلة</span>
                          <span className="text-sm sm:text-base font-black text-[#1E5AA8]">
                            {studentInArchive.totalEarned} / {studentInArchive.totalPossible}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                          <span className="text-gray-500 block text-[11px]">النسبة المئوية</span>
                          <span className="text-sm sm:text-base font-black text-emerald-700">
                            {studentInArchive.percentage}%
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                          <span className="text-gray-500 block text-[11px]">التسليمات</span>
                          <span className="text-sm sm:text-base font-black text-indigo-700">
                            {studentInArchive.submissionsCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* OPENED FOLDER CONTENT: SECTION 3 - ارشيف التعاميم الإدارية الشهري */}
          {openedMonthFolder && section === 'monthly_circulars' && (() => {
            const cleanAnnouncements = announcements
              .filter((a) => !isSimulationAnnouncement(a))
              .filter((a) => resolveAnnouncementMonth(a) === openedMonthFolder);
            return (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 flex items-center justify-between text-xs text-amber-900">
                  <span className="font-bold">تعاميم وتوجيهات إدارة المدرسة لشهر ({openedMonthFolder}):</span>
                  <span className="font-mono font-bold text-amber-800">{cleanAnnouncements.length} تعميم</span>
                </div>

                {cleanAnnouncements.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 text-xs">
                    لا توجد تعاميم إدارية في مجلد شهر ({openedMonthFolder}).
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cleanAnnouncements.map((anc, idx) => {
                      const displaySender =
                        anc.senderName && !isGenericPrincipalSender(anc.senderName)
                          ? anc.senderName
                          : getSchoolPrincipalName(anc.schoolId || session.schoolId, session.schoolName);
                      return (
                        <div
                          key={anc.id ? `arc-anc-${anc.id}-${idx}` : `arc-anc-idx-${idx}`}
                          className="p-4 rounded-2xl bg-white border border-gray-200 shadow-2xs"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-1.5 mb-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-[#1A3A5F] flex items-center gap-1.5">
                                <Megaphone className="w-3.5 h-3.5 text-amber-600" />
                                <span>{anc.title}</span>
                              </span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                                {formatAnnouncementTargetGradesAr(anc.targetGrades)}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {anc.createdAt}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed font-normal whitespace-pre-wrap">
                            {anc.content}
                          </p>
                          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                            <span>المرسل: {displaySender}</span>
                            <span className="text-[#1E5AA8] font-bold">رسمي ومعتمد</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* OPENED FOLDER CONTENT: SECTION 4 - ارشيف توصيات المعلم الشهري (مع إظهار معلمي المواد) */}
          {openedMonthFolder && section === 'monthly_recommendations' && (() => {
            const monthRecs = recommendations.filter((r) => resolveItemMonth(r) === openedMonthFolder);
            const studentOwnGrade = normalizeGradeCode(session.grade || session.class || '8');
            const normalizedSchool = (session.schoolId || '').trim().toLowerCase();

            const subjectTeacherMap = new Map<string, string>();
            // 1. Registered teachers for this school & grade
            authService.getRegisteredCodes().forEach((c) => {
              if (
                c.role === 'teacher' &&
                (c.schoolId || '').trim().toLowerCase() === normalizedSchool
              ) {
                const tGrade = normalizeGradeCode(c.grade);
                if (!tGrade || tGrade === 'all' || !studentOwnGrade || tGrade === studentOwnGrade) {
                  const subj = canonicalSubjectName(c.subject);
                  const tName = (c.assignedToName || '').trim();
                  if (subj && tName && !subjectTeacherMap.has(subj)) {
                    subjectTeacherMap.set(subj, tName);
                  }
                }
              }
            });

            // 2. Teachers discovered directly from recommendations (all months + current month)
            recommendations.forEach((r) => {
              const subj = canonicalSubjectName(r.subject);
              const tName = (r.teacherName || '').trim();
              if (subj && tName && !subjectTeacherMap.has(subj)) {
                subjectTeacherMap.set(subj, tName);
              }
            });

            const recSubjectOptions = Array.from(
              new Set<string>([
                ...gradeSubjects.map((s) => canonicalSubjectName(s)).filter(Boolean),
                ...monthRecs.map((r) => canonicalSubjectName(r.subject)).filter(Boolean),
              ])
            );

            const recTeacherCards = recSubjectOptions.map((subjName) => {
              const subjRecs = monthRecs.filter(
                (r) => canonicalSubjectName(r.subject) === subjName
              );
              const teacherFromRec = subjRecs.find((r) => (r.teacherName || '').trim())?.teacherName?.trim();
              const teacherName = teacherFromRec || subjectTeacherMap.get(subjName) || 'معلم المادة';
              return {
                subject: subjName,
                teacherName,
                count: subjRecs.length,
              };
            });

            const filteredMonthRecs = monthRecs.filter((r) => {
              if (selectedRecSubject === 'الكل') return true;
              return canonicalSubjectName(r.subject) === canonicalSubjectName(selectedRecSubject);
            });

            return (
              <div className="space-y-4">
                <div className="p-3 bg-gradient-to-r from-emerald-50 via-blue-50 to-amber-50 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs text-[#1A3A5F]">
                  <span className="font-bold">توصيات معلمي المواد لشهر ({openedMonthFolder}):</span>
                  <span className="font-bold text-emerald-800 font-mono">{monthRecs.length} توصية</span>
                </div>

                {/* Subject Teachers Directory & Filter Grid (إظهار جميع معلمي المواد) */}
                <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#DCE7F3] shadow-2xs space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#1A3A5F] flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-[#1F5AAA]" />
                      <span>معلمو المواد الدراسية ({recTeacherCards.length} مواد)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedRecSubject('الكل')}
                      className={`px-3 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                        selectedRecSubject === 'الكل'
                          ? 'bg-[#1F5AAA] text-white border-[#194B91]'
                          : 'bg-[#F4F8FC] text-[#1A3A5F] hover:bg-[#EEF5FC] border-[#DCE7F3]'
                      }`}
                    >
                      جميع معلمي المواد ({monthRecs.length})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {recTeacherCards.map((item, idx) => {
                      const isSelected = selectedRecSubject === item.subject;
                      return (
                        <button
                          key={`arc-rec-teacher-${item.subject}-${idx}`}
                          type="button"
                          onClick={() => setSelectedRecSubject(isSelected ? 'الكل' : item.subject)}
                          className={`p-2.5 rounded-xl border text-right transition cursor-pointer flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-xs'
                              : 'bg-[#F4F8FC] hover:bg-[#EEF5FC] text-[#1A3A5F] border-[#DCE7F3]'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-black truncate">{item.subject}</div>
                            <div
                              className={`text-[10px] font-bold truncate ${
                                isSelected ? 'text-[#DCE7F3]' : 'text-[#5C7085]'
                              }`}
                            >
                              المعلم: أ. {item.teacherName}
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                              isSelected
                                ? 'bg-white text-[#1F5AAA]'
                                : item.count > 0
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {item.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {filteredMonthRecs.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 text-xs">
                    {selectedRecSubject === 'الكل'
                      ? `لا توجد توصيات من معلمي المواد في مجلد شهر (${openedMonthFolder}) بعد.`
                      : `لا توجد توصيات مسجلة لمادة (${selectedRecSubject}) في مجلد شهر (${openedMonthFolder}) بعد.`}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMonthRecs.map((rec, idx) => {
                      const isPrivateForMe =
                        rec.targetScope === 'specific_student' || Boolean(rec.targetStudentCode);
                      const canonSubj = canonicalSubjectName(rec.subject) || rec.subject || 'المادة';
                      const resolvedTeacher =
                        (rec.teacherName || '').trim() ||
                        subjectTeacherMap.get(canonSubj) ||
                        'معلم المادة';
                      const gradeBadge =
                        rec.grade === 'all' || !rec.grade
                          ? 'المدرسي'
                          : getGradeLabelAr(normalizeGradeCode(rec.grade) || rec.grade);

                      return (
                        <div
                          key={rec.id ? `arc-rec-${rec.id}-${idx}` : `arc-rec-idx-${idx}`}
                          className={`p-4 rounded-2xl border shadow-2xs ${
                            isPrivateForMe
                              ? 'bg-indigo-50/50 border-indigo-200'
                              : 'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isPrivateForMe && (
                                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-indigo-600 text-white inline-flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-amber-200" />
                                  <span>توصية خاصة بك</span>
                                </span>
                              )}
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#1E5AA8] border border-blue-200">
                                مادة {canonSubj}
                              </span>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {rec.category || 'توصية عامة'}
                              </span>
                            </div>
                            <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{rec.createdAtFormatted}</span>
                            </span>
                          </div>

                          {rec.title && (
                            <h5 className="font-bold text-xs text-[#1A3A5F] mb-1">
                              {rec.title}
                            </h5>
                          )}

                          <p className="text-xs text-gray-800 leading-relaxed font-normal whitespace-pre-wrap">
                            {rec.content}
                          </p>

                          <div className="mt-2.5 pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                            <span className="font-bold text-[#1A3A5F]">
                              معلم المادة: <strong className="text-[#1F5AAA]">أ. {resolvedTeacher}</strong> ({canonSubj})
                            </span>
                            <span className="text-amber-700 font-bold">
                              {gradeBadge}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* OPENED FOLDER CONTENT: SECTION 5 - أرشفة الأنشطة المدرسية (مصنفة بالتاريخ وحسب الصف) */}
          {openedMonthFolder && section === 'school_activities_archive' && (() => {
            const normalizeCat = (cat: string): 'تقرير' | 'نشاط' | 'فعالية' => {
              const raw = String(cat || '').trim();
              if (raw.includes('تقرير')) return 'تقرير';
              if (raw.includes('فعال')) return 'فعالية';
              return 'نشاط';
            };
            const resolveGradeKey = (targetGrade?: string): string => {
              const raw = String(targetGrade || '').trim();
              if (!raw || raw === 'الكل' || raw === 'عام' || raw === 'all') return 'عام';
              const n = normalizeGradeCode(raw);
              return n && n !== 'all' ? n : raw;
            };
            const resolveActMonth = (dKey: string, ts: number, fallback?: string): string => {
              if (dKey && /^\d{4}-\d{2}-\d{2}$/.test(dKey)) {
                const parsed = Date.parse(`${dKey}T09:00:00`);
                if (!Number.isNaN(parsed)) return getAcademicMonthFromTimestamp(parsed);
              }
              if (ts > 0) return getAcademicMonthFromTimestamp(ts);
              return fallback || currentAcademicMonth;
            };

            const byId = new Map<string, {
              id: string;
              title: string;
              category: string;
              subType?: string;
              formalText: string;
              targetGrade: string;
              targetClass?: string;
              activityDate: string;
              approvedBy?: string;
              coverImage?: string;
              imagesCount: number;
              timestamp: number;
              dateLabel: string;
              dayKey: string;
            }>();

            archivedSchoolActivityBatches.forEach((b) => {
              (b.activities || []).forEach((act) => {
                const ts = act.timestamp || b.archivedTimestamp || Date.now();
                const dKey = getSchoolActivityDayKey(act) || b.thursdayKey || formatDayKeyFromTimestamp(ts);
                if (resolveActMonth(dKey, ts, b.monthName) !== openedMonthFolder) return;
                if (!byId.has(act.id)) {
                  byId.set(act.id, {
                    id: act.id,
                    title: act.title,
                    category: act.category,
                    subType: act.subType,
                    formalText: act.formalText,
                    targetGrade: act.targetGrade || 'الكل',
                    targetClass: act.targetClass,
                    activityDate: act.activityDate || dKey,
                    approvedBy: act.approvedBy,
                    coverImage: act.coverImage,
                    imagesCount: act.imagesCount || 0,
                    timestamp: ts,
                    dateLabel: act.dateLabel || '',
                    dayKey: dKey,
                  });
                }
              });
            });

            approvedSchoolActivities.forEach((act) => {
              if (!isSchoolActivityArchivedForDay(act)) return;
              const ts = getSchoolActivityTimestamp(act);
              const dKey = getSchoolActivityDayKey(act) || formatDayKeyFromTimestamp(ts || Date.now());
              if (resolveActMonth(dKey, ts) !== openedMonthFolder) return;
              const imgs = Array.isArray(act.images) ? act.images : [];
              const prev = byId.get(act.id);
              byId.set(act.id, {
                id: act.id,
                title: act.title,
                category: act.category,
                subType: act.subType,
                formalText: act.formalText || act.details,
                targetGrade: act.targetGrade || 'الكل',
                targetClass: act.targetClass,
                activityDate: act.activityDate || dKey,
                approvedBy: act.approvedBy,
                coverImage: prev?.coverImage || imgs[0],
                imagesCount: Math.max(prev?.imagesCount || 0, imgs.length),
                timestamp: prev?.timestamp || ts || Date.now(),
                dateLabel: prev?.dateLabel || '',
                dayKey: prev?.dayKey || dKey,
              });
            });

            const monthItems = Array.from(byId.values());
            const studentOwnGrade = resolveGradeKey(session.grade || session.class || '8');
            const availableGrades = Array.from(
              new Set(
                monthItems
                  .map((i) => resolveGradeKey(i.targetGrade))
                  .filter((k) => k !== 'عام')
              )
            ).sort((a, b) => Number(a) - Number(b));

            const categoryCounts = {
              الكل: monthItems.length,
              تقرير: monthItems.filter((a) => normalizeCat(a.category) === 'تقرير').length,
              نشاط: monthItems.filter((a) => normalizeCat(a.category) === 'نشاط').length,
              فعالية: monthItems.filter((a) => normalizeCat(a.category) === 'فعالية').length,
            };

            const filteredItems = monthItems.filter((act) => {
              if (
                selectedSchoolActivityCat !== 'الكل' &&
                normalizeCat(act.category) !== selectedSchoolActivityCat
              ) {
                return false;
              }
              if (selectedSchoolActivityGrade !== 'الكل') {
                const gKey = resolveGradeKey(act.targetGrade);
                if (selectedSchoolActivityGrade === 'صفي') {
                  if (gKey !== studentOwnGrade && gKey !== 'عام') return false;
                } else if (gKey !== selectedSchoolActivityGrade) {
                  return false;
                }
              }
              return true;
            });

            const dayMap = new Map<string, typeof filteredItems>();
            filteredItems.forEach((act) => {
              const arr = dayMap.get(act.dayKey) || [];
              arr.push(act);
              dayMap.set(act.dayKey, arr);
            });
            const dayGroups = Array.from(dayMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

            return (
              <div className="space-y-4">
                <div className="p-3 bg-[#EEF5FC] rounded-2xl border border-[#C6DCF2] flex flex-wrap items-center justify-between gap-2 text-xs text-[#1A3A5F]">
                  <div>
                    <span className="font-black block">
                      أرشفة الأنشطة المدرسية (شهر {openedMonthFolder})
                    </span>
                    <span className="text-[11px] font-semibold text-[#5C7085]">
                      تُؤرشف التقارير والأنشطة والفعاليات بجميع أنواعها يومياً قبل بداية اليوم التالي وتُعرض حسب الصف والتاريخ
                    </span>
                  </div>
                  <span className="font-black text-[#1F5AAA] bg-white px-2.5 py-1 rounded-xl border border-[#C6DCF2] tabular-nums">
                    {filteredItems.length} منشور مؤرشف
                  </span>
                </div>

                {/* Category + Grade filter pills */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['الكل', 'تقرير', 'نشاط', 'فعالية'] as const).map((cat) => (
                      <button
                        key={`stu-arc-sa-cat-${cat}`}
                        type="button"
                        onClick={() => setSelectedSchoolActivityCat(cat)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                          selectedSchoolActivityCat === cat
                            ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-2xs'
                            : 'bg-white text-[#1A3A5F] hover:bg-gray-100 border-gray-200'
                        }`}
                      >
                        {cat === 'الكل'
                          ? `الكل (${categoryCounts.الكل})`
                          : cat === 'تقرير'
                          ? `التقارير (${categoryCounts.تقرير})`
                          : cat === 'نشاط'
                          ? `الأنشطة (${categoryCounts.نشاط})`
                          : `الفعاليات (${categoryCounts.فعالية})`}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-black text-[#1A3A5F] flex items-center gap-1 ml-1">
                      <GraduationCap className="w-3.5 h-3.5 text-[#1F5AAA]" />
                      <span>حسب الصف:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedSchoolActivityGrade('الكل')}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                        selectedSchoolActivityGrade === 'الكل'
                          ? 'bg-[#1A3A5F] text-white border-[#1A3A5F]'
                          : 'bg-white text-[#1A3A5F] hover:bg-gray-100 border-gray-200'
                      }`}
                    >
                      كل الصفوف
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSchoolActivityGrade('صفي')}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                        selectedSchoolActivityGrade === 'صفي'
                          ? 'bg-[#1F5AAA] text-white border-[#194B91]'
                          : 'bg-white text-[#1A3A5F] hover:bg-gray-100 border-gray-200'
                      }`}
                    >
                      صفي ({getGradeLabelAr(studentOwnGrade)} + العام)
                    </button>
                    {availableGrades.map((gKey) => (
                      <button
                        key={`stu-arc-sa-g-${gKey}`}
                        type="button"
                        onClick={() => setSelectedSchoolActivityGrade(gKey)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                          selectedSchoolActivityGrade === gKey
                            ? 'bg-[#1F5AAA] text-white border-[#194B91]'
                            : 'bg-white text-[#1A3A5F] hover:bg-gray-100 border-gray-200'
                        }`}
                      >
                        {getGradeLabelAr(gKey)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectedSchoolActivityGrade('عام')}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                        selectedSchoolActivityGrade === 'عام'
                          ? 'bg-[#1F5AAA] text-white border-[#194B91]'
                          : 'bg-white text-[#1A3A5F] hover:bg-gray-100 border-gray-200'
                      }`}
                    >
                      عام لجميع الصفوف
                    </button>
                  </div>
                </div>

                {dayGroups.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 text-xs space-y-1.5">
                    <Trophy className="w-9 h-9 text-[#9BBEDF] mx-auto" />
                    <p className="font-bold text-[#1A3A5F]">
                      لا توجد أنشطة مدرسية مؤرشفة مطابقة في مجلد شهر ({openedMonthFolder}) حتى الآن.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dayGroups.map(([dayKey, dayItems]) => {
                      const accordionKey = `stu_sa_${dayKey}`;
                      const isExpanded = Boolean(expandedHwDayKeys[accordionKey]);
                      const sortedItems = [...dayItems].sort((a, b) => b.timestamp - a.timestamp);

                      return (
                        <div
                          key={accordionKey}
                          className="rounded-2xl border border-[#DCE7F3] bg-white overflow-hidden shadow-2xs"
                        >
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedHwDayKeys((prev) => ({
                                ...prev,
                                [accordionKey]: !prev[accordionKey],
                              }))
                            }
                            className={`w-full px-4 py-3 flex items-center justify-between gap-2 text-right transition-colors cursor-pointer ${
                              isExpanded
                                ? 'bg-[#EEF5FC] border-b border-[#C6DCF2]'
                                : 'bg-white hover:bg-[#F4F8FC]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? (
                                <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" />
                              ) : (
                                <Folder className="w-4 h-4 text-amber-500 fill-amber-200/60 shrink-0" />
                              )}
                              <span className="text-xs sm:text-sm font-black text-[#1A3A5F] truncate">
                                {formatArabicDayLabel(dayKey)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] font-black text-[#1F5AAA] tabular-nums">
                                {sortedItems.length} منشور
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-[#1F5AAA] transition-transform duration-300 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </button>

                          <div
                            className={`grid transition-[grid-template-rows,opacity] duration-300 ${
                              isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                            }`}
                          >
                            <div className="overflow-hidden">
                              <div className="p-3 sm:p-4 bg-[#F8FAFD] grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {sortedItems.map((act, idx) => {
                                  const bucket = normalizeCat(act.category);
                                  const coverSrc = act.coverImage;
                                  const gKey = resolveGradeKey(act.targetGrade);
                                  const classLabel =
                                    gKey === 'عام'
                                      ? 'عام لجميع الصفوف'
                                      : `${getGradeLabelAr(gKey)}${
                                          act.targetClass && act.targetClass !== 'الكل'
                                            ? ` — فصل ${act.targetClass}`
                                            : ''
                                        }`;

                                  return (
                                    <article
                                      key={act.id ? `sa-item-${act.id}-${idx}` : `sa-item-idx-${idx}`}
                                      className="rounded-2xl bg-white border border-[#DCE7F3] shadow-2xs overflow-hidden flex flex-col justify-between"
                                    >
                                      {coverSrc && (
                                        <button
                                          type="button"
                                          onClick={() => setLightboxImage(coverSrc)}
                                          className="block w-full aspect-video bg-[#F4F8FC] overflow-hidden cursor-pointer group relative"
                                          title="عرض الصورة"
                                        >
                                          <img
                                            src={coverSrc}
                                            alt={act.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                          />
                                          {act.imagesCount > 1 && (
                                            <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold flex items-center gap-1">
                                              <ImageIcon className="w-3 h-3" />
                                              <span>{act.imagesCount} صور</span>
                                            </span>
                                          )}
                                        </button>
                                      )}

                                      <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                                        <div className="space-y-1.5">
                                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                                            <div className="flex flex-wrap items-center gap-1">
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[10px] font-black">
                                                {bucket === 'فعالية' ? <Flag className="w-3 h-3" /> : bucket === 'تقرير' ? <FileText className="w-3 h-3" /> : <Trophy className="w-3 h-3" />}
                                                <span>{bucket}</span>
                                              </span>
                                              {act.subType && (
                                                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[#1A3A5F] border border-slate-200 text-[10px] font-bold">
                                                  {act.subType}
                                                </span>
                                              )}
                                            </div>
                                            <span className="text-[10px] text-[#5C7085] font-bold tabular-nums">
                                              {act.activityDate || act.dateLabel}
                                            </span>
                                          </div>

                                          <h5 className="font-black text-xs sm:text-sm text-[#1A3A5F] leading-snug">
                                            {act.title}
                                          </h5>
                                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                                            {act.formalText}
                                          </p>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-[#5C7085] font-semibold">
                                          <span className="inline-flex items-center gap-1 text-[#1A3A5F] font-bold">
                                            <GraduationCap className="w-3 h-3 text-[#1F5AAA]" />
                                            <span>{classLabel}</span>
                                          </span>
                                          <span>اعتماد: {act.approvedBy || 'مدير المدرسة'}</span>
                                        </div>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold transition cursor-pointer"
          >
            إغلاق الأرشيف
          </button>
        </div>
      </div>

      {/* Lightbox inside archive modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-white rounded-2xl p-2 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute top-3 left-3 z-10 w-8 h-8 rounded-full bg-black/75 text-white flex items-center justify-center cursor-pointer"
              aria-label="إغلاق الصورة"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxImage}
              alt="معاينة صورة النشاط"
              className="w-full max-h-[80dvh] object-contain rounded-xl bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
};
