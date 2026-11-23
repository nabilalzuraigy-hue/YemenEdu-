import React from 'react';
import { Award, BookOpen, CheckCircle2 } from 'lucide-react';
import {
  GradeRecord,
  HomeworkSubmission,
  MonthlyGradebookRecord,
  getQuestionTimestamp,
} from '../services/appData';
import { resolveSubjectItem } from '../services/authService';

export function canonicalSubjectName(raw?: string): string {
  const clean = (raw || '').trim();
  if (!clean) return '';
  return resolveSubjectItem(clean)?.nameAr || clean;
}

export function getAcademicMonthFromTimestamp(ts: number): string {
  if (!ts) return 'نوفمبر';
  const m = new Date(ts).getMonth();
  const map: Record<number, string> = {
    8: 'سبتمبر',
    9: 'أكتوبر',
    10: 'نوفمبر',
    11: 'ديسمبر',
    0: 'يناير',
    1: 'فبراير',
    2: 'مارس',
    3: 'أبريل',
    4: 'مايو',
    5: 'يونيو',
    6: 'يونيو',
    7: 'سبتمبر',
  };
  return map[m] || 'نوفمبر';
}

export function resolveRecordTimestamp(item: {
  timestamp?: number;
  createdAt?: any;
  date?: string;
}): number {
  const ts = getQuestionTimestamp(item);
  if (ts > 0) return ts;
  if (item?.date) {
    const parsed = Date.parse(item.date);
    if (!isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function getLocalDayKey(ts: number): string {
  const d = new Date(ts || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateSlash(dayKey: string): string {
  return dayKey.replace(/-/g, '/');
}

function formatArabicWeekday(dayKey: string): string {
  const parts = dayKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '—';
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  try {
    return new Intl.DateTimeFormat('ar-YE', { weekday: 'long' }).format(d);
  } catch {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return days[d.getDay()] || '—';
  }
}

interface DayGradeRow {
  dayKey: string;
  dateLabel: string;
  dayName: string;
  submissionsCount: number;
  earnedScore: number;
  maxScore: number;
}

interface StudentSubjectGradeTablesProps {
  grades: GradeRecord[];
  submissions: HomeworkSubmission[];
  subjectOptions: string[];
  selectedSubject: string;
  monthLabel: string;
  showAllSubjects?: boolean;
  archivedGradebooks?: MonthlyGradebookRecord[];
  studentCode?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export const StudentSubjectGradeTables: React.FC<StudentSubjectGradeTablesProps> = ({
  grades,
  submissions,
  subjectOptions,
  selectedSubject,
  monthLabel,
  showAllSubjects = false,
  archivedGradebooks = [],
  studentCode,
  emptyTitle,
  emptySubtitle,
}) => {
  const normalizedSubjectMap = new Map<string, { grades: GradeRecord[]; submissions: HomeworkSubmission[] }>();

  const ensureSubject = (name: string) => {
    const clean = canonicalSubjectName(name) || 'المادة الدراسية';
    if (!normalizedSubjectMap.has(clean)) {
      normalizedSubjectMap.set(clean, { grades: [], submissions: [] });
    }
    return normalizedSubjectMap.get(clean)!;
  };

  grades.forEach((g) => {
    const subj = canonicalSubjectName(g.subjectName || g.subject);
    if (!subj) return;
    ensureSubject(subj).grades.push(g);
  });

  submissions.forEach((s) => {
    const subj = canonicalSubjectName(s.subject);
    if (!subj) return;
    ensureSubject(subj).submissions.push(s);
  });

  const archivedSummaryBySubject = new Map<
    string,
    {
      teacherName?: string;
      archivedAt?: string;
      totalEarned: number;
      totalPossible: number;
      percentage: number;
      submissionsCount: number;
      rating: string;
    }
  >();

  archivedGradebooks.forEach((arc) => {
    const subj = canonicalSubjectName(arc.subject);
    if (!subj) return;
    const studentEntry = studentCode
      ? arc.roster?.find((st) => (st.code || '').trim().toLowerCase() === studentCode.trim().toLowerCase())
      : undefined;
    if (studentEntry && !archivedSummaryBySubject.has(subj)) {
      archivedSummaryBySubject.set(subj, {
        teacherName: arc.teacherName,
        archivedAt: arc.archivedAt,
        totalEarned: Number(studentEntry.totalEarned || 0),
        totalPossible: Number(studentEntry.totalPossible || 0),
        percentage: Number(studentEntry.percentage || 0),
        submissionsCount: Number(studentEntry.submissionsCount || 0),
        rating: studentEntry.rating || 'معتمد',
      });
    }
  });

  const canonicalOptions = Array.from(
    new Set<string>(subjectOptions.map((s) => canonicalSubjectName(s)).filter(Boolean))
  );
  const canonicalSelected =
    selectedSubject === 'الكل' ? 'الكل' : canonicalSubjectName(selectedSubject) || selectedSubject;

  const subjectsToRender: string[] =
    canonicalSelected !== 'الكل'
      ? [canonicalSelected]
      : showAllSubjects
      ? Array.from(
          new Set<string>([
            ...canonicalOptions,
            ...Array.from(normalizedSubjectMap.keys()),
            ...Array.from(archivedSummaryBySubject.keys()),
          ])
        )
      : Array.from(
          new Set<string>([
            ...canonicalOptions.filter((s) => normalizedSubjectMap.has(s)),
            ...Array.from(normalizedSubjectMap.keys()),
          ])
        );

  const subjectTables = subjectsToRender
    .map((subjName) => {
      const bucket = normalizedSubjectMap.get(subjName) || { grades: [], submissions: [] };
      const archivedSummary = archivedSummaryBySubject.get(subjName);
      const byDay = new Map<
        string,
        {
          uniqueSubmissionKeys: Set<string>;
          gradesByKey: Map<string, { earned: number; max: number }>;
        }
      >();

      bucket.grades.forEach((g, idx) => {
        const ts = resolveRecordTimestamp(g);
        const dayKey = getLocalDayKey(ts);
        if (!byDay.has(dayKey)) {
          byDay.set(dayKey, { uniqueSubmissionKeys: new Set(), gradesByKey: new Map() });
        }
        const entry = byDay.get(dayKey)!;
        const itemKey = g.questionId ? `q_${g.questionId}` : `g_${g.id || idx}`;
        entry.uniqueSubmissionKeys.add(itemKey);
        const earned = Number(g.obtained !== undefined ? g.obtained : (g.score ?? 0));
        const max = Number(g.total !== undefined ? g.total : (g.maxScore ?? 5));
        entry.gradesByKey.set(itemKey, {
          earned: isNaN(earned) ? 0 : earned,
          max: isNaN(max) || max <= 0 ? 5 : max,
        });
      });

      bucket.submissions.forEach((sub, idx) => {
        const ts = resolveRecordTimestamp(sub);
        const dayKey = getLocalDayKey(ts);
        if (!byDay.has(dayKey)) {
          byDay.set(dayKey, { uniqueSubmissionKeys: new Set(), gradesByKey: new Map() });
        }
        const entry = byDay.get(dayKey)!;
        const itemKey = sub.questionId ? `q_${sub.questionId}` : `s_${sub.id || idx}`;
        entry.uniqueSubmissionKeys.add(itemKey);
        if (
          !entry.gradesByKey.has(itemKey) &&
          (sub.status === 'تم التصحيح' || sub.status === 'graded' || typeof sub.score === 'number')
        ) {
          const earned = Number(sub.score ?? 0);
          const max = Number(sub.maxScore ?? 5);
          entry.gradesByKey.set(itemKey, {
            earned: isNaN(earned) ? 0 : earned,
            max: isNaN(max) || max <= 0 ? 5 : max,
          });
        }
      });

      const rows: DayGradeRow[] = Array.from(byDay.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([dayKey, data]) => {
          let earnedScore = 0;
          let maxScore = 0;
          data.gradesByKey.forEach((v) => {
            earnedScore += v.earned;
            maxScore += v.max;
          });
          return {
            dayKey,
            dateLabel: formatDateSlash(dayKey),
            dayName: formatArabicWeekday(dayKey),
            submissionsCount: data.uniqueSubmissionKeys.size,
            earnedScore,
            maxScore,
          };
        });

      const totalSubs =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.submissionsCount, 0)
          : archivedSummary?.submissionsCount || 0;
      const totalEarned =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.earnedScore, 0)
          : archivedSummary?.totalEarned || 0;
      const totalMax =
        rows.length > 0
          ? rows.reduce((s, r) => s + r.maxScore, 0)
          : archivedSummary?.totalPossible || 0;

      return {
        subjectName: subjName,
        rows,
        archivedSummary,
        totalSubs,
        totalEarned,
        totalMax,
      };
    })
    .filter((tbl) => showAllSubjects || canonicalSelected !== 'الكل' || tbl.rows.length > 0 || Boolean(tbl.archivedSummary));

  if (subjectTables.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center shadow-xs space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-[#EEF5FC] border border-[#C6DCF2] text-[#1F5AAA] flex items-center justify-center mx-auto mb-2">
          <Award className="w-6 h-6 text-[#1F5AAA]" />
        </div>
        <h4 className="font-black text-base text-[#1A3A5F]">
          {emptyTitle ||
            (canonicalSelected === 'الكل'
              ? `كشف درجات شهر (${monthLabel}) نظيف ونشط`
              : `لا توجد درجات مرصودة لمادة (${canonicalSelected}) في شهر (${monthLabel})`)}
        </h4>
        <p className="text-xs text-[#5C7085] font-medium max-w-md mx-auto leading-relaxed">
          {emptySubtitle ||
            (canonicalSelected === 'الكل'
              ? `سيتم رصد جدول درجات كل مادة هنا فور حل وتصحيح واجبات شهر (${monthLabel}).`
              : 'ستظهر درجات هذه المادة داخل جدولها فور حل واجباتها أو اعتماد تقييماتها من المعلم.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {subjectTables.map((tbl, tIdx) => (
        <section
          key={`subj-table-${tbl.subjectName}-${tIdx}`}
          className="bg-white rounded-2xl border border-[#DCE7F3] shadow-[0_4px_14px_rgba(26,58,95,0.04)] overflow-hidden"
        >
          {/* Subject Table Header */}
          <div className="px-4 py-3 bg-[#EEF5FC] border-b border-[#C6DCF2] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-[#1F5AAA] text-white flex items-center justify-center shrink-0 shadow-2xs">
                <BookOpen className="w-4 h-4" />
              </span>
              <h4 className="font-black text-xs sm:text-sm text-[#1A3A5F] truncate">
                كشف درجات مادة: {tbl.subjectName}
              </h4>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-white text-[#1A3A5F] border border-[#C6DCF2]">
                {tbl.totalSubs} تسليم
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-2xs">
                الدرجة: {tbl.totalEarned} / {tbl.totalMax > 0 ? tbl.totalMax : 0}
              </span>
            </div>
          </div>

          {tbl.rows.length === 0 ? (
            tbl.archivedSummary ? (
              <div className="p-4 bg-emerald-50/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-black text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>كشف معتمد من المعلم: {tbl.archivedSummary.teacherName || 'معلم المادة'}</span>
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200 font-black">
                    {tbl.archivedSummary.rating} ({tbl.archivedSummary.percentage}%)
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-5 text-center text-xs font-semibold text-[#5C7085]">
                لا توجد درجات أو تسليمات مسجلة لمادة ({tbl.subjectName}) في شهر ({monthLabel}) بعد.
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table dir="rtl" className="w-full text-right text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-[#1F5AAA] text-white font-black border-b border-[#194B91]">
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">التاريخ</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">اليوم</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">عدد التسليم</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">الدرجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[#1A3A5F]">
                  {tbl.rows.map((row) => (
                    <tr key={`${tbl.subjectName}-${row.dayKey}`} className="hover:bg-[#F8FAFD] transition">
                      <td dir="ltr" className="px-3.5 py-3 text-center font-mono font-bold text-xs sm:text-sm text-[#1A3A5F] whitespace-nowrap">
                        {row.dateLabel}
                      </td>
                      <td className="px-3.5 py-3 text-center font-bold whitespace-nowrap">
                        {row.dayName}
                      </td>
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold bg-[#F4F8FC] text-[#1A3A5F] border border-[#DCE7F3]">
                          {row.submissionsCount} تسليم
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <span className="px-3 py-0.5 rounded-full text-xs sm:text-sm font-black bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                          {row.earnedScore} / {row.maxScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F4F8FC] border-t-2 border-[#C6DCF2] font-black text-[#1A3A5F]">
                    <td colSpan={2} className="px-3.5 py-2.5 text-center text-xs sm:text-sm">
                      الإجمالي لشهر ({monthLabel})
                    </td>
                    <td className="px-3.5 py-2.5 text-center text-xs sm:text-sm">
                      {tbl.totalSubs} تسليم
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-mono text-xs sm:text-sm text-[#1F5AAA]">
                      {tbl.totalEarned} / {tbl.totalMax}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
};
