import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarCheck,
  Award,
  Megaphone,
  Search,
  Download,
  Eye,
  FileText,
  School,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Activity,
  Trophy,
  Flag,
  GraduationCap,
  Image as ImageIcon,
  Folder,
  FolderOpen,
  X,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  ACADEMIC_MONTHS,
  Announcement,
  HomeworkSubmission,
  MonthlyReportRecord,
  Question,
  TeacherActivityArchiveBatch,
  TeacherActivityArchiveItem,
  SchoolActivityArchiveBatch,
  SchoolActivityArchiveItem,
  SupervisorActivity,
  SupervisorActivityCategory,
  appDataService,
  formatArabicDateTime,
  formatArabicDayLabel,
  formatDayKeyFromTimestamp,
  getCurrentAcademicMonth,
  getGradeLabelAr,
  getQuestionTimestamp,
  getSchoolActivityTimestamp,
} from '../services/appData';
import { authService } from '../services/authService';
import { PrincipalStudentReportItem } from './PrincipalReportPdfModal';
import { ComputerMonthFoldersGrid } from './ComputerMonthFoldersGrid';
import { getAcademicMonthFromTimestamp } from './StudentSubjectGradeTables';
import {
  getSchoolPrincipalName,
  isGenericPrincipalSender,
  isSimulationAnnouncement,
} from '../utils/schoolDisplay';

interface PrincipalArchiveViewProps {
  view:
    | 'archive_monthly'
    | 'archive_teacher_activities'
    | 'archive_school_activities'
    | 'archive_cumulative'
    | 'archive_circulars';
  schoolId: string;
  schoolName: string;
  submissions: HomeworkSubmission[];
  announcements: Announcement[];
  onOpenPdfModal: (config: {
    reportTitle: string;
    periodLabel: string;
    isAnnual: boolean;
    gradeLabel: string;
    students: PrincipalStudentReportItem[];
  }) => void;
  onBackToDashboard: () => void;
}

const GRADES = [
  { id: '7', label: 'الصف السابع' },
  { id: '8', label: 'الصف الثامن' },
  { id: '9', label: 'الصف التاسع' },
] as const;

const staggerDelays = [
  'delay-[0ms]',
  'delay-[35ms]',
  'delay-[70ms]',
  'delay-[105ms]',
  'delay-[140ms]',
  'delay-[175ms]',
];

interface NormalizedTeacherActivityEntry extends TeacherActivityArchiveItem {
  monthName: string;
  year: number;
}

interface NormalizedSchoolActivityEntry extends SchoolActivityArchiveItem {
  monthName: string;
  year: number;
  allImages?: string[];
}

export const PrincipalArchiveView: React.FC<PrincipalArchiveViewProps> = ({
  view,
  schoolId,
  schoolName,
  submissions,
  announcements,
  onOpenPdfModal,
  onBackToDashboard,
}) => {
  const currentAcademicMonth = getCurrentAcademicMonth();

  // Independent Grade & Filters State (no combined "all grades" option)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('7');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [openedMonthFolder, setOpenedMonthFolder] = useState<string | null>(null);
  const [expandedDayKeys, setExpandedDayKeys] = useState<Record<string, boolean>>({});
  const [selectedReportDetail, setSelectedReportDetail] = useState<any | null>(null);

  const [savedMonthlyReports, setSavedMonthlyReports] = useState<MonthlyReportRecord[]>([]);
  const [teacherActivityBatches, setTeacherActivityBatches] = useState<TeacherActivityArchiveBatch[]>([]);
  const [liveQuestions, setLiveQuestions] = useState<Question[]>(() =>
    schoolId ? appDataService.getQuestions(undefined, undefined, schoolId) : []
  );
  const [schoolActivityBatches, setSchoolActivityBatches] = useState<SchoolActivityArchiveBatch[]>([]);
  const [approvedSchoolActivities, setApprovedSchoolActivities] = useState<SupervisorActivity[]>(() =>
    schoolId
      ? appDataService.getSupervisorActivities(schoolId).filter((a) => a.approvalStatus === 'approved')
      : []
  );
  const [selectedSchoolActivityCat, setSelectedSchoolActivityCat] = useState<
    'الكل' | 'تقرير' | 'نشاط' | 'فعالية'
  >('الكل');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Reset opened month folder & collapsed day accordions whenever switching archive sections
  useEffect(() => {
    setOpenedMonthFolder(null);
    setExpandedDayKeys({});
  }, [view]);

  useEffect(() => {
    if (!schoolId) return;
    const normalizedSchool = schoolId.trim().toLowerCase();
    appDataService.getArchivedMonthlyReports(schoolId).then(setSavedMonthlyReports).catch(() => {});
    appDataService.getArchivedTeacherActivityBatches(schoolId).then(setTeacherActivityBatches).catch(() => {});
    appDataService.getArchivedSchoolActivityBatches(schoolId).then(setSchoolActivityBatches).catch(() => {});

    let unsubReports = () => {};
    let unsubAct = () => {};
    let unsubQuestions = () => {};

    try {
      const qRep = query(collection(db, 'monthlyReports'), where('schoolId', '==', schoolId));
      unsubReports = onSnapshot(
        qRep,
        (snap) => {
          const allDocs = snap.docs.map((d) => d.data() as any);
          setSavedMonthlyReports(
            allDocs.filter(
              (r) =>
                r.recordType !== 'teacher_activities_archive' &&
                r.recordType !== 'monthly_homework_archive' &&
                r.recordType !== 'school_activities_archive'
            ) as MonthlyReportRecord[]
          );
          setTeacherActivityBatches(
            (allDocs.filter((r) => r.recordType === 'teacher_activities_archive') as TeacherActivityArchiveBatch[]).sort(
              (a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)
            )
          );
          setSchoolActivityBatches(
            (allDocs.filter((r) => r.recordType === 'school_activities_archive') as SchoolActivityArchiveBatch[]).sort(
              (a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)
            )
          );
        },
        () => {}
      );
    } catch {}

    try {
      const qQuestions = query(collection(db, 'questions'), where('schoolId', '==', schoolId));
      unsubQuestions = onSnapshot(
        qQuestions,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as Question))
            .filter((q) => (q.schoolId || '').trim().toLowerCase() === normalizedSchool);
          setLiveQuestions(list);
        },
        () => {}
      );
    } catch {}

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
            .sort((a, b) => (b.approvedAt || b.createdAt || 0) - (a.approvedAt || a.createdAt || 0));
          setApprovedSchoolActivities(list);
          if (list.length > 0) {
            appDataService.syncThursdaySchoolActivitiesArchive(schoolId, list, Date.now()).catch(() => {});
          }
        },
        () => {}
      );
    } catch {}

    return () => {
      unsubReports();
      unsubQuestions();
      unsubAct();
    };
  }, [schoolId]);

  // Strict Grade Matching Helper (Independent grade isolation: 7, 8, or 9)
  const matchesGrade = (
    gradeVal?: string,
    codeVal?: string,
    targetGrade: string = selectedGrade
  ): boolean => {
    const g = String(gradeVal || '').trim().toLowerCase();
    const c = String(codeVal || '').trim().toUpperCase();

    if (targetGrade === '7') {
      return g === '7' || g.includes('سابع') || g.includes('7') || c.includes('-7-') || c.startsWith('STU-7-');
    }
    if (targetGrade === '8') {
      return (
        g === '8' ||
        g.includes('thamen') ||
        g.includes('ثامن') ||
        g.includes('8') ||
        c.includes('-8-') ||
        c.startsWith('STU-8-')
      );
    }
    if (targetGrade === '9') {
      return (
        g === '9' ||
        g.includes('tasea') ||
        g.includes('تاسع') ||
        g.includes('9') ||
        c.includes('-9-') ||
        c.startsWith('STU-9-')
      );
    }
    return false;
  };

  const selectedGradeLabel =
    GRADES.find((g) => g.id === selectedGrade)?.label || 'الصف السابع';

  // Helper to build student performance list for an independent grade
  const buildStudentPerformance = (
    gradeFilter: string = selectedGrade
  ): PrincipalStudentReportItem[] => {
    const allCodes = authService
      .getRegisteredCodes()
      .filter(
        (c) =>
          c.role === 'student' &&
          Boolean(schoolId) &&
          (c.schoolId || '').trim().toLowerCase() === (schoolId || '').trim().toLowerCase()
      )
      .filter((c) => matchesGrade(c.grade || (c as any).class, c.code, gradeFilter));

    const studentMap: Record<
      string,
      {
        code: string;
        name: string;
        grade?: string;
        count: number;
        totalScore: number;
        maxScore: number;
      }
    > = {};

    allCodes.forEach((c) => {
      let g = c.grade;
      if (!g) {
        if (c.code.includes('-7-')) g = '7';
        else if (c.code.includes('-8-')) g = '8';
        else if (c.code.includes('-9-')) g = '9';
      }
      studentMap[c.code] = {
        code: c.code,
        name: c.assignedToName || (c as any).name || 'طالب',
        grade: g || gradeFilter,
        count: 0,
        totalScore: 0,
        maxScore: 0,
      };
    });

    const filteredSubs = submissions.filter((s) =>
      matchesGrade(s.grade || s.class, s.studentCode, gradeFilter)
    );

    filteredSubs.forEach((s) => {
      const sc = s.studentCode || '';
      if (!studentMap[sc]) {
        let g = s.grade || s.class;
        if (!g) {
          if (sc.includes('-7-')) g = '7';
          else if (sc.includes('-8-')) g = '8';
          else if (sc.includes('-9-')) g = '9';
        }
        studentMap[sc] = {
          code: sc,
          name: s.studentName || sc,
          grade: g || gradeFilter,
          count: 0,
          totalScore: 0,
          maxScore: 0,
        };
      }
      studentMap[sc].count += 1;
      studentMap[sc].totalScore += Number(s.score ?? 5);
      studentMap[sc].maxScore += Number(s.maxScore ?? 5);
    });

    return Object.values(studentMap)
      .map((st) => {
        const gpa =
          st.maxScore > 0
            ? Math.round((st.totalScore / st.maxScore) * 100)
            : st.count > 0
            ? 85
            : 0;
        let status = 'ناجح';
        if (gpa >= 90) status = 'متميز';
        else if (gpa < 50) status = 'راسب';
        return {
          studentName: st.name,
          grade: st.grade,
          submissionsCount: st.count,
          gpa,
          status,
        };
      })
      .sort((a, b) => b.gpa - a.gpa);
  };

  // Monthly reports list strictly for independent grades ('7', '8', '9')
  const monthlyReportsList = useMemo(() => {
    const list: Array<{
      id: string;
      month: string;
      year: number;
      grade: string;
      submissionsCount: number;
      studentsCount: number;
      avgScore: number;
      passRate: number;
      archivedAt: string;
      archived: boolean;
    }> = [];

    ACADEMIC_MONTHS.forEach((m) => {
      const yr = selectedYear;
      ['7', '8', '9'].forEach((g) => {
        const students = buildStudentPerformance(g);
        const subsCount = students.reduce((sum, s) => sum + s.submissionsCount, 0);
        const avg =
          students.length > 0
            ? Math.round(students.reduce((sum, s) => sum + s.gpa, 0) / students.length)
            : 0;
        const pass =
          students.length > 0
            ? Math.round((students.filter((s) => s.gpa >= 50).length / students.length) * 100)
            : 0;

        list.push({
          id: `monthly_${yr}_${m}_${g}`,
          month: m,
          year: yr,
          grade: g,
          submissionsCount: subsCount,
          studentsCount: students.length,
          avgScore: avg,
          passRate: pass,
          archivedAt: `1446-1447هـ (${yr})`,
          archived: true,
        });
      });
    });

    return list;
  }, [submissions, selectedYear, schoolId]);

  const filteredMonthlyReportsForGrade = useMemo(() => {
    return monthlyReportsList.filter((r) => {
      if (r.grade !== selectedGrade) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const gradeName = getGradeLabelAr(r.grade).toLowerCase();
        if (
          !r.month.toLowerCase().includes(q) &&
          !String(r.year).includes(q) &&
          !gradeName.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [monthlyReportsList, selectedGrade, searchQuery]);

  // Normalized Teacher Activities (Batches + Live/Archived Questions deduplicated)
  const filteredTeacherActivities = useMemo(() => {
    const byId = new Map<string, NormalizedTeacherActivityEntry>();

    teacherActivityBatches.forEach((batch) => {
      (batch.activities || []).forEach((act) => {
        const ts = act.timestamp || batch.archivedTimestamp || Date.now();
        const mName =
          ts > 0
            ? getAcademicMonthFromTimestamp(ts)
            : batch.monthName || currentAcademicMonth;
        const yr = ts > 0 ? new Date(ts).getFullYear() : batch.year || selectedYear;
        if (!byId.has(act.id)) {
          byId.set(act.id, {
            ...act,
            timestamp: ts,
            monthName: mName,
            year: yr,
          });
        }
      });
    });

    liveQuestions.forEach((q) => {
      const ts = getQuestionTimestamp(q);
      if (!ts || ts <= 0) return;
      const itemId = `q_${q.id}`;
      if (byId.has(itemId)) return;

      const teacherLabel = (q.teacherName || 'المعلم').trim();
      const subjLabel = (q.subject || 'المادة').trim();
      const gradeAr = getGradeLabelAr(q.grade || q.class || '7');
      const mName =
        (q as any).month && (ACADEMIC_MONTHS as readonly string[]).includes((q as any).month)
          ? (q as any).month
          : getAcademicMonthFromTimestamp(ts);

      byId.set(itemId, {
        id: itemId,
        text: `${teacherLabel} معلم ${subjLabel} نشر الواجب المنزلي _ ${gradeAr}`,
        teacherName: teacherLabel,
        subject: subjLabel,
        grade: gradeAr,
        timestamp: ts,
        dateLabel: new Date(ts).toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        timeLabel: formatArabicDateTime(ts),
        monthName: mName,
        year: new Date(ts).getFullYear(),
      });
    });

    return Array.from(byId.values())
      .filter((act) => {
        if (act.year && act.year !== selectedYear) return false;
        if (act.grade && !matchesGrade(act.grade, '', selectedGrade)) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            (act.text || '').toLowerCase().includes(q) ||
            (act.teacherName || '').toLowerCase().includes(q) ||
            (act.subject || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [teacherActivityBatches, liveQuestions, selectedYear, selectedGrade, searchQuery, currentAcademicMonth]);

  // Normalized School Activities (Batches + Approved Supervisor Activities deduplicated)
  const filteredSchoolActivities = useMemo(() => {
    const byId = new Map<string, NormalizedSchoolActivityEntry>();

    schoolActivityBatches.forEach((batch) => {
      (batch.activities || []).forEach((act) => {
        const ts = act.timestamp || batch.archivedTimestamp || Date.now();
        const mName =
          ts > 0
            ? getAcademicMonthFromTimestamp(ts)
            : batch.monthName || currentAcademicMonth;
        const yr = ts > 0 ? new Date(ts).getFullYear() : batch.year || selectedYear;
        if (!byId.has(act.id)) {
          byId.set(act.id, {
            ...act,
            timestamp: ts,
            monthName: mName,
            year: yr,
          });
        }
      });
    });

    approvedSchoolActivities.forEach((act) => {
      const ts = getSchoolActivityTimestamp(act) || Date.now();
      const imgs = Array.isArray(act.images) ? act.images : [];
      const mName = ts > 0 ? getAcademicMonthFromTimestamp(ts) : currentAcademicMonth;
      const yr = ts > 0 ? new Date(ts).getFullYear() : selectedYear;
      const existing = byId.get(act.id);

      const entry: NormalizedSchoolActivityEntry = {
        id: act.id,
        title: (act.title || '').trim(),
        category: act.category,
        subType: act.subType,
        formalText: (act.formalText || act.details || '').trim(),
        targetGrade: act.targetGrade || 'عام',
        targetClass: act.targetClass || '',
        activityDate: act.activityDate || '',
        createdBy: act.createdBy || 'المشرف',
        approvedBy: act.approvedBy || 'مدير المدرسة',
        coverImage: existing?.coverImage || imgs[0],
        imagesCount: Math.max(existing?.imagesCount || 0, imgs.length),
        allImages: imgs,
        inputType: act.inputType,
        timestamp: existing?.timestamp || ts,
        dateLabel:
          existing?.dateLabel ||
          new Date(ts).toLocaleDateString('ar-YE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
        timeLabel: existing?.timeLabel || formatArabicDateTime(ts),
        monthName: existing?.monthName || mName,
        year: existing?.year || yr,
      };
      byId.set(act.id, entry);
    });

    const normalizeBucket = (cat: SupervisorActivityCategory): 'تقرير' | 'نشاط' | 'فعالية' => {
      if (cat === 'تقرير') return 'تقرير';
      if (cat === 'فعالية') return 'فعالية';
      return 'نشاط';
    };

    return Array.from(byId.values())
      .filter((act) => {
        if (act.year && act.year !== selectedYear) return false;
        if (
          selectedSchoolActivityCat !== 'الكل' &&
          normalizeBucket(act.category) !== selectedSchoolActivityCat
        ) {
          return false;
        }
        if (
          act.targetGrade &&
          act.targetGrade !== 'الكل' &&
          act.targetGrade !== 'عام' &&
          act.targetGrade !== 'all' &&
          !matchesGrade(act.targetGrade, '', selectedGrade)
        ) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            (act.title || '').toLowerCase().includes(q) ||
            (act.formalText || '').toLowerCase().includes(q) ||
            (act.createdBy || '').toLowerCase().includes(q) ||
            (act.subType || '').toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [
    schoolActivityBatches,
    approvedSchoolActivities,
    selectedYear,
    selectedSchoolActivityCat,
    selectedGrade,
    searchQuery,
    currentAcademicMonth,
  ]);

  // Filtered Circulars with resolved academic month & timestamp
  const filteredCirculars = useMemo(() => {
    return announcements
      .filter((a) => !isSimulationAnnouncement(a))
      .map((anc) => {
        const ts = getQuestionTimestamp(anc) || Date.now();
        const mName =
          (anc as any)?.month && (ACADEMIC_MONTHS as readonly string[]).includes((anc as any).month)
            ? (anc as any).month
            : getAcademicMonthFromTimestamp(ts);
        return {
          ...anc,
          _ts: ts,
          _monthName: mName,
          _year: ts > 0 ? new Date(ts).getFullYear() : selectedYear,
        };
      })
      .filter((anc) => {
        if (anc._year && anc._year !== selectedYear) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const sender =
            anc.senderName && !isGenericPrincipalSender(anc.senderName)
              ? anc.senderName
              : getSchoolPrincipalName(anc.schoolId || schoolId, schoolName);
          const matchesText =
            anc.title.toLowerCase().includes(q) ||
            anc.content.toLowerCase().includes(q) ||
            sender.toLowerCase().includes(q);
          if (!matchesText) return false;
        }
        return true;
      })
      .sort((a, b) => b._ts - a._ts);
  }, [announcements, selectedYear, searchQuery, schoolId, schoolName]);

  // Cumulative data for the selected independent grade
  const cumulativeStudents = useMemo(() => {
    return buildStudentPerformance(selectedGrade);
  }, [selectedGrade, submissions]);

  const cumulativeTotalSubs = cumulativeStudents.reduce((sum, s) => sum + s.submissionsCount, 0);
  const cumulativeAvg =
    cumulativeStudents.length > 0
      ? Math.round(
          cumulativeStudents.reduce((sum, s) => sum + s.gpa, 0) / cumulativeStudents.length
        )
      : 0;
  const cumulativePassRate =
    cumulativeStudents.length > 0
      ? Math.round(
          (cumulativeStudents.filter((s) => s.gpa >= 50).length / cumulativeStudents.length) * 100
        )
      : 0;

  const groupItemsByDay = <T,>(items: T[], getTs: (item: T) => number) => {
    const map = new Map<string, T[]>();
    items.forEach((item) => {
      const ts = getTs(item) || Date.now();
      const dayKey = formatDayKeyFromTimestamp(ts);
      const arr = map.get(dayKey) || [];
      arr.push(item);
      map.set(dayKey, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  };

  const toggleDayKey = (dayKey: string) => {
    setExpandedDayKeys((prev) => ({
      ...prev,
      [dayKey]: !prev[dayKey],
    }));
  };

  const renderFolderBackHeader = (
    monthName: string,
    countText: string
  ) => (
    <div className="bg-[#F4F8FC] border border-[#DCE7F3] rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <FolderOpen className="w-5 h-5 text-amber-600 shrink-0" />
        <span className="text-xs sm:text-sm font-black text-[#1A3A5F] truncate">
          مجلد شهر ({monthName}) — {selectedGradeLabel}
        </span>
        <span className="text-xs font-bold text-[#1F5AAA] tabular-nums shrink-0">
          · {countText}
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          setOpenedMonthFolder(null);
          setExpandedDayKeys({});
        }}
        className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap shrink-0"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        <span>العودة لمجلدات الشهور</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6 text-right font-['Cairo','Tajawal']">
      {/* Top Navigation Ribbon */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-[#DCE7F3] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="p-2 rounded-xl bg-[#EEF5FC] hover:bg-[#E0ECF9] text-[#1F5AAA] border border-[#C6DCF2] transition cursor-pointer flex items-center gap-1.5 text-xs font-bold whitespace-nowrap shrink-0"
            title="العودة للتقارير"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة للتقارير</span>
          </button>

          <div>
            <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
              {view === 'archive_monthly' && (
                <>
                  <CalendarCheck className="w-5 h-5 text-[#1F5AAA]" />
                  <span>أرشيف التقارير الشهرية</span>
                </>
              )}
              {view === 'archive_teacher_activities' && (
                <>
                  <Activity className="w-5 h-5 text-[#1F5AAA]" />
                  <span>أرشيف أنشطة المعلمين</span>
                </>
              )}
              {view === 'archive_school_activities' && (
                <>
                  <Trophy className="w-5 h-5 text-[#1F5AAA]" />
                  <span>أرشفة الأنشطة المدرسية</span>
                </>
              )}
              {view === 'archive_cumulative' && (
                <>
                  <Award className="w-5 h-5 text-[#1F5AAA]" />
                  <span>أرشيف التقرير التراكمي السنوي</span>
                </>
              )}
              {view === 'archive_circulars' && (
                <>
                  <Megaphone className="w-5 h-5 text-[#1F5AAA]" />
                  <span>أرشيف التعاميم والملاحظات الشهري</span>
                </>
              )}
            </h2>
            <p className="text-xs text-slate-600 font-semibold">
              {view === 'archive_teacher_activities'
                ? 'أرشيف أنشطة المعلمين مصنفة في مجلدات شهرية وتواريخ يومية منسدلة'
                : view === 'archive_school_activities'
                ? 'التقارير والأنشطة والفعاليات المدرسية المعتمدة في مجلدات شهرية وتواريخ يومية'
                : 'سجل الأرشيف المدرسي المعتمد'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#EEF5FC] px-3 py-1.5 rounded-xl border border-[#C6DCF2] text-xs font-bold text-[#1F5AAA] whitespace-nowrap shrink-0">
          <School className="w-4 h-4" />
          <span>{selectedGradeLabel}</span>
        </div>
      </div>

      {/* Filter and Search Bar (Independent Grades Only — No "جميع الصفوف") */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#DCE7F3] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الأرشيف..."
              className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-[#DCE7F3] focus:outline-[#1F5AAA] bg-white font-semibold text-[#1A3A5F]"
            />
          </div>

          {/* Independent Grade Selector */}
          <div>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] font-bold text-[#1A3A5F] cursor-pointer"
            >
              <option value="7">الصف السابع</option>
              <option value="8">الصف الثامن</option>
              <option value="9">الصف التاسع</option>
            </select>
          </div>

          {/* Academic Year */}
          <div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] font-bold text-[#1A3A5F] cursor-pointer"
            >
              <option value={2026}>العام الدراسي 2025 - 2026م</option>
              <option value={2025}>العام الدراسي 2024 - 2025م</option>
            </select>
          </div>
        </div>
      </div>

      {/* VIEW 1: MONTHLY REPORTS ARCHIVE (Computer Desktop Folders) */}
      {view === 'archive_monthly' && (
        <div className="space-y-4">
          {!openedMonthFolder ? (
            <ComputerMonthFoldersGrid
              currentMonth={currentAcademicMonth}
              getCountForMonth={(monthName) => {
                const match = filteredMonthlyReportsForGrade.find((r) => r.month === monthName);
                return match && match.studentsCount > 0 ? 1 : 0;
              }}
              unitLabel="كشف"
              headerTitle={`مجلدات التقارير الشهرية (${selectedGradeLabel}) — اضغط لفتح الشهر:`}
              onSelectMonth={(monthName) => {
                setOpenedMonthFolder(monthName);
                setExpandedDayKeys({});
              }}
            />
          ) : (
            <div className="space-y-4">
              {renderFolderBackHeader(openedMonthFolder, `${selectedGradeLabel}`)}

              {(() => {
                const monthReports = filteredMonthlyReportsForGrade.filter(
                  (r) => r.month === openedMonthFolder
                );
                if (monthReports.length === 0) {
                  return (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-slate-600 font-bold text-sm">
                      لا توجد تقارير مطابقة لخيارات البحث في هذا المجلد
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {monthReports.map((report) => {
                      const gradeLabel = getGradeLabelAr(report.grade);
                      const students = buildStudentPerformance(report.grade);

                      return (
                        <div
                          key={report.id}
                          className="bg-white rounded-2xl p-5 border border-[#DCE7F3] shadow-sm hover:shadow-md transition flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between flex-wrap gap-1.5 mb-3">
                              <span className="text-xs font-black text-[#1F5AAA]">
                                شهر {report.month} {report.year}
                              </span>
                              <span className="text-xs font-bold text-emerald-700">
                                مؤرشف ومعتمد
                              </span>
                            </div>

                            <h4 className="font-black text-[#1A3A5F] text-sm mb-1">
                              تقرير إنجاز وتقويم الطلاب
                            </h4>
                            <p className="text-xs text-slate-600 mb-3 font-semibold">
                              {gradeLabel} • {schoolName}
                            </p>

                            <div className="grid grid-cols-3 gap-2 bg-[#F8FAFC] p-2.5 rounded-xl border border-gray-200 text-center mb-4">
                              <div>
                                <span className="text-[11px] text-gray-500 block">الطلاب</span>
                                <span className="font-bold text-xs text-gray-800 tabular-nums">
                                  {report.studentsCount}
                                </span>
                              </div>
                              <div>
                                <span className="text-[11px] text-gray-500 block">التسليمات</span>
                                <span className="font-bold text-xs text-indigo-700 tabular-nums">
                                  {report.submissionsCount}
                                </span>
                              </div>
                              <div>
                                <span className="text-[11px] text-gray-500 block">متوسط الأداء</span>
                                <span className="font-bold text-xs text-emerald-700 tabular-nums">
                                  {report.avgScore}%
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
                            <button
                              type="button"
                              onClick={() => {
                                onOpenPdfModal({
                                  reportTitle: `كشف تقويم وإنجاز الطلاب الشهري (شهر ${report.month})`,
                                  periodLabel: `شهر ${report.month} ${report.year}`,
                                  isAnnual: false,
                                  gradeLabel,
                                  students,
                                });
                              }}
                              className="flex-1 py-2 px-3 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer border border-[#194B91] whitespace-nowrap"
                            >
                              <Download className="w-3.5 h-3.5 shrink-0" />
                              <span>تحميل PDF A4</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const matchedSaved = savedMonthlyReports.find(
                                  (sr) => sr.monthName === report.month && sr.year === report.year
                                );
                                const savedActs = (matchedSaved?.teacherActivities || []).filter(
                                  (act) => !act.grade || matchesGrade(act.grade, '', report.grade)
                                );
                                setSelectedReportDetail({
                                  ...report,
                                  students,
                                  teacherActivities: savedActs,
                                });
                              }}
                              className="p-2 rounded-xl bg-[#EEF5FC] hover:bg-[#E0ECF9] text-[#1F5AAA] border border-[#C6DCF2] transition cursor-pointer shrink-0"
                              title="معاينة الطلاب"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* VIEW 1B: TEACHER ACTIVITIES ARCHIVE (Computer Folders + Collapsed Day Accordions) */}
      {view === 'archive_teacher_activities' && (
        <div className="space-y-4">
          {!openedMonthFolder ? (
            <ComputerMonthFoldersGrid
              currentMonth={currentAcademicMonth}
              getCountForMonth={(monthName) =>
                filteredTeacherActivities.filter((act) => act.monthName === monthName).length
              }
              unitLabel="نشاط"
              headerTitle={`مجلدات أنشطة المعلمين (${selectedGradeLabel}) — اضغط لفتح الشهر:`}
              onSelectMonth={(monthName) => {
                setOpenedMonthFolder(monthName);
                setExpandedDayKeys({});
              }}
            />
          ) : (
            (() => {
              const monthActivities = filteredTeacherActivities.filter(
                (act) => act.monthName === openedMonthFolder
              );
              const dayGroups = groupItemsByDay(monthActivities, (a) => a.timestamp);

              return (
                <div className="space-y-4">
                  {renderFolderBackHeader(
                    openedMonthFolder,
                    `${monthActivities.length} نشاط`
                  )}

                  {dayGroups.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2">
                      <Folder className="w-11 h-11 text-[#9BBEDF] mx-auto" />
                      <p className="font-black text-sm text-[#1A3A5F]">
                        مجلد شهر ({openedMonthFolder}) فارغ لـ {selectedGradeLabel}
                      </p>
                      <p className="text-xs text-slate-500 font-semibold">
                        تُحفظ أنشطة المعلمين الخاصة بهذا الصف تلقائياً في هذا المجلد مصنفة بالتاريخ.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dayGroups.map(([dayKey, dayItems]) => {
                        const isExpanded = Boolean(expandedDayKeys[dayKey]);
                        const sortedDayItems = [...dayItems].sort(
                          (a, b) => b.timestamp - a.timestamp
                        );

                        return (
                          <div
                            key={`pri-ta-day-${dayKey}`}
                            className="bg-white rounded-2xl border border-[#DCE7F3] shadow-2xs overflow-hidden transition-colors"
                          >
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => toggleDayKey(dayKey)}
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
                                  {sortedDayItems.length} نشاط
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 text-[#1F5AAA] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </div>
                            </button>

                            <div
                              className={`grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="p-3 sm:p-4 bg-[#F8FAFD] space-y-2">
                                  {sortedDayItems.map((act, idx) => {
                                    const delayClass = isExpanded
                                      ? staggerDelays[Math.min(idx, staggerDelays.length - 1)]
                                      : 'delay-[0ms]';
                                    return (
                                      <div
                                        key={act.id}
                                        className={`bg-white rounded-xl p-3 border border-[#DCE7F3] flex items-center justify-between gap-3 text-xs transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${delayClass} ${
                                          isExpanded
                                            ? 'opacity-100 translate-y-0'
                                            : 'opacity-0 translate-y-2'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <Activity className="w-4 h-4 text-[#1F5AAA] shrink-0" />
                                          <span className="font-bold text-[#1A3A5F] leading-relaxed">
                                            {act.text}
                                          </span>
                                        </div>
                                        <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap shrink-0 tabular-nums">
                                          {act.timeLabel || act.dateLabel}
                                        </span>
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
            })()
          )}
        </div>
      )}

      {/* VIEW 1C: SCHOOL ACTIVITIES ARCHIVE (Computer Folders + Collapsed Day Accordions) */}
      {view === 'archive_school_activities' && (
        <div className="space-y-4">
          {/* Category Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(['الكل', 'تقرير', 'نشاط', 'فعالية'] as const).map((cat) => (
              <button
                key={`pri-arc-sa-cat-${cat}`}
                type="button"
                onClick={() => setSelectedSchoolActivityCat(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border whitespace-nowrap shrink-0 ${
                  selectedSchoolActivityCat === cat
                    ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-2xs'
                    : 'bg-white text-[#1A3A5F] hover:bg-[#EEF5FC] border-[#DCE7F3]'
                }`}
              >
                {cat === 'الكل'
                  ? 'الكل'
                  : cat === 'تقرير'
                  ? 'التقارير'
                  : cat === 'نشاط'
                  ? 'الأنشطة'
                  : 'الفعاليات'}
              </button>
            ))}
          </div>

          {!openedMonthFolder ? (
            <ComputerMonthFoldersGrid
              currentMonth={currentAcademicMonth}
              getCountForMonth={(monthName) =>
                filteredSchoolActivities.filter((act) => act.monthName === monthName).length
              }
              unitLabel="سجل"
              headerTitle="مجلدات الأنشطة والتقارير والفعاليات المدرسية — اضغط لفتح الشهر:"
              onSelectMonth={(monthName) => {
                setOpenedMonthFolder(monthName);
                setExpandedDayKeys({});
              }}
            />
          ) : (
            (() => {
              const monthActivities = filteredSchoolActivities.filter(
                (act) => act.monthName === openedMonthFolder
              );
              const dayGroups = groupItemsByDay(monthActivities, (a) => a.timestamp);

              return (
                <div className="space-y-4">
                  {renderFolderBackHeader(
                    openedMonthFolder,
                    `${monthActivities.length} سجل`
                  )}

                  {dayGroups.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2">
                      <Trophy className="w-10 h-10 text-[#9BBEDF] mx-auto" />
                      <p className="text-slate-700 font-black text-sm">
                        مجلد شهر ({openedMonthFolder}) لا يحتوي على سجلات مطابقة لخيارات البحث الحالية
                      </p>
                      <p className="text-xs text-slate-500 font-semibold">
                        تُحفظ التقارير والأنشطة والفعاليات المعتمدة في هذا الأرشيف مصنفة بالتاريخ.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dayGroups.map(([dayKey, dayItems]) => {
                        const isExpanded = Boolean(expandedDayKeys[dayKey]);
                        const sortedDayItems = [...dayItems].sort(
                          (a, b) => b.timestamp - a.timestamp
                        );

                        return (
                          <div
                            key={`pri-sa-day-${dayKey}`}
                            className="bg-white rounded-2xl border border-[#DCE7F3] shadow-2xs overflow-hidden transition-colors"
                          >
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => toggleDayKey(dayKey)}
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
                                  {sortedDayItems.length} سجل
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 text-[#1F5AAA] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </div>
                            </button>

                            <div
                              className={`grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="p-3 sm:p-4 bg-[#F8FAFD] grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                  {sortedDayItems.map((act, idx) => {
                                    const delayClass = isExpanded
                                      ? staggerDelays[Math.min(idx, staggerDelays.length - 1)]
                                      : 'delay-[0ms]';
                                    const bucket =
                                      act.category === 'تقرير'
                                        ? 'تقرير'
                                        : act.category === 'فعالية'
                                        ? 'فعالية'
                                        : 'نشاط';
                                    const coverSrc =
                                      act.coverImage ||
                                      (Array.isArray(act.allImages) ? act.allImages[0] : undefined);
                                    const classLabel =
                                      !act.targetGrade ||
                                      act.targetGrade === 'الكل' ||
                                      act.targetGrade === 'عام' ||
                                      act.targetGrade === 'all'
                                        ? 'نشاط مدرسي عام'
                                        : `${getGradeLabelAr(act.targetGrade)}${
                                            act.targetClass && act.targetClass !== 'الكل'
                                              ? ` — فصل ${act.targetClass}`
                                              : ''
                                          }`;

                                    return (
                                      <article
                                        key={act.id}
                                        className={`rounded-2xl border border-[#DCE7F3] bg-white overflow-hidden flex flex-col justify-between transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${delayClass} ${
                                          isExpanded
                                            ? 'opacity-100 translate-y-0'
                                            : 'opacity-0 translate-y-2'
                                        }`}
                                      >
                                        {coverSrc && (
                                          <button
                                            type="button"
                                            onClick={() => setLightboxImage(coverSrc)}
                                            className="block w-full aspect-video bg-slate-100 overflow-hidden cursor-pointer group relative"
                                            title="عرض الصورة بالحجم الكامل"
                                          >
                                            <img
                                              src={coverSrc}
                                              alt={act.title}
                                              referrerPolicy="no-referrer"
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
                                            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                                              <div className="flex items-center gap-1.5 font-black text-[#1F5AAA]">
                                                {bucket === 'فعالية' ? (
                                                  <Flag className="w-3.5 h-3.5" />
                                                ) : bucket === 'تقرير' ? (
                                                  <FileText className="w-3.5 h-3.5" />
                                                ) : (
                                                  <Trophy className="w-3.5 h-3.5" />
                                                )}
                                                <span>{bucket}</span>
                                                {act.subType && (
                                                  <span className="text-[#1A3A5F] font-bold">
                                                    · {act.subType}
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

                                          <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-[#5C7085] font-semibold">
                                            <span className="inline-flex items-center gap-1 text-[#1A3A5F] font-bold">
                                              <GraduationCap className="w-3 h-3 text-[#1F5AAA]" />
                                              <span>{classLabel}</span>
                                            </span>
                                            <span>
                                              المشرف: {act.createdBy} · اعتماد: {act.approvedBy || 'مدير المدرسة'}
                                            </span>
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
            })()
          )}
        </div>
      )}

      {/* VIEW 2: CUMULATIVE ANNUAL REPORT ARCHIVE (Independent Grade) */}
      {view === 'archive_cumulative' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">الطلاب المسجلون</span>
              <span className="text-xl font-black text-[#1A3A5F] tabular-nums">
                {cumulativeStudents.length} طالب
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">إجمالي التسليمات</span>
              <span className="text-xl font-black text-[#1F5AAA] tabular-nums">
                {cumulativeTotalSubs} تسليم
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">متوسط الأداء التراكمي</span>
              <span className="text-xl font-black text-emerald-700 tabular-nums">
                {cumulativeAvg}%
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">نسبة النجاح العامة</span>
              <span className="text-xl font-black text-amber-700 tabular-nums">
                {cumulativePassRate}%
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#DCE7F3] flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-black text-base text-[#1A3A5F] mb-1">
                التقرير التراكمي العام للعام الدراسي {selectedYear} - {selectedYear + 1}م ({selectedGradeLabel})
              </h3>
              <p className="text-xs text-slate-600 font-semibold">
                بيانات كل صف دراسي مستقلة ومنفصلة بالكامل.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                onOpenPdfModal({
                  reportTitle: 'التقرير التراكمي العام للعام الدراسي',
                  periodLabel: 'التقرير التراكمي السنوي',
                  isAnnual: true,
                  gradeLabel: `${selectedGradeLabel} الأساسي`,
                  students: cumulativeStudents,
                });
              }}
              className="w-full sm:w-auto justify-center text-center py-2.5 px-5 sm:px-6 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm transition flex items-center gap-2 cursor-pointer border border-[#194B91] whitespace-nowrap"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>تحميل التقرير التراكمي السنوي PDF A4</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-[#DCE7F3] shadow-sm overflow-hidden">
            <div className="p-4 bg-[#F4F8FC] border-b border-[#DCE7F3] flex items-center justify-between">
              <h4 className="font-black text-xs sm:text-sm text-[#1A3A5F]">
                كشف إنجاز وتقييم الطلاب في الأرشيف التراكمي — {selectedGradeLabel} ({cumulativeStudents.length} طالب)
              </h4>
              <span className="text-xs text-slate-600 font-bold">أسماء الطلاب</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-[#1F5AAA] text-white">
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-4 font-bold">اسم الطالب</th>
                    <th className="py-2.5 px-3 text-center">الصف</th>
                    <th className="py-2.5 px-3 text-center">التسليمات</th>
                    <th className="py-2.5 px-3 text-center">المعدل التراكمي %</th>
                    <th className="py-2.5 px-3 text-center">التقدير العام</th>
                    <th className="py-2.5 px-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {cumulativeStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 font-bold">
                        لا يوجد طلاب في هذا الصف
                      </td>
                    </tr>
                  ) : (
                    cumulativeStudents.map((st, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFD]'}>
                        <td className="py-2 px-3 text-center font-bold text-slate-600 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-4 font-bold text-[#1A3A5F]">{st.studentName}</td>
                        <td className="py-2 px-3 text-center font-bold text-[#1F5AAA]">
                          الصف {st.grade || selectedGrade}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-[#1A3A5F] tabular-nums">
                          {st.submissionsCount}
                        </td>
                        <td className="py-2 px-3 text-center font-black text-emerald-700 tabular-nums">
                          {st.gpa}%
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-[#1F5AAA] whitespace-nowrap">
                          {st.gpa >= 90
                            ? 'متميز (أ)'
                            : st.gpa >= 80
                            ? 'جيد جداً (ب)'
                            : st.gpa >= 65
                            ? 'جيد (ج)'
                            : st.gpa >= 50
                            ? 'مقبول (د)'
                            : 'يحتاج متابعة'}
                        </td>
                        <td className="py-2 px-3 text-center text-slate-600 font-semibold text-[11px]">
                          {st.status}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: CIRCULARS AND NOTES ARCHIVE (Computer Folders + Collapsed Day Accordions) */}
      {view === 'archive_circulars' && (
        <div className="space-y-4">
          {!openedMonthFolder ? (
            <ComputerMonthFoldersGrid
              currentMonth={currentAcademicMonth}
              getCountForMonth={(monthName) =>
                filteredCirculars.filter((anc) => anc._monthName === monthName).length
              }
              unitLabel="تعميم"
              headerTitle="مجلدات التعاميم والملاحظات الشهرية — اضغط لفتح الشهر:"
              onSelectMonth={(monthName) => {
                setOpenedMonthFolder(monthName);
                setExpandedDayKeys({});
              }}
            />
          ) : (
            (() => {
              const monthCirculars = filteredCirculars.filter(
                (anc) => anc._monthName === openedMonthFolder
              );
              const dayGroups = groupItemsByDay(monthCirculars, (anc) => anc._ts);

              return (
                <div className="space-y-4">
                  {renderFolderBackHeader(
                    openedMonthFolder,
                    `${monthCirculars.length} تعميم`
                  )}

                  {dayGroups.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-slate-600 font-bold text-sm">
                      لا توجد تعاميم أو ملاحظات في مجلد شهر ({openedMonthFolder}) مطابقة للبحث
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dayGroups.map(([dayKey, dayItems]) => {
                        const isExpanded = Boolean(expandedDayKeys[dayKey]);
                        const sortedDayItems = [...dayItems].sort((a, b) => b._ts - a._ts);

                        return (
                          <div
                            key={`pri-cir-day-${dayKey}`}
                            className="bg-white rounded-2xl border border-[#DCE7F3] shadow-2xs overflow-hidden transition-colors"
                          >
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={() => toggleDayKey(dayKey)}
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
                                  {sortedDayItems.length} تعميم
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 text-[#1F5AAA] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </div>
                            </button>

                            <div
                              className={`grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="p-3 sm:p-4 bg-[#F8FAFD] grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                  {sortedDayItems.map((anc, idx) => {
                                    const delayClass = isExpanded
                                      ? staggerDelays[Math.min(idx, staggerDelays.length - 1)]
                                      : 'delay-[0ms]';
                                    return (
                                      <div
                                        key={anc.id}
                                        className={`bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-2xs flex flex-col justify-between transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${delayClass} ${
                                          isExpanded
                                            ? 'opacity-100 translate-y-0'
                                            : 'opacity-0 translate-y-2'
                                        }`}
                                      >
                                        <div>
                                          <div className="flex items-center justify-between flex-wrap gap-1.5 mb-2 text-[11px]">
                                            <span className="font-bold text-[#1F5AAA]">
                                              {anc.target === 'all'
                                                ? 'موجه للجميع'
                                                : anc.target === 'teachers'
                                                ? 'للمعلمين فقط'
                                                : 'للطلاب فقط'}
                                            </span>
                                            <span
                                              className={`font-black ${
                                                anc.priority === 'عاجل'
                                                  ? 'text-rose-700'
                                                  : anc.priority === 'هام'
                                                  ? 'text-amber-700'
                                                  : 'text-slate-600'
                                              }`}
                                            >
                                              {anc.priority}
                                            </span>
                                          </div>

                                          <h4 className="font-black text-[#1A3A5F] text-sm mb-1">
                                            {anc.title}
                                          </h4>
                                          <p className="text-xs text-slate-600 leading-relaxed mb-4 font-medium">
                                            {anc.content}
                                          </p>
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-[11px] text-slate-600 font-semibold">
                                          <span>
                                            المرسل:{' '}
                                            {anc.senderName && !isGenericPrincipalSender(anc.senderName)
                                              ? anc.senderName
                                              : getSchoolPrincipalName(anc.schoolId || schoolId, schoolName)}{' '}
                                            ({anc.createdAt})
                                          </span>
                                          <span className="flex items-center gap-1 text-emerald-700 font-bold">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>معتمد في السجل</span>
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
            })()
          )}
        </div>
      )}

      {/* Modal: Quick Details for Monthly Report */}
      {selectedReportDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 sm:p-5 max-h-[90dvh] overflow-y-auto my-auto text-right shadow-2xl border border-[#B3CDE8] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 mb-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-sm sm:text-base text-[#1A3A5F] truncate">
                  تفاصيل كشف شهر {selectedReportDetail.month} {selectedReportDetail.year}
                </h3>
                <p className="text-xs text-slate-600 font-semibold">
                  {getGradeLabelAr(selectedReportDetail.grade)} • {selectedReportDetail.studentsCount} طالب مسجل
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReportDetail(null)}
                className="p-1.5 rounded-lg bg-[#F0F4F8] hover:bg-[#E2ECF5] text-[#1A3A5F] transition cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#DCE7F3] mb-4">
              <table className="w-full min-w-[460px] text-right text-xs">
                <thead>
                  <tr className="bg-[#1F5AAA] text-white">
                    <th className="py-2 px-2 text-center">#</th>
                    <th className="py-2 px-3 font-black">اسم الطالب</th>
                    <th className="py-2 px-2 text-center">الصف</th>
                    <th className="py-2 px-2 text-center">التسليمات</th>
                    <th className="py-2 px-2 text-center">المعدل %</th>
                    <th className="py-2 px-2 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {selectedReportDetail.students?.map((s: any, idx: number) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFD]'}>
                      <td className="py-1.5 px-2 text-center font-bold text-slate-700 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-3 font-bold text-[#1A3A5F]">{s.studentName}</td>
                      <td className="py-1.5 px-2 text-center font-black text-[#1F5AAA]">
                        الصف {s.grade}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono font-black text-[#1A3A5F] tabular-nums">
                        {s.submissionsCount}
                      </td>
                      <td className="py-1.5 px-2 text-center font-black text-emerald-700 tabular-nums">
                        {s.gpa}%
                      </td>
                      <td className="py-1.5 px-2 text-center font-black text-emerald-800">
                        {s.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedReportDetail.teacherActivities &&
              selectedReportDetail.teacherActivities.length > 0 && (
                <div className="mb-4 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] p-3 space-y-2">
                  <h4 className="font-black text-xs text-[#1A3A5F]">
                    أرشيف أنشطة المعلمين ({selectedReportDetail.teacherActivities.length})
                  </h4>
                  <div className="divide-y divide-slate-200 bg-white rounded-lg border border-[#DCE7F3] px-3">
                    {selectedReportDetail.teacherActivities.map((act: any) => (
                      <div
                        key={act.id}
                        className="py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-bold text-[#1A3A5F] min-w-0 flex-1">{act.text}</span>
                        <span className="text-[11px] text-slate-600 font-semibold whitespace-nowrap shrink-0 tabular-nums">
                          {act.dateLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedReportDetail(null)}
                className="py-2 px-4 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black transition cursor-pointer whitespace-nowrap"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-white rounded-2xl p-2 shadow-2xl border border-[#DCE7F3]"
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
              alt="معاينة الصورة"
              className="w-full max-h-[80dvh] object-contain rounded-xl bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
};
