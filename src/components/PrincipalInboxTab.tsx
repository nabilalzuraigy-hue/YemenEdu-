import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileText,
  Flag,
  GraduationCap,
  Image as ImageIcon,
  Inbox,
  Trophy,
  UserCheck,
  X,
  XCircle,
  Clock,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  appDataService,
  AttendanceRecord,
  AttendanceStatus,
  getGradeLabelAr,
  SupervisorActivity,
  SupervisorActivityCategory,
  SupervisorApprovalStatus,
} from '../services/appData';

interface PrincipalInboxTabProps {
  schoolId: string;
  schoolName: string;
  principalName: string;
}

const normalizeCategoryBucket = (cat: SupervisorActivityCategory): 'تقرير' | 'نشاط' | 'فعالية' => {
  if (cat === 'تقرير') return 'تقرير';
  if (cat === 'فعالية') return 'فعالية';
  return 'نشاط';
};

export const getApprovalBadgeAndFrame = (status?: SupervisorApprovalStatus) => {
  switch (status) {
    case 'approved':
      return {
        frame: 'bg-emerald-50/75 border-2 border-emerald-400',
        badge: 'bg-emerald-600 text-white border border-emerald-700',
        label: 'معتمد ✓',
      };
    case 'revision_requested':
      return {
        frame: 'bg-orange-50/85 border-2 border-orange-400',
        badge: 'bg-orange-500 text-white border border-orange-600',
        label: 'طلب تعديل ✏️',
      };
    case 'rejected':
      return {
        frame: 'bg-rose-50/85 border-2 border-rose-400',
        badge: 'bg-rose-600 text-white border border-rose-700',
        label: 'مرفوض ✕',
      };
    case 'pending':
    default:
      return {
        frame: 'bg-amber-50/80 border-2 border-amber-400',
        badge: 'bg-amber-500 text-white border border-amber-600',
        label: 'بانتظار الاعتماد ⏳',
      };
  }
};

const getStudentCardStyle = (status: AttendanceStatus) => {
  switch (status) {
    case 'حاضر':
      return {
        card: 'bg-emerald-50 border-emerald-300',
        badge: 'bg-emerald-600 text-white',
        label: 'حاضر',
      };
    case 'غائب بعذر':
      return {
        card: 'bg-sky-50 border-sky-300',
        badge: 'bg-[#1F5AAA] text-white',
        label: 'غائب بعذر',
      };
    case 'متأخر':
      return {
        card: 'bg-amber-50 border-amber-300',
        badge: 'bg-amber-500 text-white',
        label: 'متأخر',
      };
    case 'غائب بدون عذر':
    case 'غائب':
    default:
      return {
        card: 'bg-rose-50 border-rose-300',
        badge: 'bg-rose-600 text-white',
        label: 'غائب بدون عذر',
      };
  }
};

export const PrincipalInboxTab: React.FC<PrincipalInboxTabProps> = ({
  schoolId,
  schoolName,
  principalName,
}) => {
  const [activities, setActivities] = useState<SupervisorActivity[]>(() =>
    appDataService.getSupervisorActivities(schoolId)
  );
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    appDataService.getAttendanceRecords(schoolId)
  );

  const [statusFilter, setStatusFilter] = useState<'all' | SupervisorApprovalStatus>('pending');
  const [kindFilter, setKindFilter] = useState<'all' | 'activities' | 'attendance'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteComposer, setNoteComposer] = useState<{
    id: string;
    kind: 'activity' | 'attendance';
    action: 'revision_requested' | 'rejected';
    note: string;
  } | null>(null);
  const [expandedAtt, setExpandedAtt] = useState<Record<string, boolean>>({});
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId) {
      setActivities([]);
      setAttendanceRecords([]);
      return;
    }

    const normalizedSchool = schoolId.trim().toLowerCase();

    const syncLocal = () => {
      setActivities(appDataService.getSupervisorActivities(schoolId));
      setAttendanceRecords(appDataService.getAttendanceRecords(schoolId));
    };
    syncLocal();
    const unsubApp = appDataService.subscribe(syncLocal);

    let unsubAct = () => {};
    let unsubAtt = () => {};

    try {
      const qAct = query(collection(db, 'supervisor_activities'), where('schoolId', '==', schoolId));
      unsubAct = onSnapshot(
        qAct,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as SupervisorActivity))
            .filter((a) => (a.schoolId || '').trim().toLowerCase() === normalizedSchool)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setActivities(list);
        },
        () => {}
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
        () => {}
      );
    } catch {}

    return () => {
      unsubApp();
      unsubAct();
      unsubAtt();
    };
  }, [schoolId]);

  const effectiveStatus = (s?: SupervisorApprovalStatus): SupervisorApprovalStatus =>
    s || 'pending';

  const pendingCount =
    activities.filter((a) => effectiveStatus(a.approvalStatus) === 'pending').length +
    attendanceRecords.filter((r) => effectiveStatus(r.approvalStatus) === 'pending').length;

  const filteredActivities = activities.filter((a) => {
    if (kindFilter === 'attendance') return false;
    if (statusFilter === 'all') return true;
    return effectiveStatus(a.approvalStatus) === statusFilter;
  });

  const filteredAttendance = attendanceRecords.filter((r) => {
    if (kindFilter === 'activities') return false;
    if (statusFilter === 'all') return true;
    return effectiveStatus(r.approvalStatus) === statusFilter;
  });

  const notifyAction = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => {
      setFeedbackBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleReviewActivity = async (
    id: string,
    status: 'approved' | 'revision_requested' | 'rejected',
    note?: string
  ) => {
    setBusyId(id);
    try {
      await appDataService.reviewSupervisorActivity(id, status, principalName, note);
      setNoteComposer(null);
      notifyAction(
        status === 'approved'
          ? '✅ تم اعتماد المنشور ونشره مباشرة في لوحة المدرسة.'
          : status === 'revision_requested'
          ? '✏️ تم إرجاع المنشور للمشرف مع طلب التعديل.'
          : 'تم رفض المنشور وإشعار المشرف.'
      );
    } catch (err: any) {
      notifyAction(err?.message || 'حدث خطأ أثناء معالجة الطلب.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewAttendance = async (
    id: string,
    status: 'approved' | 'revision_requested' | 'rejected',
    note?: string
  ) => {
    setBusyId(id);
    try {
      await appDataService.reviewAttendanceRecord(id, status, principalName, note);
      setNoteComposer(null);
      notifyAction(
        status === 'approved'
          ? '✅ تم اعتماد كشف الحضور والغياب ونشره مباشرة في لوحة المدرسة.'
          : status === 'revision_requested'
          ? '✏️ تم إرجاع كشف الحضور للمشرف للتعديل.'
          : 'تم رفض كشف الحضور وإشعار المشرف.'
      );
    } catch (err: any) {
      notifyAction(err?.message || 'حدث خطأ أثناء معالجة كشف الحضور.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div dir="rtl" className="space-y-5 text-right font-['Cairo','Tajawal']">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] shadow-[0_6px_20px_rgba(26,58,95,0.08)] p-5 sm:p-6 text-[#1A3A5F]">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white text-[#1F5AAA] border border-[#DCE7F3] flex items-center justify-center shadow-xs shrink-0">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[#1A3A5F] tracking-tight">
                البريد الوارد من المشرف
              </h2>
              <p className="text-xs sm:text-sm font-bold text-[#28486B] mt-0.5">
                {schoolName} • مراجعة واعتماد التقارير والأنشطة والفعاليات وكشوفات الحضور
              </p>
            </div>
          </div>

          <span className="px-3.5 py-2 rounded-2xl bg-white/95 border border-[#C6DCF2] text-xs font-black text-[#1F5AAA] flex items-center gap-1.5 shadow-2xs self-start sm:self-auto">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>{pendingCount} بانتظار المراجعة</span>
          </span>
        </div>
      </div>

      {feedbackBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs sm:text-sm font-bold flex items-center justify-between shadow-sm">
          <span>{feedbackBanner}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-emerald-800 font-black cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Controls */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#DCE7F3] shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'pending', label: `بانتظار الاعتماد (${pendingCount})` },
              { id: 'all', label: 'الكل' },
              { id: 'approved', label: 'المعتمد (أخضر)' },
              { id: 'revision_requested', label: 'طلب تعديل (برتقالي)' },
              { id: 'rejected', label: 'المرفوض (أحمر)' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                statusFilter === f.id
                  ? 'bg-[#1F5AAA] text-white border-[#194B91]'
                  : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          {(
            [
              { id: 'all', label: 'جميع الوارد' },
              { id: 'activities', label: 'التقارير والأنشطة والفعاليات' },
              { id: 'attendance', label: 'كشوفات الحضور والغياب' },
            ] as const
          ).map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKindFilter(k.id)}
              className={`px-3 py-1 rounded-xl text-[11px] font-black transition cursor-pointer border ${
                kindFilter === k.id
                  ? 'bg-[#1A3A5F] text-white border-[#1A3A5F]'
                  : 'bg-white text-[#5C7085] border-[#DCE7F3] hover:bg-[#F4F8FC]'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filteredActivities.length === 0 && filteredAttendance.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center space-y-2 shadow-sm">
          <Inbox className="w-10 h-10 text-[#9BBEDF] mx-auto" />
          <h3 className="font-black text-sm sm:text-base text-[#1A3A5F]">
            لا توجد عناصر مطابقة في البريد حالياً
          </h3>
          <p className="text-xs text-[#5C7085] font-semibold">
            عندما يرسل المشرف تقريراً أو نشاطاً أو فعالية أو كشف حضور وغياب سيظهر هنا للمراجعة والاعتماد.
          </p>
        </div>
      )}

      {/* Supervisor Attendance Sheets in Inbox */}
      {filteredAttendance.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#1F5AAA]" />
            <span>كشوفات الحضور والغياب المرفوعة من المشرف ({filteredAttendance.length})</span>
          </h3>

          <div className="space-y-3">
            {filteredAttendance.map((rec) => {
              const st = effectiveStatus(rec.approvalStatus);
              const badgeStyle = getApprovalBadgeAndFrame(st);
              const excusedCount =
                rec.absentExcusedCount ??
                rec.entries.filter((e) => e.status === 'غائب بعذر').length;
              const unexcusedCount =
                rec.absentUnexcusedCount ??
                rec.entries.filter((e) => e.status === 'غائب بدون عذر' || e.status === 'غائب').length;
              const isExpanded = expandedAtt[rec.id] ?? st === 'pending';
              const isBusy = busyId === rec.id;
              const isComposingNote =
                noteComposer?.id === rec.id && noteComposer?.kind === 'attendance';

              return (
                <div
                  key={rec.id}
                  className={`rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 ${badgeStyle.frame}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2.5">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${badgeStyle.badge}`}>
                          {badgeStyle.label}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-white text-[#1A3A5F] border border-[#DCE7F3] text-xs font-black">
                          {rec.gradeLabel} — فصل {rec.classNumber}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-white text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-mono font-bold">
                          {rec.date}
                        </span>
                      </div>
                      <p className="text-[11px] font-bold text-[#5C7085]">
                        رفعه المشرف: {rec.recordedBy} • {rec.createdAtFormatted}
                      </p>
                      {rec.principalNote && (
                        <p className="text-xs font-bold text-[#1A3A5F] bg-white/80 rounded-xl px-3 py-1.5 border border-slate-200">
                          ملاحظة الإدارة: {rec.principalNote}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAtt((prev) => ({ ...prev, [rec.id]: !isExpanded }))
                      }
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#DCE7F3] text-xs font-black flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isExpanded ? 'إخفاء الكروت' : `عرض الكروت (${rec.entries.length})`}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Counts */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                    <span className="px-2.5 py-1 rounded-full bg-white text-emerald-800 border border-emerald-300 tabular-nums">
                      حاضر: {rec.presentCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white text-[#1F5AAA] border border-[#9BBEDF] tabular-nums">
                      غائب بعذر: {excusedCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white text-rose-800 border border-rose-300 tabular-nums">
                      غائب بدون عذر: {unexcusedCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-white text-amber-900 border border-amber-300 tabular-nums">
                      متأخر: {rec.lateCount}
                    </span>
                  </div>

                  {/* Prominent Cards Preview */}
                  {isExpanded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-black/10">
                      {rec.entries.map((entry, idx) => {
                        const cStyle = getStudentCardStyle(entry.status);
                        return (
                          <div
                            key={`${rec.id}_${idx}`}
                            className={`rounded-xl p-2.5 border flex flex-col gap-1 ${cStyle.card}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-xs text-[#1A3A5F] truncate">
                                {idx + 1}. {entry.studentName}
                              </span>
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${cStyle.badge}`}>
                                {cStyle.label}
                              </span>
                            </div>
                            {entry.note && (
                              <span className="text-[11px] font-semibold text-[#1A3A5F]/80">
                                ملاحظة: {entry.note}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/10">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleReviewAttendance(rec.id, 'approved')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد ونشر بلوحة المدرسة</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setNoteComposer({
                          id: rec.id,
                          kind: 'attendance',
                          action: 'revision_requested',
                          note: rec.principalNote || '',
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>طلب تعديل</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setNoteComposer({
                          id: rec.id,
                          kind: 'attendance',
                          action: 'rejected',
                          note: '',
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>رفض</span>
                    </button>
                  </div>

                  {isComposingNote && noteComposer && (
                    <div className="rounded-xl bg-white p-3 border border-slate-300 space-y-2">
                      <label className="block text-xs font-black text-[#1A3A5F]">
                        {noteComposer.action === 'revision_requested'
                          ? 'ملاحظة التعديل المطلوبة من المشرف:'
                          : 'سبب الرفض (اختياري):'}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={noteComposer.note}
                          onChange={(e) =>
                            setNoteComposer((prev) => (prev ? { ...prev, note: e.target.value } : null))
                          }
                          placeholder="اكتب الملاحظة للمشرف هنا..."
                          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[#DCE7F3] text-xs font-semibold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleReviewAttendance(rec.id, noteComposer.action, noteComposer.note)
                          }
                          className={`px-4 py-2 rounded-xl text-white text-xs font-black cursor-pointer ${
                            noteComposer.action === 'revision_requested'
                              ? 'bg-orange-500 hover:bg-orange-600'
                              : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                        >
                          تأكيد الإرسال
                        </button>
                        <button
                          type="button"
                          onClick={() => setNoteComposer(null)}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Supervisor Reports, Activities, and Events in Inbox */}
      {filteredActivities.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#1F5AAA]" />
            <span>التقارير والأنشطة والفعاليات المرفوعة ({filteredActivities.length})</span>
          </h3>

          <div className="space-y-3">
            {filteredActivities.map((act) => {
              const st = effectiveStatus(act.approvalStatus);
              const badgeStyle = getApprovalBadgeAndFrame(st);
              const bucket = normalizeCategoryBucket(act.category);
              const Icon = bucket === 'تقرير' ? FileText : bucket === 'فعالية' ? Flag : Trophy;
              const images = Array.isArray(act.images) ? act.images : [];
              const isBusy = busyId === act.id;
              const isComposingNote =
                noteComposer?.id === act.id && noteComposer?.kind === 'activity';

              return (
                <div
                  key={act.id}
                  className={`rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 ${badgeStyle.frame}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${badgeStyle.badge}`}>
                        {badgeStyle.label}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{bucket}</span>
                      </span>
                      {(act.subType || (act.category !== bucket && act.category)) && (
                        <span className="px-2.5 py-0.5 rounded-full bg-white text-[#1A3A5F] border border-[#DCE7F3] text-[11px] font-bold">
                          {act.subType || act.category}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-bold text-[#5C7085] tabular-nums">
                      {act.activityDate}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="font-black text-sm sm:text-base text-[#1A3A5F]">{act.title}</h4>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                      {act.details}
                    </p>
                  </div>

                  {images.length > 0 && (
                    <div
                      className={`grid gap-2 ${
                        images.length === 1
                          ? 'grid-cols-1 max-w-sm'
                          : images.length === 2
                          ? 'grid-cols-2 max-w-lg'
                          : 'grid-cols-3'
                      }`}
                    >
                      {images.map((imgUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setLightboxImage(imgUrl)}
                          className="relative rounded-xl overflow-hidden border border-white shadow-xs bg-white aspect-video cursor-pointer"
                          title="معاينة الصورة"
                        >
                          <img
                            src={imgUrl}
                            alt={`${act.title} - صورة ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/55 text-white text-[10px] font-bold flex items-center gap-0.5">
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>{idx + 1}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#5C7085]">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="w-3.5 h-3.5 text-[#1F5AAA]" />
                      <span>
                        {act.targetGrade === 'الكل' || !act.targetGrade
                          ? 'جميع الصفوف'
                          : getGradeLabelAr(act.targetGrade)}
                      </span>
                    </span>
                    <span>
                      رفعه المشرف: {act.createdBy} ({act.createdAtFormatted})
                    </span>
                  </div>

                  {act.principalNote && (
                    <div className="text-xs font-bold text-[#1A3A5F] bg-white/85 rounded-xl px-3 py-2 border border-slate-200">
                      ملاحظة المدير: {act.principalNote}
                    </div>
                  )}

                  {/* Review Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-black/10">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleReviewActivity(act.id, 'approved')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد ونشر بلوحة المدرسة</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setNoteComposer({
                          id: act.id,
                          kind: 'activity',
                          action: 'revision_requested',
                          note: act.principalNote || '',
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>طلب تعديل</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setNoteComposer({
                          id: act.id,
                          kind: 'activity',
                          action: 'rejected',
                          note: '',
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>رفض</span>
                    </button>
                  </div>

                  {isComposingNote && noteComposer && (
                    <div className="rounded-xl bg-white p-3 border border-slate-300 space-y-2">
                      <label className="block text-xs font-black text-[#1A3A5F]">
                        {noteComposer.action === 'revision_requested'
                          ? 'ملاحظة التعديل المطلوبة من المشرف:'
                          : 'سبب الرفض (اختياري):'}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={noteComposer.note}
                          onChange={(e) =>
                            setNoteComposer((prev) => (prev ? { ...prev, note: e.target.value } : null))
                          }
                          placeholder="اكتب ملاحظتك للمشرف هنا..."
                          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[#DCE7F3] text-xs font-semibold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                        />
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleReviewActivity(act.id, noteComposer.action, noteComposer.note)
                          }
                          className={`px-4 py-2 rounded-xl text-white text-xs font-black cursor-pointer ${
                            noteComposer.action === 'revision_requested'
                              ? 'bg-orange-500 hover:bg-orange-600'
                              : 'bg-rose-600 hover:bg-rose-700'
                          }`}
                        >
                          تأكيد الإرسال
                        </button>
                        <button
                          type="button"
                          onClick={() => setNoteComposer(null)}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-white rounded-2xl p-2 shadow-2xl border border-[#DCE7F3]"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center cursor-pointer"
              aria-label="إغلاق الصورة"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="معاينة الصورة"
              className="w-full max-h-[82dvh] object-contain rounded-xl bg-slate-900"
            />
          </div>
        </div>
      )}
    </div>
  );
};
