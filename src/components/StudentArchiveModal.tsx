import React, { useState } from 'react';
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
  Filter,
  Layers,
  ChevronLeft,
  Lock,
} from 'lucide-react';
import { UserSession, getSubjectsForGrade } from '../services/authService';
import {
  Question,
  HomeworkSubmission,
  GradeRecord,
  MonthlyGradebookRecord,
  MonthlyHomeworkArchiveBatch,
  Announcement,
  TeacherRecommendation,
  ACADEMIC_MONTHS,
  getCurrentAcademicMonth,
  isObjectiveQuestion,
} from '../services/appData';
import { StudentArchiveSection } from './UnifiedSidebar';
import { formatArabicSchoolName, getSchoolPrincipalName, isGenericPrincipalSender, isSimulationAnnouncement } from '../utils/schoolDisplay';

interface StudentArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: StudentArchiveSection | null;
  session: UserSession;
  questions: Question[];
  archivedHomeworkBatches?: MonthlyHomeworkArchiveBatch[];
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
  questions,
  archivedHomeworkBatches = [],
  submissions,
  studentGrades,
  archivedGradebooks,
  announcements,
  recommendations,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentAcademicMonth());
  const [selectedHwSubject, setSelectedHwSubject] = useState<string>('الكل');

  if (!isOpen || !section) return null;

  const gradeSubjects = getSubjectsForGrade(session.grade || session.class || '8').map((s) => s.nameAr);

  const sectionMeta = {
    weekly_homework: {
      title: 'أرشيف الواجبات الأسبوعية',
      subtitle: 'سجل الواجبات والتمارين الأسبوعية والواجبات المكتملة',
      icon: Calendar,
      color: 'from-blue-600 to-indigo-700',
    },
    monthly_homework: {
      title: 'أرشيف الواجبات الشهرية',
      subtitle: 'تصفح بنك الأسئلة والواجبات الشهرية حسب الشهور الدراسية',
      icon: FileText,
      color: 'from-indigo-600 to-blue-800',
    },
    monthly_grades: {
      title: 'أرشيف درجاتي الشهري',
      subtitle: 'سجل الدرجات والتقييمات المعتمدة ونسب النجاح الشهرية',
      icon: Award,
      color: 'from-emerald-600 to-teal-800',
    },
    monthly_circulars: {
      title: 'أرشيف التعاميم الإدارية الشهري',
      subtitle: 'التوجيهات والتعاميم المدرسية الرسمية المؤرشفة شهرياً',
      icon: Megaphone,
      color: 'from-amber-600 to-orange-700',
    },
    monthly_recommendations: {
      title: 'أرشيف توصيات المعلم الشهري',
      subtitle: 'توصيات وتعليمات المعلمين التربوية للمواد المؤرشفة',
      icon: Sparkles,
      color: 'from-emerald-600 via-[#1E5AA8] to-amber-500',
    },
  }[section];

  const IconComponent = sectionMeta.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto font-['Cairo','Tajawal']">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90dvh] flex flex-col shadow-2xl border border-gray-200 overflow-hidden text-right animate-in fade-in zoom-in-95 my-auto">
        
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
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
            title="إغلاق الأرشيف"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Academic Month Selector Tab */}
        <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 shrink-0">
            <Filter className="w-4 h-4 text-[#1E5AA8]" />
            <span>الشهر الدراسي:</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            {ACADEMIC_MONTHS.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                  selectedMonth === m
                    ? 'bg-[#1E5AA8] text-white shadow-xs'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* SECTION 1: ارشيف الواجب الاسبوعي */}
          {section === 'weekly_homework' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs text-[#1A3A5F]">
                <span className="font-bold">سجل الواجبات والتسليمات الأسبوعية:</span>
                <span className="font-mono font-bold text-[#1E5AA8]">إجمالي التسليمات: {submissions.length}</span>
              </div>

              {submissions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200 text-xs">
                  لا توجد تسليمات أسبوعية مسجلة بعد.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {submissions.map((sub, idx) => (
                    <div
                      key={sub.id ? `sub-${sub.id}-${idx}` : `sub-idx-${idx}`}
                      className="p-3.5 rounded-2xl bg-white border border-gray-200 shadow-2xs hover:shadow-xs transition"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-[#1E5AA8] bg-blue-50 px-2 py-0.5 rounded-md">
                          مادة {sub.subject}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          درجة: {sub.score ?? 0} / {sub.maxScore ?? 5}
                        </span>
                      </div>
                      <p className="text-xs text-gray-800 font-semibold line-clamp-2 mb-2">
                        {sub.title || (sub as any).questionText || sub.studentNotes || (sub as any).notes || 'إجابة واجب منزلي'}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-gray-100">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>{(sub as any).submittedAtFormatted || sub.submittedAt || 'تم التسليم'}</span>
                        </span>
                        <span className="text-emerald-600 font-bold">
                          {sub.status === 'تم التصحيح' || sub.status === 'graded' ? 'تم التصحيح والاعتماد ✅' : sub.status || 'مرسل'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: ارشيف الواجب الشهري (الأرشفة التلقائية كل خميس) */}
          {section === 'monthly_homework' && (() => {
            const monthBatches = archivedHomeworkBatches.filter(
              (b) => !b.monthName || b.monthName === selectedMonth
            );
            const allMonthQuestions = monthBatches.flatMap((b) => b.questions || []);
            const hwSubjectsList = Array.from(
              new Set<string>([
                ...gradeSubjects,
                ...allMonthQuestions.map((q) => q.subject).filter(Boolean),
              ])
            );

            return (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50/80 rounded-2xl border border-indigo-200 flex flex-wrap items-center justify-between gap-2 text-xs text-indigo-900">
                  <div>
                    <span className="font-bold block">أرشيف واجبات شهر ({selectedMonth}) — الترحيل الأسبوعي التلقائي (كل خميس)</span>
                    <span className="text-[11px] text-indigo-700">تُحفظ هنا واجبات كل أسبوع تلقائياً يوم الخميس مرتبة حسب المادة والأسبوع</span>
                  </div>
                  <span className="font-bold text-indigo-700 bg-white px-2.5 py-1 rounded-xl border border-indigo-200">
                    {allMonthQuestions.length} واجب مؤرشف
                  </span>
                </div>

                {/* Subject filter bar inside monthly homework archive */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {['الكل', ...hwSubjectsList].map((subjName, sIdx) => (
                    <button
                      key={`arc-hw-subj-${subjName}-${sIdx}`}
                      type="button"
                      onClick={() => setSelectedHwSubject(subjName)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                        selectedHwSubject === subjName
                          ? 'bg-[#1E5AA8] text-white shadow-xs'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                      }`}
                    >
                      {subjName}
                    </button>
                  ))}
                </div>

                {monthBatches.length === 0 || allMonthQuestions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200 text-xs space-y-1.5">
                    <BookOpen className="w-9 h-9 text-indigo-300 mx-auto" />
                    <p className="font-bold text-gray-700">
                      لا توجد واجبات مؤرشفة لشهر ({selectedMonth}) حتى الآن.
                    </p>
                    <p className="text-[11px] text-gray-500">
                      تُؤرشف واجبات كل أسبوع تلقائياً يوم الخميس من كل أسبوع وتظهر هنا مصنفة حسب المادة.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {monthBatches.map((batch, bIdx) => {
                      const batchQuestions = (batch.questions || []).filter(
                        (q) => selectedHwSubject === 'الكل' || q.subject === selectedHwSubject
                      );
                      if (batchQuestions.length === 0) return null;

                      // Group batch questions by subject field
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
                          className="rounded-2xl border border-indigo-200 bg-indigo-50/20 overflow-hidden"
                        >
                          <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 font-bold text-[#1A3A5F]">
                              <Calendar className="w-4 h-4 text-[#1E5AA8]" />
                              <span>{batch.weekLabel}</span>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-lg border border-indigo-200">
                              أرشفة تلقائية • {batchQuestions.length} أسئلة
                            </span>
                          </div>

                          <div className="p-3 sm:p-4 space-y-3">
                            {Array.from(bySubject.entries()).map(([subjName, subjQs], sgIdx) => (
                              <div key={`batch-${batch.id}-subj-${subjName}-${sgIdx}`} className="space-y-2">
                                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white border border-blue-100">
                                  <span className="text-xs font-black text-[#1E5AA8] flex items-center gap-1.5">
                                    <BookOpen className="w-3.5 h-3.5 text-[#0E8A6D]" />
                                    <span>حقل مادة: {subjName}</span>
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
                                    const matchedGrade = studentGrades.find(
                                      (g) => g.questionId === q.id
                                    );
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
                  </div>
                )}
              </div>
            );
          })()}

          {/* SECTION 3: ارشيف درجاتي الشهري */}
          {section === 'monthly_grades' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50/80 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
                <span className="font-bold">كشف الدرجات لشهر ({selectedMonth}):</span>
                <span className="font-bold text-emerald-800">معتمد في الكنترول</span>
              </div>

              {/* Archived records check */}
              {(() => {
                const matchArchive = archivedGradebooks.find((a) => a.month === selectedMonth);
                const studentInArchive = matchArchive?.roster?.find((s) => s.code === session.code);

                if (studentInArchive) {
                  return (
                    <div className="bg-emerald-50/40 rounded-2xl p-5 border border-emerald-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-emerald-900">سجل شهر ({selectedMonth}) المؤرشف:</span>
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                          {studentInArchive.rating}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center text-xs">
                        <div className="p-3 bg-white rounded-xl border border-emerald-100">
                          <span className="text-gray-500 block">الدرجة المحصلة</span>
                          <span className="text-base font-black text-[#1E5AA8]">{studentInArchive.totalEarned} / {studentInArchive.totalPossible}</span>
                        </div>
                        <div className="p-3 bg-white rounded-xl border border-emerald-100">
                          <span className="text-gray-500 block">النسبة المئوية</span>
                          <span className="text-base font-black text-emerald-700">{studentInArchive.percentage}%</span>
                        </div>
                        <div className="p-3 bg-white rounded-xl border border-emerald-100">
                          <span className="text-gray-500 block">التسليمات</span>
                          <span className="text-base font-black text-indigo-700">{studentInArchive.submissionsCount}</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // If not in archive, show live grades summary
                const totalScore = studentGrades.reduce((sum, g) => sum + (Number(g.obtained) || Number(g.score) || 0), 0);
                const totalMax = studentGrades.reduce((sum, g) => sum + (Number(g.total) || Number(g.maxScore) || 5), 0);
                const gpa = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center text-xs">
                      <div className="p-2.5 sm:p-3.5 bg-white rounded-2xl border border-gray-200 shadow-2xs">
                        <span className="text-gray-500 block text-[11px] mb-1">إجمالي الدرجات</span>
                        <span className="text-sm sm:text-base font-black text-[#1A3A5F]">{totalScore} / {totalMax > 0 ? totalMax : 5}</span>
                      </div>
                      <div className="p-2.5 sm:p-3.5 bg-white rounded-2xl border border-gray-200 shadow-2xs">
                        <span className="text-gray-500 block text-[11px] mb-1">المعدل العام</span>
                        <span className="text-sm sm:text-base font-black text-emerald-700">{gpa}%</span>
                      </div>
                      <div className="p-2.5 sm:p-3.5 bg-white rounded-2xl border border-gray-200 shadow-2xs">
                        <span className="text-gray-500 block text-[11px] mb-1">الواجبات المرصودة</span>
                        <span className="text-sm sm:text-base font-black text-indigo-700">{studentGrades.length}</span>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-200 overflow-hidden text-xs">
                      {studentGrades.length === 0 ? (
                        <div className="p-6 text-center text-gray-500">لا توجد درجات مرصودة لشهر ({selectedMonth}) بعد.</div>
                      ) : (
                        studentGrades.map((g, idx) => (
                          <div key={g.id ? `arc-g-${g.id}-${idx}` : `arc-g-idx-${idx}`} className="p-3 flex items-center justify-between hover:bg-gray-50">
                            <div>
                              <span className="font-bold text-[#1A3A5F] block">{(g as any).title || (g as any).questionText || g.examType || 'واجب مدرسي'}</span>
                              <span className="text-[11px] text-gray-500">{g.subject || 'المادة الدراسية'}</span>
                            </div>
                            <span className="font-mono font-black text-[#1E5AA8] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                              {g.obtained ?? g.score ?? 5} / {g.total ?? g.maxScore ?? 5}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* SECTION 4: ارشيف التعاميم الإدارية الشهري */}
          {section === 'monthly_circulars' && (() => {
            const cleanAnnouncements = announcements.filter((a) => !isSimulationAnnouncement(a));
            return (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 flex items-center justify-between text-xs text-amber-900">
                  <span className="font-bold">تعاميم وتوجيهات إدارة المدرسة:</span>
                  <span className="font-mono font-bold text-amber-800">{cleanAnnouncements.length} تعميم</span>
                </div>

                {cleanAnnouncements.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200 text-xs">
                    لا توجد تعاميم إدارية معتمدة لهذا الشهر.
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
                          className="p-4 rounded-2xl bg-white border border-gray-200 shadow-2xs hover:shadow-xs transition"
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

          {/* SECTION 5: ارشيف توصيات المعلم الشهري */}
          {section === 'monthly_recommendations' && (
            <div className="space-y-3">
              <div className="p-3 bg-gradient-to-r from-emerald-50 via-blue-50 to-amber-50 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs text-[#1A3A5F]">
                <span className="font-bold">سجل توصيات المعلمين المعتمدة:</span>
                <span className="font-bold text-emerald-800 font-mono">{recommendations.length} توصية</span>
              </div>

              {recommendations.length === 0 ? (
                <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-200 text-xs">
                  لا توجد توصيات من المعلمين مؤرشفة لهذا الشهر بعد.
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => {
                    const isPrivateForMe =
                      rec.targetScope === 'specific_student' || Boolean(rec.targetStudentCode);
                    return (
                      <div
                        key={rec.id ? `arc-rec-${rec.id}-${idx}` : `arc-rec-idx-${idx}`}
                        className={`p-4 rounded-2xl border shadow-2xs hover:shadow-xs transition ${
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
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold transition cursor-pointer"
          >
            إغلاق الأرشيف
          </button>
        </div>

      </div>
    </div>
  );
};
