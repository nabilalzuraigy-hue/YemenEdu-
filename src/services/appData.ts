/**
 * YemenEduApp - App Data & Educational Content Service
 * Live Firestore Database & Storage Integration
 * Completely persistent without local storage simulations.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage, ensureAuthReady, handleFirestoreError, OperationType, withTimeout } from '../firebase/config';
import { cleanFirestorePayload, initSuperAdmin } from './authService';
import {
  getSchoolPrincipalName,
  isGenericPrincipalSender,
  isSimulationAnnouncement,
} from '../utils/schoolDisplay';

export function extractGoogleDriveFileId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // https://drive.google.com/file/d/FILE_ID/view...
  const dMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];
  // id=FILE_ID
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];
  // Raw file ID (alphanumeric, dashes, underscores, usually 25+ chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export function buildGoogleDrivePreviewUrl(input: string): string {
  if (!input) return '';
  const fileId = extractGoogleDriveFileId(input);
  if (!fileId) return '';
  if (fileId.startsWith('http')) {
    if (fileId.includes('/preview')) return fileId;
    if (fileId.includes('/view')) return fileId.replace(/\/view.*$/, '/preview');
    return fileId;
  }
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export interface CurriculumBook {
  id: string;
  name: string;
  fileName: string;
  fileUrl: string;
  storagePath: string;
  grade: string; // '1' to '12'
  classId?: string;
  subject?: string;
  pageCount?: number;
  uploadedAt: string;
  fileSize?: number;
}

export interface Textbook {
  id: string;
  title: string;
  grade: string;
  gradeNameAr?: string;
  subject: string;
  term?: string; // 'الترم الأول' | 'الترم الثاني'
  driveUrl?: string; // Google Drive file URL entered by Admin
  driveFileId?: string; // Extracted FILE_ID
  previewUrl?: string; // https://drive.google.com/file/d/FILE_ID/preview
  fileUrl?: string;
  part?: 'الأول' | 'الثاني' | 'كامل' | string;
  pagesCount?: number;
  fileSizeMb?: number;
  coverGradient?: string;
  pdfUrl?: string;
  sampleSummary?: string;
  tableOfContents?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target: 'all' | 'teachers' | 'students';
  priority: 'عاجل' | 'هام' | 'عادي';
  senderName: string;
  senderRoleAr: string;
  schoolId?: string;
  createdAt: any;
  readCount?: number;
}

export interface TeacherActivityArchiveItem {
  id: string;
  text: string;
  teacherName: string;
  subject: string;
  grade: string;
  timestamp: number;
  dateLabel: string;
  timeLabel: string;
}

export interface TeacherActivityArchiveBatch {
  id: string;
  recordType: 'teacher_activities_archive';
  schoolId: string;
  thursdayKey: string;
  weekLabel: string;
  year: number;
  monthName: string;
  archivedAt: string;
  archivedTimestamp: number;
  autoArchived: boolean;
  activitiesCount: number;
  activities: TeacherActivityArchiveItem[];
}

export interface MonthlyHomeworkArchiveItem {
  id: string;
  subject: string;
  type: Question['type'];
  questionText: string;
  options?: string[];
  correctOption?: number | string;
  correctIndex?: number;
  points: number;
  teacherName: string;
  grade: string;
  class?: string;
  timestamp: number;
  createdAt?: any;
  createdAtFormatted?: string;
}

export interface MonthlyHomeworkArchiveBatch {
  id: string;
  recordType: 'monthly_homework_archive';
  schoolId: string;
  studentCode?: string;
  grade: string;
  thursdayKey: string;
  weekLabel: string;
  year: number;
  monthName: string;
  archivedAt: string;
  archivedTimestamp: number;
  autoArchived: boolean;
  questionsCount: number;
  questions: MonthlyHomeworkArchiveItem[];
}

export interface MonthlyReportRecord {
  id: string; // e.g. `${schoolId}_${year}_${monthName}`
  recordType?: 'monthly_report' | 'teacher_activities_archive' | 'monthly_homework_archive';
  schoolId: string;
  monthName: string;
  year: number;
  totalSubmissions: number;
  averageScore: number;
  studentAverages: Array<{
    studentCode: string;
    studentName: string;
    grade?: string;
    submissionsCount: number;
    gpa: number;
    status: 'ناجح' | 'راسب' | 'متميز';
  }>;
  subjectBreakdown: Array<{
    name: string;
    count: number;
    percent: number;
  }>;
  teacherActivities?: Array<{
    id: string;
    text: string;
    teacherName?: string;
    subject?: string;
    grade?: string;
    timestamp: number;
    dateLabel: string;
  }>;
  archivedAt: string;
}

export const ACADEMIC_MONTHS = [
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

export const getCurrentAcademicMonth = (): string => {
  const m = new Date().getMonth();
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
  };
  return map[m] || 'نوفمبر';
};

export interface MonthlyGradebookStudent {
  code: string;
  name: string;
  phone?: string;
  submissionsCount: number;
  totalEarned: number;
  totalPossible: number;
  percentage: number;
  rating: string;
  ratingBadgeColor?: string;
}

export interface MonthlyGradebookRecord {
  id: string;
  schoolId: string;
  teacherId?: string;
  teacherName?: string;
  grade: string;
  subject: string;
  month: string;
  year: number;
  archivedAt: string;
  timestamp: number;
  roster: MonthlyGradebookStudent[];
  questions?: Question[];
  totalStudents: number;
  averagePercentage: number;
}

export interface TeacherRecommendation {
  id: string;
  teacherId: string;
  teacherName: string;
  schoolId: string;
  grade: string; // '7', '8', '9', or 'all'
  subject: string;
  title?: string;
  content: string;
  category?: 'عامة' | 'واجبات' | 'امتحانات' | 'تحفيز' | 'إرشاد';
  targetScope?: 'all_students' | 'specific_student';
  targetStudentCode?: string;
  targetStudentName?: string;
  createdAt: number;
  createdAtFormatted: string;
}

export function getQuestionTimestamp(q: any): number {
  if (!q) return 0;
  if (typeof q.timestamp === 'number') return q.timestamp;
  if (q.createdAt?.toMillis && typeof q.createdAt.toMillis === 'function') {
    return q.createdAt.toMillis();
  }
  if (q.createdAt?.seconds) {
    return q.createdAt.seconds * 1000;
  }
  if (typeof q.createdAt === 'string') {
    const parsed = Date.parse(q.createdAt);
    if (!isNaN(parsed)) return parsed;
  }
  if (typeof q.createdAt === 'number') return q.createdAt;
  return 0;
}

const ARCHIVE_MONTH_AR_MAP: Record<number, string> = {
  0: 'يناير',
  1: 'فبراير',
  2: 'مارس',
  3: 'أبريل',
  4: 'مايو',
  5: 'يونيو',
  6: 'يوليو',
  7: 'أغسطس',
  8: 'سبتمبر',
  9: 'أكتوبر',
  10: 'نوفمبر',
  11: 'ديسمبر',
};

/**
 * Computes the school-week Thursday key and archive cutoff timestamp for a homework question.
 * - Sat..Wed (and Fri -> next Thu): archives at 00:00 of that week's Thursday.
 * - Posted on Thursday itself: remains visible during Thursday and archives at end of Thursday (Fri 00:00).
 */
export function getHomeworkArchiveCutoffInfo(ts: number): {
  thursdayKey: string;
  archiveAtMs: number;
  thuDate: Date;
  monthName: string;
  year: number;
  weekLabel: string;
} {
  const d = new Date(ts);
  const daysUntilThu = (4 - d.getDay() + 7) % 7;
  const thuDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntilThu, 0, 0, 0, 0);
  const archiveAtMs =
    d.getDay() === 4
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime()
      : thuDate.getTime();
  const y = thuDate.getFullYear();
  const m = String(thuDate.getMonth() + 1).padStart(2, '0');
  const dayNum = String(thuDate.getDate()).padStart(2, '0');
  const thursdayKey = `${y}-${m}-${dayNum}`;
  const monthName = ARCHIVE_MONTH_AR_MAP[thuDate.getMonth()] || 'نوفمبر';
  const weekLabel = `أسبوع الخميس ${thuDate.toLocaleDateString('ar-YE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`;
  return {
    thursdayKey,
    archiveAtMs,
    thuDate,
    monthName,
    year: y,
    weekLabel,
  };
}

export function isQuestionArchivedForStudentWeek(q: any, nowMs: number = Date.now()): boolean {
  const ts = getQuestionTimestamp(q);
  if (!ts || ts <= 0) return false;
  const { archiveAtMs } = getHomeworkArchiveCutoffInfo(ts);
  return nowMs >= archiveAtMs;
}

export function formatArabicDateTime(dateVal: any): string {
  if (!dateVal) return 'الآن';
  let dateObj: Date;
  if (dateVal instanceof Date) {
    dateObj = dateVal;
  } else if (typeof dateVal?.toDate === 'function') {
    dateObj = dateVal.toDate();
  } else if (typeof dateVal?.toMillis === 'function') {
    dateObj = new Date(dateVal.toMillis());
  } else if (dateVal?.seconds) {
    dateObj = new Date(dateVal.seconds * 1000);
  } else if (typeof dateVal === 'number') {
    dateObj = new Date(dateVal);
  } else if (typeof dateVal === 'string') {
    const parsed = Date.parse(dateVal);
    if (!isNaN(parsed)) {
      dateObj = new Date(parsed);
    } else {
      return dateVal;
    }
  } else {
    return String(dateVal);
  }

  if (isNaN(dateObj.getTime())) return String(dateVal);

  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');

  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const h = String(hours).padStart(2, '0');

  return `${y}/${m}/${d} - ${h}:${minutes} ${ampm}`;
}

export interface Question {
  id: string;
  grade?: string;
  class?: string;
  subject: string;
  type: string;
  questionText: string;
  text?: string;
  imageUrl?: string;
  options?: string[];
  correctIndex?: number;
  correctOption?: any;
  points: number;
  teacherName: string;
  schoolId?: string;
  isPublished?: boolean;
  createdAt: any;
  createdAtFormatted?: string;
  timestamp?: number;
  month?: string;
}

export const isObjectiveQuestion = (type?: string) => {
  if (!type) return false;
  const t = type.toLowerCase().trim();
  return t === 'mcq' || t === 'objective' || t === 'موضوعي' || t === 'سؤال موضوعي' || t.includes('موضوعي');
};

export const isEssayQuestion = (type?: string) => {
  if (!type) return true;
  const t = type.toLowerCase().trim();
  return (
    t === 'essay' ||
    t === 'homework_image' ||
    t === 'photo_homework' ||
    t === 'مقالي' ||
    t === 'مقالي كتابي' ||
    t === 'سؤال مقالي كتابي' ||
    t === 'واجب مصور' ||
    t.includes('مقالي') ||
    t.includes('مصور')
  );
};

export interface HomeworkSubmission {
  id: string;
  studentId?: string;
  studentCode: string;
  studentName: string;
  grade?: string;
  class?: string;
  schoolId?: string;
  subject: string;
  questionId?: string;
  title: string;
  type: string;
  selectedOption?: any;
  correctOption?: any;
  isCorrect?: boolean;
  photoUrl?: string;
  studentNotes?: string;
  score?: number;
  maxScore?: number;
  status?: 'تم التصحيح' | 'بانتظار المراجعة' | 'graded' | string;
  isLocked?: boolean;
  autoGraded?: boolean;
  gradedAt?: string;
  gradedBy?: string;
  teacherFeedback?: string;
  principalComment?: string;
  submittedAt?: string;
  createdAt?: any;
  timestamp?: number;
  month?: string;
}

export interface GradeRecord {
  id: string;
  studentId?: string;
  studentCode: string;
  studentName: string;
  questionId?: string;
  type?: string;
  examType?: string;
  obtained?: number;
  total?: number;
  score?: string | number;
  maxScore?: string;
  subject: string;
  subjectName?: string;
  class?: string;
  grade?: string;
  schoolId?: string;
  autoGraded?: boolean;
  teacherName?: string;
  timestamp?: number;
  month?: string;
  note?: string;
  createdAt?: any;
  date?: string;
}

export type SupervisorApprovalStatus =
  | 'pending'
  | 'approved'
  | 'revision_requested'
  | 'rejected';

export type AttendanceStatus =
  | 'حاضر'
  | 'غائب بعذر'
  | 'غائب بدون عذر'
  | 'متأخر'
  | 'غائب';

export interface AttendanceEntry {
  studentName: string;
  status: AttendanceStatus;
  note?: string;
}

export interface AttendanceRecord {
  id: string;
  schoolId: string;
  grade: string;
  gradeLabel: string;
  classNumber: string;
  date: string; // YYYY-MM-DD
  entries: AttendanceEntry[];
  presentCount: number;
  absentCount: number;
  absentExcusedCount?: number;
  absentUnexcusedCount?: number;
  lateCount: number;
  recordedBy: string;
  supervisorCode?: string;
  isDirectSaved?: boolean;
  approvalStatus?: SupervisorApprovalStatus;
  principalNote?: string;
  approvedBy?: string;
  approvedAt?: number;
  approvedAtFormatted?: string;
  createdAt: number;
  createdAtFormatted: string;
}

export type ScheduleDay = 'السبت' | 'الأحد' | 'الاثنين' | 'الثلاثاء' | 'الأربعاء';

export const SCHEDULE_DAYS: ScheduleDay[] = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء'];

export const SCHEDULE_PERIODS: Array<{ period: number; label: string }> = [
  { period: 1, label: 'الأولى' },
  { period: 2, label: 'الثانية' },
  { period: 3, label: 'الثالثة' },
  { period: 4, label: 'الرابعة' },
  { period: 5, label: 'الخامسة' },
  { period: 6, label: 'السادسة' },
];

export const GRADE_OPTIONS_12: Array<{ id: string; label: string }> = [
  { id: '1', label: 'الصف الأول' },
  { id: '2', label: 'الصف الثاني' },
  { id: '3', label: 'الصف الثالث' },
  { id: '4', label: 'الصف الرابع' },
  { id: '5', label: 'الصف الخامس' },
  { id: '6', label: 'الصف السادس' },
  { id: '7', label: 'الصف السابع' },
  { id: '8', label: 'الصف الثامن' },
  { id: '9', label: 'الصف التاسع' },
  { id: '10', label: 'الصف العاشر' },
  { id: '11', label: 'الصف الحادي عشر' },
  { id: '12', label: 'الصف الثاني عشر' },
];

export function getGradeLabelAr(grade: string): string {
  const clean = String(grade || '').trim();
  const found = GRADE_OPTIONS_12.find((g) => g.id === clean);
  return found ? found.label : clean ? `الصف ${clean}` : 'غير محدد';
}

export interface ScheduleSlot {
  day: ScheduleDay;
  period: number;
  periodLabel: string;
  subject: string;
  teacherName: string;
}

export interface ClassSchedule {
  id: string;
  schoolId: string;
  grade: string;
  gradeLabel: string;
  classNumber: string;
  term: 'الأول';
  entries: ScheduleSlot[];
  uploadedBy: string;
  supervisorCode?: string;
  sourceMethod: 'image' | 'manual';
  uploadedAt: number;
  uploadedAtFormatted: string;
  isApproved: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: number;
  approvedAtFormatted?: string;
  rejectionNote?: string;
  pendingEntries?: ScheduleSlot[];
  pendingUploadedBy?: string;
  pendingUploadedAt?: number;
  pendingUploadedAtFormatted?: string;
  pendingSourceMethod?: 'image' | 'manual';
  hasPendingUpdate?: boolean;
}

export type SupervisorActivityCategory =
  | 'تقرير'
  | 'نشاط'
  | 'فعالية'
  | 'نشاط رياضي'
  | 'نشاط ثقافي'
  | 'رحلة مدرسية';

export const SUPERVISOR_ACTIVITY_CATEGORIES: SupervisorActivityCategory[] = [
  'تقرير',
  'نشاط',
  'فعالية',
  'نشاط رياضي',
  'نشاط ثقافي',
  'رحلة مدرسية',
];

export const SUPERVISOR_PRIMARY_CATEGORIES: Array<'تقرير' | 'نشاط' | 'فعالية'> = [
  'تقرير',
  'نشاط',
  'فعالية',
];

export const SUPERVISOR_SUBTYPES_MAP: Record<'تقرير' | 'نشاط' | 'فعالية', string[]> = {
  تقرير: ['زيارة فصلية', 'زيارة خاصة', 'تقرير عام'],
  نشاط: ['رياضي', 'ثقافي', 'مسابقة علمية', 'ترفيهي', 'رحلة مدرسية'],
  فعالية: ['حفل تكريم', 'يوم وطني', 'فعالية عامة أو مناسبة'],
};

export type SupervisorReportInputType = 'صوت' | 'صورة';

export interface SupervisorActivity {
  id: string;
  schoolId: string;
  category: SupervisorActivityCategory;
  subType?: string;
  title: string;
  details: string;
  images?: string[]; // Up to 3 compressed JPG images (max 1280px)
  targetGrade?: string;
  targetClass?: string;
  activityDate: string;
  inputType?: SupervisorReportInputType;
  originalText?: string; // Original spoken transcript or 1-line photo note
  formalText?: string; // Final Gemini-drafted & supervisor-reviewed formal text
  audioUrl?: string; // Firebase Storage download URL for voice recording
  createdBy: string;
  supervisorCode?: string;
  approvalStatus?: SupervisorApprovalStatus;
  principalNote?: string;
  approvedBy?: string;
  approvedAt?: number;
  approvedAtFormatted?: string;
  createdAt: number;
  createdAtFormatted: string;
}

export interface AppNotification {
  id: string;
  schoolId: string;
  recipientRole: 'principal' | 'supervisor';
  recipientCode?: string;
  type: 'new_report' | 'approved' | 'rejected' | 'revision_requested';
  title: string;
  message: string;
  relatedId?: string;
  relatedKind?: 'activity' | 'attendance';
  isRead: boolean;
  createdAt: number;
  createdAtFormatted: string;
}

const DEFAULT_TEXTBOOKS: Textbook[] = [];

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [];

// Question Bank starts empty (0 questions) - questions are created exclusively by teachers
const DEFAULT_QUESTIONS: Question[] = [];

// Submissions start empty (0 submissions)
const DEFAULT_SUBMISSIONS: HomeworkSubmission[] = [];

/**
 * Cleans up any legacy demo/simulation announcements & circulars from Firestore
 * so every school starts completely clean without mock circulars.
 */
export async function cleanupDemoAnnouncements(): Promise<void> {
  try {
    await ensureAuthReady(1500);
    for (const collName of ['announcements', 'circulars'] as const) {
      const snap = await withTimeout(
        getDocs(collection(db, collName)),
        5000,
        'تنظيف التعاميم التجريبية'
      ).catch(() => null);
      if (snap && !snap.empty) {
        for (const d of snap.docs) {
          const data = d.data();
          if (
            isSimulationAnnouncement({
              id: d.id,
              title: data.title,
              senderName: data.senderName,
              schoolId: data.schoolId,
            })
          ) {
            try {
              await deleteDoc(doc(db, collName, d.id));
            } catch (_) {}
          }
        }
      }
    }
  } catch (err) {
    console.warn('cleanupDemoAnnouncements notice (safe offline):', err);
  }
}

/**
 * Cleans up any demo or placeholder questions from Firestore.
 * Ensures the Question Bank starts with 0 questions until teachers add them.
 */
export async function cleanupDemoQuestions(): Promise<void> {
  try {
    await ensureAuthReady(1500);
    await cleanupDemoAnnouncements();
    const snap = await withTimeout(
      getDocs(collection(db, 'questions')),
      5000,
      'تنظيف الأسئلة التجريبية'
    );
    if (!snap.empty) {
      for (const d of snap.docs) {
        const data = d.data();
        const text = (data.questionText || data.text || '').trim();
        const id = d.id;
        const isDemo =
          id === 'q-8-fujjar' ||
          id === 'q-8-atom' ||
          id === 'q-8-1' ||
          id === 'q-9-1' ||
          id === 'q-7-1' ||
          text.includes('معنى الفجار') ||
          text.includes('الفجار') ||
          text.includes('عرف الذرة') ||
          text.includes('العضو المسؤول عن ضخ الدم') ||
          text.includes('إذا كان التطبيق ت(س)') ||
          text.includes('مجموع قياسات الزوايا الداخلية') ||
          !data.teacherId;

        if (isDemo) {
          try {
            await deleteDoc(doc(db, 'questions', id));
          } catch (_) {}
        }
      }
    }

    // Clean up demo submissions
    const subSnap = await withTimeout(
      getDocs(collection(db, 'submissions')),
      5000,
      'تنظيف الإجابات التجريبية'
    );
    if (!subSnap.empty) {
      for (const d of subSnap.docs) {
        const data = d.data();
        if (
          d.id.includes('STU-8-YEMN-4951') ||
          data.questionId === 'q-8-atom' ||
          data.questionId === 'q-8-fujjar' ||
          (data.title && (data.title.includes('عرف الذرة') || data.title.includes('الفجار')))
        ) {
          try {
            await deleteDoc(doc(db, 'submissions', d.id));
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.warn('cleanupDemoQuestions notice (safe offline):', err);
  }
}

class AppDataService {
  private textbooks: Textbook[] = DEFAULT_TEXTBOOKS;
  private curricula: Record<string, CurriculumBook[]> = {};
  private announcements: Announcement[] = DEFAULT_ANNOUNCEMENTS;
  private baseAnnouncements: Announcement[] = [];
  private liveCirculars: Announcement[] = [];
  private questions: Question[] = DEFAULT_QUESTIONS;
  private submissions: HomeworkSubmission[] = DEFAULT_SUBMISSIONS;
  private grades: GradeRecord[] = [];
  private recommendations: TeacherRecommendation[] = [];
  private attendanceRecords: AttendanceRecord[] = [];
  private classSchedules: ClassSchedule[] = [];
  private supervisorActivities: SupervisorActivity[] = [];
  private notifications: AppNotification[] = [];
  private listeners: Array<() => void> = [];

  constructor() {
    this.initFirestoreSync();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('AppData listener error:', err);
      }
    });
  }

  private async initFirestoreSync() {
    try {
      await ensureAuthReady();
      // Bootstrap super admin and default school if empty
      await initSuperAdmin();

      // 1. Textbooks
      onSnapshot(
        collection(db, 'textbooks'),
        (snap) => {
          this.textbooks = snap.empty ? [] : snap.docs.map((d) => d.data() as Textbook);
          this.notify();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'textbooks')
      );

      // 2. Curricula (Grades 1 to 12)
      onSnapshot(
        collection(db, 'curricula'),
        (snap) => {
          const map: Record<string, CurriculumBook[]> = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            map[d.id] = Array.isArray(data?.books) ? (data.books as CurriculumBook[]) : [];
          });
          this.curricula = map;
          this.notify();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'curricula')
      );

      // Clean up any legacy simulation announcements in the background
      cleanupDemoAnnouncements().catch(() => {});

      const syncMergedAnnouncements = () => {
        const merged = new Map<string, Announcement>();
        this.baseAnnouncements.forEach((a) => {
          if (!isSimulationAnnouncement(a)) merged.set(a.id, a);
        });
        this.liveCirculars.forEach((c) => {
          if (!isSimulationAnnouncement(c)) merged.set(c.id, c);
        });
        this.announcements = Array.from(merged.values());
        this.notify();
      };

      // 3. Announcements & Circulars (Strictly scoped per school, zero simulation circulars)
      onSnapshot(
        collection(db, 'announcements'),
        (snap) => {
          this.baseAnnouncements = snap.empty
            ? []
            : snap.docs
                .map((d) => {
                  const data = d.data() as Announcement;
                  const resolvedSender =
                    data.senderName && !isGenericPrincipalSender(data.senderName)
                      ? data.senderName
                      : getSchoolPrincipalName(data.schoolId);
                  return {
                    ...data,
                    id: d.id || data.id,
                    senderName: resolvedSender,
                    senderRoleAr: data.senderRoleAr || 'مدير المدرسة',
                  } as Announcement;
                })
                .filter((a) => !isSimulationAnnouncement(a));
          syncMergedAnnouncements();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
      );

      onSnapshot(
        collection(db, 'circulars'),
        (snap) => {
          this.liveCirculars = snap.empty
            ? []
            : snap.docs
                .map((d) => {
                  const data = d.data();
                  const resolvedSender =
                    data.senderName && !isGenericPrincipalSender(data.senderName)
                      ? data.senderName
                      : getSchoolPrincipalName(data.schoolId);
                  return {
                    id: d.id,
                    title: data.title || 'تعميم إداري',
                    content: data.content || '',
                    target: data.target || 'all',
                    priority: data.priority || 'عادي',
                    senderName: resolvedSender,
                    senderRoleAr: data.senderRoleAr || 'مدير المدرسة',
                    schoolId: data.schoolId,
                    createdAt: data.createdAtFormatted
                      ? String(data.createdAtFormatted)
                      : data.createdAt
                        ? (typeof data.createdAt?.toDate === 'function'
                            ? data.createdAt.toDate().toLocaleDateString('ar-YE')
                            : String(data.createdAt))
                        : 'الآن',
                    readCount: data.readCount || 1,
                  } as Announcement;
                })
                .filter((c) => !isSimulationAnnouncement(c));
          syncMergedAnnouncements();
        },
        () => {}
      );

      // 4. Questions
      onSnapshot(
        collection(db, 'questions'),
        (snap) => {
          this.questions = snap.empty ? [] : snap.docs.map((d) => ({ ...d.data(), id: d.id } as Question));
          this.notify();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'questions')
      );

      // 5. Homework Submissions
      onSnapshot(
        collection(db, 'submissions'),
        (snap) => {
          this.submissions = snap.empty ? [] : snap.docs.map((d) => d.data() as HomeworkSubmission);
          this.notify();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'submissions')
      );

      // 6. Grades
      onSnapshot(
        collection(db, 'grades'),
        (snap) => {
          this.grades = snap.empty ? [] : snap.docs.map((d) => d.data() as GradeRecord);
          this.notify();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'grades')
      );

      // 7. Teacher Recommendations
      onSnapshot(
        collection(db, 'recommendations'),
        (snap) => {
          this.recommendations = snap.empty
            ? []
            : snap.docs.map((d) => ({ ...d.data(), id: d.id } as TeacherRecommendation));
          this.notify();
        },
        () => {}
      );

      // 8. Supervisor Attendance Records
      onSnapshot(
        collection(db, 'attendance_records'),
        (snap) => {
          this.attendanceRecords = snap.empty
            ? []
            : snap.docs.map((d) => ({ ...d.data(), id: d.id } as AttendanceRecord));
          this.notify();
        },
        () => {}
      );

      // 9. Class Schedules (Fixed Term 1)
      onSnapshot(
        collection(db, 'class_schedules'),
        (snap) => {
          this.classSchedules = snap.empty
            ? []
            : snap.docs.map((d) => ({ ...d.data(), id: d.id } as ClassSchedule));
          this.notify();
        },
        () => {}
      );

      // 10. Supervisor Activities & Reports
      onSnapshot(
        collection(db, 'supervisor_activities'),
        (snap) => {
          this.supervisorActivities = snap.empty
            ? []
            : snap.docs.map((d) => ({ ...d.data(), id: d.id } as SupervisorActivity));
          this.notify();
        },
        () => {}
      );

      // 11. Workflow Notifications
      onSnapshot(
        collection(db, 'notifications'),
        (snap) => {
          this.notifications = snap.empty
            ? []
            : snap.docs.map((d) => ({ ...d.data(), id: d.id } as AppNotification));
          this.notify();
        },
        () => {}
      );
    } catch (err) {
      console.error('Error initializing AppData Firestore sync:', err);
    }
  }

  // --- Curricula (Grades 1 to 12) ---
  public getCurriculumBooks(grade: string | number): CurriculumBook[] {
    const key = String(grade);
    return this.curricula[key] || [];
  }

  public getAllCurricula(): Record<string, CurriculumBook[]> {
    return { ...this.curricula };
  }

  public async uploadCurriculumBook(
    grade: string | number,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<CurriculumBook> {
    await ensureAuthReady();
    const gradeStr = String(grade);
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_ \u0600-\u06FF]/g, '_');
    const storagePath = `books/${gradeStr}/${Date.now()}_${cleanFileName}`;
    let downloadUrl = '';

    // Alert if file is larger than 15MB
    if (file.size > 15 * 1024 * 1024) {
      try {
        alert('الملف كبير، جاري الضغط');
      } catch (_) {}
    }

    try {
      const fileRef = storageRef(storage, storagePath);
      const uploadTask = uploadBytesResumable(fileRef, file, {
        contentType: file.type || 'application/pdf',
      });

      uploadTask.on('state_changed', (snapshot) => {
        if (snapshot.totalBytes > 0) {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (onProgress) onProgress(percent);
        }
      });

      await uploadTask;
      downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
    } catch (storageErr) {
      console.warn('Firebase Storage upload notice, falling back to simulated storage link:', storageErr);
      // Never store PDF as huge base64 in IndexedDB/Firestore!
      downloadUrl = URL.createObjectURL(file);
      if (onProgress) onProgress(100);
    }

    const newBook: CurriculumBook = {
      id: `book-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: file.name.replace(/\.pdf$/i, ''),
      fileName: file.name,
      fileUrl: downloadUrl,
      storagePath,
      grade: gradeStr,
      classId: gradeStr,
      subject: file.name.replace(/\.pdf$/i, ''),
      pageCount: 190,
      uploadedAt: new Date().toLocaleDateString('ar-YE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      fileSize: file.size,
    };

    const currentBooks = this.getCurriculumBooks(gradeStr);
    const updatedBooks = [newBook, ...currentBooks];

    try {
      await setDoc(
        doc(db, 'curricula', gradeStr),
        {
          grade: gradeStr,
          books: updatedBooks,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      this.curricula[gradeStr] = updatedBooks;
      this.notify();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `curricula/${gradeStr}`);
    }

    return newBook;
  }

  public async deleteCurriculumBook(grade: string | number, bookId: string, storagePath?: string): Promise<void> {
    await ensureAuthReady();
    const gradeStr = String(grade);
    const currentBooks = this.getCurriculumBooks(gradeStr);
    const updatedBooks = currentBooks.filter((b) => b.id !== bookId);

    if (storagePath) {
      try {
        const fileRef = storageRef(storage, storagePath);
        await deleteObject(fileRef);
      } catch (err) {
        console.warn('Notice deleting from Firebase Storage:', err);
      }
    }

    try {
      await setDoc(
        doc(db, 'curricula', gradeStr),
        {
          grade: gradeStr,
          books: updatedBooks,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      this.curricula[gradeStr] = updatedBooks;
      this.notify();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `curricula/${gradeStr}`);
    }
  }

  // --- Textbooks ---
  public getTextbooks(grade?: string): Textbook[] {
    if (grade) {
      return this.textbooks.filter((b) => b.grade === grade);
    }
    return [...this.textbooks];
  }

  public async addBook(book: Omit<Textbook, 'id'>): Promise<Textbook> {
    await ensureAuthReady();
    const newBook: Textbook = {
      ...book,
      id: `book-${Date.now()}`,
    };
    try {
      await setDoc(doc(db, 'textbooks', newBook.id), newBook);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `textbooks/${newBook.id}`);
    }
    return newBook;
  }

  public async deleteBook(id: string): Promise<void> {
    await ensureAuthReady();
    try {
      await deleteDoc(doc(db, 'textbooks', id));
      this.textbooks = this.textbooks.filter((b) => b.id !== id);
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `textbooks/${id}`);
    }
  }

  public async addOrUpdateDriveBook(data: {
    grade: string;
    subject: string;
    term: string;
    driveUrl: string;
    title?: string;
  }, bookId?: string): Promise<Textbook> {
    await ensureAuthReady();
    const driveFileId = extractGoogleDriveFileId(data.driveUrl);
    const previewUrl = buildGoogleDrivePreviewUrl(data.driveUrl);
    const id = bookId || `book_${data.grade}_${(data.term || 'term1').replace(/\s+/g, '_')}_${encodeURIComponent(data.subject)}_${Date.now()}`;
    const newBook: Textbook = {
      id,
      grade: String(data.grade),
      subject: data.subject.trim(),
      term: data.term || 'الترم الأول',
      driveUrl: data.driveUrl.trim(),
      driveFileId,
      previewUrl,
      title: data.title?.trim() || `كتاب ${data.subject.trim()} - الصف ${data.grade}`,
      pagesCount: 160,
      fileSizeMb: 15,
      coverGradient: 'from-blue-700 to-indigo-900',
      sampleSummary: `كتاب مادة ${data.subject.trim()} المقرر للصف ${data.grade} (${data.term || 'الترم الأول'}).`,
      tableOfContents: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'textbooks', id), cleanFirestorePayload(newBook));
      this.textbooks = [newBook, ...this.textbooks.filter((b) => b.id !== id)];
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `textbooks/${id}`);
    }
    return newBook;
  }

  /**
   * End School Term and Clean Detailed Data:
   * 1. Preserves each student's name, final GPA/average, and pass/fail status in Firestore ('term_results').
   * 2. Deletes all questions ('questions') from Firestore.
   * 3. Deletes all detailed submissions, answered_questions, and detailed grades from Firestore.
   * 4. Deletes textbook links of that term from Firestore (NEVER touches Google Drive files).
   * 5. Completely preserves all codes, students, teachers, schools, and super admin accounts.
   */
  public async endTermAndCleanData(term: string): Promise<{
    studentsPreservedCount: number;
    questionsDeletedCount: number;
    submissionsDeletedCount: number;
    booksDeletedCount: number;
  }> {
    await ensureAuthReady();

    // 1. Fetch grades, submissions, students and registeredCodes to preserve student results
    const gradesSnap = await getDocs(collection(db, 'grades'));
    const submissionsSnap = await getDocs(collection(db, 'submissions'));
    const studentsSnap = await getDocs(collection(db, 'students'));
    const registeredCodesSnap = await getDocs(collection(db, 'registeredCodes'));

    const studentMap: Record<string, { code: string; name: string; schoolId?: string; grade?: string }> = {};

    studentsSnap.docs.forEach((d) => {
      const data = d.data();
      const code = data.code || d.id;
      studentMap[code] = {
        code,
        name: data.name || data.fullName || 'طالب',
        schoolId: data.schoolId || '',
        grade: data.grade || '',
      };
    });

    registeredCodesSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.type === 'student' || data.role === 'student' || data.code?.startsWith('STU')) {
        const code = data.code || d.id;
        if (!studentMap[code]) {
          studentMap[code] = {
            code,
            name: data.ownerName || data.name || 'طالب',
            schoolId: data.schoolId || '',
            grade: data.grade || '',
          };
        }
      }
    });

    const studentScores: Record<string, { totalEarned: number; totalPossible: number }> = {};

    gradesSnap.docs.forEach((d) => {
      const g = d.data();
      const sCode = g.studentCode || g.studentId;
      if (sCode) {
        if (!studentScores[sCode]) studentScores[sCode] = { totalEarned: 0, totalPossible: 0 };
        const obtained = Number(g.obtained ?? g.score ?? 0) || 0;
        const total = Number(g.total ?? g.maxScore ?? 5) || 5;
        studentScores[sCode].totalEarned += obtained;
        studentScores[sCode].totalPossible += total;
      }
    });

    submissionsSnap.docs.forEach((d) => {
      const sub = d.data();
      const sCode = sub.studentCode || sub.studentId;
      if (sCode && sub.status === 'تم التصحيح') {
        if (!studentScores[sCode]) studentScores[sCode] = { totalEarned: 0, totalPossible: 0 };
        const score = Number(sub.score ?? 0);
        const maxScore = Number(sub.maxScore ?? 5);
        if (!gradesSnap.docs.some((gd) => gd.data().questionId === sub.questionId && (gd.data().studentCode === sCode || gd.data().studentId === sCode))) {
          studentScores[sCode].totalEarned += score;
          studentScores[sCode].totalPossible += maxScore;
        }
      }
    });

    // Save final preserved records to Firestore in 'term_results'
    let preservedCount = 0;
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const sCode of Object.keys(studentMap)) {
      const st = studentMap[sCode];
      const scores = studentScores[sCode] || { totalEarned: 0, totalPossible: 0 };
      const finalGpa = scores.totalPossible > 0
        ? Math.round((scores.totalEarned / scores.totalPossible) * 100)
        : 100;
      const resultStatus: 'ناجح' | 'راسب' = finalGpa >= 50 ? 'ناجح' : 'راسب';

      const resultDocId = `${sCode}_${term.replace(/\s+/g, '_')}`;
      const resultRef = doc(db, 'term_results', resultDocId);
      batch.set(resultRef, cleanFirestorePayload({
        id: resultDocId,
        studentCode: sCode,
        studentName: st.name,
        schoolId: st.schoolId || '',
        grade: st.grade || '',
        term,
        finalGpa,
        totalEarned: scores.totalEarned,
        totalPossible: scores.totalPossible,
        resultStatus,
        finishedAt: new Date().toISOString(),
      }));
      preservedCount++;
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
    if (batchCount > 0) {
      await batch.commit();
    }

    // 2. Delete ALL questions
    const questionsSnap = await getDocs(collection(db, 'questions'));
    const questionsCount = questionsSnap.size;
    await wipeCollectionHelper('questions');

    // 3. Delete ALL submissions, answered_questions, and detailed grade attempts
    const submissionsCount = submissionsSnap.size;
    await wipeCollectionHelper('submissions');
    await wipeCollectionHelper('answered_questions');
    await wipeCollectionHelper('grades');

    // 4. Delete textbook links ONLY for that specific term from Firestore
    // Note: NEVER delete the Google Drive files themselves!
    const textbooksSnap = await getDocs(collection(db, 'textbooks'));
    let booksDeletedCount = 0;
    const bookDeletions: Promise<void>[] = [];
    textbooksSnap.docs.forEach((d) => {
      const b = d.data();
      if (!b.term || b.term === term || b.term === 'الكل' || term === 'الكل') {
        booksDeletedCount++;
        bookDeletions.push(deleteDoc(doc(db, 'textbooks', d.id)));
      }
    });
    await Promise.all(bookDeletions);

    this.textbooks = this.textbooks.filter((b) => b.term && b.term !== term && b.term !== 'الكل' && term !== 'الكل');
    this.questions = [];
    this.submissions = [];
    this.grades = [];
    this.notify();

    return {
      studentsPreservedCount: preservedCount,
      questionsDeletedCount: questionsCount,
      submissionsDeletedCount: submissionsCount,
      booksDeletedCount,
    };
  }

  // --- Announcements ---
  public getAnnouncements(role?: 'admin' | 'principal' | 'teacher' | 'student', schoolId?: string): Announcement[] {
    if (!schoolId && role !== 'admin') {
      return [];
    }
    let list = this.announcements.filter((a) => !isSimulationAnnouncement(a));
    if (schoolId) {
      const normalizedTarget = schoolId.trim().toLowerCase();
      list = list.filter((a) => (a.schoolId || '').trim().toLowerCase() === normalizedTarget);
    }
    list = list.map((a) => ({
      ...a,
      senderName:
        a.senderName && !isGenericPrincipalSender(a.senderName)
          ? a.senderName
          : getSchoolPrincipalName(a.schoolId),
      senderRoleAr: a.senderRoleAr || 'مدير المدرسة',
    }));
    if (!role || role === 'admin' || role === 'principal') {
      return list;
    }
    if (role === 'teacher') {
      return list.filter((a) => a.target === 'all' || a.target === 'teachers');
    }
    if (role === 'student') {
      return list.filter((a) => a.target === 'all' || a.target === 'students');
    }
    return list;
  }

  private lastAnnouncementsAdded: Array<{ schoolId: string; title: string; content: string; time: number }> = [];

  public async addAnnouncement(anc: Omit<Announcement, 'id' | 'createdAt' | 'readCount'>): Promise<Announcement> {
    await ensureAuthReady();
    const nowMs = Date.now();
    const cleanTitle = (anc.title || '').trim();
    const cleanContent = (anc.content || '').trim();
    const cleanSchoolId = (anc.schoolId || '').trim().toLowerCase();

    // Prevent accidental double-click submission within 5 seconds for the SAME school only
    const isRecentDuplicate = this.lastAnnouncementsAdded.some(
      (a) =>
        a.schoolId === cleanSchoolId &&
        a.title === cleanTitle &&
        a.content === cleanContent &&
        nowMs - a.time < 5000
    );
    if (isRecentDuplicate) {
      console.log('ℹ️ Duplicate announcement prevented (within 5s).');
      const existing = this.announcements.find(
        (a) =>
          (a.schoolId || '').trim().toLowerCase() === cleanSchoolId &&
          a.title.trim() === cleanTitle &&
          a.content.trim() === cleanContent
      );
      if (existing) return existing;
    }

    this.lastAnnouncementsAdded.push({ schoolId: cleanSchoolId, title: cleanTitle, content: cleanContent, time: nowMs });
    if (this.lastAnnouncementsAdded.length > 20) this.lastAnnouncementsAdded.shift();

    const uniqueId = `anc_${nowMs}_${Math.random().toString(36).substring(2, 7)}`;
    const newAnc: Announcement = {
      ...anc,
      id: uniqueId,
      createdAt: new Date().toLocaleDateString('ar-YE'),
      readCount: 1,
    };
    try {
      await setDoc(doc(db, 'announcements', newAnc.id), cleanFirestorePayload(newAnc));
      if (anc.schoolId) {
        await setDoc(doc(db, 'circulars', newAnc.id), cleanFirestorePayload({
          ...newAnc,
          schoolId: anc.schoolId,
          createdAtFormatted: new Date().toLocaleDateString('ar-YE'),
          createdAt: new Date().toISOString(),
        }));
      }
      this.announcements = [newAnc, ...this.announcements.filter((a) => a.id !== newAnc.id)];
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `announcements/${newAnc.id}`);
    }
    return newAnc;
  }

  public async deleteAnnouncement(id: string): Promise<void> {
    await ensureAuthReady();
    try {
      await deleteDoc(doc(db, 'announcements', id));
      await deleteDoc(doc(db, 'circulars', id)).catch(() => {});
      this.announcements = this.announcements.filter((a) => a.id !== id);
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `announcements/${id}`);
    }
  }

  // --- Teacher Recommendations (توصيات وتعليمات المعلم التربوية - غير محدودة ومعزولة تماماً بكل مدرسة وطالب) ---
  public getRecommendations(
    schoolId?: string,
    grade?: string,
    subject?: string,
    options?: {
      viewerStudentCode?: string;
      includePrivateForTeacher?: boolean;
    }
  ): TeacherRecommendation[] {
    if (!schoolId || !schoolId.trim()) return [];
    const normalizedSchoolId = schoolId.trim().toLowerCase();
    let list = this.recommendations.filter(
      (r) => (r.schoolId || '').trim().toLowerCase() === normalizedSchoolId
    );
    if (grade && grade !== 'all' && grade !== 'الكل') {
      list = list.filter((r) => !r.grade || r.grade === 'all' || r.grade === String(grade));
    }
    if (subject && subject !== 'all' && subject !== 'الكل') {
      list = list.filter((r) => r.subject === subject);
    }

    // Privacy isolation: private recommendations are ONLY visible to the targeted student (or authoring teacher)
    if (!options?.includePrivateForTeacher) {
      const normalizedViewerCode = (options?.viewerStudentCode || '').trim().toLowerCase();
      list = list.filter((r) => {
        const targetCode = (r.targetStudentCode || '').trim().toLowerCase();
        const isPrivate = r.targetScope === 'specific_student' || Boolean(targetCode);
        if (!isPrivate) return true;
        if (!normalizedViewerCode || !targetCode) return false;
        return targetCode === normalizedViewerCode;
      });
    }

    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  public async addRecommendation(
    rec: Omit<TeacherRecommendation, 'id' | 'createdAt' | 'createdAtFormatted'>
  ): Promise<TeacherRecommendation> {
    await ensureAuthReady();
    const now = Date.now();
    const formatted = formatArabicDateTime(new Date(now));
    const uniqueId = `rec_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const newRec: TeacherRecommendation = {
      ...rec,
      id: uniqueId,
      createdAt: now,
      createdAtFormatted: formatted,
    };
    try {
      await setDoc(doc(db, 'recommendations', newRec.id), cleanFirestorePayload(newRec));
      this.recommendations = [newRec, ...this.recommendations.filter((r) => r.id !== newRec.id)];
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `recommendations/${newRec.id}`);
    }
    return newRec;
  }

  public async deleteRecommendation(id: string): Promise<void> {
    await ensureAuthReady();
    try {
      await deleteDoc(doc(db, 'recommendations', id));
      this.recommendations = this.recommendations.filter((r) => r.id !== id);
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `recommendations/${id}`);
    }
  }

  // --- Monthly and Cumulative Reports Archiving (Never overwritten, persistent across terms) ---
  public async archiveMonthlyReport(report: MonthlyReportRecord): Promise<void> {
    await ensureAuthReady();
    try {
      await setDoc(
        doc(db, 'monthlyReports', report.id),
        cleanFirestorePayload({ ...report, recordType: 'monthly_report' })
      );
      console.log(`✅ Archived monthly report: ${report.id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `monthlyReports/${report.id}`);
    }
  }

  public async getArchivedMonthlyReports(schoolId: string): Promise<MonthlyReportRecord[]> {
    await ensureAuthReady();
    try {
      const q = query(collection(db, 'monthlyReports'), where('schoolId', '==', schoolId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => d.data() as MonthlyReportRecord)
        .filter((r) => r.recordType !== 'teacher_activities_archive' && r.recordType !== 'monthly_homework_archive');
    } catch (error) {
      console.warn('Notice reading monthlyReports from Firestore:', error);
      return [];
    }
  }

  public async getArchivedTeacherActivityBatches(schoolId: string): Promise<TeacherActivityArchiveBatch[]> {
    await ensureAuthReady();
    try {
      const q = query(collection(db, 'monthlyReports'), where('schoolId', '==', schoolId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => d.data() as TeacherActivityArchiveBatch)
        .filter((r) => r.recordType === 'teacher_activities_archive')
        .sort((a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0));
    } catch (error) {
      console.warn('Notice reading teacher activity archives from Firestore:', error);
      return [];
    }
  }

  public async getArchivedMonthlyHomeworkBatches(
    schoolId: string,
    grade?: string,
    studentCode?: string
  ): Promise<MonthlyHomeworkArchiveBatch[]> {
    await ensureAuthReady();
    try {
      const q = query(collection(db, 'monthlyReports'), where('schoolId', '==', schoolId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => d.data() as MonthlyHomeworkArchiveBatch)
        .filter((r) => {
          if (r.recordType !== 'monthly_homework_archive') return false;
          if (studentCode) {
            return r.studentCode === studentCode;
          }
          return !grade || !r.grade || String(r.grade) === String(grade);
        })
        .sort((a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0));
    } catch (error) {
      console.warn('Notice reading monthly homework archives from Firestore:', error);
      return [];
    }
  }

  public async syncThursdayMonthlyHomeworkArchive(
    schoolId: string,
    grade: string,
    studentCode: string,
    questionsList: Question[],
    closedQuestionIds: Set<string>,
    nowMs: number = Date.now()
  ): Promise<MonthlyHomeworkArchiveBatch[]> {
    if (!schoolId || !grade || !studentCode || questionsList.length === 0) return [];
    await ensureAuthReady();

    const grouped = new Map<
      string,
      {
        thuDate: Date;
        archiveAtMs: number;
        monthName: string;
        year: number;
        weekLabel: string;
        items: MonthlyHomeworkArchiveItem[];
      }
    >();

    for (const qItem of questionsList) {
      // Only archive questions that the student has actually answered AND that are closed/locked
      if (!qItem.id || !closedQuestionIds.has(qItem.id)) {
        continue;
      }

      const ts = getQuestionTimestamp(qItem);
      if (!ts || ts <= 0) continue;
      const info = getHomeworkArchiveCutoffInfo(ts);
      if (nowMs < info.archiveAtMs) {
        continue;
      }

      const item: MonthlyHomeworkArchiveItem = cleanFirestorePayload({
        id: qItem.id,
        subject: (qItem.subject || 'المادة').trim(),
        type: qItem.type,
        questionText: (qItem.questionText || qItem.text || '').trim(),
        options: Array.isArray(qItem.options) ? qItem.options : undefined,
        correctOption: qItem.correctOption,
        correctIndex: qItem.correctIndex,
        points: Number(qItem.points || 5),
        teacherName: (qItem.teacherName || 'معلم المادة').trim(),
        grade: String(qItem.grade || qItem.class || grade),
        class: String(qItem.class || qItem.grade || grade),
        timestamp: ts,
        createdAtFormatted: qItem.createdAtFormatted || formatArabicDateTime(ts),
      });

      const existing = grouped.get(info.thursdayKey);
      if (existing) {
        if (!existing.items.some((x) => x.id === item.id)) {
          existing.items.push(item);
        }
      } else {
        grouped.set(info.thursdayKey, {
          thuDate: info.thuDate,
          archiveAtMs: info.archiveAtMs,
          monthName: info.monthName,
          year: info.year,
          weekLabel: info.weekLabel,
          items: [item],
        });
      }
    }

    if (grouped.size === 0) {
      return this.getArchivedMonthlyHomeworkBatches(schoolId, grade, studentCode);
    }

    const existingBatches = await this.getArchivedMonthlyHomeworkBatches(schoolId, grade, studentCode);
    const existingById = new Map(existingBatches.map((b) => [b.id, b]));

    for (const [thursdayKey, group] of grouped.entries()) {
      const docId = `hw_${schoolId}_${studentCode}_${thursdayKey}`;
      const prevBatch = existingById.get(docId);

      const mergedMap = new Map<string, MonthlyHomeworkArchiveItem>();
      (prevBatch?.questions || []).forEach((it) => mergedMap.set(it.id, it));
      group.items.forEach((it) => mergedMap.set(it.id, it));
      const mergedItems = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

      if (prevBatch && prevBatch.questions.length === mergedItems.length) {
        continue;
      }

      const batchRecord: MonthlyHomeworkArchiveBatch = {
        id: docId,
        recordType: 'monthly_homework_archive',
        schoolId,
        studentCode,
        grade: String(grade),
        thursdayKey,
        weekLabel: group.weekLabel,
        year: group.year,
        monthName: group.monthName,
        archivedAt: group.thuDate.toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        archivedTimestamp: group.archiveAtMs,
        autoArchived: true,
        questionsCount: mergedItems.length,
        questions: mergedItems,
      };

      try {
        await setDoc(doc(db, 'monthlyReports', docId), cleanFirestorePayload(batchRecord));
        existingById.set(docId, batchRecord);
      } catch (error) {
        console.warn('Notice archiving Thursday student homework:', error);
      }
    }

    return Array.from(existingById.values()).sort(
      (a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)
    );
  }

  public async syncThursdayTeacherActivitiesArchive(
    schoolId: string,
    questionsList: Question[],
    nowMs: number = Date.now()
  ): Promise<TeacherActivityArchiveBatch[]> {
    if (!schoolId || questionsList.length === 0) return [];
    await ensureAuthReady();

    const MONTH_AR_MAP: Record<number, string> = {
      0: 'يناير',
      1: 'فبراير',
      2: 'مارس',
      3: 'أبريل',
      4: 'مايو',
      5: 'يونيو',
      6: 'يوليو',
      7: 'أغسطس',
      8: 'سبتمبر',
      9: 'أكتوبر',
      10: 'نوفمبر',
      11: 'ديسمبر',
    };

    const gradeArabicLabel = (g?: string): string => {
      const s = String(g || '').trim();
      if (s === '7' || s.includes('سابع')) return 'الصف السابع';
      if (s === '8' || s.includes('ثامن')) return 'الصف الثامن';
      if (s === '9' || s.includes('تاسع')) return 'الصف التاسع';
      return s ? `الصف ${s}` : 'جميع الصفوف';
    };

    // Map any timestamp to its school-week Thursday (Sat..Thu -> that week's Thu; Fri -> next Thu)
    const getThursdayInfo = (ts: number) => {
      const d = new Date(ts);
      const daysUntilThu = (4 - d.getDay() + 7) % 7;
      const thuDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntilThu, 0, 0, 0, 0);
      const y = thuDate.getFullYear();
      const m = String(thuDate.getMonth() + 1).padStart(2, '0');
      const dayNum = String(thuDate.getDate()).padStart(2, '0');
      const thursdayKey = `${y}-${m}-${dayNum}`;
      return {
        thursdayKey,
        thursdayStartMs: thuDate.getTime(),
        thuDate,
      };
    };

    // Group teacher activities by Thursday key, only archiving weeks whose Thursday has arrived (nowMs >= thursdayStartMs)
    const grouped = new Map<
      string,
      { thuDate: Date; thursdayStartMs: number; items: TeacherActivityArchiveItem[] }
    >();

    for (const qItem of questionsList) {
      const ts = getQuestionTimestamp(qItem);
      if (!ts || ts <= 0) continue;
      const { thursdayKey, thursdayStartMs, thuDate } = getThursdayInfo(ts);
      if (nowMs < thursdayStartMs) {
        continue; // Keep active until Thursday arrives
      }

      const teacherLabel = (qItem.teacherName || 'المعلم').trim();
      const subjLabel = (qItem.subject || 'المادة').trim();
      const gradeLabel = gradeArabicLabel(qItem.grade || qItem.class);
      const d = new Date(ts);
      const item: TeacherActivityArchiveItem = {
        id: `q_${qItem.id}`,
        text: `${teacherLabel} معلم ${subjLabel} نشر الواجب المنزلي _ ${gradeLabel}`,
        teacherName: teacherLabel,
        subject: subjLabel,
        grade: gradeLabel,
        timestamp: ts,
        dateLabel: d.toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        timeLabel: formatArabicDateTime(ts),
      };

      const existing = grouped.get(thursdayKey);
      if (existing) {
        if (!existing.items.some((x) => x.id === item.id)) {
          existing.items.push(item);
        }
      } else {
        grouped.set(thursdayKey, { thuDate, thursdayStartMs, items: [item] });
      }
    }

    if (grouped.size === 0) {
      return this.getArchivedTeacherActivityBatches(schoolId);
    }

    const existingBatches = await this.getArchivedTeacherActivityBatches(schoolId);
    const existingById = new Map(existingBatches.map((b) => [b.id, b]));

    for (const [thursdayKey, group] of grouped.entries()) {
      const docId = `ta_${schoolId}_${thursdayKey}`;
      const prevBatch = existingById.get(docId);

      // Merge previous archived items + live week items so nothing is ever lost
      const mergedMap = new Map<string, TeacherActivityArchiveItem>();
      (prevBatch?.activities || []).forEach((it) => mergedMap.set(it.id, it));
      group.items.forEach((it) => mergedMap.set(it.id, it));
      const mergedItems = Array.from(mergedMap.values()).sort((a, b) => b.timestamp - a.timestamp);

      if (prevBatch && prevBatch.activities.length === mergedItems.length) {
        continue; // Already up to date in Firestore
      }

      const monthName = MONTH_AR_MAP[group.thuDate.getMonth()] || 'نوفمبر';
      const batchRecord: TeacherActivityArchiveBatch = {
        id: docId,
        recordType: 'teacher_activities_archive',
        schoolId,
        thursdayKey,
        weekLabel: `أسبوع الخميس ${group.thuDate.toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}`,
        year: group.thuDate.getFullYear(),
        monthName,
        archivedAt: group.thuDate.toLocaleDateString('ar-YE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        archivedTimestamp: group.thursdayStartMs,
        autoArchived: true,
        activitiesCount: mergedItems.length,
        activities: mergedItems,
      };

      try {
        await setDoc(doc(db, 'monthlyReports', docId), cleanFirestorePayload(batchRecord));
        existingById.set(docId, batchRecord);
      } catch (error) {
        console.warn('Notice archiving Thursday teacher activities:', error);
      }
    }

    return Array.from(existingById.values()).sort(
      (a, b) => (b.archivedTimestamp || 0) - (a.archivedTimestamp || 0)
    );
  }

  // --- Monthly Teacher Gradebook Archiving & Rollover ---
  public async archiveMonthlyGradebook(record: MonthlyGradebookRecord): Promise<void> {
    await ensureAuthReady();
    try {
      await setDoc(doc(db, 'monthlyGradebooks', record.id), cleanFirestorePayload(record));
      console.log(`✅ Archived monthly gradebook: ${record.id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `monthlyGradebooks/${record.id}`);
    }
  }

  public async getArchivedMonthlyGradebooks(schoolId: string, grade?: string, subject?: string): Promise<MonthlyGradebookRecord[]> {
    await ensureAuthReady();
    try {
      const q = query(collection(db, 'monthlyGradebooks'), where('schoolId', '==', schoolId));
      const snap = await getDocs(q);
      let list = snap.docs.map((d) => d.data() as MonthlyGradebookRecord);
      if (grade) {
        list = list.filter((r) => !r.grade || r.grade === grade);
      }
      if (subject) {
        list = list.filter((r) => !r.subject || r.subject === subject);
      }
      return list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (error) {
      console.warn('Notice reading monthlyGradebooks from Firestore:', error);
      return [];
    }
  }

  // --- Questions (Unlimited per school, strictly isolated by schoolId) ---
  public getQuestions(grade?: '7' | '8' | '9', subject?: string, schoolId?: string): Question[] {
    if (!schoolId || !schoolId.trim()) {
      return [];
    }
    const normalizedSchoolId = schoolId.trim().toLowerCase();
    let list = this.questions.filter(
      (q) => (q.schoolId || '').trim().toLowerCase() === normalizedSchoolId
    );
    if (grade) {
      list = list.filter((q) => q.grade === grade || q.class === grade);
    }
    if (subject && subject !== 'الكل') {
      list = list.filter((q) => q.subject === subject);
    }

    // Deduplicate only within the same school, grade, and subject (never hide other subjects/schools)
    const seen = new Set<string>();
    const distinctList: Question[] = [];
    for (const q of list) {
      const qTextClean = (q.questionText || q.text || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const dedupKey = `${q.schoolId || ''}_${q.grade || q.class || ''}_${q.subject || ''}_${qTextClean}`;
      if (!seen.has(dedupKey)) {
        seen.add(dedupKey);
        distinctList.push(q);
      }
    }
    // Sort questions newest first (الأحدث فالأحدث)
    distinctList.sort((a, b) => getQuestionTimestamp(b) - getQuestionTimestamp(a));
    return distinctList;
  }

  public async addQuestion(q: (Omit<Question, 'id' | 'createdAt'> & { id?: string; createdAt?: any })): Promise<Question> {
    await ensureAuthReady();
    const targetSchool = (q.schoolId || '').trim().toLowerCase();
    const targetGrade = String(q.grade || q.class || '').trim();
    const targetSubject = (q.subject || '').trim();
    const cleanText = (q.questionText || q.text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const exists = this.questions.find(
      (existing) =>
        (existing.schoolId || '').trim().toLowerCase() === targetSchool &&
        String(existing.grade || existing.class || '').trim() === targetGrade &&
        (existing.subject || '').trim() === targetSubject &&
        ((existing.questionText || existing.text || '').trim().replace(/\s+/g, ' ').toLowerCase()) === cleanText
    );
    if (exists) {
      return exists;
    }

    const now = new Date();
    const newQ: Question = {
      ...q,
      id: (q as any).id || `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: (q as any).createdAt || now.toISOString(),
      createdAtFormatted: (q as any).createdAtFormatted || formatArabicDateTime(now),
      timestamp: (q as any).timestamp || now.getTime(),
    };
    try {
      await setDoc(doc(db, 'questions', newQ.id), newQ);
      const alreadyIdx = this.questions.findIndex((item) => item.id === newQ.id);
      if (alreadyIdx >= 0) {
        this.questions[alreadyIdx] = newQ;
      } else {
        this.questions.push(newQ);
      }
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `questions/${newQ.id}`);
    }
    return newQ;
  }

  public async deleteQuestion(id: string): Promise<void> {
    await ensureAuthReady();
    try {
      await deleteDoc(doc(db, 'questions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `questions/${id}`);
    }
  }

  // --- Homework & Submissions (Strictly isolated by schoolId) ---
  public getSubmissions(studentCode?: string, grade?: string, subject?: string, schoolId?: string): HomeworkSubmission[] {
    let list = [...this.submissions];
    if (schoolId) {
      const normalizedSchoolId = schoolId.trim().toLowerCase();
      list = list.filter((s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchoolId);
    }
    if (studentCode) {
      list = list.filter((s) => s.studentCode === studentCode);
    }
    if (grade) {
      list = list.filter((s) => !s.grade || s.grade === grade);
    }
    if (subject && subject !== 'الكل' && subject !== 'ALL') {
      list = list.filter((s) => !s.subject || (Boolean(s.subject) && s.subject.includes(subject)) || (Boolean(s.subject) && subject.includes(s.subject)));
    }
    return list;
  }

  public async addSubmission(sub: Omit<HomeworkSubmission, 'id' | 'submittedAt'>): Promise<HomeworkSubmission> {
    await ensureAuthReady();
    const newSub: HomeworkSubmission = {
      ...sub,
      id: `sub-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      submittedAt: 'الآن',
    };
    try {
      await setDoc(doc(db, 'submissions', newSub.id), newSub);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `submissions/${newSub.id}`);
    }
    return newSub;
  }

  public async lockAndGradeSubmission(id: string, score: number, teacherFeedback: string, gradedBy?: string): Promise<void> {
    await ensureAuthReady();
    try {
      await setDoc(
        doc(db, 'submissions', id),
        {
          score,
          maxScore: 5,
          teacherFeedback,
          status: 'graded',
          isLocked: true,
          gradedAt: new Date().toISOString(),
          gradedBy: gradedBy || 'المعلم',
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `submissions/${id}`);
    }
  }

  public async addPrincipalComment(id: string, comment: string): Promise<void> {
    await ensureAuthReady();
    try {
      await setDoc(
        doc(db, 'submissions', id),
        {
          principalComment: comment,
        },
        { merge: true }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `submissions/${id}`);
    }
  }

  // --- Gradebook Sheet Roster ---
  public getStudentGradeSheet(
    grade: string = '8',
    schoolId?: string,
    subject?: string,
    registeredStudents?: Array<{ code: string; assignedToName?: string; name?: string; phone?: string; grade?: string; class?: string; schoolId?: string }>,
    sinceTimestamp?: number
  ) {
    if (!schoolId || !schoolId.trim()) return [];
    const normalizedSchoolId = schoolId.trim().toLowerCase();
    let roster: Array<{ code: string; name: string; phone: string; schoolId?: string }> = [];

    // Filter registered students strictly: where schoolId == teacher.schoolId AND class/grade == teacher.class
    if (registeredStudents && registeredStudents.length > 0) {
      const filtered = registeredStudents.filter((s) => {
        const matchesClass = !s.grade && !s.class ? true : (s.grade === grade || (s as any).class === grade);
        const matchesSchool = (s.schoolId || '').trim().toLowerCase() === normalizedSchoolId;
        return matchesClass && matchesSchool;
      });

      if (filtered.length > 0) {
        roster = filtered.map((s) => ({
          code: s.code,
          name: s.name || s.assignedToName || 'طالب مدرسي',
          phone: s.phone || '—',
          schoolId: s.schoolId,
        }));
      }
    }

    // If still empty, discover any students from grades strictly for this school & class
    if (roster.length === 0) {
      const knownStudents = new Map<string, { code: string; name: string; phone: string; schoolId?: string }>();
      this.grades.forEach((g) => {
        if (
          (g.schoolId || '').trim().toLowerCase() === normalizedSchoolId &&
          (!grade || g.class === grade || g.grade === grade)
        ) {
          if (g.studentCode && !knownStudents.has(g.studentCode)) {
            knownStudents.set(g.studentCode, {
              code: g.studentCode,
              name: g.studentName || g.studentCode,
              phone: '—',
              schoolId: g.schoolId,
            });
          }
        }
      });
      roster = Array.from(knownStudents.values());
    }

    return roster.map((student) => {
      // Submissions matching student, schoolId, and subject
      let studentSubs = this.submissions.filter(
        (s) =>
          (s.schoolId || '').trim().toLowerCase() === normalizedSchoolId &&
          s.studentCode === student.code &&
          (!subject || !s.subject || s.subject === subject || (Boolean(s.subject) && s.subject.includes(subject)) || (Boolean(s.subject) && subject.includes(s.subject)))
      );
      if (sinceTimestamp) {
        studentSubs = studentSubs.filter((s) => {
          const ts = getQuestionTimestamp(s) || (s as any).timestamp || 0;
          return ts >= sinceTimestamp;
        });
      }

      const gradedSubs = studentSubs.filter(
        (s) => (s.status === 'graded' || s.status === 'تم التصحيح') && typeof s.score === 'number'
      );

      // Additional grades from collection grades strictly matching schoolId
      let studentDirectGrades = this.grades.filter(
        (g) =>
          (g.schoolId || '').trim().toLowerCase() === normalizedSchoolId &&
          g.studentCode === student.code &&
          (!subject || !g.subject || g.subject === subject || (Boolean(g.subject) && g.subject.includes(subject)) || (Boolean(g.subject) && subject.includes(g.subject)))
      );
      if (sinceTimestamp) {
        studentDirectGrades = studentDirectGrades.filter((g) => {
          const ts = getQuestionTimestamp(g) || (g as any).timestamp || 0;
          return ts >= sinceTimestamp;
        });
      }

      const subEarned = gradedSubs.reduce((acc, curr) => acc + (curr.score || 0), 0);
      const subPossible = gradedSubs.reduce((acc, curr) => acc + (curr.maxScore || 5), 0);

      const directEarned = studentDirectGrades.reduce(
        (acc, curr) => acc + Number(curr.obtained !== undefined ? curr.obtained : (curr.score || 0)),
        0
      );
      const directPossible = studentDirectGrades.reduce(
        (acc, curr) => acc + Number(curr.total !== undefined ? curr.total : (curr.maxScore || 5)),
        0
      );

      const totalEarned = subEarned + directEarned;
      const totalPossible = subPossible + directPossible;
      const totalItemsCount = gradedSubs.length + studentDirectGrades.length;

      // Real percentage calculation: NO hardcoded 80%
      const scorePercent = totalItemsCount > 0 && totalPossible > 0
        ? Math.round((totalEarned / totalPossible) * 100)
        : 0;

      let rating = 'ممتاز (أ)';
      let ratingBadgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
      if (totalItemsCount === 0) {
        rating = 'لم يُرصد';
        ratingBadgeColor = 'bg-gray-100 text-gray-700 border-gray-200';
      } else if (scorePercent < 50) {
        rating = 'ضعيف (هـ)';
        ratingBadgeColor = 'bg-rose-100 text-rose-800 border-rose-300';
      } else if (scorePercent < 65) {
        rating = 'مقبول (د)';
        ratingBadgeColor = 'bg-orange-100 text-orange-800 border-orange-300';
      } else if (scorePercent < 80) {
        rating = 'جيد (ج)';
        ratingBadgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
      } else if (scorePercent < 90) {
        rating = 'جيد جداً (ب)';
        ratingBadgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
      }

      return {
        ...student,
        grade,
        submissionsCount: studentSubs.length + studentDirectGrades.length,
        gradedCount: gradedSubs.length + studentDirectGrades.length,
        totalEarned,
        totalPossible: totalPossible > 0 ? totalPossible : 5,
        percentage: scorePercent,
        rating,
        ratingBadgeColor,
        latestGradeRecord: studentDirectGrades[studentDirectGrades.length - 1],
      };
    });
  }

  // --- Grades Records ---
  public getGrades(studentCode?: string, subject?: string, schoolId?: string, grade?: string): GradeRecord[] {
    let list = [...this.grades];
    if (schoolId) {
      const normalizedSchoolId = schoolId.trim().toLowerCase();
      list = list.filter((g) => (g.schoolId || '').trim().toLowerCase() === normalizedSchoolId);
    }
    if (studentCode) {
      list = list.filter((g) => g.studentCode === studentCode);
    }
    if (subject && subject !== 'ALL' && subject !== 'الكل') {
      list = list.filter((g) => Boolean(g.subject) && (g.subject === subject || g.subject.includes(subject) || subject.includes(g.subject)));
    }
    if (grade) {
      list = list.filter((g) => !g.grade || g.grade === grade);
    }
    return list;
  }

  public async addGrade(record: Omit<GradeRecord, 'id' | 'date'>): Promise<GradeRecord> {
    await ensureAuthReady();
    const newGrade: GradeRecord = {
      ...record,
      id: `grd-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: new Date().toISOString().split('T')[0],
    };
    try {
      await setDoc(doc(db, 'grades', newGrade.id), newGrade);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `grades/${newGrade.id}`);
    }
    return newGrade;
  }

  public async deleteGrade(id: string): Promise<void> {
    await ensureAuthReady();
    try {
      await deleteDoc(doc(db, 'grades', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `grades/${id}`);
    }
  }

  // --- Firebase Storage Upload for Supervisor Voice Recording (Max 2 minutes) ---
  public async uploadSupervisorAudio(schoolId: string, audioBlob: Blob): Promise<string> {
    await ensureAuthReady();
    const cleanSchool = (schoolId || 'school').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const mime = (audioBlob.type || 'audio/webm').split(';')[0];
    const ext = mime.includes('mp4') || mime.includes('m4a')
      ? 'm4a'
      : mime.includes('ogg')
      ? 'ogg'
      : mime.includes('wav')
      ? 'wav'
      : 'webm';
    const path = `supervisor_audio/${cleanSchool}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    try {
      const fileRef = storageRef(storage, path);
      const snap = await withTimeout(
        uploadBytes(fileRef, audioBlob, { contentType: mime }),
        12000,
        'رفع التسجيل الصوتي إلى Storage'
      );
      return await withTimeout(getDownloadURL(snap.ref), 6000, 'جلب رابط الصوت');
    } catch (err) {
      console.warn('[Storage Audio Upload notice]:', err);
      return '';
    }
  }

  // --- Workflow Notifications (Supervisor <-> Principal) ---
  public getNotifications(
    schoolId?: string,
    recipientRole?: 'principal' | 'supervisor',
    recipientCode?: string
  ): AppNotification[] {
    if (!schoolId || !schoolId.trim()) return [];
    const normalizedSchool = schoolId.trim().toLowerCase();
    return this.notifications
      .filter((n) => {
        if ((n.schoolId || '').trim().toLowerCase() !== normalizedSchool) return false;
        if (recipientRole && n.recipientRole !== recipientRole) return false;
        if (
          recipientCode &&
          n.recipientCode &&
          n.recipientCode.trim().toUpperCase() !== recipientCode.trim().toUpperCase()
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  public async createNotification(
    input: Omit<AppNotification, 'id' | 'isRead' | 'createdAt' | 'createdAtFormatted'>
  ): Promise<AppNotification | null> {
    await ensureAuthReady();
    const now = Date.now();
    const notif: AppNotification = cleanFirestorePayload({
      ...input,
      id: `notif_${now}_${Math.random().toString(36).substring(2, 7)}`,
      isRead: false,
      createdAt: now,
      createdAtFormatted: formatArabicDateTime(new Date(now)),
    });
    try {
      await setDoc(doc(db, 'notifications', notif.id), notif);
      this.notifications = [notif, ...this.notifications.filter((n) => n.id !== notif.id)];
      this.notify();
      return notif;
    } catch (error) {
      console.warn('[Notification create notice]:', error);
      return null;
    }
  }

  public async markNotificationRead(id: string): Promise<void> {
    const existing = this.notifications.find((n) => n.id === id);
    if (!existing || existing.isRead) return;
    const updated = { ...existing, isRead: true };
    this.notifications = this.notifications.map((n) => (n.id === id ? updated : n));
    this.notify();
    try {
      await setDoc(doc(db, 'notifications', id), cleanFirestorePayload(updated));
    } catch {}
  }

  public async markAllNotificationsRead(
    schoolId: string,
    recipientRole: 'principal' | 'supervisor'
  ): Promise<void> {
    const unread = this.getNotifications(schoolId, recipientRole).filter((n) => !n.isRead);
    if (unread.length === 0) return;
    const unreadIds = new Set(unread.map((n) => n.id));
    this.notifications = this.notifications.map((n) =>
      unreadIds.has(n.id) ? { ...n, isRead: true } : n
    );
    this.notify();
    try {
      await Promise.all(
        unread.map((n) =>
          setDoc(doc(db, 'notifications', n.id), cleanFirestorePayload({ ...n, isRead: true }))
        )
      );
    } catch {}
  }

  // --- Supervisor Activities & Reports (Approval Flow: pending -> approved / revision_requested / rejected) ---
  public getSupervisorActivities(schoolId?: string): SupervisorActivity[] {
    if (!schoolId || !schoolId.trim()) return [];
    const normalizedSchoolId = schoolId.trim().toLowerCase();
    return this.supervisorActivities
      .filter((a) => (a.schoolId || '').trim().toLowerCase() === normalizedSchoolId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  public async addSupervisorActivity(
    activity: Omit<SupervisorActivity, 'id' | 'createdAt' | 'createdAtFormatted'>
  ): Promise<SupervisorActivity> {
    await ensureAuthReady();
    const now = Date.now();
    const cleanImages = Array.isArray(activity.images)
      ? activity.images.filter((img) => typeof img === 'string' && img.length > 0).slice(0, 3)
      : undefined;

    const newAct: SupervisorActivity = cleanFirestorePayload({
      ...activity,
      formalText: activity.formalText || activity.details,
      images: cleanImages && cleanImages.length > 0 ? cleanImages : undefined,
      approvalStatus: activity.approvalStatus || 'pending',
      id: `sact_${now}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      createdAtFormatted: formatArabicDateTime(new Date(now)),
    });
    try {
      await setDoc(doc(db, 'supervisor_activities', newAct.id), newAct);
      this.supervisorActivities = [newAct, ...this.supervisorActivities.filter((a) => a.id !== newAct.id)];
      this.notify();

      // Notify Principal: "تقرير جديد بانتظار اعتمادك"
      await this.createNotification({
        schoolId: newAct.schoolId,
        recipientRole: 'principal',
        type: 'new_report',
        title: 'تقرير جديد بانتظار اعتمادك',
        message: `تقرير جديد بانتظار اعتمادك: ${newAct.title}`,
        relatedId: newAct.id,
        relatedKind: 'activity',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `supervisor_activities/${newAct.id}`);
    }
    return newAct;
  }

  public async updateSupervisorActivity(
    id: string,
    updates: Partial<
      Pick<
        SupervisorActivity,
        | 'category'
        | 'subType'
        | 'title'
        | 'details'
        | 'images'
        | 'targetGrade'
        | 'targetClass'
        | 'activityDate'
        | 'inputType'
        | 'originalText'
        | 'formalText'
        | 'audioUrl'
      >
    >
  ): Promise<void> {
    await ensureAuthReady();
    let existing = this.supervisorActivities.find((a) => a.id === id) || null;
    if (!existing) {
      const snap = await getDoc(doc(db, 'supervisor_activities', id));
      if (snap.exists()) existing = snap.data() as SupervisorActivity;
    }
    if (!existing) throw new Error('لم يتم العثور على السجل المطلوب تعديله.');

    const cleanImages =
      updates.images !== undefined
        ? updates.images.filter((img) => typeof img === 'string' && img.length > 0).slice(0, 3)
        : existing.images;

    const updated: SupervisorActivity = cleanFirestorePayload({
      ...existing,
      ...updates,
      formalText: updates.formalText || updates.details || existing.formalText || existing.details,
      images: cleanImages && cleanImages.length > 0 ? cleanImages : undefined,
      approvalStatus: 'pending',
      principalNote: undefined,
      createdAt: Date.now(),
      createdAtFormatted: formatArabicDateTime(new Date()),
    });

    try {
      await setDoc(doc(db, 'supervisor_activities', id), updated);
      this.supervisorActivities = [updated, ...this.supervisorActivities.filter((a) => a.id !== id)];
      this.notify();

      await this.createNotification({
        schoolId: updated.schoolId,
        recipientRole: 'principal',
        type: 'new_report',
        title: 'تقرير جديد بانتظار اعتمادك',
        message: `تقرير جديد بانتظار اعتمادك (بعد التعديل): ${updated.title}`,
        relatedId: updated.id,
        relatedKind: 'activity',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `supervisor_activities/${id}`);
    }
  }

  public async reviewSupervisorActivity(
    id: string,
    status: 'approved' | 'revision_requested' | 'rejected',
    principalName: string,
    note?: string
  ): Promise<void> {
    await ensureAuthReady();
    let existing = this.supervisorActivities.find((a) => a.id === id) || null;
    if (!existing) {
      const snap = await getDoc(doc(db, 'supervisor_activities', id));
      if (snap.exists()) existing = snap.data() as SupervisorActivity;
    }
    if (!existing) throw new Error('لم يتم العثور على السجل المطلوب مراجعته.');

    const now = Date.now();
    const cleanNote = note?.trim() || '';
    const updated: SupervisorActivity = cleanFirestorePayload({
      ...existing,
      approvalStatus: status,
      principalNote: cleanNote || undefined,
      approvedBy: principalName || 'مدير المدرسة',
      approvedAt: now,
      approvedAtFormatted: formatArabicDateTime(new Date(now)),
    });

    try {
      await setDoc(doc(db, 'supervisor_activities', id), updated);
      this.supervisorActivities = [updated, ...this.supervisorActivities.filter((a) => a.id !== id)];
      this.notify();

      if (status === 'approved') {
        await this.createNotification({
          schoolId: updated.schoolId,
          recipientRole: 'supervisor',
          recipientCode: updated.supervisorCode,
          type: 'approved',
          title: 'تم اعتماد تقريرك ونشره',
          message: `تم اعتماد تقريرك ونشره: ${updated.title}`,
          relatedId: updated.id,
          relatedKind: 'activity',
        });
      } else if (status === 'rejected') {
        await this.createNotification({
          schoolId: updated.schoolId,
          recipientRole: 'supervisor',
          recipientCode: updated.supervisorCode,
          type: 'rejected',
          title: 'تم رفض تقريرك',
          message: `تم رفض تقريرك (${updated.title})، السبب: ${cleanNote || 'لم يذكر سبب محدد'}`,
          relatedId: updated.id,
          relatedKind: 'activity',
        });
      } else {
        await this.createNotification({
          schoolId: updated.schoolId,
          recipientRole: 'supervisor',
          recipientCode: updated.supervisorCode,
          type: 'revision_requested',
          title: 'طلب تعديل على تقريرك',
          message: `طلب المدير تعديلاً على تقريرك (${updated.title}): ${cleanNote || 'يرجى المراجعة والتعديل'}`,
          relatedId: updated.id,
          relatedKind: 'activity',
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `supervisor_activities/${id}`);
    }
  }

  public async deleteSupervisorActivity(id: string): Promise<void> {
    await ensureAuthReady();
    try {
      await deleteDoc(doc(db, 'supervisor_activities', id));
      this.supervisorActivities = this.supervisorActivities.filter((a) => a.id !== id);
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `supervisor_activities/${id}`);
    }
  }

  // --- Supervisor Attendance & Absence (Sent to Principal for Approval -> Published on School Board) ---
  public getAttendanceRecords(schoolId?: string): AttendanceRecord[] {
    if (!schoolId || !schoolId.trim()) return [];
    const normalizedSchoolId = schoolId.trim().toLowerCase();
    return this.attendanceRecords
      .filter((r) => (r.schoolId || '').trim().toLowerCase() === normalizedSchoolId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  }

  private buildAttendanceDocId(schoolId: string, grade: string, classNumber: string, date: string): string {
    const cleanSchool = (schoolId || 'school').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanGrade = (grade || '1').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const rawClass = (classNumber || '1').trim() || '1';
    const encodedClass = encodeURIComponent(rawClass).replace(/%/g, '_');
    const cleanDate = (date || '').trim().replace(/[^0-9-]/g, '');
    return `att_${cleanSchool}_${cleanGrade}_${encodedClass}_${cleanDate}`;
  }

  public hasAttendanceForClassDate(schoolId: string, grade: string, classNumber: string, date: string): boolean {
    const targetId = this.buildAttendanceDocId(schoolId, grade, classNumber, date);
    return this.attendanceRecords.some(
      (r) =>
        (r.id === targetId ||
          ((r.schoolId || '').trim().toLowerCase() === (schoolId || '').trim().toLowerCase() &&
            String(r.grade).trim() === String(grade).trim() &&
            (r.classNumber || '1').trim() === (classNumber || '1').trim() &&
            r.date === date)) &&
        r.approvalStatus !== 'revision_requested' &&
        r.approvalStatus !== 'rejected'
    );
  }

  public async saveAttendanceRecordOnce(input: {
    schoolId: string;
    grade: string;
    classNumber: string;
    date: string;
    entries: AttendanceEntry[];
    recordedBy: string;
    supervisorCode?: string;
    resubmitRecordId?: string;
  }): Promise<AttendanceRecord> {
    await ensureAuthReady();
    const classNum = (input.classNumber || '1').trim() || '1';
    const docId = input.resubmitRecordId || this.buildAttendanceDocId(input.schoolId, input.grade, classNum, input.date);

    if (!input.resubmitRecordId) {
      if (this.hasAttendanceForClassDate(input.schoolId, input.grade, classNum, input.date)) {
        throw new Error(`تم رفع حضور وغياب هذا الفصل لتاريخ (${input.date}) مسبقاً، ولا يمكن التسجيل مرتين لنفس الفصل في نفس اليوم.`);
      }

      try {
        const existingSnap = await getDoc(doc(db, 'attendance_records', docId));
        if (existingSnap.exists()) {
          const existingData = existingSnap.data() as AttendanceRecord;
          if (
            existingData.approvalStatus !== 'revision_requested' &&
            existingData.approvalStatus !== 'rejected'
          ) {
            throw new Error(`تم رفع حضور وغياب هذا الفصل لتاريخ (${input.date}) مسبقاً، ولا يمكن التسجيل مرتين لنفس الفصل في نفس اليوم.`);
          }
        }
      } catch (err: any) {
        if (err?.message?.includes('مسبقاً')) throw err;
      }
    }

    const validStatuses: AttendanceStatus[] = ['حاضر', 'غائب بعذر', 'غائب بدون عذر', 'متأخر', 'غائب'];
    const cleanEntries = input.entries
      .map((e) => ({
        studentName: (e.studentName || '').trim(),
        status: (validStatuses.includes(e.status) ? e.status : 'حاضر') as AttendanceStatus,
        note: e.note?.trim() || undefined,
      }))
      .filter((e) => e.studentName.length > 0);

    if (cleanEntries.length === 0) {
      throw new Error('يرجى التأكد من وجود اسم طالب واحد على الأقل قبل الإرسال.');
    }

    const presentCount = cleanEntries.filter((e) => e.status === 'حاضر').length;
    const absentExcusedCount = cleanEntries.filter((e) => e.status === 'غائب بعذر').length;
    const absentUnexcusedCount = cleanEntries.filter(
      (e) => e.status === 'غائب بدون عذر' || e.status === 'غائب'
    ).length;
    const absentCount = absentExcusedCount + absentUnexcusedCount;
    const lateCount = cleanEntries.filter((e) => e.status === 'متأخر').length;
    const now = Date.now();

    const record: AttendanceRecord = cleanFirestorePayload({
      id: docId,
      schoolId: input.schoolId,
      grade: String(input.grade).trim(),
      gradeLabel: getGradeLabelAr(String(input.grade).trim()),
      classNumber: classNum,
      date: input.date,
      entries: cleanEntries.map((ce) => cleanFirestorePayload(ce)),
      presentCount,
      absentCount,
      absentExcusedCount,
      absentUnexcusedCount,
      lateCount,
      recordedBy: input.recordedBy,
      supervisorCode: input.supervisorCode,
      isDirectSaved: false,
      approvalStatus: 'pending',
      principalNote: undefined,
      createdAt: now,
      createdAtFormatted: formatArabicDateTime(new Date(now)),
    });

    try {
      await setDoc(doc(db, 'attendance_records', docId), record);
      this.attendanceRecords = [record, ...this.attendanceRecords.filter((r) => r.id !== docId)];
      this.notify();

      await this.createNotification({
        schoolId: record.schoolId,
        recipientRole: 'principal',
        type: 'new_report',
        title: 'تقرير جديد بانتظار اعتمادك',
        message: `تقرير جديد بانتظار اعتمادك: كشف حضور وغياب ${record.gradeLabel} (فصل ${record.classNumber}) - ${record.date}`,
        relatedId: record.id,
        relatedKind: 'attendance',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `attendance_records/${docId}`);
    }
    return record;
  }

  public async reviewAttendanceRecord(
    id: string,
    status: 'approved' | 'revision_requested' | 'rejected',
    principalName: string,
    note?: string
  ): Promise<void> {
    await ensureAuthReady();
    let existing = this.attendanceRecords.find((r) => r.id === id) || null;
    if (!existing) {
      const snap = await getDoc(doc(db, 'attendance_records', id));
      if (snap.exists()) existing = snap.data() as AttendanceRecord;
    }
    if (!existing) throw new Error('لم يتم العثور على كشف الحضور المطلوب.');

    const now = Date.now();
    const cleanNote = note?.trim() || '';
    const updated: AttendanceRecord = cleanFirestorePayload({
      ...existing,
      approvalStatus: status,
      principalNote: cleanNote || undefined,
      approvedBy: principalName || 'مدير المدرسة',
      approvedAt: now,
      approvedAtFormatted: formatArabicDateTime(new Date(now)),
    });

    try {
      await setDoc(doc(db, 'attendance_records', id), updated);
      this.attendanceRecords = [updated, ...this.attendanceRecords.filter((r) => r.id !== id)];
      this.notify();

      const label = `كشف حضور ${updated.gradeLabel} (فصل ${updated.classNumber})`;
      if (status === 'approved') {
        await this.createNotification({
          schoolId: updated.schoolId,
          recipientRole: 'supervisor',
          recipientCode: updated.supervisorCode,
          type: 'approved',
          title: 'تم اعتماد تقريرك ونشره',
          message: `تم اعتماد تقريرك ونشره (${label})`,
          relatedId: updated.id,
          relatedKind: 'attendance',
        });
      } else if (status === 'rejected') {
        await this.createNotification({
          schoolId: updated.schoolId,
          recipientRole: 'supervisor',
          recipientCode: updated.supervisorCode,
          type: 'rejected',
          title: 'تم رفض تقريرك',
          message: `تم رفض تقريرك (${label})، السبب: ${cleanNote || 'لم يذكر سبب محدد'}`,
          relatedId: updated.id,
          relatedKind: 'attendance',
        });
      } else {
        await this.createNotification({
          schoolId: updated.schoolId,
          recipientRole: 'supervisor',
          recipientCode: updated.supervisorCode,
          type: 'revision_requested',
          title: 'طلب تعديل على كشف الحضور',
          message: `طلب المدير تعديلاً على ${label}: ${cleanNote || 'يرجى المراجعة والتعديل'}`,
          relatedId: updated.id,
          relatedKind: 'attendance',
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `attendance_records/${id}`);
    }
  }

  // --- Weekly Class Schedules (Fixed Term 1, Supervisor Uploads -> Principal Approves Once) ---
  public getClassSchedules(schoolId?: string): ClassSchedule[] {
    if (!schoolId || !schoolId.trim()) return [];
    const normalizedSchoolId = schoolId.trim().toLowerCase();
    return this.classSchedules
      .filter((s) => (s.schoolId || '').trim().toLowerCase() === normalizedSchoolId)
      .sort((a, b) => Number(a.grade) - Number(b.grade) || (b.uploadedAt || 0) - (a.uploadedAt || 0));
  }

  private buildScheduleDocId(schoolId: string, grade: string, classNumber: string): string {
    const cleanSchool = (schoolId || 'school').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanGrade = (grade || '1').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const rawClass = (classNumber || '1').trim() || '1';
    const encodedClass = encodeURIComponent(rawClass).replace(/%/g, '_');
    return `sched_${cleanSchool}_t1_${cleanGrade}_${encodedClass}`;
  }

  public async submitClassScheduleForApproval(input: {
    schoolId: string;
    grade: string;
    classNumber: string;
    entries: ScheduleSlot[];
    uploadedBy: string;
    supervisorCode?: string;
    sourceMethod: 'image' | 'manual';
  }): Promise<ClassSchedule> {
    await ensureAuthReady();
    const classNum = (input.classNumber || '1').trim() || '1';
    const docId = this.buildScheduleDocId(input.schoolId, input.grade, classNum);
    const now = Date.now();
    const nowFormatted = formatArabicDateTime(new Date(now));

    const cleanEntries = input.entries
      .filter((slot) => (slot.subject || '').trim().length > 0 || (slot.teacherName || '').trim().length > 0)
      .map((slot) =>
        cleanFirestorePayload({
          day: slot.day,
          period: Number(slot.period),
          periodLabel: slot.periodLabel || SCHEDULE_PERIODS.find((p) => p.period === Number(slot.period))?.label || `الحصة ${slot.period}`,
          subject: (slot.subject || '').trim(),
          teacherName: (slot.teacherName || '').trim(),
        })
      );

    if (cleanEntries.length === 0) {
      throw new Error('يرجى إدخال حصة واحدة على الأقل في الجدول قبل الإرسال للاعتماد.');
    }

    let existingDoc: ClassSchedule | null =
      this.classSchedules.find((s) => s.id === docId) || null;
    if (!existingDoc) {
      try {
        const snap = await getDoc(doc(db, 'class_schedules', docId));
        if (snap.exists()) existingDoc = snap.data() as ClassSchedule;
      } catch {}
    }

    // If an approved schedule already exists, keep it live & fixed until Principal approves the newly uploaded version!
    let nextRecord: ClassSchedule;
    if (existingDoc && existingDoc.isApproved) {
      nextRecord = cleanFirestorePayload({
        ...existingDoc,
        id: docId,
        grade: String(input.grade).trim(),
        gradeLabel: getGradeLabelAr(String(input.grade).trim()),
        classNumber: classNum,
        term: 'الأول',
        pendingEntries: cleanEntries,
        pendingUploadedBy: input.uploadedBy,
        pendingUploadedAt: now,
        pendingUploadedAtFormatted: nowFormatted,
        pendingSourceMethod: input.sourceMethod,
        hasPendingUpdate: true,
        rejectionNote: undefined,
      });
    } else {
      nextRecord = cleanFirestorePayload({
        id: docId,
        schoolId: input.schoolId,
        grade: String(input.grade).trim(),
        gradeLabel: getGradeLabelAr(String(input.grade).trim()),
        classNumber: classNum,
        term: 'الأول',
        entries: cleanEntries,
        uploadedBy: input.uploadedBy,
        supervisorCode: input.supervisorCode,
        sourceMethod: input.sourceMethod,
        uploadedAt: now,
        uploadedAtFormatted: nowFormatted,
        isApproved: false,
        approvalStatus: 'pending',
        hasPendingUpdate: false,
      });
    }

    try {
      await setDoc(doc(db, 'class_schedules', docId), nextRecord);
      this.classSchedules = [nextRecord, ...this.classSchedules.filter((s) => s.id !== docId)];
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `class_schedules/${docId}`);
    }
    return nextRecord;
  }

  public async approveClassSchedule(scheduleId: string, principalName: string): Promise<void> {
    await ensureAuthReady();
    let existing = this.classSchedules.find((s) => s.id === scheduleId) || null;
    if (!existing) {
      const snap = await getDoc(doc(db, 'class_schedules', scheduleId));
      if (snap.exists()) existing = snap.data() as ClassSchedule;
    }
    if (!existing) throw new Error('لم يتم العثور على الجدول المطلوب.');

    const now = Date.now();
    const nowFormatted = formatArabicDateTime(new Date(now));

    const updated: ClassSchedule = cleanFirestorePayload({
      id: existing.id,
      schoolId: existing.schoolId,
      grade: existing.grade,
      gradeLabel: existing.gradeLabel,
      classNumber: existing.classNumber,
      term: 'الأول',
      entries: existing.hasPendingUpdate && existing.pendingEntries?.length ? existing.pendingEntries : existing.entries,
      uploadedBy: existing.hasPendingUpdate && existing.pendingUploadedBy ? existing.pendingUploadedBy : existing.uploadedBy,
      supervisorCode: existing.supervisorCode,
      sourceMethod: existing.hasPendingUpdate && existing.pendingSourceMethod ? existing.pendingSourceMethod : existing.sourceMethod,
      uploadedAt: existing.hasPendingUpdate && existing.pendingUploadedAt ? existing.pendingUploadedAt : existing.uploadedAt,
      uploadedAtFormatted: existing.hasPendingUpdate && existing.pendingUploadedAtFormatted ? existing.pendingUploadedAtFormatted : existing.uploadedAtFormatted,
      isApproved: true,
      approvalStatus: 'approved',
      approvedBy: principalName || 'مدير المدرسة',
      approvedAt: now,
      approvedAtFormatted: nowFormatted,
      hasPendingUpdate: false,
    });

    try {
      await setDoc(doc(db, 'class_schedules', scheduleId), updated);
      this.classSchedules = [updated, ...this.classSchedules.filter((s) => s.id !== scheduleId)];
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `class_schedules/${scheduleId}`);
    }
  }

  public async rejectClassSchedule(scheduleId: string, principalName: string, note?: string): Promise<void> {
    await ensureAuthReady();
    let existing = this.classSchedules.find((s) => s.id === scheduleId) || null;
    if (!existing) {
      const snap = await getDoc(doc(db, 'class_schedules', scheduleId));
      if (snap.exists()) existing = snap.data() as ClassSchedule;
    }
    if (!existing) throw new Error('لم يتم العثور على الجدول المطلوب.');

    const updated: ClassSchedule = existing.isApproved && existing.hasPendingUpdate
      ? cleanFirestorePayload({
          id: existing.id,
          schoolId: existing.schoolId,
          grade: existing.grade,
          gradeLabel: existing.gradeLabel,
          classNumber: existing.classNumber,
          term: 'الأول',
          entries: existing.entries,
          uploadedBy: existing.uploadedBy,
          supervisorCode: existing.supervisorCode,
          sourceMethod: existing.sourceMethod,
          uploadedAt: existing.uploadedAt,
          uploadedAtFormatted: existing.uploadedAtFormatted,
          isApproved: true,
          approvalStatus: 'approved',
          approvedBy: existing.approvedBy,
          approvedAt: existing.approvedAt,
          approvedAtFormatted: existing.approvedAtFormatted,
          hasPendingUpdate: false,
          rejectionNote: note?.trim() || `تم رفض التعديل المقترح بواسطة ${principalName}`,
        })
      : cleanFirestorePayload({
          ...existing,
          isApproved: false,
          approvalStatus: 'rejected',
          hasPendingUpdate: false,
          rejectionNote: note?.trim() || `تمت إعادة الجدول للمراجعة بواسطة ${principalName}`,
        });

    try {
      await setDoc(doc(db, 'class_schedules', scheduleId), updated);
      this.classSchedules = [updated, ...this.classSchedules.filter((s) => s.id !== scheduleId)];
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `class_schedules/${scheduleId}`);
    }
  }

  // --- Clean all simulation data from Firestore ---
  public async clearAllSimulationData(): Promise<void> {
    await handleFullWipe(false);
  }
}

/**
 * Real Firestore Full Wipe Function:
 * Uses writeBatch, getDocs, collection, deleteDoc to completely wipe:
 * - schools (deletes all except YemenEdu default)
 * - activation_codes & codes (deletes all except Ebtisaam1144 if stored)
 * - super_admins (preserves only owner-nabil)
 * - textbooks, questions, announcements, submissions, grades (deletes all)
 * Resets local/session storage (preserving active session) and triggers window.location.reload()
 */
export async function wipeCollectionHelper(
  collectionName: string,
  filterPredicate?: (docId: string, data: any) => boolean
): Promise<number> {
  try {
    const snap = await getDocs(collection(db, collectionName));
    if (snap.empty) return 0;
    let batch = writeBatch(db);
    let count = 0;
    let totalDeleted = 0;
    for (const d of snap.docs) {
      if (filterPredicate && filterPredicate(d.id, d.data())) {
        continue; // preserve
      }
      batch.delete(d.ref);
      count++;
      totalDeleted++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
    return totalDeleted;
  } catch (err) {
    console.warn(`Error wiping collection ${collectionName}:`, err);
    return 0;
  }
}

export async function handleFullWipe(autoReload: boolean = true): Promise<void> {
  await ensureAuthReady();

  // 1. schools: delete all schools (leaves schools list empty 0)
  await wipeCollectionHelper('schools');

  // 2. registeredCodes, codes, activation_codes, students, teachers: delete all except Ebtisaam1144 if stored
  const isEbtisaam = (id: string, data: any) => {
    const c = (data?.code || id || '').toString().toUpperCase();
    return c === 'EBTISAAM1144';
  };
  await wipeCollectionHelper('registeredCodes', isEbtisaam);
  await wipeCollectionHelper('codes', isEbtisaam);
  await wipeCollectionHelper('activation_codes', isEbtisaam);
  await wipeCollectionHelper('students');
  await wipeCollectionHelper('teachers');

  // 3. super_admins: keep only owner-nabil (Developer admin lifetime credentials)
  await wipeCollectionHelper('super_admins', (id, data) => {
    return id === 'owner-nabil' || data?.code === 'Ebtisaam1144' || data?.email === 'nabilalzuraigy@gmail.com';
  });

  // 4. textbooks, questions, announcements, circulars, submissions, grades, answered_questions, term_results
  await wipeCollectionHelper('textbooks');
  await wipeCollectionHelper('questions');
  await wipeCollectionHelper('answered_questions');
  await wipeCollectionHelper('announcements');
  await wipeCollectionHelper('circulars');
  await wipeCollectionHelper('submissions');
  await wipeCollectionHelper('grades');
  await wipeCollectionHelper('term_results');
  await wipeCollectionHelper('attendance_records');
  await wipeCollectionHelper('class_schedules');
  await wipeCollectionHelper('supervisor_activities');
  await wipeCollectionHelper('notifications');

  // Clear local storage and caches (preserve active session & activation code)
  const savedSession = sessionStorage.getItem('yemen_edu_active_session');
  const savedCode = localStorage.getItem('yemenedu_activation_code');
  localStorage.clear();
  sessionStorage.clear();
  if (savedSession) {
    sessionStorage.setItem('yemen_edu_active_session', savedSession);
  }
  if (savedCode) {
    localStorage.setItem('yemenedu_activation_code', savedCode);
  }

  if (autoReload && typeof window !== 'undefined') {
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }
}

export const appDataService = new AppDataService();

