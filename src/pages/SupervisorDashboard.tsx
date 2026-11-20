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
  Edit3,
  X,
  Bell,
  CheckCheck,
  Mic,
  Square,
  Volume2,
  ShieldCheck,
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserSession, authService, ALL_SUBJECTS } from '../services/authService';
import {
  appDataService,
  AppNotification,
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
  SupervisorReportInputType,
  SUPERVISOR_PRIMARY_CATEGORIES,
  SUPERVISOR_SUBTYPES_MAP,
  getGradeLabelAr,
} from '../services/appData';
import { UnifiedSidebar, UnifiedSidebarView } from '../components/UnifiedSidebar';
import { ScheduleGridView } from '../components/ScheduleGridView';
import { getApprovalBadgeAndFrame } from '../components/PrincipalInboxTab';
import { formatArabicSchoolName } from '../utils/schoolDisplay';
import { compressImageFile, recompressDataUrl } from '../utils/imageCompression';
import { playGentleNotificationSound } from '../services/soundUtils';

const resolveGeminiApiUrl = (apiPath: string): string => {
  const base = String((import.meta as any).env?.VITE_GEMINI_BACKEND_URL || '')
    .trim()
    .replace(/\/$/, '');
  return `${base}${apiPath}`;
};

interface SupervisorDashboardProps {
  session: UserSession;
}

const MAX_VOICE_SECONDS = 120;

const formatMmSs = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = String(reader.result || '');
      resolve(res.includes(',') ? res.split(',')[1] || '' : res);
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف الصوتي'));
    reader.readAsDataURL(blob);
  });

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

const normalizeCategoryBucket = (cat: SupervisorActivityCategory): 'تقرير' | 'نشاط' | 'فعالية' => {
  if (cat === 'تقرير') return 'تقرير';
  if (cat === 'فعالية') return 'فعالية';
  return 'نشاط';
};

const getActivityBranchIcon = (cat: SupervisorActivityCategory, subType?: string) => {
  const bucket = normalizeCategoryBucket(cat);
  if (bucket === 'تقرير') return FileText;
  if (bucket === 'فعالية') return Flag;
  if (subType?.includes('ثقافي') || subType?.includes('مسابقة') || cat === 'نشاط ثقافي') return BookOpen;
  if (subType?.includes('رحلة') || cat === 'رحلة مدرسية') return Compass;
  return Trophy;
};

const getAttendanceCardTheme = (status: AttendanceStatus) => {
  switch (status) {
    case 'حاضر':
      return {
        card: 'bg-emerald-50/75 border-emerald-300',
        pill: 'bg-emerald-600 text-white border-emerald-700',
        label: 'حاضر',
      };
    case 'غائب بعذر':
      return {
        card: 'bg-sky-50/85 border-sky-300',
        pill: 'bg-[#1F5AAA] text-white border-[#194B91]',
        label: 'غائب بعذر',
      };
    case 'متأخر':
      return {
        card: 'bg-amber-50/85 border-amber-300',
        pill: 'bg-amber-500 text-white border-amber-600',
        label: 'متأخر',
      };
    case 'غائب بدون عذر':
    case 'غائب':
    default:
      return {
        card: 'bg-rose-50/85 border-rose-300',
        pill: 'bg-rose-600 text-white border-rose-700',
        label: 'غائب بدون عذر',
      };
  }
};

export const SupervisorDashboard: React.FC<SupervisorDashboardProps> = ({ session }) => {
  const schoolId = session.schoolId || '';
  const displaySchoolName = formatArabicSchoolName(session.schoolName, schoolId);

  const [activeTab, setActiveTab] = useState<'activities' | 'attendance' | 'schedule'>('activities');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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

  // Supervisor Workflow Notifications ("تم اعتماد تقريرك ونشره" / "تم رفض تقريرك، السبب: ...")
  const [supervisorNotifications, setSupervisorNotifications] = useState<AppNotification[]>(() =>
    appDataService.getNotifications(schoolId, 'supervisor', session.code)
  );
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifBootstrappedRef = useRef(false);

  // --- TAB 1: ACTIVITIES STATE (تقرير / نشاط / فعالية بالصوت أو الصورة+سطر + مراجعة المشرف -> إرسال للمدير) ---
  const [selectedActivityBranch, setSelectedActivityBranch] = useState<'الكل' | 'تقرير' | 'نشاط' | 'فعالية'>('الكل');
  const [actCategory, setActCategory] = useState<'تقرير' | 'نشاط' | 'فعالية'>('تقرير');
  const [actSubType, setActSubType] = useState<string>(SUPERVISOR_SUBTYPES_MAP['تقرير'][0]);
  const [actTargetGrade, setActTargetGrade] = useState('الكل');
  const [actTargetClass, setActTargetClass] = useState('الكل');
  const [actDate, setActDate] = useState<string>(() => getTodayIsoDate());

  // AI Creation Modes: 'voice' (الأساسية: تسجيل حتى دقيقتين) | 'image' (الثانية: صورة + سطر واحد)
  const [aiCreationMode, setAiCreationMode] = useState<'voice' | 'image'>('voice');
  const [actInputType, setActInputType] = useState<SupervisorReportInputType>('صوت');
  const [actOriginalText, setActOriginalText] = useState('');
  const [oneLineNote, setOneLineNote] = useState('');
  const [actAudioUrl, setActAudioUrl] = useState('');
  const [recordedAudioPreviewUrl, setRecordedAudioPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isDraftingReport, setIsDraftingReport] = useState(false);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);
  const [hasAiDraftReady, setHasAiDraftReady] = useState(false);
  const [hasReviewedDraft, setHasReviewedDraft] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const [actTitle, setActTitle] = useState('');
  const [actDetails, setActDetails] = useState('');
  const [actImages, setActImages] = useState<string[]>([]);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const actCameraRef = useRef<HTMLInputElement | null>(null);
  const actGalleryRef = useRef<HTMLInputElement | null>(null);

  // --- TAB 2: ATTENDANCE STATE (Gemini Vision Prominent Cards + Send to Principal Approval) ---
  const [attGrade, setAttGrade] = useState('7');
  const [attClassNumber, setAttClassNumber] = useState('1');
  const [attDate, setAttDate] = useState<string>(() => getTodayIsoDate());
  const [attImagePreview, setAttImagePreview] = useState<string | null>(null);
  const [attEntries, setAttEntries] = useState<AttendanceEntry[]>([]);
  const [isParsingAttendance, setIsParsingAttendance] = useState(false);
  const [attParseError, setAttParseError] = useState<string | null>(null);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
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
      setSupervisorNotifications(appDataService.getNotifications(schoolId, 'supervisor', session.code));
    };
    sync();
    const unsub = appDataService.subscribe(sync);

    let unsubNotifs = () => {};
    if (schoolId) {
      const normalizedSchool = schoolId.trim().toLowerCase();
      try {
        unsubNotifs = onSnapshot(
          query(collection(db, 'notifications'), where('schoolId', '==', schoolId)),
          (snap) => {
            const list = snap.docs
              .map((d) => ({ ...d.data(), id: d.id } as AppNotification))
              .filter((n) => {
                if ((n.schoolId || '').trim().toLowerCase() !== normalizedSchool) return false;
                if (n.recipientRole !== 'supervisor') return false;
                if (
                  session.code &&
                  n.recipientCode &&
                  n.recipientCode.trim().toUpperCase() !== session.code.trim().toUpperCase()
                ) {
                  return false;
                }
                return true;
              })
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
            setSupervisorNotifications(list);
          },
          () => {}
        );
      } catch {}
    }

    return () => {
      unsub();
      unsubNotifs();
    };
  }, [schoolId, session.code]);

  // Cleanup active mic stream / preview URL on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordedAudioPreviewUrl) {
        URL.revokeObjectURL(recordedAudioPreviewUrl);
      }
    };
  }, [recordedAudioPreviewUrl]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 5500);
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

  // --- Activity & Voice/Image AI Drafting Handlers ---
  const handleSelectBranch = (branch: 'الكل' | 'تقرير' | 'نشاط' | 'فعالية') => {
    setSelectedActivityBranch(branch);
    if (branch !== 'الكل') {
      setActCategory(branch);
      setActSubType(SUPERVISOR_SUBTYPES_MAP[branch][0]);
    }
  };

  const handleActivityImagesPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, 3 - actImages.length);
    if (remainingSlots === 0) {
      showToast('error', 'الحد الأقصى للصور المرفقة هو 3 صور فقط.');
      return;
    }

    const picked = files.slice(0, remainingSlots);
    const compressedUrls: string[] = [];
    for (const file of picked) {
      try {
        const { dataUrl } = await compressImageFile(file, { maxDimension: 1280, quality: 0.75 });
        if (dataUrl) compressedUrls.push(dataUrl);
      } catch (err: any) {
        showToast('error', err?.message || 'يُسمح برفع الصور فقط (ممنوع رفع الفيديو).');
      }
    }

    if (compressedUrls.length > 0) {
      let combined = [...actImages, ...compressedUrls].slice(0, 3);
      let totalSize = combined.reduce((sum, img) => sum + img.length, 0);
      if (totalSize > 750_000) {
        combined = await Promise.all(combined.map((url) => recompressDataUrl(url, 960, 0.7)));
        totalSize = combined.reduce((sum, img) => sum + img.length, 0);
      }
      if (totalSize > 850_000) {
        showToast('error', 'حجم الصور كبير جداً، يرجى تقليل عدد الصور.');
        return;
      }
      setActImages(combined);
    }
  };

  const processRecordedVoiceBlob = async (audioBlob: Blob) => {
    setAiDraftError(null);
    setIsDraftingReport(true);
    setHasReviewedDraft(false);

    if (recordedAudioPreviewUrl) {
      URL.revokeObjectURL(recordedAudioPreviewUrl);
    }
    const localPreviewUrl = URL.createObjectURL(audioBlob);
    setRecordedAudioPreviewUrl(localPreviewUrl);

    try {
      const [audioBase64, uploadedUrl] = await Promise.all([
        blobToBase64(audioBlob),
        appDataService.uploadSupervisorAudio(schoolId, audioBlob),
      ]);

      const response = await fetch(resolveGeminiApiUrl('/api/gemini/draft-report-from-voice'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: audioBlob.type || 'audio/webm',
          category: actCategory,
          subType: actSubType,
          targetGrade: actTargetGrade,
          targetClass: actTargetClass,
          activityDate: actDate,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('خدمة تحويل الصوت عبر Gemini غير متاحة في هذه البيئة.');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'تعذر تحويل الصوت وصياغة التقرير.');
      }

      const transcript = String(payload?.transcript || '').trim();
      const suggestedTitle = String(payload?.suggestedTitle || '').trim();
      const formalReport = String(payload?.formalReport || '').trim();

      if (!formalReport) {
        throw new Error('لم يتم التقاط كلام واضح في التسجيل الصوتي، يرجى التحدث بوضوح والمحاولة مرة أخرى.');
      }

      setActInputType('صوت');
      setActOriginalText(transcript || '(تسجيل صوتي)');
      setActAudioUrl(uploadedUrl || '');
      setActTitle(suggestedTitle || `${actCategory} - ${actSubType}`);
      setActDetails(formalReport);
      setHasAiDraftReady(true);
      setHasReviewedDraft(false);
      showToast('success', '✨ تم تحويل تسجيلك الصوتي وصياغة التقرير الرسمي. راجع النص وعدّل ما يلزم قبل الإرسال.');
    } catch (err: any) {
      setAiDraftError(err?.message || 'حدث خطأ أثناء معالجة التسجيل الصوتي.');
      showToast('error', err?.message || 'حدث خطأ أثناء معالجة التسجيل الصوتي.');
    } finally {
      setIsDraftingReport(false);
    }
  };

  const handleStartVoiceRecording = async () => {
    if (isRecording || isDraftingReport) return;
    setAiDraftError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      const msg = 'متصفحك لا يدعم تسجيل الصوت بالميكروفون. يمكنك استخدام وضع الصورة + سطر واحد.';
      setAiDraftError(msg);
      showToast('error', msg);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ];
      const supportedMime = mimeCandidates.find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      });

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        setIsRecording(false);

        const mime = recorder.mimeType || supportedMime || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });
        if (audioBlob.size < 256) {
          setAiDraftError('التسجيل قصير جداً أو فارغ، يرجى الضغط للتسجيل والتحدث بوضوح.');
          return;
        }
        await processRecordedVoiceBlob(audioBlob);
      };

      recorder.start(500);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_VOICE_SECONDS) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
            }
            return MAX_VOICE_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'تم رفض إذن الميكروفون، يرجى السماح بالوصول للميكروفون من إعدادات المتصفح.'
          : err?.message || 'تعذر تشغيل الميكروفون.';
      setAiDraftError(msg);
      showToast('error', msg);
    }
  };

  const handleStopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleDraftFromImageAndOneLine = async () => {
    if (isDraftingReport) return;
    if (actImages.length === 0) {
      setAiDraftError('يرجى التقاط أو إرفاق صورة واحدة على الأقل للنشاط أو الحدث أولاً.');
      return;
    }
    const cleanLine = oneLineNote.trim();
    if (!cleanLine) {
      setAiDraftError('يرجى كتابة سطر واحد توضيحي عن الصورة قبل الصياغة.');
      return;
    }

    setAiDraftError(null);
    setIsDraftingReport(true);
    setHasReviewedDraft(false);

    try {
      const response = await fetch(resolveGeminiApiUrl('/api/gemini/draft-report-from-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: actImages.map((imgUrl) => ({
            base64: imgUrl,
            mimeType: 'image/jpeg',
          })),
          oneLineNote: cleanLine,
          category: actCategory,
          subType: actSubType,
          targetGrade: actTargetGrade,
          targetClass: actTargetClass,
          activityDate: actDate,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('خدمة صياغة التقارير من الصور غير متاحة في هذه البيئة.');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'تعذر صياغة التقرير من الصورة والسطر.');
      }

      const suggestedTitle = String(payload?.suggestedTitle || '').trim();
      const formalReport = String(payload?.formalReport || '').trim();
      if (!formalReport) {
        throw new Error('لم يتمكن Gemini من صياغة الوصف، يرجى تجربة صورة أوضح.');
      }

      setActInputType('صورة');
      setActOriginalText(cleanLine);
      setActAudioUrl('');
      setActTitle(suggestedTitle || cleanLine);
      setActDetails(formalReport);
      setHasAiDraftReady(true);
      setHasReviewedDraft(false);
      showToast('success', '✨ صاغ Gemini التقرير الكامل بناءً على الصورة والسطر. راجع النص وعدّله ثم أرسله للمدير.');
    } catch (err: any) {
      setAiDraftError(err?.message || 'حدث خطأ أثناء صياغة التقرير من الصورة.');
      showToast('error', err?.message || 'حدث خطأ أثناء صياغة التقرير من الصورة.');
    } finally {
      setIsDraftingReport(false);
    }
  };

  const resetActivityComposer = () => {
    setEditingActivityId(null);
    setActTitle('');
    setActDetails('');
    setActImages([]);
    setActOriginalText('');
    setOneLineNote('');
    setActAudioUrl('');
    setHasAiDraftReady(false);
    setHasReviewedDraft(false);
    setAiDraftError(null);
    if (recordedAudioPreviewUrl) {
      URL.revokeObjectURL(recordedAudioPreviewUrl);
      setRecordedAudioPreviewUrl(null);
    }
  };

  const handleStartEditActivity = (act: SupervisorActivity) => {
    const bucket = normalizeCategoryBucket(act.category);
    setEditingActivityId(act.id);
    setActCategory(bucket);
    const subOptions = SUPERVISOR_SUBTYPES_MAP[bucket];
    const resolvedSub =
      act.subType && subOptions.includes(act.subType)
        ? act.subType
        : subOptions[0];
    setActSubType(resolvedSub);
    setActTitle(act.title || '');
    setActDetails(act.formalText || act.details || '');
    setActOriginalText(act.originalText || act.details || '');
    setActInputType(act.inputType || 'صوت');
    setActAudioUrl(act.audioUrl || '');
    setAiCreationMode(act.inputType === 'صورة' ? 'image' : 'voice');
    setOneLineNote(act.inputType === 'صورة' ? act.originalText || '' : '');
    setActImages(Array.isArray(act.images) ? act.images.slice(0, 3) : []);
    setActTargetGrade(act.targetGrade || 'الكل');
    setActTargetClass(act.targetClass || 'الكل');
    setActDate(act.activityDate || getTodayIsoDate());
    setHasAiDraftReady(true);
    setHasReviewedDraft(false);
    setAiDraftError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditActivity = () => {
    resetActivityComposer();
  };

  const handleCreateOrResubmitActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingActivity) return;

    if (!hasAiDraftReady) {
      showToast('error', 'استخدم التسجيل الصوتي أو الصورة + سطر أولاً لتوليد المسودة ومراجعتها قبل الإرسال.');
      return;
    }
    if (!actTitle.trim() || !actDetails.trim()) {
      showToast('error', 'يرجى مراجعة عنوان التقرير والنص الرسمي قبل الإرسال.');
      return;
    }
    if (!hasReviewedDraft) {
      showToast('error', 'لا يمكن إرسال أي تقرير للمدير بدون مراجعة المشرف وتأكيد المراجعة أولاً.');
      return;
    }

    let finalImages = actImages;
    let totalImgBytes = finalImages.reduce((s, x) => s + x.length, 0);
    if (totalImgBytes > 750_000) {
      finalImages = await Promise.all(finalImages.map((url) => recompressDataUrl(url, 960, 0.7)));
      totalImgBytes = finalImages.reduce((s, x) => s + x.length, 0);
    }
    if (totalImgBytes > 850_000) {
      showToast('error', 'حجم الصور المرفقة يتجاوز الحد المسموح، يرجى حذف صورة.');
      return;
    }

    setIsSavingActivity(true);
    try {
      const cleanFormal = actDetails.trim();
      const cleanOriginal = actOriginalText.trim() || cleanFormal;
      if (editingActivityId) {
        await appDataService.updateSupervisorActivity(editingActivityId, {
          category: actCategory,
          subType: actSubType,
          title: actTitle.trim(),
          details: cleanFormal,
          formalText: cleanFormal,
          originalText: cleanOriginal,
          inputType: actInputType,
          audioUrl: actAudioUrl || undefined,
          images: finalImages,
          targetGrade: actTargetGrade,
          targetClass: actTargetClass,
          activityDate: actDate,
        });
        resetActivityComposer();
        showToast('success', `✅ تم تعديل (${actCategory} - ${actSubType}) وإعادة إرساله إلى مدير المدرسة للاعتماد.`);
      } else {
        await appDataService.addSupervisorActivity({
          schoolId,
          category: actCategory,
          subType: actSubType,
          title: actTitle.trim(),
          details: cleanFormal,
          formalText: cleanFormal,
          originalText: cleanOriginal,
          inputType: actInputType,
          audioUrl: actAudioUrl || undefined,
          images: finalImages,
          targetGrade: actTargetGrade,
          targetClass: actTargetClass,
          activityDate: actDate,
          createdBy: session.name || 'المشرف',
          supervisorCode: session.code,
          approvalStatus: 'pending',
        });
        resetActivityComposer();
        showToast('success', `✅ تم إرسال (${actCategory} - ${actSubType}) إلى بريد مدير المدرسة للاعتماد.`);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'تعذر إرسال الطلب، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSavingActivity(false);
    }
  };

  // --- Attendance Handlers ---
  const attendanceAlreadyExistsToday = useMemo(() => {
    if (editingAttendanceId) return false;
    return appDataService.hasAttendanceForClassDate(schoolId, attGrade, attClassNumber, attDate);
  }, [attendanceRecords, schoolId, attGrade, attClassNumber, attDate, editingAttendanceId]);

  const handleAttendanceImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAttParseError(null);
    setIsParsingAttendance(true);
    try {
      const { dataUrl, base64, mimeType } = await compressImageFile(file, {
        maxDimension: 1280,
        quality: 0.75,
      });
      setAttImagePreview(dataUrl);

      const response = await fetch(resolveGeminiApiUrl('/api/gemini/parse-attendance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          gradeLabel: getGradeLabelAr(attGrade),
          classNumber: attClassNumber,
        }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('خدمة قراءة الصور غير متوفرة على هذه الاستضافة الثابتة، يمكنك إضافة الأسماء يدوياً أدناه.');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'تعذر قراءة كشف الحضور من الصورة.');
      }

      const rawParsed: any[] = Array.isArray(payload?.students)
        ? payload.students
        : Array.isArray(payload?.entries)
        ? payload.entries
        : [];
      const parsed: AttendanceEntry[] = rawParsed.map((item) => ({
        studentName: String(item?.studentName || item?.name || '').trim(),
        status:
          item?.status === 'حاضر' ||
          item?.status === 'غائب بعذر' ||
          item?.status === 'غائب بدون عذر' ||
          item?.status === 'متأخر'
            ? item.status
            : item?.status === 'غائب'
            ? 'غائب بدون عذر'
            : 'حاضر',
        note: item?.note ? String(item.note).trim() : undefined,
      })).filter((x) => x.studentName.length > 0);

      if (parsed.length === 0) {
        setAttParseError('لم يتم العثور على أسماء واضحة في الصورة. تأكد من وضوح الكشف أو أضف الطلاب يدوياً.');
      } else {
        setAttEntries(parsed);
        showToast('success', `✨ تم استخراج ${parsed.length} طالباً وعرضهم ككروت بارزة. راجع الحالة (غائب بعذر / بدون عذر) ثم أرسل للاعتماد.`);
      }
    } catch (err: any) {
      setAttParseError(err?.message || 'حدث خطأ أثناء قراءة صورة كشف الحضور.');
    } finally {
      setIsParsingAttendance(false);
    }
  };

  const handleStartEditAttendance = (rec: AttendanceRecord) => {
    setEditingAttendanceId(rec.id);
    setAttGrade(rec.grade);
    setAttClassNumber(rec.classNumber || '1');
    setAttDate(rec.date);
    setAttEntries(
      rec.entries.map((e) => ({
        studentName: e.studentName,
        status: e.status === 'غائب' ? 'غائب بدون عذر' : e.status,
        note: e.note,
      }))
    );
    setAttImagePreview(null);
    setAttParseError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveAttendance = async () => {
    if (attendanceAlreadyExistsToday) {
      showToast('error', `لا يمكن التسجيل مرتين: تم إرسال حضور وغياب هذا الفصل بتاريخ ${attDate} مسبقاً.`);
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
        resubmitRecordId: editingAttendanceId || undefined,
      });
      setAttEntries([]);
      setAttImagePreview(null);
      setAttParseError(null);
      setEditingAttendanceId(null);
      showToast('success', '✅ تم إرسال كشف الحضور والغياب إلى بريد مدير المدرسة للاعتماد (ويظهر في بوابة المشرف والمدير وحساب الطالب الخاص فقط).');
    } catch (err: any) {
      showToast('error', err?.message || 'فشل إرسال كشف الحضور.');
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
      const { dataUrl, base64, mimeType } = await compressImageFile(file, {
        maxDimension: 1280,
        quality: 0.75,
      });
      setSchedImagePreview(dataUrl);

      const response = await fetch(resolveGeminiApiUrl('/api/gemini/parse-schedule'), {
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
  const absentExcusedCount = attEntries.filter((e) => e.status === 'غائب بعذر').length;
  const absentUnexcusedCount = attEntries.filter(
    (e) => e.status === 'غائب بدون عذر' || e.status === 'غائب'
  ).length;
  const lateCount = attEntries.filter((e) => e.status === 'متأخر').length;

  const filteredActivities = useMemo(() => {
    if (selectedActivityBranch === 'الكل') return activities;
    return activities.filter((a) => normalizeCategoryBucket(a.category) === selectedActivityBranch);
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

        {/* Supervisor Workflow Notifications Bar ("تم اعتماد تقريرك ونشره" / "تم رفض تقريرك، السبب: ...") */}
        {(() => {
          const unreadNotifs = supervisorNotifications.filter((n) => !n.isRead);
          if (supervisorNotifications.length === 0) return null;
          const latest = unreadNotifs[0] || supervisorNotifications[0];
          const isRejected = latest?.type === 'rejected';
          const isApproved = latest?.type === 'approved';
          return (
            <div className="bg-white rounded-2xl border border-[#C6DCF2] shadow-xs overflow-hidden">
              <div
                className={`px-4 py-2.5 flex items-center justify-between gap-2 ${
                  unreadNotifs.length > 0 && isRejected
                    ? 'bg-rose-50'
                    : unreadNotifs.length > 0 && isApproved
                    ? 'bg-emerald-50'
                    : 'bg-[#F4F8FC]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setShowNotifPanel((prev) => !prev)}
                  className="flex items-center gap-2 text-xs sm:text-sm font-black text-[#1A3A5F] cursor-pointer text-right"
                >
                  <div className="relative shrink-0">
                    <Bell className="w-4 h-4 text-[#1F5AAA]" />
                    {unreadNotifs.length > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-rose-600 border border-white animate-pulse" />
                    )}
                  </div>
                  <span className="line-clamp-1">
                    {unreadNotifs.length > 0
                      ? unreadNotifs[0].message
                      : `إشعارات المشرف (${supervisorNotifications.length})`}
                  </span>
                  {unreadNotifs.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#1F5AAA] text-white text-[10px] font-black shrink-0">
                      {unreadNotifs.length} جديد
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {unreadNotifs.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        appDataService.markAllNotificationsRead(schoolId, 'supervisor')
                      }
                      className="px-2.5 py-1 rounded-xl bg-white border border-[#C6DCF2] text-[#1F5AAA] text-[11px] font-black cursor-pointer"
                    >
                      تحديد كمقروء
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
                    <span className="text-[11px] font-black text-[#5C7085]">سجل إشعارات الاعتماد والرفض</span>
                    {unreadNotifs.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          appDataService.markAllNotificationsRead(schoolId, 'supervisor')
                        }
                        className="text-[11px] font-black text-[#1F5AAA] flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>قراءة الكل</span>
                      </button>
                    )}
                  </div>
                  {supervisorNotifications.slice(0, 15).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        appDataService.markNotificationRead(n.id);
                        setActiveTab(n.relatedKind === 'attendance' ? 'attendance' : 'activities');
                      }}
                      className={`w-full text-right p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition ${
                        n.isRead
                          ? 'bg-slate-50 border-slate-200 text-slate-600'
                          : n.type === 'rejected'
                          ? 'bg-rose-50 border-rose-300 text-rose-950 font-bold'
                          : n.type === 'approved'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                          : 'bg-orange-50 border-orange-300 text-orange-950 font-bold'
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
        {/* TAB 1: الأنشطة (تقرير / نشاط / فعالية + 3 صور -> إرسال للمدير للاعتماد) */}
        {/* =================================================================== */}
        {activeTab === 'activities' && (
          <div className="space-y-5">
            {/* Branching Pills inside الأنشطة */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#DCE7F3] shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#1F5AAA]" />
                    <span>التقارير والأنشطة والفعاليات المدرسية</span>
                  </h2>
                  <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                    يرفع المشرف التقرير أو النشاط أو الفعالية مع الصور إلى مدير المدرسة للاعتماد والنشر في لوحة المدرسة
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                    أخضر: معتمد
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    أصفر: بانتظار الاعتماد
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-orange-100 text-orange-900 border border-orange-300">
                    برتقالي: طلب تعديل
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300">
                    أحمر: مرفوض
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSelectBranch('الكل')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer border ${
                    selectedActivityBranch === 'الكل'
                      ? 'bg-[#1A3A5F] text-white border-[#1A3A5F] shadow-xs'
                      : 'bg-white text-[#5C7085] border-[#DCE7F3] hover:bg-[#F4F8FC]'
                  }`}
                >
                  الكل ({activities.length})
                </button>
                {SUPERVISOR_PRIMARY_CATEGORIES.map((branch) => {
                  const Icon = getActivityBranchIcon(branch);
                  const isActive = selectedActivityBranch === branch;
                  const count = activities.filter((a) => normalizeCategoryBucket(a.category) === branch).length;
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
              </div>
            </div>

            {/* Create / Edit Activity / Report / Event Form */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DCE7F3] shadow-sm space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-2">
                  {editingActivityId ? (
                    <Edit3 className="w-4 h-4 text-orange-600" />
                  ) : (
                    <Plus className="w-4 h-4 text-[#1F5AAA]" />
                  )}
                  <span>
                    {editingActivityId
                      ? `تعديل (${actCategory} - ${actSubType}) وإعادة الإرسال للاعتماد`
                      : `إضافة (${actCategory}) وإرساله إلى المدير للاعتماد`}
                  </span>
                </h3>
                {editingActivityId && (
                  <button
                    type="button"
                    onClick={handleCancelEditActivity}
                    className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>

              <form onSubmit={handleCreateOrResubmitActivity} className="space-y-4">
                {/* Primary Category Switcher */}
                <div className="grid grid-cols-3 gap-2">
                  {SUPERVISOR_PRIMARY_CATEGORIES.map((cat) => {
                    const Icon = getActivityBranchIcon(cat);
                    const isSelected = actCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setActCategory(cat);
                          setActSubType(SUPERVISOR_SUBTYPES_MAP[cat][0]);
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-xs'
                            : 'bg-[#F4F8FC] text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{cat}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sub-Type Pills */}
                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1.5">
                    نوع {actCategory}:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SUPERVISOR_SUBTYPES_MAP[actCategory].map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setActSubType(sub)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border transition cursor-pointer ${
                          actSubType === sub
                            ? 'bg-[#1A3A5F] text-white border-[#1A3A5F]'
                            : 'bg-white text-[#1A3A5F] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Grade, Class/Section, Date */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    <label className="block text-xs font-bold text-[#1A3A5F] mb-1">الفصل / الشعبة:</label>
                    <select
                      value={actTargetClass}
                      onChange={(e) => setActTargetClass(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                    >
                      <option value="الكل">جميع الفصول</option>
                      <option value="1">فصل 1</option>
                      <option value="2">فصل 2</option>
                      <option value="3">فصل 3</option>
                      <option value="4">فصل 4</option>
                      <option value="أ">فصل أ</option>
                      <option value="ب">فصل ب</option>
                      <option value="ج">فصل ج</option>
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

                {/* AI Creation Method Selector: Voice-First (Primary, max 2 min) vs Image + 1 Line */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-black text-[#1A3A5F] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#1F5AAA]" />
                      <span>اختر طريقة الصياغة الآلية الاحترافية (بالذكاء الاصطناعي):</span>
                    </span>
                    <span className="text-[11px] font-bold text-[#5C7085]">
                      صور فقط (مضغوطة JPG) • ممنوع الفيديو نهائياً
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-1.5 bg-[#E6EEF7] rounded-2xl border border-[#C6DCF2]">
                    <button
                      type="button"
                      onClick={() => {
                        setAiCreationMode('voice');
                        setAiDraftError(null);
                      }}
                      className={`py-2.5 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        aiCreationMode === 'voice'
                          ? 'bg-white text-[#1F5AAA] shadow-xs'
                          : 'text-[#475569] hover:text-[#1A3A5F]'
                      }`}
                    >
                      <Mic className="w-4 h-4 shrink-0" />
                      <span>الطريقة الأساسية: بالصوت (دقيقتان)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAiCreationMode('image');
                        setAiDraftError(null);
                      }}
                      className={`py-2.5 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        aiCreationMode === 'image'
                          ? 'bg-white text-[#1F5AAA] shadow-xs'
                          : 'text-[#475569] hover:text-[#1A3A5F]'
                      }`}
                    >
                      <Camera className="w-4 h-4 shrink-0" />
                      <span>الطريقة الثانية: صورة + سطر واحد</span>
                    </button>
                  </div>

                  {/* VOICE INPUT PANEL (Primary) */}
                  {aiCreationMode === 'voice' && (
                    <div className="p-4 sm:p-5 rounded-2xl border-2 border-[#9BBEDF] bg-[#F4F8FC] text-center space-y-3">
                      <div className="flex flex-col items-center gap-2">
                        {!isRecording ? (
                          <button
                            type="button"
                            disabled={isDraftingReport}
                            onClick={handleStartVoiceRecording}
                            className="px-6 py-3 rounded-2xl bg-[#1F5AAA] hover:bg-[#194B91] disabled:opacity-50 text-white text-xs sm:text-sm font-black shadow-md border border-[#194B91] flex items-center gap-2 cursor-pointer transition active:scale-95"
                          >
                            <Mic className="w-5 h-5" />
                            <span>
                              {isDraftingReport
                                ? 'جاري تحويل الصوت وصياغة التقرير...'
                                : hasAiDraftReady && actInputType === 'صوت'
                                ? 'إعادة التسجيل الصوتي بالميكروفون'
                                : 'اضغط للتحدث وتسجيل التقرير بالصوت'}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleStopVoiceRecording}
                            className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-black shadow-md border border-rose-700 flex items-center gap-2.5 cursor-pointer animate-pulse"
                          >
                            <Square className="w-4 h-4 fill-current" />
                            <span>
                              إيقاف التسجيل وصياغة التقرير ({formatMmSs(recordingSeconds)} / 02:00)
                            </span>
                          </button>
                        )}
                        <p className="text-[11px] font-semibold text-[#5C7085] max-w-md">
                          تحدث بالعامية بطبيعتك (حتى دقيقتين كحد أقصى) — سيتم حفظ الصوت في Storage، تحويله لنص، ثم صياغته كتقرير رسمي مرتب ومختصر لمراجعتك.
                        </p>
                      </div>

                      {isDraftingReport && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#C6DCF2] text-[#1F5AAA] text-xs font-black shadow-xs">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري رفع الصوت وتحويله لنص وصياغة التقرير الرسمي عبر Gemini...</span>
                        </div>
                      )}

                      {(recordedAudioPreviewUrl || actAudioUrl) && (
                        <div className="pt-1 max-w-md mx-auto">
                          <div className="flex items-center justify-center gap-1.5 text-[11px] font-black text-[#1A3A5F] mb-1">
                            <Volume2 className="w-3.5 h-3.5 text-[#1F5AAA]" />
                            <span>التسجيل الصوتي للمشرف:</span>
                          </div>
                          <audio
                            controls
                            src={recordedAudioPreviewUrl || actAudioUrl}
                            className="w-full h-9"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hidden Photo Inputs (shared across Voice optional photos & Image+1-line) */}
                  <input
                    ref={actCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleActivityImagesPick}
                    className="hidden"
                  />
                  <input
                    ref={actGalleryRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleActivityImagesPick}
                    className="hidden"
                  />

                  {/* Photos Uploader Box (Required in Image+1-line mode, optional in Voice mode) */}
                  <div className="p-4 rounded-2xl border-2 border-dashed border-[#9BBEDF] bg-[#F4F8FC] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-black text-[#1A3A5F]">
                          {aiCreationMode === 'image'
                            ? `صور ${actCategory} (مطلوبة للطريقة الثانية — حتى 3 صور)`
                            : `صور إضافية مرفقة لـ ${actCategory} (اختياري — حتى 3 صور)`}
                        </p>
                        <p className="text-[11px] font-semibold text-[#5C7085]">
                          {actImages.length} / 3 صور مرفقة • ضغط تلقائي JPG حتى 1280px (بدون فيديو)
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={actImages.length >= 3}
                          onClick={() => actCameraRef.current?.click()}
                          className="px-3 py-2 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>التقاط صورة</span>
                        </button>
                        <button
                          type="button"
                          disabled={actImages.length >= 3}
                          onClick={() => actGalleryRef.current?.click()}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-[#EEF5FC] disabled:opacity-50 text-[#1F5AAA] border border-[#C6DCF2] text-xs font-black flex items-center gap-1.5 cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>اختيار من المعرض</span>
                        </button>
                      </div>
                    </div>

                    {actImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2.5 pt-1">
                        {actImages.map((imgUrl, idx) => (
                          <div
                            key={idx}
                            className="relative rounded-xl overflow-hidden border border-[#DCE7F3] bg-white aspect-video"
                          >
                            <img
                              src={imgUrl}
                              alt={`صورة ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setActImages((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center text-xs font-black shadow-sm cursor-pointer"
                              title="حذف الصورة"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ONE-LINE NOTE + GENERATE BUTTON (Image + 1-Line mode) */}
                    {aiCreationMode === 'image' && (
                      <div className="pt-2 border-t border-[#C6DCF2] space-y-2.5">
                        <div>
                          <label className="block text-xs font-black text-[#1A3A5F] mb-1">
                            اكتب سطراً واحداً فقط عن الصورة:
                          </label>
                          <input
                            type="text"
                            value={oneLineNote}
                            onChange={(e) => setOneLineNote(e.target.value)}
                            placeholder="مثال: تكريم طلاب الصف الثامن المتفوقين في الإذاعة الصباحية..."
                            className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs sm:text-sm font-semibold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={isDraftingReport || actImages.length === 0 || !oneLineNote.trim()}
                            onClick={handleDraftFromImageAndOneLine}
                            className="px-5 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4" />
                            <span>
                              {isDraftingReport
                                ? 'جاري صياغة التقرير من الصورة...'
                                : 'صياغة الوصف الكامل بالذكاء الاصطناعي'}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {aiDraftError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{aiDraftError}</span>
                    </div>
                  )}
                </div>

                {/* MANDATORY SUPERVISOR REVIEW BOX (Cannot send without reviewing draft) */}
                {hasAiDraftReady ? (
                  <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-400 bg-emerald-50/40 space-y-3 animate-in fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-black text-[#1A3A5F] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        <span>مراجعة المشرف للتقرير المقترح من Gemini (إلزامي قبل الإرسال)</span>
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full bg-white border border-[#C6DCF2] text-[#1F5AAA] text-[11px] font-black">
                        نوع الإدخال: {actInputType}
                      </span>
                    </div>

                    {actOriginalText && (
                      <div className="p-3 rounded-xl bg-white border border-[#DCE7F3] space-y-1">
                        <span className="text-[11px] font-black text-[#5C7085] block">
                          النص الأصلي للمشرف ({actInputType === 'صوت' ? 'ما نطقه المشرف' : 'السطر المرفق مع الصورة'}):
                        </span>
                        <p className="text-xs font-semibold text-[#1A3A5F] leading-relaxed">
                          {actOriginalText}
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-[#1A3A5F] mb-1">
                        عنوان ({actCategory} - {actSubType}) — قابل للتعديل:
                      </label>
                      <input
                        type="text"
                        value={actTitle}
                        onChange={(e) => setActTitle(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs sm:text-sm font-black text-[#1A3A5F] focus:outline-[#1F5AAA]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#1A3A5F] mb-1">
                        الصياغة الرسمية المقترحة من Gemini — راجع وعدّل قبل الإرسال:
                      </label>
                      <textarea
                        rows={4}
                        value={actDetails}
                        onChange={(e) => setActDetails(e.target.value)}
                        className="w-full p-3 rounded-xl border border-[#DCE7F3] bg-white text-xs sm:text-sm font-medium text-[#1A3A5F] focus:outline-[#1F5AAA]"
                        required
                      />
                    </div>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-emerald-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasReviewedDraft}
                        onChange={(e) => setHasReviewedDraft(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#1F5AAA] shrink-0 cursor-pointer"
                      />
                      <span className="text-xs font-black text-[#1A3A5F]">
                        أؤكد أنني راجعت التقرير المقترح من Gemini وقمت بالتعديلات اللازمة قبل إرساله إلى مدير المدرسة للاعتماد.
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      لتوليد التقرير ومراجعته: سجل صوتك بالميكروفون (حتى دقيقتين) أو أرفق صورة واكتب سطراً واحداً، ثم اضغط صياغة ليظهر لك مربع المراجعة والتعديل قبل الإرسال.
                    </span>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={
                      isSavingActivity ||
                      !hasAiDraftReady ||
                      !hasReviewedDraft ||
                      !actTitle.trim() ||
                      !actDetails.trim()
                    }
                    className="px-6 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm border border-[#194B91] flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {isSavingActivity
                        ? 'جاري الإرسال...'
                        : editingActivityId
                        ? 'حفظ التعديل وإعادة الإرسال إلى المدير'
                        : 'إرسال للاعتماد'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* Activities List with Color-Coded Status Frames */}
            <div className="space-y-3">
              <h3 className="text-sm font-black text-[#1A3A5F]">
                السجلات المرفوعة ({selectedActivityBranch}) — {filteredActivities.length}
              </h3>

              {filteredActivities.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-[#DCE7F3] text-center text-xs sm:text-sm font-bold text-[#5C7085]">
                  لا توجد سجلات في تصنيف ({selectedActivityBranch}) بعد.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredActivities.map((act) => {
                    const bucket = normalizeCategoryBucket(act.category);
                    const BranchIcon = getActivityBranchIcon(act.category, act.subType);
                    const statusStyle = getApprovalBadgeAndFrame(act.approvalStatus || 'pending');
                    const imgs = Array.isArray(act.images) ? act.images : [];
                    return (
                      <div
                        key={act.id}
                        className={`rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col justify-between gap-3 ${statusStyle.frame}`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${statusStyle.badge}`}>
                                {statusStyle.label}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                                <BranchIcon className="w-3 h-3" />
                                <span>{bucket}</span>
                              </span>
                              {(act.subType || (act.category !== bucket && act.category)) && (
                                <span className="px-2 py-0.5 rounded-full bg-white text-[#1A3A5F] border border-[#DCE7F3] text-[11px] font-bold">
                                  {act.subType || act.category}
                                </span>
                              )}
                              {act.inputType && (
                                <span className="px-2 py-0.5 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[10px] font-black">
                                  إدخال: {act.inputType}
                                </span>
                              )}
                            </div>

                            <span className="text-[11px] font-bold text-[#5C7085] tabular-nums">
                              {act.activityDate} •{' '}
                              {act.targetGrade === 'الكل' || !act.targetGrade
                                ? 'جميع الصفوف'
                                : getGradeLabelAr(act.targetGrade)}
                              {act.targetClass && act.targetClass !== 'الكل'
                                ? ` (فصل ${act.targetClass})`
                                : ''}
                            </span>
                          </div>

                          <h4 className="font-black text-sm text-[#1A3A5F]">{act.title}</h4>
                          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                            {act.formalText || act.details}
                          </p>

                          {act.audioUrl && (
                            <div className="pt-1">
                              <audio controls src={act.audioUrl} className="w-full h-8" />
                            </div>
                          )}

                          {act.originalText && act.originalText !== (act.formalText || act.details) && (
                            <div className="p-2 rounded-xl bg-white/80 border border-[#DCE7F3] text-[11px] text-[#5C7085]">
                              <span className="font-black text-[#1A3A5F]">النص الأصلي: </span>
                              <span>{act.originalText}</span>
                            </div>
                          )}

                          {imgs.length > 0 && (
                            <div
                              className={`grid gap-2 pt-1 ${
                                imgs.length === 1
                                  ? 'grid-cols-1 max-w-xs'
                                  : imgs.length === 2
                                  ? 'grid-cols-2'
                                  : 'grid-cols-3'
                              }`}
                            >
                              {imgs.map((imgUrl, idx) => (
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
                                </button>
                              ))}
                            </div>
                          )}

                          {act.principalNote && (
                            <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200 text-xs font-bold text-[#1A3A5F]">
                              ملاحظة المدير: {act.principalNote}
                            </div>
                          )}
                        </div>

                        <div className="pt-2.5 border-t border-black/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5C7085] font-semibold">
                          <span>بواسطة: {act.createdBy}</span>
                          <div className="flex items-center gap-3">
                            {act.approvalStatus === 'revision_requested' && (
                              <button
                                type="button"
                                onClick={() => handleStartEditActivity(act)}
                                className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-black flex items-center gap-1 cursor-pointer shadow-2xs"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>تعديل وإعادة الإرسال</span>
                              </button>
                            )}
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: الحضور والغياب (تصوير -> قراءة Gemini كروت بارزة -> إرسال للمدير للاعتماد) */}
        {/* =================================================================== */}
        {activeTab === 'attendance' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DCE7F3] shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#1A3A5F] flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-[#1F5AAA]" />
                    <span>
                      {editingAttendanceId
                        ? 'تعديل كشف الحضور والغياب وإعادة إرساله للاعتماد'
                        : 'تسجيل الحضور والغياب لكل صف بتصوير الكشف'}
                    </span>
                  </h2>
                  <p className="text-xs text-[#5C7085] font-semibold mt-0.5">
                    يقرأ Gemini الكشف ويعرضه ككروت بارزة (حاضر / غائب بعذر / غائب بدون عذر / متأخر) ثم يُرسل لمدير المدرسة للاعتماد ويظهر في بوابة المشرف والمدير وحساب الطالب الخاص فقط
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
                  يُرسل للمدير للاعتماد
                </span>
              </div>

              {editingAttendanceId && (
                <div className="p-3 rounded-xl bg-orange-50 border border-orange-300 text-orange-950 text-xs font-bold flex items-center justify-between gap-2">
                  <span>وضع تعديل الكشف المُعاد من مدير المدرسة — راجع الكروت ثم أعد الإرسال للاعتماد.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAttendanceId(null);
                      setAttEntries([]);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-orange-300 text-orange-800 font-black cursor-pointer"
                  >
                    إلغاء التعديل
                  </button>
                </div>
              )}

              {/* Grade, Class Number, Date Selection (Independent per Grade/Class) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">الصف الدراسي المستقل:</label>
                  <select
                    value={attGrade}
                    disabled={Boolean(editingAttendanceId)}
                    onChange={(e) => setAttGrade(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-[#F4F8FC] text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] disabled:opacity-60"
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
                    disabled={Boolean(editingAttendanceId)}
                    onChange={(e) => setAttClassNumber(e.target.value)}
                    placeholder="مثال: 1 أو أ"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] disabled:opacity-60"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1A3A5F] mb-1">التاريخ:</label>
                  <input
                    type="date"
                    value={attDate}
                    disabled={Boolean(editingAttendanceId)}
                    onChange={(e) => setAttDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#DCE7F3] bg-white text-xs font-bold text-[#1A3A5F] focus:outline-[#1F5AAA] disabled:opacity-60"
                    required
                  />
                </div>
              </div>

              {/* Duplicate Day Lock Warning */}
              {attendanceAlreadyExistsToday && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    تم إرسال كشف حضور وغياب {getGradeLabelAr(attGrade)} (فصل {attClassNumber || '1'}) بتاريخ {attDate} مسبقاً. لا يمكن التسجيل مرتين لنفس الفصل في نفس اليوم.
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
                        <span>إعادة التصوير بالكاميرا</span>
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
                      افتح الكاميرا وصوّر كشف الحضور والغياب الورقي للصف المحدد
                    </p>
                    <p className="text-[11px] text-[#5C7085] font-semibold">
                      سيقوم Gemini باستقراء الأسماء وعكسها ككروت بارزة (حاضر / غائب بعذر / غائب بدون عذر / متأخر) لمراجعتها وإرسالها للمدير
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => attCameraRef.current?.click()}
                        disabled={isParsingAttendance || attendanceAlreadyExistsToday}
                        className="px-4 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        <span>فتح الكاميرا وتصوير الكشف</span>
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
                        <span>إضافة طالب يدوياً</span>
                      </button>
                    </div>
                  </div>
                )}

                {isParsingAttendance && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-[#C6DCF2] text-[#1F5AAA] text-xs font-black shadow-xs">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري تحليل الكشف وعكسه في كروت بارزة عبر Gemini...</span>
                  </div>
                )}

                {attParseError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{attParseError}</span>
                  </div>
                )}
              </div>

              {/* Editable Prominent Cards Review Grid (كروت بارزة) */}
              {attEntries.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-[#1A3A5F]">
                      مراجعة كروت الطلاب المقترحة ({attEntries.length} طالب)
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                        حاضر: {presentCount}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-sky-50 text-[#1F5AAA] border border-[#C6DCF2] tabular-nums">
                        غائب بعذر: {absentExcusedCount}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 tabular-nums">
                        غائب بدون عذر: {absentUnexcusedCount}
                      </span>
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 tabular-nums">
                        متأخر: {lateCount}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[540px] overflow-y-auto pr-0.5 p-0.5">
                    {attEntries.map((entry, idx) => {
                      const theme = getAttendanceCardTheme(entry.status);
                      return (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-2xl border-2 shadow-xs flex flex-col justify-between gap-2.5 transition ${theme.card}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black text-[#1A3A5F] bg-white/85 px-2 py-0.5 rounded-lg border border-white">
                              كارت طالب #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAttEntries((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 rounded-lg bg-white/80 text-rose-600 hover:bg-rose-100 cursor-pointer"
                              title="حذف الكارت"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

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
                            className="w-full px-3 py-2 rounded-xl border border-[#DCE7F3] bg-white text-xs sm:text-sm font-black text-[#1A3A5F] focus:outline-[#1F5AAA]"
                          />

                          <div className="grid grid-cols-2 gap-1.5">
                            {(
                              ['حاضر', 'غائب بعذر', 'غائب بدون عذر', 'متأخر'] as AttendanceStatus[]
                            ).map((st) => {
                              const active =
                                entry.status === st ||
                                (st === 'غائب بدون عذر' && entry.status === 'غائب');
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  onClick={() =>
                                    setAttEntries((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, status: st } : it))
                                    )
                                  }
                                  className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition cursor-pointer border text-center ${
                                    active
                                      ? st === 'حاضر'
                                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                                        : st === 'غائب بعذر'
                                        ? 'bg-[#1F5AAA] text-white border-[#194B91] shadow-2xs'
                                        : st === 'متأخر'
                                        ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                        : 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                                      : 'bg-white text-[#5C7085] border-[#DCE7F3] hover:bg-[#EEF5FC]'
                                  }`}
                                >
                                  {st}
                                </button>
                              );
                            })}
                          </div>

                          {(entry.status === 'غائب بعذر' ||
                            entry.status === 'متأخر' ||
                            Boolean(entry.note)) && (
                            <input
                              type="text"
                              value={entry.note || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setAttEntries((prev) =>
                                  prev.map((it, i) => (i === idx ? { ...it, note: val } : it))
                                );
                              }}
                              placeholder={
                                entry.status === 'غائب بعذر'
                                  ? 'سبب العذر (اختياري)...'
                                  : 'ملاحظة (اختياري)...'
                              }
                              className="w-full px-2.5 py-1.5 rounded-xl border border-[#DCE7F3] bg-white/95 text-[11px] font-semibold text-[#1A3A5F] focus:outline-[#1F5AAA]"
                            />
                          )}
                        </div>
                      );
                    })}
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
                      <span>إضافة كارت طالب آخر</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAttendance}
                      disabled={isSavingAttendance || attendanceAlreadyExistsToday}
                      className="px-6 py-2.5 rounded-xl bg-[#1F5AAA] hover:bg-[#194B91] text-white text-xs sm:text-sm font-black shadow-sm border border-[#194B91] flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        {isSavingAttendance
                          ? 'جاري الإرسال...'
                          : editingAttendanceId
                          ? 'إعادة إرسال الكشف إلى المدير للاعتماد'
                          : `إرسال إلى مدير المدرسة للاعتماد (${getGradeLabelAr(attGrade)} - فصل ${attClassNumber})`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Saved / Submitted Attendance Logs with Color-Coded Statuses */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#DCE7F3] shadow-sm space-y-3">
              <h3 className="text-sm sm:text-base font-black text-[#1A3A5F]">
                كشوفات الحضور والغياب المرفوعة ({attendanceRecords.length})
              </h3>
              {attendanceRecords.length === 0 ? (
                <p className="text-xs text-[#5C7085] font-bold text-center py-6">
                  لم يتم رفع أي كشوفات حضور وغياب بعد.
                </p>
              ) : (
                <div className="space-y-3">
                  {attendanceRecords.map((rec) => {
                    const isOpen = expandedAttId === rec.id;
                    const statusStyle = getApprovalBadgeAndFrame(rec.approvalStatus || 'pending');
                    const recExcused =
                      rec.absentExcusedCount ??
                      rec.entries.filter((e) => e.status === 'غائب بعذر').length;
                    const recUnexcused =
                      rec.absentUnexcusedCount ??
                      rec.entries.filter((e) => e.status === 'غائب بدون عذر' || e.status === 'غائب').length;
                    return (
                      <div key={rec.id} className={`rounded-2xl p-4 space-y-2.5 ${statusStyle.frame}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${statusStyle.badge}`}>
                                {statusStyle.label}
                              </span>
                              <span className="font-black text-xs sm:text-sm text-[#1A3A5F]">
                                {rec.gradeLabel} — فصل {rec.classNumber} • {rec.date}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-[#5C7085]">
                              سجل بواسطة: {rec.recordedBy} ({rec.createdAtFormatted})
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 text-[11px] font-black tabular-nums">
                              حاضر: {rec.presentCount}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black tabular-nums">
                              بعذر: {recExcused}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white text-rose-800 border border-rose-200 text-[11px] font-black tabular-nums">
                              بدون عذر: {recUnexcused}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-white text-amber-900 border border-amber-200 text-[11px] font-black tabular-nums">
                              متأخر: {rec.lateCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedAttId(isOpen ? null : rec.id)}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#DCE7F3] text-[#1F5AAA] text-[11px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isOpen ? 'إخفاء الكروت' : 'عرض الكروت'}</span>
                              {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {rec.principalNote && (
                          <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200 text-xs font-bold text-[#1A3A5F]">
                            ملاحظة المدير: {rec.principalNote}
                          </div>
                        )}

                        {rec.approvalStatus === 'revision_requested' && (
                          <div>
                            <button
                              type="button"
                              onClick={() => handleStartEditAttendance(rec)}
                              className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>تعديل الكشف وإعادة الإرسال للاعتماد</span>
                            </button>
                          </div>
                        )}

                        {isOpen && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-black/10">
                            {rec.entries.map((e, idx) => {
                              const cTheme = getAttendanceCardTheme(e.status);
                              return (
                                <div
                                  key={idx}
                                  className={`flex flex-col gap-1 px-3 py-2.5 rounded-xl border text-xs ${cTheme.card}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-black text-[#1A3A5F] truncate">
                                      {idx + 1}. {e.studentName}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black shrink-0 ${cTheme.pill}`}>
                                      {cTheme.label}
                                    </span>
                                  </div>
                                  {e.note && (
                                    <span className="text-[11px] font-semibold text-[#1A3A5F]/80">
                                      ملاحظة: {e.note}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
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

      {/* Photo Lightbox */}
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
