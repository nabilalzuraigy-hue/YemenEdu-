import { collection, doc, getDocs, limit, onSnapshot, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { cleanFirestorePayload, UserSession } from './authService';

export type AttendanceStatus = 'حاضر' | 'غائب بعذر' | 'غائب بدون عذر' | 'متأخر';
export type ApprovalStatus = 'pending' | 'approved' | 'revision_requested' | 'rejected';
export type ActivityType = 'تقرير' | 'نشاط' | 'فعالية';
export type ActivityInputType = 'صورة' | 'نص';

export interface AttendanceRow { id?: string; studentName: string; studentCode?: string; status: AttendanceStatus }
export interface AttendanceRecord {
  id: string; schoolId: string; date: string; grade: string; className: string;
  rows: AttendanceRow[]; supervisorCode: string; supervisorName: string; createdAt: number;
  status?: ApprovalStatus; principalNote?: string;
}
export interface ScheduleCell { day: string; period: number; subject: string; teacherName: string; room: string }
export interface ClassSchedule {
  id: string; schoolId: string; grade: string; className: string; term: 'الترم الأول'; cells: ScheduleCell[];
  uploadedByCode: string; uploadedByName: string; uploadedAt: number; status: ApprovalStatus;
  approvedByCode?: string; approvedByName?: string; approvedAt?: number; principalNote?: string;
}
export interface SupervisorActivity {
  id: string; schoolId: string; grade: string; className: string; type: ActivityType;
  subtype: string; title: string; originalText: string; professionalText: string; inputType: ActivityInputType;
  imageUrls: string[]; date: string; supervisorCode: string; supervisorName: string;
  createdAt: number; status: ApprovalStatus; principalNote?: string;
  reviewedAt?: number; reviewedByCode?: string; reviewedByName?: string;
}

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/;

export function fileToCompressedDataUrl(file: File, maxWidth = 1280, quality = 0.76): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('يسمح برفع الصور فقط'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الصورة'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('الصورة غير صالحة'));
      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('تعذر ضغط الصورة'));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function analyzeImageWithGemini(dataUrl: string, prompt: string): Promise<string> {
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) throw new Error('صيغة الصورة غير صالحة');
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('أضف VITE_GEMINI_API_KEY في إعدادات البناء لتفعيل Gemini');
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: match[2] } }, { text: prompt }] }],
  });
  return String(response.text || '').trim();
}

export async function polishTextWithGemini(originalText: string, type: ActivityType, subtype: string, imageUrls: string[] = []): Promise<string> {
  const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('أضف VITE_GEMINI_API_KEY في إعدادات البناء لتفعيل Gemini');
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = imageUrls.map((url) => {
    const match = url.match(DATA_URL_RE);
    if (!match) return null;
    return { inlineData: { mimeType: 'image/jpeg', data: match[2] } };
  }).filter(Boolean);
  parts.push({ text: `أعد صياغة هذا المحتوى كتقرير مدرسي عربي رسمي ومختصر ودقيق. النوع: ${type}، التصنيف: ${subtype}. لا تخترع أسماء أو وقائع غير موجودة. النص: ${originalText}` });
  const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts }] });
  return String(response.text || '').trim();
}

export function extractJsonArray(text: string): any[] {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* invalid model output */ }
  }
  throw new Error('تعذر قراءة نتائج Gemini؛ راجع الصورة وحاول مجدداً');
}

export function subscribeActivities(schoolId: string, callback: (rows: SupervisorActivity[]) => void): () => void {
  return onSnapshot(query(collection(db, 'supervisorActivities'), where('schoolId', '==', schoolId), limit(500)), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupervisorActivity)).sort((a, b) => b.createdAt - a.createdAt));
  }, () => callback([]));
}
export async function saveActivity(activity: Omit<SupervisorActivity, 'id'>): Promise<string> {
  const ref = doc(collection(db, 'supervisorActivities'));
  await setDoc(ref, cleanFirestorePayload({ ...activity, id: ref.id }));
  // In-app inbox notification. Client-only Firestore notifications; no FCM.
  const notice = doc(collection(db, 'inAppNotifications'));
  await setDoc(notice, { id: notice.id, schoolId: activity.schoolId, targetRole: 'principal', type: 'supervisor_submission', title: 'تقرير جديد بانتظار اعتمادك', activityId: ref.id, createdAt: Date.now(), read: false });
  return ref.id;
}
export async function reviewActivity(activityId: string, status: ApprovalStatus, note: string, session: UserSession): Promise<void> {
  const ref = doc(db, 'supervisorActivities', activityId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('الطلب غير موجود');
    const activity = snap.data() as SupervisorActivity;
    tx.update(ref, cleanFirestorePayload({ status, principalNote: note.trim(), reviewedAt: Date.now(), reviewedByCode: session.code, reviewedByName: session.name }));
    const notice = doc(collection(db, 'inAppNotifications'));
    const title = status === 'approved' ? 'تم اعتماد تقريرك ونشره' : status === 'rejected' ? `تم رفض تقريرك، السبب: ${note.trim() || 'لم يذكر المدير سبباً'}` : `طلب المدير تعديل تقريرك: ${note.trim()}`;
    tx.set(notice, { id: notice.id, schoolId: activity.schoolId, targetCode: activity.supervisorCode, type: 'activity_review', title, activityId, createdAt: Date.now(), read: false });
  });
}
export function subscribeNotifications(schoolId: string, callback: (items: any[]) => void): () => void {
  return onSnapshot(query(collection(db, 'inAppNotifications'), where('schoolId', '==', schoolId), limit(200)), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => b.createdAt - a.createdAt)), () => callback([]));
}

export async function hasAttendanceForToday(schoolId: string, grade: string, className: string, date: string): Promise<boolean> {
  const id = `${schoolId}_${grade}_${className}_${date}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return (await getDocs(query(collection(db, 'attendance'), where('id', '==', id), limit(1)))).docs.length > 0;
}
export async function saveAttendance(record: Omit<AttendanceRecord, 'id'>): Promise<void> {
  const id = `${record.schoolId}_${record.grade}_${record.className}_${record.date}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  await setDoc(doc(db, 'attendance', id), cleanFirestorePayload({ ...record, id, status: 'pending' }), { merge: false });
  const notice = doc(collection(db, 'inAppNotifications'));
  await setDoc(notice, { id: notice.id, schoolId: record.schoolId, targetRole: 'principal', type: 'attendance_submission', title: 'كشف حضور جديد بانتظار اعتمادك', attendanceId: id, createdAt: Date.now(), read: false });
}
export function subscribeAttendance(schoolId: string, callback: (items: AttendanceRecord[]) => void): () => void {
  return onSnapshot(query(collection(db, 'attendance'), where('schoolId', '==', schoolId), limit(500)), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord)).sort((a,b) => b.date.localeCompare(a.date))), () => callback([]));
}
export async function reviewAttendance(id: string, status: ApprovalStatus, note: string): Promise<void> {
  await setDoc(doc(db, 'attendance', id), { status, principalNote: note.trim(), reviewedAt: Date.now() }, { merge: true });
}

export function subscribeSchedules(schoolId: string, callback: (rows: ClassSchedule[]) => void): () => void {
  return onSnapshot(query(collection(db, 'classSchedules'), where('schoolId', '==', schoolId), limit(500)), (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassSchedule))), () => callback([]));
}
export async function saveSchedule(schedule: Omit<ClassSchedule, 'id'>): Promise<string> {
  const id = `${schedule.schoolId}_${schedule.grade}_${schedule.className}_first`.replace(/[^a-zA-Z0-9_-]/g, '_');
  await setDoc(doc(db, 'classSchedules', id), cleanFirestorePayload({ ...schedule, id }));
  const notice = doc(collection(db, 'inAppNotifications'));
  await setDoc(notice, { id: notice.id, schoolId: schedule.schoolId, targetRole: 'principal', type: 'schedule_submission', title: 'جدول حصص جديد بانتظار اعتمادك', scheduleId: id, createdAt: Date.now(), read: false });
  return id;
}
export async function approveSchedule(scheduleId: string, session: UserSession): Promise<void> {
  await setDoc(doc(db, 'classSchedules', scheduleId), { status: 'approved', approvedByCode: session.code, approvedByName: session.name, approvedAt: Date.now() }, { merge: true });
}
