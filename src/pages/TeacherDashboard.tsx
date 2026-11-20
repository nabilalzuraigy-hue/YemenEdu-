import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  PlusCircle,
  Award,
  Camera,
  CheckCircle,
  Clock,
  Download,
  Send,
  Lock,
  Trash2,
  Bell,
  Sparkles,
  ZoomIn,
  CheckCircle2,
  BookOpen,
  Archive,
  Calendar,
  ChevronDown,
  History,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  MoveHorizontal,
  Upload,
  X,
  Plus,
  Loader2,
  Edit3,
  Image as ImageIcon,
  RotateCcw,
  FileSpreadsheet,
  Minus,
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { UserSession, authService, cleanFirestorePayload, normalizeArabicForMatch } from '../services/authService';
import {
  convertFilesToLessonPages,
  MAX_LESSON_PAGES,
  PreparedLessonPage,
} from '../utils/lessonFileConverter';
import {
  shuffleAndBalanceQuestions,
  type LessonQuestionKind,
} from '../utils/questionShuffle';
import {
  parseAndShuffleExcelQuestions,
  type ImportedExcelQuestion,
} from '../utils/excelQuestionParser';
import {
  appDataService,
  Question,
  Announcement,
  GradeRecord,
  isObjectiveQuestion,
  formatArabicDateTime,
  getQuestionTimestamp,
  ACADEMIC_MONTHS,
  getCurrentAcademicMonth,
  MonthlyGradebookRecord,
  MonthlyGradebookStudent,
  ClassSchedule,
} from '../services/appData';
import { playGentleNotificationSound } from '../services/soundUtils';
import { GradeSheetPdfModal } from '../components/GradeSheetPdfModal';
import { UnifiedSidebar } from '../components/UnifiedSidebar';
import { ScheduleGridView, doesSlotMatchTeacher } from '../components/ScheduleGridView';
import { TeacherRecommendationModal } from '../components/TeacherRecommendationModal';
import { formatArabicSchoolName, getSchoolPrincipalName, isGenericPrincipalSender, isSimulationAnnouncement } from '../utils/schoolDisplay';

interface TeacherDashboardProps {
  session: UserSession;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ session }) => {
  const currentUser = session;
  const [activeTab, setActiveTab] = useState<'create_question' | 'gradebook' | 'announcements' | 'schedule'>('create_question');
  const [approvedSchoolSchedules, setApprovedSchoolSchedules] = useState<ClassSchedule[]>(() =>
    session.schoolId ? appDataService.getClassSchedules(session.schoolId).filter((s) => s.isApproved) : []
  );
  
  const teacherGrade = (session.grade as '7' | '8' | '9') || '8';
  const teacherClass = session.class || session.grade || '8';
  const teacherSchoolId = session.schoolId || '';
  const teacherSubject = session.subject || 'العلوم';

  // Real-time Firestore synchronized Data (Strictly isolated to teacherSchoolId)
  const [questions, setQuestions] = useState<Question[]>(() =>
    appDataService.getQuestions(teacherGrade, teacherSubject, teacherSchoolId)
  );
  const [registeredGrades, setRegisteredGrades] = useState<GradeRecord[]>(() =>
    appDataService.getGrades(undefined, teacherSubject, teacherSchoolId, teacherGrade)
  );
  
  const [gradeSheetData, setGradeSheetData] = useState(() =>
    appDataService.getStudentGradeSheet(
      teacherGrade,
      teacherSchoolId,
      teacherSubject,
      authService
        .getRegisteredCodes()
        .filter(
          (c) =>
            c.role === 'student' &&
            (c.schoolId || '').trim().toLowerCase() === teacherSchoolId.trim().toLowerCase()
        )
    )
  );

  // Circulars with unread tracking & sound (Read-Only for Teacher, strictly real principal circulars)
  const [teacherCirculars, setTeacherCirculars] = useState<Array<Announcement & { isRead?: boolean }>>(() => {
    if (!session.schoolId) return [];
    return appDataService.getAnnouncements('teacher', session.schoolId).map((a) => ({ ...a, isRead: false }));
  });
  const playedCircularIdsRef = useRef<Set<string>>(new Set());

  // Monthly Gradebook State & Rollover
  const [activeMonth, setActiveMonth] = useState<string>(() => getCurrentAcademicMonth());
  const [rolloverTimestamp, setRolloverTimestamp] = useState<number>(0);
  const [selectedMonthView, setSelectedMonthView] = useState<string>('active'); // 'active' or archived record ID
  const [archivedGradebooks, setArchivedGradebooks] = useState<MonthlyGradebookRecord[]>([]);
  const [isArchiving, setIsArchiving] = useState<boolean>(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<boolean>(false);
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isRecommendationsModalOpen, setIsRecommendationsModalOpen] = useState<boolean>(false);
  const [activeSidebarView, setActiveSidebarView] = useState<string>('dashboard');
  const gradebookTableScrollRef = useRef<HTMLDivElement>(null);

  const scrollGradebookTable = (direction: 'left' | 'right') => {
    if (!gradebookTableScrollRef.current) return;
    const offset = direction === 'left' ? -150 : 150;
    gradebookTableScrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const rolloverTimestampRef = useRef<number>(0);
  rolloverTimestampRef.current = rolloverTimestamp;

  // Listen for toggle-sidebar events from Header
  useEffect(() => {
    const handleToggle = () => setIsSidebarOpen((prev) => !prev);
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, []);

  const handleSelectSidebarView = (view: 'dashboard' | 'schedule' | 'archive_questions' | 'archive_grades' | 'archive_circulars') => {
    setActiveSidebarView(view);
    if (view === 'dashboard') {
      setActiveTab('create_question');
      setSelectedMonthView('active');
    } else if (view === 'schedule') {
      setActiveTab('schedule');
    } else if (view === 'archive_questions') {
      setActiveTab('create_question');
      if (archivedGradebooks.length > 0) {
        setSelectedMonthView(archivedGradebooks[0].id);
      }
    } else if (view === 'archive_grades') {
      setActiveTab('gradebook');
      if (archivedGradebooks.length > 0) {
        setSelectedMonthView(archivedGradebooks[0].id);
      }
    } else if (view === 'archive_circulars') {
      setActiveTab('announcements');
    }
  };

  useEffect(() => {
    if (!currentUser?.schoolId) return;

    const refreshData = () => {
      const normalizedSchool = teacherSchoolId.trim().toLowerCase();
      const allStudentCodes = authService
        .getRegisteredCodes()
        .filter(
          (c) =>
            c.role === 'student' &&
            (c.schoolId || '').trim().toLowerCase() === normalizedSchool
        );
      setQuestions(appDataService.getQuestions(teacherGrade, teacherSubject, teacherSchoolId));
      setRegisteredGrades(appDataService.getGrades(undefined, teacherSubject, teacherSchoolId, teacherGrade));
      setGradeSheetData(
        appDataService.getStudentGradeSheet(teacherGrade, teacherSchoolId, teacherSubject, allStudentCodes, rolloverTimestamp)
      );
      setApprovedSchoolSchedules(
        appDataService.getClassSchedules(teacherSchoolId).filter((s) => s.isApproved)
      );
    };

    const unsubData = appDataService.subscribe(refreshData);
    const unsubAuth = authService.subscribe(refreshData);

    // 1. Direct Firestore Circulars query: where('schoolId','==',currentUser.schoolId), where('target','in',['teachers','all'])
    let unsubCirc = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const qCirc = query(
        collection(db, 'circulars'),
        where('schoolId', '==', currentUser.schoolId),
        where('target', 'in', ['teachers', 'all'])
      );
      unsubCirc = onSnapshot(
        qCirc,
        (snap) => {
          const list = snap.empty
            ? []
            : snap.docs
                .map((d) => {
                  const data = d.data();
                  const resolvedSender =
                    data.senderName && !isGenericPrincipalSender(data.senderName)
                      ? data.senderName
                      : getSchoolPrincipalName(data.schoolId || session.schoolId, session.schoolName);
                  return {
                    id: d.id,
                    title: data.title || '',
                    content: data.content || '',
                    target: data.target || 'teachers',
                    priority: data.priority || 'عادي',
                    senderName: resolvedSender,
                    senderRoleAr: data.senderRoleAr || 'مدير المدرسة',
                    schoolId: data.schoolId || session.schoolId,
                    createdAt: data.createdAtFormatted || 'الآن',
                    readCount: 1,
                    isRead: false,
                  };
                })
                .filter((c) => !isSimulationAnnouncement(c));

          if (list.length > 0) {
            // Trigger gentle audio chime alert if a new circular arrived (no duplicate alerts)
            let hasNewCircular = false;
            list.forEach((c) => {
              if (!playedCircularIdsRef.current.has(c.id)) {
                playedCircularIdsRef.current.add(c.id);
                hasNewCircular = true;
              }
            });
            if (hasNewCircular && playedCircularIdsRef.current.size > list.length) {
              playGentleNotificationSound();
            }

            setTeacherCirculars((prev) => {
              return list.map((l) => {
                const match = prev.find((p) => p.id === l.id);
                return { ...l, isRead: match ? match.isRead : false };
              });
            });
          } else {
            setTeacherCirculars([]);
          }
        },
        () => {}
      );
    } catch (_) {}

    // 2. Direct Firestore Monthly Gradebooks & Rollover Meta query
    let unsubGradebooks = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const qGb = query(
        collection(db, 'monthlyGradebooks'),
        where('schoolId', '==', currentUser.schoolId)
      );
      unsubGradebooks = onSnapshot(
        qGb,
        (snap) => {
          if (!snap.empty) {
            const allDocs: any[] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
            const metaDoc = allDocs.find(
              (d: any) =>
                d.id === `meta_${currentUser.schoolId}_${teacherGrade}_${encodeURIComponent(teacherSubject)}` ||
                d.id === `meta_${currentUser.schoolId}_${teacherGrade}`
            );
            if (metaDoc) {
              if (metaDoc.activeMonth) setActiveMonth(metaDoc.activeMonth);
              if (typeof metaDoc.rolloverTimestamp === 'number') {
                setRolloverTimestamp(metaDoc.rolloverTimestamp);
                rolloverTimestampRef.current = metaDoc.rolloverTimestamp;
              }
            }

            const archives = allDocs
              .filter(
                (d: any) =>
                  !d.id.startsWith('meta_') &&
                  (!d.grade || d.grade === teacherGrade) &&
                  (!d.subject || d.subject === teacherSubject)
              )
              .map((d: any) => d as MonthlyGradebookRecord)
              .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            setArchivedGradebooks(archives);
          }
        },
        (err) => console.warn('monthlyGradebooks listener notice:', err)
      );
    } catch (_) {}

    // 3. Direct Firestore Grades query: where('schoolId','==',currentUser.schoolId), where('class','==',currentUser.class)
    let unsubGrades = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const qGrades = query(
        collection(db, 'grades'),
        where('schoolId', '==', currentUser.schoolId)
      );
      unsubGrades = onSnapshot(
        qGrades,
        (snap) => {
          const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as GradeRecord));
          const cutoff = rolloverTimestampRef.current || 0;
          const normalizedSchool = (currentUser.schoolId || '').trim().toLowerCase();
          const filteredForClass = list.filter((g) => {
            if ((g.schoolId || '').trim().toLowerCase() !== normalizedSchool) return false;
            const matchesClass = !g.class && !g.grade ? true : (g.class === teacherClass || g.grade === teacherGrade);
            if (!matchesClass) return false;
            const matchesSubject =
              !g.subject ||
              g.subject === teacherSubject ||
              g.subjectName === teacherSubject ||
              g.subject.includes(teacherSubject) ||
              teacherSubject.includes(g.subject);
            if (!matchesSubject) return false;
            if (cutoff > 0) {
              const ts = (g as any).timestamp || getQuestionTimestamp(g) || 0;
              return ts >= cutoff;
            }
            return true;
          });
          setRegisteredGrades(filteredForClass);

          // Requirement 4: Query grades, groupBy studentCode, real totalObtained & totalMax, strictly this school
          const allStudentCodes = authService.getRegisteredCodes().filter(
            (c) =>
              c.role === 'student' &&
              (c.schoolId || '').trim().toLowerCase() === normalizedSchool &&
              (!c.grade || c.grade === teacherGrade || (c as any).class === teacherClass)
          );

          const studentGradesGrouped: Record<string, { totalObtained: number; totalMax: number; count: number; name: string; schoolId?: string; phone?: string }> = {};

          allStudentCodes.forEach((st) => {
            studentGradesGrouped[st.code] = {
              totalObtained: 0,
              totalMax: 0,
              count: 0,
              name: st.assignedToName || 'طالب مدرسي',
              schoolId: st.schoolId || session.schoolId,
              phone: st.phone || '—',
            };
          });

          filteredForClass.forEach((g) => {
            const sc = g.studentCode;
            if (!sc) return;
            if (!studentGradesGrouped[sc]) {
              studentGradesGrouped[sc] = {
                totalObtained: 0,
                totalMax: 0,
                count: 0,
                name: g.studentName || sc,
                schoolId: g.schoolId || session.schoolId,
                phone: '—',
              };
            }
            const obtained = Number(g.obtained !== undefined ? g.obtained : (g.score || 0));
            const total = Number(g.total !== undefined ? g.total : (g.maxScore || 5));
            studentGradesGrouped[sc].totalObtained += obtained;
            studentGradesGrouped[sc].totalMax += total;
            studentGradesGrouped[sc].count += 1;
            if (g.studentName) studentGradesGrouped[sc].name = g.studentName;
          });

          const calculatedRoster = Object.entries(studentGradesGrouped).map(([code, data]) => {
            const totalObtained = data.totalObtained;
            const totalMax = data.totalMax;
            const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 100) : 0;

            let rating = 'ممتاز (أ)';
            let ratingBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            if (data.count === 0) {
              rating = 'لم يُرصد';
              ratingBadgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
            } else if (percentage < 50) {
              rating = 'ضعيف (هـ)';
              ratingBadgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
            } else if (percentage < 65) {
              rating = 'مقبول (د)';
              ratingBadgeColor = 'bg-orange-100 text-orange-800 border-orange-300';
            } else if (percentage < 80) {
              rating = 'جيد (ج)';
              ratingBadgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
            } else if (percentage < 90) {
              rating = 'جيد جداً (ب)';
              ratingBadgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
            }

            return {
              code,
              name: data.name,
              phone: data.phone || '—',
              schoolId: data.schoolId || session.schoolId,
              grade: teacherGrade,
              submissionsCount: data.count,
              gradedCount: data.count,
              totalEarned: totalObtained,
              totalPossible: totalMax > 0 ? totalMax : 5,
              percentage,
              rating,
              ratingBadgeColor,
              latestGradeRecord: undefined as any,
            };
          });

          setGradeSheetData(calculatedRoster);
        },
        () => {}
      );
    } catch (_) {}

    // 4. Direct Firestore Submissions query for accurate submissions count
    let unsubSubs = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const qSubs = query(
        collection(db, 'submissions'),
        where('schoolId', '==', currentUser.schoolId)
      );
      unsubSubs = onSnapshot(
        qSubs,
        (snap) => {
          const cutoff = rolloverTimestampRef.current || 0;
          const normalizedSchool = (currentUser.schoolId || '').trim().toLowerCase();
          const subsList = snap.docs
            .map((d) => d.data())
            .filter((sub: any) => (sub.schoolId || '').trim().toLowerCase() === normalizedSchool)
            .filter((sub: any) => {
              if (cutoff > 0) {
                const ts = (sub as any).timestamp || getQuestionTimestamp(sub) || 0;
                return ts >= cutoff;
              }
              return true;
            });
          setGradeSheetData((prev) =>
            prev.map((s) => {
              const matchingCount = subsList.filter(
                (sub) => sub.studentCode === s.code
              ).length;
              return {
                ...s,
                submissionsCount: Math.max(s.submissionsCount, matchingCount, s.gradedCount),
              };
            })
          );
        },
        () => {}
      );
    } catch (_) {}

    // 5. Direct Firestore Questions query: Strictly scoped to schoolId + class + subject (unlimited)
    let unsubQuestions = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const normalizedSchool = currentUser.schoolId.trim().toLowerCase();
      const qQuestions = query(
        collection(db, 'questions'),
        where('schoolId', '==', currentUser.schoolId),
        where('class', '==', teacherClass)
      );
      unsubQuestions = onSnapshot(
        qQuestions,
        (snap) => {
          const raw = snap.empty
            ? []
            : snap.docs
                .map((d) => ({ ...d.data(), id: d.id } as Question))
                .filter(
                  (q) =>
                    (q.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                    (!q.subject || q.subject === teacherSubject)
                );
          const seen = new Set<string>();
          const distinct: Question[] = [];
          for (const q of raw) {
            const textKey = (q.questionText || q.text || '').trim().replace(/\s+/g, ' ').toLowerCase();
            const dedupKey = `${q.schoolId || ''}_${q.grade || q.class || ''}_${q.subject || ''}_${textKey}`;
            if (!seen.has(dedupKey)) {
              seen.add(dedupKey);
              distinct.push(q);
            }
          }
          // Sort newest first (الأحدث فالأحدث)
          distinct.sort((a, b) => getQuestionTimestamp(b) - getQuestionTimestamp(a));
          setQuestions(distinct);
        },
        () => {}
      );
    } catch (_) {}

    // 6. Direct Firestore query: Approved Fixed Term 1 Weekly Class Schedules
    let unsubSchedules = () => {};
    try {
      if (currentUser?.schoolId) {
        const normalizedSchool = currentUser.schoolId.trim().toLowerCase();
        const qSched = query(
          collection(db, 'class_schedules'),
          where('schoolId', '==', currentUser.schoolId),
          where('isApproved', '==', true)
        );
        unsubSchedules = onSnapshot(
          qSched,
          (snap) => {
            const list = snap.docs
              .map((d) => ({ ...d.data(), id: d.id } as ClassSchedule))
              .filter((s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchool && s.isApproved)
              .sort((a, b) => Number(a.grade) - Number(b.grade));
            setApprovedSchoolSchedules(list);
          },
          () => {}
        );
      }
    } catch (_) {}

    return () => {
      unsubData();
      unsubAuth();
      unsubCirc();
      unsubGradebooks();
      unsubGrades();
      unsubSubs();
      unsubQuestions();
      unsubSchedules();
    };
  }, [session.subject, session.schoolId, teacherClass, teacherGrade, teacherSchoolId, teacherSubject]);

  // Strict Teacher Isolation: Teacher ONLY sees Term 1 schedules of classes/grades they actually teach
  const teacherTaughtSchedules = approvedSchoolSchedules.filter((sch) => {
    const entries = sch.entries || [];
    const matchesByTeacherName = entries.some((slot) =>
      slot.teacherName?.trim() ? doesSlotMatchTeacher(slot, session.name) : false
    );
    if (matchesByTeacherName) return true;

    // Fallback when supervisor did not type teacher names in the teacher's assigned grade
    if (String(sch.grade).trim() === String(teacherGrade).trim()) {
      const normTeacherSubj = normalizeArabicForMatch(teacherSubject);
      return entries.some((slot) => {
        if (slot.teacherName?.trim()) return false;
        const normSlotSubj = normalizeArabicForMatch(slot.subject || '');
        return Boolean(
          normTeacherSubj &&
            normSlotSubj &&
            (normSlotSubj.includes(normTeacherSubj) || normTeacherSubj.includes(normSlotSubj))
        );
      });
    }
    return false;
  });

  const unreadCircularsCount = teacherCirculars.filter((c) => !c.isRead).length;

  // Question Creation Form State & Pagination
  const [visibleQuestionsCount, setVisibleQuestionsCount] = useState<number>(50);
  const [qText, setQText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number>(0);
  const [qPoints, setQPoints] = useState<number>(5);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Quick Lesson Questions Upload & Daily Quota (5 questions/day limit, zero technical jargon)
  interface DraftLessonQuestion {
    id: string;
    questionKind: LessonQuestionKind;
    questionText: string;
    options: string[];
    correctIndex: number;
    points: number;
  }

  const QUESTION_KIND_LABELS: Record<LessonQuestionKind, string> = {
    mcq: 'اختيار من متعدد',
    true_false: 'صح أو خطأ',
    fill_blank: 'أكمل العبارة',
  };

  const getLocalDateKey = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [todayDateKey, setTodayDateKey] = useState<string>(() => getLocalDateKey());
  const safeSchoolKey = (teacherSchoolId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeTeacherKey = (session.code || 'teacher').replace(/[^a-zA-Z0-9_-]/g, '_');
  const quotaDocId = `${safeSchoolKey}_${safeTeacherKey}_${todayDateKey}`;
  const draftStorageKey = `lesson_draft_${quotaDocId}`;
  const localQuotaStorageKey = `lesson_quota_used_${quotaDocId}`;

  const [dailyQuotaUsed, setDailyQuotaUsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`lesson_quota_used_${safeSchoolKey}_${safeTeacherKey}_${getLocalDateKey()}`) === '1';
    } catch {
      return false;
    }
  });
  const [dailyQuotaLoading, setDailyQuotaLoading] = useState<boolean>(true);
  const [questionDistribution, setQuestionDistribution] = useState<{
    mcq: number;
    trueFalse: number;
    fillBlank: number;
  }>({ mcq: 3, trueFalse: 1, fillBlank: 1 });
  const [queuedLessonPages, setQueuedLessonPages] = useState<PreparedLessonPage[]>([]);
  const [sessionLessonPages, setSessionLessonPages] = useState<PreparedLessonPage[]>([]);
  const [isConvertingPages, setIsConvertingPages] = useState<boolean>(false);
  const [isPreparingQuestions, setIsPreparingQuestions] = useState<boolean>(false);
  const isPreparingQuestionsRef = useRef<boolean>(false);
  const [lessonFlowError, setLessonFlowError] = useState<string | null>(null);
  const [lessonLimitNotice, setLessonLimitNotice] = useState<string | null>(null);
  const [preparedQuestions, setPreparedQuestions] = useState<DraftLessonQuestion[]>(() => {
    try {
      const saved = localStorage.getItem(`lesson_draft_${safeSchoolKey}_${safeTeacherKey}_${getLocalDateKey()}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((q: any) => ({
            ...q,
            questionKind: q?.questionKind || (Array.isArray(q?.options) && q.options.length === 2 ? 'true_false' : 'mcq'),
          }));
        }
      }
    } catch {
      // ignore storage read error
    }
    return [];
  });
  const [isSendingPrepared, setIsSendingPrepared] = useState<boolean>(false);

  // Excel Question Import State (with same anti-cheat answer shuffling)
  const [excelImportedQuestions, setExcelImportedQuestions] = useState<ImportedExcelQuestion[]>([]);
  const [excelImportError, setExcelImportError] = useState<string | null>(null);
  const [isSendingExcel, setIsSendingExcel] = useState<boolean>(false);
  const excelQuestionInputRef = useRef<HTMLInputElement>(null);

  const lessonCameraInputRef = useRef<HTMLInputElement>(null);
  const lessonFileInputRef = useRef<HTMLInputElement>(null);
  const lessonAddMoreInputRef = useRef<HTMLInputElement>(null);
  const lessonRegenerateUploadInputRef = useRef<HTMLInputElement>(null);

  const adjustQuestionDistribution = (
    target: 'mcq' | 'trueFalse' | 'fillBlank',
    delta: 1 | -1
  ) => {
    setQuestionDistribution((prev) => {
      const next = { ...prev };
      if (delta === 1) {
        if (next[target] >= 5) return prev;
        const others = (['mcq', 'trueFalse', 'fillBlank'] as const).filter((k) => k !== target);
        const donor = others.sort((a, b) => next[b] - next[a]).find((k) => next[k] > 0);
        if (!donor) return prev;
        next[target] += 1;
        next[donor] -= 1;
      } else {
        if (next[target] <= 0) return prev;
        const receiver =
          target === 'mcq'
            ? 'trueFalse'
            : 'mcq';
        next[target] -= 1;
        next[receiver] += 1;
      }
      return next;
    });
  };

  // Automatic midnight rollover check
  useEffect(() => {
    const interval = setInterval(() => {
      const currentKey = getLocalDateKey();
      if (currentKey !== todayDateKey) {
        setTodayDateKey(currentKey);
        setQueuedLessonPages([]);
        setSessionLessonPages([]);
        setPreparedQuestions([]);
        setLessonFlowError(null);
        setLessonLimitNotice(null);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [todayDateKey]);

  // Real-time Firestore listener for teacher's daily 5-question quota
  useEffect(() => {
    setDailyQuotaLoading(true);
    const quotaRef = doc(db, 'teacher_daily_quotas', quotaDocId);
    const unsubQuota = onSnapshot(
      quotaRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setDailyQuotaUsed(Boolean(data?.used));
        } else {
          setDailyQuotaUsed(false);
        }
        setDailyQuotaLoading(false);
      },
      () => {
        setDailyQuotaLoading(false);
      }
    );
    return () => unsubQuota();
  }, [quotaDocId]);

  // Sync unsent draft questions locally until submitted
  useEffect(() => {
    try {
      if (preparedQuestions.length > 0) {
        localStorage.setItem(draftStorageKey, JSON.stringify(preparedQuestions));
      } else {
        localStorage.removeItem(draftStorageKey);
      }
    } catch {
      // ignore quota/storage errors
    }
  }, [preparedQuestions, draftStorageKey]);

  const QUOTA_EXHAUSTED_MESSAGE =
    'تم تجهيز أسئلة اليوم، عدد الأسئلة لليوم الواحد لا يتجاوز 5 أسئلة، يمكنك تجهيز أسئلة جديدة غداً';

  const raceWithTimeout = <T,>(promise: Promise<T>, ms = 2500): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  };

  const verifyQuotaAvailable = async (): Promise<boolean> => {
    let localUsed = false;
    try {
      localUsed = localStorage.getItem(localQuotaStorageKey) === '1';
    } catch {
      // ignore storage errors
    }
    if (dailyQuotaUsed || localUsed) {
      setDailyQuotaUsed(true);
      setLessonFlowError(QUOTA_EXHAUSTED_MESSAGE);
      return false;
    }
    try {
      const snap = await raceWithTimeout(
        getDoc(doc(db, 'teacher_daily_quotas', quotaDocId)),
        2500
      );
      if (snap.exists() && Boolean(snap.data()?.used)) {
        setDailyQuotaUsed(true);
        try {
          localStorage.setItem(localQuotaStorageKey, '1');
        } catch {
          // ignore
        }
        setLessonFlowError(QUOTA_EXHAUSTED_MESSAGE);
        return false;
      }
    } catch {
      // fallback to reactive/local state if Firestore WebChannel is slow or offline
    }
    return true;
  };

  const prepareQuestionsFromPages = async (
    pagesToProcess: PreparedLessonPage[],
    options?: { isRegenerate?: boolean; previousQuestionTexts?: string[]; skipQuotaCheck?: boolean }
  ) => {
    if (pagesToProcess.length === 0 || isPreparingQuestionsRef.current) return;

    // Show waiting screen synchronously before any async operation
    isPreparingQuestionsRef.current = true;
    setLessonFlowError(null);
    setIsPreparingQuestions(true);

    const isRegenerate = Boolean(options?.isRegenerate);
    try {
      if (!isRegenerate && !options?.skipQuotaCheck) {
        const allowed = await verifyQuotaAvailable();
        if (!allowed) {
          setQueuedLessonPages([]);
          setLessonLimitNotice(null);
          return;
        }
      }

      const controller = new AbortController();
      const fetchTimer = setTimeout(() => controller.abort(), 45000);
      let res: Response;
      try {
        res = await fetch('/api/lesson/prepare-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            images: pagesToProcess.slice(0, MAX_LESSON_PAGES).map((p) => ({
              base64: p.base64,
              mimeType: p.mimeType,
            })),
            grade: teacherGrade,
            subject: teacherSubject,
            distribution: questionDistribution,
            previousQuestions: options?.previousQuestionTexts || [],
          }),
        });
      } finally {
        clearTimeout(fetchTimer);
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'تعذر تجهيز الأسئلة حالياً، يرجى المحاولة مرة أخرى.');
      }

      const incoming = Array.isArray(data?.questions) ? data.questions.slice(0, 5) : [];
      if (incoming.length === 0) {
        throw new Error('تعذر تجهيز الأسئلة بوضوح، يرجى المحاولة بصور أوضح.');
      }

      // Apply anti-cheat option shuffling & balanced A/B/C/D distribution
      const balanced = shuffleAndBalanceQuestions(
        incoming.map((q: any) => ({
          questionKind: (q?.questionKind || (Array.isArray(q?.options) && q.options.length === 2 ? 'true_false' : 'mcq')) as LessonQuestionKind,
          questionText: String(q?.questionText || '').trim(),
          options: Array.isArray(q?.options) ? q.options.map((o: unknown) => String(o || '').trim()) : [],
          correctIndex: typeof q?.correctIndex === 'number' ? q.correctIndex : 0,
          points: 5,
        }))
      );

      const formattedDrafts: DraftLessonQuestion[] = balanced.map((q, idx) => ({
        id: `draft-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        questionKind: q.questionKind || 'mcq',
        questionText: q.questionText,
        options: q.options,
        correctIndex: q.correctIndex,
        points: 5,
      }));

      // Lock daily quota locally + in Firestore (bounded by timeout so UI never hangs)
      setDailyQuotaUsed(true);
      try {
        localStorage.setItem(localQuotaStorageKey, '1');
      } catch {
        // ignore
      }
      await raceWithTimeout(
        setDoc(
          doc(db, 'teacher_daily_quotas', quotaDocId),
          cleanFirestorePayload({
            id: quotaDocId,
            schoolId: teacherSchoolId,
            teacherCode: session.code,
            teacherName: session.name,
            date: todayDateKey,
            used: true,
            questionsCount: formattedDrafts.length,
            updatedAt: Date.now(),
          }),
          { merge: true }
        ),
        3500
      ).catch(() => {});

      setSessionLessonPages(pagesToProcess.slice(0, MAX_LESSON_PAGES));
      setPreparedQuestions(formattedDrafts);
      setQueuedLessonPages([]);
      setLessonLimitNotice(null);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setLessonFlowError('استغرق تجهيز الأسئلة وقتاً أطول من المعتاد، يرجى الضغط على "جهّز الأسئلة الآن" للمحاولة مرة أخرى.');
      } else {
        setLessonFlowError(
          err instanceof Error ? err.message : 'تعذر تجهيز الأسئلة حالياً، يرجى المحاولة مرة أخرى.'
        );
      }
    } finally {
      isPreparingQuestionsRef.current = false;
      setIsPreparingQuestions(false);
    }
  };

  const handleRegenerateQuestions = async () => {
    if (isPreparingQuestions || isConvertingPages || preparedQuestions.length === 0) return;
    setLessonFlowError(null);
    if (sessionLessonPages.length > 0) {
      await prepareQuestionsFromPages(sessionLessonPages, {
        isRegenerate: true,
        previousQuestionTexts: preparedQuestions.map((q) => q.questionText),
      });
    } else {
      // If page was refreshed after generation, allow re-selecting the lesson pages once for this same-day regenerate
      lessonRegenerateUploadInputRef.current?.click();
    }
  };

  const handleRegenerateFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';
    setLessonFlowError(null);
    setIsConvertingPages(true);
    try {
      const result = await convertFilesToLessonPages(files, 0);
      if (result.pages.length === 0) {
        setLessonFlowError('لم يتم العثور على صفحات صالحة في الملف المختار.');
        return;
      }
      setIsConvertingPages(false);
      await prepareQuestionsFromPages(result.pages.slice(0, MAX_LESSON_PAGES), {
        isRegenerate: true,
        previousQuestionTexts: preparedQuestions.map((q) => q.questionText),
      });
    } catch (err) {
      setLessonFlowError(
        err instanceof Error ? err.message : 'تعذر قراءة الملف المحدد، يرجى المحاولة بملف أو صورة أخرى.'
      );
    } finally {
      setIsConvertingPages(false);
    }
  };

  const handleTriggerLessonUpload = async (inputRef: React.RefObject<HTMLInputElement | null>) => {
    setLessonFlowError(null);
    if (isPreparingQuestionsRef.current || isPreparingQuestions || isConvertingPages) return;
    if (queuedLessonPages.length >= MAX_LESSON_PAGES) {
      setLessonLimitNotice('وصلت للحد الأقصى، سيتم تجهيز الأسئلة الآن');
      await prepareQuestionsFromPages(queuedLessonPages.slice(0, MAX_LESSON_PAGES));
      return;
    }
    // Check fast state/local quota synchronously so Android file/camera picker opens directly inside user gesture
    let localUsed = false;
    try {
      localUsed = localStorage.getItem(localQuotaStorageKey) === '1';
    } catch {
      // ignore
    }
    if (dailyQuotaUsed || localUsed) {
      setDailyQuotaUsed(true);
      setLessonFlowError(QUOTA_EXHAUSTED_MESSAGE);
      return;
    }
    inputRef.current?.click();
  };

  const handleLessonFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';

    setLessonFlowError(null);
    setLessonLimitNotice(null);

    const allowed = await verifyQuotaAvailable();
    if (!allowed) return;

    setIsConvertingPages(true);
    try {
      const result = await convertFilesToLessonPages(files, queuedLessonPages.length);
      const mergedPages = [...queuedLessonPages, ...result.pages].slice(0, MAX_LESSON_PAGES);

      if (mergedPages.length === 0) {
        setLessonFlowError('لم يتم العثور على صفحات صالحة في الملف المختار.');
        return;
      }

      setQueuedLessonPages(mergedPages);

      if (mergedPages.length >= MAX_LESSON_PAGES || result.hitLimit) {
        setLessonLimitNotice('وصلت للحد الأقصى، سيتم تجهيز الأسئلة الآن');
        setIsConvertingPages(false);
        await prepareQuestionsFromPages(mergedPages, { skipQuotaCheck: true });
        return;
      }
    } catch (err) {
      setLessonFlowError(
        err instanceof Error ? err.message : 'تعذر قراءة الملف المحدد، يرجى المحاولة بملف أو صورة أخرى.'
      );
    } finally {
      setIsConvertingPages(false);
    }
  };

  const handleRemoveQueuedPage = (pageId: string) => {
    setQueuedLessonPages((prev) => prev.filter((p) => p.id !== pageId));
    setLessonLimitNotice(null);
  };

  const handleUpdateDraftQuestion = (
    draftId: string,
    updater: (prev: DraftLessonQuestion) => DraftLessonQuestion
  ) => {
    setPreparedQuestions((prev) => prev.map((q) => (q.id === draftId ? updater(q) : q)));
  };

  const handleDeleteDraftQuestion = (draftId: string) => {
    setPreparedQuestions((prev) => prev.filter((q) => q.id !== draftId));
  };

  const saveBatchQuestionsToFirestore = async (
    batch: Array<{
      questionKind?: LessonQuestionKind;
      questionText: string;
      options: string[];
      correctIndex: number;
      points: number;
    }>
  ): Promise<number> => {
    const studentClass = session.class || teacherGrade;
    const baseNow = Date.now();
    let savedCount = 0;

    for (let i = 0; i < batch.length; i++) {
      const draft = batch[i];
      const cleanQText = draft.questionText.trim();
      const cleanOptions = draft.options.map((o) => o.trim());
      const now = new Date(baseNow + i);
      const nowFormatted = formatArabicDateTime(now);

      const newQuestionData = {
        schoolId: session.schoolId,
        class: studentClass,
        classId: studentClass,
        grade: (session.grade as '7' | '8' | '9') || '8',
        subject: session.subject || 'العلوم',
        type: 'سؤال موضوعي',
        questionKind: draft.questionKind || (cleanOptions.length === 2 ? 'true_false' : 'mcq'),
        text: cleanQText,
        questionText: cleanQText,
        options: cleanOptions,
        correctIndex: draft.correctIndex,
        correctOption: draft.correctIndex,
        points: Number(draft.points) || 5,
        teacherName: session.name,
        teacherId: auth.currentUser?.uid || session.code,
        isPublished: true,
        createdAtFormatted: nowFormatted,
        timestamp: baseNow + i,
        month: activeMonth,
      };

      try {
        const docRef = await addDoc(
          collection(db, 'questions'),
          cleanFirestorePayload({
            ...newQuestionData,
            createdAt: serverTimestamp(),
          })
        );
        await appDataService.addQuestion({
          ...newQuestionData,
          id: docRef.id,
          createdAt: now.toISOString(),
        } as any);
      } catch {
        await appDataService.addQuestion({
          ...newQuestionData,
          createdAt: now.toISOString(),
        });
      }
      savedCount += 1;
    }

    return savedCount;
  };

  const handleSendPreparedQuestions = async () => {
    if (preparedQuestions.length === 0 || isSendingPrepared) return;

    for (let i = 0; i < preparedQuestions.length; i++) {
      const q = preparedQuestions[i];
      if (!q.questionText.trim()) {
        setLessonFlowError(`يرجى كتابة نص السؤال رقم (${i + 1}) قبل الإرسال.`);
        return;
      }
      if (q.options.length < 2 || q.options.some((opt) => !opt.trim())) {
        setLessonFlowError(`يرجى تعبئة جميع الخيارات للسؤال رقم (${i + 1}).`);
        return;
      }
    }

    setLessonFlowError(null);
    setIsSendingPrepared(true);

    try {
      const savedCount = await saveBatchQuestionsToFirestore(preparedQuestions);

      setPreparedQuestions([]);
      setQueuedLessonPages([]);
      setSessionLessonPages([]);
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // ignore
      }
      setToastMsg(`✅ تم إرسال (${savedCount}) أسئلة بنجاح إلى بنك الأسئلة!`);
      setTimeout(() => setToastMsg(null), 4000);
    } catch {
      setLessonFlowError('تعذر حفظ الأسئلة حالياً، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSendingPrepared(false);
    }
  };

  const handleExcelQuestionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setExcelImportError(null);
    try {
      const imported = await parseAndShuffleExcelQuestions(file);
      setExcelImportedQuestions(imported);
    } catch (err) {
      setExcelImportError(
        err instanceof Error ? err.message : 'تعذر قراءة ملف الإكسل، تأكد من صيغة الملف.'
      );
    }
  };

  const handleSendExcelQuestions = async () => {
    if (excelImportedQuestions.length === 0 || isSendingExcel) return;
    setExcelImportError(null);
    setIsSendingExcel(true);
    try {
      const reshuffled = shuffleAndBalanceQuestions(excelImportedQuestions) as ImportedExcelQuestion[];
      const savedCount = await saveBatchQuestionsToFirestore(reshuffled);
      setExcelImportedQuestions([]);
      setToastMsg(`✅ تم إرسال (${savedCount}) أسئلة من Excel بنجاح مع توزيع الإجابات!`);
      setTimeout(() => setToastMsg(null), 4000);
    } catch {
      setExcelImportError('تعذر حفظ الأسئلة المستوردة حالياً، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSendingExcel(false);
    }
  };

  // 1. Submit New MCQ Question (Only Multiple Choice, No Essay, No Photos)
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) {
      alert('يرجى كتابة نص السؤال.');
      return;
    }

    const emptyOpt = options.some((opt) => !opt.trim());
    if (emptyOpt) {
      alert('يرجى تعبئة جميع الخيارات الأربعة للسؤال الموضوعي.');
      return;
    }

    const studentClass = session.class || teacherGrade;
    const cleanQText = qText.trim();
    const n = cleanQText.replace(/\s+/g, ' ').toLowerCase();

    // 1- منع التكرار (نفس النص فقط):
    if (questions.some((q) => (q.questionText || q.text || '').trim().replace(/\s+/g, ' ').toLowerCase() === n)) {
      alert('نفس السؤال موجود مسبقاً في بنك الأسئلة.');
      return;
    }

    const now = new Date();
    const nowFormatted = formatArabicDateTime(now);
    const nowTimestamp = now.getTime();

    const newQuestionData = {
      schoolId: session.schoolId,
      class: studentClass,
      classId: studentClass,
      grade: (session.grade as '7' | '8' | '9') || '8',
      subject: session.subject || 'العلوم',
      type: 'سؤال موضوعي',
      text: cleanQText,
      questionText: cleanQText,
      options,
      correctIndex: correctOptionIndex,
      correctOption: correctOptionIndex,
      points: Number(qPoints) || 5,
      teacherName: session.name,
      teacherId: auth.currentUser?.uid || session.code,
      isPublished: true,
      createdAtFormatted: nowFormatted,
      timestamp: nowTimestamp,
      month: activeMonth,
    };

    try {
      const docRef = await addDoc(collection(db, 'questions'), cleanFirestorePayload({
        ...newQuestionData,
        createdAt: serverTimestamp(),
      }));
      await appDataService.addQuestion({
        ...newQuestionData,
        id: docRef.id,
        createdAt: now.toISOString(),
      } as any);
    } catch {
      await appDataService.addQuestion({
        ...newQuestionData,
        createdAt: now.toISOString(),
      });
    }

    setQText('');
    setOptions(['', '', '', '']);
    setToastMsg('✅ تم حفظ السؤال الموضوعي بنجاح وإضافته إلى بنك الأسئلة!');
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Monthly Archive and Rollover Handler
  const handleArchiveAndRollover = async () => {
    if (isArchiving) return;
    setIsArchiving(true);
    try {
      const now = Date.now();
      const nowFormatted = new Date().toLocaleDateString('ar-YE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      // Find next academic month
      const currentMonthIndex = ACADEMIC_MONTHS.indexOf(activeMonth as any);
      const nextMonth =
        currentMonthIndex >= 0 && currentMonthIndex < ACADEMIC_MONTHS.length - 1
          ? ACADEMIC_MONTHS[currentMonthIndex + 1]
          : ACADEMIC_MONTHS[0];

      const recordId = `gb_${session.schoolId}_${teacherGrade}_${encodeURIComponent(teacherSubject)}_${encodeURIComponent(activeMonth)}_${new Date().getFullYear()}`;

      // Questions of current month to archive
      const currentMonthQuestions = questions.filter((q) => {
        if (rolloverTimestamp > 0) {
          const ts = (q as any).timestamp || getQuestionTimestamp(q) || 0;
          return ts >= rolloverTimestamp;
        }
        return true;
      });

      const record: MonthlyGradebookRecord = {
        id: recordId,
        schoolId: session.schoolId,
        teacherId: session.code,
        teacherName: session.name,
        grade: teacherGrade,
        subject: teacherSubject,
        month: activeMonth,
        year: new Date().getFullYear(),
        archivedAt: nowFormatted,
        timestamp: now,
        roster: gradeSheetData.map((s) => ({
          code: s.code,
          name: s.name,
          phone: s.phone,
          submissionsCount: s.submissionsCount,
          totalEarned: s.totalEarned,
          totalPossible: s.totalPossible,
          percentage: s.percentage,
          rating: s.rating,
          ratingBadgeColor: s.ratingBadgeColor,
        })),
        questions: currentMonthQuestions.map((q) => ({
          ...q,
          month: activeMonth,
        })),
        totalStudents: gradeSheetData.length,
        averagePercentage:
          gradeSheetData.length > 0
            ? Math.round(gradeSheetData.reduce((acc, curr) => acc + curr.percentage, 0) / gradeSheetData.length)
            : 0,
      };

      // 1. Save archive record in Firestore
      await appDataService.archiveMonthlyGradebook(record);

      // 2. Save rollover metadata in Firestore
      const metaDocId = `meta_${session.schoolId}_${teacherGrade}_${encodeURIComponent(teacherSubject)}`;
      await setDoc(doc(db, 'monthlyGradebooks', metaDocId), cleanFirestorePayload({
        id: metaDocId,
        schoolId: session.schoolId,
        grade: teacherGrade,
        subject: teacherSubject,
        activeMonth: nextMonth,
        rolloverTimestamp: now,
        lastArchivedMonth: activeMonth,
        updatedAt: now,
      }));

      // 3. Update local states
      setActiveMonth(nextMonth);
      setRolloverTimestamp(now);
      rolloverTimestampRef.current = now;
      setSelectedMonthView('active');
      setShowArchiveConfirm(false);
      setToastMsg(`تم بنجاح ترحيل وأرشفة كشف درجات شهر (${activeMonth})، وبدء كشف درجات نظيف وجديد لشهر (${nextMonth})!`);
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err) {
      console.error('Error during archive & rollover:', err);
      setToastMsg('حدث خطأ أثناء أرشفة وترحيل الكشف. يرجى المحاولة مرة أخرى.');
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsArchiving(false);
    }
  };

  // Export Grade Sheet
  const handleExportCSV = () => {
    const isViewingArchive = selectedMonthView !== 'active';
    const selectedArchive = isViewingArchive
      ? archivedGradebooks.find((a) => a.id === selectedMonthView)
      : null;
    const rosterToExport = selectedArchive ? selectedArchive.roster : gradeSheetData;
    const monthLabel = isViewingArchive ? (selectedArchive?.month || 'مؤرشف') : activeMonth;

    const headers = 'كود الطالب,اسم الطالب,الشهر,رقم الهاتف,عدد التسليمات,الدرجة الإجمالية,النسبة المئوية,التقدير\n';
    const rows = rosterToExport
      .map(
        (s) =>
          `${s.code},${s.name},${monthLabel},${s.phone || '—'},${s.submissionsCount},${s.totalEarned}/${s.totalPossible},${s.percentage}%,${s.rating}`
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كشف_درجات_${formatArabicSchoolName(session.schoolName, session.schoolId)}_${teacherGrade}_${session.subject || 'العلوم'}_${monthLabel}.csv`;
    link.click();
  };

  if (!currentUser) {
    return (
      <div className="min-h-dvh bg-[#EDF0F5] flex items-center justify-center font-bold text-slate-700 font-['Cairo'] text-sm">
        جاري التحميل...
      </div>
    );
  }

  if (!currentUser.schoolId && currentUser.role !== 'super_admin') {
    return (
      <div className="min-h-dvh bg-[#EDF0F5] flex items-center justify-center font-bold text-slate-700 font-['Cairo'] text-sm">
        جاري تحميل بيانات المدرسة...
      </div>
    );
  }

  const isViewingArchive = selectedMonthView !== 'active';
  const selectedArchive = isViewingArchive
    ? archivedGradebooks.find((a) => a.id === selectedMonthView)
    : null;
  const displayedRoster = selectedArchive ? selectedArchive.roster : gradeSheetData;
  const teacherGradeLabel =
    teacherGrade === '8'
      ? 'الصف الثامن الأساسي'
      : teacherGrade === '7'
      ? 'الصف السابع الأساسي'
      : teacherGrade === '9'
      ? 'الصف التاسع الأساسي'
      : `الصف ${teacherGrade}`;

  return (
    <div className="min-h-dvh bg-[#EDF0F5]">
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-5 pb-[max(7.5rem,calc(6.5rem+env(safe-area-inset-bottom)))] space-y-6 text-right font-['Cairo','Tajawal']">
      {/* Soft Pastel Sky-Blue Hero Card matching reference screenshot */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] shadow-[0_6px_20px_rgba(26,58,95,0.08)] p-5 sm:p-6 text-[#1A3A5F]">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 rounded-2xl bg-white text-[#1F5AAA] border border-[#DCE7F3] shadow-xs shrink-0">
                <FileText className="w-6 h-6" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black font-['Cairo'] text-[#1A3A5F] tracking-tight">
                لوحة تحكم المعلم
              </h1>
            </div>
            <p className="text-xs sm:text-sm font-bold text-[#28486B] pr-1">
              أهلاً بك أ. {session.name} - الصف {session.grade} - مادة {session.subject || 'العلوم'} • {formatArabicSchoolName(session.schoolName, session.schoolId)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* جدول الحصص الأسبوعي الثابت للترم الأول (للصفوف التي يدرسها المعلم فقط) */}
            <button
              type="button"
              onClick={() => setActiveTab((prev) => (prev === 'schedule' ? 'create_question' : 'schedule'))}
              className={`px-3.5 py-2.5 rounded-2xl border shadow-sm transition cursor-pointer flex items-center gap-2 text-xs font-black ${
                activeTab === 'schedule'
                  ? 'bg-[#1A3A5F] text-white border-[#1A3A5F]'
                  : 'bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border-[#DCE7F3]'
              }`}
              title="جدول الحصص الأسبوعي (الترم الأول)"
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>جدول حصصي</span>
              {teacherTaughtSchedules.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[10px] font-black">
                  {teacherTaughtSchedules.length}
                </span>
              )}
            </button>

            {/* جرس التعاميم والتوجيهات */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('announcements');
                setTeacherCirculars((prev) => prev.map((c) => ({ ...c, isRead: true })));
              }}
              className="relative p-2.5 rounded-2xl bg-[#1F5AAA] hover:bg-[#194B91] text-white border border-[#194B91] shadow-sm transition cursor-pointer flex items-center gap-2"
              title="تعاميم وتوجيهات الإدارة المدرسية"
            >
              <div className="relative">
                <Bell className="w-5 h-5 text-white" />
                {unreadCircularsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center border border-white animate-ping" />
                )}
                {unreadCircularsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center border border-white shadow">
                    {unreadCircularsCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-black hidden sm:inline">التعاميم</span>
            </button>

            <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-2xl border border-[#DCE7F3] shadow-2xs">
              <Clock className="w-4 h-4 text-[#1F5AAA]" />
              <span className="text-xs font-bold text-[#1A3A5F]">
                صلاحية الحساب: <strong className="text-[#1F5AAA] font-mono">{session.daysRemaining} يوم</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs sm:text-sm font-bold flex items-center justify-between shadow-sm animate-in fade-in">
          <span>{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="text-emerald-800 font-black">✕</button>
        </div>
      )}

      {/* TAB 1: ADD QUESTION (MCQ ONLY) */}
      {activeTab === 'create_question' && (
        <div className="space-y-6">
          {/* Month Selector for Questions */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#F0F4F8] text-[#1F5AAA] rounded-xl border border-[#DCE7F3]">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-[#1A3A5F]">عرض وإدارة أسئلة بنك المنهج الشهري</h4>
                <p className="text-[11px] text-slate-600 font-semibold">ترحيل وأرشفة الأسئلة شهرياً مع كشف الدرجات وبدء شهر جديد نظيف</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
              <span className="text-xs font-bold text-[#1A3A5F] hidden sm:inline shrink-0">الشهر:</span>
              <select
                value={selectedMonthView}
                onChange={(e) => setSelectedMonthView(e.target.value)}
                className="w-full sm:w-auto max-w-full min-w-0 bg-[#F4F8FC] px-3 py-1.5 rounded-xl border border-[#DCE7F3] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] cursor-pointer truncate"
              >
                <option value="active">أسئلة الشهر الحالي: {activeMonth} (نشط / إضافة جديدة)</option>
                {archivedGradebooks.length > 0 && (
                  <optgroup label="أرشيف أسئلة الشهور السابقة">
                    {archivedGradebooks.map((arc) => (
                      <option key={arc.id} value={arc.id}>
                        شهر {arc.month} ({arc.questions?.length || 0} سؤال - {arc.archivedAt})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Archived Month Notice Banner */}
          {isViewingArchive && selectedArchive && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 shadow-sm">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-700" />
                <span>
                  أنت تستعرض <strong>أرشيف أسئلة شهر ({selectedArchive.month})</strong> — معتمدة ومؤرشفة بتاريخ <strong>{selectedArchive.archivedAt}</strong> ({selectedArchive.questions?.length || 0} سؤال مؤرشف)
                </span>
              </div>
              <button
                onClick={() => setSelectedMonthView('active')}
                className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                العودة لأسئلة الشهر الحالي ({activeMonth})
              </button>
            </div>
          )}

          {/* Quick Lesson Upload & 5 Ready Questions Section (Only in Active Month View) */}
          {!isViewingArchive && (
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#DCE7F3] space-y-4">
              {/* Top Daily Quota Banner */}
              <div
                className={`rounded-xl px-4 py-3 border flex items-center justify-between gap-3 ${
                  dailyQuotaUsed
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-[#EEF5FC] border-[#C6DCF2] text-[#1A3A5F]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {dailyQuotaUsed ? (
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                  )}
                  <span className="text-xs sm:text-sm font-black leading-relaxed">
                    {dailyQuotaLoading
                      ? 'جاري التحقق من رصيد الأسئلة اليومي...'
                      : dailyQuotaUsed
                      ? QUOTA_EXHAUSTED_MESSAGE
                      : 'تبقى لك 5 أسئلة اليوم'}
                  </span>
                </div>
                {!dailyQuotaUsed && !dailyQuotaLoading && (
                  <span className="px-2.5 py-1 rounded-lg bg-white text-[#1F5AAA] text-[11px] font-black border border-[#C6DCF2] shrink-0">
                    5 / 5 متاح
                  </span>
                )}
              </div>

              {/* Hidden file inputs */}
              <input
                ref={lessonCameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleLessonFilesSelected}
              />
              <input
                ref={lessonFileInputRef}
                type="file"
                accept="image/*,.pdf,.docx"
                multiple
                className="hidden"
                onChange={handleLessonFilesSelected}
              />
              <input
                ref={lessonAddMoreInputRef}
                type="file"
                accept="image/*,.pdf,.docx"
                multiple
                className="hidden"
                onChange={handleLessonFilesSelected}
              />
              <input
                ref={lessonRegenerateUploadInputRef}
                type="file"
                accept="image/*,.pdf,.docx"
                multiple
                className="hidden"
                onChange={handleRegenerateFilesSelected}
              />

              {/* Primary Action Buttons: تصوير درس & رفع ملف */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-black text-base text-[#1A3A5F] flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#1F5AAA]" />
                    تجهيز أسئلة الدرس مباشرة
                  </h3>
                  <p className="text-xs text-slate-600 font-semibold mt-0.5">
                    صوّر صفحات الدرس أو ارفع ملف (صورة، PDF، Word) بحد أقصى 5 صفحات لتجهيز 5 أسئلة جاهزة
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    aria-disabled={dailyQuotaUsed}
                    onClick={() => handleTriggerLessonUpload(lessonCameraInputRef)}
                    disabled={isConvertingPages || isPreparingQuestions || queuedLessonPages.length >= MAX_LESSON_PAGES}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-sm border ${
                      dailyQuotaUsed || isConvertingPages || isPreparingQuestions || queuedLessonPages.length >= MAX_LESSON_PAGES
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-[#1F5AAA] hover:bg-[#194B91] text-white border-[#194B91] cursor-pointer'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>تصوير درس</span>
                  </button>

                  <button
                    type="button"
                    aria-disabled={dailyQuotaUsed}
                    onClick={() => handleTriggerLessonUpload(lessonFileInputRef)}
                    disabled={isConvertingPages || isPreparingQuestions || queuedLessonPages.length >= MAX_LESSON_PAGES}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-sm border ${
                      dailyQuotaUsed || isConvertingPages || isPreparingQuestions || queuedLessonPages.length >= MAX_LESSON_PAGES
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-[#EEF5FC] text-[#1A3A5F] border-[#9BBEDF] cursor-pointer'
                    }`}
                  >
                    <Upload className="w-4 h-4 text-[#1F5AAA]" />
                    <span>رفع ملف</span>
                  </button>
                </div>
              </div>

              {/* Customizable 5-Question Types Distribution (Default: 3 MCQ + 1 T/F + 1 Fill-in-Blank, Total = 5) */}
              {(!dailyQuotaUsed || preparedQuestions.length > 0) && !isConvertingPages && !isPreparingQuestions && (
                <div className="bg-[#F8FBFF] rounded-xl p-3.5 border border-[#DCE7F3] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#1A3A5F]">
                      توزيع أنواع الأسئلة الخمسة (المجموع 5 أسئلة):
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuestionDistribution({ mcq: 3, trueFalse: 1, fillBlank: 1 })}
                      className="text-[11px] font-bold text-[#1F5AAA] hover:underline cursor-pointer"
                    >
                      الافتراضي (3 اختيار + 1 صح/خطأ + 1 أكمل)
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[
                      { key: 'mcq' as const, label: 'اختيار من متعدد (4 خيارات)' },
                      { key: 'trueFalse' as const, label: 'صح أو خطأ (خياران)' },
                      { key: 'fillBlank' as const, label: 'أكمل العبارة (4 خيارات)' },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="bg-white rounded-xl px-3 py-2 border border-[#DCE7F3] flex items-center justify-between gap-2"
                      >
                        <span className="text-[11px] font-bold text-[#1A3A5F]">{item.label}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => adjustQuestionDistribution(item.key, -1)}
                            disabled={questionDistribution[item.key] <= 0}
                            className="w-6 h-6 rounded-lg bg-[#EEF5FC] hover:bg-[#dcebfa] disabled:opacity-40 text-[#1F5AAA] flex items-center justify-center cursor-pointer border border-[#C6DCF2]"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center text-xs font-black text-[#1A3A5F]">
                            {questionDistribution[item.key]}
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustQuestionDistribution(item.key, 1)}
                            disabled={questionDistribution[item.key] >= 5}
                            className="w-6 h-6 rounded-lg bg-[#EEF5FC] hover:bg-[#dcebfa] disabled:opacity-40 text-[#1F5AAA] flex items-center justify-center cursor-pointer border border-[#C6DCF2]"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error / Limit Notice */}
              {lessonFlowError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{lessonFlowError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLessonFlowError(null)}
                    className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {lessonLimitNotice && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-black flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{lessonLimitNotice}</span>
                </div>
              )}

              {/* Waiting Screen: ONLY "جاري تجهيز الأسئلة..." with spinning circle (zero technical words) */}
              {(isConvertingPages || isPreparingQuestions) && (
                <div className="p-8 rounded-2xl bg-[#F4F8FC] border border-[#DCE7F3] flex flex-col items-center justify-center gap-3 text-[#1A3A5F]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#1F5AAA]" />
                  <span className="text-sm font-black">جاري تجهيز الأسئلة...</span>
                </div>
              )}

              {/* Multi-Page Confirmation Prompt & Retryable Queue (kept visible at 5 pages too if not yet prepared) */}
              {!isConvertingPages && !isPreparingQuestions && queuedLessonPages.length > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-[#F4F8FC] border-2 border-[#C6DCF2] space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#1A3A5F] flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-[#1F5AAA]" />
                      صفحات الدرس المضافة ({queuedLessonPages.length} من {MAX_LESSON_PAGES})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setQueuedLessonPages([]);
                        setLessonLimitNotice(null);
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      إلغاء الكل
                    </button>
                  </div>

                  {/* Thumbnails preview */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {queuedLessonPages.map((page, idx) => (
                      <div
                        key={page.id}
                        className="relative group bg-white rounded-xl border border-[#DCE7F3] overflow-hidden p-1.5"
                      >
                        <img
                          src={page.dataUrl}
                          alt={`صفحة ${idx + 1}`}
                          className="w-full h-24 object-cover rounded-lg border border-slate-100"
                        />
                        <div className="mt-1 flex items-center justify-between px-1">
                          <span className="text-[10px] font-black text-[#1A3A5F]">
                            صفحة {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveQueuedPage(page.id)}
                            className="text-rose-600 hover:bg-rose-50 rounded p-0.5 cursor-pointer"
                            title="إزالة هذه الصفحة"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Required Confirmation Prompt & Action Buttons */}
                  <div className="bg-white rounded-xl p-4 border border-[#DCE7F3] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-sm font-black text-[#1A3A5F]">
                      {queuedLessonPages.length < MAX_LESSON_PAGES
                        ? 'هل لديك صورة أخرى أو ملف آخر لنفس الدرس؟'
                        : 'تم إرفاق 5 صفحات (الحد الأقصى للدرس)، يمكنك التجهيز الآن:'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {queuedLessonPages.length < MAX_LESSON_PAGES && (
                        <button
                          type="button"
                          onClick={() => handleTriggerLessonUpload(lessonAddMoreInputRef)}
                          className="px-4 py-2.5 rounded-xl text-xs font-black bg-[#EEF5FC] hover:bg-[#dcebfa] text-[#1F5AAA] border border-[#9BBEDF] flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>+ أضف صورة أخرى</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => prepareQuestionsFromPages(queuedLessonPages, { skipQuotaCheck: true })}
                        className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>
                          {queuedLessonPages.length < MAX_LESSON_PAGES
                            ? 'لا، جهّز الأسئلة الآن'
                            : 'جهّز الأسئلة الآن'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Ready Questions Review, Edit, Delete, Regenerate ("إعادة"), and Send Panel */}
              {!isConvertingPages && !isPreparingQuestions && preparedQuestions.length > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-[#F4F8FC] border-2 border-[#9BBEDF] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE7F3] pb-3">
                    <div>
                      <h4 className="text-sm font-black text-[#1A3A5F] flex items-center gap-2">
                        <Edit3 className="w-4 h-4 text-[#1F5AAA]" />
                        مراجعة الأسئلة الجاهزة ({preparedQuestions.length} أسئلة)
                      </h4>
                      <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                        يمكنك تعديل صيغة أي سؤال أو خياراته أو الإجابة الصحيحة أو حذف أي سؤال أو الضغط على إعادة قبل الإرسال
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={handleRegenerateQuestions}
                        disabled={isPreparingQuestions || isConvertingPages}
                        className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-[#1A3A5F] border border-[#9BBEDF] text-xs font-black flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                        title="تجهيز 5 أسئلة جديدة بنفس حصة اليوم"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-[#1F5AAA]" />
                        <span>إعادة</span>
                      </button>
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
                        جاهز للمراجعة والإرسال
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {preparedQuestions.map((draft, qIdx) => (
                      <div
                        key={draft.id}
                        className="bg-white rounded-xl p-4 border border-[#DCE7F3] shadow-xs space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-[#EEF5FC] text-[#1F5AAA] text-xs font-black border border-[#C6DCF2]">
                              السؤال {qIdx + 1}
                            </span>
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-[#1A3A5F] text-[11px] font-bold border border-slate-200">
                              {QUESTION_KIND_LABELS[draft.questionKind] || 'اختيار من متعدد'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[11px] font-bold text-slate-600">الدرجة:</label>
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={draft.points}
                                onChange={(e) =>
                                  handleUpdateDraftQuestion(draft.id, (prev) => ({
                                    ...prev,
                                    points: Math.max(1, Number(e.target.value) || 5),
                                  }))
                                }
                                className="w-16 px-2 py-1 text-xs rounded-lg border border-[#DCE7F3] font-bold text-center text-[#1A3A5F]"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteDraftQuestion(draft.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          value={draft.questionText}
                          onChange={(e) =>
                            handleUpdateDraftQuestion(draft.id, (prev) => ({
                              ...prev,
                              questionText: e.target.value,
                            }))
                          }
                          placeholder="نص السؤال..."
                          className="w-full p-2.5 text-xs rounded-xl border border-[#DCE7F3] focus:outline-[#1F5AAA] bg-white text-[#1A3A5F] font-bold"
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {draft.options.map((optVal, optIdx) => (
                            <div
                              key={`${draft.id}-opt-${optIdx}`}
                              className={`flex items-center gap-2 p-2 rounded-xl border transition ${
                                draft.correctIndex === optIdx
                                  ? 'bg-[#EEF5FC] border-[#9BBEDF]'
                                  : 'bg-slate-50 border-[#DCE7F3]'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`draft-correct-${draft.id}`}
                                checked={draft.correctIndex === optIdx}
                                onChange={() =>
                                  handleUpdateDraftQuestion(draft.id, (prev) => ({
                                    ...prev,
                                    correctIndex: optIdx,
                                  }))
                                }
                                className="w-4 h-4 accent-[#1F5AAA] cursor-pointer"
                              />
                              <span className="text-xs font-bold text-slate-600 w-5">
                                {optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د'}:
                              </span>
                              <input
                                type="text"
                                value={optVal}
                                readOnly={draft.questionKind === 'true_false'}
                                onChange={(e) =>
                                  handleUpdateDraftQuestion(draft.id, (prev) => {
                                    const nextOpts = [...prev.options];
                                    nextOpts[optIdx] = e.target.value;
                                    return { ...prev, options: nextOpts };
                                  })
                                }
                                className="w-full text-xs bg-transparent focus:outline-none text-[#1A3A5F] font-semibold"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleRegenerateQuestions}
                      disabled={isPreparingQuestions || isConvertingPages || isSendingPrepared}
                      className="px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 disabled:opacity-50 text-[#1A3A5F] text-xs font-black flex items-center gap-2 border border-[#9BBEDF] cursor-pointer transition"
                    >
                      <RotateCcw className="w-4 h-4 text-[#1F5AAA]" />
                      <span>إعادة</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendPreparedQuestions}
                      disabled={isSendingPrepared || preparedQuestions.length === 0}
                      className="px-6 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 shadow-sm border border-[#194B91] cursor-pointer transition"
                    >
                      {isSendingPrepared ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>إرسال</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Question Creation Form & Excel Import (Only in Active Month View) */}
          {!isViewingArchive && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#DCE7F3]">
              <div className="border-b border-slate-200 pb-3 mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-base text-[#1A3A5F] flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-[#1F5AAA]" />
                    إضافة سؤال موضوعي جديد لشهر ({activeMonth})
                  </h3>
                  <p className="text-xs text-slate-600 font-semibold mt-0.5">
                    سؤال تفاعلي باختيار من متعدد أو استيراد أسئلة من ملف Excel مع خلط الإجابات تلقائياً
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={excelQuestionInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleExcelQuestionFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => excelQuestionInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <span>استيراد من Excel</span>
                  </button>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                    شهر {activeMonth} (نشط)
                  </span>
                </div>
              </div>

              {excelImportError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-between">
                  <span>{excelImportError}</span>
                  <button type="button" onClick={() => setExcelImportError(null)} className="cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {excelImportedQuestions.length > 0 && (
                <div className="mb-5 p-4 rounded-2xl bg-[#F4F8FC] border border-[#9BBEDF] space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-black text-[#1A3A5F]">
                      أسئلة مستوردة من Excel ({excelImportedQuestions.length} سؤال — تم خلط وتوزيع الإجابات عشوائياً)
                    </span>
                    <button
                      type="button"
                      onClick={() => setExcelImportedQuestions([])}
                      className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      إلغاء الاستيراد
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {excelImportedQuestions.map((eq, idx) => (
                      <div key={eq.id} className="bg-white rounded-xl p-3 border border-[#DCE7F3] text-xs space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-[#1A3A5F]">
                            {idx + 1}. {eq.questionText}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setExcelImportedQuestions((prev) => prev.filter((item) => item.id !== eq.id))
                            }
                            className="text-rose-600 hover:text-rose-800 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {eq.options.map((opt, oIdx) => (
                            <span
                              key={`${eq.id}-${oIdx}`}
                              className={`px-2 py-0.5 rounded-lg border text-[11px] ${
                                eq.correctIndex === oIdx
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              {oIdx === 0 ? 'أ' : oIdx === 1 ? 'ب' : oIdx === 2 ? 'ج' : 'د'}: {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSendExcelQuestions}
                      disabled={isSendingExcel}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-2 cursor-pointer"
                    >
                      {isSendingExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      <span>إرسال أسئلة Excel ({excelImportedQuestions.length})</span>
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateQuestion} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-[#F4F8FC] rounded-xl border border-[#DCE7F3] flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#1F5AAA]" />
                    <span className="text-xs font-bold text-[#1A3A5F]">الصف: {session.grade || '8'}</span>
                  </div>
                  <div className="p-3 bg-[#F4F8FC] rounded-xl border border-[#DCE7F3] flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#1F5AAA]" />
                    <span className="text-xs font-bold text-[#1A3A5F]">المادة: {session.subject || 'العلوم'}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">درجة السؤال:</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={qPoints}
                      onChange={(e) => setQPoints(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[#DCE7F3] font-bold focus:outline-[#1F5AAA] bg-white text-[#1A3A5F]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">نص السؤال:</label>
                  <textarea
                    rows={3}
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="اكتب صيغة السؤال بوضوح..."
                    className="w-full p-3 text-xs rounded-xl border border-[#DCE7F3] focus:outline-[#1F5AAA] bg-white text-[#1A3A5F]"
                    required
                  ></textarea>
                </div>

                <div className="bg-[#F4F8FC] p-4 rounded-xl border border-[#DCE7F3] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#1A3A5F]">
                      الخيارات الأربعة (حدد الدائرة للإجابة الصحيحة):
                    </span>
                    <span className="text-[11px] text-[#1F5AAA] font-bold bg-[#EEF5FC] px-2.5 py-0.5 rounded-full border border-[#C6DCF2]">
                      الخيار رقم ({correctOptionIndex + 1}) هو الصحيح
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {options.map((opt, idx) => (
                      <div
                        key={`option-${idx}`}
                        className={`flex items-center gap-2 p-2 rounded-xl border transition ${
                          correctOptionIndex === idx
                            ? 'bg-[#EEF5FC] border-[#9BBEDF]'
                            : 'bg-white border-[#DCE7F3]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="correctOption"
                          checked={correctOptionIndex === idx}
                          onChange={() => setCorrectOptionIndex(idx)}
                          className="w-4 h-4 text-[#1F5AAA] accent-[#1F5AAA] cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-600 w-5">
                          {idx === 0 ? 'أ' : idx === 1 ? 'ب' : idx === 2 ? 'ج' : 'د'}:
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const updated = [...options];
                            updated[idx] = e.target.value;
                            setOptions(updated);
                          }}
                          placeholder={`نص الخيار (${idx + 1})`}
                          className="w-full text-xs bg-transparent focus:outline-none text-[#1A3A5F] font-semibold"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer border border-[#194B91]"
                  >
                    <Send className="w-4 h-4" />
                    <span>حفظ السؤال لشهر ({activeMonth})</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Questions List (Active Month or Archived Month) */}
          <div className="space-y-3">
            {(() => {
              const sourceList = isViewingArchive
                ? (selectedArchive?.questions || [])
                : questions.filter((q) => {
                    if (rolloverTimestamp > 0) {
                      const ts = (q as any).timestamp || getQuestionTimestamp(q) || 0;
                      return ts >= rolloverTimestamp;
                    }
                    return true;
                  });

              const distinctQuestions = sourceList.filter(
                (q, index, self) =>
                  index ===
                  self.findIndex(
                    (t) =>
                      (t.id && t.id === q.id) ||
                      (((t.questionText || t.text || '').trim().replace(/\s+/g, ' ').toLowerCase() === (q.questionText || q.text || '').trim().replace(/\s+/g, ' ').toLowerCase()) &&
                        t.subject === q.subject &&
                        (t.grade === q.grade || t.class === q.class))
                  )
              );

              const displayedQuestions = distinctQuestions.slice(0, visibleQuestionsCount);

              return (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-[#1A3A5F] text-sm">
                      {isViewingArchive
                        ? `أرشيف أسئلة شهر (${selectedArchive?.month}) (${distinctQuestions.length})`
                        : `أسئلة شهر (${activeMonth}) النشطة (${distinctQuestions.length})`}
                    </h3>
                    {distinctQuestions.length > 50 && (
                      <span className="text-xs text-slate-600 font-semibold">
                        عرض {displayedQuestions.length} من {distinctQuestions.length} سؤال
                      </span>
                    )}
                  </div>

                  {distinctQuestions.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center shadow-sm">
                      <BookOpen className="w-12 h-12 text-[#9BBEDF] mx-auto mb-3" />
                      <h4 className="font-black text-base text-[#1A3A5F]">
                        {isViewingArchive
                          ? `لا توجد أسئلة مؤرشفة في شهر (${selectedArchive?.month})`
                          : `لا توجد أسئلة مضافة لشهر (${activeMonth}) بعد (0 سؤال)`}
                      </h4>
                      <p className="text-xs text-slate-600 font-medium mt-1">
                        {isViewingArchive
                          ? 'لم تسجل أسئلة قبل أرشفة هذا الشهر.'
                          : `يبدأ بنك الأسئلة نظيفاً وجديداً لشهر (${activeMonth}). ابدأ بإضافة أول سؤال لمادتك وصفك من النموذج أعلاه.`}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {displayedQuestions.map((q, qIdx) => (
                          <div
                            key={q.id ? `question-${q.id}-${qIdx}` : `question-idx-${qIdx}`}
                            className="bg-white rounded-2xl p-5 border border-[#DCE7F3] shadow-sm flex flex-col justify-between"
                          >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                            الصف {q.grade === '9' ? 'التاسع' : q.grade === '8' ? 'الثامن' : 'السابع'} • {q.subject}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-purple-50 text-purple-800 border-purple-200">
                              [{q.questionKind ? QUESTION_KIND_LABELS[q.questionKind] : 'سؤال موضوعي'}]
                            </span>
                            <span className="text-xs font-bold text-[#1A3A5F] bg-[#F4F8FC] px-2 py-0.5 rounded-md border border-[#DCE7F3]">
                              {q.points || 5} درجات
                            </span>
                          </div>
                        </div>

                        <h4 className="font-bold text-[#1A3A5F] text-xs sm:text-sm mb-2">{q.questionText || q.text}</h4>

                        {q.options && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-800 my-2">
                            {q.options.map((opt, i) => (
                              <div
                                key={`opt-${q.id || qIdx}-${i}`}
                                className={`p-1.5 rounded-lg border text-[11px] ${
                                  q.correctIndex === i || q.correctOption === i
                                    ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                                    : 'bg-[#F8FAFD] border-slate-200'
                                }`}
                              >
                                <span>{i === 0 ? 'أ' : i === 1 ? 'ب' : i === 2 ? 'ج' : 'د'}: </span>
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-bold text-[#1A3A5F]">المعلم: {q.teacherName || session.name}</span>
                          <span className="flex items-center gap-1 text-[#1F5AAA] font-bold bg-[#EEF5FC] px-2 py-0.5 rounded-md border border-[#C6DCF2]">
                            <Clock className="w-3.5 h-3.5 text-[#1F5AAA]" />
                            <span>تاريخ الإضافة: {q.createdAtFormatted || formatArabicDateTime(q.createdAt || q.timestamp)}</span>
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            await appDataService.deleteQuestion(q.id);
                          }}
                          className="text-rose-700 hover:text-rose-900 font-bold cursor-pointer"
                        >
                          حذف السؤال
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {distinctQuestions.length > visibleQuestionsCount && (
                  <div className="flex justify-center pt-3">
                    <button
                      type="button"
                      onClick={() => setVisibleQuestionsCount((prev) => prev + 50)}
                      className="px-6 py-2.5 bg-[#1F5AAA] hover:bg-[#194B91] text-white rounded-xl text-xs font-black transition shadow-sm cursor-pointer flex items-center gap-2 border border-[#194B91]"
                    >
                      <span>تحميل المزيد من الأسئلة ({distinctQuestions.length - visibleQuestionsCount} متبقية)</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        );
      })()}
          </div>
        </div>
      )}

      {/* TAB 2: MY STUDENTS' GRADEBOOK */}
      {activeTab === 'gradebook' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#DCE7F3] space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-black text-base text-[#1A3A5F] flex items-center gap-2">
                <Award className="w-5 h-5 text-[#1F5AAA]" />
                كشف درجات طلابي ({formatArabicSchoolName(session.schoolName, session.schoolId)} - {['1','2','3','4','5','6','7','8','9','10','11','12'].includes(String(teacherGrade)) ? (teacherGrade === '8' ? 'الصف الثامن' : teacherGrade === '7' ? 'الصف السابع' : teacherGrade === '9' ? 'الصف التاسع' : `الصف ${teacherGrade}`) : `الصف ${teacherGrade}`})
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                رصد ومتابعة درجات مادة {session.subject || 'العلوم'} مع أرشفة وترحيل شهري مستقل وبدء كشوفات نظيفة
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Month Selector */}
              <div className="flex items-center gap-1.5 bg-[#F4F8FC] px-2.5 py-1.5 rounded-xl border border-[#DCE7F3]">
                <Calendar className="w-4 h-4 text-[#1F5AAA]" />
                <span className="text-xs font-bold text-[#1A3A5F]">الشهر:</span>
                <select
                  value={selectedMonthView}
                  onChange={(e) => setSelectedMonthView(e.target.value)}
                  className="bg-white px-2.5 py-1 rounded-lg border border-[#DCE7F3] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] cursor-pointer"
                >
                  <option value="active">الشهر الحالي: {activeMonth} (نشط / حي)</option>
                  {archivedGradebooks.length > 0 && (
                    <optgroup label="الأشهر المؤرشفة السابقة">
                      {archivedGradebooks.map((arc) => (
                        <option key={arc.id} value={arc.id}>
                          شهر {arc.month} (مؤرشف - {arc.archivedAt})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Archive and Rollover Button (Only in Active view) */}
              {!isViewingArchive && (
                <button
                  type="button"
                  onClick={() => setShowArchiveConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black transition shadow-sm cursor-pointer border border-[#194B91]"
                  title="أرشفة درجات الشهر الحالي وترحيلها وبدء كشف جديد للشهر القادم"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>أرشفة وترحيل شهر ({activeMonth})</span>
                </button>
              )}

            </div>
          </div>

          {/* Archived Month Notice Banner */}
          {isViewingArchive && selectedArchive && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 shadow-sm">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-700" />
                <span>
                  أنت تستعرض <strong>كشف درجات مؤرشف ومعتمد لشهر ({selectedArchive.month})</strong> — رُحّل وأُرشِف بتاريخ <strong>{selectedArchive.archivedAt}</strong> — متوسط الصف: <strong>{selectedArchive.averagePercentage}%</strong> ({selectedArchive.totalStudents} طالب)
                </span>
              </div>
              <button
                onClick={() => setSelectedMonthView('active')}
                className="px-3 py-1 bg-white hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                العودة للكشف النشط ({activeMonth})
              </button>
            </div>
          )}

          {/* Active Month Status Banner */}
          {!isViewingArchive && (
            <div className="bg-[#EEF5FC] border border-[#C6DCF2] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#1A3A5F]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1F5AAA]" />
                <span>
                  الكشف النشط لشهر <strong className="text-[#1F5AAA]">({activeMonth})</strong> — يتم رصد التسليمات والدرجات حيّاً. عند نهاية الشهر اضغط زر <strong>&quot;أرشفة وترحيل شهر ({activeMonth})&quot;</strong> لتجميده وبدء كشف نظيف للشهر القادم.
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white text-[#1F5AAA] border border-[#C6DCF2]">
                {displayedRoster.length} طلاب مسجلين
              </span>
            </div>
          )}

          {/* PDF Export Button ABOVE & OUTSIDE Horizontal Scroll */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
            <h4 className="text-sm font-black text-[#1A3A5F]">
              جدول كشف الدرجات
            </h4>
            <button
              type="button"
              onClick={() => setShowPdfModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black transition shadow-sm cursor-pointer shrink-0 border border-[#194B91]"
              title="تصدير كشف درجات ملون ومنسق A4 كملف PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل كشف PDF</span>
            </button>
          </div>

          {/* Horizontal Scroll Table Container with Sticky Student Name & Left/Right Arrows */}
          <div className="rounded-2xl bg-[#F4F8FC] border border-[#DCE7F3] p-2 sm:p-3 relative">
            {/* Right Scroll Arrow */}
            <button
              type="button"
              onClick={() => scrollGradebookTable('right')}
              aria-label="تمرير لليمين"
              className="w-7 h-7 rounded-full bg-white hover:bg-[#EEF5FC] border border-[#C6DCF2] text-[#1F5AAA] flex items-center justify-center shadow-sm absolute right-1.5 top-1/2 -translate-y-1/2 z-30 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Left Scroll Arrow */}
            <button
              type="button"
              onClick={() => scrollGradebookTable('left')}
              aria-label="تمرير لليسار"
              className="w-7 h-7 rounded-full bg-white hover:bg-[#EEF5FC] border border-[#C6DCF2] text-[#1F5AAA] flex items-center justify-center shadow-sm absolute left-1.5 top-1/2 -translate-y-1/2 z-30 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>

            {/* Inner Horizontal Scroll Wrapper */}
            <div
              ref={gradebookTableScrollRef}
              className="overflow-x-auto mx-6 sm:mx-7 rounded-xl bg-white border border-[#DCE7F3]"
            >
              <table dir="rtl" className="w-full min-w-[560px] text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1F5AAA] text-white font-black border-b border-[#194B91]">
                    <th className="sticky right-0 z-20 bg-[#1F5AAA] p-2.5 sm:p-3 min-w-[120px] sm:min-w-[145px] border-l border-[#3771BD] whitespace-nowrap">
                      اسم الطالب
                    </th>
                    <th className="p-3 text-center whitespace-nowrap">الشهر</th>
                    <th className="p-3 text-center whitespace-nowrap">عدد التسليمات</th>
                    <th className="p-3 text-center whitespace-nowrap">المجموع</th>
                    <th className="p-3 text-center whitespace-nowrap">النسبة%</th>
                    <th className="p-3 text-center whitespace-nowrap">التقدير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {displayedRoster.map((s, sIdx) => {
                    let badgeBg = 'bg-rose-50 text-rose-800 border-rose-200';
                    let badgeText = 'ضعيف (هـ)';
                    if (s.percentage >= 95) {
                      badgeBg = 'bg-emerald-50 text-emerald-900 border-emerald-200';
                      badgeText = 'ممتاز (أ)';
                    } else if (s.percentage >= 85) {
                      badgeBg = 'bg-[#EEF5FC] text-[#1F5AAA] border-[#C6DCF2]';
                      badgeText = 'جيد جداً (ب)';
                    } else if (s.percentage >= 70) {
                      badgeBg = 'bg-amber-50 text-amber-900 border-amber-200';
                      badgeText = 'جيد (ج)';
                    } else if (s.percentage >= 50) {
                      badgeBg = 'bg-orange-50 text-orange-900 border-orange-200';
                      badgeText = 'مقبول (د)';
                    }

                    return (
                      <tr key={s.code ? `student-grade-${s.code}-${sIdx}` : `student-grade-idx-${sIdx}`} className="hover:bg-[#F8FAFD] transition">
                        <td className="sticky right-0 z-10 bg-white p-3 font-bold text-[#1A3A5F] border-l border-slate-200 whitespace-nowrap">
                          {s.name}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${isViewingArchive ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-[#EEF5FC] text-[#1F5AAA] border-[#C6DCF2]'}`}>
                            {isViewingArchive ? `${selectedArchive?.month} (مؤرشف)` : `${activeMonth} (الشهر الحالي)`}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#F4F8FC] text-[#1A3A5F] border border-[#DCE7F3]">
                            {s.submissionsCount} تسليم
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-[#1A3A5F] whitespace-nowrap">
                          {s.totalEarned} / {s.totalPossible}
                        </td>
                        <td className="p-3 text-center font-mono font-black text-sm text-[#1F5AAA] whitespace-nowrap">
                          {s.percentage}%
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeBg}`}>
                            {badgeText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-600 font-semibold">
            <MoveHorizontal className="w-3.5 h-3.5 text-slate-600" />
            <span>اسحب أفقياً لعرض المزيد</span>
          </div>

          {/* Modal: Confirm Month Archive & Rollover */}
          {showArchiveConfirm && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 shadow-xl border border-[#DCE7F3] animate-in fade-in zoom-in-95 text-right font-['Cairo']">
                <div className="w-12 h-12 rounded-2xl bg-[#EEF5FC] text-[#1F5AAA] flex items-center justify-center mx-auto mb-4 border border-[#C6DCF2]">
                  <Archive className="w-6 h-6" />
                </div>
                <h3 className="text-base font-black text-center text-[#1A3A5F] mb-2">
                  أرشفة وترحيل درجات شهر ({activeMonth})
                </h3>
                <p className="text-xs text-slate-700 text-center leading-relaxed mb-6">
                  هل أنت متأكد من أرشفة وترحيل كشف درجات شهر <strong className="text-[#1F5AAA]">({activeMonth})</strong>؟
                  <br />
                  سيتم تجميد وحفظ جميع درجات الطلاب الحالية في وثيقة أرشيف معتمدة للشهر في النظام، وبدء كشف درجات نظيف وجديد للشهر القادم.
                </p>

                <div className="flex items-center flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={handleArchiveAndRollover}
                    disabled={isArchiving}
                    className="flex-1 py-2.5 px-4 bg-[#1F5AAA] hover:bg-[#194B91] text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-sm border border-[#194B91]"
                  >
                    {isArchiving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري الأرشفة والترحيل...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تأكيد الأرشفة وبدء شهر جديد</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(false)}
                    disabled={isArchiving}
                    className="py-2.5 px-4 bg-[#F4F8FC] hover:bg-[#E8F1FB] text-[#1A3A5F] border border-[#DCE7F3] rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: PDF A4 Grade Sheet Export & Print */}
          <GradeSheetPdfModal
            isOpen={showPdfModal}
            onClose={() => setShowPdfModal(false)}
            roster={displayedRoster}
            schoolName={formatArabicSchoolName(session.schoolName, session.schoolId)}
            teacherName={session.name}
            subject={session.subject || 'العلوم'}
            gradeLabel={teacherGradeLabel}
            monthLabel={isViewingArchive ? (selectedArchive?.month || 'مؤرشف') : activeMonth}
            isArchive={isViewingArchive}
            archiveDate={selectedArchive?.archivedAt}
          />
        </div>
      )}


      {/* TAB 4: CIRCULARS */}
      {activeTab === 'announcements' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-[#DCE7F3] flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-sm sm:text-base text-[#1A3A5F] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                <span>التعاميم والتوجيهات الإدارية الموجهة للمعلمين</span>
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-0.5">
                اضغط على التعميم لتمييزه كمقروء وتقليل شارة التنبيهات
              </p>
            </div>

            <span className="px-3 py-1.5 rounded-xl bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-bold shrink-0">
              {teacherCirculars.length} تعاميم معتمدة
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teacherCirculars.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-slate-600 font-bold text-xs sm:text-sm">
                لا توجد تعاميم مرسلة من مدير المدرسة حالياً
              </div>
            ) : (
              teacherCirculars.map((anc, ancIdx) => {
                const displaySender =
                  anc.senderName && !isGenericPrincipalSender(anc.senderName)
                    ? anc.senderName
                    : getSchoolPrincipalName(anc.schoolId || session.schoolId, session.schoolName);
                return (
                  <div
                    key={anc.id ? `anc-${anc.id}-${ancIdx}` : `anc-idx-${ancIdx}`}
                    onClick={() => {
                      if (!anc.isRead) {
                        setTeacherCirculars((prev) =>
                          prev.map((c) => (c.id === anc.id ? { ...c, isRead: true } : c))
                        );
                      }
                    }}
                    className={`rounded-2xl p-5 border shadow-sm flex flex-col justify-between transition cursor-pointer ${
                      anc.isRead
                        ? 'bg-white border-[#DCE7F3]'
                        : 'bg-[#F4F8FD] border-2 border-[#9BBEDF]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {!anc.isRead && (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#1F5AAA] animate-pulse" title="تعميم جديد غير مقروء" />
                          )}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
                              anc.priority === 'عاجل'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]'
                            }`}
                          >
                            {anc.priority}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-600 font-semibold">{anc.createdAt}</span>
                      </div>

                      <h4 className="font-black text-sm mb-1 text-[#1A3A5F]">
                        {anc.title}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed mb-3 font-medium">{anc.content}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 flex items-center justify-between flex-wrap gap-1.5 font-semibold">
                      <span>صادر عن: {displaySender}</span>
                      {!anc.isRead && (
                        <span className="text-[11px] text-[#1F5AAA] font-black">انقر للتمييز كمقروء ✓</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB: FIXED TERM 1 WEEKLY SCHEDULE (Strictly classes taught by this teacher) */}
      {activeTab === 'schedule' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-[#DCE7F3] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-base text-[#1A3A5F] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                <span>جدول الحصص الأسبوعي — الترم الأول (للصفوف التي تدرسها فقط)</span>
              </h3>
              <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                جداول ثابتة ومعتمدة من مدير المدرسة (حصة أولى – سادسة | السبت – الأربعاء) • يتم تمييز حصصك تلقائياً
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('create_question')}
              className="px-3.5 py-2 rounded-xl bg-[#EEF5FC] hover:bg-[#DCEAF9] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة لبنك الأسئلة</span>
            </button>
          </div>

          {teacherTaughtSchedules.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2 shadow-sm">
              <Calendar className="w-10 h-10 text-[#9BBEDF] mx-auto" />
              <h4 className="font-black text-sm text-[#1A3A5F]">
                لا يوجد جدول حصص معتمد للصفوف التي تدرسها حالياً
              </h4>
              <p className="text-xs text-[#5C7085] font-semibold max-w-md mx-auto leading-relaxed">
                يرفع المشرف جدول الحصص الأسبوعي للترم الأول ويتم اعتماده من مدير المدرسة، وسيظهر هنا تلقائياً فور اعتماده (مع عزل جداول بقية الصفوف).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {teacherTaughtSchedules.map((sch) => (
                <div
                  key={sch.id}
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-sm"
                >
                  <ScheduleGridView
                    entries={sch.entries}
                    title={`${sch.gradeLabel} — فصل ${sch.classNumber}`}
                    subtitle={`الترم ${sch.term} • رفعه المشرف: ${sch.uploadedBy} • اعتمده: ${sch.approvedBy || 'مدير المدرسة'}`}
                    highlightTeacherName={session.name}
                    highlightSubject={teacherSubject}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FLOATING BOTTOM NAVIGATION BAR (Pure White & Calm Azure Active State matching reference) */}
      <nav
        aria-label="التنقل السفلي"
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-xl z-40"
      >
        <div className="rounded-[24px] sm:rounded-[28px] bg-white/95 backdrop-blur-md border border-[#DCE7F3] shadow-[0_-4px_20px_rgba(26,58,95,0.08)] p-1 sm:p-1.5 grid grid-cols-4 gap-1 items-center text-center">
          {/* Tab 1: إضافة سؤال */}
          <button
            type="button"
            onClick={() => setActiveTab('create_question')}
            className={`min-h-[48px] py-1.5 px-1 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 transition-all cursor-pointer ${
              activeTab === 'create_question' && !isRecommendationsModalOpen
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-tight text-center whitespace-normal sm:whitespace-nowrap">إضافة سؤال</span>
          </button>

          {/* Tab 2: كشف درجات طلابي */}
          <button
            type="button"
            onClick={() => setActiveTab('gradebook')}
            className={`min-h-[48px] py-1.5 px-1 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 transition-all cursor-pointer ${
              activeTab === 'gradebook' && !isRecommendationsModalOpen
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <Award className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-tight text-center whitespace-normal sm:whitespace-nowrap">كشف درجات طلابي</span>
          </button>

          {/* Tab 3: التعاميم */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('announcements');
              setTeacherCirculars((prev) => prev.map((c) => ({ ...c, isRead: true })));
            }}
            className={`min-h-[48px] py-1.5 px-1 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 relative transition-all cursor-pointer ${
              activeTab === 'announcements' && !isRecommendationsModalOpen
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <div className="relative flex items-center">
              <FileText className="w-4 h-4 shrink-0" />
              {unreadCircularsCount > 0 && (
                <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center border border-white">
                  {unreadCircularsCount}
                </span>
              )}
            </div>
            <span className="text-[11px] sm:text-xs leading-tight text-center whitespace-normal sm:whitespace-nowrap">التعاميم</span>
          </button>

          {/* Tab 4: توصياتي */}
          <button
            type="button"
            onClick={() => setIsRecommendationsModalOpen(true)}
            className={`min-h-[48px] py-1.5 px-1 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 transition-all cursor-pointer ${
              isRecommendationsModalOpen
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-tight text-center whitespace-normal sm:whitespace-nowrap">توصياتي</span>
          </button>
        </div>
      </nav>

      {/* Unified Right RTL Sidebar Drawer */}
      <UnifiedSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        session={session}
        activeView={activeSidebarView}
        onSelectView={handleSelectSidebarView}
        onOpenRecommendations={() => setIsRecommendationsModalOpen(true)}
      />

      {/* Teacher Recommendation Luxury Frosted Glass Modal */}
      <TeacherRecommendationModal
        isOpen={isRecommendationsModalOpen}
        onClose={() => setIsRecommendationsModalOpen(false)}
        session={session}
      />
    </div>
    </div>
  );
};
