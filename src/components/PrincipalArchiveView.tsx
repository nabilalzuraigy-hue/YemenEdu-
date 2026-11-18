import React, { useState, useMemo } from 'react';
import {
  CalendarCheck,
  Award,
  Megaphone,
  Search,
  Filter,
  Download,
  Eye,
  FileText,
  School,
  Clock,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Users,
  ChevronDown,
  Activity,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Announcement,
  HomeworkSubmission,
  MonthlyReportRecord,
  TeacherActivityArchiveBatch,
  appDataService,
} from '../services/appData';
import { authService } from '../services/authService';
import { PrincipalStudentReportItem } from './PrincipalReportPdfModal';
import {
  getSchoolPrincipalName,
  isGenericPrincipalSender,
  isSimulationAnnouncement,
} from '../utils/schoolDisplay';

interface PrincipalArchiveViewProps {
  view: 'archive_monthly' | 'archive_teacher_activities' | 'archive_cumulative' | 'archive_circulars';
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
];

const GRADES = [
  { id: 'all', label: 'جميع الصفوف (سابع - ثامن - تاسع)' },
  { id: '7', label: 'الصف السابع' },
  { id: '8', label: 'الصف الثامن' },
  { id: '9', label: 'الصف التاسع' },
];

export const PrincipalArchiveView: React.FC<PrincipalArchiveViewProps> = ({
  view,
  schoolId,
  schoolName,
  submissions,
  announcements,
  onOpenPdfModal,
  onBackToDashboard,
}) => {
  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedReportDetail, setSelectedReportDetail] = useState<any | null>(null);
  const [savedMonthlyReports, setSavedMonthlyReports] = useState<MonthlyReportRecord[]>([]);
  const [teacherActivityBatches, setTeacherActivityBatches] = useState<TeacherActivityArchiveBatch[]>([]);

  React.useEffect(() => {
    if (!schoolId) return;
    appDataService.getArchivedMonthlyReports(schoolId).then(setSavedMonthlyReports).catch(() => {});
    appDataService.getArchivedTeacherActivityBatches(schoolId).then(setTeacherActivityBatches).catch(() => {});

    try {
      const qRep = query(collection(db, 'monthlyReports'), where('schoolId', '==', schoolId));
      const unsub = onSnapshot(
        qRep,
        (snap) => {
          const allDocs = snap.docs.map((d) => d.data() as any);
          setSavedMonthlyReports(
            allDocs.filter((r) => r.recordType !== 'teacher_activities_archive' && r.recordType !== 'monthly_homework_archive') as MonthlyReportRecord[]
          );
          setTeacherActivityBatches(
            (allDocs.filter((r) => r.recordType === 'teacher_activities_archive') as TeacherActivityArchiveBatch[]).sort(
              (a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)
            )
          );
        },
        () => {}
      );
      return () => unsub();
    } catch {
      return undefined;
    }
  }, [schoolId]);

  // Strict Grade Matching Helper (Preserving complete class isolation)
  const matchesGrade = (gradeVal?: string, codeVal?: string, targetGrade: string = selectedGrade): boolean => {
    if (targetGrade === 'all') return true;
    const g = String(gradeVal || '').trim().toLowerCase();
    const c = String(codeVal || '').trim().toUpperCase();

    if (targetGrade === '7') {
      return g === '7' || g.includes('سابع') || g.includes('7') || c.includes('-7-') || c.startsWith('STU-7-');
    }
    if (targetGrade === '8') {
      return g === '8' || g.includes('thamen') || g.includes('ثامن') || g.includes('8') || c.includes('-8-') || c.startsWith('STU-8-');
    }
    if (targetGrade === '9') {
      return g === '9' || g.includes('tasea') || g.includes('تاسع') || g.includes('9') || c.includes('-9-') || c.startsWith('STU-9-');
    }
    return true;
  };

  // Helper to build student performance list for any grade
  const buildStudentPerformance = (gradeFilter: string = selectedGrade): PrincipalStudentReportItem[] => {
    const allCodes = authService
      .getRegisteredCodes()
      .filter(
        (c) =>
          c.role === 'student' &&
          Boolean(schoolId) &&
          (c.schoolId || '').trim().toLowerCase() === (schoolId || '').trim().toLowerCase()
      )
      .filter((c) => matchesGrade(c.grade || (c as any).class, c.code, gradeFilter));

    const studentMap: Record<string, { code: string; name: string; grade?: string; count: number; totalScore: number; maxScore: number }> = {};

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
        grade: g || (gradeFilter === 'all' ? '7' : gradeFilter),
        count: 0,
        totalScore: 0,
        maxScore: 0,
      };
    });

    const filteredSubs = submissions.filter((s) => matchesGrade(s.grade || s.class, s.studentCode, gradeFilter));

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

    return Object.values(studentMap)
      .map((st) => {
        const gpa = st.maxScore > 0 ? Math.round((st.totalScore / st.maxScore) * 100) : (st.count > 0 ? 85 : 0);
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

  // Generate monthly reports list for archive
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

    // Build entries for each academic month
    ACADEMIC_MONTHS.forEach((m, idx) => {
      const yr = selectedYear;
      ['all', '7', '8', '9'].forEach((g) => {
        const students = buildStudentPerformance(g);
        const subsCount = students.reduce((sum, s) => sum + s.submissionsCount, 0);
        const avg = students.length > 0 ? Math.round(students.reduce((sum, s) => sum + s.gpa, 0) / students.length) : 0;
        const pass = students.length > 0 ? Math.round((students.filter((s) => s.gpa >= 50).length / students.length) * 100) : 0;

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

  // Filtered Monthly Reports
  const filteredMonthlyReports = useMemo(() => {
    return monthlyReportsList.filter((r) => {
      if (selectedGrade !== 'all' && r.grade !== selectedGrade) return false;
      if (selectedMonth !== 'all' && r.month !== selectedMonth) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.month.toLowerCase().includes(q) || String(r.year).includes(q);
        if (!matchesName) return false;
      }
      return true;
    });
  }, [monthlyReportsList, selectedGrade, selectedMonth, searchQuery]);

  // Filtered Circulars (Strictly excluding any simulation circulars)
  const filteredCirculars = useMemo(() => {
    return announcements
      .filter((a) => !isSimulationAnnouncement(a))
      .filter((a) => {
        if (selectedGrade !== 'all') {
          // match target
          if (selectedGrade === 'teachers' && a.target !== 'teachers' && a.target !== 'all') return false;
          if (selectedGrade === 'students' && a.target !== 'students' && a.target !== 'all') return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const sender =
            a.senderName && !isGenericPrincipalSender(a.senderName)
              ? a.senderName
              : getSchoolPrincipalName(a.schoolId || schoolId, schoolName);
          const matchesText =
            a.title.toLowerCase().includes(q) ||
            a.content.toLowerCase().includes(q) ||
            sender.toLowerCase().includes(q);
          if (!matchesText) return false;
        }
        return true;
      });
  }, [announcements, selectedGrade, searchQuery, schoolId, schoolName]);

  // Cumulative data for the selected grade
  const cumulativeStudents = useMemo(() => {
    return buildStudentPerformance(selectedGrade);
  }, [selectedGrade, submissions]);

  const cumulativeTotalSubs = cumulativeStudents.reduce((sum, s) => sum + s.submissionsCount, 0);
  const cumulativeAvg = cumulativeStudents.length > 0 ? Math.round(cumulativeStudents.reduce((sum, s) => sum + s.gpa, 0) / cumulativeStudents.length) : 0;
  const cumulativePassRate = cumulativeStudents.length > 0 ? Math.round((cumulativeStudents.filter((s) => s.gpa >= 50).length / cumulativeStudents.length) * 100) : 0;

  // Filtered Thursday Teacher Activity Archive Batches
  const filteredTeacherActivityBatches = useMemo(() => {
    return teacherActivityBatches
      .filter((batch) => {
        if (selectedMonth !== 'all' && batch.monthName !== selectedMonth) return false;
        if (batch.year && batch.year !== selectedYear) return false;
        return true;
      })
      .map((batch) => {
        const filteredItems = (batch.activities || []).filter((act) => {
          if (selectedGrade !== 'all' && !matchesGrade(act.grade, '', selectedGrade)) return false;
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const match =
              (act.text || '').toLowerCase().includes(q) ||
              (act.teacherName || '').toLowerCase().includes(q) ||
              (act.subject || '').toLowerCase().includes(q) ||
              (batch.weekLabel || '').toLowerCase().includes(q);
            if (!match) return false;
          }
          return true;
        });
        return { ...batch, activities: filteredItems };
      })
      .filter((batch) => batch.activities.length > 0);
  }, [teacherActivityBatches, selectedGrade, selectedMonth, selectedYear, searchQuery]);

  return (
    <div className="space-y-6 text-right font-['Cairo','Tajawal']">
      
      {/* Top Navigation Ribbon with Back Button */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-[#DCE7F3] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToDashboard}
            className="p-2 rounded-xl bg-[#EEF5FC] hover:bg-[#E0ECF9] text-[#1F5AAA] border border-[#C6DCF2] transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
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
                ? 'أرشفة تلقائية أسبوعية كل يوم خميس لجميع أنشطة المعلمين'
                : 'سجل رقمي معتمد ومؤرشف وفق معايير وزارة التربية والتعليم'}
            </p>
          </div>
        </div>

        {/* Grade Pill Indicator */}
        <div className="flex items-center gap-2 bg-[#EEF5FC] px-3 py-1.5 rounded-xl border border-[#C6DCF2] text-xs font-bold text-[#1F5AAA]">
          <School className="w-4 h-4" />
          <span>{GRADES.find((g) => g.id === selectedGrade)?.label || 'جميع الصفوف'}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#DCE7F3] space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          
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

          {/* Grade Selector */}
          <div>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] font-bold text-[#1A3A5F]"
            >
              <option value="all">جميع الصفوف (سابع - ثامن - تاسع)</option>
              <option value="7">الصف السابع</option>
              <option value="8">الصف الثامن</option>
              <option value="9">الصف التاسع</option>
            </select>
          </div>

          {/* Month Selector (if monthly view or circulars) */}
          {view !== 'archive_cumulative' && (
            <div>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] font-bold text-[#1A3A5F]"
              >
                <option value="all">جميع الأشهر الدراسية</option>
                {ACADEMIC_MONTHS.map((m) => (
                  <option key={m} value={m}>شهر {m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Academic Year */}
          <div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] font-bold text-[#1A3A5F]"
            >
              <option value={2026}>العام الدراسي 2025 - 2026م</option>
              <option value={2025}>العام الدراسي 2024 - 2025م</option>
            </select>
          </div>
        </div>
      </div>

      {/* VIEW 1: MONTHLY REPORTS ARCHIVE */}
      {view === 'archive_monthly' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMonthlyReports.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-slate-600 font-bold text-sm">
                لا توجد تقارير مطابقة لمعايير البحث في الأرشيف
              </div>
            ) : (
              filteredMonthlyReports.map((report) => {
                const gradeLabel = report.grade === 'all' ? 'جميع الصفوف' : `الصف ال${report.grade === '7' ? 'سابع' : report.grade === '8' ? 'ثامن' : 'تاسع'}`;
                const students = buildStudentPerformance(report.grade);

                return (
                  <div
                    key={report.id}
                    className="bg-white rounded-2xl p-5 border border-[#DCE7F3] shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between flex-wrap gap-1.5 mb-3">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                          شهر {report.month} {report.year}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
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
                          <span className="font-bold text-xs text-gray-800">{report.studentsCount}</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-500 block">التسليمات</span>
                          <span className="font-bold text-xs text-indigo-700">{report.submissionsCount}</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-gray-500 block">متوسط الأداء</span>
                          <span className="font-bold text-xs text-emerald-700">{report.avgScore}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-200">
                      {/* Download PDF A4 */}
                      <button
                        onClick={() => {
                          onOpenPdfModal({
                            reportTitle: `كشف تقويم وإنجاز الطلاب الشهري (شهر ${report.month})`,
                            periodLabel: `شهر ${report.month} ${report.year}`,
                            isAnnual: false,
                            gradeLabel,
                            students,
                          });
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer border border-[#194B91]"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل PDF A4</span>
                      </button>

                      {/* Quick Details View */}
                      <button
                        onClick={() => {
                          const matchedSaved = savedMonthlyReports.find(
                            (sr) => sr.monthName === report.month && sr.year === report.year
                          );
                          const savedActs = (matchedSaved?.teacherActivities || []).filter(
                            (act) => report.grade === 'all' || !act.grade || matchesGrade(act.grade, '', report.grade)
                          );
                          setSelectedReportDetail({ ...report, students, teacherActivities: savedActs });
                        }}
                        className="p-2 rounded-xl bg-[#EEF5FC] hover:bg-[#E0ECF9] text-[#1F5AAA] border border-[#C6DCF2] transition cursor-pointer"
                        title="معاينة الطلاب"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW 1B: THURSDAY TEACHER ACTIVITIES ARCHIVE */}
      {view === 'archive_teacher_activities' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-black text-sm text-[#1A3A5F]">
              سجل أنشطة المعلمين المؤرشفة أسبوعياً ({filteredTeacherActivityBatches.reduce((sum, b) => sum + b.activities.length, 0)} نشاط)
            </h3>
            <span className="text-xs text-[#1F5AAA] font-bold bg-[#EEF5FC] px-2.5 py-1 rounded-full border border-[#C6DCF2]">
              أرشفة تلقائية كل يوم خميس
            </span>
          </div>

          {filteredTeacherActivityBatches.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-slate-600 font-bold text-sm">
              تُؤرشف أنشطة المعلمين تلقائياً كل يوم خميس في هذا الأرشيف
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTeacherActivityBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[#1F5AAA] shrink-0" />
                      <h4 className="font-black text-sm text-[#1A3A5F]">
                        {batch.weekLabel}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        أرشفة تلقائية (الخميس)
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] tabular-nums">
                        {batch.activities.length} نشاط
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200">
                    {batch.activities.map((act) => (
                      <div
                        key={act.id}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="font-bold text-[#1A3A5F] leading-relaxed">
                          {act.text}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap shrink-0 tabular-nums">
                          {act.timeLabel || act.dateLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: CUMULATIVE ANNUAL REPORT ARCHIVE */}
      {view === 'archive_cumulative' && (
        <div className="space-y-6">
          {/* Cumulative KPI Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">الطلاب المسجلون</span>
              <span className="text-xl font-black text-[#1A3A5F]">{cumulativeStudents.length} طالب</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">إجمالي التسليمات</span>
              <span className="text-xl font-black text-[#1F5AAA]">{cumulativeTotalSubs} تسليم</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">متوسط الأداء التراكمي</span>
              <span className="text-xl font-black text-emerald-700">{cumulativeAvg}%</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#DCE7F3] shadow-sm">
              <span className="text-xs text-slate-600 font-bold block mb-1">نسبة النجاح العامة</span>
              <span className="text-xl font-black text-amber-700">{cumulativePassRate}%</span>
            </div>
          </div>

          {/* Action Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#DCE7F3] flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="font-black text-base text-[#1A3A5F] mb-1">
                التقرير التراكمي العام للعام الدراسي {selectedYear} - {selectedYear + 1}م
              </h3>
              <p className="text-xs text-slate-600 font-semibold">
                معايير عزل الصفوف معتمدة: الصف السابع والثامن والتاسع لا تختلط بياناتهم.
              </p>
            </div>

            <button
              onClick={() => {
                const gradeLabel = selectedGrade === 'all' ? 'جميع الصفوف (سابع - ثامن - تاسع)' : `الصف ال${selectedGrade === '7' ? 'سابع' : selectedGrade === '8' ? 'ثامن' : 'تاسع'} الأساسي`;
                onOpenPdfModal({
                  reportTitle: 'التقرير التراكمي العام للعام الدراسي',
                  periodLabel: 'التقرير التراكمي السنوي',
                  isAnnual: true,
                  gradeLabel,
                  students: cumulativeStudents,
                });
              }}
              className="w-full sm:w-auto justify-center text-center py-2.5 px-5 sm:px-6 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm transition flex items-center gap-2 cursor-pointer border border-[#194B91]"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>تحميل التقرير التراكمي السنوي PDF A4 ملون</span>
            </button>
          </div>

          {/* Students Table */}
          <div className="bg-white rounded-2xl border border-[#DCE7F3] shadow-sm overflow-hidden">
            <div className="p-4 bg-[#F4F8FC] border-b border-[#DCE7F3] flex items-center justify-between">
              <h4 className="font-black text-xs sm:text-sm text-[#1A3A5F]">
                كشف إنجاز وتقييم الطلاب في الأرشيف التراكمي ({cumulativeStudents.length} طالب)
              </h4>
              <span className="text-xs text-slate-600 font-bold">بدون أكواد الطلاب (أسماء فقط)</span>
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
                        <td className="py-2 px-3 text-center font-bold text-slate-600">{idx + 1}</td>
                        <td className="py-2 px-4 font-bold text-[#1A3A5F]">{st.studentName}</td>
                        <td className="py-2 px-3 text-center font-bold text-[#1F5AAA]">الصف {st.grade || '7'}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-[#1A3A5F]">{st.submissionsCount}</td>
                        <td className="py-2 px-3 text-center font-black text-emerald-700">{st.gpa}%</td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] whitespace-nowrap">
                            {st.gpa >= 90 ? 'متميز (أ)' : st.gpa >= 80 ? 'جيد جداً (ب)' : st.gpa >= 65 ? 'جيد (ج)' : st.gpa >= 50 ? 'مقبول (د)' : 'يحتاج متابعة'}
                          </span>
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

      {/* VIEW 3: CIRCULARS AND NOTES ARCHIVE */}
      {view === 'archive_circulars' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-sm text-[#1A3A5F]">
              سجل التعاميم والملاحظات الإدارية الصادرة ({filteredCirculars.length})
            </h3>
            <span className="text-xs text-slate-600 font-semibold">مرتبة من الأحدث إلى الأقدم</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCirculars.length === 0 ? (
              <div className="col-span-full bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-slate-600 font-bold text-sm">
                لا توجد تعاميم أو ملاحظات في الأرشيف مطابقة للبحث
              </div>
            ) : (
              filteredCirculars.map((anc) => (
                <div
                  key={anc.id}
                  className="bg-white rounded-2xl p-5 border border-[#DCE7F3] shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between flex-wrap gap-1.5 mb-2">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                        {anc.target === 'all'
                          ? '📢 موجه للجميع'
                          : anc.target === 'teachers'
                          ? '👨‍🏫 للمعلمين فقط'
                          : '🎓 للطلاب فقط'}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          anc.priority === 'عاجل'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : anc.priority === 'هام'
                            ? 'bg-amber-50 text-amber-900 border border-amber-200'
                            : 'bg-slate-50 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {anc.priority}
                      </span>
                    </div>

                    <h4 className="font-black text-[#1A3A5F] text-sm mb-1">{anc.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed mb-4 font-medium">{anc.content}</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-[11px] text-slate-600 font-semibold">
                    <span>
                      المرسل:{' '}
                      {anc.senderName && !isGenericPrincipalSender(anc.senderName)
                        ? anc.senderName
                        : getSchoolPrincipalName(anc.schoolId || schoolId, schoolName)}{' '}
                      ({anc.createdAt})
                    </span>
                    <span className="flex items-center gap-1 text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>معتمد في السجل</span>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
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
                  {selectedReportDetail.grade === 'all' ? 'جميع الصفوف' : `الصف ال${selectedReportDetail.grade}`} • {selectedReportDetail.studentsCount} طالب مسجل
                </p>
              </div>
              <button
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
                      <td className="py-1.5 px-2 text-center font-bold text-slate-700">{idx + 1}</td>
                      <td className="py-1.5 px-3 font-bold text-[#1A3A5F]">{s.studentName}</td>
                      <td className="py-1.5 px-2 text-center font-black text-[#1F5AAA]">الصف {s.grade}</td>
                      <td className="py-1.5 px-2 text-center font-mono font-black text-[#1A3A5F]">{s.submissionsCount}</td>
                      <td className="py-1.5 px-2 text-center font-black text-emerald-700">{s.gpa}%</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedReportDetail.teacherActivities && selectedReportDetail.teacherActivities.length > 0 && (
              <div className="mb-4 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] p-3 space-y-2">
                <h4 className="font-black text-xs text-[#1A3A5F]">
                  أرشيف أنشطة المعلمين الأسبوعية ({selectedReportDetail.teacherActivities.length})
                </h4>
                <div className="divide-y divide-slate-200 bg-white rounded-lg border border-[#DCE7F3] px-3">
                  {selectedReportDetail.teacherActivities.map((act: any) => (
                    <div key={act.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#1A3A5F] min-w-0 flex-1">{act.text}</span>
                      <span className="text-[11px] text-slate-600 font-semibold whitespace-nowrap shrink-0">{act.dateLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectedReportDetail(null)}
                className="py-2 px-4 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
