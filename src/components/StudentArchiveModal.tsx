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
} from 'lucide-react';
import { UserSession, getSubjectsForGrade } from '../services/authService';
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
} from '../services/appData';
import { StudentArchiveSection } from './UnifiedSidebar';
import { formatArabicSchoolName, getSchoolPrincipalName, isGenericPrincipalSender, isSimulationAnnouncement } from '../utils/schoolDisplay';
import {
  StudentSubjectGradeTables,
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
  const [selectedHwSubject, setSelectedHwSubject] = useState<string>('الكل');
  const [selectedGradeSubject, setSelectedGradeSubject] = useState<string>('الكل');
  const [selectedSchoolActivityCat, setSelectedSchoolActivityCat] = useState<'الكل' | 'تقرير' | 'نشاط' | 'فعالية'>('الكل');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOpenedMonthFolder(null);
      setSelectedHwSubject('الكل');
      setSelectedGradeSubject('الكل');
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

  // Count items per academic month folder for visual badges
  const getFolderItemCount = (monthName: string): number => {
    if (section === 'monthly_homework') {
      const batchQs = archivedHomeworkBatches
        .filter((b) => (b.monthName || currentAcademicMonth) === monthName)
        .flatMap((b) => b.questions || []);
      const batchQIds = new Set(batchQs.map((q) => q.id));
      const extraSubs = submissions.filter(
        (s) => resolveItemMonth(s) === monthName && (!s.questionId || !batchQIds.has(s.questionId))
      );
      return batchQs.length + extraSubs.length;
    }
    if (section === 'monthly_grades') {
      const monthGrades = studentGrades.filter((g) => resolveItemMonth(g) === monthName);
      const monthSubs = submissions.filter((s) => resolveItemMonth(s) === monthName);
      const monthArcs = archivedGradebooks.filter((a) => a.month === monthName);
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
      return archivedSchoolActivityBatches
        .filter((b) => (b.monthName || currentAcademicMonth) === monthName)
        .reduce((sum, b) => sum + (b.activities?.length || 0), 0);
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
              onClick={() => setOpenedMonthFolder(null)}
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
                      onClick={() => setOpenedMonthFolder(monthName)}
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

          {/* OPENED FOLDER CONTENT: SECTION 1 - ارشيف الواجب الشهري */}
          {openedMonthFolder && section === 'monthly_homework' && (() => {
            const monthBatches = archivedHomeworkBatches.filter(
              (b) => (b.monthName || currentAcademicMonth) === openedMonthFolder
            );
            const allBatchQuestions = monthBatches.flatMap((b) => b.questions || []);
            const batchQuestionIdSet = new Set(allBatchQuestions.map((q) => q.id));

            // Include submissions from the selected month (transferred from weekly archive)
            const monthExtraSubmissions = submissions.filter(
              (s) =>
                resolveItemMonth(s) === openedMonthFolder &&
                (!s.questionId || !batchQuestionIdSet.has(s.questionId)) &&
                (selectedHwSubject === 'الكل' || (s.subject || '').trim() === selectedHwSubject)
            );

            const hwSubjectsList = Array.from(
              new Set<string>([
                ...gradeSubjects,
                ...allBatchQuestions.map((q) => q.subject).filter(Boolean),
                ...submissions.filter((s) => resolveItemMonth(s) === openedMonthFolder).map((s) => s.subject).filter(Boolean),
              ])
            );

            const totalCount = allBatchQuestions.length + monthExtraSubmissions.length;

            return (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50/80 rounded-2xl border border-indigo-200 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900">
                  <div>
                    <span className="font-bold block">أرشيف واجبات شهر ({openedMonthFolder})</span>
                    <span className="text-[11px] text-indigo-700">تُحفظ هنا جميع واجبات وتسليمات الشهر مرتبة حسب المادة</span>
                  </div>
                  <span className="font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-xl border border-indigo-200">
                    {totalCount} واجب / تسليم
                  </span>
                </div>

                {/* Subject filter bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {['الكل', ...hwSubjectsList].map((subjName, sIdx) => (
                    <button
                      key={`arc-hw-subj-${subjName}-${sIdx}`}
                      type="button"
                      onClick={() => setSelectedHwSubject(subjName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                        selectedHwSubject === subjName
                          ? 'bg-[#1E5AA8] text-white shadow-xs'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {subjName}
                    </button>
                  ))}
                </div>

                {totalCount === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 text-xs space-y-1.5">
                    <BookOpen className="w-9 h-9 text-indigo-300 mx-auto" />
                    <p className="font-bold text-gray-700">
                      لا توجد واجبات أو تسليمات مؤرشفة في مجلد شهر ({openedMonthFolder}) حتى الآن.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Archived weekly batches moved under monthly folder */}
                    {monthBatches.map((batch, bIdx) => {
                      const batchQuestions = (batch.questions || []).filter(
                        (q) => selectedHwSubject === 'الكل' || q.subject === selectedHwSubject
                      );
                      if (batchQuestions.length === 0) return null;

                      const bySubject = new Map<string, typeof batchQuestions>();
                      batchQuestions.forEach((q) => {
                        const subj = q.subject || 'المادة';
                        const arr = bySubject.get(subj) || [];
                        arr.push(q);
                        bySubject.set(subj, arr);
                      });

                      return (
                        <div
                          key={batch.id ? `hw-batch-${batch.id}-${bIdx}` : `hw-batch-idx-${bIdx}`}
                          className="rounded-2xl border border-indigo-200 bg-white overflow-hidden shadow-2xs"
                        >
                          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 font-bold text-[#1A3A5F]">
                              <Calendar className="w-4 h-4 text-[#1E5AA8]" />
                              <span>{batch.weekLabel}</span>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                              {batchQuestions.length} أسئلة
                            </span>
                          </div>

                          <div className="p-3 sm:p-4 space-y-3">
                            {Array.from(bySubject.entries()).map(([subjName, subjQs], sgIdx) => (
                              <div key={`batch-${batch.id}-subj-${subjName}-${sgIdx}`} className="space-y-2">
                                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#F4F8FC] border border-blue-100">
                                  <span className="text-xs font-black text-[#1E5AA8] flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-[#0E8A6D]" />
                                    <span>مادة: {subjName}</span>
                                  </span>
                                  <span className="text-[11px] font-bold text-gray-500">
                                    {subjQs.length} واجب
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {subjQs.map((q, idx) => {
                                    const matchedSub = submissions.find(
                                      (s) =>
                                        s.questionId === q.id ||
                                        (s.title && s.title === q.questionText)
                                    );
                                    const matchedGrade = studentGrades.find((g) => g.questionId === q.id);
                                    const earnedScore =
                                      matchedGrade?.score ??
                                      matchedGrade?.obtained ??
                                      matchedSub?.score;
                                    const isAnswered = Boolean(matchedSub || matchedGrade);

                                    return (
                                      <div
                                        key={q.id ? `arc-q-${q.id}-${idx}` : `arc-q-idx-${idx}`}
                                        className="p-3.5 rounded-2xl bg-white border border-gray-200 shadow-2xs"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                          <span className="text-[11px] font-bold text-[#1E5AA8] bg-blue-50 px-2.5 py-0.5 rounded-md">
                                            {isObjectiveQuestion(q.type) ? 'سؤال موضوعي' : 'واجب مقالي'} • {q.points || 5} درجات
                                          </span>
                                          {isAnswered ? (
                                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                                              <CheckCircle2 className="w-3 h-3" />
                                              <span>
                                                تم الحل{earnedScore !== undefined ? ` (${earnedScore}/${q.points || 5})` : ''}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                                              مؤرشف
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs sm:text-sm font-bold text-gray-900 leading-relaxed">
                                          {q.questionText || (q as any).text}
                                        </p>
                                        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                                          <span>المعلم: {q.teacherName || 'معلم المادة'}</span>
                                          <span>{q.createdAtFormatted || batch.archivedAt}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Direct monthly submissions (transferred from old weekly archive) */}
                    {monthExtraSubmissions.length > 0 && (
                      <div className="rounded-2xl border border-[#DCE7F3] bg-white p-4 space-y-3 shadow-2xs">
                        <div className="flex items-center justify-between text-xs font-black text-[#1A3A5F]">
                          <span>تسليمات واجبات شهر ({openedMonthFolder})</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                            {monthExtraSubmissions.length} تسليم
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {monthExtraSubmissions.map((sub, idx) => (
                            <div
                              key={sub.id ? `m-sub-${sub.id}-${idx}` : `m-sub-idx-${idx}`}
                              className="p-3.5 rounded-2xl bg-[#F8FAFD] border border-[#DCE7F3]"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="text-xs font-bold text-[#1E5AA8] bg-white px-2 py-0.5 rounded-md border border-[#C6DCF2]">
                                  مادة {sub.subject}
                                </span>
                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                  درجة: {sub.score ?? 0} / {sub.maxScore ?? 5}
                                </span>
                              </div>
                              <p className="text-xs text-gray-800 font-semibold line-clamp-2 mb-2">
                                {sub.title || (sub as any).questionText || sub.studentNotes || (sub as any).notes || 'إجابة واجب منزلي'}
                              </p>
                              <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-200">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-gray-400" />
                                  <span>{(sub as any).submittedAtFormatted || sub.submittedAt || 'تم التسليم'}</span>
                                </span>
                                <span className="text-emerald-600 font-bold">
                                  {sub.status === 'تم التصحيح' || sub.status === 'graded' ? 'تم التصحيح والاعتماد' : sub.status || 'مرسل'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* OPENED FOLDER CONTENT: SECTION 2 - ارشيف درجاتي الشهري (جدول كشف الدرجات مطابق لتبويب درجاتي) */}
          {openedMonthFolder && section === 'monthly_grades' && (() => {
            const monthGrades = studentGrades.filter((g) => resolveItemMonth(g) === openedMonthFolder);
            const monthSubmissions = submissions.filter((s) => resolveItemMonth(s) === openedMonthFolder);
            const matchArchives = archivedGradebooks.filter((a) => a.month === openedMonthFolder);

            const monthSubjectOptions = Array.from(
              new Set<string>([
                ...gradeSubjects,
                ...monthGrades.map((g) => g.subjectName || g.subject).filter(Boolean) as string[],
                ...monthSubmissions.map((s) => s.subject).filter(Boolean) as string[],
              ])
            );

            return (
              <div className="space-y-4">
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
                      {subjName}
                    </button>
                  ))}
                </div>

                {/* Same Subject Gradebook Tables as "درجاتي" Tab */}
                <StudentSubjectGradeTables
                  grades={monthGrades}
                  submissions={monthSubmissions}
                  subjectOptions={monthSubjectOptions}
                  selectedSubject={selectedGradeSubject}
                  monthLabel={openedMonthFolder}
                  emptyTitle={`لا توجد درجات مرصودة في مجلد شهر (${openedMonthFolder})`}
                  emptySubtitle="ستظهر جداول كشف الدرجات لكل مادة داخل هذا المجلد فور رصد التقييمات والتسليمات."
                />

                {/* Official Teacher Monthly Rollover Summaries (if available for this month) */}
                {matchArchives.map((arc) => {
                  const studentInArchive = arc.roster?.find((s) => s.code === session.code);
                  if (!studentInArchive) return null;
                  if (selectedGradeSubject !== 'الكل' && arc.subject !== selectedGradeSubject) return null;
                  return (
                    <div
                      key={arc.id}
                      className="bg-emerald-50/60 rounded-2xl p-4 sm:p-5 border border-emerald-200 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-black text-xs sm:text-sm text-emerald-950">
                          ملخص اعتماد المعلم لشهر ({openedMonthFolder}) — مادة {arc.subject}
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
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-[#1A3A5F] flex items-center gap-1.5">
                              <Megaphone className="w-3.5 h-3.5 text-amber-600" />
                              <span>{anc.title}</span>
                            </span>
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

          {/* OPENED FOLDER CONTENT: SECTION 4 - ارشيف توصيات المعلم الشهري */}
          {openedMonthFolder && section === 'monthly_recommendations' && (() => {
            const monthRecs = recommendations.filter((r) => resolveItemMonth(r) === openedMonthFolder);
            return (
              <div className="space-y-3">
                <div className="p-3 bg-gradient-to-r from-emerald-50 via-blue-50 to-amber-50 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs text-[#1A3A5F]">
                  <span className="font-bold">توصيات المعلمين لشهر ({openedMonthFolder}):</span>
                  <span className="font-bold text-emerald-800 font-mono">{monthRecs.length} توصية</span>
                </div>

                {monthRecs.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 text-xs">
                    لا توجد توصيات من المعلمين في مجلد شهر ({openedMonthFolder}) بعد.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {monthRecs.map((rec, idx) => {
                      const isPrivateForMe =
                        rec.targetScope === 'specific_student' || Boolean(rec.targetStudentCode);
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
                                مادة {rec.subject}
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

                          <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                            <span className="font-bold text-[#1A3A5F]">
                              المعلم: {rec.teacherName}
                            </span>
                            <span className="text-amber-700 font-bold">
                              الصف {rec.grade === 'all' ? 'المدرسي' : rec.grade}
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

          {/* OPENED FOLDER CONTENT: SECTION 5 - أرشفة الأنشطة المدرسية */}
          {openedMonthFolder && section === 'school_activities_archive' && (() => {
            const normalizeCat = (cat: string): 'تقرير' | 'نشاط' | 'فعالية' => {
              if (cat === 'تقرير') return 'تقرير';
              if (cat === 'فعالية') return 'فعالية';
              return 'نشاط';
            };
            const monthBatches = archivedSchoolActivityBatches.filter(
              (b) => (b.monthName || currentAcademicMonth) === openedMonthFolder
            );
            const totalItems = monthBatches.reduce((sum, b) => sum + (b.activities?.length || 0), 0);

            return (
              <div className="space-y-4">
                <div className="p-3 bg-[#EEF5FC] rounded-2xl border border-[#C6DCF2] flex flex-wrap items-center justify-between gap-2 text-xs text-[#1A3A5F]">
                  <div>
                    <span className="font-black block">
                      أرشيف الأنشطة والتقارير والفعاليات المدرسية (شهر {openedMonthFolder})
                    </span>
                  </div>
                  <span className="font-black text-[#1F5AAA] bg-white px-2.5 py-1 rounded-xl border border-[#C6DCF2]">
                    {totalItems} منشور مؤرشف
                  </span>
                </div>

                {/* Category filter pills */}
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
                      {cat === 'الكل' ? 'الكل' : cat === 'تقرير' ? 'التقارير' : cat === 'نشاط' ? 'الأنشطة' : 'الفعاليات'}
                    </button>
                  ))}
                </div>

                {monthBatches.length === 0 || totalItems === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-white rounded-2xl border border-gray-200 text-xs space-y-1.5">
                    <Trophy className="w-9 h-9 text-[#9BBEDF] mx-auto" />
                    <p className="font-bold text-[#1A3A5F]">
                      لا توجد أنشطة مدرسية مؤرشفة في مجلد شهر ({openedMonthFolder}) حتى الآن.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {monthBatches.map((batch, bIdx) => {
                      const batchItems = (batch.activities || []).filter(
                        (act) =>
                          selectedSchoolActivityCat === 'الكل' ||
                          normalizeCat(act.category) === selectedSchoolActivityCat
                      );
                      if (batchItems.length === 0) return null;

                      return (
                        <div
                          key={batch.id ? `sa-batch-${batch.id}-${bIdx}` : `sa-batch-idx-${bIdx}`}
                          className="rounded-2xl border border-[#C6DCF2] bg-white overflow-hidden"
                        >
                          <div className="px-4 py-2.5 bg-[#EEF5FC] border-b border-[#C6DCF2] flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 font-black text-[#1A3A5F]">
                              <Calendar className="w-4 h-4 text-[#1F5AAA]" />
                              <span>{batch.weekLabel}</span>
                            </div>
                            <span className="text-[11px] font-bold text-[#1F5AAA] bg-white px-2.5 py-0.5 rounded-lg border border-[#C6DCF2]">
                              {batchItems.length} منشور
                            </span>
                          </div>

                          <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {batchItems.map((act, idx) => {
                              const bucket = normalizeCat(act.category);
                              const liveMatch = approvedSchoolActivities.find((x) => x.id === act.id);
                              const coverSrc =
                                act.coverImage ||
                                (liveMatch && Array.isArray(liveMatch.images) ? liveMatch.images[0] : undefined);
                              const classLabel =
                                !act.targetGrade || act.targetGrade === 'الكل'
                                  ? 'جميع الصفوف'
                                  : `${getGradeLabelAr(act.targetGrade)}${
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
                                      {act.imagesCount && act.imagesCount > 1 && (
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
