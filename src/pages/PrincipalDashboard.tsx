import React, { useState, useEffect, useRef } from 'react';
import {
  Megaphone,
  BarChart3,
  Send,
  Trash2,
  GraduationCap,
  Inbox,
  School,
  Bell,
  CheckCheck,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserSession } from '../services/authService';
import {
  appDataService,
  Announcement,
  AppNotification,
  AttendanceRecord,
  ClassSchedule,
  HomeworkSubmission,
  Question,
  SupervisorActivity,
} from '../services/appData';
import { PrincipalStatsTab } from '../components/PrincipalStatsTab';
import { UnifiedSidebar } from '../components/UnifiedSidebar';
import { PrincipalArchiveView } from '../components/PrincipalArchiveView';
import { PrincipalReportPdfModal, PrincipalStudentReportItem } from '../components/PrincipalReportPdfModal';
import { PrincipalInboxTab } from '../components/PrincipalInboxTab';
import { SchoolBoardView } from '../components/SchoolBoardView';
import { playGentleNotificationSound } from '../services/soundUtils';
import {
  formatArabicSchoolName,
  getSchoolPrincipalName,
  isGenericPrincipalSender,
  isSimulationAnnouncement,
  cleanPersonName,
} from '../utils/schoolDisplay';
import {
  formatAnnouncementTargetGradesAr,
  normalizeGradeCode,
} from '../services/appData';
import { authService } from '../services/authService';

type PrincipalViewType =
  | 'dashboard'
  | 'archive_monthly'
  | 'archive_teacher_activities'
  | 'archive_school_activities'
  | 'archive_circulars';

interface PrincipalDashboardProps {
  session: UserSession;
}

export const PrincipalDashboard: React.FC<PrincipalDashboardProps> = ({ session }) => {
  const currentUser = session;
  const [activeTab, setActiveTab] = useState<'statistics' | 'announcements' | 'inbox' | 'school_board'>('statistics');
  const [sidebarView, setSidebarView] = useState<PrincipalViewType>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState<number>(0);
  const [pendingInboxCount, setPendingInboxCount] = useState<number>(0);
  const [principalNotifications, setPrincipalNotifications] = useState<AppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const playedCircularIdsRef = useRef<Set<string>>(new Set());
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifBootstrappedRef = useRef<boolean>(false);

  // PDF Modal for Archive
  const [pdfModalConfig, setPdfModalConfig] = useState<{
    isOpen: boolean;
    reportTitle: string;
    periodLabel: string;
    isAnnual: boolean;
    gradeLabel: string;
    students: PrincipalStudentReportItem[];
  }>({
    isOpen: false,
    reportTitle: '',
    periodLabel: '',
    isAnnual: false,
    gradeLabel: '',
    students: [],
  });

  // Form State for Announcement
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTarget, setNewTarget] = useState<'all' | 'teachers' | 'students'>('all');
  const [selectedTargetGrades, setSelectedTargetGrades] = useState<string[]>([]); // empty = جميع الصفوف
  const [showAll12Grades, setShowAll12Grades] = useState(false);
  const [newPriority, setNewPriority] = useState<'عاجل' | 'هام' | 'عادي'>('عادي');
  const [isPublishing, setIsPublishing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Listen to toggle-sidebar event from Header
  useEffect(() => {
    const handleToggle = () => setIsSidebarOpen((prev) => !prev);
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, []);

  useEffect(() => {
    if (!currentUser?.schoolId) return;

    // 1. Direct Firestore listener for circulars for this school
    let unsubCirc = () => {};
    try {
      const qCirc = query(
        collection(db, 'circulars'),
        where('schoolId', '==', currentUser.schoolId)
      );

      unsubCirc = onSnapshot(
        qCirc,
        (snap) => {
          if (snap.empty) {
            setAnnouncements([]);
            setUnreadAnnouncementsCount(0);
          } else {
            const resolvedDefaultPrincipal =
              session.name && !isGenericPrincipalSender(session.name)
                ? session.name
                : getSchoolPrincipalName(session.schoolId, session.schoolName);
            const list = snap.docs
              .map((d) => {
                const data = d.data();
                const senderName =
                  data.senderName && !isGenericPrincipalSender(data.senderName)
                    ? data.senderName
                    : resolvedDefaultPrincipal;
                return {
                  id: d.id,
                  title: data.title || '',
                  content: data.content || '',
                  target: data.target || 'all',
                  targetGrades: Array.isArray(data.targetGrades) ? data.targetGrades : undefined,
                  priority: data.priority || 'عادي',
                  senderName,
                  senderRoleAr: data.senderRoleAr || 'مدير المدرسة',
                  schoolId: data.schoolId || session.schoolId,
                  timestamp: typeof data.timestamp === 'number' ? data.timestamp : undefined,
                  createdAt: data.createdAtFormatted || 'الآن',
                  readCount: 1,
                } as Announcement;
              })
              .filter((a) => !isSimulationAnnouncement(a));

            // Deduplicate by ID and (title + content)
            const seenIds = new Set<string>();
            const seenContent = new Set<string>();
            const deduplicated: Announcement[] = [];

            for (const anc of list) {
              const contentKey = `${anc.title.trim()}_${anc.content.trim()}`;
              if (!seenIds.has(anc.id) && !seenContent.has(contentKey)) {
                seenIds.add(anc.id);
                seenContent.add(contentKey);
                deduplicated.push(anc);
              }
            }

            // Check for new announcements to trigger short gentle chime (no duplicates)
            let hasNewAnnouncement = false;
            deduplicated.forEach((a) => {
              if (!playedCircularIdsRef.current.has(a.id)) {
                playedCircularIdsRef.current.add(a.id);
                hasNewAnnouncement = true;
              }
            });

            if (hasNewAnnouncement && playedCircularIdsRef.current.size > deduplicated.length) {
              playGentleNotificationSound();
            }

            setAnnouncements(deduplicated);
            setUnreadAnnouncementsCount(deduplicated.length);
          }
        },
        (err) => {
          console.warn('Notice loading circulars:', err);
          setAnnouncements([]);
        }
      );
    } catch (_) {
      setAnnouncements([]);
    }

    // 2. Direct Firestore listener for submissions for this school (NO class filter)
    let unsubSubs = () => {};
    try {
      const qSubs = query(
        collection(db, 'submissions'),
        where('schoolId', '==', currentUser.schoolId)
      );
      unsubSubs = onSnapshot(
        qSubs,
        (snap) => {
          if (snap.empty) {
            setSubmissions([]);
          } else {
            const list = snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            } as HomeworkSubmission));
            setSubmissions(list);
          }
        },
        () => {
          setSubmissions(
            appDataService.getSubmissions(undefined, undefined, undefined, session.schoolId)
          );
        }
      );
    } catch (_) {
      setSubmissions([]);
    }

    // 3. Direct Firestore listener for teacher questions + automatic Thursday archiving
    let unsubQuestions = () => {};
    try {
      const qQuestions = query(
        collection(db, 'questions'),
        where('schoolId', '==', currentUser.schoolId)
      );
      unsubQuestions = onSnapshot(
        qQuestions,
        (snap) => {
          const list = snap.empty
            ? []
            : snap.docs.map((d) => ({ ...d.data(), id: d.id } as Question));
          appDataService
            .syncThursdayTeacherActivitiesArchive(currentUser.schoolId, list)
            .catch(() => {});
        },
        () => {}
      );
    } catch (_) {}

    // 4. Live pending count for البريد (supervisor_activities + attendance_records + class_schedules)
    const normalizedSchool = currentUser.schoolId.trim().toLowerCase();
    let actPending = 0;
    let attPending = 0;
    let schedPending = 0;
    const syncPendingCounts = () => {
      setPendingInboxCount(actPending + attPending + schedPending);
    };

    const computeLocalCounts = () => {
      const localActs = appDataService.getSupervisorActivities(currentUser.schoolId);
      const localAtts = appDataService.getAttendanceRecords(currentUser.schoolId);
      const localScheds = appDataService.getClassSchedules(currentUser.schoolId);
      actPending = localActs.filter((a) => !a.approvalStatus || a.approvalStatus === 'pending').length;
      attPending = localAtts.filter((r) => !r.approvalStatus || r.approvalStatus === 'pending').length;
      schedPending = localScheds.filter(
        (s) => s.hasPendingUpdate || (!s.isApproved && s.approvalStatus !== 'rejected')
      ).length;
      syncPendingCounts();
    };
    computeLocalCounts();
    const unsubLocalInbox = appDataService.subscribe(computeLocalCounts);

    let unsubInboxAct = () => {};
    let unsubInboxAtt = () => {};
    let unsubInboxSched = () => {};
    try {
      unsubInboxAct = onSnapshot(
        query(collection(db, 'supervisor_activities'), where('schoolId', '==', currentUser.schoolId)),
        (snap) => {
          const allActs = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as SupervisorActivity))
            .filter((a) => (a.schoolId || '').trim().toLowerCase() === normalizedSchool);
          actPending = allActs.filter(
            (a) => !a.approvalStatus || a.approvalStatus === 'pending'
          ).length;
          syncPendingCounts();
          const approvedActs = allActs.filter((a) => a.approvalStatus === 'approved');
          if (approvedActs.length > 0) {
            appDataService
              .syncDailySchoolActivitiesArchive(currentUser.schoolId, approvedActs, Date.now())
              .catch(() => {});
          }
        },
        () => {}
      );
    } catch {}

    try {
      unsubInboxAtt = onSnapshot(
        query(collection(db, 'attendance_records'), where('schoolId', '==', currentUser.schoolId)),
        (snap) => {
          attPending = snap.docs
            .map((d) => d.data() as AttendanceRecord)
            .filter(
              (r) =>
                (r.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                (!r.approvalStatus || r.approvalStatus === 'pending')
            ).length;
          syncPendingCounts();
        },
        () => {}
      );
    } catch {}

    try {
      unsubInboxSched = onSnapshot(
        query(collection(db, 'class_schedules'), where('schoolId', '==', currentUser.schoolId)),
        (snap) => {
          schedPending = snap.docs
            .map((d) => d.data() as ClassSchedule)
            .filter(
              (s) =>
                (s.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                (s.hasPendingUpdate || (!s.isApproved && s.approvalStatus !== 'rejected'))
            ).length;
          syncPendingCounts();
        },
        () => {}
      );
    } catch {}

    // 5. Live Principal Notifications ("تقرير جديد بانتظار اعتمادك")
    const syncLocalNotifs = () => {
      setPrincipalNotifications(appDataService.getNotifications(currentUser.schoolId, 'principal'));
    };
    syncLocalNotifs();
    const unsubLocalNotifs = appDataService.subscribe(syncLocalNotifs);

    let unsubNotifs = () => {};
    try {
      unsubNotifs = onSnapshot(
        query(collection(db, 'notifications'), where('schoolId', '==', currentUser.schoolId)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as AppNotification))
            .filter(
              (n) =>
                (n.schoolId || '').trim().toLowerCase() === normalizedSchool &&
                n.recipientRole === 'principal'
            )
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          if (notifBootstrappedRef.current) {
            const hasFreshUnread = list.some(
              (n) => !n.isRead && !seenNotifIdsRef.current.has(n.id)
            );
            if (hasFreshUnread) {
              playGentleNotificationSound();
            }
          } else {
            notifBootstrappedRef.current = true;
          }
          list.forEach((n) => seenNotifIdsRef.current.add(n.id));
          setPrincipalNotifications(list);
        },
        () => {}
      );
    } catch {}

    return () => {
      unsubCirc();
      unsubSubs();
      unsubQuestions();
      unsubLocalInbox();
      unsubInboxAct();
      unsubInboxAtt();
      unsubInboxSched();
      unsubLocalNotifs();
      unsubNotifs();
    };
  }, [session.schoolId, session.name]);

  // Handle Publish Announcement (Strict deduplication & immediate button disable)
  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPublishing) return;

    const trimmedTitle = newTitle.trim();
    const trimmedContent = newContent.trim();
    if (!trimmedTitle || !trimmedContent) return;

    const gradesToSave = selectedTargetGrades.length > 0 ? selectedTargetGrades : ['all'];
    const gradesKey = [...gradesToSave].map((g) => normalizeGradeCode(g)).sort().join(',');

    // Check if duplicate exists locally for the same target audience and same grades
    const duplicateExists = announcements.some((a) => {
      const aGrades =
        Array.isArray(a.targetGrades) && a.targetGrades.length > 0
          ? [...a.targetGrades].map((g) => normalizeGradeCode(g)).sort().join(',')
          : 'all';
      return (
        a.title.trim() === trimmedTitle &&
        a.content.trim() === trimmedContent &&
        a.target === newTarget &&
        aGrades === gradesKey
      );
    });
    if (duplicateExists) {
      setSuccessMsg('⚠️ هذا التعميم أو الملاحظة تم نشره مسبقاً بنفس العنوان والمحتوى والصفوف المحددة.');
      setTimeout(() => setSuccessMsg(null), 3000);
      return;
    }

    setIsPublishing(true);
    try {
      const publisherName =
        session.name && !isGenericPrincipalSender(session.name)
          ? session.name
          : getSchoolPrincipalName(session.schoolId, session.schoolName);
      await appDataService.addAnnouncement({
        title: trimmedTitle,
        content: trimmedContent,
        target: newTarget,
        targetGrades: gradesToSave,
        priority: newPriority,
        senderName: publisherName,
        senderRoleAr: 'مدير المدرسة',
        schoolId: session.schoolId,
      });

      setNewTitle('');
      setNewContent('');
      setSelectedTargetGrades([]);
      setSuccessMsg(
        `✅ تم نشر التعميم بنجاح وإرساله إلى (${formatAnnouncementTargetGradesAr(gradesToSave)}).`
      );
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: unknown) {
      console.warn('Publish error:', err);
      setSuccessMsg('حدث خطأ أثناء النشر، يرجى المحاولة مرة أخرى.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } finally {
      setIsPublishing(false);
    }
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

  return (
    <div dir="rtl" className="min-h-dvh bg-[#EDF0F5] text-right font-['Cairo','Tajawal']">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 pt-4 pb-[max(7.5rem,calc(6.5rem+env(safe-area-inset-bottom)))] space-y-5">
      
      {/* Render Archive View if one of the archive sub-sections is selected */}
      {sidebarView !== 'dashboard' ? (
        <PrincipalArchiveView
          view={sidebarView}
          schoolId={session.schoolId}
          schoolName={formatArabicSchoolName(session.schoolName, session.schoolId)}
          submissions={submissions}
          announcements={announcements}
          onBackToDashboard={() => setSidebarView('dashboard')}
          onOpenPdfModal={(cfg) => setPdfModalConfig({ ...cfg, isOpen: true })}
        />
      ) : (
        <>
          {/* Principal Notifications Bar ("تقرير جديد بانتظار اعتمادك") */}
          {(() => {
            const unreadNotifs = principalNotifications.filter((n) => !n.isRead);
            if (principalNotifications.length === 0) return null;
            return (
              <div className="bg-white rounded-2xl border border-[#C6DCF2] shadow-xs overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between gap-2 bg-[#F4F8FC]">
                  <button
                    type="button"
                    onClick={() => setShowNotifPanel((prev) => !prev)}
                    className="flex items-center gap-2 text-xs sm:text-sm font-black text-[#1A3A5F] cursor-pointer"
                  >
                    <div className="relative">
                      <Bell className="w-4 h-4 text-[#1F5AAA]" />
                      {unreadNotifs.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-rose-600 border border-white animate-pulse" />
                      )}
                    </div>
                    <span>
                      {unreadNotifs.length > 0
                        ? unreadNotifs[0].message
                        : `الإشعارات (${principalNotifications.length})`}
                    </span>
                    {unreadNotifs.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                        {unreadNotifs.length} جديد
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {unreadNotifs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          appDataService.markAllNotificationsRead(session.schoolId, 'principal');
                          setActiveTab('inbox');
                        }}
                        className="px-3 py-1 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-[11px] font-black cursor-pointer"
                      >
                        مراجعة في البريد
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowNotifPanel((prev) => !prev)}
                      className="text-[11px] font-bold text-[#1F5AAA] cursor-pointer"
                    >
                      {showNotifPanel ? 'إخفاء' : 'الكل'}
                    </button>
                  </div>
                </div>

                {showNotifPanel && (
                  <div className="p-3 space-y-2 max-h-60 overflow-y-auto border-t border-[#DCE7F3]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-[#5C7085]">سجل إشعارات المدير</span>
                      {unreadNotifs.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            appDataService.markAllNotificationsRead(session.schoolId, 'principal')
                          }
                          className="text-[11px] font-black text-[#1F5AAA] flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>تحديد الكل كمقروء</span>
                        </button>
                      )}
                    </div>
                    {principalNotifications.slice(0, 12).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          appDataService.markNotificationRead(n.id);
                          setActiveTab('inbox');
                          setShowNotifPanel(false);
                        }}
                        className={`w-full text-right p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition ${
                          n.isRead
                            ? 'bg-slate-50 border-slate-200 text-slate-600'
                            : 'bg-amber-50 border-amber-300 text-[#1A3A5F] font-bold'
                        }`}
                      >
                        <span>{n.message}</span>
                        <span className="text-[10px] text-[#5C7085] shrink-0">
                          {n.createdAtFormatted}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Success Notification */}
          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs sm:text-sm font-bold flex items-center justify-between shadow-sm animate-in fade-in">
              <span>{successMsg}</span>
              <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-800 font-black cursor-pointer">✕</button>
            </div>
          )}

          {/* TAB 1: REPORTS & STATISTICS (Full comprehensive reports) */}
          {activeTab === 'statistics' && (
            <PrincipalStatsTab
              submissions={submissions}
              schoolId={session.schoolId}
              schoolName={formatArabicSchoolName(session.schoolName, session.schoolId)}
              principalName={session.name}
              onOpenStatsArchive={() => setSidebarView('archive_monthly')}
            />
          )}

          {/* TAB 2: ANNOUNCEMENTS & NOTES */}
          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] shadow-[0_6px_20px_rgba(26,58,95,0.08)] px-4 py-5 sm:px-6 sm:py-6 text-center space-y-1.5 mb-2 text-[#1A3A5F]">
                <div className="relative z-10 space-y-1.5">
                  <div className="flex items-center justify-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-white border border-[#DCE7F3] flex items-center justify-center shadow-xs shrink-0">
                      <GraduationCap className="w-5 h-5 text-[#1F5AAA]" />
                    </div>
                    <h1 className="text-xl sm:text-3xl font-black text-[#1A3A5F]">
                      لوحة مدير المدرسة
                    </h1>
                  </div>
                  <p className="text-sm sm:text-base font-black text-[#1A3A5F]">
                    أهلاً بك أ. {cleanPersonName(session.name || 'مدير المدرسة')}
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-[#1F5AAA]">
                    {formatArabicSchoolName(session.schoolName, session.schoolId)} — التعاميم والملاحظات الإدارية
                  </p>
                </div>
              </div>
              {/* Create Announcement Form */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#DCE7F3]">
                <h3 className="font-black text-base text-[#1A3A5F] mb-1 flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-[#1F5AAA]" />
                  نشر تعميم أو ملاحظة إدارية جديدة
                </h3>
                <p className="text-xs text-slate-600 font-semibold mb-4">
                  يمكنك توجيه التعاميم والملاحظات المعتمدة إلى (الجميع / المعلمين فقط / الطلاب فقط)
                </p>

                <form onSubmit={handlePublish} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">عنوان التعميم أو الملاحظة:</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="مثال: موعد تسليم كشوفات الدرجات الشهرية"
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#DCE7F3] focus:outline-[#1F5AAA] bg-white font-semibold text-[#1A3A5F]"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[#1A3A5F] mb-1">الفئة المستهدفة:</label>
                      <select
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value as 'all' | 'teachers' | 'students')}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                      >
                        <option value="all">📢 الجميع (المعلمين والطلاب)</option>
                        <option value="teachers">👨‍🏫 المعلمون فقط</option>
                        <option value="students">🎓 الطلاب فقط</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1A3A5F] mb-1">درجة الأهمية:</label>
                      <select
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as 'عاجل' | 'هام' | 'عادي')}
                        className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                      >
                        <option value="عادي">عادي</option>
                        <option value="هام">هام</option>
                        <option value="عاجل">عاجل جداً</option>
                      </select>
                    </div>
                  </div>

                  {/* Multi-Grade Targeting Selector */}
                  {(() => {
                    const registeredGrades = Array.from(
                      new Set(
                        authService
                          .getRegisteredCodes()
                          .filter(
                            (c) =>
                              (c.schoolId || '').trim().toLowerCase() ===
                              (session.schoolId || '').trim().toLowerCase()
                          )
                          .map((c) => normalizeGradeCode(c.grade || (c as any).class, c.code))
                          .filter((g) => /^\d+$/.test(g))
                      )
                    );
                    const baseGrades = ['7', '8', '9'];
                    const extraGrades = showAll12Grades
                      ? ['1', '2', '3', '4', '5', '6', '10', '11', '12']
                      : registeredGrades.filter((g) => !baseGrades.includes(g));
                    const visibleGrades = Array.from(new Set([...baseGrades, ...extraGrades])).sort(
                      (a, b) => Number(a) - Number(b)
                    );
                    const gradeLabelMap: Record<string, string> = {
                      '1': 'الصف الأول',
                      '2': 'الصف الثاني',
                      '3': 'الصف الثالث',
                      '4': 'الصف الرابع',
                      '5': 'الصف الخامس',
                      '6': 'الصف السادس',
                      '7': 'الصف السابع',
                      '8': 'الصف الثامن',
                      '9': 'الصف التاسع',
                      '10': 'الصف العاشر',
                      '11': 'الصف الحادي عشر',
                      '12': 'الصف الثاني عشر',
                    };

                    const toggleGrade = (gId: string) => {
                      setSelectedTargetGrades((prev) =>
                        prev.includes(gId) ? prev.filter((x) => x !== gId) : [...prev, gId]
                      );
                    };

                    return (
                      <div className="rounded-xl bg-[#F4F8FC] border border-[#DCE7F3] p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs font-black text-[#1A3A5F]">
                            تحديد الصف أو الصفوف المراد إرسال التعميم لها:
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowAll12Grades((p) => !p)}
                            className="text-[11px] font-bold text-[#1F5AAA] hover:underline cursor-pointer"
                          >
                            {showAll12Grades ? 'عرض الصفوف الأساسية (7 - 9)' : 'عرض كافة الصفوف (1 - 12)'}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedTargetGrades([])}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                              selectedTargetGrades.length === 0
                                ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-2xs'
                                : 'bg-white text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                            }`}
                          >
                            جميع الصفوف
                          </button>

                          {visibleGrades.map((gId) => {
                            const isChecked = selectedTargetGrades.includes(gId);
                            return (
                              <button
                                key={`ann-grade-${gId}`}
                                type="button"
                                onClick={() => toggleGrade(gId)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                                  isChecked
                                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                    : 'bg-white text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                                }`}
                              >
                                {isChecked ? '✓ ' : ''}
                                {gradeLabelMap[gId] || `الصف ${gId}`}
                              </button>
                            );
                          })}
                        </div>

                        <p className="text-[11px] font-bold text-[#5C7085]">
                          سيصل التعميم إلى:{' '}
                          <span className="text-[#1F5AAA]">
                            {formatAnnouncementTargetGradesAr(
                              selectedTargetGrades.length > 0 ? selectedTargetGrades : ['all']
                            )}
                          </span>
                        </p>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">نص التعميم أو الملاحظة:</label>
                    <textarea
                      rows={3}
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="اكتب التوجيهات أو الملاحظات الإدارية..."
                      className="w-full p-3 text-xs sm:text-sm rounded-xl border border-[#DCE7F3] focus:outline-[#1F5AAA] bg-white text-[#1A3A5F]"
                      required
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isPublishing}
                      className="py-2.5 px-6 bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black rounded-xl transition shadow-sm flex items-center gap-2 cursor-pointer border border-[#194B91]"
                    >
                      <Send className="w-4 h-4" />
                      <span>{isPublishing ? 'جاري النشر...' : 'نشر التعميم أو الملاحظة'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Published Announcements List */}
              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] shadow-sm text-center text-slate-600 font-bold text-sm">
                    لا توجد تعاميم وملاحظات منشورة بعد
                  </div>
                ) : (
                  <>
                    <h3 className="font-black text-[#1A3A5F] text-sm">
                      التعاميم والملاحظات المنشورة حالياً ({announcements.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {announcements.map((anc) => (
                        <div
                          key={anc.id}
                          className="bg-white rounded-2xl p-5 border border-[#DCE7F3] shadow-sm flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between flex-wrap gap-1.5 mb-2">
                              <div className="flex items-center flex-wrap gap-1.5">
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2]">
                                  {anc.target === 'all'
                                    ? 'موجه للجميع'
                                    : anc.target === 'teachers'
                                    ? 'للمعلمين فقط'
                                    : 'للطلاب فقط'}
                                </span>
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {formatAnnouncementTargetGradesAr(anc.targetGrades)}
                                </span>
                              </div>
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                  anc.priority === 'عاجل'
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : anc.priority === 'هام'
                                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200'
                                }`}
                              >
                                {anc.priority}
                              </span>
                            </div>

                            <h4 className="font-black text-[#1A3A5F] text-sm mb-1">{anc.title}</h4>
                            <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-3 font-medium">{anc.content}</p>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-[11px] text-slate-600 font-semibold">
                            <span>المرسل: {anc.senderName} ({anc.createdAt})</span>
                            <button
                              type="button"
                              onClick={async () => {
                                await appDataService.deleteAnnouncement(anc.id);
                              }}
                              className="text-rose-700 hover:text-rose-900 font-bold cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: البريد (مراجعة واعتماد تقارير وأنشطة وفعاليات وكشوفات حضور المشرف) */}
          {activeTab === 'inbox' && (
            <PrincipalInboxTab
              schoolId={session.schoolId}
              schoolName={formatArabicSchoolName(session.schoolName, session.schoolId)}
              principalName={
                session.name && !isGenericPrincipalSender(session.name)
                  ? session.name
                  : getSchoolPrincipalName(session.schoolId, session.schoolName)
              }
            />
          )}

          {/* TAB 4: لوحة المدرسة (المعتمدة فقط) */}
          {activeTab === 'school_board' && (
            <SchoolBoardView
              schoolId={session.schoolId}
              schoolName={formatArabicSchoolName(session.schoolName, session.schoolId)}
              onOpenSchoolActivitiesArchive={() => setSidebarView('archive_school_activities')}
            />
          )}
        </>
      )}

      {/* Unified Right RTL Sidebar Drawer */}
      <UnifiedSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        session={session}
        activeView={sidebarView}
        onSelectView={(v: PrincipalViewType) => {
          setSidebarView(v);
          setIsSidebarOpen(false);
        }}
      />

      {/* PDF Modal for Archive */}
      <PrincipalReportPdfModal
        isOpen={pdfModalConfig.isOpen}
        onClose={() => setPdfModalConfig((prev) => ({ ...prev, isOpen: false }))}
        students={pdfModalConfig.students}
        schoolName={formatArabicSchoolName(session.schoolName, session.schoolId)}
        gradeLabel={pdfModalConfig.gradeLabel}
        periodLabel={pdfModalConfig.periodLabel}
        reportTitle={pdfModalConfig.reportTitle}
        isAnnual={pdfModalConfig.isAnnual}
      />

      </div>

      {/* FLOATING BOTTOM NAVIGATION BAR (4 Tabs: الإحصائيات | التعاميم | البريد | لوحة المدرسة) */}
      <nav
        aria-label="التنقل السفلي"
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl z-40"
      >
        <div className="rounded-[24px] sm:rounded-[28px] bg-white/95 backdrop-blur-md border border-[#DCE7F3] shadow-[0_-4px_20px_rgba(26,58,95,0.08)] p-1 sm:p-1.5 grid grid-cols-4 gap-1 items-center text-center">
          {/* Tab 1: الإحصائيات */}
          <button
            type="button"
            onClick={() => {
              setSidebarView('dashboard');
              setActiveTab('statistics');
            }}
            className={`min-h-[48px] py-1.5 px-1 sm:px-2 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[11px] sm:text-xs leading-tight text-center transition-all cursor-pointer ${
              sidebarView === 'dashboard' && activeTab === 'statistics'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>الإحصائيات</span>
          </button>

          {/* Tab 2: التعاميم */}
          <button
            type="button"
            onClick={() => {
              setSidebarView('dashboard');
              setActiveTab('announcements');
              setUnreadAnnouncementsCount(0);
            }}
            className={`min-h-[48px] py-1.5 px-1 sm:px-2 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[11px] sm:text-xs leading-tight text-center relative transition-all cursor-pointer ${
              sidebarView === 'dashboard' && activeTab === 'announcements'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <div className="relative flex items-center shrink-0">
              <Megaphone className="w-4 h-4 shrink-0" />
              {unreadAnnouncementsCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center border border-white">
                  {unreadAnnouncementsCount}
                </span>
              )}
            </div>
            <span>التعاميم</span>
          </button>

          {/* Tab 3: البريد */}
          <button
            type="button"
            onClick={() => {
              setSidebarView('dashboard');
              setActiveTab('inbox');
            }}
            className={`min-h-[48px] py-1.5 px-1 sm:px-2 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[11px] sm:text-xs leading-tight text-center relative transition-all cursor-pointer ${
              sidebarView === 'dashboard' && activeTab === 'inbox'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <div className="relative flex items-center shrink-0">
              <Inbox className="w-4 h-4 shrink-0" />
              {pendingInboxCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center border border-white">
                  {pendingInboxCount}
                </span>
              )}
            </div>
            <span>البريد</span>
          </button>

          {/* Tab 4: لوحة المدرسة */}
          <button
            type="button"
            onClick={() => {
              setSidebarView('dashboard');
              setActiveTab('school_board');
            }}
            className={`min-h-[48px] py-1.5 px-1 sm:px-2 rounded-2xl sm:rounded-full flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[11px] sm:text-xs leading-tight text-center transition-all cursor-pointer ${
              sidebarView === 'dashboard' && activeTab === 'school_board'
                ? 'bg-[#EEF5FC] text-[#1F5AAA] font-black shadow-2xs border border-[#C6DCF2]'
                : 'text-[#5C7085] hover:bg-[#F3F7FB] hover:text-[#1A3A5F] font-bold'
            }`}
          >
            <School className="w-4 h-4 shrink-0" />
            <span>لوحة المدرسة</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
