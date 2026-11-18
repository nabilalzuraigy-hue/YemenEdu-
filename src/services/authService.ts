/**
 * YemenEduApp - Firebase Authentication & Activation Code Service
 * Powered live by Firebase Firestore & Auth (Spark Free Plan)
 * Default School ID: 'yemenedu'
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  auth,
  ensureAuthReady,
  handleFirestoreError,
  OperationType,
  withTimeout,
  setFirebaseError,
  clearFirebaseError,
} from '../firebase/config';

export type UserRole = 'admin' | 'super_admin' | 'principal' | 'teacher' | 'student';

export interface UserSession {
  code: string;
  name: string;
  role: UserRole;
  roleTitleAr: string;
  activatedAt: string;
  expiresAt: string;
  daysRemaining: number;
  isTest: boolean;
  isLifetime?: boolean;
  grade?: string;
  class?: string;
  studentCode?: string;
  subject?: string;
  phone?: string;
  schoolId: string;
  schoolName: string;
}

export interface School {
  id: string;
  name: string;
  prefix: string;
  city: string;
  isActive: boolean;
  subscriptionExpiresAt?: string;
  lastRenewedAt?: string;
  subscriptionDays?: number;
  createdAt?: string;
}

export interface SubjectItem {
  code: string;
  nameAr: string;
  iconName: string;
}

export const ALL_SUBJECTS: SubjectItem[] = [
  { code: 'QUR', nameAr: 'القرآن الكريم', iconName: 'menu_book' },
  { code: 'ISL', nameAr: 'التربية الإسلامية', iconName: 'auto_stories' },
  { code: 'ARB', nameAr: 'اللغة العربية', iconName: 'edit_note' },
  { code: 'ENG', nameAr: 'اللغة الإنجليزية', iconName: 'language' },
  { code: 'MATH', nameAr: 'الرياضيات', iconName: 'calculate' },
  { code: 'SCI', nameAr: 'العلوم', iconName: 'science' },
  { code: 'SOC', nameAr: 'الاجتماعيات', iconName: 'public' },
];

export function getSubjectsForGrade(_grade: string): SubjectItem[] {
  return ALL_SUBJECTS;
}

export function normalizeArabicForMatch(text: string): string {
  return (text || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveSubjectItem(rawSubject?: string): SubjectItem | undefined {
  const norm = normalizeArabicForMatch(rawSubject || '');
  if (!norm) return undefined;

  // 1. Direct or bidirectional normalized match against ALL_SUBJECTS
  const direct = ALL_SUBJECTS.find((s) => {
    const sNorm = normalizeArabicForMatch(s.nameAr);
    return sNorm === norm || sNorm.includes(norm) || norm.includes(sNorm);
  });
  if (direct) return direct;

  // 2. Common Arabic/English aliases & partial names (e.g. without "ال" or hamza variants)
  const findByCode = (code: string) => ALL_SUBJECTS.find((s) => s.code === code);
  if (norm.includes('قران') || norm.includes('تجويد') || norm.includes('تلاوه') || norm.includes('quran') || norm === 'qur') {
    return findByCode('QUR');
  }
  if (
    norm.includes('اسلام') ||
    norm.includes('اسلم') ||
    norm.includes('دين') ||
    norm.includes('فقه') ||
    norm.includes('توحيد') ||
    norm.includes('حديث') ||
    norm.includes('سيره') ||
    norm.includes('islamic') ||
    norm === 'isl'
  ) {
    return findByCode('ISL');
  }
  if (norm.includes('عرب') || norm.includes('نحو') || norm.includes('ادب') || norm.includes('املا') || norm.includes('arabic') || norm === 'arb') {
    return findByCode('ARB');
  }
  if (norm.includes('انجليز') || norm.includes('انكلش') || norm.includes('english') || norm === 'eng') {
    return findByCode('ENG');
  }
  if (norm.includes('رياض') || norm.includes('حساب') || norm.includes('جبر') || norm.includes('هندس') || norm.includes('math')) {
    return findByCode('MATH');
  }
  if (norm.includes('علوم') || norm.includes('فيزيا') || norm.includes('كيميا') || norm.includes('احيا') || norm.includes('science') || norm === 'sci') {
    return findByCode('SCI');
  }
  if (norm.includes('اجتماع') || norm.includes('تاريخ') || norm.includes('جغراف') || norm.includes('وطني') || norm.includes('social') || norm === 'soc') {
    return findByCode('SOC');
  }

  return undefined;
}

export function resolveSubjectCodeAscii(rawSubject?: string): { code: string; nameAr: string } {
  const cleanRaw = (rawSubject || '').trim();
  const matched = resolveSubjectItem(cleanRaw);
  if (matched) {
    return { code: matched.code, nameAr: matched.nameAr };
  }

  const norm = normalizeArabicForMatch(cleanRaw);
  if (norm.includes('حاسوب') || norm.includes('كمبيوتر') || norm.includes('تقن') || norm.includes('برمج')) {
    return { code: 'COMP', nameAr: cleanRaw || 'الحاسوب' };
  }
  if (norm.includes('فني') || norm.includes('رسم')) {
    return { code: 'ART', nameAr: cleanRaw || 'التربية الفنية' };
  }
  if (norm.includes('بدني')) {
    return { code: 'PE', nameAr: cleanRaw || 'التربية البدنية' };
  }
  if (norm.includes('فرنس')) {
    return { code: 'FR', nameAr: cleanRaw || 'اللغة الفرنسية' };
  }

  const asciiOnly = cleanRaw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (asciiOnly.length >= 2) {
    return { code: asciiOnly, nameAr: cleanRaw };
  }

  return { code: 'SUB', nameAr: cleanRaw };
}

export function cleanFirestorePayload<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

export interface ActivationCodeRecord {
  code: string;
  role: UserRole;
  roleTitleAr: string;
  assignedToName: string;
  grade?: '7' | '8' | '9';
  class?: string;
  subject?: string;
  phone?: string;
  schoolId: string;
  schoolName: string;
  isTest: boolean;
  createdAt: string;
  isActivated: boolean;
  activatedAt?: string;
  expiresAt?: string;
}

export const DEFAULT_SCHOOL_ID = 'rasheed';

export const DEFAULT_SCHOOLS: School[] = [];

let hasInitializedSuperAdmin = false;
let initSuperAdminPromise: Promise<void> | null = null;

/**
 * Initial bootstrapping for Super Admin (owner-nabil) ONLY
 * Deduplicated via singleton promise to prevent concurrent calls
 */
export async function initSuperAdmin(): Promise<void> {
  if (hasInitializedSuperAdmin) return;
  if (initSuperAdminPromise) return initSuperAdminPromise;

  initSuperAdminPromise = (async () => {
    try {
      await ensureAuthReady(1500);
      const now = new Date().toISOString();

      const superAdminRef = doc(db, 'super_admins', 'owner-nabil');
      try {
        const superAdminSnap = await withTimeout(
          getDoc(superAdminRef),
          5000,
          'فحص حساب المالك في Firestore'
        );
        if (!superAdminSnap.exists()) {
          await withTimeout(
            setDoc(superAdminRef, {
              code: 'Ebtisaam1144',
              name: 'نبيل الزريقي',
              role: 'super_admin',
              roleTitleAr: 'مدير النظام (المالك)',
              isPermanent: true,
              isLifetime: true,
              email: 'owner',
              phone: '773143897',
              createdAt: now,
              schoolId: 'yemenedu',
              schoolName: 'إدارة النظام المركزية',
            }),
            5000,
            'إنشاء حساب المالك في Firestore'
          );
          console.log('✅ Created super_admins/owner-nabil document in Firestore');
        } else {
          await withTimeout(
            setDoc(superAdminRef, { phone: '773143897' }, { merge: true }),
            5000,
            'تحديث هاتف المالك في Firestore'
          );
        }
        hasInitializedSuperAdmin = true;
      } catch (e: any) {
        console.log('ℹ️ [initSuperAdmin Notice]: Firestore owner check notice (offline safe):', e?.message || e);
      }
    } catch (err: any) {
      console.log('ℹ️ [initSuperAdmin Global Notice]:', err?.message || err);
    } finally {
      initSuperAdminPromise = null;
    }
  })();

  return initSuperAdminPromise;
}

/**
 * Synchronous local code resolver - returns session immediately without waiting for Firebase!
 * Never resolves demo codes. Only resolves Developer Super Admin or admin-generated backup codes.
 */
export function resolveLocalSessionForCode(inputCode: string): UserSession | null {
  const code = (inputCode || '').trim();
  if (!code) return null;
  const now = new Date();

  // 1. Super Admin master code: Ebtisaam1144
  if (code.toLowerCase() === 'ebtisaam1144') {
    return {
      code: 'Ebtisaam1144',
      name: 'نبيل الزريقي',
      role: 'super_admin',
      roleTitleAr: 'مدير النظام (المالك)',
      activatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
      daysRemaining: 9999,
      isTest: false,
      isLifetime: true,
      phone: '773143897',
      schoolId: 'central-admin',
      schoolName: 'إدارة النظام المركزية',
    };
  }

  // 2. Search in local backup (yemenedu_excel_codes_backup) generated by Admin
  try {
    const rawBackup = localStorage.getItem('yemenedu_excel_codes_backup');
    if (rawBackup) {
      const parsed: ActivationCodeRecord[] = JSON.parse(rawBackup);
      const upper = code.toUpperCase();
      const match = parsed.find((c) => c && c.code && c.code.toUpperCase() === upper);
      if (match) {
        // Code validity is strictly calculated from the date of import / supply (createdAt / match.expiresAt), NOT from student activation!
        const defaultExpiry =
          match.expiresAt ||
          (match.createdAt
            ? new Date(new Date(match.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
        const expDate = new Date(defaultExpiry);
        const diffMs = expDate.getTime() - now.getTime();
        const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        return {
          code: match.code,
          name: match.role === 'principal' ? match.assignedToName.replace(/صف\s*8|الصف\s*8/gi, '').trim() : match.assignedToName,
          role: match.role,
          roleTitleAr: match.role === 'principal' ? 'مدير مدرسة' : match.roleTitleAr,
          activatedAt: match.activatedAt || now.toISOString(),
          expiresAt: defaultExpiry,
          daysRemaining: daysLeft,
          isTest: match.isTest || false,
          grade: match.role === 'principal' ? undefined : match.grade,
          class: match.role === 'principal' ? undefined : match.grade,
          studentCode: match.code,
          subject: match.role === 'principal' ? undefined : match.subject,
          schoolId: match.schoolId || '',
          schoolName: match.schoolName || '',
        };
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * Synchronous initial session getter from local storage - NEVER waits for Firebase!
 * Returns null if no active session exists (never defaults to a demo student).
 */
export function getInitialSession(): UserSession | null {
  try {
    // 1. Check active session storage
    const raw = sessionStorage.getItem('yemen_edu_active_session');
    if (raw) {
      const parsed: UserSession = JSON.parse(raw);
      if (parsed && parsed.code) {
        if (!parsed.class && parsed.grade) parsed.class = parsed.grade;
        if (!parsed.studentCode && parsed.code) parsed.studentCode = parsed.code;
        return parsed;
      }
    }

    // 2. Check cached session in localStorage
    const cachedSessionRaw = localStorage.getItem('yemenedu_cached_session');
    if (cachedSessionRaw) {
      const parsed: UserSession = JSON.parse(cachedSessionRaw);
      if (parsed && parsed.code) {
        if (!parsed.class && parsed.grade) parsed.class = parsed.grade;
        if (!parsed.studentCode && parsed.code) parsed.studentCode = parsed.code;
        return parsed;
      }
    }

    // 3. Check saved activation code in localStorage
    const savedCode = localStorage.getItem('yemenedu_activation_code');
    if (savedCode) {
      const resolved = resolveLocalSessionForCode(savedCode);
      if (resolved) {
        sessionStorage.setItem('yemen_edu_active_session', JSON.stringify(resolved));
        return resolved;
      }
    }
  } catch (e) {
    console.warn('Error reading initial session from storage:', e);
  }
  return null;
}

class AuthService {
  private currentSession: UserSession | null = null;
  private codes: ActivationCodeRecord[] = [];
  private schools: School[] = [];
  private initialized = false;
  private listeners: Array<() => void> = [];

  constructor() {
    // 1. Populate session synchronously from local storage
    this.currentSession = getInitialSession();

    // 2. Populate codes only from admin-generated local backup (starts empty 0)
    this.codes = [];
    try {
      const backup = localStorage.getItem('yemenedu_excel_codes_backup');
      if (backup) {
        const parsed: ActivationCodeRecord[] = JSON.parse(backup);
        if (Array.isArray(parsed)) {
          this.codes = parsed;
        }
      }
    } catch {}

    // 3. Kick off background non-blocking Firestore sync
    this.bootstrapFirestore();
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
        console.error('Listener notification error:', err);
      }
    });
  }

  public async bootstrapFirestore(): Promise<void> {
    if (this.initialized) return;
    try {
      await ensureAuthReady();

      // 1. Initialize Super Admin collection & default school
      await initSuperAdmin();

      // 2. Real-time sync for schools (never auto-seeds default school)
      onSnapshot(
        collection(db, 'schools'),
        async (snap) => {
          this.schools = snap.empty ? [] : snap.docs.map((d) => d.data() as School);
          // Also sync session expiration if active
          if (this.currentSession && !this.currentSession.isLifetime) {
            const currentSchool = this.schools.find((s) => s.id === this.currentSession?.schoolId);
            if (currentSchool?.subscriptionExpiresAt) {
              this.currentSession.expiresAt = currentSchool.subscriptionExpiresAt;
              const exp = new Date(currentSchool.subscriptionExpiresAt);
              const now = new Date();
              const diffMs = exp.getTime() - now.getTime();
              this.currentSession.daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            }
          }
          this.notify();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'schools');
        }
      );

      // 3. Real-time sync for activation codes from Firestore
      onSnapshot(
        collection(db, 'codes'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map((d) => d.data() as ActivationCodeRecord);
            const map = new Map<string, ActivationCodeRecord>();
            list.forEach((c) => {
              if (c && c.code) map.set(c.code.toUpperCase(), c);
            });
            // Merge with current in-memory
            this.codes.forEach((c) => {
              if (c && c.code && !map.has(c.code.toUpperCase())) {
                map.set(c.code.toUpperCase(), c);
              }
            });
            this.codes = Array.from(map.values());
            this.notify();
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'codes');
        }
      );

      // Also listen to activation_codes if any legacy records exist
      onSnapshot(
        collection(db, 'activation_codes'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map((d) => d.data() as ActivationCodeRecord);
            let hasNew = false;
            const currentCodes = new Set(this.codes.map((c) => c.code.toUpperCase()));
            list.forEach((c) => {
              if (c && c.code && !currentCodes.has(c.code.toUpperCase())) {
                this.codes.push(c);
                hasNew = true;
                // Auto-sync into codes collection
                setDoc(doc(db, 'codes', c.code.toUpperCase()), cleanFirestorePayload(c), { merge: true }).catch(() => {});
              }
            });
            if (hasNew) this.notify();
          }
        },
        () => {}
      );

      // Perform direct full query across collections
      this.syncAllCodesFromFirestore().catch((e) => console.warn('Direct codes sync notice:', e));

      // 4. Load cached active session from in-memory / session storage for reload resilience
      const rawSession = sessionStorage.getItem('yemen_edu_active_session');
      if (rawSession) {
        try {
          const parsed: UserSession = JSON.parse(rawSession);
          if (parsed) {
            if (!parsed.class && parsed.grade) parsed.class = parsed.grade;
            if (!parsed.studentCode && parsed.code) parsed.studentCode = parsed.code;
          }
          if (parsed.isLifetime) {
            this.currentSession = parsed;
          } else {
            const school = this.schools.find((s) => s.id === parsed.schoolId);
            const expStr = school?.subscriptionExpiresAt || parsed.expiresAt;
            const exp = new Date(expStr);
            const now = new Date();
            const diffMs = exp.getTime() - now.getTime();
            const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            parsed.daysRemaining = daysLeft;
            parsed.expiresAt = expStr;
            this.currentSession = parsed;
          }
        } catch {
          this.currentSession = null;
        }
      }

      this.initialized = true;
    } catch (err) {
      console.error('Error bootstrapping Firebase auth/data:', err);
    }
  }

  public getSession(): UserSession | null {
    if (!this.currentSession) return null;
    if (!this.currentSession.class && this.currentSession.grade) {
      this.currentSession.class = this.currentSession.grade;
    }
    if (!this.currentSession.studentCode && this.currentSession.code) {
      this.currentSession.studentCode = this.currentSession.code;
    }
    if (this.currentSession.isLifetime) return this.currentSession;

    const school = this.schools.find((s) => s.id === this.currentSession?.schoolId);
    const expStr = school?.subscriptionExpiresAt || this.currentSession.expiresAt;
    const exp = new Date(expStr);
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    this.currentSession.expiresAt = expStr;
    this.currentSession.daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return this.currentSession;
  }

  public getRegisteredCodes(): ActivationCodeRecord[] {
    return [...this.codes];
  }

  public getSchools(): School[] {
    return [...this.schools];
  }

  public generateSchoolPrefix(schoolName: string, reservedPrefixes: string[] = []): string {
    const cleanName = (schoolName || '').trim();
    const engOnly = cleanName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const taken = new Set<string>([
      ...this.schools.map((s) => (s.prefix || '').toUpperCase()),
      ...reservedPrefixes.map((p) => p.toUpperCase()),
    ]);

    let basePrefix = '';
    if (engOnly.length >= 3) {
      basePrefix = engOnly.substring(0, Math.min(5, engOnly.length));
    } else {
      // Deterministic hash from the full school name so Arabic schools with similar names get distinct prefixes
      let hash = 5381;
      for (let i = 0; i < cleanName.length; i++) {
        hash = ((hash << 5) + hash + cleanName.charCodeAt(i)) >>> 0;
      }
      const codeNum = (hash % 900 + 100).toString();
      basePrefix = `S${codeNum}`;
    }

    let candidate = basePrefix;
    let counter = 2;
    while (taken.has(candidate)) {
      candidate = `${basePrefix.slice(0, 4)}${counter}`;
      counter++;
    }
    return candidate;
  }

  public async addNewSchool(name: string, city: string, customPrefix?: string, customId?: string): Promise<School> {
    await ensureAuthReady();
    const trimmedName = name.trim();
    const rawPrefix = (customPrefix && customPrefix.trim()) ? customPrefix.trim().toUpperCase() : this.generateSchoolPrefix(trimmedName);
    const takenPrefixes = new Set(this.schools.map((s) => (s.prefix || '').toUpperCase()));
    let prefix = rawPrefix;
    if (takenPrefixes.has(prefix)) {
      const sameSchool = this.schools.find(
        (s) => s.prefix.toUpperCase() === prefix && (customId ? s.id === customId : s.name.trim().toLowerCase() === trimmedName.toLowerCase())
      );
      if (!sameSchool) {
        prefix = this.generateSchoolPrefix(trimmedName, Array.from(takenPrefixes));
      }
    }

    const now = new Date();
    const defaultExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const finalId = (customId && customId.trim()) ? customId.trim() : `sch-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const school: School = {
      id: finalId,
      name: trimmedName,
      prefix,
      city: city.trim() || 'صنعاء',
      isActive: true,
      subscriptionExpiresAt: defaultExpiresAt,
      subscriptionDays: 30,
      createdAt: now.toISOString(),
    };
    try {
      await setDoc(doc(db, 'schools', school.id), school);
      if (!this.schools.some((s) => s.id === school.id)) {
        this.schools = [...this.schools, school];
        this.notify();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `schools/${school.id}`);
    }
    return school;
  }

  public async deleteSchool(id: string): Promise<void> {
    await ensureAuthReady();
    try {
      await deleteDoc(doc(db, 'schools', id));
      this.schools = this.schools.filter((s) => s.id !== id);
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schools/${id}`);
    }
  }

  /**
   * Radically merge duplicate schools [RASH] & [YEMN] into [RASHEED]
   * Migrates all existing codes to schoolId: 'rasheed' and prefix 'RASHEED'
   * Deletes obsolete schools from Firestore completely
   */
  public async mergeAndCleanSchools(): Promise<{ mergedCodesCount: number; deletedSchools: string[] }> {
    await ensureAuthReady();
    const deletedSchools: string[] = [];
    let mergedCodesCount = 0;

    try {
      // 1. Ensure canonical school 'rasheed' exists in Firestore
      const rasheedRef = doc(db, 'schools', 'rasheed');
      await setDoc(
        rasheedRef,
        {
          id: 'rasheed',
          name: 'مدرسة الرشيد',
          prefix: 'RASHEED',
          city: 'صنعاء',
          isActive: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // 2. Fetch all schools and delete duplicates (RASH, YEMN, yemenedu, etc.)
      const schoolsSnap = await getDocs(collection(db, 'schools'));
      for (const d of schoolsSnap.docs) {
        if (d.id !== 'rasheed') {
          await deleteDoc(d.ref);
          deletedSchools.push(d.id);
        }
      }

      // 3. Scan all activation codes and migrate them to schoolId: 'rasheed', schoolName: 'مدرسة الرشيد'
      const codesSnap = await getDocs(collection(db, 'codes'));
      for (const d of codesSnap.docs) {
        const data = d.data() as ActivationCodeRecord;
        let needsUpdate = false;
        let updatedData: ActivationCodeRecord = { ...data };

        if (data.schoolId !== 'rasheed' || data.schoolName !== 'مدرسة الرشيد') {
          updatedData.schoolId = 'rasheed';
          updatedData.schoolName = 'مدرسة الرشيد';
          needsUpdate = true;
        }

        // Standardize any code containing -YEMN- or -RASH- to -RASHEED-
        if (data.code.includes('-YEMN-') || data.code.includes('-RASH-')) {
          const newCode = data.code.replace(/-YEMN-/g, '-RASHEED-').replace(/-RASH-/g, '-RASHEED-');
          updatedData.code = newCode;
          // Set new document with standardized code
          await setDoc(doc(db, 'codes', newCode), updatedData);
          // Delete old doc
          await deleteDoc(d.ref);
          mergedCodesCount++;
        } else if (needsUpdate) {
          await setDoc(d.ref, updatedData, { merge: true });
          mergedCodesCount++;
        }
      }

      // Update in-memory state
      this.schools = [
        {
          id: 'rasheed',
          name: 'مدرسة الرشيد',
          prefix: 'RASHEED',
          city: 'صنعاء',
          isActive: true,
        },
      ];
      this.notify();
    } catch (err) {
      console.error('Error during mergeAndCleanSchools:', err);
    }

    return { mergedCodesCount, deletedSchools };
  }

  /**
   * Activate account with code - Local-first with 5-second Firestore timeout protection!
   */
  public async activateWithCode(inputCode: string): Promise<{ success: boolean; session?: UserSession; message: string }> {
    const code = (inputCode || '').trim();
    if (!code) {
      return { success: false, message: 'الكود غير صحيح' };
    }

    // 0. Immediate local resolution: If code exists in local memory/backup, activate IMMEDIATELY without waiting!
    const localSession = resolveLocalSessionForCode(code);
    if (localSession) {
      console.log(`⚡ [AuthService] Resolved code "${code}" immediately from local cache.`);
      this.currentSession = localSession;
      sessionStorage.setItem('yemen_edu_active_session', JSON.stringify(localSession));
      localStorage.setItem('yemenedu_cached_session', JSON.stringify(localSession));
      localStorage.setItem('yemenedu_activation_code', localSession.code);
      this.notify();

      // Background non-blocking sync with Firestore
      (async () => {
        try {
          if (localSession.role === 'super_admin') {
            await withTimeout(
              setDoc(
                doc(db, 'super_admins', 'owner-nabil'),
                {
                  code: 'Ebtisaam1144',
                  name: 'نبيل الزريقي',
                  role: 'super_admin',
                  roleTitleAr: 'مدير النظام (المالك)',
                  isPermanent: true,
                  isLifetime: true,
                  phone: '773143897',
                  updatedAt: new Date().toISOString(),
                  schoolId: DEFAULT_SCHOOL_ID,
                  schoolName: 'إدارة النظام المركزية',
                },
                { merge: true }
              ),
              5000,
              'تحديث بيانات السوبر أدمن'
            );
          } else {
            await withTimeout(
              setDoc(
                doc(db, 'codes', localSession.code),
                {
                  isActivated: true,
                  activatedAt: localSession.activatedAt,
                  expiresAt: localSession.expiresAt,
                  schoolId: localSession.schoolId,
                  schoolName: localSession.schoolName,
                },
                { merge: true }
              ),
              5000,
              'تحديث تفعيل الكود في الخادم'
            );
          }
          clearFirebaseError();
        } catch (e: any) {
          console.warn('⚠️ [AuthService] Non-blocking background sync notice (offline mode active):', e?.message || e);
        }
      })();

      const expDate = new Date(localSession.expiresAt);
      const dateStr = `${expDate.getDate()}/${expDate.getMonth() + 1}/${expDate.getFullYear()}م`;
      return {
        success: true,
        session: localSession,
        message: localSession.isLifetime
          ? `مرحباً بك أستاذ ${localSession.name} - تم تفعيل حساب السوبر أدمن (صلاحية دائمة مدى الحياة)`
          : `تم التفعيل بنجاح! مرحباً بك في ${localSession.schoolName} - صالح حتى ${dateStr} (${localSession.daysRemaining} يوم متبقي)`,
      };
    }

    // 1. If not found locally, query Firestore with 5s timeout
    try {
      await ensureAuthReady(1500);

      // Check Super Admin collection in Firestore
      const ownerDocRef = doc(db, 'super_admins', 'owner-nabil');
      try {
        const ownerDocSnap = await withTimeout(
          getDoc(ownerDocRef),
          5000,
          'فحص حساب السوبر أدمن'
        );
        if (ownerDocSnap.exists()) {
          const adminData = ownerDocSnap.data();
          if (adminData.code && adminData.code.toLowerCase() === code.toLowerCase()) {
            const now = new Date();
            const session: UserSession = {
              code: adminData.code,
              name: adminData.name || 'نبيل الزريقي',
              role: 'super_admin',
              roleTitleAr: adminData.roleTitleAr || 'مدير النظام (المالك)',
              activatedAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000).toISOString(),
              daysRemaining: 9999,
              isTest: false,
              isLifetime: true,
              phone: '773143897',
              schoolId: DEFAULT_SCHOOL_ID,
              schoolName: adminData.schoolName || 'إدارة النظام المركزية',
            };
            this.currentSession = session;
            sessionStorage.setItem('yemen_edu_active_session', JSON.stringify(session));
            localStorage.setItem('yemenedu_cached_session', JSON.stringify(session));
            localStorage.setItem('yemenedu_activation_code', session.code);
            clearFirebaseError();
            return {
              success: true,
              session,
              message: `مرحباً بك أستاذ ${session.name} - تم تفعيل حساب السوبر أدمن (صلاحية دائمة مدى الحياة)`,
            };
          }
        }
      } catch (err: any) {
        console.warn('⚠️ Super admin check error/timeout in Firestore:', err?.message || err);
      }

      // Check codes collection with 5-second timeout
      const codeUpper = code.toUpperCase();
      const codeDocRef = doc(db, 'codes', codeUpper);
      let record: ActivationCodeRecord | null = null;

      try {
        const codeDocSnap = await withTimeout(
          getDoc(codeDocRef),
          5000,
          'التحقق من كود التفعيل في Firestore'
        );
        if (codeDocSnap.exists()) {
          record = codeDocSnap.data() as ActivationCodeRecord;
        } else {
          // Fallback query
          const qCode = query(collection(db, 'codes'), where('code', '==', codeUpper));
          const found = await withTimeout(
            getDocs(qCode),
            5000,
            'البحث عن الكود في Firestore'
          );
          if (!found.empty) {
            record = found.docs[0].data() as ActivationCodeRecord;
          }
        }
      } catch (queryErr: any) {
        console.error('🔥 [Firebase Error]: فشل التحقق من الكود بسبب مهلة الاتصال أو انقطاع الشبكة:', queryErr?.message || queryErr);
        setFirebaseError('مشكلة اتصال بالخادم - تعذر التحقق من الكود خلال 5 ثوانٍ');
        return {
          success: false,
          message: 'مشكلة اتصال بالخادم - اضغط إعادة المحاولة أو تأكد من الإنترنت',
        };
      }

      if (record) {
        const schoolId = (record.schoolId || DEFAULT_SCHOOL_ID).trim();
        let school = this.schools.find(
          (s) => s.id === schoolId || s.id.toLowerCase() === schoolId.toLowerCase()
        );
        if (!school && schoolId) {
          try {
            const schDoc = await withTimeout(
              getDoc(doc(db, 'schools', schoolId)),
              5000,
              'جلب بيانات المدرسة'
            );
            if (schDoc.exists()) {
              school = schDoc.data() as School;
            }
          } catch {}
        }
        if (!school) {
          school = this.schools.find(
            (s) =>
              s.prefix &&
              (s.prefix.toLowerCase() === schoolId.toLowerCase() ||
                (!record?.schoolId &&
                  record?.code.toUpperCase().includes(`-${s.prefix.toUpperCase()}-`)))
          );
        }

        // Validity is strictly calculated from the date of import / supply (createdAt / record.expiresAt), NOT from student activation!
        const finalExpiry =
          record.expiresAt ||
          school?.subscriptionExpiresAt ||
          (record.createdAt
            ? new Date(new Date(record.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

        const expDate = new Date(finalExpiry);
        const now = new Date();
        const diffMs = expDate.getTime() - now.getTime();
        const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        // Locked if school / code subscription has expired
        if (daysLeft <= 0) {
          return {
            success: false,
            message: `انتهت صلاحية الكود / اشتراك مدرستك (${record.schoolName || school?.name || 'المدرسة'}) - تواصل مع الأدمن المطور`,
          };
        }

        const resolvedTeacherSubject =
          record.role === 'teacher' && record.subject
            ? resolveSubjectItem(record.subject)?.nameAr || record.subject
            : undefined;

        const session: UserSession = {
          code: record.code,
          name: record.role === 'principal' ? record.assignedToName.replace(/صف\s*8|الصف\s*8/gi, '').trim() : record.assignedToName,
          role: record.role,
          roleTitleAr: record.role === 'principal' ? 'مدير مدرسة' : record.roleTitleAr,
          activatedAt: record.activatedAt || now.toISOString(),
          expiresAt: finalExpiry,
          daysRemaining: daysLeft,
          isTest: record.isTest || false,
          grade: record.role === 'principal' ? undefined : record.grade,
          class: record.role === 'principal' ? undefined : record.grade,
          studentCode: record.code,
          subject: record.role === 'principal' ? undefined : resolvedTeacherSubject,
          schoolId: school ? school.id : schoolId,
          schoolName: record.schoolName || school?.name || 'منصة التعليم اليمني',
        };

        // Update activation state in Firestore non-blockingly (lock to supply expiration, do not extend)
        withTimeout(
          setDoc(
            doc(db, 'codes', record.code),
            {
              isActivated: true,
              activatedAt: record.activatedAt || now.toISOString(),
              expiresAt: finalExpiry,
              schoolId: session.schoolId,
              schoolName: session.schoolName,
            },
            { merge: true }
          ),
          5000,
          'تحديث تفعيل الكود'
        ).catch(() => {});

        this.currentSession = session;
        sessionStorage.setItem('yemen_edu_active_session', JSON.stringify(session));
        localStorage.setItem('yemenedu_cached_session', JSON.stringify(session));
        localStorage.setItem('yemenedu_activation_code', session.code);
        clearFirebaseError();

        const dateStr = `${expDate.getDate()}/${expDate.getMonth() + 1}/${expDate.getFullYear()}م`;
        return {
          success: true,
          session,
          message: `تم التفعيل بنجاح! مرحباً بك في ${session.schoolName} - صالح حتى ${dateStr} (${daysLeft} يوم متبقي)`,
        };
      }
    } catch (error: any) {
      console.error('🔥 [Firebase Auth Error]:', error);
      handleFirestoreError(error, OperationType.GET, `codes/${code}`);
    }

    return { success: false, message: 'الكود غير صحيح' };
  }

  /**
   * Renew School Subscription by 30 days - DEVELOPER ADMIN ONLY
   * Extends the school's subscriptionExpiresAt by 30 days and syncs all its codes
   */
  public async renewSchoolSubscription(schoolId: string, additionalDays = 30): Promise<{ newExpiresAt: string; updatedCodesCount: number }> {
    await ensureAuthReady();
    const now = new Date();
    let currentExpiry = now;

    // Check existing school expiry
    const school = this.schools.find((s) => s.id === schoolId || s.prefix === schoolId);
    if (school?.subscriptionExpiresAt) {
      const existingDate = new Date(school.subscriptionExpiresAt);
      if (existingDate.getTime() > now.getTime()) {
        currentExpiry = existingDate; // extend from current remaining time
      }
    }

    const newExpiryDate = new Date(currentExpiry.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    const newExpiresAt = newExpiryDate.toISOString();

    // 1. Update School in Firestore
    const canonicalSchoolId = school ? school.id : schoolId;
    const schoolRef = doc(db, 'schools', canonicalSchoolId);
    await setDoc(
      schoolRef,
      {
        subscriptionExpiresAt: newExpiresAt,
        subscriptionDays: additionalDays,
        lastRenewedAt: now.toISOString(),
        isActive: true,
      },
      { merge: true }
    );

    // 2. Update all codes of this school in Firestore batch (matching by ID, prefix, name, and in-memory codes)
    let updatedCodesCount = 0;
    try {
      const normalizedCanonical = (canonicalSchoolId || '').trim().toLowerCase();
      const normalizedTarget = (schoolId || '').trim().toLowerCase();
      const normalizedPrefix = (school?.prefix || '').trim().toLowerCase();
      const matchingCodes = this.codes.filter((c) => {
        const cSid = (c.schoolId || '').trim().toLowerCase();
        if (cSid && (cSid === normalizedCanonical || cSid === normalizedTarget)) return true;
        // Reject immediately if code explicitly carries a different schoolId
        if (cSid && cSid !== normalizedCanonical && cSid !== normalizedTarget && (!normalizedPrefix || cSid !== normalizedPrefix)) {
          return false;
        }
        if (normalizedPrefix) {
          if (cSid && cSid === normalizedPrefix) return true;
          const pUpper = normalizedPrefix.toUpperCase();
          if (!cSid && c.code && c.code.toUpperCase().includes(`-${pUpper}-`)) return true;
        }
        return false;
      });

      const batch = writeBatch(db);
      matchingCodes.forEach((c) => {
        const docRef = doc(db, 'codes', c.code);
        batch.set(
          docRef,
          {
            expiresAt: newExpiresAt,
            schoolId: canonicalSchoolId,
            schoolName: school?.name || c.schoolName,
          },
          { merge: true }
        );
        c.expiresAt = newExpiresAt;
        c.schoolId = canonicalSchoolId;
        if (school?.name) c.schoolName = school.name;
        updatedCodesCount++;
      });
      await batch.commit();
    } catch (e) {
      console.warn('Batch update codes expiry notice:', e);
    }

    // 3. Update in-memory state
    const schIdx = this.schools.findIndex((s) => s.id === canonicalSchoolId);
    if (schIdx >= 0) {
      this.schools[schIdx] = {
        ...this.schools[schIdx],
        subscriptionExpiresAt: newExpiresAt,
        subscriptionDays: additionalDays,
        lastRenewedAt: now.toISOString(),
        isActive: true,
      };
    }

    // 4. Update current session if matching
    if (this.currentSession && (this.currentSession.schoolId === canonicalSchoolId || this.currentSession.schoolId === schoolId) && !this.currentSession.isLifetime) {
      this.currentSession.expiresAt = newExpiresAt;
      const diffMs = newExpiryDate.getTime() - Date.now();
      this.currentSession.daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      sessionStorage.setItem('yemen_edu_active_session', JSON.stringify(this.currentSession));
    }

    this.notify();
    return { newExpiresAt, updatedCodesCount };
  }

  /**
   * Direct, comprehensive Firestore sync reading both 'codes' and 'activation_codes'
   * Guaranteed to retrieve all real codes with 5s timeout protection and offline cache
   */
  public async syncAllCodesFromFirestore(): Promise<ActivationCodeRecord[]> {
    const map = new Map<string, ActivationCodeRecord>();

    // Pre-populate with current in-memory codes
    this.codes.forEach((c) => {
      if (c && c.code) map.set(c.code.toUpperCase(), c);
    });

    try {
      await ensureAuthReady(1500);

      // 1. Fetch from 'codes' with 5s timeout
      try {
        const snapCodes = await withTimeout(
          getDocs(collection(db, 'codes')),
          5000,
          'مزامنة الأكواد من Firestore'
        );
        snapCodes.docs.forEach((d) => {
          const data = d.data() as ActivationCodeRecord;
          if (data && data.code) {
            map.set(data.code.toUpperCase(), { ...data, code: data.code.toUpperCase() });
          }
        });
        clearFirebaseError();
      } catch (e: any) {
        console.warn('⚠️ [Codes Sync Warning]: Failed to fetch codes within 5s (offline fallback active):', e?.message || e);
      }

      // 2. Fetch from 'activation_codes' with 5s timeout
      try {
        const snapAct = await withTimeout(
          getDocs(collection(db, 'activation_codes')),
          5000,
          'مزامنة الأكواد الإضافية من Firestore'
        );
        for (const d of snapAct.docs) {
          const data = d.data() as ActivationCodeRecord;
          if (data && data.code) {
            const upper = data.code.toUpperCase();
            if (!map.has(upper)) {
              map.set(upper, { ...data, code: upper });
              // Auto copy to 'codes' in background
              withTimeout(
                setDoc(doc(db, 'codes', upper), cleanFirestorePayload({ ...data, code: upper }), { merge: true }),
                5000,
                'نسخ الكود القديم'
              ).catch(() => {});
            }
          }
        }
      } catch (e: any) {
        console.warn('⚠️ [Activation Codes Sync Warning]:', e?.message || e);
      }
    } catch (err: any) {
      console.error('🔥 [Firebase Sync Error]:', err?.message || err);
    }

    // 3. Fallback: Check localStorage backup
    try {
      const cached = localStorage.getItem('yemenedu_excel_codes_backup');
      if (cached) {
        const list: ActivationCodeRecord[] = JSON.parse(cached);
        for (const c of list) {
          if (c && c.code) {
            const upper = c.code.toUpperCase();
            if (!map.has(upper)) {
              map.set(upper, { ...c, code: upper });
              await setDoc(doc(db, 'codes', upper), cleanFirestorePayload({ ...c, code: upper }), { merge: true }).catch(() => {});
            }
          }
        }
      }
    } catch {
      // ignore
    }

    const all = Array.from(map.values());
    this.codes = all;
    this.notify();
    return all;
  }

  public async addRegisteredCode(record: ActivationCodeRecord): Promise<void> {
    await ensureAuthReady();
    const codeUpper = record.code.toUpperCase();
    const payload: ActivationCodeRecord = cleanFirestorePayload({ ...record, code: codeUpper });
    try {
      await setDoc(doc(db, 'codes', codeUpper), payload, { merge: true });
      const idx = this.codes.findIndex((c) => c.code.toUpperCase() === codeUpper);
      if (idx >= 0) {
        this.codes[idx] = payload;
      } else {
        this.codes.unshift(payload);
      }
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `codes/${record.code}`);
    }
  }

  public async addRegisteredCodesBatch(records: ActivationCodeRecord[]): Promise<void> {
    await ensureAuthReady();
    if (!records || records.length === 0) return;

    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const r of chunk) {
          const codeUpper = r.code.toUpperCase();
          const payload: ActivationCodeRecord = cleanFirestorePayload({ ...r, code: codeUpper });
          const ref = doc(db, 'codes', codeUpper);
          batch.set(ref, payload, { merge: true });

          const idx = this.codes.findIndex((c) => c.code.toUpperCase() === codeUpper);
          if (idx >= 0) {
            this.codes[idx] = payload;
          } else {
            this.codes.unshift(payload);
          }
        }
        await batch.commit();
      }

      try {
        localStorage.setItem('yemenedu_excel_codes_backup', JSON.stringify(this.codes));
      } catch {
        // ignore
      }

      this.notify();
    } catch (error) {
      console.error('Batch commit error:', error);
      // Fallback to sequential setDoc if batch failed
      for (const r of records) {
        await this.addRegisteredCode(r);
      }
    }
  }

  public async deleteCode(code: string): Promise<void> {
    await ensureAuthReady();
    const upper = code.toUpperCase();
    try {
      await deleteDoc(doc(db, 'codes', upper));
      this.codes = this.codes.filter((c) => c.code.toUpperCase() !== upper);
      this.notify();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `codes/${code}`);
    }
  }

  /**
   * Delete test codes permanently from Firebase and memory per User Requirement 3:
   * M-YEMN-5190, T-8-SCI-YEMN-8842, STU-8-YEMN-4951, STU-9-YEMN-7301,
   * and any code containing YEMN or RASHEED or TEST or NOUR.
   */
  public async deleteTestCodesOnly(): Promise<number> {
    await ensureAuthReady();
    let count = 0;
    const testCodePatterns = [
      'M-YEMN-5190',
      'T-8-SCI-YEMN-8842',
      'STU-8-YEMN-4951',
      'STU-9-YEMN-7301',
    ];

    const isTargetTestCode = (codeStr: string) => {
      const c = (codeStr || '').trim().toUpperCase();
      if (!c) return false;
      if (testCodePatterns.includes(c)) return true;
      if (
        c.includes('YEMN') ||
        c.includes('RASHEED') ||
        c.includes('TEST') ||
        c.includes('NOUR') ||
        c.startsWith('-')
      ) {
        return true;
      }
      return false;
    };

    const targetCollections = [
      'codes',
      'registeredCodes',
      'activation_codes',
      'students',
      'teachers',
      'submissions',
      'grades',
    ];

    for (const colName of targetCollections) {
      try {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          const data = d.data();
          const docCode = (data?.code || data?.studentCode || d.id || '').trim().toUpperCase();
          if (isTargetTestCode(docCode)) {
            await deleteDoc(d.ref);
            count++;
          }
        }
      } catch (e) {
        console.warn(`Error deleting test codes from ${colName}:`, e);
      }
    }

    // Filter memory & local storage backup
    this.codes = this.codes.filter((c) => !isTargetTestCode(c.code));
    try {
      localStorage.setItem('yemenedu_excel_codes_backup', JSON.stringify(this.codes));
    } catch {}

    const savedCode = localStorage.getItem('yemenedu_activation_code');
    if (savedCode && isTargetTestCode(savedCode)) {
      localStorage.removeItem('yemenedu_activation_code');
    }

    this.notify();
    return count;
  }

  public async clearFakeCodes(): Promise<number> {
    return this.deleteTestCodesOnly();
  }

  public async deleteAllFakeAndTestCodes(): Promise<number> {
    return this.deleteTestCodesOnly();
  }

  public async purgeOldAndInvalidCodes(): Promise<number> {
    return this.deleteTestCodesOnly();
  }

  /**
   * Complete Wipe - Zeroes all records from Firebase and client storage per User Requirements 2 & 4:
   * Wipes collections: registeredCodes, codes, activation_codes, students, teachers, grades, submissions, schools.
   * Leaves active codes count = 0, schools count = 0, and NEVER re-seeds anything.
   */
  public async clearOldCodes(): Promise<{ deletedCount: number }> {
    await ensureAuthReady();
    let count = 0;
    const collectionsToWipe = [
      'registeredCodes',
      'codes',
      'activation_codes',
      'students',
      'teachers',
      'grades',
      'submissions',
      'schools',
      'questions',
      'answered_questions',
    ];

    for (const colName of collectionsToWipe) {
      try {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          if (d.id.toUpperCase() === 'EBTISAAM1144') continue;
          await deleteDoc(d.ref);
          count++;
        }
      } catch (e) {
        console.warn(`Error wiping ${colName}:`, e);
      }
    }

    this.codes = [];
    this.schools = [];
    try {
      localStorage.removeItem('yemenedu_excel_codes_backup');
      localStorage.removeItem('yemenedu_cached_session');
      if (this.currentSession?.role !== 'super_admin') {
        this.currentSession = null;
        sessionStorage.removeItem('yemen_edu_active_session');
        localStorage.removeItem('yemenedu_activation_code');
      }
    } catch {}

    this.notify();
    return { deletedCount: count };
  }

  /**
   * Repair any legacy activation codes that accidentally received Arabic letters
   * (e.g. T-8-الت-SAM-3139 -> T-8-ISL-SAM-3139) cleanly in Firestore & memory.
   */
  public async repairArabicTeacherCodes(): Promise<{ repairedCount: number; mappings: Array<{ oldCode: string; newCode: string }> }> {
    await ensureAuthReady();
    const arabicRegex = /[\u0600-\u06FF]/;
    const targets = this.codes.filter((c) => arabicRegex.test(c.code || ''));
    const mappings: Array<{ oldCode: string; newCode: string }> = [];

    for (const oldRec of targets) {
      const oldCode = oldRec.code;
      const resolvedSub = resolveSubjectCodeAscii(oldRec.subject || oldRec.roleTitleAr || oldRec.assignedToName);
      const parts = oldCode.split('-');
      const fixedParts = parts.map((part) => {
        if (!arabicRegex.test(part)) return part;
        return resolvedSub.code;
      });
      let newCode = fixedParts.join('-').toUpperCase();
      if (arabicRegex.test(newCode) || newCode === oldCode.toUpperCase()) {
        const rnd = Math.floor(1000 + Math.random() * 9000);
        const gradePart = oldRec.grade || '8';
        const schoolObj = this.schools.find((s) => s.id === oldRec.schoolId);
        const prefixPart = (schoolObj?.prefix || 'SCHL').toUpperCase();
        newCode = `T-${gradePart}-${resolvedSub.code}-${prefixPart}-${rnd}`;
      }

      const updatedRec: ActivationCodeRecord = cleanFirestorePayload({
        ...oldRec,
        code: newCode,
        subject: oldRec.role === 'teacher' ? resolvedSub.nameAr : oldRec.subject,
        roleTitleAr:
          oldRec.role === 'teacher' && resolvedSub.nameAr
            ? `معلم ${resolvedSub.nameAr} صف ${oldRec.grade || '8'}`
            : oldRec.roleTitleAr,
      });

      try {
        await setDoc(doc(db, 'codes', newCode), updatedRec, { merge: true });
        await deleteDoc(doc(db, 'codes', oldCode)).catch(() => {});
        await deleteDoc(doc(db, 'codes', oldCode.toUpperCase())).catch(() => {});
        await deleteDoc(doc(db, 'registeredCodes', oldCode)).catch(() => {});
        await deleteDoc(doc(db, 'activation_codes', oldCode)).catch(() => {});
        this.codes = [
          updatedRec,
          ...this.codes.filter(
            (c) => c.code.toUpperCase() !== oldCode.toUpperCase() && c.code.toUpperCase() !== newCode
          ),
        ];
        mappings.push({ oldCode, newCode });
      } catch (err) {
        console.warn(`Failed repairing code ${oldCode}:`, err);
      }
    }

    if (mappings.length > 0) {
      try {
        localStorage.setItem('yemenedu_excel_codes_backup', JSON.stringify(this.codes));
      } catch {
        // ignore
      }
      await this.syncAllCodesFromFirestore();
    }
    return { repairedCount: mappings.length, mappings };
  }

  public logout() {
    this.currentSession = null;
    sessionStorage.removeItem('yemen_edu_active_session');
  }
}

export const authService = new AuthService();
