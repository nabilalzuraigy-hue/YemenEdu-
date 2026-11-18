import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Send,
  X,
  Clock,
  Trash2,
  CheckCircle2,
  BookOpen,
  Lock,
  MessageSquareQuote,
  Users,
  UserCheck,
  Search,
} from 'lucide-react';
import {
  appDataService,
  TeacherRecommendation,
} from '../services/appData';
import { authService, UserSession } from '../services/authService';
import { formatArabicSchoolName } from '../utils/schoolDisplay';

interface TeacherRecommendationModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession;
}

interface RosterStudent {
  code: string;
  name: string;
}

export const TeacherRecommendationModal: React.FC<TeacherRecommendationModalProps> = ({
  isOpen,
  onClose,
  session,
}) => {
  const teacherGrade = (session.grade as string) || '8';
  const teacherSubject = session.subject || 'العلوم';
  const teacherSchoolId = session.schoolId || '';

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'عامة' | 'واجبات' | 'امتحانات' | 'تحفيز' | 'إرشاد'>('عامة');
  const [targetScope, setTargetScope] = useState<'all_students' | 'specific_student'>('all_students');
  const [targetStudentCode, setTargetStudentCode] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'public' | 'private'>('all');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishedSuccessInfo, setPublishedSuccessInfo] = useState<{
    stamp: string;
    targetLabel: string;
    isPrivate: boolean;
  } | null>(null);
  const [recommendations, setRecommendations] = useState<TeacherRecommendation[]>([]);
  const [studentsList, setStudentsList] = useState<RosterStudent[]>([]);

  const lockedGradeLabel =
    teacherGrade === '7'
      ? 'الصف السابع'
      : teacherGrade === '8'
      ? 'الصف الثامن'
      : teacherGrade === '9'
      ? 'الصف التاسع'
      : `الصف ${teacherGrade}`;

  const loadStudentsRoster = () => {
    if (!teacherSchoolId) {
      setStudentsList([]);
      return;
    }
    const normalizedSchool = teacherSchoolId.trim().toLowerCase();
    const map = new Map<string, RosterStudent>();

    // Primary source: registered student activation codes for this school & grade
    authService.getRegisteredCodes().forEach((c) => {
      if (
        c.role === 'student' &&
        (c.schoolId || '').trim().toLowerCase() === normalizedSchool &&
        (!c.grade || String(c.grade).trim() === String(teacherGrade).trim())
      ) {
        const cleanCode = (c.code || '').trim();
        if (cleanCode) {
          map.set(cleanCode.toLowerCase(), {
            code: cleanCode,
            name: (c.assignedToName || cleanCode).trim(),
          });
        }
      }
    });

    // Secondary fallback: students known via grades/submissions in this grade
    appDataService.getStudentGradeSheet(teacherGrade, teacherSchoolId, teacherSubject).forEach((s) => {
      const cleanCode = (s.code || '').trim();
      if (cleanCode && !map.has(cleanCode.toLowerCase())) {
        map.set(cleanCode.toLowerCase(), {
          code: cleanCode,
          name: (s.name || cleanCode).trim(),
        });
      }
    });

    const sorted = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    setStudentsList(sorted);
  };

  // Load existing recommendations strictly locked to this school, teacher's grade & subject (including private ones authored by this teacher)
  const refreshList = () => {
    if (!teacherSchoolId) {
      setRecommendations([]);
      return;
    }
    const normalizedSchool = teacherSchoolId.trim().toLowerCase();
    const list = appDataService
      .getRecommendations(teacherSchoolId, teacherGrade, teacherSubject, {
        includePrivateForTeacher: true,
      })
      .filter(
        (r) =>
          (r.schoolId || '').trim().toLowerCase() === normalizedSchool &&
          r.grade === teacherGrade &&
          r.subject === teacherSubject &&
          (r.teacherId === session.code || r.teacherName === session.name)
      );
    setRecommendations(list);
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshList();
    loadStudentsRoster();
    const unsubData = appDataService.subscribe(() => {
      refreshList();
      loadStudentsRoster();
    });
    const unsubAuth = authService.subscribe(() => {
      loadStudentsRoster();
    });
    return () => {
      unsubData();
      unsubAuth();
    };
  }, [isOpen, teacherGrade, teacherSubject, teacherSchoolId, session.code, session.name]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return studentsList;
    return studentsList.filter((s) => s.name.toLowerCase().includes(q));
  }, [studentsList, studentSearch]);

  const selectedStudent = useMemo(
    () => studentsList.find((s) => s.code === targetStudentCode) || null,
    [studentsList, targetStudentCode]
  );

  const displayedRecommendations = useMemo(() => {
    if (historyFilter === 'all') return recommendations;
    if (historyFilter === 'private') {
      return recommendations.filter(
        (r) => r.targetScope === 'specific_student' || Boolean(r.targetStudentCode)
      );
    }
    return recommendations.filter(
      (r) => r.targetScope !== 'specific_student' && !r.targetStudentCode
    );
  }, [recommendations, historyFilter]);

  if (!isOpen) return null;

  const isSpecificInvalid = targetScope === 'specific_student' && !targetStudentCode.trim();

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting || isSpecificInvalid) return;

    setIsSubmitting(true);
    try {
      const isPrivate = targetScope === 'specific_student' && Boolean(targetStudentCode.trim());
      const targetStudentName = isPrivate
        ? selectedStudent?.name || targetStudentCode.trim()
        : undefined;

      const savedRec = await appDataService.addRecommendation({
        teacherId: session.code,
        teacherName: session.name,
        schoolId: teacherSchoolId,
        grade: teacherGrade,
        subject: teacherSubject,
        title:
          title.trim() ||
          (isPrivate
            ? `توصية خاصة (${teacherSubject}) - ${targetStudentName}`
            : `توصية ${teacherSubject} - ${category}`),
        content: content.trim(),
        category,
        targetScope: isPrivate ? 'specific_student' : 'all_students',
        ...(isPrivate
          ? {
              targetStudentCode: targetStudentCode.trim(),
              targetStudentName,
            }
          : {}),
      });

      // Clear input and stamp date/time
      setContent('');
      setTitle('');
      setPublishedSuccessInfo({
        stamp: savedRec.createdAtFormatted,
        targetLabel: isPrivate ? targetStudentName || 'طالب محدد' : `جميع طلاب ${lockedGradeLabel}`,
        isPrivate,
      });
      refreshList();

      setTimeout(() => {
        setPublishedSuccessInfo(null);
      }, 5500);
    } catch (err) {
      console.error('Error publishing recommendation:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await appDataService.deleteRecommendation(id);
      refreshList();
    } catch (err) {
      console.error('Error deleting recommendation:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/50 backdrop-blur-[2px] overflow-y-auto font-['Cairo','Tajawal']">
      <div className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl p-4 sm:p-8 bg-white border border-[#B3CDE8] shadow-[0_12px_36px_rgba(26,58,95,0.16)] text-right animate-in fade-in zoom-in-95 my-auto">
        {/* Modal Header Bar with Close Button */}
        <div className="relative flex items-center justify-between gap-2 pb-4 border-b border-[#DCE7F3] mb-5">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#EEF5FC] flex items-center justify-center text-[#1F5AAA] shadow-xs border border-[#C6DCF2] shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[#1F5AAA] animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-md bg-[#1F5AAA] text-white shadow-xs">
                  توصيات تربوية وتوجيهية
                </span>
                <span className="text-xs font-bold text-[#5C7085] truncate">
                  {formatArabicSchoolName(session.schoolName, session.schoolId)}
                </span>
              </div>
              <h2 className="text-base sm:text-xl font-black text-[#1A3A5F] mt-0.5 leading-snug">
                توصيات وتعليمات المعلم التربوية
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-[#F4F8FC] hover:bg-[#E8F1FB] text-[#1A3A5F] border border-[#DCE7F3] transition cursor-pointer shadow-xs shrink-0"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert with Stamped Date & Time */}
        {publishedSuccessInfo && (
          <div className="mb-5 p-4 rounded-2xl bg-emerald-50/95 border border-emerald-300 text-emerald-900 shadow-sm flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-black">
                  {publishedSuccessInfo.isPrivate
                    ? `تم إرسال التوصية الخاصة بشكل سري إلى الطالب (${publishedSuccessInfo.targetLabel}) بنجاح!`
                    : `تم نشر التوصية لـ (${publishedSuccessInfo.targetLabel}) بنجاح!`}
                </p>
                <p className="text-[11px] text-emerald-700 font-bold mt-0.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>تاريخ ووقت النشر المعتمد: {publishedSuccessInfo.stamp}</span>
                </p>
              </div>
            </div>
            <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-emerald-200/70 text-emerald-800 shrink-0">
              {publishedSuccessInfo.isPrivate ? 'خاصة' : 'معتمد'}
            </span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handlePublish} className="relative space-y-4">
          {/* Row 1: Grade, Category, Subject Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Locked Subject */}
            <div>
              <label className="block text-[11px] font-black text-[#1A3A5F] mb-1">
                المادة الدراسية (مغلقة):
              </label>
              <div className="px-3 py-2 rounded-xl bg-[#EEF5FC] border border-[#C6DCF2] text-[#1A3A5F] font-black text-xs flex items-center justify-between gap-2 shadow-2xs">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-[#1F5AAA]" />
                  <span>مادة {teacherSubject}</span>
                </span>
                <Lock className="w-3.5 h-3.5 text-[#1F5AAA] shrink-0" />
              </div>
            </div>

            {/* Locked Grade (Strictly Teacher's Assigned Grade Only) */}
            <div>
              <label className="block text-[11px] font-black text-[#1A3A5F] mb-1">
                الصف المستهدف (مغلق على صفك):
              </label>
              <div className="px-3 py-2 rounded-xl bg-[#F4F8FC] border border-[#DCE7F3] text-[#1A3A5F] font-black text-xs flex items-center justify-between gap-2 shadow-2xs">
                <span>{lockedGradeLabel}</span>
                <Lock className="w-3.5 h-3.5 text-[#1F5AAA] shrink-0" />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[11px] font-black text-[#1A3A5F] mb-1">
                نوع التوصية:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#DCE7F3] focus:border-[#1F5AAA] text-xs font-black text-[#1A3A5F] focus:outline-none shadow-2xs cursor-pointer"
              >
                <option value="عامة">تعليمات وتوجيهات عامة</option>
                <option value="واجبات">واجبات وتحضير منزلي</option>
                <option value="امتحانات">نصائح وإرشادات اختبارات</option>
                <option value="تحفيز">تحفيز وتكريم المتفوقين</option>
                <option value="إرشاد">إرشاد تربوي وسلوكي</option>
              </select>
            </div>
          </div>

          {/* Row 1.5: Target Audience Toggle (All Students vs Specific Student) */}
          <div className="p-3.5 rounded-2xl bg-[#F4F8FC] border border-[#DCE7F3] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-black text-[#1A3A5F]">
                المستلمون المستهدفون:
              </label>
              <span className="text-[11px] font-bold text-[#28486B]">
                {targetScope === 'specific_student'
                  ? 'رسالة سرية لا يراها إلا الطالب المحدد'
                  : `تظهر لجميع طلاب ${lockedGradeLabel}`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTargetScope('all_students')}
                className={`p-3 rounded-xl border-2 text-right transition flex items-center gap-2.5 cursor-pointer ${
                  targetScope === 'all_students'
                    ? 'bg-[#EEF5FC] border-[#1F5AAA] text-[#1A3A5F] shadow-xs'
                    : 'bg-white border-[#DCE7F3] text-[#1A3A5F] hover:bg-[#F4F8FC]'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    targetScope === 'all_students'
                      ? 'bg-[#1F5AAA] text-white'
                      : 'bg-[#F0F4F8] text-[#1A3A5F]'
                  }`}
                >
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black">جميع طلاب الصف ({studentsList.length})</div>
                  <div className="text-[11px] text-[#5C7085] font-semibold truncate">
                    توصية عامة لكافة طلاب {lockedGradeLabel}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetScope('specific_student')}
                className={`p-3 rounded-xl border-2 text-right transition flex items-center gap-2.5 cursor-pointer ${
                  targetScope === 'specific_student'
                    ? 'bg-[#EEF5FC] border-[#1F5AAA] text-[#1A3A5F] shadow-xs'
                    : 'bg-white border-[#DCE7F3] text-[#1A3A5F] hover:bg-[#F4F8FC]'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    targetScope === 'specific_student'
                      ? 'bg-[#1F5AAA] text-white'
                      : 'bg-[#F0F4F8] text-[#1A3A5F]'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black flex items-center gap-1">
                    <span>طالب محدد (خاصة)</span>
                    <Lock className={`w-3 h-3 shrink-0 ${targetScope === 'specific_student' ? 'text-[#1F5AAA]' : 'text-[#5C7085]'}`} />
                  </div>
                  <div className={`text-[11px] font-semibold truncate ${targetScope === 'specific_student' ? 'text-[#28486B]' : 'text-[#5C7085]'}`}>
                    لا تظهر لبقية الطلاب نهائياً
                  </div>
                </div>
              </button>
            </div>

            {targetScope === 'specific_student' && (
              <div className="pt-2 border-t border-[#DCE7F3] space-y-2 animate-in fade-in">
                <div className="flex flex-col sm:flex-row gap-2">
                  {studentsList.length > 6 && (
                    <div className="relative sm:w-44 shrink-0">
                      <Search className="w-3.5 h-3.5 text-[#1F5AAA] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="ابحث باسم الطالب..."
                        className="w-full pr-8 pl-2.5 py-2 rounded-xl bg-white border border-[#DCE7F3] text-xs font-bold text-[#1A3A5F] placeholder:text-slate-400 focus:border-[#1F5AAA] focus:outline-none"
                      />
                    </div>
                  )}

                  <select
                    required={targetScope === 'specific_student'}
                    value={targetStudentCode}
                    onChange={(e) => setTargetStudentCode(e.target.value)}
                    className="w-full min-w-0 max-w-full px-3 py-2 rounded-xl bg-white border border-[#9BBEDF] text-xs font-black text-[#1A3A5F] focus:border-[#1F5AAA] focus:outline-none cursor-pointer truncate"
                  >
                    <option value="">-- اختر الطالب المراد إرسال التوصية له --</option>
                    {filteredStudents.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                {studentsList.length === 0 ? (
                  <p className="text-[11px] text-amber-900 bg-amber-100 border border-amber-400 rounded-xl px-3 py-2 font-black">
                    لا يوجد طلاب مسجلون في {lockedGradeLabel} بهذه المدرسة حالياً.
                  </p>
                ) : (
                  <p className="text-[11px] text-[#1A3A5F] bg-[#EEF5FC] border border-[#C6DCF2] rounded-xl px-3 py-1.5 font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#1F5AAA] shrink-0" />
                    <span>
                      {selectedStudent
                        ? `خصوصية تامة: ستصل التوصية إلى حساب (${selectedStudent.name}) فقط ولن تظهر لأي طالب آخر.`
                        : 'خصوصية تامة: اختر طالباً لتصل التوصية إلى حسابه وحده دون ظهورها لزملائه.'}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Title (Optional) */}
          <div>
            <label className="block text-[11px] font-black text-[#1A3A5F] mb-1">
              عنوان التوصية / التعليمات (اختياري):
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                targetScope === 'specific_student' && selectedStudent
                  ? `مثال: ملاحظة تربوية خاصة للطالب ${selectedStudent.name}`
                  : `مثال: تعليمات الوحدة القادمة لطلاب ${lockedGradeLabel}`
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DCE7F3] focus:border-[#1F5AAA] focus:outline-none text-xs text-[#1A3A5F] placeholder:text-slate-400 shadow-2xs font-bold"
            />
          </div>

          {/* Content (Required) */}
          <div>
            <label className="block text-xs font-black text-[#1A3A5F] mb-1 flex flex-wrap items-center justify-between gap-1">
              <span>
                {targetScope === 'specific_student'
                  ? 'نص التوصية الخاصة للطالب:'
                  : 'نص التوصية أو التعليمات العامة:'}
              </span>
              <span className="text-[11px] text-[#5C7085] font-bold">
                {targetScope === 'specific_student'
                  ? 'تصل للطالب المحدد فقط في تبويب التوصيات'
                  : 'تصل فوراً لجميع طلابك في تبويب التوصيات'}
              </span>
            </label>
            <textarea
              required
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                targetScope === 'specific_student'
                  ? 'اكتب هنا توجيهك الشخصي، ملاحظاتك التربوية، أو رسالة التشجيع الخاصة بهذا الطالب...'
                  : 'اكتب هنا تعليماتك الدراسية، أفكار المذاكرة، صفحات الواجب المهمة، أو نصائح التفوق لطلابك...'
              }
              className="w-full p-3.5 rounded-2xl bg-white border border-[#DCE7F3] focus:border-[#1F5AAA] focus:outline-none text-xs sm:text-sm text-[#1A3A5F] placeholder:text-slate-400 shadow-2xs resize-none font-semibold leading-relaxed"
            />
          </div>

          {/* Publish Button (Calm Royal Blue #1F5AAA with crisp white text, zero faded opacity) */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={isSubmitting || isSpecificInvalid}
              className="w-full py-3.5 px-6 rounded-2xl text-white font-black text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-2.5 shadow-sm cursor-pointer bg-[#1F5AAA] hover:bg-[#194B91] border border-[#194B91]"
            >
              {targetScope === 'specific_student' ? (
                <Lock className="w-4 h-4 text-white shrink-0" />
              ) : (
                <Send className="w-5 h-5 text-white shrink-0" />
              )}
              <span>
                {isSubmitting
                  ? 'جاري النشر...'
                  : targetScope === 'specific_student'
                  ? selectedStudent
                    ? `إرسال توصية خاصة إلى ${selectedStudent.name}`
                    : 'اختر الطالب لإرسال التوصية الخاصة'
                  : 'نشر التوصية لطلابي الآن'}
              </span>
            </button>
          </div>
        </form>

        {/* Existing Published Recommendations List */}
        <div className="mt-6 pt-5 border-t border-[#DCE7F3]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h4 className="text-xs sm:text-sm font-black text-[#1A3A5F] flex items-center gap-2">
              <MessageSquareQuote className="w-4 h-4 text-[#1F5AAA]" />
              <span>سجل توصياتك المنشورة مؤخراً ({displayedRecommendations.length})</span>
            </h4>

            <div className="flex items-center gap-1 bg-[#F4F8FC] p-0.5 rounded-xl border border-[#DCE7F3]">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'public', label: 'العامة' },
                  { id: 'private', label: 'الخاصة' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition cursor-pointer ${
                    historyFilter === tab.id
                      ? 'bg-[#1F5AAA] text-white shadow-2xs'
                      : 'text-[#1A3A5F] hover:bg-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {displayedRecommendations.length === 0 ? (
            <div className="p-4 rounded-2xl bg-[#F4F8FC] border border-[#DCE7F3] text-center text-xs text-[#5C7085] font-semibold">
              {recommendations.length === 0
                ? 'لم تقم بنشر أي توصيات بعد. اكتب أول توصية لطلابك عبر النموذج أعلاه!'
                : 'لا توجد توصيات ضمن هذا التصنيف.'}
            </div>
          ) : (
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {displayedRecommendations.map((rec) => {
                const isPrivateRec =
                  rec.targetScope === 'specific_student' || Boolean(rec.targetStudentCode);
                return (
                  <div
                    key={rec.id}
                    className={`p-3.5 rounded-2xl border shadow-2xs transition relative group bg-white ${
                      isPrivateRec
                        ? 'border-2 border-[#9BBEDF]'
                        : 'border-[#DCE7F3]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isPrivateRec ? (
                          <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-[#1F5AAA] text-white border border-[#194B91] inline-flex items-center gap-1">
                            <Lock className="w-3 h-3 text-white" />
                            <span>
                              خاصة بالطالب:{' '}
                              {rec.targetStudentName ||
                                studentsList.find((s) => s.code === rec.targetStudentCode)?.name ||
                                'طالب محدد'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 inline-flex items-center gap-1">
                            <Users className="w-3 h-3 text-slate-600" />
                            <span>عامة للصف</span>
                          </span>
                        )}
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {rec.category || 'عامة'}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                          مادة {rec.subject}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(rec.id)}
                        className="p-1 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                        title="حذف هذه التوصية"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {rec.title && (
                      <h5 className="font-bold text-xs sm:text-sm text-[#1A3A5F] mb-1">
                        {rec.title}
                      </h5>
                    )}

                    <p className="text-xs sm:text-sm text-gray-800 leading-relaxed font-normal whitespace-pre-wrap">
                      {rec.content}
                    </p>

                    <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1 font-semibold text-emerald-700">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>تاريخ ووقت النشر: {rec.createdAtFormatted}</span>
                      </span>
                      <span className="font-bold text-gray-500 font-mono">
                        بواسطة: {rec.teacherName}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

