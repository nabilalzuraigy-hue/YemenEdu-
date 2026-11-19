import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  GraduationCap,
  CheckCircle2,
  XCircle,
  Camera,
  Eye,
  Clock,
  Award,
  ChevronLeft,
  Send,
  Lock,
  FileText,
  Megaphone,
  School,
  User,
  Sparkles,
  Bell,
  Image as ImageIcon,
  Calendar,
  Archive,
  History,
  RefreshCw,
  Folder,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { collection, query, where, onSnapshot, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { authService, UserSession, getSubjectsForGrade, cleanFirestorePayload } from '../services/authService';
import {
  appDataService,
  Question,
  Announcement,
  AttendanceRecord,
  AttendanceStatus,
  GradeRecord,
  HomeworkSubmission,
  isObjectiveQuestion,
  isEssayQuestion,
  formatArabicDateTime,
  getQuestionTimestamp,
  ACADEMIC_MONTHS,
  getCurrentAcademicMonth,
  MonthlyGradebookRecord,
  MonthlyGradebookStudent,
  MonthlyHomeworkArchiveBatch,
  SchoolActivityArchiveBatch,
  SchoolActivityArchiveItem,
  SupervisorActivity,
  getSchoolActivityTimestamp,
  isSchoolActivityArchivedForWeek,
  isQuestionArchivedForStudentWeek,
  getHomeworkArchiveCutoffInfo,
  TeacherRecommendation,
  ClassSchedule,
} from '../services/appData';
import { UnifiedSidebar, StudentArchiveSection } from '../components/UnifiedSidebar';
import { StudentArchiveModal } from '../components/StudentArchiveModal';
import { StudentAccountModal } from '../components/StudentAccountModal';
import { ScheduleGridView } from '../components/ScheduleGridView';
import { SchoolBoardView } from '../components/SchoolBoardView';
import { playGentleNotificationSound, unlockNotificationAudio } from '../services/soundUtils';
import { formatArabicSchoolName, getSchoolPrincipalName, isGenericPrincipalSender, isSimulationAnnouncement } from '../utils/schoolDisplay';
import { compressImageFile } from '../utils/imageCompression';

interface StudentOwnAttendanceItem {
  id: string;
  date: string;
  gradeLabel: string;
  classNumber: string;
  status: AttendanceStatus;
  note?: string;
  recordedBy: string;
}

const normalizeArabicStudentKey = (value?: string): string => {
  if (!value) return '';
  return value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^(الطالب|الطالبه|طالبه|طالب)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const extractStudentOwnAttendance = (
  records: AttendanceRecord[],
  studentName?: string,
  studentCode?: string,
  studentGrade?: string
): StudentOwnAttendanceItem[] => {
  const normName = normalizeArabicStudentKey(studentName);
  const normCode = (studentCode || '').trim().toLowerCase();
  const targetGrade = String(studentGrade || '').trim();
  const nameTokens = normName.split(' ').filter((t) => t.length > 1);

  const isThisStudent = (entryName?: string): boolean => {
    const candidate = normalizeArabicStudentKey(entryName);
    if (!candidate) return false;
    if (normCode && candidate === normCode) return true;
    if (!normName) return false;
    if (candidate === normName) return true;
    // Match if full student name tokens (at least first + second/last name) all appear in candidate
    if (nameTokens.length >= 2) {
      return nameTokens.slice(0, 2).every((tok) => candidate.includes(tok));
    }
    return false;
  };

  return records
    .filter((r) => {
      if (r.approvalStatus !== 'approved') return false;
      if (targetGrade && String(r.grade).trim() !== targetGrade) return false;
      return true;
    })
    .reduce<StudentOwnAttendanceItem[]>((acc, rec) => {
      const ownEntry = (rec.entries || []).find((e) => isThisStudent(e.studentName));
      if (ownEntry) {
        acc.push({
          id: rec.id,
          date: rec.date,
          gradeLabel: rec.gradeLabel,
          classNumber: rec.classNumber || '1',
          status: ownEntry.status === 'غائب' ? 'غائب بدون عذر' : ownEntry.status,
          note: ownEntry.note,
          recordedBy: rec.recordedBy,
        });
      }
      return acc;
    }, [])
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
};

interface StudentDashboardProps {
  session: UserSession;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ session }) => {
  const currentUser = session;
  const studentGrade = session.grade || session.class || '8';
  const studentClass = session.class || session.grade || '8';
  const getGradeTitle = (g: string) => {
    const map: Record<string, string> = {
      '1': 'الصف الأول الأساسي',
      '2': 'الصف الثاني الأساسي',
      '3': 'الصف الثالث الأساسي',
      '4': 'الصف الرابع الأساسي',
      '5': 'الصف الخامس الأساسي',
      '6': 'الصف السادس الأساسي',
      '7': 'الصف السابع الأساسي',
      '8': 'الصف الثامن الأساسي',
      '9': 'الصف التاسع الأساسي (الشهادة العامة)',
      '10': 'الصف العاشر (الأول الثانوي)',
      '11': 'الصف الحادي عشر (الثاني الثانوي)',
      '12': 'الصف الثاني عشر (الثالث الثانوي)',
    };
    return map[g] || `الصف ${g}`;
  };
  const gradeLabel = getGradeTitle(studentGrade);

  // 5 Bottom Tabs: 'school_board' (لوحة المدرسة) | 'homework' (واجباتي) | 'announcements' (التعاميم) | 'grades' (درجاتي) | 'recommendations' (توصيات المعلم) + 'schedule' & private 'attendance' view
  const [navTab, setNavTab] = useState<'school_board' | 'homework' | 'announcements' | 'grades' | 'recommendations' | 'account' | 'schedule' | 'attendance'>('school_board');
  const [approvedGradeSchedules, setApprovedGradeSchedules] = useState<ClassSchedule[]>(() =>
    session.schoolId
      ? appDataService
          .getClassSchedules(session.schoolId)
          .filter((s) => s.isApproved && String(s.grade).trim() === String(studentGrade).trim())
      : []
  );
  // Strictly isolated personal attendance: ONLY this student's own approved records (never classmates)
  const [myAttendanceLogs, setMyAttendanceLogs] = useState<StudentOwnAttendanceItem[]>(() =>
    session.schoolId
      ? extractStudentOwnAttendance(
          appDataService.getAttendanceRecords(session.schoolId),
          session.name,
          session.code,
          studentGrade
        )
      : []
  );

  // Left Sidebar & Modal States
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [activeArchiveModal, setActiveArchiveModal] = useState<StudentArchiveSection | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [selectedRecSubject, setSelectedRecSubject] = useState<string>('الكل');
  const [selectedHomeworkSubject, setSelectedHomeworkSubject] = useState<string>('الكل');

  // Real-time Firestore Synchronized Data
  const subjects = getSubjectsForGrade(studentGrade);
  const [rawClassQuestions, setRawClassQuestions] = useState<Question[]>(() =>
    session.schoolId ? appDataService.getQuestions(studentGrade as any, undefined, session.schoolId) : []
  );
  const [archivedHomeworkBatches, setArchivedHomeworkBatches] = useState<MonthlyHomeworkArchiveBatch[]>([]);
  const [archivedSchoolActivityBatches, setArchivedSchoolActivityBatches] = useState<SchoolActivityArchiveBatch[]>([]);
  const [approvedSchoolActivities, setApprovedSchoolActivities] = useState<SupervisorActivity[]>(() =>
    session.schoolId
      ? appDataService.getSupervisorActivities(session.schoolId).filter((a) => a.approvalStatus === 'approved')
      : []
  );
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [announcements, setAnnouncements] = useState<Announcement[]>(() =>
    session.schoolId ? appDataService.getAnnouncements('student', session.schoolId) : []
  );
  const [homeworkCount, setHomeworkCount] = useState<number>(0);
  const [announcementCount, setAnnouncementCount] = useState<number>(0);
  const [studentGrades, setStudentGrades] = useState<GradeRecord[]>(() =>
    session.schoolId ? appDataService.getGrades(session.code, undefined, session.schoolId) : []
  );
  const [studentSubmissions, setStudentSubmissions] = useState<HomeworkSubmission[]>(() =>
    session.schoolId ? appDataService.getSubmissions(session.code, undefined, undefined, session.schoolId) : []
  );
  const [recommendations, setRecommendations] = useState<TeacherRecommendation[]>(() =>
    session.schoolId
      ? appDataService.getRecommendations(session.schoolId, studentGrade, undefined, {
          viewerStudentCode: session.code,
        })
      : []
  );

  // Monthly Gradebook & Archive Rollover State
  const [activeMonth, setActiveMonth] = useState<string>(() => getCurrentAcademicMonth());
  const [rolloverTimestamp, setRolloverTimestamp] = useState<number>(0);
  const [selectedGradeMonth, setSelectedGradeMonth] = useState<string>('active'); // 'active' or archived recordId
  const [selectedGradeSubject, setSelectedGradeSubject] = useState<string>('الكل');
  const [archivedGradebooks, setArchivedGradebooks] = useState<MonthlyGradebookRecord[]>([]);

  const rolloverTimestampRef = useRef<number>(0);
  rolloverTimestampRef.current = rolloverTimestamp;

  // Quiz Solver State & Recently Answered Grace Window
  const [userAnswers, setUserAnswers] = useState<Record<string, any>>({});
  const [answeredState, setAnsweredState] = useState<Record<string, boolean>>({});
  const [recentlyClosedQIds, setRecentlyClosedQIds] = useState<Record<string, boolean>>({});

  // Periodic tick every 60s so Thursday auto-archiving runs seamlessly while portal is open
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Active grades and submissions strictly for the current active month
  const activeGrades = useMemo(() => {
    const cutoff = rolloverTimestamp || 0;
    return studentGrades.filter((g) => {
      if (cutoff > 0) {
        const ts = (g as any).timestamp || getQuestionTimestamp(g) || 0;
        return ts >= cutoff;
      }
      return true;
    });
  }, [studentGrades, rolloverTimestamp]);

  const activeSubmissions = useMemo(() => {
    const cutoff = rolloverTimestamp || 0;
    return studentSubmissions.filter((s) => {
      if (cutoff > 0) {
        const ts = (s as any).timestamp || getQuestionTimestamp(s) || 0;
        return ts >= cutoff;
      }
      return true;
    });
  }, [studentSubmissions, rolloverTimestamp]);

  // Construct answeredMap of questions that are finalized and closed in the active month
  const answeredMap = useMemo(() => {
    const map = new Map<string, { isClosed: boolean; score: number; maxScore: number; selectedOption?: any }>();

    // 1. From Firestore Grades (active month only)
    activeGrades.forEach((g) => {
      if (g.questionId) {
        map.set(g.questionId, {
          isClosed: true,
          score: Number(g.score !== undefined ? g.score : (g.obtained || 0)),
          maxScore: Number(g.maxScore || g.total || 5),
        });
      }
    });

    // 2. From Submissions (active month only): Only closed IF teacher has graded it!
    activeSubmissions.forEach((s) => {
      if (s.questionId && (s.status === 'graded' || s.status === 'تم التصحيح')) {
        map.set(s.questionId, {
          isClosed: true,
          score: typeof s.score === 'number' ? s.score : 0,
          maxScore: s.maxScore || 5,
          selectedOption: s.selectedOption,
        });
      }
    });

    // 3. From local active React state (only objective answers answered in current session)
    Object.keys(answeredState).forEach((qId) => {
      if (!map.has(qId)) {
        map.set(qId, {
          isClosed: true,
          score: userAnswers[qId] !== undefined ? 5 : 0,
          maxScore: 5,
          selectedOption: userAnswers[qId],
        });
      }
    });

    return map;
  }, [activeGrades, activeSubmissions, answeredState, userAnswers]);

  // Set of question IDs that the student has answered AND that are locked/closed
  const closedQuestionIds = useMemo(() => {
    const set = new Set<string>();
    rawClassQuestions.forEach((q) => {
      if (!q.id) return;
      const matchingSub = activeSubmissions.find(
        (s) => s.questionId === q.id || (s.title && (s.title === q.questionText || s.title === q.text))
      );
      const isGraded = Boolean(
        matchingSub && (matchingSub.status === 'تم التصحيح' || matchingSub.status === 'graded')
      );
      const isClosed = answeredMap.has(q.id) || Boolean(answeredState[q.id]) || isGraded;
      if (isClosed) {
        set.add(q.id);
      }
    });
    return set;
  }, [rawClassQuestions, activeSubmissions, answeredMap, answeredState]);

  // Only archive questions whose Thursday cutoff passed AND are answered/closed (late unanswered questions remain in واجباتي)
  const questions = useMemo(() => {
    const cutoff = rolloverTimestamp || 0;
    return rawClassQuestions.filter((q) => {
      if (cutoff > 0) {
        const ts = (q as any).timestamp || getQuestionTimestamp(q) || 0;
        if (ts < cutoff) return false;
      }
      const isPastThursday = isQuestionArchivedForStudentWeek(q, nowTick);
      const isClosed = q.id ? closedQuestionIds.has(q.id) : false;
      const isShowingFeedback = q.id ? Boolean(recentlyClosedQIds[q.id]) : false;
      if (isPastThursday && isClosed && !isShowingFeedback) {
        return false;
      }
      return true;
    });
  }, [rawClassQuestions, rolloverTimestamp, nowTick, closedQuestionIds, recentlyClosedQIds]);

  // Keep Firestore per-student monthly homework archive synced with closed & Thursday-due questions
  useEffect(() => {
    if (!currentUser?.schoolId || !session.code || rawClassQuestions.length === 0 || closedQuestionIds.size === 0) return;
    appDataService
      .syncThursdayMonthlyHomeworkArchive(
        currentUser.schoolId,
        studentGrade,
        session.code,
        rawClassQuestions,
        closedQuestionIds,
        nowTick
      )
      .catch(() => {});
  }, [currentUser?.schoolId, studentGrade, session.code, rawClassQuestions, closedQuestionIds, nowTick]);

  // Merge Firestore archived homework batches with locally-computed closed Thursday batches
  const combinedArchivedHomeworkBatches = useMemo(() => {
    const byId = new Map<string, MonthlyHomeworkArchiveBatch>();
    archivedHomeworkBatches.forEach((b) => byId.set(b.id, b));

    rawClassQuestions.forEach((q) => {
      if (!q.id || !closedQuestionIds.has(q.id)) return;
      const ts = getQuestionTimestamp(q);
      if (!ts || !isQuestionArchivedForStudentWeek(q, nowTick)) return;
      const info = getHomeworkArchiveCutoffInfo(ts);
      const batchId = `hw_${session.schoolId}_${session.code}_${info.thursdayKey}`;
      const existing = byId.get(batchId);
      const item = {
        id: q.id,
        subject: (q.subject || 'المادة').trim(),
        type: q.type,
        questionText: (q.questionText || q.text || '').trim(),
        options: Array.isArray(q.options) ? q.options : undefined,
        correctOption: q.correctOption,
        correctIndex: q.correctIndex,
        points: Number(q.points || 5),
        teacherName: (q.teacherName || 'معلم المادة').trim(),
        grade: String(q.grade || q.class || studentGrade),
        class: String(q.class || q.grade || studentGrade),
        timestamp: ts,
        createdAt: q.createdAt,
        createdAtFormatted: q.createdAtFormatted || formatArabicDateTime(ts),
      };
      if (existing) {
        if (!existing.questions.some((x) => x.id === item.id)) {
          byId.set(batchId, {
            ...existing,
            questions: [item, ...existing.questions].sort((a, b) => b.timestamp - a.timestamp),
            questionsCount: existing.questions.length + 1,
          });
        }
      } else {
        byId.set(batchId, {
          id: batchId,
          recordType: 'monthly_homework_archive',
          schoolId: session.schoolId || '',
          studentCode: session.code,
          grade: String(studentGrade),
          thursdayKey: info.thursdayKey,
          weekLabel: info.weekLabel,
          year: info.year,
          monthName: info.monthName,
          archivedAt: info.thuDate.toLocaleDateString('ar-YE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          archivedTimestamp: info.archiveAtMs,
          autoArchived: true,
          questionsCount: 1,
          questions: [item],
        });
      }
    });

    return Array.from(byId.values()).sort(
      (a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)
    );
  }, [archivedHomeworkBatches, rawClassQuestions, closedQuestionIds, nowTick, session.schoolId, session.code, studentGrade]);

  // Keep Firestore Thursday weekly School Activities Archive synced and merged with past-week approved activities
  useEffect(() => {
    if (!currentUser?.schoolId || approvedSchoolActivities.length === 0) return;
    appDataService
      .syncThursdaySchoolActivitiesArchive(currentUser.schoolId, approvedSchoolActivities, nowTick)
      .catch(() => {});
  }, [currentUser?.schoolId, approvedSchoolActivities, nowTick]);

  const combinedSchoolActivityArchives = useMemo(() => {
    const byId = new Map<string, SchoolActivityArchiveBatch>();
    archivedSchoolActivityBatches.forEach((b) => byId.set(b.id, b));

    approvedSchoolActivities.forEach((act) => {
      if (!isSchoolActivityArchivedForWeek(act, nowTick)) return;
      const ts = getSchoolActivityTimestamp(act);
      if (!ts) return;
      const info = getHomeworkArchiveCutoffInfo(ts);
      const batchId = `sa_${session.schoolId}_${info.thursdayKey}`;
      const existing = byId.get(batchId);
      const imgs = Array.isArray(act.images) ? act.images : [];
      const item: SchoolActivityArchiveItem = {
        id: act.id,
        title: (act.title || '').trim(),
        category: act.category,
        subType: act.subType,
        formalText: (act.formalText || act.details || '').trim(),
        targetGrade: act.targetGrade || 'الكل',
        targetClass: act.targetClass || 'الكل',
        activityDate: act.activityDate || '',
        createdBy: act.createdBy || 'المشرف',
        approvedBy: act.approvedBy || 'مدير المدرسة',
        coverImage: imgs[0],
        imagesCount: imgs.length,
        inputType: act.inputType,
        timestamp: ts,
        dateLabel: new Date(ts).toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        timeLabel: formatArabicDateTime(ts),
      };

      if (existing) {
        if (!existing.activities.some((x) => x.id === item.id)) {
          byId.set(batchId, {
            ...existing,
            activities: [item, ...existing.activities].sort((a, b) => b.timestamp - a.timestamp),
            activitiesCount: existing.activities.length + 1,
          });
        }
      } else {
        byId.set(batchId, {
          id: batchId,
          recordType: 'school_activities_archive',
          schoolId: session.schoolId || '',
          thursdayKey: info.thursdayKey,
          weekLabel: info.weekLabel,
          year: info.year,
          monthName: info.monthName,
          archivedAt: info.thuDate.toLocaleDateString('ar-YE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          archivedTimestamp: info.archiveAtMs,
          autoArchived: true,
          activitiesCount: 1,
          activities: [item],
        });
      }
    });

    return Array.from(byId.values()).sort(
      (a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)
    );
  }, [archivedSchoolActivityBatches, approvedSchoolActivities, nowTick, session.schoolId]);

  // Persistent Read/Seen Tracking for Unread Badges (التعاميم / التوصيات / الدرجات)
  const seenAnnStorageKey = `azal_seen_ann_${session.schoolId}_${session.code}`;
  const seenRecStorageKey = `azal_seen_rec_${session.schoolId}_${session.code}`;
  const seenGradeStorageKey = `azal_seen_grades_${session.schoolId}_${session.code}`;

  const loadSeenIds = (storageKey: string): Set<string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set<string>(parsed.map(String)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  };

  const saveSeenIds = (storageKey: string, ids: Set<string>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(ids).slice(-500)));
    } catch {
      // ignore storage quota errors
    }
  };

  const [seenAnnouncementIds, setSeenAnnouncementIds] = useState<Set<string>>(() =>
    loadSeenIds(seenAnnStorageKey)
  );
  const [seenRecommendationIds, setSeenRecommendationIds] = useState<Set<string>>(() =>
    loadSeenIds(seenRecStorageKey)
  );
  const [seenGradeIds, setSeenGradeIds] = useState<Set<string>>(() =>
    loadSeenIds(seenGradeStorageKey)
  );

  const sessionSelfAnsweredQIdsRef = useRef<Set<string>>(new Set());
  const notifiedQuestionIdsRef = useRef<Set<string>>(new Set());
  const notifiedAnnouncementIdsRef = useRef<Set<string>>(new Set());
  const notifiedRecommendationIdsRef = useRef<Set<string>>(new Set());
  const notifiedGradeIdsRef = useRef<Set<string>>(new Set());
  const soundCooldownTimerRef = useRef<number | null>(null);

  const triggerSoundAlert = () => {
    if (soundCooldownTimerRef.current !== null) return;
    playGentleNotificationSound();
    soundCooldownTimerRef.current = window.setTimeout(() => {
      soundCooldownTimerRef.current = null;
    }, 550);
  };

  // Unlock browser AudioContext on any user interaction
  useEffect(() => {
    const handleUnlock = () => unlockNotificationAudio();
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, []);

  // Listen for toggle-sidebar events from Header
  useEffect(() => {
    const handleToggle = () => setIsSidebarOpen((prev) => !prev);
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, []);

  useEffect(() => {
    if (!currentUser?.schoolId) return;

    // 1. AppData local sync
    const unsubAppData = appDataService.subscribe(() => {
      setStudentSubmissions(appDataService.getSubmissions(session.code, undefined, undefined, session.schoolId));
      setRecommendations(
        appDataService.getRecommendations(session.schoolId, studentGrade, undefined, {
          viewerStudentCode: session.code,
        })
      );
    });

    // 2. Direct Firestore query: Questions strictly scoped to this school & class (unlimited, all subjects)
    let unsubQuestions = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const normalizedSchool = currentUser.schoolId.trim().toLowerCase();
      const qQuestions = query(
        collection(db, 'questions'),
        where('schoolId', '==', currentUser.schoolId),
        where('class', '==', studentClass),
        where('isPublished', '==', true)
      );
      unsubQuestions = onSnapshot(
        qQuestions,
        (snap) => {
          if (!snap.empty) {
            const rawList = snap.docs
              .map((d) => ({ ...d.data(), id: d.id } as Question))
              .filter((q) => (q.schoolId || '').trim().toLowerCase() === normalizedSchool);
            // Deduplicate questions by subject + normalized text so different subjects never hide each other
            const seen = new Set<string>();
            const distinct: Question[] = [];
            for (const q of rawList) {
              const textKey = (q.questionText || q.text || '').trim().replace(/\s+/g, ' ').toLowerCase();
              const subjKey = (q.subject || '').trim().toLowerCase();
              const dedupKey = `${subjKey}_${textKey}`;
              if (!seen.has(dedupKey)) {
                seen.add(dedupKey);
                distinct.push(q);
              }
            }
            // Sort newest first (الأحدث فالأحدث)
            distinct.sort((a, b) => getQuestionTimestamp(b) - getQuestionTimestamp(a));
            setRawClassQuestions(distinct);
          } else {
            setRawClassQuestions([]);
          }
        },
        (err) => console.warn('Student questions query notice:', err)
      );
    } catch (_) {}

    // 3. Direct Firestore query: Circulars for this school (target: students or all)
    let unsubCirc = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const qCirc = query(
        collection(db, 'circulars'),
        where('schoolId', '==', currentUser.schoolId),
        where('target', 'in', ['students', 'all'])
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
                    target: data.target || 'students',
                    priority: data.priority || 'عادي',
                    senderName: resolvedSender,
                    senderRoleAr: data.senderRoleAr || 'مدير المدرسة',
                    schoolId: data.schoolId || session.schoolId,
                    createdAt: data.createdAtFormatted || 'الآن',
                    readCount: 1,
                  } as Announcement;
                })
                .filter((a) => !isSimulationAnnouncement(a));
          setAnnouncements(list);
        },
        () => {}
      );
    } catch (_) {}

    // 4. Direct Firestore query: Student Grades (strictly scoped by schoolId & studentCode)
    let unsubGrades = () => {};
    try {
      const normalizedSchool = (currentUser.schoolId || '').trim().toLowerCase();
      const qGrades = query(
        collection(db, 'grades'),
        where('studentCode', '==', session.code)
      );
      unsubGrades = onSnapshot(
        qGrades,
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs
              .map((d) => ({ ...d.data(), id: d.id } as GradeRecord))
              .filter((g) => (g.schoolId || '').trim().toLowerCase() === normalizedSchool);
            setStudentGrades(list);
          } else {
            setStudentGrades(appDataService.getGrades(session.code, undefined, session.schoolId));
          }
        },
        () => {}
      );
    } catch (_) {}

    // 5. Direct Firestore query: Homework Submissions for real-time grading updates (strictly scoped by schoolId)
    let unsubSubmissions = () => {};
    try {
      const normalizedSchool = (currentUser.schoolId || '').trim().toLowerCase();
      const qSubmissions = query(
        collection(db, 'submissions'),
        where('studentCode', '==', session.code)
      );
      unsubSubmissions = onSnapshot(
        qSubmissions,
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs
              .map((d) => ({ ...d.data(), id: d.id } as HomeworkSubmission))
              .filter((s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchool);
            setStudentSubmissions(list);
          } else {
            setStudentSubmissions([]);
          }
        },
        () => {}
      );
    } catch (_) {}

    // 6. Direct Firestore query: Monthly Gradebooks & Rollover Meta
    let unsubGb = () => {};
    try {
      if (!currentUser?.schoolId) return;
      const qGb = query(
        collection(db, 'monthlyGradebooks'),
        where('schoolId', '==', currentUser.schoolId)
      );
      unsubGb = onSnapshot(
        qGb,
        (snap) => {
          if (!snap.empty) {
            const allDocs: any[] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
            const metaDoc = allDocs.find(
              (d: any) =>
                d.id.startsWith(`meta_${currentUser.schoolId}_${studentGrade}`) ||
                d.id.startsWith(`meta_${currentUser.schoolId}`)
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
                  (!d.grade || d.grade === studentGrade || d.grade === studentClass)
              )
              .map((d: any) => d as MonthlyGradebookRecord)
              .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            setArchivedGradebooks(archives);
          }
        },
        () => {}
      );
    } catch (_) {}

    // 7. Direct Firestore query: Thursday-archived Monthly Homework & School Activities Batches
    let unsubHwArchive = () => {};
    try {
      if (currentUser?.schoolId) {
        const qHwArc = query(
          collection(db, 'monthlyReports'),
          where('schoolId', '==', currentUser.schoolId)
        );
        unsubHwArchive = onSnapshot(
          qHwArc,
          (snap) => {
            const allDocs = snap.docs.map((d) => d.data() as any);
            const batches = allDocs
              .filter(
                (r) =>
                  r.recordType === 'monthly_homework_archive' &&
                  r.studentCode === session.code
              )
              .sort((a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)) as MonthlyHomeworkArchiveBatch[];
            setArchivedHomeworkBatches(batches);

            const schoolActBatches = allDocs
              .filter((r) => r.recordType === 'school_activities_archive')
              .sort((a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)) as SchoolActivityArchiveBatch[];
            setArchivedSchoolActivityBatches(schoolActBatches);
          },
          () => {}
        );
      }
    } catch (_) {}

    // 7b. Direct Firestore query: Approved School Activities (read-only for archive fallback — NO attendance)
    let unsubSchoolActs = () => {};
    try {
      if (currentUser?.schoolId) {
        const normalizedSchool = currentUser.schoolId.trim().toLowerCase();
        const qSchoolAct = query(
          collection(db, 'supervisor_activities'),
          where('schoolId', '==', currentUser.schoolId)
        );
        unsubSchoolActs = onSnapshot(
          qSchoolAct,
          (snap) => {
            const list = snap.docs
              .map((d) => ({ ...d.data(), id: d.id } as SupervisorActivity))
              .filter(
                (a) =>
                  (a.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                  a.approvalStatus === 'approved'
              )
              .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0));
            setApprovedSchoolActivities(list);
          },
          () => {}
        );
      }
    } catch (_) {}

    // 8. Direct Firestore query: Approved Fixed Term 1 Weekly Schedule (STRICTLY isolated to studentGrade)
    let unsubSchedules = () => {};
    try {
      if (currentUser?.schoolId) {
        const normalizedSchool = currentUser.schoolId.trim().toLowerCase();
        const targetGrade = String(studentGrade).trim();
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
              .filter(
                (s) =>
                  (s.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                  s.isApproved === true &&
                  String(s.grade).trim() === targetGrade
              );
            setApprovedGradeSchedules(list);
          },
          () => {
            setApprovedGradeSchedules(
              appDataService
                .getClassSchedules(currentUser.schoolId)
                .filter((s) => s.isApproved && String(s.grade).trim() === targetGrade)
            );
          }
        );
      }
    } catch (_) {}

    // 9. Direct Firestore query: Approved Attendance strictly filtered to THIS student ONLY
    let unsubOwnAttendance = () => {};
    try {
      if (currentUser?.schoolId) {
        const normalizedSchool = currentUser.schoolId.trim().toLowerCase();
        const qAtt = query(
          collection(db, 'attendance_records'),
          where('schoolId', '==', currentUser.schoolId)
        );
        unsubOwnAttendance = onSnapshot(
          qAtt,
          (snap) => {
            const rawRecords = snap.docs
              .map((d) => ({ ...d.data(), id: d.id } as AttendanceRecord))
              .filter((r) => (r.schoolId || '').trim().toLowerCase() === normalizedSchool);
            setMyAttendanceLogs(
              extractStudentOwnAttendance(rawRecords, currentUser.name, currentUser.code, studentGrade)
            );
          },
          () => {
            setMyAttendanceLogs(
              extractStudentOwnAttendance(
                appDataService.getAttendanceRecords(currentUser.schoolId),
                currentUser.name,
                currentUser.code,
                studentGrade
              )
            );
          }
        );
      }
    } catch (_) {}

    return () => {
      unsubAppData();
      unsubQuestions();
      unsubCirc();
      unsubGrades();
      unsubSubmissions();
      unsubGb();
      unsubHwArchive();
      unsubSchoolActs();
      unsubSchedules();
      unsubOwnAttendance();
    };
  }, [studentGrade, studentClass, session.schoolId, session.code, session.name]);

  // Points start strictly from 0 and match the number and grades of completed homeworks in the active month
  const totalStudentScore = useMemo(() => {
    const scoreMap = new Map<string, number>();

    // 1. From active grades in current month
    activeGrades.forEach((g) => {
      const qKey = g.questionId || g.id || `g_${g.subject}`;
      const sc = Number(g.score !== undefined ? g.score : (g.obtained || 0));
      scoreMap.set(qKey, sc);
    });

    // 2. From active submissions in current month (if graded)
    activeSubmissions.forEach((s) => {
      if ((s.status === 'graded' || s.status === 'تم التصحيح') && typeof s.score === 'number') {
        const qKey = s.questionId || s.id || `s_${s.subject}`;
        if (!scoreMap.has(qKey)) {
          scoreMap.set(qKey, s.score);
        }
      }
    });

    return Array.from(scoreMap.values()).reduce((sum, v) => sum + v, 0);
  }, [activeGrades, activeSubmissions]);

  const openHomeworkCount = useMemo(() => {
    return questions.filter((q) => {
      if (answeredMap.has(q.id) || answeredState[q.id]) return false;
      const alreadySubmitted = activeSubmissions.some(
        (s) => s.questionId === q.id || (s.title && (s.title === q.questionText || s.title === q.text))
      );
      return !alreadySubmitted;
    }).length;
  }, [questions, answeredMap, answeredState, activeSubmissions]);

  const unreadAnnouncementsCount = useMemo(() => {
    return announcements.filter((a) => a.id && !seenAnnouncementIds.has(String(a.id))).length;
  }, [announcements, seenAnnouncementIds]);

  const unreadRecommendationsCount = useMemo(() => {
    return recommendations.filter((r) => r.id && !seenRecommendationIds.has(String(r.id))).length;
  }, [recommendations, seenRecommendationIds]);

  const unseenGradesCount = useMemo(() => {
    return activeGrades.filter((g) => {
      const gKey = String(g.id || `${g.subject}_${g.questionId || ''}_${g.score}`);
      if (seenGradeIds.has(gKey)) return false;
      if (g.questionId && sessionSelfAnsweredQIdsRef.current.has(g.questionId)) return false;
      return true;
    }).length;
  }, [activeGrades, seenGradeIds]);

  const gradesTabBadgeCount = openHomeworkCount + unseenGradesCount;

  const markAllAnnouncementsSeen = () => {
    if (announcements.length === 0) return;
    setSeenAnnouncementIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      announcements.forEach((a) => {
        if (a.id && !next.has(String(a.id))) {
          next.add(String(a.id));
          changed = true;
        }
      });
      if (changed) {
        saveSeenIds(seenAnnStorageKey, next);
        return next;
      }
      return prev;
    });
    setAnnouncementCount(0);
  };

  const markAllRecommendationsSeen = () => {
    if (recommendations.length === 0) return;
    setSeenRecommendationIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      recommendations.forEach((r) => {
        if (r.id && !next.has(String(r.id))) {
          next.add(String(r.id));
          changed = true;
        }
      });
      if (changed) {
        saveSeenIds(seenRecStorageKey, next);
        return next;
      }
      return prev;
    });
  };

  const markAllGradesSeen = () => {
    if (activeGrades.length === 0) return;
    setSeenGradeIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      activeGrades.forEach((g) => {
        const gKey = String(g.id || `${g.subject}_${g.questionId || ''}_${g.score}`);
        if (!next.has(gKey)) {
          next.add(gKey);
          changed = true;
        }
      });
      if (changed) {
        saveSeenIds(seenGradeStorageKey, next);
        return next;
      }
      return prev;
    });
  };

  // Play notification tone & chime whenever new unseen items appear
  useEffect(() => {
    let shouldRing = false;

    questions.forEach((q) => {
      const isAnswered =
        answeredMap.has(q.id) ||
        Boolean(answeredState[q.id]) ||
        activeSubmissions.some(
          (s) => s.questionId === q.id || (s.title && (s.title === q.questionText || s.title === q.text))
        );
      if (!isAnswered && q.id && !notifiedQuestionIdsRef.current.has(q.id)) {
        notifiedQuestionIdsRef.current.add(q.id);
        shouldRing = true;
      }
    });

    announcements.forEach((a) => {
      const id = a.id ? String(a.id) : '';
      if (id && !seenAnnouncementIds.has(id) && !notifiedAnnouncementIdsRef.current.has(id)) {
        notifiedAnnouncementIdsRef.current.add(id);
        shouldRing = true;
      }
    });

    recommendations.forEach((r) => {
      const id = r.id ? String(r.id) : '';
      if (id && !seenRecommendationIds.has(id) && !notifiedRecommendationIdsRef.current.has(id)) {
        notifiedRecommendationIdsRef.current.add(id);
        shouldRing = true;
      }
    });

    activeGrades.forEach((g) => {
      const gKey = String(g.id || `${g.subject}_${g.questionId || ''}_${g.score}`);
      const isSelfAnswered = Boolean(g.questionId && sessionSelfAnsweredQIdsRef.current.has(g.questionId));
      if (!isSelfAnswered && !seenGradeIds.has(gKey) && !notifiedGradeIdsRef.current.has(gKey)) {
        notifiedGradeIdsRef.current.add(gKey);
        shouldRing = true;
      }
    });

    if (shouldRing) {
      triggerSoundAlert();
    }
  }, [questions, announcements, recommendations, activeGrades, answeredMap, answeredState, activeSubmissions, seenAnnouncementIds, seenRecommendationIds, seenGradeIds]);

  // Pagination for questions
  const [visibleStudentQuestions, setVisibleStudentQuestions] = useState<number>(50);

  // Photo Homework Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [activeAssignedQuestion, setActiveAssignedQuestion] = useState<Question | null>(null);
  const [hwNotes, setHwNotes] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const galleryInputRef = React.useRef<HTMLInputElement | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultAssignedQuestion: Question = questions.find((q) => q.type === 'essay' || q.type === 'homework_image') || {
    id: 'q-default-assigned',
    subject: 'العلوم',
    grade: studentGrade,
    class: studentClass,
    type: 'essay',
    questionText: 'حل تمارين الكتاب المقررة في دفترك وتصوير الحل بدقة.',
    points: 5,
    teacherName: 'معلم المادة',
    createdAt: new Date().toISOString(),
  };

  const currentAssigned = activeAssignedQuestion || defaultAssignedQuestion;

  const handleOpenSubmission = (q?: Question) => {
    setActiveAssignedQuestion(q || defaultAssignedQuestion);
    setSelectedImage(null);
    setHwNotes('');
    setShowUploadModal(true);
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { dataUrl } = await compressImageFile(file, {
        maxDimension: 1280,
        quality: 0.75,
      });
      setSelectedImage(dataUrl);
    } catch (err: any) {
      setToastMsg(err?.message || 'يُسمح برفع الصور فقط (ممنوع رفع الفيديو).');
      window.setTimeout(() => setToastMsg(null), 4000);
    }
  };

  // Automatic Grading for any student in any school (Requirement 3)
  const handleSubmitAnswer = async (question: Question, selectedOption: any) => {
    if (answeredMap.has(question.id) || answeredState[question.id]) return;

    sessionSelfAnsweredQIdsRef.current.add(question.id);
    setUserAnswers((prev) => ({ ...prev, [question.id]: selectedOption }));
    setAnsweredState((prev) => ({ ...prev, [question.id]: true }));

    // If this question's Thursday archive window already passed (late answer), keep it visible for 3.5s
    // so the student sees their green/red answer and score before it auto-archives into أرشيف الواجب الشهري.
    if (isQuestionArchivedForStudentWeek(question, nowTick)) {
      setRecentlyClosedQIds((prev) => ({ ...prev, [question.id]: true }));
      window.setTimeout(() => {
        setRecentlyClosedQIds((prev) => {
          const next = { ...prev };
          delete next[question.id];
          return next;
        });
        setToastMsg('✅ تم التصحيح وإغلاق السؤال وأرشفته تلقائياً في أرشيف الواجب الشهري');
        window.setTimeout(() => setToastMsg(null), 3500);
      }, 3500);
    }

    const studentId = auth.currentUser?.uid || session.code;
    const studentCode = session.code || (session as any).studentCode;
    const schoolId = session.schoolId; // يجي تلقائياً من حساب الطالب لأي مدرسة
    const targetClass = session.class || studentGrade;

    const correctOpt = question.correctOption !== undefined ? question.correctOption : question.correctIndex;
    const isCorrect = String(selectedOption) == String(correctOpt);
    const score = isCorrect ? (question.points || 5) : 0;

    if (isCorrect) {
      try {
        confetti({
          particleCount: 40,
          spread: 45,
          origin: { y: 0.7 },
        });
      } catch {
        // ignore
      }
    }



    const nowTimestamp = Date.now();

    // Persist answeredQuestions record
    try {
      await setDoc(
        doc(db, 'answered_questions', `${studentCode}_${question.id}`),
        cleanFirestorePayload({
          studentId,
          studentCode,
          schoolId,
          questionId: question.id,
          isClosed: true,
          score,
          maxScore: question.points || 5,
          answeredAt: serverTimestamp(),
          timestamp: nowTimestamp,
          month: activeMonth,
        })
      );
    } catch (err) {
      console.warn('answered_questions notice:', err);
    }

    try {
      await addDoc(
        collection(db, 'grades'),
        cleanFirestorePayload({
          studentId,
          studentCode,
          studentName: session.name,
          questionId: question.id,
          type: 'objective',
          examType: 'واجب تفاعلي',
          obtained: score,
          score,
          total: question.points || 5,
          maxScore: String(question.points || 5),
          subject: question.subject,
          class: targetClass,
          grade: targetClass,
          schoolId: schoolId,
          autoGraded: true,
          createdAt: serverTimestamp(),
          date: new Date().toLocaleDateString('ar-YE'),
          timestamp: nowTimestamp,
          month: activeMonth,
        })
      );
    } catch (err) {
      console.warn('Error recording grade:', err);
    }

    try {
      await addDoc(
        collection(db, 'submissions'),
        cleanFirestorePayload({
          studentId,
          studentCode,
          schoolId,
          questionId: question.id,
          selectedOption,
          correctOption: correctOpt,
          isCorrect,
          score,
          maxScore: question.points || 5,
          subject: question.subject,
          class: targetClass,
          grade: targetClass,
          type: 'objective',
          status: 'تم التصحيح',
          isLocked: true,
          autoGraded: true,
          createdAt: serverTimestamp(),
          submittedAt: 'الآن',
          timestamp: nowTimestamp,
          month: activeMonth,
        })
      );
    } catch (err) {
      console.warn('Error recording submission:', err);
    }
  };

  const handleSelectAnswer = (q: Question, optionIdx: number) => {
    handleSubmitAnswer(q, optionIdx);
  };

  // Single final homework submission for essay photo questions
  const handleSubmitHomework = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedImage || isSubmitting) return;

    setIsSubmitting(true);
    const studentId = auth.currentUser?.uid || session.code;
    const studentCode = session.code || (session as any).studentCode;
    const schoolId = session.schoolId;
    const targetClass = session.class || studentGrade;
    const qTarget = activeAssignedQuestion || defaultAssignedQuestion;
    const nowTimestamp = Date.now();

    try {
      const subData = {
        studentId,
        studentCode,
        studentName: session.name,
        grade: studentGrade,
        class: targetClass,
        schoolId: schoolId,
        subject: qTarget.subject || 'العلوم',
        title: qTarget.questionText || qTarget.text || 'واجب مدرسي مصور',
        questionId: qTarget.id,
        type: 'photo_homework',
        photoUrl: selectedImage,
        studentNotes: hwNotes.trim(),
        maxScore: 5,
        status: 'بانتظار التصحيح',
        isClosed: false,
        createdAt: serverTimestamp(),
        submittedAt: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' }),
        timestamp: nowTimestamp,
        month: activeMonth,
      };

      const docRef = await addDoc(collection(db, 'submissions'), cleanFirestorePayload(subData));

      await appDataService.addSubmission({
        studentCode,
        studentName: session.name,
        grade: (studentGrade as any) || '8',
        class: targetClass,
        schoolId,
        subject: qTarget.subject || 'العلوم',
        title: qTarget.questionText || qTarget.text || 'واجب مدرسي مصور',
        questionId: qTarget.id,
        type: 'photo_homework',
        photoUrl: selectedImage,
        studentNotes: hwNotes.trim(),
        maxScore: 5,
        status: 'بانتظار التصحيح',
        timestamp: nowTimestamp,
        month: activeMonth,
      });

      setShowUploadModal(false);
      setSelectedImage(null);
      setHwNotes('');
      setToastMsg(`📸 تم إرسال الواجب بنجاح - الحالة: تم الإرسال - بانتظار التصحيح`);
      setTimeout(() => setToastMsg(null), 3500);
    } catch (err) {
      alert('حدث خطأ أثناء إرسال الواجب، يرجى المحاولة ثانية');
    } finally {
      setIsSubmitting(false);
    }
  };

  const latestAnnouncement = announcements.length > 0 ? announcements[0] : null;

  if (!currentUser) {
    return (
      <div className="min-h-dvh bg-[#EDF0F5] flex items-center justify-center font-bold text-[#1A3A5F] font-['Cairo'] text-sm">
        جاري التحميل...
      </div>
    );
  }

  if (!currentUser.schoolId && currentUser.role !== 'super_admin') {
    return (
      <div className="min-h-dvh bg-[#EDF0F5] flex items-center justify-center font-bold text-[#1A3A5F] font-['Cairo'] text-sm">
        جاري تحميل بيانات المدرسة...
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#EDF0F5] flex flex-col justify-between text-right pb-[max(7.5rem,calc(6.5rem+env(safe-area-inset-bottom)))]">
      <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 py-5 space-y-6">
        {/* Top Portal Card: Calm Pastel Sky-Blue matching Reference */}
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] shadow-[0_6px_20px_rgba(26,58,95,0.08)] p-5 sm:p-6 text-[#1A3A5F]">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="p-2.5 rounded-2xl bg-white text-[#1F5AAA] border border-[#DCE7F3] shadow-xs shrink-0">
                  <GraduationCap className="w-6 h-6" />
                </span>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black font-['Cairo'] text-[#1A3A5F] tracking-tight">
                    بوابة الطالب المدرسي
                  </h1>
                  <p className="text-xs sm:text-sm font-bold text-[#28486B]">
                    أهلاً بك يا بطل 🌟 {session.name} • {formatArabicSchoolName(session.schoolName, session.schoolId)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <div className="px-4 py-2 rounded-2xl bg-white/90 border border-[#9BBEDF] shadow-xs text-xs sm:text-sm font-black text-[#1A3A5F]">
                🎓 {gradeLabel}
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-[#DCE7F3] text-[#1A3A5F] px-3.5 py-2 rounded-2xl text-xs font-black shadow-xs">
                <Clock className="w-3.5 h-3.5 text-[#1F5AAA]" />
                <span>{session.daysRemaining} يوم صالح</span>
              </div>
            </div>
          </div>
        </div>

        {/* Toast Notification */}
        {toastMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-bold flex items-center justify-between shadow-sm animate-in fade-in">
            <span>{toastMsg}</span>
            <button onClick={() => setToastMsg(null)} className="text-emerald-700">✕</button>
          </div>
        )}

        {/* TAB 1: لوحة المدرسة (تم استبدال تبويب المنهج بلوحة المدرسة المعتمدة + جدول الحصص) */}
        {navTab === 'school_board' && (
          <div className="space-y-6">
            {latestAnnouncement && (
              <div
                onClick={() => {
                  unlockNotificationAudio();
                  markAllAnnouncementsSeen();
                  setNavTab('announcements');
                }}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-[#9BBEDF] shadow-xs cursor-pointer hover:bg-[#F4F8FD] transition flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] shrink-0 shadow-2xs">
                    <Megaphone className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#1F5AAA]">
                        📢 جديد الإدارة المدرسية:
                      </span>
                      <span className="text-[11px] text-[#5C7085] font-bold">
                        {latestAnnouncement.createdAt}
                      </span>
                    </div>
                    <h3 className="font-black text-sm text-[#1A3A5F] mt-0.5 line-clamp-1">
                      {latestAnnouncement.title}
                    </h3>
                    <p className="text-xs text-slate-600 font-semibold line-clamp-1 mt-0.5">
                      {latestAnnouncement.content}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-black text-[#1F5AAA] shrink-0">
                  <span>عرض الكل</span>
                  <ChevronLeft className="w-4 h-4" />
                </div>
              </div>
            )}

            <SchoolBoardView
              schoolId={session.schoolId}
              schoolName={formatArabicSchoolName(session.schoolName, session.schoolId)}
              onOpenSchoolActivitiesArchive={() => setActiveArchiveModal('school_activities_archive')}
              topSlot={
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNavTab('schedule')}
                    className="w-full bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] hover:border-[#9BBEDF] shadow-xs hover:bg-[#F4F8FD] transition flex items-center justify-between gap-3 cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="font-black text-sm text-[#1A3A5F]">
                            جدول الحصص الأسبوعي — الترم الأول
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[10px] font-black">
                            {gradeLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5C7085] font-semibold mt-0.5 truncate">
                          {approvedGradeSchedules.length > 0
                            ? `الجدول المعتمد (${approvedGradeSchedules.length} فصل)`
                            : 'جدول صفك فور اعتماده'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-black text-[#1F5AAA] shrink-0">
                      <span>عرض</span>
                      <ChevronLeft className="w-4 h-4" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNavTab('attendance')}
                    className="w-full bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] hover:border-[#9BBEDF] shadow-xs hover:bg-[#F4F8FD] transition flex items-center justify-between gap-3 cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="font-black text-sm text-[#1A3A5F]">
                            سجل حضوري وغيابي الخاص
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            <span>خاص بك فقط</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5C7085] font-semibold mt-0.5 truncate">
                          {myAttendanceLogs.length > 0
                            ? `إجمالي السجلات المسجلة لك: ${myAttendanceLogs.length}`
                            : 'لا توجد سجلات حضور مسجلة لحسابك بعد'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs font-black text-[#1F5AAA] shrink-0">
                      <span>عرض</span>
                      <ChevronLeft className="w-4 h-4" />
                    </div>
                  </button>
                </div>
              }
            />
          </div>
        )}

        {/* TAB 2: HOMEWORK (مقسمة إلى حقول مستقلة لكل مادة مع أرشفة أسبوعية كل خميس) */}
        {navTab === 'homework' && (() => {
          const homeworkSubjectOptions = Array.from(
            new Set<string>([
              ...subjects.map((s) => s.nameAr),
              ...questions.map((q) => (q.subject || '').trim()).filter(Boolean),
            ])
          );

          const isQuestionAnsweredOrPending = (q: Question) => {
            const matchingSub = activeSubmissions.find(
              (s) => s.questionId === q.id || (s.title && (s.title === q.questionText || s.title === q.text))
            );
            const isGraded = matchingSub && (matchingSub.status === 'تم التصحيح' || matchingSub.status === 'graded');
            const isPendingReview = !isGraded && matchingSub && (matchingSub.status === 'بانتظار التصحيح' || matchingSub.status === 'بانتظار المراجعة');
            const isClosed = answeredMap.has(q.id) || Boolean(answeredState[q.id]) || Boolean(isGraded);
            return { matchingSub, isGraded, isPendingReview, isClosed };
          };

          const subjectFieldsSummary = homeworkSubjectOptions.map((subjName) => {
            const subjQuestions = questions.filter((q) => (q.subject || '').trim() === subjName);
            const pendingCount = subjQuestions.filter((q) => {
              const st = isQuestionAnsweredOrPending(q);
              return !st.isClosed && !st.isPendingReview;
            }).length;
            return {
              name: subjName,
              questions: subjQuestions,
              totalCount: subjQuestions.length,
              pendingCount,
            };
          });

          const displayedSubjectFields =
            selectedHomeworkSubject === 'الكل'
              ? subjectFieldsSummary
              : subjectFieldsSummary.filter((sf) => sf.name === selectedHomeworkSubject);

          const totalArchivedHwCount = combinedArchivedHomeworkBatches.reduce(
            (sum, b) => sum + (b.questions?.length || 0),
            0
          );

          return (
            <div className="space-y-5">
              {/* Header */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-[0_4px_14px_rgba(26,58,95,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-black text-sm sm:text-base text-[#1A3A5F] flex items-center gap-2">
                    <Award className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                    <span>واجباتك والأسئلة التفاعلية المقررة (حسب كل مادة)</span>
                  </h2>
                  <p className="text-xs text-[#5C7085] font-medium mt-0.5">
                    كل سؤال يظهر داخل واجب مادته الخاصة، وتُؤرشف الأسئلة المجاب عليها والمقفلة تلقائياً كل خميس إلى أرشيف الواجب الشهري (وتبقى الأسئلة غير المجاب عليها متاحة للمتأخرين)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black">
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                    <span>نقاطك: {totalStudentScore} درجات</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveArchiveModal('monthly_homework')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white border border-[#194B91] text-xs font-black transition cursor-pointer shadow-xs"
                  >
                    <Archive className="w-4 h-4 text-white" />
                    <span>أرشيف الواجب الشهري ({totalArchivedHwCount})</span>
                  </button>
                </div>
              </div>

              {/* Subject Selector Cards & Mobile-Safe Dropdown */}
              <div className="bg-white rounded-2xl p-4 border border-[#DCE7F3] shadow-[0_4px_14px_rgba(26,58,95,0.04)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <h3 className="text-xs sm:text-sm font-black text-[#1A3A5F] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#1F5AAA] shrink-0" />
                    <span>حقول المواد الدراسية ({homeworkSubjectOptions.length} مواد)</span>
                  </h3>

                  <div className="flex items-center gap-1.5 bg-[#F4F8FC] px-2.5 py-1.5 rounded-xl border border-[#DCE7F3] w-full sm:w-auto min-w-0">
                    <label htmlFor="student-homework-subject" className="text-xs font-black text-[#1A3A5F] shrink-0">
                      المادة:
                    </label>
                    <select
                      id="student-homework-subject"
                      value={selectedHomeworkSubject}
                      onChange={(e) => setSelectedHomeworkSubject(e.target.value)}
                      className="bg-white px-2.5 py-1 rounded-lg border border-[#DCE7F3] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] cursor-pointer min-w-0 flex-1 sm:flex-initial max-w-full"
                    >
                      <option value="الكل">جميع حقول المواد ({questions.length} نشط)</option>
                      {subjectFieldsSummary.map((sf, idx) => (
                        <option key={`hw-subj-opt-${sf.name}-${idx}`} value={sf.name}>
                          {sf.name} ({sf.totalCount})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                  {subjectFieldsSummary.map((sf, idx) => {
                    const isSelected = selectedHomeworkSubject === sf.name;
                    return (
                      <button
                        key={`hw-subj-card-${sf.name}-${idx}`}
                        type="button"
                        onClick={() => setSelectedHomeworkSubject(isSelected ? 'الكل' : sf.name)}
                        className={`min-w-0 p-2.5 sm:p-3 rounded-xl border text-right transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-xs'
                            : sf.pendingCount > 0
                            ? 'bg-amber-50 hover:bg-amber-100 text-[#1A3A5F] border-amber-400'
                            : 'bg-[#F4F8FC] hover:bg-[#EEF5FC] text-[#1A3A5F] border-[#DCE7F3]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-black leading-snug min-w-0 truncate">{sf.name}</span>
                          <span
                            className={`text-[11px] font-mono font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                              isSelected
                                ? 'bg-white text-[#1F5AAA]'
                                : sf.pendingCount > 0
                                ? 'bg-rose-600 text-white'
                                : sf.totalCount > 0
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {sf.totalCount}
                          </span>
                        </div>
                        <p className={`text-[11px] ${isSelected ? 'text-[#DCE7F3] font-extrabold' : sf.pendingCount > 0 ? 'text-amber-900 font-bold' : 'text-[#5C7085] font-semibold'}`}>
                          {sf.pendingCount > 0
                            ? `${sf.pendingCount} سؤال بانتظار الحل`
                            : sf.totalCount > 0
                            ? `${sf.totalCount} منجز هذا الأسبوع`
                            : 'لا توجد واجبات حالياً'}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {selectedHomeworkSubject !== 'الكل' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedHomeworkSubject('الكل')}
                      className="text-xs font-black text-[#1F5AAA] hover:underline cursor-pointer"
                    >
                      عرض حقول جميع المواد ({homeworkSubjectOptions.length})
                    </button>
                  </div>
                )}
              </div>

              {/* Per-Subject Dedicated Homework Fields */}
              <div className="space-y-4">
                {displayedSubjectFields.map((sf, sfIdx) => (
                  <section
                    key={`hw-field-${sf.name}-${sfIdx}`}
                    className={`rounded-2xl border overflow-hidden shadow-xs transition ${
                      sf.totalCount > 0
                        ? 'bg-white border-[#9BBEDF]'
                        : 'bg-white border-[#DCE7F3]'
                    }`}
                  >
                    {/* Subject Field Header */}
                    <div
                      className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 ${
                        sf.pendingCount > 0
                          ? 'bg-amber-50 border-amber-300'
                          : sf.totalCount > 0
                          ? 'bg-[#EEF5FC] border-[#C6DCF2]'
                          : 'bg-[#F4F8FC] border-[#DCE7F3]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-[#1F5AAA] text-white flex items-center justify-center shrink-0 shadow-xs">
                          <BookOpen className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-black text-xs sm:text-sm text-[#1A3A5F] truncate">
                            واجب مادة: {sf.name}
                          </h3>
                          <p className="text-[11px] text-[#5C7085] font-semibold">
                            {sf.totalCount > 0
                              ? `${sf.totalCount} واجب / سؤال نشط لهذا الأسبوع`
                              : 'واجب المادة جاهز لاستقبال واجبات الأسبوع الحالي'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {sf.pendingCount > 0 && (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-600 text-white">
                            {sf.pendingCount} جديد
                          </span>
                        )}
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-white text-[#1F5AAA] border border-[#C6DCF2]">
                          {sf.totalCount} سؤال
                        </span>
                      </div>
                    </div>

                    {/* Subject Field Body */}
                    <div className="p-3.5 sm:p-4 bg-white">
                      {sf.questions.length === 0 ? (
                        <div className="py-4 px-3 text-center text-xs font-semibold text-[#5C7085]">
                          لا توجد واجبات نشطة حالياً في واجب مادة ({sf.name}) — تُؤرشف الواجبات المجاب عليها والمقفلة تلقائياً يوم الخميس إلى الأرشيف الشهري.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {sf.questions.slice(0, visibleStudentQuestions).map((q, qIdx) => {
                            const { matchingSub, isGraded, isPendingReview, isClosed } = isQuestionAnsweredOrPending(q);
                            const ansInfo = answeredMap.get(q.id);
                            const gradeEarned = ansInfo?.score !== undefined ? ansInfo.score : (matchingSub?.score !== undefined ? matchingSub.score : (q.points || 5));
                            const selectedOpt = userAnswers[q.id] !== undefined ? userAnswers[q.id] : ansInfo?.selectedOption;

                            return (
                              <div
                                key={q.id ? `q-${q.id}-${qIdx}` : `q-idx-${sfIdx}-${qIdx}`}
                                className={`rounded-2xl p-4 sm:p-5 border shadow-xs flex flex-col justify-between transition ${
                                  isClosed
                                    ? 'bg-white border-2 border-emerald-500'
                                    : isPendingReview
                                    ? 'bg-amber-50 border-2 border-amber-400'
                                    : 'bg-white border-[#DCE7F3]'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                    <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                                      {q.subject} • {isObjectiveQuestion(q.type) ? 'سؤال موضوعي' : 'سؤال مقالي كتابي'}
                                    </span>
                                    {isClosed ? (
                                      <div className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-400 flex items-center gap-1 shadow-2xs">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                        <span>🔒 مغلق - تم التصحيح ({gradeEarned}/{q.points || 5})</span>
                                      </div>
                                    ) : isPendingReview ? (
                                      <div className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-400 flex items-center gap-1 shadow-2xs">
                                        <Clock className="w-3.5 h-3.5 text-amber-700" />
                                        <span>⏳ تم الإرسال - بانتظار التصحيح</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs font-black text-[#1F5AAA] bg-[#EEF5FC] border border-[#C6DCF2] px-2 py-0.5 rounded-md">
                                        {q.points || 5} درجات
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="font-black text-[#1A3A5F] text-xs sm:text-sm mb-3">
                                    {q.questionText || q.text}
                                  </h4>

                                  {q.imageUrl && (
                                    <div className="my-2 rounded-xl overflow-hidden border border-[#DCE7F3] max-h-48 bg-[#F4F8FC]">
                                      <img src={q.imageUrl} alt="صورة توضيحية / واجب مصور" className="w-full h-36 object-cover" />
                                    </div>
                                  )}

                                  {/* Objective MCQ Questions */}
                                  {isObjectiveQuestion(q.type) && q.options && (
                                    <div className="space-y-2 mb-4">
                                      {q.options.map((opt, optIdx) => {
                                        const isChosen = String(selectedOpt) === String(optIdx);
                                        const correctOpt = q.correctOption !== undefined ? q.correctOption : q.correctIndex;
                                        const isCorrectOpt = String(correctOpt) === String(optIdx);

                                        let btnStyle = 'bg-[#F4F8FC] hover:bg-[#EEF5FC] border-[#DCE7F3] text-[#1A3A5F] font-semibold';
                                        if (isClosed) {
                                          if (isCorrectOpt) {
                                            btnStyle = 'bg-emerald-100 border-emerald-500 text-emerald-950 font-black';
                                          } else if (isChosen && !isCorrectOpt) {
                                            btnStyle = 'bg-rose-100 border-rose-500 text-rose-950 font-black';
                                          } else {
                                            btnStyle = 'bg-slate-100 border-slate-200 text-slate-600';
                                          }
                                        }

                                        return (
                                          <button
                                            key={`q-${q.id || qIdx}-opt-${optIdx}`}
                                            disabled={isClosed}
                                            onClick={() => handleSelectAnswer(q, optIdx)}
                                            className={`w-full p-2.5 rounded-xl border text-right text-xs transition flex items-center justify-between ${btnStyle} ${
                                              !isClosed ? 'cursor-pointer' : 'cursor-not-allowed'
                                            }`}
                                          >
                                            <span className="flex items-center gap-2">
                                              <span className="font-black text-[#1F5AAA]">
                                                {optIdx === 0 ? 'أ' : optIdx === 1 ? 'ب' : optIdx === 2 ? 'ج' : 'د'}:
                                              </span>
                                              {opt}
                                            </span>
                                            {isClosed && isCorrectOpt && (
                                              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                                            )}
                                            {isClosed && isChosen && !isCorrectOpt && (
                                              <XCircle className="w-4 h-4 text-rose-700 shrink-0" />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Essay Question: Teacher Note when closed */}
                                  {isEssayQuestion(q.type) && isClosed && matchingSub?.teacherFeedback && (
                                    <div className="my-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950">
                                      <strong className="block text-[11px] text-emerald-900">ملاحظة المعلم:</strong>
                                      {matchingSub.teacherFeedback}
                                    </div>
                                  )}

                                  {/* Essay Question: Submitted and Pending Review */}
                                  {isEssayQuestion(q.type) && isPendingReview && (
                                    <div className="my-3 p-3.5 rounded-xl bg-amber-100 border border-amber-300 text-xs text-amber-950 space-y-1.5">
                                      <div className="flex items-center gap-1.5 font-black">
                                        <Clock className="w-4 h-4 text-amber-700" />
                                        <span>تم إرسال صورة دفتر الواجب بنجاح</span>
                                      </div>
                                      <p className="text-[11px] text-amber-900 font-semibold leading-relaxed">
                                        الواجب بانتظار مراجعة واعتماد الدرجة من قِبل معلم المادة. لا يتم إغلاق السؤال حتى يعتمد المعلم الدرجة.
                                      </p>
                                      {matchingSub?.studentNotes && (
                                        <div className="text-[11px] text-[#1A3A5F] bg-white p-2 rounded-lg border border-amber-300 mt-1">
                                          <strong>ملاحظتك للمعلم:</strong> {matchingSub.studentNotes}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Essay Question: Not yet submitted -> Single button "ارفع صورة دفتر الواجب" */}
                                  {isEssayQuestion(q.type) && !isClosed && !isPendingReview && (
                                    <div className="my-3">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSubmission(q)}
                                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white border border-[#194B91] text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                                      >
                                        <Camera className="w-4 h-4 text-white" />
                                        <span>ارفع صورة دفتر الواجب</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="pt-3 border-t border-[#DCE7F3] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C7085]">
                                  <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="font-bold text-[#1A3A5F]">إشراف: {q.teacherName || 'معلم المادة'}</span>
                                    <span className="flex items-center gap-1 text-[#1F5AAA] font-bold bg-[#EEF5FC] px-2 py-0.5 rounded-md border border-[#C6DCF2]">
                                      <Clock className="w-3.5 h-3.5 text-[#1F5AAA]" />
                                      <span>تاريخ الإضافة: {q.createdAtFormatted || formatArabicDateTime(q.createdAt || q.timestamp)}</span>
                                    </span>
                                  </div>
                                  {isClosed ? (
                                    <button
                                      disabled
                                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-200 text-slate-700 cursor-not-allowed border border-slate-300 flex items-center gap-1.5"
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                      <span>تم الإغلاق</span>
                                    </button>
                                  ) : isPendingReview ? (
                                    <span className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-amber-100 text-amber-900 border border-amber-400 flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-amber-700" />
                                      <span>تم الإرسال - بانتظار التصحيح</span>
                                    </span>
                                  ) : isObjectiveQuestion(q.type) ? (
                                    <span className="text-[11px] text-[#1F5AAA] font-black">
                                      اختر الإجابة أعلاه
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-[#1F5AAA] font-black">
                                      المطلوب: رفع صورة حل الواجب من الدفتر
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          );
        })()}

        {/* TAB 3: ANNOUNCEMENTS */}
        {navTab === 'announcements' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-[0_4px_14px_rgba(26,58,95,0.04)] flex flex-wrap items-center justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-sm sm:text-base text-[#1A3A5F] flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                  <span>تعاميم وإعلانات إدارة المدرسة</span>
                </h2>
                <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                  جميع التوجيهات الرسمية الصادرة من المدير والمعلمين
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] shrink-0">
                {announcements.length} تعاميم معتمدة
              </span>
            </div>

            <div className="space-y-3">
              {announcements.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-[#5C7085] font-bold text-xs sm:text-sm shadow-xs">
                  لا توجد تعاميم مرسلة من مدير المدرسة حالياً
                </div>
              ) : (
                announcements.map((a, aIdx) => {
                  const displaySender =
                    a.senderName && !isGenericPrincipalSender(a.senderName)
                      ? a.senderName
                      : getSchoolPrincipalName(a.schoolId || session.schoolId, session.schoolName);
                  return (
                    <div
                      key={a.id ? `anc-${a.id}-${aIdx}` : `anc-idx-${aIdx}`}
                      className={`bg-white rounded-2xl p-5 border shadow-xs text-right transition ${
                        a.priority === 'عاجل'
                          ? 'border-2 border-rose-500'
                          : 'border-[#DCE7F3]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                            a.priority === 'عاجل'
                              ? 'bg-rose-600 text-white'
                              : 'bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]'
                          }`}
                        >
                          {a.priority}
                        </span>
                        <span className="text-xs text-[#5C7085] font-bold">
                          {a.createdAt}
                        </span>
                      </div>

                      <h3 className="font-black text-sm text-[#1A3A5F] mb-1">
                        {a.title}
                      </h3>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">
                        {a.content}
                      </p>

                      <div className="mt-3 pt-3 border-t border-[#DCE7F3] flex items-center justify-between text-[11px] text-[#5C7085]">
                        <span>المرسل: <strong className="text-[#1A3A5F]">{displaySender}</strong> ({a.senderRoleAr || 'مدير المدرسة'})</span>
                        <span className="text-[#1F5AAA] font-black">معتمد رسمياً</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 4: GRADES */}
        {navTab === 'grades' && (() => {
          const isViewingArchive = selectedGradeMonth !== 'active';
          const selectedArchive = isViewingArchive
            ? archivedGradebooks.find((a) => a.id === selectedGradeMonth)
            : null;
          const studentArchived = selectedArchive?.roster?.find((st) => st.code === session.code);

          const activeGrades = studentGrades.filter((g) => {
            if (!rolloverTimestamp) return true;
            const ts = (g as any).timestamp || getQuestionTimestamp(g) || 0;
            return ts >= rolloverTimestamp;
          });

          const gradeSubjectOptions = Array.from(
            new Set<string>([
              ...subjects.map((s) => s.nameAr),
              ...studentGrades.map((g) => g.subjectName || g.subject).filter(Boolean) as string[],
              ...archivedGradebooks.map((a) => a.subject).filter(Boolean) as string[],
            ])
          );

          const filteredActiveGrades =
            selectedGradeSubject === 'الكل'
              ? activeGrades
              : activeGrades.filter((g) => (g.subjectName || g.subject) === selectedGradeSubject);

          const activeTotalScore = filteredActiveGrades.reduce((sum, g) => sum + (Number(g.score) || 0), 0);

          const subjectSummaries = gradeSubjectOptions.map((subjName) => {
            const subjGrades = activeGrades.filter((g) => (g.subjectName || g.subject) === subjName);
            const earned = subjGrades.reduce((s, g) => s + (Number(g.score) || 0), 0);
            const max = subjGrades.reduce((s, g) => s + (Number(g.maxScore || g.total) || 5), 0);
            return {
              name: subjName,
              count: subjGrades.length,
              earned,
              max,
            };
          });

          return (
            <div className="space-y-4">
              {/* Month & Subjects Selector Bar */}
              <div className="bg-white rounded-2xl p-4 border border-[#DCE7F3] shadow-[0_4px_14px_rgba(26,58,95,0.04)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-[#EEF5FC] border border-[#C6DCF2] text-[#1F5AAA]">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black text-[#1A3A5F]">سجل وكشف الدرجات الشهري</h4>
                    <p className="text-[11px] text-[#5C7085] font-semibold">تصفية الدرجات حسب المادة الدراسية والشهر الحالي أو الشهور المؤرشفة</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto min-w-0">
                  {/* حقل المواد */}
                  <div className="flex items-center gap-1.5 bg-[#F4F8FC] px-2.5 py-1.5 rounded-xl border border-[#DCE7F3] min-w-0 w-full sm:w-auto">
                    <BookOpen className="w-4 h-4 text-[#1F5AAA] shrink-0" />
                    <label htmlFor="student-grades-subject" className="text-xs font-black text-[#1A3A5F] shrink-0">
                      المواد:
                    </label>
                    <select
                      id="student-grades-subject"
                      value={selectedGradeSubject}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedGradeSubject(val);
                        if (isViewingArchive && val !== 'الكل') {
                          const matchArc = archivedGradebooks.find(
                            (arc) => arc.month === selectedArchive?.month && arc.subject === val
                          );
                          if (matchArc) setSelectedGradeMonth(matchArc.id);
                        }
                      }}
                      className="bg-white px-2.5 py-1 rounded-lg border border-[#DCE7F3] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] cursor-pointer min-w-0 flex-1 sm:flex-initial max-w-full"
                    >
                      <option value="الكل">جميع المواد ({gradeSubjectOptions.length})</option>
                      {gradeSubjectOptions.map((subjName, idx) => (
                        <option key={`grades-subj-opt-${subjName}-${idx}`} value={subjName}>
                          {subjName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* حقل الشهر */}
                  <div className="flex items-center gap-1.5 bg-[#F4F8FC] px-2.5 py-1.5 rounded-xl border border-[#DCE7F3] min-w-0 w-full sm:w-auto">
                    <span className="text-xs font-black text-[#1A3A5F] shrink-0">الشهر:</span>
                    <select
                      value={selectedGradeMonth}
                      onChange={(e) => setSelectedGradeMonth(e.target.value)}
                      className="bg-white px-2.5 py-1 rounded-lg border border-[#DCE7F3] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] cursor-pointer min-w-0 flex-1 sm:flex-initial max-w-full"
                    >
                      <option value="active">الشهر الحالي: {activeMonth} (نشط / حي)</option>
                      {archivedGradebooks.length > 0 && (
                        <optgroup label="الأشهر السابقة المؤرشفة">
                          {archivedGradebooks.map((arc, arcIdx) => (
                            <option key={arc.id ? `arc-${arc.id}-${arcIdx}` : `arc-idx-${arcIdx}`} value={arc.id}>
                              شهر {arc.month} ({arc.subject} - {arc.archivedAt})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* ACTIVE MONTH VIEW */}
              {!isViewingArchive && (
                <>
                  <div className="bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] rounded-2xl p-5 text-[#1A3A5F] shadow-[0_6px_20px_rgba(26,58,95,0.08)] flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-white border border-[#DCE7F3] flex items-center justify-center font-bold text-lg shadow-xs">
                        <User className="w-6 h-6 text-[#1F5AAA]" />
                      </div>
                      <div>
                        <h3 className="font-black text-base text-[#1A3A5F]">{session.name}</h3>
                        <p className="text-xs text-[#28486B] font-semibold">
                          {session.code} • {gradeLabel} • <strong className="underline">شهر {activeMonth}</strong>
                          {selectedGradeSubject !== 'الكل' && ` • مادة ${selectedGradeSubject}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-xl bg-white/90 border border-[#9BBEDF] text-xs font-black text-[#1A3A5F]">
                        المجموع: {activeTotalScore}
                      </div>
                      <div className="px-3 py-1.5 rounded-xl bg-[#1F5AAA] border border-[#194B91] text-xs font-black text-white">
                        الواجبات: {filteredActiveGrades.length}
                      </div>
                    </div>
                  </div>

                  {/* بطاقات المواد الدراسية لاختيار مادة واحدة أو جميع المواد */}
                  <div className="bg-white rounded-2xl p-4 border border-[#DCE7F3] shadow-[0_4px_14px_rgba(26,58,95,0.04)] space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs sm:text-sm font-black text-[#1A3A5F] flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[#1F5AAA]" />
                        <span>المواد الدراسية ({gradeSubjectOptions.length} مواد)</span>
                      </h4>
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

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-2.5">
                      {subjectSummaries.map((item, sIdx) => {
                        const isSelected = selectedGradeSubject === item.name;
                        return (
                          <button
                            key={`grade-subj-card-${item.name}-${sIdx}`}
                            type="button"
                            onClick={() => setSelectedGradeSubject(isSelected ? 'الكل' : item.name)}
                            className={`min-w-0 p-2.5 sm:p-3 rounded-xl border text-right transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-xs'
                                : 'bg-[#F4F8FC] hover:bg-[#EEF5FC] text-[#1A3A5F] border-[#DCE7F3]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-black leading-snug min-w-0">{item.name}</span>
                              <span
                                className={`text-[11px] font-mono font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                                  isSelected
                                    ? 'bg-white text-[#1F5AAA]'
                                    : item.count > 0
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {item.count > 0 ? `${item.earned}/${item.max}` : '0'}
                              </span>
                            </div>
                            <p className={`text-[11px] ${isSelected ? 'text-[#DCE7F3] font-extrabold' : 'text-[#5C7085] font-semibold'}`}>
                              {item.count > 0 ? `${item.count} تقييم مرصود` : 'لا توجد درجات بعد'}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {filteredActiveGrades.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center shadow-xs space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-[#EEF5FC] border border-[#C6DCF2] text-[#1F5AAA] flex items-center justify-center mx-auto mb-2">
                        <Award className="w-6 h-6 text-[#1F5AAA]" />
                      </div>
                      <h4 className="font-black text-base text-[#1A3A5F]">
                        {selectedGradeSubject === 'الكل'
                          ? `كشف درجات شهر (${activeMonth}) نظيف ونشط`
                          : `لا توجد درجات مرصودة لمادة (${selectedGradeSubject}) في شهر (${activeMonth})`}
                      </h4>
                      <p className="text-xs text-[#5C7085] font-medium max-w-md mx-auto leading-relaxed">
                        {selectedGradeSubject === 'الكل'
                          ? `يبدأ كشف درجات نظيف لهذا الشهر الجديد. سيتم رصد وتحديث درجاتك هنا فور حل وتصحيح واجبات واختبارات شهر (${activeMonth}).`
                          : 'ستظهر درجات هذه المادة هنا فور حل واجباتها أو اعتماد تقييماتها من المعلم.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredActiveGrades.map((g, gIdx) => (
                        <div
                          key={g.id ? `grade-${g.id}-${gIdx}` : `grade-idx-${gIdx}`}
                          className="bg-white p-4 rounded-xl border border-[#DCE7F3] shadow-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#EEF5FC] text-[#1F5AAA] font-black text-lg flex items-center justify-center border border-[#C6DCF2]">
                              {g.score}
                            </div>
                            <div>
                              <h4 className="font-black text-xs sm:text-sm text-[#1A3A5F]">
                                {g.subjectName || g.subject} — <span className="text-[#1F5AAA]">{g.score} / {g.maxScore}</span>
                              </h4>
                              {g.note && !g.note.includes('أمير') ? (
                                <p className="text-[11px] text-[#5C7085] font-semibold">
                                  ملاحظة: {g.note} • {g.date}
                                </p>
                              ) : (
                                <p className="text-[11px] text-[#5C7085] font-semibold">
                                  {g.date}
                                </p>
                              )}
                            </div>
                          </div>
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ARCHIVED MONTH VIEW */}
              {isViewingArchive && selectedArchive && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] rounded-2xl p-5 text-[#1A3A5F] shadow-[0_6px_20px_rgba(26,58,95,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-white text-[#1F5AAA] flex items-center justify-center font-bold text-lg border border-[#DCE7F3] shadow-xs">
                        <History className="w-6 h-6 text-[#1F5AAA]" />
                      </div>
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <h3 className="font-black text-base text-[#1A3A5F]">كشف درجات مؤرشف لشهر ({selectedArchive.month})</h3>
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white text-[#1F5AAA] border border-[#DCE7F3] font-black">
                            معتمد رسمياً
                          </span>
                        </div>
                        <p className="text-xs text-[#28486B] mt-0.5 font-semibold">
                          مادة: <strong>{selectedArchive.subject}</strong> • المعلم: <strong>{selectedArchive.teacherName || 'معلم المادة'}</strong> • تاريخ الترحيل: <strong>{selectedArchive.archivedAt}</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedGradeMonth('active')}
                      className="px-3.5 py-1.5 bg-[#1F5AAA] hover:bg-[#194B91] text-white rounded-xl text-xs font-black transition border border-[#194B91] cursor-pointer self-start sm:self-center"
                    >
                      العودة للشهر الحالي ({activeMonth})
                    </button>
                  </div>

                  {studentArchived ? (
                    <div className="bg-white rounded-2xl p-6 border border-[#DCE7F3] shadow-xs space-y-5">
                      <div className="border-b border-[#DCE7F3] pb-3 flex items-center justify-between">
                        <div>
                          <h4 className="font-black text-sm text-[#1A3A5F]">{session.name} ({session.code})</h4>
                          <span className="text-xs text-[#5C7085] font-bold">{gradeLabel}</span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black border ${studentArchived.ratingBadgeColor || 'bg-emerald-100 text-emerald-900 border-emerald-300'}`}>
                          {studentArchived.rating}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        <div className="p-3.5 bg-[#EEF5FC] rounded-xl border border-[#C6DCF2]">
                          <span className="text-[11px] text-[#5C7085] font-bold block mb-1">الدرجة الإجمالية</span>
                          <span className="text-base font-black text-[#1F5AAA]">
                            {studentArchived.totalEarned} / {studentArchived.totalPossible}
                          </span>
                        </div>

                        <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-300">
                          <span className="text-[11px] text-slate-700 font-bold block mb-1">النسبة المئوية</span>
                          <span className="text-base font-black text-emerald-800 font-mono">
                            {studentArchived.percentage}%
                          </span>
                        </div>

                        <div className="p-3.5 bg-[#F4F8FC] rounded-xl border border-[#DCE7F3]">
                          <span className="text-[11px] text-[#5C7085] font-bold block mb-1">عدد التسليمات</span>
                          <span className="text-base font-black text-[#1A3A5F]">
                            {studentArchived.submissionsCount} تسليم
                          </span>
                        </div>

                        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300">
                          <span className="text-[11px] text-slate-700 font-bold block mb-1">التقدير النهائي</span>
                          <span className="text-sm font-black text-amber-900">
                            {studentArchived.rating}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-[#F4F8FC] rounded-xl border border-[#DCE7F3] text-xs text-[#1A3A5F] font-semibold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>تم حفظ وتجميد كشف هذا الشهر بنجاح في سجلات المدرسة بـ Firestore وترحيل الكشف لبدء شهر جديد بعده.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center shadow-xs">
                      <Award className="w-10 h-10 text-[#1F5AAA] mx-auto mb-2" />
                      <h4 className="font-black text-sm text-[#1A3A5F]">لا توجد درجات مرصودة لك في أرشيف شهر ({selectedArchive.month})</h4>
                      <p className="text-xs text-[#5C7085] font-semibold mt-1">لم يتم تسجيل درجات لك قبل ترحيل وأرشفة هذا الشهر.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* TAB 5: TEACHER RECOMMENDATIONS (استلام التوصيات من لوحة المعلم لكل مادة دراسية) */}
        {navTab === 'recommendations' && (
          <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] rounded-2xl p-5 text-[#1A3A5F] shadow-[0_6px_20px_rgba(26,58,95,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-[#1F5AAA] border border-[#DCE7F3] shadow-xs">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#1A3A5F]">
                    توصيات وتعليمات المعلمين التربوية
                  </h2>
                  <p className="text-xs text-[#28486B] font-semibold">
                    استلام التوجيهات والإرشادات من معلمي المواد الدراسية • {gradeLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-black bg-white px-3 py-1.5 rounded-xl border border-[#DCE7F3] text-[#1F5AAA] shadow-2xs">
                  {recommendations.length} توصية معتمدة
                </span>
              </div>
            </div>

            {/* Subject Filters */}
            <div className="bg-white p-3 rounded-2xl border border-[#DCE7F3] shadow-xs">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-xs font-black text-[#1A3A5F] pl-2 shrink-0">المادة:</span>
                {['الكل', ...subjects.map((s) => s.nameAr)].map((subjName, subjIdx) => (
                  <button
                    key={`rec-subj-${subjName}-${subjIdx}`}
                    onClick={() => setSelectedRecSubject(subjName)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition shrink-0 cursor-pointer ${
                      selectedRecSubject === subjName
                        ? 'bg-[#1F5AAA] text-white border border-[#194B91] shadow-xs'
                        : 'bg-[#F4F8FC] text-[#1A3A5F] hover:bg-[#EEF5FC] border border-[#DCE7F3]'
                    }`}
                  >
                    {subjName}
                  </button>
                ))}
              </div>
            </div>

            {/* Recommendations List */}
            {(() => {
              const filtered = recommendations.filter((r) => {
                if (selectedRecSubject === 'الكل') return true;
                return r.subject === selectedRecSubject;
              });

              if (filtered.length === 0) {
                return (
                  <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center shadow-xs space-y-2">
                    <Sparkles className="w-10 h-10 text-[#1F5AAA] mx-auto mb-1 animate-bounce" />
                    <h3 className="font-black text-sm text-[#1A3A5F]">
                      لا توجد توصيات منشورة حالياً في مادة ({selectedRecSubject})
                    </h3>
                    <p className="text-xs text-[#5C7085] font-semibold max-w-md mx-auto">
                      سيظهر هنا أي إرشاد أو توجيه دراسي يقوم معلم المادة بنشره فوراً.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3.5">
                  {filtered.map((rec, recIdx) => {
                    const isPrivateForMe =
                      rec.targetScope === 'specific_student' || Boolean(rec.targetStudentCode);
                    return (
                      <div
                        key={rec.id ? `rec-${rec.id}-${recIdx}` : `rec-idx-${recIdx}`}
                        className={`p-5 rounded-3xl shadow-xs hover:shadow-sm transition text-right relative overflow-hidden bg-white ${
                          isPrivateForMe
                            ? 'border-2 border-[#9BBEDF]'
                            : 'border border-[#DCE7F3]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {isPrivateForMe && (
                              <span className="px-3 py-1 rounded-xl text-xs font-black bg-[#1F5AAA] text-white border border-[#194B91] shadow-2xs inline-flex items-center gap-1">
                                <Lock className="w-3.5 h-3.5 text-white" />
                                <span>توصية خاصة بك</span>
                              </span>
                            )}
                            <span className="px-3 py-1 rounded-xl text-xs font-black bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                              مادة {rec.subject}
                            </span>
                            <span className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                              {rec.category || 'توجيه تربوي'}
                            </span>
                            <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                              {rec.grade === 'all' ? 'جميع الصفوف' : `الصف ${rec.grade}`}
                            </span>
                          </div>

                          <span className="text-xs font-black text-emerald-900 flex items-center gap-1 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300">
                            <Clock className="w-3.5 h-3.5 text-emerald-700" />
                            <span>تاريخ ووقت النشر: {rec.createdAtFormatted}</span>
                          </span>
                        </div>

                        {rec.title && (
                          <h4 className="text-sm sm:text-base font-black text-[#1A3A5F] mb-2">
                            {rec.title}
                          </h4>
                        )}

                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-semibold whitespace-pre-wrap">
                          {rec.content}
                        </p>

                        <div className="mt-4 pt-3 border-t border-[#DCE7F3] flex items-center justify-between text-xs text-[#5C7085]">
                          <span className="font-bold text-[#1A3A5F] flex items-center gap-1.5">
                            <span>بواسطة المعلم:</span>
                            <strong className="text-[#1F5AAA]">أ. {rec.teacherName}</strong>
                          </span>
                          <span className="text-[#5C7085] font-bold">
                            {formatArabicSchoolName(session.schoolName, session.schoolId)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB: STUDENT FIXED TERM 1 SCHEDULE (Strictly isolated to studentGrade) */}
        {navTab === 'schedule' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-base sm:text-lg text-[#1A3A5F] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                  <span>جدول الحصص الأسبوعي — {gradeLabel} (الترم الأول)</span>
                </h2>
                <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                  جدول ثابت ومعتمد طوال الترم الأول (السبت – الأربعاء • الحصة الأولى – السادسة)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNavTab('school_board')}
                className="px-3.5 py-2 rounded-xl bg-[#EEF5FC] hover:bg-[#DCEAF9] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black cursor-pointer transition"
              >
                العودة للوحة المدرسة
              </button>
            </div>

            {approvedGradeSchedules.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2 shadow-sm">
                <Calendar className="w-10 h-10 text-[#9BBEDF] mx-auto" />
                <h3 className="font-black text-sm text-[#1A3A5F]">
                  لم يتم اعتماد جدول حصص {gradeLabel} بعد
                </h3>
                <p className="text-xs text-[#5C7085] font-semibold max-w-md mx-auto leading-relaxed">
                  عند رفع المشرف لجدول صفك واعتماده من مدير المدرسة سيظهر هنا مباشرة بشكل ثابت للترم الأول.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {approvedGradeSchedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-sm"
                  >
                    <ScheduleGridView
                      entries={sch.entries}
                      title={`${sch.gradeLabel} — فصل ${sch.classNumber}`}
                      subtitle={`الترم ${sch.term} • معتمد من مدير المدرسة: ${sch.approvedBy || 'الإدارة المدرسية'}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: STUDENT PRIVATE ATTENDANCE & ABSENCE (Strictly this student ONLY) */}
        {navTab === 'attendance' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-base sm:text-lg text-[#1A3A5F] flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span>سجل حضوري وغيابي الخاص — {session.name}</span>
                </h2>
                <p className="text-xs text-[#5C7085] font-semibold mt-0.5 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>هذا السجل خاص بحسابك فقط ({gradeLabel}) ولا يظهر لك حضور أو غياب أي زميل آخر.</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNavTab('school_board')}
                className="px-3.5 py-2 rounded-xl bg-[#EEF5FC] hover:bg-[#DCEAF9] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black cursor-pointer transition"
              >
                العودة للوحة المدرسة
              </button>
            </div>

            {(() => {
              const presentCnt = myAttendanceLogs.filter((l) => l.status === 'حاضر').length;
              const excusedCnt = myAttendanceLogs.filter((l) => l.status === 'غائب بعذر').length;
              const unexcusedCnt = myAttendanceLogs.filter((l) => l.status === 'غائب بدون عذر').length;
              const lateCnt = myAttendanceLogs.filter((l) => l.status === 'متأخر').length;

              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                      <div className="text-[11px] font-black text-emerald-800">أيام الحضور</div>
                      <div className="text-xl font-black text-emerald-900 tabular-nums mt-0.5">{presentCnt}</div>
                    </div>
                    <div className="bg-sky-50 border border-[#C6DCF2] rounded-2xl p-3 text-center">
                      <div className="text-[11px] font-black text-[#1F5AAA]">غائب بعذر</div>
                      <div className="text-xl font-black text-[#1A3A5F] tabular-nums mt-0.5">{excusedCnt}</div>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-center">
                      <div className="text-[11px] font-black text-rose-800">غائب بدون عذر</div>
                      <div className="text-xl font-black text-rose-900 tabular-nums mt-0.5">{unexcusedCnt}</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
                      <div className="text-[11px] font-black text-amber-900">تأخر</div>
                      <div className="text-xl font-black text-amber-950 tabular-nums mt-0.5">{lateCnt}</div>
                    </div>
                  </div>

                  {myAttendanceLogs.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2 shadow-sm">
                      <UserCheck className="w-10 h-10 text-[#9BBEDF] mx-auto" />
                      <h3 className="font-black text-sm text-[#1A3A5F]">
                        لا توجد سجلات حضور أو غياب مسجلة باسمك حتى الآن
                      </h3>
                      <p className="text-xs text-[#5C7085] font-semibold max-w-md mx-auto leading-relaxed">
                        عند تسجيل المشرف لحضور صفك واعتماده من مدير المدرسة، ستظهر حالتك الشخصية هنا فقط.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {myAttendanceLogs.map((log) => {
                        const badgeCls =
                          log.status === 'حاضر'
                            ? 'bg-emerald-600 text-white'
                            : log.status === 'غائب بعذر'
                            ? 'bg-[#1F5AAA] text-white'
                            : log.status === 'متأخر'
                            ? 'bg-amber-500 text-white'
                            : 'bg-rose-600 text-white';
                        return (
                          <div
                            key={log.id}
                            className="bg-white rounded-2xl p-4 border border-[#DCE7F3] shadow-2xs flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-black ${badgeCls}`}>
                                  {log.status}
                                </span>
                                <span className="font-black text-sm text-[#1A3A5F] tabular-nums">
                                  {log.date}
                                </span>
                                <span className="text-xs font-bold text-[#5C7085]">
                                  {log.gradeLabel} — فصل {log.classNumber}
                                </span>
                              </div>
                              {log.note && (
                                <p className="text-xs font-semibold text-[#1A3A5F]">
                                  ملاحظة: {log.note}
                                </p>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold text-[#5C7085]">
                              بواسطة: {log.recordedBy}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Floating Bottom Navigation Bar: Clean Crisp White matching Reference Screenshot */}
      <nav
        aria-label="التنقل السفلي"
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-1.5 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl z-40"
      >
        <div className="rounded-[24px] sm:rounded-[28px] bg-white/95 backdrop-blur-md border border-[#DCE7F3] shadow-[0_-4px_20px_rgba(26,58,95,0.08)] p-1 sm:p-1.5 grid grid-cols-5 gap-0.5 sm:gap-1 items-center text-center">
          {/* 1. لوحة المدرسة */}
          <button
            type="button"
            onClick={() => {
              unlockNotificationAudio();
              setNavTab('school_board');
            }}
            className={`min-h-[50px] py-1.5 px-0.5 sm:px-1 rounded-2xl sm:rounded-full flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
              navTab === 'school_board'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <School className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span className="text-[11px] leading-tight text-center font-bold">لوحة المدرسة</span>
          </button>

          {/* 2. واجباتي */}
          <button
            type="button"
            onClick={() => {
              unlockNotificationAudio();
              setNavTab('homework');
              setHomeworkCount(0);
            }}
            className={`min-h-[50px] py-1.5 px-0.5 sm:px-1 rounded-2xl sm:rounded-full flex flex-col items-center justify-center gap-0.5 relative transition-all cursor-pointer ${
              navTab === 'homework'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <div className="relative">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              {openHomeworkCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center border border-white shadow-xs">
                  {openHomeworkCount}
                </span>
              )}
              {openHomeworkCount > 0 && (
                <Bell className="w-3 h-3 text-amber-500 absolute -top-2.5 -left-1.5 animate-bounce" />
              )}
            </div>
            <span className="text-[11px] leading-tight text-center font-bold">واجباتي</span>
          </button>

          {/* 3. التعاميم */}
          <button
            type="button"
            onClick={() => {
              unlockNotificationAudio();
              markAllAnnouncementsSeen();
              setNavTab('announcements');
            }}
            className={`min-h-[50px] py-1.5 px-0.5 sm:px-1 rounded-2xl sm:rounded-full flex flex-col items-center justify-center gap-0.5 relative transition-all cursor-pointer ${
              navTab === 'announcements'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <div className="relative">
              <Megaphone className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              {unreadAnnouncementsCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center border border-white shadow-xs">
                  {unreadAnnouncementsCount}
                </span>
              )}
              {unreadAnnouncementsCount > 0 && (
                <Bell className="w-3 h-3 text-amber-500 absolute -top-2.5 -left-1.5 animate-bounce" />
              )}
            </div>
            <span className="text-[11px] leading-tight text-center font-bold">التعاميم</span>
          </button>

          {/* 4. درجاتي */}
          <button
            type="button"
            onClick={() => {
              unlockNotificationAudio();
              markAllGradesSeen();
              setNavTab('grades');
            }}
            className={`min-h-[50px] py-1.5 px-0.5 sm:px-1 rounded-2xl sm:rounded-full flex flex-col items-center justify-center gap-0.5 relative transition-all cursor-pointer ${
              navTab === 'grades'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <div className="relative">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              {gradesTabBadgeCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center border border-white shadow-xs">
                  {gradesTabBadgeCount}
                </span>
              )}
              {gradesTabBadgeCount > 0 && (
                <Bell className="w-3 h-3 text-amber-500 absolute -top-2.5 -left-1.5 animate-bounce" />
              )}
            </div>
            <span className="text-[11px] leading-tight text-center font-bold">درجاتي</span>
          </button>

          {/* 5. توصيات المعلم */}
          <button
            type="button"
            onClick={() => {
              unlockNotificationAudio();
              markAllRecommendationsSeen();
              setNavTab('recommendations');
            }}
            className={`min-h-[50px] py-1.5 px-0.5 sm:px-1 rounded-2xl sm:rounded-full flex flex-col items-center justify-center gap-0.5 relative transition-all cursor-pointer ${
              navTab === 'recommendations'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <div className="relative">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              {unreadRecommendationsCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center border border-white shadow-xs">
                  {unreadRecommendationsCount}
                </span>
              )}
              {unreadRecommendationsCount > 0 && (
                <Bell className="w-3 h-3 text-amber-500 absolute -top-2.5 -left-1.5 animate-bounce" />
              )}
            </div>
            <span className="text-[11px] leading-tight text-center font-bold">توصيات المعلم</span>
          </button>
        </div>
      </nav>

      {/* Upload Homework Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 text-right shadow-2xl border border-[#B3CDE8]">
            <h3 className="font-black text-base text-[#1A3A5F] mb-1">
              رفع حل الواجب المصور
            </h3>
            <p className="text-xs text-[#5C7085] font-semibold mb-4">
              المادة: <strong className="text-[#1A3A5F]">{currentAssigned.subject}</strong> • {currentAssigned.questionText}
            </p>

            <form onSubmit={handleSubmitHomework} className="space-y-4">
              <input
                type="file"
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageFileChange}
              />
              <input
                type="file"
                ref={galleryInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
              />

              <div>
                <label className="block text-xs font-black text-[#1A3A5F] mb-1">
                  صورة الدفتر بخط اليد:
                </label>
                <div className="min-h-[180px] w-full border-2 border-dashed border-[#9BBEDF] rounded-xl bg-[#F4F8FC] flex flex-col items-center justify-center relative overflow-hidden">
                  {!selectedImage ? (
                    <div className="flex flex-col items-center justify-center p-3 text-center">
                      <Camera className="w-12 h-12 text-[#1F5AAA] mb-2" />
                      <p className="text-xs font-bold text-[#1A3A5F] mb-3">اضغط لتصوير الواجب أو اختياره من المعرض</p>
                      <div className="flex items-center justify-center flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white border border-[#194B91] text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                        >
                          <Camera className="w-3.5 h-3.5 text-white" />
                          <span>تصوير بالكاميرا</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-[#EEF5FC] hover:bg-[#E0ECF9] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>من المعرض</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative w-full h-full">
                      <img
                        src={selectedImage}
                        alt="صورة حل الواجب"
                        className="w-full h-full object-contain bg-black/5"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center shadow-md cursor-pointer text-xs"
                        title="حذف الصورة"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-[#1A3A5F] mb-1">
                  ملاحظات أو تعليق الطالب:
                </label>
                <textarea
                  rows={2}
                  value={hwNotes}
                  onChange={(e) => setHwNotes(e.target.value)}
                  placeholder="تم حل المسألة في الدفتر بخط اليد مع الرسم التوضيحي..."
                  className="w-full p-2.5 text-xs rounded-xl border border-[#DCE7F3] bg-white text-[#1A3A5F] focus:outline-[#1F5AAA]"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#1A3A5F] bg-slate-100 hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!selectedImage || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] disabled:opacity-50 disabled:cursor-not-allowed text-white border border-[#194B91] text-xs font-black shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'جارٍ الإرسال...' : 'إرسال الواجب للمعلم'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Right RTL Sidebar Drawer */}
      <UnifiedSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        session={session}
        activeView={
          navTab === 'schedule'
            ? 'schedule'
            : navTab === 'attendance'
            ? 'student_attendance'
            : activeArchiveModal || 'dashboard'
        }
        onSelectView={(v: string) => {
          if (v === 'dashboard') {
            setActiveArchiveModal(null);
            setNavTab('school_board');
          } else if (v === 'schedule') {
            setActiveArchiveModal(null);
            setNavTab('schedule');
          } else if (v === 'student_attendance') {
            setActiveArchiveModal(null);
            setNavTab('attendance');
          } else {
            setActiveArchiveModal(v as StudentArchiveSection);
          }
        }}
        onOpenAccount={() => setIsAccountModalOpen(true)}
      />

      {/* Student Archive 6 Sub-sections Modal */}
      <StudentArchiveModal
        isOpen={!!activeArchiveModal}
        onClose={() => setActiveArchiveModal(null)}
        section={activeArchiveModal}
        session={session}
        questions={questions}
        archivedHomeworkBatches={combinedArchivedHomeworkBatches}
        archivedSchoolActivityBatches={combinedSchoolActivityArchives}
        approvedSchoolActivities={approvedSchoolActivities}
        submissions={studentSubmissions}
        studentGrades={studentGrades}
        archivedGradebooks={archivedGradebooks}
        announcements={announcements}
        recommendations={recommendations}
      />

      {/* Student Account Modal (From Sidebar Settings) */}
      <StudentAccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        session={session}
        gradeLabel={gradeLabel}
        onLock={() => window.dispatchEvent(new CustomEvent('trigger-app-lock'))}
        onLogout={() => window.dispatchEvent(new CustomEvent('trigger-app-logout'))}
      />
    </div>
  );
};
