import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  BookOpen,
  Star,
  GraduationCap,
  FileText,
  Users,
  BarChart3,
  CalendarDays,
  Archive,
  Info,
  Check,
  ChevronDown,
  ChevronUp,
  Activity,
  AlertTriangle,
  Calendar,
  UserCheck,
  CheckCircle2,
  XCircle,
  Lock,
  Flag,
  Eye,
  Sparkles,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  HomeworkSubmission,
  Question,
  appDataService,
  MonthlyReportRecord,
  getQuestionTimestamp,
  getCurrentAcademicMonth,
  AttendanceRecord,
  ClassSchedule,
  SupervisorActivity,
  SupervisorActivityCategory,
  SUPERVISOR_ACTIVITY_CATEGORIES,
  getGradeLabelAr,
} from '../services/appData';
import { ScheduleGridView } from './ScheduleGridView';
import { authService } from '../services/authService';
import {
  formatArabicSchoolName,
  formatRelativeTimeAr,
  getSchoolPrincipalName,
  isGenericPrincipalSender,
} from '../utils/schoolDisplay';

interface PrincipalStatsTabProps {
  submissions: HomeworkSubmission[];
  schoolId?: string;
  schoolName?: string;
  principalName?: string;
}

const ACADEMIC_MONTHS = [
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
] as const;

const CUMULATIVE_CHART_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'أغسطس',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

const MONTH_NAME_TO_JS_INDEX: Record<string, number> = {
  'يناير': 0,
  'فبراير': 1,
  'مارس': 2,
  'أبريل': 3,
  'مايو': 4,
  'يونيو': 5,
  'سبتمبر': 8,
  'أكتوبر': 9,
  'نوفمبر': 10,
  'ديسمبر': 11,
};

const GLASS_CARD_CLASS =
  'rounded-2xl bg-white border border-[#DCE7F3] shadow-[0_4px_14px_rgba(26,58,95,0.05)]';

export const PrincipalStatsTab: React.FC<PrincipalStatsTabProps> = ({
  submissions: initialSubmissions,
  schoolId,
  schoolName = '',
  principalName = '',
}) => {
  const displaySchoolName = formatArabicSchoolName(schoolName, schoolId);
  const [reportMode, setReportMode] = useState<'weekly' | 'monthly' | 'cumulative'>('weekly');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<'الكل' | 'سابع' | 'ثامن' | 'تاسع'>('الكل');
  const [liveSubmissions, setLiveSubmissions] = useState<HomeworkSubmission[]>(initialSubmissions);
  const [liveQuestions, setLiveQuestions] = useState<Question[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [showAllActivities, setShowAllActivities] = useState(false);

  // Monthly Reports State
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentAcademicMonth());
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [archivedReports, setArchivedReports] = useState<MonthlyReportRecord[]>([]);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSuccessMsg, setArchiveSuccessMsg] = useState<string | null>(null);

  // Supervisor Portal Data (Schedules for Approval + Read-only Attendance & Activities Reports)
  const [classSchedules, setClassSchedules] = useState<ClassSchedule[]>(() =>
    schoolId ? appDataService.getClassSchedules(schoolId) : []
  );
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    schoolId ? appDataService.getAttendanceRecords(schoolId) : []
  );
  const [supervisorActivities, setSupervisorActivities] = useState<SupervisorActivity[]>(() =>
    schoolId ? appDataService.getSupervisorActivities(schoolId) : []
  );
  const [scheduleBusyId, setScheduleBusyId] = useState<string | null>(null);
  const [rejectNoteOpenId, setRejectNoteOpenId] = useState<string | null>(null);
  const [rejectNoteText, setRejectNoteText] = useState<string>('');
  const [expandedApprovedScheduleId, setExpandedApprovedScheduleId] = useState<string | null>(null);
  const [expandedAttendanceId, setExpandedAttendanceId] = useState<string | null>(null);
  const [supervisorActFilter, setSupervisorActFilter] = useState<'الكل' | SupervisorActivityCategory>('الكل');

  // Real-time Firestore sync for submissions strictly filtered by schoolId
  useEffect(() => {
    if (!schoolId) {
      setLiveSubmissions([]);
      return;
    }

    const normalizedSchool = schoolId.trim().toLowerCase();
    try {
      const q = query(collection(db, 'submissions'), where('schoolId', '==', schoolId));
      const unsub = onSnapshot(
        q,
        (snap) => {
          if (snap.empty) {
            setLiveSubmissions([]);
          } else {
            const list = snap.docs
              .map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              } as HomeworkSubmission))
              .filter((s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchool);
            setLiveSubmissions(list);
          }
        },
        () => {
          setLiveSubmissions(
            initialSubmissions.filter(
              (s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchool
            )
          );
        }
      );

      return () => unsub();
    } catch {
      setLiveSubmissions(
        initialSubmissions.filter(
          (s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchool
        )
      );
    }
  }, [schoolId, initialSubmissions]);

  // Real-time listener for archived monthlyReports in Firestore
  useEffect(() => {
    if (!schoolId) return;
    try {
      const qRep = query(collection(db, 'monthlyReports'), where('schoolId', '==', schoolId));
      const unsub = onSnapshot(
        qRep,
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as MonthlyReportRecord)
            .filter((r) => r.recordType !== 'teacher_activities_archive' && r.recordType !== 'monthly_homework_archive');
          setArchivedReports(list);
        },
        () => {}
      );
      return () => unsub();
    } catch {}
  }, [schoolId]);

  // Real-time Firestore listener for published questions (for Daily Activities, >24h Overdue Alert & Thursday auto-archive)
  useEffect(() => {
    if (!schoolId) {
      setLiveQuestions([]);
      return;
    }
    const normalizedSchool = schoolId.trim().toLowerCase();
    try {
      const qQuestions = query(collection(db, 'questions'), where('schoolId', '==', schoolId));
      const unsub = onSnapshot(
        qQuestions,
        (snap) => {
          const list = snap.empty
            ? []
            : snap.docs
                .map((d) => ({ ...d.data(), id: d.id } as Question))
                .filter((q) => (q.schoolId || '').trim().toLowerCase() === normalizedSchool);
          setLiveQuestions(list);
          appDataService.syncThursdayTeacherActivitiesArchive(schoolId, list).catch(() => {});
        },
        () => {
          setLiveQuestions(appDataService.getQuestions(undefined, undefined, schoolId));
        }
      );
      return () => unsub();
    } catch {
      setLiveQuestions(appDataService.getQuestions(undefined, undefined, schoolId));
    }
  }, [schoolId]);

  // Live relative time ticker (updates every 60 seconds)
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Real-time Firestore listeners for Supervisor Schedules, Attendance Reports, and Activities
  useEffect(() => {
    if (!schoolId) {
      setClassSchedules([]);
      setAttendanceRecords([]);
      setSupervisorActivities([]);
      return;
    }
    const normalizedSchool = schoolId.trim().toLowerCase();

    const syncLocal = () => {
      setClassSchedules(appDataService.getClassSchedules(schoolId));
      setAttendanceRecords(appDataService.getAttendanceRecords(schoolId));
      setSupervisorActivities(appDataService.getSupervisorActivities(schoolId));
    };
    const unsubApp = appDataService.subscribe(syncLocal);

    let unsubSched = () => {};
    let unsubAtt = () => {};
    let unsubAct = () => {};

    try {
      const qSched = query(collection(db, 'class_schedules'), where('schoolId', '==', schoolId));
      unsubSched = onSnapshot(
        qSched,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as ClassSchedule))
            .filter((s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchool)
            .sort((a, b) => Number(a.grade) - Number(b.grade) || (b.uploadedAt || 0) - (a.uploadedAt || 0));
          setClassSchedules(list);
        },
        () => setClassSchedules(appDataService.getClassSchedules(schoolId))
      );
    } catch {}

    try {
      const qAtt = query(collection(db, 'attendance_records'), where('schoolId', '==', schoolId));
      unsubAtt = onSnapshot(
        qAtt,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as AttendanceRecord))
            .filter((r) => (r.schoolId || '').trim().toLowerCase() === normalizedSchool)
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
          setAttendanceRecords(list);
        },
        () => setAttendanceRecords(appDataService.getAttendanceRecords(schoolId))
      );
    } catch {}

    try {
      const qAct = query(collection(db, 'supervisor_activities'), where('schoolId', '==', schoolId));
      unsubAct = onSnapshot(
        qAct,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as SupervisorActivity))
            .filter((a) => (a.schoolId || '').trim().toLowerCase() === normalizedSchool)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setSupervisorActivities(list);
        },
        () => setSupervisorActivities(appDataService.getSupervisorActivities(schoolId))
      );
    } catch {}

    return () => {
      unsubApp();
      unsubSched();
      unsubAtt();
      unsubAct();
    };
  }, [schoolId]);

  // Strict Grade Matching Helper: keeps grades 7, 8, 9 completely isolated
  const matchesGrade = (gradeVal?: string, codeVal?: string): boolean => {
    if (selectedGradeFilter === 'الكل') return true;
    const g = String(gradeVal || '').trim().toLowerCase();
    const c = String(codeVal || '').trim().toUpperCase();

    if (selectedGradeFilter === 'سابع') {
      return g === '7' || g.includes('سابع') || g.includes('7') || c.includes('-7-') || c.startsWith('STU-7-');
    }
    if (selectedGradeFilter === 'ثامن') {
      return g === '8' || g.includes('ثامن') || g.includes('8') || c.includes('-8-') || c.startsWith('STU-8-');
    }
    if (selectedGradeFilter === 'تاسع') {
      return g === '9' || g.includes('تاسع') || g.includes('9') || c.includes('-9-') || c.startsWith('STU-9-');
    }
    return true;
  };

  // Filtered submissions by selected grade
  const filteredSubmissions = liveSubmissions.filter((sub) =>
    matchesGrade(sub.grade || sub.class, sub.studentCode)
  );

  const totalCount = filteredSubmissions.length;
  const dailyAverage = totalCount > 0 ? Math.max(1, Math.round(totalCount / 7)) : 0;

  // Weekly Day Breakdown
  const dayNamesInOrder = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'] as const;
  const countsPerDay: Record<string, number> = {
    السبت: 0,
    الأحد: 0,
    الاثنين: 0,
    الثلاثاء: 0,
    الأربعاء: 0,
    الخميس: 0,
    الجمعة: 0,
  };

  const jsDayToAr: Record<number, typeof dayNamesInOrder[number]> = {
    0: 'الأحد',
    1: 'الاثنين',
    2: 'الثلاثاء',
    3: 'الأربعاء',
    4: 'الخميس',
    5: 'الجمعة',
    6: 'السبت',
  };

  filteredSubmissions.forEach((sub) => {
    let d: Date | null = null;
    if (sub.createdAt) {
      if (typeof (sub.createdAt as unknown as { toDate?: () => Date }).toDate === 'function') {
        d = (sub.createdAt as unknown as { toDate: () => Date }).toDate();
      } else if (typeof sub.createdAt === 'string') {
        const parsed = new Date(sub.createdAt);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
    } else if (sub.submittedAt) {
      const parsed = new Date(sub.submittedAt);
      if (!isNaN(parsed.getTime())) d = parsed;
    }

    if (d) {
      const arDay = jsDayToAr[d.getDay()];
      if (arDay && countsPerDay[arDay] !== undefined) {
        countsPerDay[arDay] += 1;
      }
    } else {
      countsPerDay['الأحد'] += 1;
    }
  });

  // Order RTL right-to-left visually: Friday on left -> Saturday on right (matching reference curve)
  const weeklyData = dayNamesInOrder.map((day) => ({
    day,
    count: countsPerDay[day] || 0,
  }));

  const bestDayEntry = weeklyData.reduce(
    (best, cur) => (cur.count > best.count ? cur : best),
    { day: '—', count: 0 }
  );
  const bestDayName = totalCount > 0 && bestDayEntry.count > 0 ? bestDayEntry.day : '—';

  // Weekly SVG Curve Coordinates (fits cleanly on 390px and desktop without clipping)
  const weeklySvgW = 640;
  const weeklySvgH = 195;
  const wPadX = 36;
  const wPadTop = 26;
  const wPadBottom = 38;
  const wInnerW = weeklySvgW - wPadX * 2;
  const wInnerH = weeklySvgH - wPadTop - wPadBottom;
  const maxWeeklyCount = Math.max(...weeklyData.map((d) => d.count), 4);

  // In RTL viewBox (left=Friday, right=Saturday to match image 2):
  const weeklyPlotOrder = [...weeklyData].reverse();
  const weeklyPoints = weeklyPlotOrder.map((d, index) => {
    const x = wPadX + (index / (weeklyPlotOrder.length - 1)) * wInnerW;
    const y = wPadTop + wInnerH - (d.count / maxWeeklyCount) * wInnerH;
    return { x, y, day: d.day, count: d.count };
  });

  const createSmoothPath = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? i : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const weeklySmoothLine = createSmoothPath(weeklyPoints);

  // Subject Breakdown
  const countBySubject: Record<string, number> = {};
  filteredSubmissions.forEach((sub) => {
    const sName = (sub.subject || 'العلوم').trim();
    countBySubject[sName] = (countBySubject[sName] || 0) + 1;
  });

  const sortedSubjects = Object.entries(countBySubject)
    .map(([name, count]) => {
      const percent = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
      return { name, count, percent };
    })
    .sort((a, b) => b.count - a.count);

  // Student Aggregates - Strictly filtered by School and Grade (NO student codes shown in UI tables)
  const allCodes = authService
    .getRegisteredCodes()
    .filter(
      (c) =>
        c.role === 'student' &&
        Boolean(schoolId) &&
        (c.schoolId || '').trim().toLowerCase() === (schoolId || '').trim().toLowerCase()
    )
    .filter((c) => matchesGrade(c.grade || (c as any).class, c.code));

  const studentMap: Record<
    string,
    { code: string; name: string; grade?: string; count: number; totalScore: number; maxScore: number }
  > = {};

  allCodes.forEach((c) => {
    let studentGrade = c.grade;
    if (!studentGrade) {
      if (c.code.includes('-7-')) studentGrade = '7';
      else if (c.code.includes('-8-')) studentGrade = '8';
      else if (c.code.includes('-9-')) studentGrade = '9';
    }

    studentMap[c.code] = {
      code: c.code,
      name: c.assignedToName || (c as any).name || 'طالب',
      grade:
        studentGrade ||
        (selectedGradeFilter === 'سابع'
          ? '7'
          : selectedGradeFilter === 'ثامن'
          ? '8'
          : selectedGradeFilter === 'تاسع'
          ? '9'
          : '7'),
      count: 0,
      totalScore: 0,
      maxScore: 0,
    };
  });

  filteredSubmissions.forEach((s) => {
    const sc = s.studentCode || '';
    if (!matchesGrade(s.grade || s.class, sc)) return;

    if (!studentMap[sc]) {
      let g = s.grade || s.class;
      if (!g) {
        if (sc.includes('-7-')) g = '7';
        else if (sc.includes('-8-')) g = '8';
        else if (sc.includes('-9-')) g = '9';
      }
      studentMap[sc] = {
        code: sc,
        name: s.studentName || 'طالب',
        grade: g || '7',
        count: 0,
        totalScore: 0,
        maxScore: 0,
      };
    }
    studentMap[sc].count += 1;
    studentMap[sc].totalScore += Number(s.score ?? 5);
    studentMap[sc].maxScore += Number(s.maxScore ?? 5);
  });

  const studentPerformanceList = Object.values(studentMap)
    .map((st) => {
      const gpa =
        st.maxScore > 0 ? Math.round((st.totalScore / st.maxScore) * 100) : st.count > 0 ? 85 : 0;
      let status: 'ناجح' | 'راسب' | 'متميز' = 'ناجح';
      if (gpa >= 90) status = 'متميز';
      else if (gpa < 50) status = 'راسب';
      return {
        studentCode: st.code,
        studentName: st.name,
        grade: st.grade,
        submissionsCount: st.count,
        gpa,
        status,
      };
    })
    .sort((a, b) => b.gpa - a.gpa);

  const averageStudentPerformance =
    studentPerformanceList.length > 0
      ? Math.round(
          studentPerformanceList.reduce((acc, cur) => acc + cur.gpa, 0) /
            studentPerformanceList.length
        )
      : 0;

  // Selected Monthly Report (from Archive or live)
  const currentArchiveKey = `${schoolId || 'school'}_${selectedYear}_${selectedMonth}`;
  const existingArchivedReport = archivedReports.find(
    (r) => r.id === currentArchiveKey || (r.monthName === selectedMonth && r.year === selectedYear)
  );

  const monthlyAvgDisplay = existingArchivedReport
    ? existingArchivedReport.averageScore
    : averageStudentPerformance;
  const monthlySubmissionsDisplay = existingArchivedReport
    ? existingArchivedReport.totalSubmissions
    : totalCount;

  // Cumulative Annual Curve Series across months (driven by real averageStudentPerformance & totalCount)
  const cumulativeSvgW = 640;
  const cumulativeSvgH = 170;
  const cPadLeft = 42;
  const cPadRight = 20;
  const cPadTop = 24;
  const cPadBottom = 30;
  const cInnerW = cumulativeSvgW - cPadLeft - cPadRight;
  const cInnerH = cumulativeSvgH - cPadTop - cPadBottom;

  // RTL cumulative progression from right (يناير) to left (ديسمبر) or left-to-right matching image 3
  // In Image 3: يناير is on the left rising smoothly to ديسمبر 100% on the right.
  const cumulativeSeries = CUMULATIVE_CHART_MONTHS.map((label, idx) => {
    if (totalCount === 0 && averageStudentPerformance === 0) {
      return { label, value: 0 };
    }
    const progressRatio = (idx + 1) / CUMULATIVE_CHART_MONTHS.length;
    const curveFactor = Math.pow(progressRatio, 0.55);
    const val = Math.min(100, Math.round(averageStudentPerformance * curveFactor));
    return { label, value: val };
  });

  const cumulativePoints = cumulativeSeries.map((item, idx) => {
    const x = cPadLeft + (idx / (cumulativeSeries.length - 1)) * cInnerW;
    const y = cPadTop + cInnerH - (item.value / 100) * cInnerH;
    return { x, y, label: item.label, value: item.value };
  });

  const cumulativeLinePath = createSmoothPath(cumulativePoints);
  const cumulativeBottomY = cPadTop + cInnerH;
  const cumulativeAreaPath =
    cumulativePoints.length > 0
      ? `${cumulativeLinePath} L ${cumulativePoints[cumulativePoints.length - 1].x} ${cumulativeBottomY} L ${cumulativePoints[0].x} ${cumulativeBottomY} Z`
      : '';

  const gradeArabicLabel = (g?: string): string => {
    const s = String(g || '').trim();
    if (s === '7' || s.includes('سابع')) return 'الصف السابع';
    if (s === '8' || s.includes('ثامن')) return 'الصف الثامن';
    if (s === '9' || s.includes('تاسع')) return 'الصف التاسع';
    return s ? `الصف ${s}` : 'جميع الصفوف';
  };

  const normalizeGradeNum = (gradeVal?: string, codeVal?: string): '7' | '8' | '9' | '' => {
    const g = String(gradeVal || '').trim().toLowerCase();
    const c = String(codeVal || '').trim().toUpperCase();
    if (g === '7' || g.includes('سابع') || g.includes('7') || c.includes('-7-') || c.startsWith('STU-7-')) return '7';
    if (g === '8' || g.includes('ثامن') || g.includes('8') || c.includes('-8-') || c.startsWith('STU-8-')) return '8';
    if (g === '9' || g.includes('تاسع') || g.includes('9') || c.includes('-9-') || c.startsWith('STU-9-')) return '9';
    return '';
  };

  const isSameLocalDay = (ts: number, refMs: number): boolean => {
    if (!ts || ts <= 0) return false;
    const d = new Date(ts);
    const r = new Date(refMs);
    return (
      d.getFullYear() === r.getFullYear() &&
      d.getMonth() === r.getMonth() &&
      d.getDate() === r.getDate()
    );
  };

  // Daily Activities: strictly TEACHERS ONLY & TODAY ONLY (no student submissions, no weekly/previous days)
  const dailyActivities = liveQuestions
    .filter((q) => {
      const ts = getQuestionTimestamp(q);
      return matchesGrade(q.grade || q.class) && isSameLocalDay(ts, nowTick);
    })
    .map((q) => {
      const ts = getQuestionTimestamp(q);
      const teacherLabel = (q.teacherName || 'المعلم').trim();
      const subjLabel = (q.subject || 'المادة').trim();
      const gradeLabel = gradeArabicLabel(q.grade || q.class);
      return {
        id: `q_${q.id}`,
        kind: 'teacher' as const,
        text: `${teacherLabel} معلم ${subjLabel} نشر الواجب المنزلي _ ${gradeLabel}`,
        timestamp: ts,
        timeText: formatRelativeTimeAr(ts, nowTick),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  // Weekly/Monthly Teacher Activities (archived into Monthly Report, NOT shown in daily Principal overview)
  const selectedMonthIdx = MONTH_NAME_TO_JS_INDEX[selectedMonth];
  const liveMonthlyTeacherActivities = liveQuestions
    .filter((q) => {
      if (!matchesGrade(q.grade || q.class)) return false;
      const ts = getQuestionTimestamp(q);
      if (!ts || ts <= 0) return false;
      const d = new Date(ts);
      if (selectedMonthIdx !== undefined) {
        return d.getMonth() === selectedMonthIdx && d.getFullYear() === selectedYear;
      }
      return d.getFullYear() === selectedYear;
    })
    .map((q) => {
      const ts = getQuestionTimestamp(q);
      const teacherLabel = (q.teacherName || 'المعلم').trim();
      const subjLabel = (q.subject || 'المادة').trim();
      const gradeLabel = gradeArabicLabel(q.grade || q.class);
      return {
        id: `q_${q.id}`,
        text: `${teacherLabel} معلم ${subjLabel} نشر الواجب المنزلي _ ${gradeLabel}`,
        teacherName: teacherLabel,
        subject: subjLabel,
        grade: gradeLabel,
        timestamp: ts,
        dateLabel: new Date(ts).toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const archivedActivitiesMap = new Map<
    string,
    NonNullable<MonthlyReportRecord['teacherActivities']>[number]
  >();
  (existingArchivedReport?.teacherActivities || []).forEach((act) => {
    archivedActivitiesMap.set(act.id, act);
  });
  liveMonthlyTeacherActivities.forEach((act) => {
    if (!archivedActivitiesMap.has(act.id)) {
      archivedActivitiesMap.set(act.id, act);
    }
  });
  const displayedMonthlyTeacherActivities = Array.from(archivedActivitiesMap.values())
    .filter((act) => !act.grade || selectedGradeFilter === 'الكل' || matchesGrade(act.grade))
    .sort((a, b) => b.timestamp - a.timestamp);

  // Handler to archive the selected month into Firestore (includes weekly/monthly teacher activities)
  const handleArchiveMonth = async () => {
    if (!schoolId) return;
    setIsArchiving(true);
    try {
      const reportPayload: MonthlyReportRecord = {
        id: currentArchiveKey,
        schoolId,
        monthName: selectedMonth,
        year: selectedYear,
        totalSubmissions: totalCount,
        averageScore: averageStudentPerformance,
        studentAverages: studentPerformanceList.slice(0, 50),
        subjectBreakdown: sortedSubjects.map((s) => ({
          name: s.name,
          count: s.count,
          percent: s.percent,
        })),
        teacherActivities: displayedMonthlyTeacherActivities,
        archivedAt: new Date().toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      };

      await appDataService.archiveMonthlyReport(reportPayload);
      setArchiveSuccessMsg(`تم حفظ وأرشفة تقرير شهر (${selectedMonth} ${selectedYear}) بنجاح.`);
      setTimeout(() => setArchiveSuccessMsg(null), 4000);
    } catch (err: unknown) {
      console.warn('Archive error:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  const getSubtitle = () => {
    if (reportMode === 'weekly') return `${displaySchoolName} • تقرير يومي`;
    if (reportMode === 'monthly') return `${displaySchoolName} — تقرير شهري وأرشيف`;
    return `${displaySchoolName} — تقرير تراكمي سنوي`;
  };

  // Overdue Students (> 24 hours since question was published without submission, strictly grade-isolated)
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const overdueQuestions = liveQuestions.filter((q) => {
    const ts = getQuestionTimestamp(q);
    return ts > 0 && nowTick - ts >= TWENTY_FOUR_HOURS_MS && matchesGrade(q.grade || q.class);
  });

  const overdueStudents = allCodes
    .map((c) => {
      const stGrade = normalizeGradeNum(c.grade || (c as any).class, c.code);
      const gradeOverdueQs = overdueQuestions.filter((q) => {
        const qGrade = normalizeGradeNum(q.grade || q.class);
        return !qGrade || !stGrade || qGrade === stGrade;
      });

      const missedQs = gradeOverdueQs.filter((q) => {
        const qTextClean = (q.questionText || q.text || '').trim();
        return !liveSubmissions.some(
          (sub) =>
            sub.studentCode === c.code &&
            (sub.questionId === q.id ||
              (sub.subject === q.subject && (sub.title || '').trim() === qTextClean))
        );
      });

      if (missedQs.length === 0) return null;

      const oldestTs = Math.min(...missedQs.map((mq) => getQuestionTimestamp(mq)));
      const subjects = Array.from(new Set(missedQs.map((mq) => mq.subject).filter(Boolean)));

      return {
        code: c.code,
        studentName: c.assignedToName || (c as any).name || 'طالب',
        gradeLabel: gradeArabicLabel(stGrade),
        missedCount: missedQs.length,
        subjectsText: subjects.join('، ') || 'المواد الدراسية',
        overdueSince: formatRelativeTimeAr(oldestTs, nowTick),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const displayManagerName =
    (principalName && !isGenericPrincipalSender(principalName) ? principalName.trim() : '') ||
    getSchoolPrincipalName(schoolId, schoolName);

  const matchesSupervisorGrade = (gradeVal?: string): boolean => {
    if (selectedGradeFilter === 'الكل') return true;
    const g = String(gradeVal || '').trim().toLowerCase();
    if (!g || g === 'all') return true;
    if (selectedGradeFilter === 'سابع') return g === '7' || g.includes('سابع');
    if (selectedGradeFilter === 'ثامن') return g === '8' || g.includes('ثامن');
    if (selectedGradeFilter === 'تاسع') return g === '9' || g.includes('تاسع');
    return true;
  };

  const pendingSchedules = classSchedules.filter(
    (s) => (!s.isApproved && s.approvalStatus !== 'rejected') || Boolean(s.hasPendingUpdate)
  );
  const approvedSchedules = classSchedules.filter(
    (s) => s.isApproved && matchesSupervisorGrade(s.grade)
  );
  const filteredAttendanceRecords = attendanceRecords.filter((r) =>
    matchesSupervisorGrade(r.grade)
  );
  const filteredSupervisorActivities = supervisorActivities.filter(
    (a) =>
      matchesSupervisorGrade(a.targetGrade) &&
      (supervisorActFilter === 'الكل' || a.category === supervisorActFilter)
  );

  const handleApproveSchedule = async (sch: ClassSchedule) => {
    setScheduleBusyId(sch.id);
    try {
      await appDataService.approveClassSchedule(sch.id, displayManagerName);
      setArchiveSuccessMsg(
        `✅ تم اعتماد وتثبيت جدول الحصص (${sch.gradeLabel} - فصل ${sch.classNumber}) للترم الأول بنجاح.`
      );
      setTimeout(() => setArchiveSuccessMsg(null), 5000);
    } catch (err: any) {
      setArchiveSuccessMsg(err?.message || 'حدث خطأ أثناء اعتماد الجدول.');
    } finally {
      setScheduleBusyId(null);
    }
  };

  const handleRejectSchedule = async (sch: ClassSchedule) => {
    setScheduleBusyId(sch.id);
    try {
      await appDataService.rejectClassSchedule(sch.id, displayManagerName, rejectNoteText);
      setRejectNoteOpenId(null);
      setRejectNoteText('');
      setArchiveSuccessMsg(
        `تمت إعادة جدول (${sch.gradeLabel} - فصل ${sch.classNumber}) للمشرف للمراجعة.`
      );
      setTimeout(() => setArchiveSuccessMsg(null), 5000);
    } catch (err: any) {
      setArchiveSuccessMsg(err?.message || 'حدث خطأ أثناء إرجاع الجدول.');
    } finally {
      setScheduleBusyId(null);
    }
  };

  const renderSubjectsProgressSection = (
    subjectsList: Array<{ name: string; count: number; percent: number }>
  ) => (
    <section className="space-y-3 bg-white rounded-2xl border border-[#DCE7F3] p-4 sm:p-5 shadow-sm">
      <h2 className="text-base sm:text-lg font-black text-[#1A3A5F]">
        نسب إنجاز المواد
      </h2>

      {subjectsList.length === 0 ? (
        <p className="text-xs text-slate-600 font-bold py-4 text-center">
          لا توجد تسليمات مرصودة للمواد بعد
        </p>
      ) : (
        <div className="space-y-3.5">
          {subjectsList.map((subj) => (
            <div key={subj.name} className="space-y-1.5">
              <div className="text-xs sm:text-sm font-bold text-[#1A3A5F]">
                {subj.name}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-4 sm:h-5 rounded-full bg-[#EDF2F8] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${subj.percent}%`,
                      background: 'linear-gradient(to left, #64A5E6, #1F5AAA)',
                    }}
                  />
                </div>
                <span className="text-sm sm:text-base font-black text-[#1F5AAA] tabular-nums w-12 text-left shrink-0">
                  {subj.percent}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div dir="rtl" className="space-y-5 text-right font-['Cairo','Tajawal']">
      {/* Shared SVG Gradient Definition for Calm Azure Outline Icons */}
      <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
        <defs>
          <linearGradient id="azalIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#64A5E6" />
            <stop offset="55%" stopColor="#1F5AAA" />
            <stop offset="100%" stopColor="#1A3A5F" />
          </linearGradient>
        </defs>
      </svg>

      {/* Page Title, Dynamic Greeting & School Subtitle inside Soft Pastel Sky-Blue Hero Card */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] shadow-[0_6px_20px_rgba(26,58,95,0.08)] px-4 py-5 sm:px-6 sm:py-6 text-center space-y-1.5 text-[#1A3A5F]">
        <div className="relative z-10 space-y-1.5">
          <div className="flex items-center justify-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white border border-[#DCE7F3] flex items-center justify-center shadow-xs shrink-0">
              <GraduationCap className="w-5 h-5 text-[#1F5AAA]" />
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-[#1A3A5F] tracking-tight">
              لوحة مدير المدرسة
            </h1>
          </div>
          <p className="text-xs sm:text-sm font-extrabold text-[#1F5AAA]">
            مرحباً {displayManagerName}، دعنا نلقي نظرة على أداء اليوم
          </p>
          <p className="text-xs font-bold text-[#2C4C70]">
            {getSubtitle()}
          </p>
        </div>
      </div>

      {/* Report Mode Switcher & Grade Isolation Selector */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 p-1.5 bg-[#E6EEF7] rounded-2xl border border-[#C6DCF2] shadow-xs">
          <button
            type="button"
            onClick={() => setReportMode('weekly')}
            className={`py-2 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-center transition cursor-pointer whitespace-normal sm:whitespace-nowrap min-w-0 ${
              reportMode === 'weekly'
                ? 'bg-white text-[#1F5AAA] shadow-xs font-black'
                : 'text-[#475569] hover:text-[#1A3A5F]'
            }`}
          >
            التقرير اليومي
          </button>
          <button
            type="button"
            onClick={() => setReportMode('monthly')}
            className={`py-2 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-center transition cursor-pointer whitespace-normal sm:whitespace-nowrap min-w-0 ${
              reportMode === 'monthly'
                ? 'bg-white text-[#1F5AAA] shadow-xs font-black'
                : 'text-[#475569] hover:text-[#1A3A5F]'
            }`}
          >
            التقرير الشهري
          </button>
          <button
            type="button"
            onClick={() => setReportMode('cumulative')}
            className={`py-2 px-1 sm:px-2 rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-center transition cursor-pointer whitespace-normal sm:whitespace-nowrap min-w-0 ${
              reportMode === 'cumulative'
                ? 'bg-white text-[#1F5AAA] shadow-xs font-black'
                : 'text-[#475569] hover:text-[#1A3A5F]'
            }`}
          >
            التراكمي السنوي
          </button>
        </div>

        {/* Grade Isolation Bar (7th / 8th / 9th preserved) */}
        <div className="flex items-center justify-between gap-2 flex-wrap bg-white rounded-2xl border border-[#DCE7F3] px-3.5 py-2.5 shadow-xs">
          <span className="text-xs font-black text-[#1A3A5F]">الصف الدراسي:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['الكل', 'سابع', 'ثامن', 'تاسع'] as const).map((grade) => (
              <button
                key={grade}
                type="button"
                onClick={() => setSelectedGradeFilter(grade)}
                className={`px-3 py-1 rounded-xl text-[11px] font-black transition cursor-pointer ${
                  selectedGradeFilter === grade
                    ? 'bg-[#1F5AAA] text-white shadow-xs border border-[#194B91]'
                    : 'bg-[#F0F4F8] text-[#1A3A5F] border border-[#DCE7F3] hover:bg-[#E4EEF8]'
                }`}
              >
                {grade === 'الكل' ? 'جميع الصفوف' : `الصف ال${grade}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {archiveSuccessMsg && (
        <div className="p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs font-bold flex items-center justify-between">
          <span>{archiveSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setArchiveSuccessMsg(null)}
            className="text-emerald-800 font-black cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {pendingSchedules.length > 0 && reportMode !== 'weekly' && (
        <button
          type="button"
          onClick={() => setReportMode('weekly')}
          className="w-full p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs font-black flex items-center justify-between gap-2 transition cursor-pointer shadow-xs"
        >
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
            <span>يوجد {pendingSchedules.length} جدول حصص أسبوعي مرفوع من المشرف بانتظار اعتمادك للترم الأول</span>
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-amber-600 text-white text-[11px] shrink-0">
            عرض واعتماد
          </span>
        </button>
      )}

      {/* ===================================================================== */}
      {/* 1. التقرير الأسبوعي (Weekly Report - Image 2)                         */}
      {/* ===================================================================== */}
      {reportMode === 'weekly' && (
        <div className="space-y-6">
          {/* 4 Glassmorphic Cards — strictly 2 per row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Card 1: إجمالي تسليمات الأسبوع */}
            <div className={`${GLASS_CARD_CLASS} p-3.5 sm:p-4 flex flex-col justify-between min-h-[112px]`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-[#334E68] leading-snug">
                  إجمالي التسليمات
                </span>
                <CheckSquare className="w-7 h-7 shrink-0" stroke="url(#azalIconGrad)" />
              </div>
              <div className="text-center pt-2">
                <span className="text-3xl sm:text-4xl font-black text-[#0F2D4A] tabular-nums">
                  {totalCount}
                </span>
              </div>
            </div>

            {/* Card 2: المعدل اليومي */}
            <div className={`${GLASS_CARD_CLASS} p-3.5 sm:p-4 flex flex-col justify-between min-h-[112px]`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-[#334E68] leading-snug">
                  المعدل اليومي
                </span>
                <Clock className="w-7 h-7 shrink-0" stroke="url(#azalIconGrad)" />
              </div>
              <div className="text-center pt-2">
                <span className="text-3xl sm:text-4xl font-black text-[#0F2D4A] tabular-nums">
                  {dailyAverage}
                </span>
              </div>
            </div>

            {/* Card 3: المواد النشطة */}
            <div className={`${GLASS_CARD_CLASS} p-3.5 sm:p-4 flex flex-col justify-between min-h-[112px]`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-[#334E68] leading-snug">
                  المواد النشطة
                </span>
                <BookOpen className="w-7 h-7 shrink-0" stroke="url(#azalIconGrad)" />
              </div>
              <div className="text-center pt-2">
                <span className="text-3xl sm:text-4xl font-black text-[#0F2D4A] tabular-nums">
                  {sortedSubjects.length}
                </span>
              </div>
            </div>

            {/* Card 4: أفضل يوم تفاعل */}
            <div className={`${GLASS_CARD_CLASS} p-3.5 sm:p-4 flex flex-col justify-between min-h-[112px]`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold text-[#334E68] leading-snug">
                  أفضل يوم تفاعل
                </span>
                <Star className="w-7 h-7 shrink-0" stroke="url(#azalIconGrad)" />
              </div>
              <div className="text-center pt-2">
                <span className="text-2xl sm:text-3xl font-black text-[#0F2D4A]">
                  {bestDayName}
                </span>
              </div>
            </div>
          </div>

          {/* منحنى التفاعل (Pure White Card) */}
          <section className="space-y-2.5 bg-white rounded-2xl border border-[#DCE7F3] p-4 sm:p-5 shadow-sm">
            <h2 className="text-base sm:text-lg font-black text-[#1A3A5F]">
              منحنى التفاعل
            </h2>

            <div className="bg-white rounded-2xl border border-[#E6EEF7] p-3 sm:p-4">
              <svg viewBox={`0 0 ${weeklySvgW} ${weeklySvgH}`} className="w-full h-auto overflow-visible">
                <defs>
                  <linearGradient id="weeklyLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#1A3A5F" />
                    <stop offset="50%" stopColor="#1F5AAA" />
                    <stop offset="100%" stopColor="#64A5E6" />
                  </linearGradient>
                </defs>

                {/* Baseline */}
                <line
                  x1={wPadX}
                  y1={wPadTop + wInnerH}
                  x2={wPadX + wInnerW}
                  y2={wPadTop + wInnerH}
                  stroke="#CBD5E1"
                  strokeWidth="1.5"
                />

                {/* Smooth Line */}
                {weeklySmoothLine && (
                  <path
                    d={weeklySmoothLine}
                    fill="none"
                    stroke="url(#weeklyLineGrad)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Points & Day Labels */}
                {weeklyPoints.map((pt, idx) => (
                  <g
                    key={pt.day}
                    onMouseEnter={() => setHoveredPoint(idx)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    onClick={() => setHoveredPoint(hoveredPoint === idx ? null : idx)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredPoint === idx ? 6.5 : 4.5}
                      fill={idx > weeklyPoints.length / 2 ? '#64A5E6' : '#1F5AAA'}
                      stroke="#FFFFFF"
                      strokeWidth="1.8"
                    />
                    <text
                      x={pt.x}
                      y={wPadTop + wInnerH + 22}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill="#1A3A5F"
                      fontFamily="Cairo"
                    >
                      {pt.day}
                    </text>

                    {hoveredPoint === idx && (
                      <g>
                        <rect
                          x={pt.x - 28}
                          y={pt.y - 28}
                          width="56"
                          height="20"
                          rx="6"
                          fill="#1A3A5F"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 14}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="700"
                          fill="#FFFFFF"
                          fontFamily="Cairo"
                        >
                          {pt.count} تسليم
                        </text>
                      </g>
                    )}
                  </g>
                ))}
              </svg>
            </div>
          </section>

          {/* نسب إنجاز المواد بأشرطة تقدم */}
          {renderSubjectsProgressSection(sortedSubjects)}

          {/* إشعار تنبيه بأسماء الطلاب المتأخرين عن إجابة الأسئلة لأكثر من 24 ساعة (يظهر في اليومي فقط) */}
          <section className="space-y-2.5 bg-white rounded-2xl border border-[#DCE7F3] p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>تنبيه الطلاب المتأخرين (+24 ساعة)</span>
              </h2>
              {overdueStudents.length > 0 && (
                <span className="text-xs font-black text-rose-700 tabular-nums shrink-0">
                  {overdueStudents.length} طالب متأخر
                </span>
              )}
            </div>

            {overdueStudents.length === 0 ? (
              <div className="rounded-2xl bg-[#EEF5FC] border border-[#C6DCF2] p-3.5 text-xs font-bold text-[#1F5AAA] flex items-center gap-2">
                <Check className="w-4 h-4 text-[#1F5AAA] shrink-0" />
                <span>لا يوجد طلاب متأخرون عن إجابة الأسئلة لأكثر من 24 ساعة حالياً.</span>
              </div>
            ) : (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 space-y-2">
                <p className="text-xs font-bold text-rose-900">
                  تنبيه: الطلاب التالية أسماؤهم لم يجيبوا على أسئلة منشورة منذ أكثر من 24 ساعة:
                </p>
                <div className="divide-y divide-rose-200 bg-white rounded-xl border border-rose-200 px-3">
                  {overdueStudents.map((st) => (
                    <div
                      key={st.code}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-black text-[#1A3A5F] block truncate">
                          {st.studentName}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600">
                          {st.gradeLabel} · {st.subjectsText} ({st.missedCount}{' '}
                          {st.missedCount === 1 ? 'سؤال' : 'أسئلة'})
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-rose-700 whitespace-nowrap shrink-0">
                        متأخر {st.overdueSince}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* آخر الأنشطة اليومية (خاصة بالمعلمين فقط وتظهر في اليومي فقط) */}
          <section className="space-y-2.5 bg-white rounded-2xl border border-[#DCE7F3] p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                <span>آخر الأنشطة اليومية للمعلمين</span>
              </h2>
              {dailyActivities.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllActivities((prev) => !prev)}
                  className="text-xs font-black text-[#1F5AAA] hover:underline cursor-pointer"
                >
                  {showAllActivities ? 'عرض أقل' : `عرض الكل (${dailyActivities.length})`}
                </button>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-[#E6EEF7] divide-y divide-slate-200 px-3.5">
              {dailyActivities.length === 0 ? (
                <p className="py-5 text-center text-xs font-bold text-slate-600">
                  لا توجد أنشطة معلمين مسجلة اليوم بعد
                </p>
              ) : (
                (showAllActivities ? dailyActivities : dailyActivities.slice(0, 6)).map((act) => (
                  <div
                    key={act.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="font-bold text-[#1A3A5F] leading-relaxed min-w-0 flex-1">
                      {act.text}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap shrink-0 tabular-nums">
                      {act.timeText}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* اعتماد جداول الحصص الأسبوعية (الترم الأول - يرفعها المشرف ويعتمدها المدير مرة واحدة فقط) */}
          <section className="space-y-3 bg-white rounded-2xl border border-[#DCE7F3] p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                  <span>جداول الحصص الأسبوعية — الترم الأول</span>
                </h2>
                <p className="text-[11px] sm:text-xs font-semibold text-[#5C7085] mt-0.5">
                  يرفعها المشرف وتُعتمد مرة واحدة فقط لتثبت لكل صف وفصل طوال الترم الأول
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pendingSchedules.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black">
                    {pendingSchedules.length} بانتظار الاعتماد
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                  {approvedSchedules.length} جدول معتمد
                </span>
              </div>
            </div>

            {pendingSchedules.length > 0 && (
              <div className="space-y-3 pt-1">
                {pendingSchedules.map((sch) => {
                  const previewEntries =
                    sch.hasPendingUpdate && sch.pendingEntries?.length
                      ? sch.pendingEntries
                      : sch.entries;
                  const isBusy = scheduleBusyId === sch.id;
                  const isRejectOpen = rejectNoteOpenId === sch.id;
                  return (
                    <div
                      key={sch.id}
                      className="rounded-2xl bg-[#F4F8FC] border-2 border-amber-300 p-3.5 sm:p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black">
                              {sch.hasPendingUpdate ? 'تحديث مقترح بانتظار الاعتماد' : 'بانتظار اعتماد المدير'}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-white text-[#1A3A5F] border border-[#DCE7F3] text-[11px] font-black">
                              {sch.gradeLabel} — فصل {sch.classNumber}
                            </span>
                          </div>
                          <p className="text-[11px] font-semibold text-[#5C7085] mt-1">
                            رفعه المشرف: {sch.hasPendingUpdate && sch.pendingUploadedBy ? sch.pendingUploadedBy : sch.uploadedBy} •{' '}
                            {sch.hasPendingUpdate && sch.pendingUploadedAtFormatted ? sch.pendingUploadedAtFormatted : sch.uploadedAtFormatted}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveSchedule(sch)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                          >
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{isBusy ? 'جاري الاعتماد...' : 'اعتماد وتثبيت للترم الأول'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setRejectNoteOpenId(isRejectOpen ? null : sch.id);
                              setRejectNoteText('');
                            }}
                            className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                          >
                            <XCircle className="w-4 h-4 shrink-0" />
                            <span>إرجاع للمشرف</span>
                          </button>
                        </div>
                      </div>

                      {isRejectOpen && (
                        <div className="rounded-xl bg-white border border-rose-200 p-3 space-y-2">
                          <label className="block text-[11px] font-black text-rose-900">
                            سبب الإرجاع أو الملاحظة للمشرف (اختياري):
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={rejectNoteText}
                              onChange={(e) => setRejectNoteText(e.target.value)}
                              placeholder="مثال: يرجى تعديل مادة الحصة الثالثة يوم الاثنين..."
                              className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[#DCE7F3] text-xs font-semibold text-[#1A3A5F] focus:outline-none focus:border-[#1F5AAA]"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRejectSchedule(sch)}
                              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer"
                            >
                              تأكيد الإرجاع
                            </button>
                          </div>
                        </div>
                      )}

                      <ScheduleGridView entries={previewEntries} compact />
                    </div>
                  );
                })}
              </div>
            )}

            {approvedSchedules.length === 0 ? (
              pendingSchedules.length === 0 && (
                <div className="rounded-2xl bg-[#F4F8FC] border border-[#DCE7F3] p-4 text-center text-xs font-bold text-[#5C7085]">
                  لا توجد جداول حصص معتمدة بعد. يقوم المشرف برفع جدول كل صف وإرساله للاعتماد من هنا.
                </div>
              )
            ) : (
              <div className="space-y-2 pt-1">
                {approvedSchedules.map((sch) => {
                  const isOpen = expandedApprovedScheduleId === sch.id;
                  return (
                    <div
                      key={sch.id}
                      className="rounded-2xl bg-[#F8FAFD] border border-[#DCE7F3] overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedApprovedScheduleId(isOpen ? null : sch.id)}
                        className="w-full p-3 flex items-center justify-between gap-2 text-right hover:bg-[#EEF5FC]/60 transition cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-black">
                            <Lock className="w-3 h-3" />
                            <span>معتمد ومثبت</span>
                          </span>
                          <span className="text-xs sm:text-sm font-black text-[#1A3A5F]">
                            {sch.gradeLabel} — فصل {sch.classNumber}
                          </span>
                          <span className="text-[11px] font-semibold text-[#5C7085]">
                            (الترم {sch.term} • رفعه: {sch.uploadedBy})
                          </span>
                        </div>
                        <span className="text-xs font-black text-[#1F5AAA] flex items-center gap-1 shrink-0">
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isOpen ? 'إخفاء' : 'عرض'}</span>
                          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="p-3 border-t border-[#DCE7F3] bg-white">
                          <ScheduleGridView
                            entries={sch.entries}
                            subtitle={`اعتمده: ${sch.approvedBy || displayManagerName} • ${sch.approvedAtFormatted || ''}`}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* تقارير الحضور والغياب اليومية (تظهر للمدير في التقارير والاعتماد في البريد) */}
          <section className="space-y-3 bg-white rounded-2xl border border-[#DCE7F3] p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                  <span>تقارير الحضور والغياب اليومية (من المشرف)</span>
                </h2>
                <p className="text-[11px] sm:text-xs font-semibold text-[#5C7085] mt-0.5">
                  تُرفع من بوابة المشرف وتظهر هنا للمتابعة، وتُعتمد من تبويب (البريد) لتُنشر في لوحة المدرسة
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                {filteredAttendanceRecords.length} كشف مسجل
              </span>
            </div>

            {filteredAttendanceRecords.length === 0 ? (
              <div className="rounded-2xl bg-[#F4F8FC] border border-[#DCE7F3] p-4 text-center text-xs font-bold text-[#5C7085]">
                لا توجد كشوفات حضور وغياب مسجلة من المشرف بعد.
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredAttendanceRecords.slice(0, 12).map((rec) => {
                  const isExpanded = expandedAttendanceId === rec.id;
                  const excusedCount =
                    rec.absentExcusedCount ??
                    rec.entries.filter((e) => e.status === 'غائب بعذر').length;
                  const unexcusedCount =
                    rec.absentUnexcusedCount ??
                    rec.entries.filter((e) => e.status === 'غائب بدون عذر' || e.status === 'غائب').length;
                  return (
                    <div
                      key={rec.id}
                      className="rounded-2xl bg-[#F8FAFD] border border-[#DCE7F3] overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedAttendanceId(isExpanded ? null : rec.id)}
                        className="w-full p-3.5 flex flex-wrap items-center justify-between gap-2 text-right hover:bg-[#EEF5FC]/60 transition cursor-pointer"
                      >
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs sm:text-sm font-black text-[#1A3A5F]">
                              {rec.gradeLabel} — فصل {rec.classNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-white border border-[#DCE7F3] text-[11px] font-mono font-bold text-[#1F5AAA]">
                              {rec.date}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                rec.approvalStatus === 'approved'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : rec.approvalStatus === 'revision_requested'
                                  ? 'bg-orange-100 text-orange-900'
                                  : rec.approvalStatus === 'rejected'
                                  ? 'bg-rose-100 text-rose-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {rec.approvalStatus === 'approved'
                                ? 'معتمد'
                                : rec.approvalStatus === 'revision_requested'
                                ? 'طلب تعديل'
                                : rec.approvalStatus === 'rejected'
                                ? 'مرفوض'
                                : 'بانتظار الاعتماد'}
                            </span>
                          </div>
                          <p className="text-[11px] font-semibold text-[#5C7085]">
                            سجّل الحضور: {rec.recordedBy} • {rec.createdAtFormatted}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-black tabular-nums">
                            حاضر: {rec.presentCount}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-sky-100 text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black tabular-nums">
                            بعذر: {excusedCount}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-200 text-[11px] font-black tabular-nums">
                            بدون عذر: {unexcusedCount}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-black tabular-nums">
                            متأخر: {rec.lateCount}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[#1F5AAA]" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[#1F5AAA]" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-3 bg-white border-t border-[#DCE7F3] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {rec.entries.map((entry, idx) => (
                            <div
                              key={`${rec.id}_${idx}`}
                              className="px-3 py-2 rounded-xl bg-[#F8FAFD] border border-[#E6EEF7] flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="font-bold text-[#1A3A5F] truncate">
                                {idx + 1}. {entry.studentName}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[11px] font-black shrink-0 ${
                                  entry.status === 'حاضر'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : entry.status === 'غائب بعذر'
                                    ? 'bg-sky-100 text-[#1F5AAA]'
                                    : entry.status === 'متأخر'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-rose-100 text-rose-900'
                                }`}
                              >
                                {entry.status === 'غائب' ? 'غائب بدون عذر' : entry.status}
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
          </section>

          {/* تقارير وأنشطة وفعاليات المشرف */}
          <section className="space-y-3 bg-white rounded-2xl border border-[#DCE7F3] p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                <Flag className="w-5 h-5 text-[#1F5AAA] shrink-0" />
                <span>أنشطة وتقارير وفعاليات المشرف</span>
              </h2>
              <span className="px-2.5 py-1 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                {filteredSupervisorActivities.length} سجل
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(['الكل', ...SUPERVISOR_ACTIVITY_CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSupervisorActFilter(cat)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-black transition cursor-pointer ${
                    supervisorActFilter === cat
                      ? 'bg-[#1F5AAA] text-white border border-[#194B91]'
                      : 'bg-[#F0F4F8] text-[#1A3A5F] border border-[#DCE7F3] hover:bg-[#E4EEF8]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredSupervisorActivities.length === 0 ? (
              <div className="rounded-2xl bg-[#F4F8FC] border border-[#DCE7F3] p-4 text-center text-xs font-bold text-[#5C7085]">
                لا توجد أنشطة أو تقارير مشرف مسجلة ضمن هذا التصنيف بعد.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSupervisorActivities.slice(0, 10).map((act) => (
                  <div
                    key={act.id}
                    className="rounded-2xl bg-[#F8FAFD] border border-[#DCE7F3] p-3.5 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          <span>{act.category}</span>
                        </span>
                        {act.subType && (
                          <span className="px-2 py-0.5 rounded-lg bg-white border border-[#DCE7F3] text-[11px] font-bold text-[#1A3A5F]">
                            {act.subType}
                          </span>
                        )}
                        {act.targetGrade && act.targetGrade !== 'all' && act.targetGrade !== 'الكل' && (
                          <span className="px-2 py-0.5 rounded-lg bg-white border border-[#DCE7F3] text-[11px] font-bold text-[#1A3A5F]">
                            {getGradeLabelAr(act.targetGrade)}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-[#5C7085] tabular-nums">
                        {act.activityDate}
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-black text-[#1A3A5F]">{act.title}</h4>
                    {act.details && (
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{act.details}</p>
                    )}
                    <p className="text-[11px] font-semibold text-[#5C7085]">
                      سجله المشرف: {act.createdBy} • {act.createdAtFormatted}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. التقرير الشهري والأرشيف (Monthly Report & Archive - Image 1)       */}
      {/* ===================================================================== */}
      {reportMode === 'monthly' && (
        <div className="space-y-5">
          {/* 3 Glassmorphic Cards — 2 in row 1, 1 centered in row 2 */}
          <div className="grid grid-cols-2 gap-3">
            {/* Card 1: متوسط أداء الطلاب */}
            <div className={`${GLASS_CARD_CLASS} p-4 text-center flex flex-col items-center justify-center gap-1.5 min-h-[122px]`}>
              <GraduationCap className="w-8 h-8" stroke="url(#azalIconGrad)" />
              <span className="text-xs font-bold text-[#334E68]">متوسط أداء الطلاب</span>
              <span className="text-2xl sm:text-3xl font-black text-[#0F2D4A] tabular-nums">
                {monthlyAvgDisplay}%
              </span>
            </div>

            {/* Card 2: تسليمات الشهر */}
            <div className={`${GLASS_CARD_CLASS} p-4 text-center flex flex-col items-center justify-center gap-1.5 min-h-[122px]`}>
              <FileText className="w-8 h-8" stroke="url(#azalIconGrad)" />
              <span className="text-xs font-bold text-[#334E68]">تسليمات الشهر</span>
              <span className="text-2xl sm:text-3xl font-black text-[#0F2D4A] tabular-nums">
                {monthlySubmissionsDisplay}
              </span>
            </div>

            {/* Card 3: الطلاب المسجلون (centered 50% width below) */}
            <div className="col-span-2 flex justify-center">
              <div className={`${GLASS_CARD_CLASS} w-[calc(50%-6px)] p-4 text-center flex flex-col items-center justify-center gap-1.5 min-h-[122px]`}>
                <Users className="w-8 h-8" stroke="url(#azalIconGrad)" />
                <span className="text-xs font-bold text-[#334E68]">الطلاب المسجلون</span>
                <span className="text-2xl sm:text-3xl font-black text-[#0F2D4A] tabular-nums">
                  {studentPerformanceList.length}
                </span>
              </div>
            </div>
          </div>

          {/* اختر الشهر والسنة + زر أرشفة تقرير + عداد تقارير محفوظة */}
          <div className="rounded-2xl bg-white border border-[#DCE7F3] p-4 space-y-3 shadow-sm">
            <h2 className="text-sm sm:text-base font-black text-[#1A3A5F]">
              اختر الشهر والسنة
            </h2>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Month Select */}
              <div className="relative">
                <CalendarDays className="w-4 h-4 text-[#1F5AAA] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full pr-9 pl-7 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs sm:text-sm font-bold text-[#1A3A5F] focus:outline-none focus:border-[#1F5AAA] appearance-none cursor-pointer"
                >
                  {ACADEMIC_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Year Select */}
              <div className="relative">
                <CalendarDays className="w-4 h-4 text-[#1F5AAA] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="w-full pr-9 pl-7 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs sm:text-sm font-bold text-[#1A3A5F] focus:outline-none focus:border-[#1F5AAA] appearance-none cursor-pointer tabular-nums"
                >
                  {[currentYear, currentYear - 1, currentYear + 1].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr} / {yr + 1}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
              <button
                type="button"
                onClick={handleArchiveMonth}
                disabled={isArchiving}
                className="px-4 py-2 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black flex items-center gap-2 shadow-sm cursor-pointer border border-[#194B91] transition"
              >
                <Archive className="w-4 h-4 shrink-0" />
                <span>{isArchiving ? 'جاري الأرشفة...' : 'أرشفة تقرير'}</span>
              </button>

              <div className="px-3 py-1.5 rounded-full bg-[#EEF5FC] border border-[#C6DCF2] text-[#1F5AAA] text-[11px] font-bold flex items-center gap-1.5 tabular-nums">
                <Info className="w-3.5 h-3.5 text-[#1F5AAA] shrink-0" />
                <span>تقارير محفوظة {archivedReports.length}</span>
              </div>
            </div>
          </div>

          {/* نسب إنجاز المواد بأشرطة تقدم كما تظهر في التقرير اليومي */}
          {renderSubjectsProgressSection(
            existingArchivedReport?.subjectBreakdown && existingArchivedReport.subjectBreakdown.length > 0
              ? existingArchivedReport.subjectBreakdown
              : sortedSubjects
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. التقرير التراكمي السنوي (Cumulative Annual Report - Image 3)         */}
      {/* ===================================================================== */}
      {reportMode === 'cumulative' && (
        <div className="space-y-5">
          {/* Top 2 Pure White Cards side by side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Card 1: متوسط الأداء التراكمي */}
            <div className={`${GLASS_CARD_CLASS} p-4 text-center flex flex-col items-center justify-center gap-1.5 min-h-[126px]`}>
              <BarChart3 className="w-8 h-8" stroke="url(#azalIconGrad)" />
              <span className="text-[11px] sm:text-xs font-bold text-[#1A3A5F]">
                متوسط الأداء التراكمي
              </span>
              <span className="text-2xl sm:text-3xl font-black text-[#1F5AAA] tabular-nums">
                {averageStudentPerformance}%
              </span>
              <span className="text-[11px] font-semibold text-slate-600">
                {studentPerformanceList.length} طالب مسجل
              </span>
            </div>

            {/* Card 2: إجمالي التسليمات في السنة */}
            <div className={`${GLASS_CARD_CLASS} p-4 text-center flex flex-col items-center justify-center gap-1.5 min-h-[126px]`}>
              <FileText className="w-8 h-8" stroke="url(#azalIconGrad)" />
              <span className="text-[11px] sm:text-xs font-bold text-[#1A3A5F]">
                إجمالي التسليمات في السنة
              </span>
              <span className="text-2xl sm:text-3xl font-black text-[#1F5AAA] tabular-nums">
                {totalCount}
              </span>
              <span className="text-[11px] font-semibold text-slate-600">
                تسليمات
              </span>
            </div>
          </div>

          {/* 3rd Card: الطلاب + منحنى تراكمي */}
          <div className={`${GLASS_CARD_CLASS} p-4 space-y-3`}>
            <div className="flex items-center justify-center gap-4">
              <Users className="w-10 h-10 shrink-0" stroke="url(#azalIconGrad)" />
              <div className="text-center">
                <span className="text-xs font-bold text-[#1A3A5F] block">الطلاب</span>
                <div className="flex items-baseline justify-center gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black text-[#1F5AAA] tabular-nums">
                    {studentPerformanceList.length}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600">طالب مسجل</span>
                </div>
              </div>
            </div>

            {/* Cumulative Area Chart */}
            <div className="w-full pt-1">
              <svg viewBox={`0 0 ${cumulativeSvgW} ${cumulativeSvgH}`} className="w-full h-auto overflow-visible">
                <defs>
                  <linearGradient id="cumLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#64A5E6" />
                    <stop offset="55%" stopColor="#1F5AAA" />
                    <stop offset="100%" stopColor="#1A3A5F" />
                  </linearGradient>
                  <linearGradient id="cumFillGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#B3CDE8" stopOpacity="0.45" />
                    <stop offset="55%" stopColor="#64A5E6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#1F5AAA" stopOpacity="0.2" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Ticks */}
                {[0, 20, 80, 100].map((val) => {
                  const y = cPadTop + cInnerH - (val / 100) * cInnerH;
                  return (
                    <g key={val}>
                      <line
                        x1={cPadLeft}
                        y1={y}
                        x2={cPadLeft + cInnerW}
                        y2={y}
                        stroke="#CBD5E1"
                        strokeWidth="1"
                      />
                      <text
                        x={cPadLeft - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="10"
                        fontWeight="700"
                        fill="#475569"
                        fontFamily="Cairo"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}

                {cumulativeAreaPath && <path d={cumulativeAreaPath} fill="url(#cumFillGrad)" />}
                {cumulativeLinePath && (
                  <path
                    d={cumulativeLinePath}
                    fill="none"
                    stroke="url(#cumLineGrad)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Peak Percentage Label */}
                {cumulativePoints.length > 0 && (
                  <text
                    x={cumulativePoints[cumulativePoints.length - 1].x}
                    y={cumulativePoints[cumulativePoints.length - 1].y - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="900"
                    fill="#1A3A5F"
                    fontFamily="Cairo"
                  >
                    {averageStudentPerformance}%
                  </text>
                )}

                {/* Month X-Axis Labels */}
                {cumulativePoints.map((pt) => (
                  <text
                    key={pt.label}
                    x={pt.x}
                    y={cPadTop + cInnerH + 18}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#1A3A5F"
                    fontFamily="Cairo"
                  >
                    {pt.label}
                  </text>
                ))}
              </svg>
            </div>
          </div>

          {/* نسب إنجاز المواد بأشرطة تقدم كما تظهر في التقرير اليومي */}
          {renderSubjectsProgressSection(sortedSubjects)}
        </div>
      )}
    </div>
  );
};

export const PrincipalReportsView = PrincipalStatsTab;
export default PrincipalStatsTab;
