import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Activity,
  Camera,
  Image as ImageIcon,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Lock,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  Flag,
  Trophy,
  BookOpen,
  Compass,
} from 'lucide-react';
import { UserSession, authService, ALL_SUBJECTS } from '../services/authService';
import {
  appDataService,
  AttendanceEntry,
  AttendanceRecord,
  AttendanceStatus,
  ClassSchedule,
  GRADE_OPTIONS_12,
  SCHEDULE_DAYS,
  SCHEDULE_PERIODS,
  ScheduleSlot,
  SupervisorActivity,
  SupervisorActivityCategory,
  SUPERVISOR_ACTIVITY_CATEGORIES,
  getGradeLabelAr,
} from '../services/appData';
import { UnifiedSidebar, UnifiedSidebarView } from '../components/UnifiedSidebar';
import { ScheduleGridView } from '../components/ScheduleGridView';
import { formatArabicSchoolName } from '../utils/schoolDisplay';

interface SupervisorDashboardProps {
  session: UserSession;
}

const compressImageForGemini = (file: File, maxWidth = 1400, quality = 0.8): Promise<{ dataUrl: string; base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const raw = String(event.target?.result || '');
          const base64 = raw.split(',')[1] || '';
          resolve({ dataUrl: raw, base64, mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({ dataUrl, base64, mimeType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
      img.src = String(event.target?.result || '');
    };
    reader.onerror = () => reject(new Error('تعذر فتح ملف الصورة'));
    reader.readAsDataURL(file);
  });
};

const getTodayIsoDate = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildEmptyGridSlots = (): Record<string, { subject: string; teacherName: string }> => {
  const map: Record<string, { subject: string; teacherName: string }> = {};
  SCHEDULE_DAYS.forEach((day) => {
    SCHEDULE_PERIODS.forEach((p) => {
      map[`${day}_${p.period}`] = { subject: '', teacherName: '' };
    });
  });
  return map;
};

const getActivityBranchIcon = (cat: SupervisorActivityCategory) => {
  switch (cat) {
    case 'تقرير':
      return FileText;
    case 'فعالية':
      return Flag;
    case 'نشاط رياضي':
      return Trophy;
    case 'نشاط ثقافي':
      return BookOpen;
    case 'رحلة مدرسية':
      return Compass;
    default:
      return Activity;
  }
};

export const SupervisorDashboard: React.FC<SupervisorDashboardProps> = ({ session }) => {
  const schoolId = session.schoolId || '';
  const displaySchoolName = formatArabicSchoolName(session.schoolName, schoolId);

  const [activeTab, setActiveTab] = useState<'activities' | 'attendance' | 'schedule'>('activities');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Live synced data
  const [activities, setActivities] = useState<SupervisorActivity[]>(() =>
    appDataService.getSupervisorActivities(schoolId)
  );
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    appDataService.getAttendanceRecords(schoolId)
  );
  const [classSchedules, setClassSchedules] = useState<ClassSchedule[]>(() =>
    appDataService.getClassSchedules(schoolId)
  );

  // Teachers suggestions from school codes
  const schoolTeachers = useMemo(() => {
    const normSchool = schoolId.trim().toLowerCase();
    return authService
      .getRegisteredCodes()
      .filter((c) => c.role === 'teacher' && (c.schoolId || '').trim().toLowerCase() === normSchool)
      .map((c) => c.assignedToName.replace(/^أ\.?\s*/g, '').split('-')[0].trim())
      .filter(Boolean);
  }, [schoolId]);

  // --- TAB 1: ACTIVITIES STATE (Branching inside الأنشطة) ---
  const [selectedActivityBranch, setSelectedActivityBranch] = useState<'الكل' | SupervisorActivityCategory>('تقرير');
  const [actCategory, setActCategory] = useState<SupervisorActivityCategory>('تقرير');
  const [actTitle, setActTitle] = useState('');
  const [actDetails, setActDetails] = useState('');
  const [actTargetGrade, setActTargetGrade] = useState('الكل');
  const [actDate, setActDate] = useState<string>(() => getTodayIsoDate());
  const [isSavingActivity, setIsSavingActivity] = useState(false);

  // --- TAB 2: ATTENDANCE STATE (Gemini Vision + Direct Save Once per Class/Day) ---
  const [attGrade, setAttGrade] = useState('7');
  const [attClassNumber, setAttClassNumber] = useState('1');
  const [attDate, setAttDate] = useState<string>(() => getTodayIsoDate());
  const [attImagePreview, setAttImagePreview] = useState<string | null>(null);
  const [attEntries, setAttEntries] = useState<AttendanceEntry[]>([]);
  const [isParsingAttendance, setIsParsingAttendance] = useState(false);
  const [attParseError, setAttParseError] = useState<string | null>(null);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [expandedAttId, setExpandedAttId] = useState<string | null>(null);
  const attCameraRef = useRef<HTMLInputElement | null>(null);
  const attGalleryRef = useRef<HTMLInputElement | null>(null);

  // --- TAB 3: WEEKLY SCHEDULE STATE (Fixed Term 1, Photo Gemini OR Manual -> Principal Approval) ---
  const [isScheduleComposerOpen, setIsScheduleComposerOpen] = useState(false);
  const [schedGrade, setSchedGrade] = useState('7');
  const [schedClassNumber, setSchedClassNumber] = useState('1');
  const [schedInputMode, setSchedInputMode] = useState<'image' | 'manual'>('image');
  const [schedImagePreview, setSchedImagePreview] = useState<string | null>(null);
  const [schedGrid, setSchedGrid] = useState<Record<string, { subject: string; teacherName: string }>>(() =>
    buildEmptyGridSlots()
  );
  const [isParsingSchedule, setIsParsingSchedule] = useState(false);
  const [schedParseError, setSchedParseError] = useState<string | null>(null);
  const [isSubmittingSchedule, setIsSubmittingSchedule] = useState(false);
  const [expandedSchedId, setExpandedSchedId] = useState<string | null>(null);
  const schedCameraRef = useRef<HTMLInputElement | null>(null);
  const schedGalleryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleToggle = () => setIsSidebarOpen((prev) => !prev);
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, []);

  useEffect(() => {
    const sync = () => {
      setActivities(appDataService.getSupervisorActivities(schoolId));
      setAttendanceRecords(appDataService.getAttendanceRecords(schoolId));
      setClassSchedules(appDataService.getClassSchedules(schoolId));
    };
    sync();
    const unsub = appDataService.subscribe(sync);
    return () => unsub();
  }, [schoolId]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const handleSelectSidebarView = (view: UnifiedSidebarView) => {
    if (view === 'supervisor_activities' || view === 'dashboard') {
      setActiveTab('activities');
    } else if (view === 'supervisor_attendance') {
      setActiveTab('attendance');
    } else if (view === 'supervisor_schedule') {
      setActiveTab('schedule');
    }
  };

  // --- Activity Handlers ---
  const handleSelectBranch = (branch: 'الكل' | SupervisorActivityCategory) => {
    setSelectedActivityBranch(branch);
    if (branch !== 'الكل') {
      setActCategory(branch);
    }
  };

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actTitle.trim() || !actDetails.trim() || isSavingActivity) return;
    setIsSavingActivity(true);
    try {
      await appDataService.addSupervisorActivity({
        schoolId,
        category: actCategory,
        title: actTitle.trim(),
        details: actDetails.trim(),
        targetGrade: actTargetGrade,
        activityDate: actDate,
        createdBy: session.name || 'المشرف',
        supervisorCode: session.code,
      });
      setActTitle('');
      setActDetails('');
      showToast('success', `✅ تم حفظ (${actCategory}) بنجاح وإتاحته في تقارير مدير المدرسة.`);
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر حفظ النشاط، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSavingActivity(false);
    }
  };

  // --- Attendance Handlers ---
  const attendanceAlreadyExistsToday = useMemo(() => {
    return appDataService.hasAttendanceForClassDate(schoolId, attGrade, attClassNumber, attDate);
  }, [attendanceRecords, schoolId, attGrade, attClassNumber, attDate]);

  const handleAttendanceImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAttParseError(null);
    setIsParsingAttendance(true);
    try {
      const { dataUrl, base64, mimeType } = await compressImageForGemini(file, 1400, 0.8);
      setAttImagePreview(dataUrl);

      const response = await fetch('/api/gemini/parse-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('خدمة قراءة الصور غير متوفرة على هذه الاستضافة الثابتة، يمكنك إضافة الأسماء يدوياً أدناه.');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'تعذر قراءة كشف الحضور من الصورة.');
      }

      const parsed: AttendanceEntry[] = Array.isArray(payload?.entries) ? payload.entries : [];
      if (parsed.length === 0) {
        setAttParseError('لم يتم العثور على أسماء واضحة في الصورة. تأكد من وضوح الكشف أو أضف الطلاب يدوياً.');
      } else {
        setAttEntries(parsed);
        showToast('success', `✨ تم استخراج ${parsed.length} طالباً من الصورة. يرجى مراجعة الأسماء والحالة ثم الضغط على حفظ.`);
      }
    } catch (err: any) {
      setAttParseError(err?.message || 'حدث خطأ أثناء قراءة صورة كشف الحضور.');
    } finally {
      setIsParsingAttendance(false);
    }
  };

  const handleSaveAttendance = async () => {
    if (attendanceAlreadyExistsToday) {
      showToast('error', `لا يمكن التسجيل مرتين: تم تسجيل حضور وغياب هذا الفصل بتاريخ ${attDate} مسبقاً.`);
      return;
    }
    if (attEntries.length === 0) {
      showToast('error', 'يرجى تصوير كشف الحضور أو إضافة أسماء الطلاب أولاً.');
      return;
    }
    setIsSavingAttendance(true);
    try {
      await appDataService.saveAttendanceRecordOnce({
        schoolId,
        grade: attGrade,
        classNumber: attClassNumber,
        date: attDate,
        entries: attEntries,
        recordedBy: session.name || 'المشرف',
        supervisorCode: session.code,
      });
      setAttEntries([]);
      setAttImagePreview(null);
      setAttParseError(null);
      showToast('success', '✅ تم حفظ سجل الحضور والغياب مباشرة في Firestore بنجاح (يظهر الآن في تقارير المدير).');
    } catch (err: any) {
      showToast('error', err?.message || 'فشل حفظ كشف الحضور.');
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // --- Schedule Handlers ---
  const existingScheduleForSelection = useMemo(() => {
    return classSchedules.find(
      (s) => String(s.grade) === String(schedGrade) && (s.classNumber || '1').trim() === (schedClassNumber || '1').trim()
    );
  }, [classSchedules, schedGrade, schedClassNumber]);

  const handleScheduleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSchedParseError(null);
    setIsParsingSchedule(true);
    try {
      const { dataUrl, base64, mimeType } = await compressImageForGemini(file, 1400, 0.8);
      setSchedImagePreview(dataUrl);

      const response = await fetch('/api/gemini/parse-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('خدمة قراءة الصور غير متوفرة على هذه الاستضافة الثابتة، يمكنك إدخال الجدول يدوياً من التبويب المجاور.');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'تعذر قراءة جدول الحصص من الصورة.');
      }

      const extracted: ScheduleSlot[] = Array.isArray(payload?.entries) ? payload.entries : [];
      if (extracted.length === 0) {
        setSchedParseError('لم يتم العثور على حصص واضحة في الصورة. يمكنك تعديل الجدول أو الإدخال يدوياً أدناه.');
      } else {
        const nextGrid = buildEmptyGridSlots();
        extracted.forEach((slot) => {
          const key = `${slot.day}_${slot.period}`;
          if (nextGrid[key] !== undefined) {
            nextGrid[key] = {
              subject: slot.subject || '',
              teacherName: slot.teacherName || '',
            };
          }
        });
        setSchedGrid(nextGrid);
        showToast('success', `✨ تم تحويل صورة الجدول إلى (${extracted.length}) حصة منظمة. راجع المواد والمعلمين ثم أرسل للاعتماد.`);
      }
    } catch (err: any) {
      setSchedParseError(err?.message || 'حدث خطأ أثناء قراءة صورة جدول الحصص.');
    } finally {
      setIsParsingSchedule(false);
    }
  };

  const handleSubmitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingSchedule) return;

    const entries: ScheduleSlot[] = [];
    SCHEDULE_DAYS.forEach((day) => {
      SCHEDULE_PERIODS.forEach((p) => {
        const cell = schedGrid[`${day}_${p.period}`];
        if (cell && (cell.subject.trim() || cell.teacherName.trim())) {
          entries.push({
            day,
            period: p.period,
            periodLabel: p.label,
            subject: cell.subject.trim(),
            teacherName: cell.teacherName.trim(),
          });
        }
      });
    });

    if (entries.length === 0) {
      showToast('error', 'يرجى تعبئة حصة واحدة على الأقل (اسم المادة / المعلم) قبل إرسال الجدول.');
      return;
    }

    setIsSubmittingSchedule(true);
    try {
      await appDataService.submitClassScheduleForApproval({
        schoolId,
        grade: schedGrade,
        classNumber: schedClassNumber,
        entries,
        uploadedBy: session.name || 'المشرف',
        supervisorCode: session.code,
        sourceMethod: schedInputMode,
      });
      setIsScheduleComposerOpen(false);
      setSchedImagePreview(null);
      setSchedGrid(buildEmptyGridSlots());
      showToast('success', `✅ تم إرسال جدول ${getGradeLabelAr(schedGrade)} (فصل ${schedClassNumber}) للاعتماد من مدير المدرسة.`);
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر إرسال الجدول للاعتماد.');
    } finally {
      setIsSubmittingSchedule(false);
    }
  };

  const presentCount = attEntries.filter((e) => e.status === 'حاضر').length;
  const absentCount = attEntries.filter((e) => e.status === 'غائب').length;
  const lateCount = attEntries.filter((e) => e.status === 'متأخر').length;

  const filteredActivities = useMemo(() => {
    if (selectedActivityBranch === 'الكل') return activities;
    return activities.filter((a) => a.category === selectedActivityBranch);
  }, [activities, selectedActivityBranch]);

  return (
    <div dir="rtl" className="min-h-dvh bg-[#EDF0F5] text-right font-['Cairo','Tajawal']">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 pb-[max(7.5rem,calc(6.5rem+env(safe-area-inset-bottom)))] space-y-5">
        {/* Hero Card: Calm Pastel Sky-Blue matching Student/Teacher/Principal */}
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] shadow-[0_6px_20px_rgba(26,58,95,0.08)] p-5 sm:p-6 text-[#1A3A5F]">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white text-[#1F5AAA] border border-[#DCE7F3] flex items-center justify-center shadow-xs shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-[#1A3A5F] tracking-tight">
                  لوحة تحكم المشرف
                </h1>
                <p className="text-xs sm:text-sm font-bold text-[#28486B]">
                  مرحباً {session.name || 'المشرف'} • {displaySchoolName}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <span className="px-3.5 py-2 rounded-2xl bg-white/95 border border-[#9BBEDF] text-xs font-black text-[#1F5AAA] shadow-2xs flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>المشرف المدرسي — الترم الأول</span>
              </span>
              <div className="flex items-center gap-1.5 bg-white px-3.5 py-2 rounded-2xl border border-[#DCE7F3] text-xs font-black text-[#1A3A5F] shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-[#1F5AAA]" />
                <span>صلاحية الحساب: {session.daysRemaining} يوم</span>
              </div>
            </div>
          </div>
        </div>

        {/* Inline Toast Banner */}
        {toast && (
          <div
            className={`p-3.5 rounded-2xl border-2 text-xs sm:text-sm font-bold flex items-center justify-between gap-2 shadow-sm animate-in fade-in ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                : toast.type === 'error'
                ? 'bg-rose-50 border-rose-400 text-rose-950'
                : 'bg-[#EEF5FC] border-[#9BBEDF] text-[#1A3A5F]'
            }`}
          >
            <span>{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} className="font-black cursor-pointer px-1">
              ✕
            </button>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 1: الأنشطة (تتفرع داخلها: تقرير / فعالية / رياضي / ثقافي / رحلة) */}
        {/* =================================================================== */}
        {activeTab === 'activities' && (
          <div className="space-y-5">
            {/* Branching Pills inside الأنشطة */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#1F5AAA]" />
                    <span>الأنشطة والتقارير والفعاليات المدرسية</span>
                  </h2>
                  <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                    اختر الفرع المطلوب للتسجيل والاستعراض (تقرير · فعالية · نشاط رياضي · نشاط ثقافي · رحلة مدرسية)
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black">
                  {activities.length} سجل محفوظ
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {SUPERVISOR_ACTIVITY_CATEGORIES.map((branch) => {
                  const Icon = getActivityBranchIcon(branch);
                  const isActive = selectedActivityBranch === branch;
                  const count = activities.filter((a) => a.category === branch).length;
                  return (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => handleSelectBranch(branch)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer border ${
                        isActive
                          ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-xs'
                          : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{branch}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
                          isActive ? 'bg-white/20 text-white' : 'bg-white text-[#1F5AAA] border border-[#DCE7F3]'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => handleSelectBranch('الكل')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${
                    selectedActivityBranch === 'الكل'
                      ? 'bg-[#1A3A5F] text-white border-[#1A3A5F] shadow-xs'
                      : 'bg-white text-[#5C7085] border-[#DCE7F3] hover:bg-[#F4F8FC]'
                  }`}
                >
                  عرض الكل ({activities.length})
                </button>
              </div>
            </div>

            {/* Create Activity / Report Form */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DCE7F3] shadow-sm space-y-4">
              <h3 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#1F5AAA]" />
                <span>إضافة ({actCategory}) جديد</span>
              </h3>

              <form onSubmit={handleCreateActivity} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">تصنيف النشاط:</label>
                    <select
                      value={actCategory}
                      onChange={(e) => {
                        const val = e.target.value as SupervisorActivityCategory;
                        setActCategory(val);
                        setSelectedActivityBranch(val);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    >
                      {SUPERVISOR_ACTIVITY_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">الصف المستهدف:</label>
                    <select
                      value={actTargetGrade}
                      onChange={(e) => setActTargetGrade(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    >
                      <option value="الكل">جميع الصفوف</option>
                      {GRADE_OPTIONS_12.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">التاريخ:</label>
                    <input
                      type="date"
                      value={actDate}
                      onChange={(e) => setActDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">عنوان {actCategory}:</label>
                  <input
                    type="text"
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    placeholder={`مثال: ${actCategory === 'تقرير' ? 'تقرير الانضباط اليومي' : actCategory === 'رحلة مدرسية' ? 'رحلة علمية لمتحف صنعاء' : 'بطولة كرة القدم المدرسية'}`}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs sm:text-sm font-semibold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">التفاصيل والملاحظات:</label>
                  <textarea
                    rows={3}
                    value={actDetails}
                    onChange={(e) => setActDetails(e.target.value)}
                    placeholder="اكتب وصفاً موجزاً للنشاط أو التقرير ونتائجه..."
                    className="w-full p-3 rounded-xl border border-[#DCE7F3] bg-white text-xs sm:text-sm text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingActivity}
                    className="px-6 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm border border-[#194B91] flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSavingActivity ? 'جاري الحفظ...' : `حفظ ${actCategory}`}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Activities List */}
            <div className="space-y-3">
              <h3 className="text-sm font-black text-[#1A3A5F]">
                السجلات المحفوظة ({selectedActivityBranch}) — {filteredActivities.length}
              </h3>

              {filteredActivities.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-xs sm:text-sm font-bold text-[#5C7085]">
                  لا توجد سجلات في فرع ({selectedActivityBranch}) بعد.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredActivities.map((act) => {
                    const BranchIcon = getActivityBranchIcon(act.category);
                    return (
                      <div
                        key={act.id}
                        className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-2xs flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                              <BranchIcon className="w-3 h-3" />
                              <span>{act.category}</span>
                            </span>
                            <span className="text-[11px] font-bold text-[#5C7085] tabular-nums">
                              {act.activityDate} • {act.targetGrade === 'الكل' || !act.targetGrade ? 'جميع الصفوف' : getGradeLabelAr(act.targetGrade)}
                            </span>
                          </div>
                          <h4 className="font-black text-sm text-[#1A3A5F]">{act.title}</h4>
                          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{act.details}</p>
                        </div>

                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-[#5C7085] font-semibold">
                          <span>بواسطة: {act.createdBy}</span>
                          <button
                            type="button"
                            onClick={() => appDataService.deleteSupervisorActivity(act.id)}
                            className="text-rose-700 hover:text-rose-900 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: الحضور والغياب (تصوير الكشف -> قراءة Gemini -> تعديل -> حفظ مباشر) */}
        {/* =================================================================== */}
        {activeTab === 'attendance' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DCE7F3] shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-[#1F5AAA]" />
                    <span>تسجيل الحضور والغياب بتصوير الكشف</span>
                  </h2>
                  <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                    صوّر كشف الحضور الورقي ليقرأه التطبيق تلقائياً، راجع الأسماء والحالة ثم احفظ مباشرة (سجل واحد فقط لكل فصل يومياً)
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
                  حفظ مباشر بدون اعتماد المدير
                </span>
              </div>

              {/* Grade, Class Number, Date Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">الصف الدراسي:</label>
                  <select
                    value={attGrade}
                    onChange={(e) => setAttGrade(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                  >
                    {GRADE_OPTIONS_12.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">رقم الفصل / الشعبة:</label>
                  <input
                    type="text"
                    value={attClassNumber}
                    onChange={(e) => setAttClassNumber(e.target.value)}
                    placeholder="مثال: 1 أو أ"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">التاريخ:</label>
                  <input
                    type="date"
                    value={attDate}
                    onChange={(e) => setAttDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    required
                  />
                </div>
              </div>

              {/* Duplicate Day Lock Warning */}
              {attendanceAlreadyExistsToday && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    تم تسجيل حضور وغياب {getGradeLabelAr(attGrade)} (فصل {attClassNumber || '1'}) بتاريخ {attDate} مسبقاً. لا يمكن التسجيل مرتين لنفس الفصل في نفس اليوم.
                  </span>
                </div>
              )}

              {/* Camera / Gallery Upload Area */}
              <input
                ref={attCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleAttendanceImagePick}
                className="hidden"
              />
              <input
                ref={attGalleryRef}
                type="file"
                accept="image/*"
                onChange={handleAttendanceImagePick}
                className="hidden"
              />

              <div className="p-5 rounded-2xl border-2 border-dashed border-[#9BBEDF] bg-[#F4F8FC] text-center space-y-3">
                {attImagePreview ? (
                  <div className="space-y-3">
                    <img
                      src={attImagePreview}
                      alt="كشف الحضور الورقي"
                      className="max-h-60 mx-auto rounded-xl border border-[#DCE7F3] object-contain bg-white"
                    />
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => attCameraRef.current?.click()}
                        disabled={isParsingAttendance}
                        className="px-4 py-2 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>إعادة التصوير</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => attGalleryRef.current?.click()}
                        disabled={isParsingAttendance}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>اختيار صورة أخرى</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <Camera className="w-10 h-10 text-[#1F5AAA] mx-auto" />
                    <p className="text-xs sm:text-sm font-black text-[#1A3A5F]">
                      صوّر كشف الحضور والغياب الورقي لقراءته بالذكاء الاصطناعي
                    </p>
                    <p className="text-[11px] text-[#5C7085] font-semibold">
                      سيتم استخراج أسماء الطلاب وحالتهم (حاضر / غائب / متأخر) تلقائياً لتتمكن من مراجعتها وتعديلها قبل الحفظ
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => attCameraRef.current?.click()}
                        disabled={isParsingAttendance || attendanceAlreadyExistsToday}
                        className="px-4 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        <span>تصوير بالكاميرا</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => attGalleryRef.current?.click()}
                        disabled={isParsingAttendance || attendanceAlreadyExistsToday}
                        className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>رفع صورة الكشف</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAttEntries((prev) => [...prev, { studentName: '', status: 'حاضر' }])
                        }
                        disabled={attendanceAlreadyExistsToday}
                        className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1A3A5F] border border-[#DCE7F3] text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة اسم يدوياً</span>
                      </button>
                    </div>
                  </div>
                )}

                {isParsingAttendance && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#C6DCF2] text-[#1F5AAA] text-xs font-black shadow-xs">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري تحليل وقراءة كشف الحضور عبر Gemini...</span>
                  </div>
                )}

                {attParseError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{attParseError}</span>
                  </div>
                )}
              </div>

              {/* Editable Review List */}
              {attEntries.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-[#1A3A5F]">
                      مراجعة القائمة المقترحة ({attEntries.length} طالب)
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        حاضر: {presentCount}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                        غائب: {absentCount}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
                        متأخر: {lateCount}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
                    {attEntries.map((entry, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-[#DCE7F3] bg-[#FAFBFD] flex flex-col sm:flex-row sm:items-center gap-2.5 justify-between"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-black text-[#5C7085] w-6 text-center shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={entry.studentName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAttEntries((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, studentName: val } : it))
                              );
                            }}
                            placeholder="اسم الطالب الثلاثي"
                            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[#DCE7F3] bg-white text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          {(['حاضر', 'غائب', 'متأخر'] as AttendanceStatus[]).map((st) => {
                            const active = entry.status === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() =>
                                  setAttEntries((prev) =>
                                    prev.map((it, i) => (i === idx ? { ...it, status: st } : it))
                                  )
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer border ${
                                  active
                                    ? st === 'حاضر'
                                      ? 'bg-emerald-600 text-white border-emerald-700'
                                      : st === 'غائب'
                                      ? 'bg-rose-600 text-white border-rose-700'
                                      : 'bg-amber-500 text-white border-amber-600'
                                    : 'bg-white text-[#5C7085] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                                }`}
                              >
                                {st}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setAttEntries((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="حذف السطر"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        setAttEntries((prev) => [...prev, { studentName: '', status: 'حاضر' }])
                      }
                      className="px-4 py-2 rounded-xl bg-[#F4F8FC] hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة طالب آخر</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAttendance}
                      disabled={isSavingAttendance || attendanceAlreadyExistsToday}
                      className="px-6 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm border border-[#194B91] flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isSavingAttendance
                          ? 'جاري الحفظ...'
                          : `حفظ الحضور والغياب (${getGradeLabelAr(attGrade)} - فصل ${attClassNumber})`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Saved Attendance Logs */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DCE7F3] shadow-sm space-y-3">
              <h3 className="text-sm sm:text-base font-black text-[#1A3A5F]">
                سجلات الحضور والغياب المحفوظة ({attendanceRecords.length})
              </h3>
              {attendanceRecords.length === 0 ? (
                <p className="text-xs text-[#5C7085] font-bold text-center py-6">
                  لم يتم تسجيل أي كشوفات حضور وغياب بعد.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {attendanceRecords.map((rec) => {
                    const isOpen = expandedAttId === rec.id;
                    return (
                      <div key={rec.id} className="rounded-xl border border-[#DCE7F3] bg-[#FAFBFD] p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-black text-xs sm:text-sm text-[#1A3A5F]">
                              {rec.gradeLabel} — فصل {rec.classNumber} • {rec.date}
                            </div>
                            <div className="text-[11px] font-semibold text-[#5C7085] mt-0.5">
                              سجل بواسطة: {rec.recordedBy} ({rec.createdAtFormatted})
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
                              حاضر: {rec.presentCount}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-black">
                              غائب: {rec.absentCount}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-black">
                              متأخر: {rec.lateCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedAttId(isOpen ? null : rec.id)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#DCE7F3] text-[#1F5AAA] text-[11px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isOpen ? 'إخفاء الأسماء' : 'عرض القائمة'}</span>
                              {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-[#DCE7F3]">
                            {rec.entries.map((e, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs"
                              >
                                <span className="font-bold text-[#1A3A5F] truncate">{e.studentName}</span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                    e.status === 'حاضر'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : e.status === 'غائب'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {e.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: جدول الحصص الأسبوعي (+ رفع جدول حصص -> ثابت للترم الأول)      */}
        {/* =================================================================== */}
        {activeTab === 'schedule' && (
          <div className="space-y-5">
            {/* Header Card with + رفع جدول حصص */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DCE7F3] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-[#1F5AAA]" />
                  <span>جدول الحصص الأسبوعي — الترم الأول (ثابت ومثبت)</span>
                </h2>
                <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                  المشرف هو المسؤول الوحيد عن رفع جدول كل صف وفصل، ويُعتمد مرة واحدة من مدير المدرسة ليثبت طوال الترم الأول
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsScheduleComposerOpen((prev) => !prev)}
                className="px-5 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm border border-[#194B91] flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{isScheduleComposerOpen ? 'إغلاق نموذج الرفع' : '+ رفع جدول حصص'}</span>
              </button>
            </div>

            {/* Schedule Upload / Manual Composer */}
            {isScheduleComposerOpen && (
              <form
                onSubmit={handleSubmitSchedule}
                className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-[#9BBEDF] shadow-sm space-y-5 animate-in fade-in"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h3 className="text-sm sm:text-base font-black text-[#1A3A5F]">
                    رفع وإعداد جدول حصص جديد
                  </h3>
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black">
                    <Lock className="w-3.5 h-3.5" />
                    <span>الترم: الأول (ثابت للترم كامل)</span>
                  </span>
                </div>

                {/* Grade & Class & Term */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">اختر الصف الدراسي:</label>
                    <select
                      value={schedGrade}
                      onChange={(e) => setSchedGrade(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    >
                      {GRADE_OPTIONS_12.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">رقم الفصل / الشعبة:</label>
                    <input
                      type="text"
                      value={schedClassNumber}
                      onChange={(e) => setSchedClassNumber(e.target.value)}
                      placeholder="مثال: 1 أو أ"
                      className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">الترم الدراسي:</label>
                    <div className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs font-black text-[#1F5AAA] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>الترم الأول (مثبت)</span>
                    </div>
                  </div>
                </div>

                {existingScheduleForSelection?.isApproved && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      يوجد جدول معتمد حالياً لـ {getGradeLabelAr(schedGrade)} (فصل {schedClassNumber}). رفع جدول جديد سيرسله للمدير لإعادة الاعتماد، وسيبقى الجدول الحالي ثابتاً حتى يعتمد المدير التحديث.
                    </span>
                  </div>
                )}

                {/* Input Method Switcher: Photo OCR (Gemini) vs Manual Entry */}
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#E6EEF7] rounded-2xl border border-[#C6DCF2]">
                  <button
                    type="button"
                    onClick={() => setSchedInputMode('image')}
                    className={`py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      schedInputMode === 'image'
                        ? 'bg-white text-[#1F5AAA] shadow-xs'
                        : 'text-[#475569] hover:text-[#1A3A5F]'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>تصوير / رفع صورة الجدول (Gemini)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchedInputMode('manual')}
                    className={`py-2 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      schedInputMode === 'manual'
                        ? 'bg-white text-[#1F5AAA] shadow-xs'
                        : 'text-[#475569] hover:text-[#1A3A5F]'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>إدخال يدوي مرة واحدة</span>
                  </button>
                </div>

                {/* Photo Upload Section when image mode is selected */}
                {schedInputMode === 'image' && (
                  <div className="p-5 rounded-2xl border-2 border-dashed border-[#9BBEDF] bg-[#F4F8FC] text-center space-y-3">
                    <input
                      ref={schedCameraRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleScheduleImagePick}
                      className="hidden"
                    />
                    <input
                      ref={schedGalleryRef}
                      type="file"
                      accept="image/*"
                      onChange={handleScheduleImagePick}
                      className="hidden"
                    />

                    {schedImagePreview && (
                      <img
                        src={schedImagePreview}
                        alt="صورة جدول الحصص"
                        className="max-h-56 mx-auto rounded-xl border border-[#DCE7F3] object-contain bg-white"
                      />
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => schedCameraRef.current?.click()}
                        disabled={isParsingSchedule}
                        className="px-4 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        <span>تصوير الجدول الورقي</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => schedGalleryRef.current?.click()}
                        disabled={isParsingSchedule}
                        className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        <span>رفع صورة جاهزة للجدول</span>
                      </button>
                    </div>

                    {isParsingSchedule && (
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#C6DCF2] text-[#1F5AAA] text-xs font-black shadow-xs">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري تحويل صورة الجدول عبر Gemini إلى جدول منظم...</span>
                      </div>
                    )}

                    {schedParseError && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold">
                        ⚠️ {schedParseError}
                      </div>
                    )}
                  </div>
                )}

                {/* Structured Editable Grid (Review AI output OR Enter manually: السبت-الأربعاء × الحصة 1-6) */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-black text-[#1A3A5F]">
                      مراجعة وتعديل جدول الحصص (السبت - الأربعاء · الحصص الأولى إلى السادسة)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setSchedGrid(buildEmptyGridSlots())}
                      className="text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                    >
                      تفريغ الجدول
                    </button>
                  </div>

                  <datalist id="yemen-subjects-list">
                    {ALL_SUBJECTS.map((s) => (
                      <option key={s.code} value={s.nameAr} />
                    ))}
                    <option value="الحاسوب" />
                    <option value="الفيزياء" />
                    <option value="الكيمياء" />
                    <option value="الأحياء" />
                    <option value="التاريخ" />
                    <option value="الجغرافيا" />
                    <option value="التربية البدنية" />
                  </datalist>

                  <datalist id="school-teachers-list">
                    {schoolTeachers.map((tName, idx) => (
                      <option key={idx} value={tName} />
                    ))}
                  </datalist>

                  <div className="overflow-x-auto rounded-2xl border border-[#DCE7F3]">
                    <table className="w-full min-w-[760px] text-right border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#1F5AAA] text-white font-black">
                          <th className="sticky right-0 z-10 bg-[#1F5AAA] p-2.5 border-l border-[#3771BD] w-24">
                            اليوم
                          </th>
                          {SCHEDULE_PERIODS.map((p) => (
                            <th key={p.period} className="p-2.5 text-center border-l border-[#3771BD]/50 last:border-l-0">
                              الحصة {p.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#DCE7F3]">
                        {SCHEDULE_DAYS.map((day) => (
                          <tr key={day} className="bg-white">
                            <td className="sticky right-0 z-10 bg-[#F4F8FC] p-2.5 font-black text-[#1A3A5F] border-l border-[#DCE7F3] whitespace-nowrap">
                              {day}
                            </td>
                            {SCHEDULE_PERIODS.map((p) => {
                              const key = `${day}_${p.period}`;
                              const cell = schedGrid[key] || { subject: '', teacherName: '' };
                              return (
                                <td key={key} className="p-1.5 border-l border-[#E6EEF7] last:border-l-0 align-top">
                                  <div className="space-y-1 min-w-[110px]">
                                    <input
                                      type="text"
                                      list="yemen-subjects-list"
                                      value={cell.subject}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setSchedGrid((prev) => ({
                                          ...prev,
                                          [key]: { ...prev[key], subject: val },
                                        }));
                                      }}
                                      placeholder="اسم المادة"
                                      className="w-full px-2 py-1 rounded-lg border border-[#DCE7F3] bg-[#FAFBFD] text-[11px] font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                                    />
                                    <input
                                      type="text"
                                      list="school-teachers-list"
                                      value={cell.teacherName}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setSchedGrid((prev) => ({
                                          ...prev,
                                          [key]: { ...prev[key], teacherName: val },
                                        }));
                                      }}
                                      placeholder="اسم المعلم"
                                      className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-[#5C7085] focus:outline-[#1F5AAA]"
                                    />
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsScheduleComposerOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-[#F4F8FC] hover:bg-[#E8F1FB] text-[#1A3A5F] border border-[#DCE7F3] text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingSchedule}
                    className="px-6 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm border border-[#194B91] flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSubmittingSchedule ? 'جاري الإرسال...' : 'إرسال للاعتماد لمدير المدرسة'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Uploaded Schedules List */}
            <div className="space-y-3">
              <h3 className="text-sm sm:text-base font-black text-[#1A3A5F]">
                جداول الحصص المرفوعة للمدرسة ({classSchedules.length})
              </h3>

              {classSchedules.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2">
                  <Calendar className="w-10 h-10 text-[#9BBEDF] mx-auto" />
                  <h4 className="font-black text-sm text-[#1A3A5F]">لا توجد جداول حصص مرفوعة بعد</h4>
                  <p className="text-xs text-[#5C7085] font-semibold">
                    اضغط على زر (+ رفع جدول حصص) بالأعلى لإضافة جدول أي صف وإرساله للاعتماد من مدير المدرسة.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {classSchedules.map((sch) => {
                    const isOpen = expandedSchedId === sch.id;
                    return (
                      <div key={sch.id} className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-2xs space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-black text-sm sm:text-base text-[#1A3A5F]">
                                {sch.gradeLabel} — فصل {sch.classNumber} (الترم {sch.term})
                              </h4>
                              {sch.isApproved ? (
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
                                  ✓ معتمد ومثبت للترم الأول
                                </span>
                              ) : sch.approvalStatus === 'rejected' ? (
                                <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-black">
                                  مُعاد للمراجعة
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-black">
                                  ⏳ بانتظار اعتماد المدير
                                </span>
                              )}
                              {sch.hasPendingUpdate && (
                                <span className="px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                                  تحديث مرفوع بانتظار الاعتماد
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-semibold text-[#5C7085] mt-1">
                              رفع بواسطة: {sch.uploadedBy} ({sch.uploadedAtFormatted})
                              {sch.approvedBy ? ` • اعتمد بواسطة: ${sch.approvedBy}` : ''}
                            </p>
                            {sch.rejectionNote && (
                              <p className="text-[11px] font-bold text-rose-700 mt-1">
                                ملاحظة المدير: {sch.rejectionNote}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedSchedId(isOpen ? null : sch.id)}
                            className="px-3.5 py-2 rounded-xl bg-[#F4F8FC] hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#DCE7F3] text-xs font-black flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isOpen ? 'إخفاء الجدول' : 'معاينة الجدول'}</span>
                          </button>
                        </div>

                        {isOpen && (
                          <div className="pt-2 border-t border-slate-100 space-y-3">
                            <ScheduleGridView
                              entries={sch.hasPendingUpdate && sch.pendingEntries ? sch.pendingEntries : sch.entries}
                              title={
                                sch.hasPendingUpdate
                                  ? 'معاينة النسخة الجديدة المرسلة للاعتماد'
                                  : `جدول ${sch.gradeLabel} (فصل ${sch.classNumber})`
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unified Right RTL Sidebar Drawer */}
      <UnifiedSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        session={session}
        activeView={
          activeTab === 'activities'
            ? 'supervisor_activities'
            : activeTab === 'attendance'
            ? 'supervisor_attendance'
            : 'supervisor_schedule'
        }
        onSelectView={handleSelectSidebarView}
      />

      {/* FLOATING BOTTOM NAVIGATION BAR (Pure White & Calm Azure Active State matching Student/Teacher docks) */}
      <nav
        aria-label="التنقل السفلي للمشرف"
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-40"
      >
        <div className="rounded-[24px] sm:rounded-[28px] bg-white/95 backdrop-blur-md border border-[#DCE7F3] shadow-[0_-4px_20px_rgba(26,58,95,0.08)] p-1 sm:p-1.5 grid grid-cols-3 gap-1 items-center text-center">
          {/* 1. الأنشطة (تتفرع داخلها) */}
          <button
            type="button"
            onClick={() => setActiveTab('activities')}
            className={`min-h-[48px] py-1.5 px-1 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer ${
              activeTab === 'activities'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-tight text-center">الأنشطة</span>
          </button>

          {/* 2. الحضور والغياب */}
          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`min-h-[48px] py-1.5 px-1 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-tight text-center">الحضور والغياب</span>
          </button>

          {/* 3. جدول الحصص */}
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`min-h-[48px] py-1.5 px-1 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 transition-all cursor-pointer ${
              activeTab === 'schedule'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <CalendarCheck className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-tight text-center">جدول الحصص</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
