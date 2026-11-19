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

export type UserRole = 'admin' | 'super_admin' | 'principal' | 'supervisor' | 'teacher' | 'student';

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

export function getSubjectsForGrade(_grade: string): SubjectItem[] { return ALL_SUBJECTS; }

export function normalizeArabicForMatch(text: string): string {
  return (text || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىئ]/g, 'ي').replace(/ؤ/g, 'و').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function resolveSubjectItem(rawSubject?: string): SubjectItem | undefined {
  const norm = normalizeArabicForMatch(rawSubject || '');
  if (!norm) return undefined;
  const direct = ALL_SUBJECTS.find((s) => { const sNorm = normalizeArabicForMatch(s.nameAr); return sNorm === norm || sNorm.includes(norm) || norm.includes(sNorm); });
  if (direct) return direct;
  const findByCode = (code: string) => ALL_SUBJECTS.find((s) => s.code === code);
  if (norm.includes('قران') || norm.includes('تجويد') || norm.includes('تلاوه') || norm.includes('quran') || norm === 'qur') return findByCode('QUR');
  if (norm.includes('اسلام') || norm.includes('دين') || norm.includes('فقه') || norm.includes('توحيد') || norm.includes('حديث') || norm.includes('islamic') || norm === 'isl') return findByCode('ISL');
  if (norm.includes('عرب') || norm.includes('نحو') || norm.includes('ادب') || norm.includes('املا') || norm.includes('arabic') || norm === 'arb') return findByCode('ARB');
  if (norm.includes('انجليز') || norm.includes('انكلش') || norm.includes('english') || norm === 'eng') return findByCode('ENG');
  if (norm.includes('رياض') || norm.includes('حساب') || norm.includes('جبر') || norm.includes('هندس') || norm.includes('math')) return findByCode('MATH');
  if (norm.includes('علوم') || norm.includes('فيزيا') || norm.includes('كيميا') || norm.includes('احيا') || norm.includes('science') || norm === 'sci') return findByCode('SCI');
  if (norm.includes('اجتماع') || norm.includes('تاريخ') || norm.includes('جغراف') || norm.includes('وطني') || norm.includes('social') || norm === 'soc') return findByCode('SOC');
  return undefined;
}

export function resolveSubjectCodeAscii(rawSubject?: string): { code: string; nameAr: string } {
  const cleanRaw = (rawSubject || '').trim();
  const matched = resolveSubjectItem(cleanRaw);
  if (matched) return { code: matched.code, nameAr: matched.nameAr };
  const norm = normalizeArabicForMatch(cleanRaw);
  if (norm.includes('حاسوب') || norm.includes('كمبيوتر') || norm.includes('تقن') || norm.includes('برمج')) return { code: 'COMP', nameAr: cleanRaw || 'الحاسوب' };
  if (norm.includes('فني') || norm.includes('رسم')) return { code: 'ART', nameAr: cleanRaw || 'التربية الفنية' };
  if (norm.includes('بدني')) return { code: 'PE', nameAr: cleanRaw || 'التربية البدنية' };
  if (norm.includes('فرنس')) return { code: 'FR', nameAr: cleanRaw || 'اللغة الفرنسية' };
  const asciiOnly = cleanRaw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return asciiOnly.length >= 2 ? { code: asciiOnly, nameAr: cleanRaw } : { code: 'SUB', nameAr: cleanRaw };
}

export function cleanFirestorePayload<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) result[key] = value;
  return result as T;
}

export interface ActivationCodeRecord {
  code: string; role: UserRole; roleTitleAr: string; assignedToName: string;
  grade?: '7' | '8' | '9'; class?: string; subject?: string; phone?: string;
  schoolId: string; schoolName: string; isTest: boolean; createdAt: string;
  isActivated: boolean; activatedAt?: string; expiresAt?: string;
}

export const DEFAULT_SCHOOL_ID = 'rasheed';
export const DEFAULT_SCHOOLS: School[] = [];
let hasInitializedSuperAdmin = false;
let initSuperAdminPromise: Promise<void> | null = null;

export async function initSuperAdmin(): Promise<void> {
  if (hasInitializedSuperAdmin) return;
  if (initSuperAdminPromise) return initSuperAdminPromise;
  initSuperAdminPromise = (async () => {
    try {
      await ensureAuthReady(1500);
      const now = new Date().toISOString();
      const superAdminRef = doc(db, 'super_admins', 'owner-nabil');
      try {
        const snap = await withTimeout(getDoc(superAdminRef), 5000, 'فحص حساب المالك في Firestore');
        if (!snap.exists()) await withTimeout(setDoc(superAdminRef, { code: 'Ebtisaam1144', name: 'نبيل الزريقي', role: 'super_admin', roleTitleAr: 'مدير النظام (المالك)', isPermanent: true, isLifetime: true, email: 'owner', phone: '773143897', createdAt: now, schoolId: 'yemenedu', schoolName: 'إدارة النظام المركزية' }), 5000, 'إنشاء حساب المالك في Firestore');
        else await withTimeout(setDoc(superAdminRef, { phone: '773143897' }, { merge: true }), 5000, 'تحديث هاتف المالك في Firestore');
        hasInitializedSuperAdmin = true;
      } catch (e: any) { console.log('ℹ️ [initSuperAdmin Notice]:', e?.message || e); }
    } catch (err: any) { console.log('ℹ️ [initSuperAdmin Global Notice]:', err?.message || err); }
    finally { initSuperAdminPromise = null; }
  })();
  return initSuperAdminPromise;
}

export function resolveLocalSessionForCode(inputCode: string): UserSession | null {
  const code = (inputCode || '').trim();
  if (!code) return null;
  const now = new Date();
  if (code.toLowerCase() === 'ebtisaam1144') return { code: 'Ebtisaam1144', name: 'نبيل الزريقي', role: 'super_admin', roleTitleAr: 'مدير النظام (المالك)', activatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 3650 * 86400000).toISOString(), daysRemaining: 9999, isTest: false, isLifetime: true, phone: '773143897', schoolId: 'central-admin', schoolName: 'إدارة النظام المركزية' };
  try {
    const raw = localStorage.getItem('yemenedu_excel_codes_backup');
    if (raw) {
      const parsed: ActivationCodeRecord[] = JSON.parse(raw);
      const match = parsed.find((c) => c?.code?.toUpperCase() === code.toUpperCase());
      if (match) {
        const expiry = match.expiresAt || (match.createdAt ? new Date(new Date(match.createdAt).getTime() + 30 * 86400000).toISOString() : new Date(now.getTime() + 30 * 86400000).toISOString());
        const days = Math.max(0, Math.ceil((new Date(expiry).getTime() - now.getTime()) / 86400000));
        const isPrincipal = match.role === 'principal';
        return { code: match.code, name: isPrincipal ? match.assignedToName.replace(/صف\s*8|الصف\s*8/gi, '').trim() : match.assignedToName, role: match.role, roleTitleAr: isPrincipal ? 'مدير مدرسة' : match.roleTitleAr, activatedAt: match.activatedAt || now.toISOString(), expiresAt: expiry, daysRemaining: days, isTest: match.isTest || false, grade: isPrincipal ? undefined : match.grade, class: isPrincipal ? undefined : (match.class || match.grade), studentCode: match.code, subject: isPrincipal || match.role === 'supervisor' ? undefined : match.subject, schoolId: match.schoolId || '', schoolName: match.schoolName || '' };
      }
    }
  } catch { /* ignore corrupt local backup */ }
  return null;
}

export function getInitialSession(): UserSession | null {
  try {
    const raw = sessionStorage.getItem('yemen_edu_active_session');
    if (raw) { const parsed: UserSession = JSON.parse(raw); if (parsed?.code) { if (!parsed.class && parsed.grade) parsed.class = parsed.grade; if (!parsed.studentCode && parsed.code) parsed.studentCode = parsed.code; return parsed; } }
    const cached = localStorage.getItem('yemenedu_cached_session');
    if (cached) { const parsed: UserSession = JSON.parse(cached); if (parsed?.code) { if (!parsed.class && parsed.grade) parsed.class = parsed.grade; if (!parsed.studentCode && parsed.code) parsed.studentCode = parsed.code; return parsed; } }
    const savedCode = localStorage.getItem('yemenedu_activation_code');
    if (savedCode) { const resolved = resolveLocalSessionForCode(savedCode); if (resolved) { sessionStorage.setItem('yemen_edu_active_session', JSON.stringify(resolved)); return resolved; } }
  } catch (e) { console.warn('Error reading initial session:', e); }
  return null;
}

class AuthService {
  private currentSession: UserSession | null = null;
  private codes: ActivationCodeRecord[] = [];
  private schools: School[] = [];
  private initialized = false;
  private listeners: Array<() => void> = [];
  constructor() { this.currentSession = getInitialSession(); try { const backup = localStorage.getItem('yemenedu_excel_codes_backup'); if (backup) { const parsed: ActivationCodeRecord[] = JSON.parse(backup); if (Array.isArray(parsed)) this.codes = parsed; } } catch {} this.bootstrapFirestore(); }
  public subscribe(cb: () => void): () => void { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((l) => l !== cb); }; }
  private notify() { this.listeners.forEach((cb) => { try { cb(); } catch (err) { console.error('Listener notification error:', err); } }); }
  public async bootstrapFirestore(): Promise<void> {
    if (this.initialized) return;
    try {
      await ensureAuthReady(); await initSuperAdmin();
      onSnapshot(collection(db, 'schools'), (snap) => { this.schools = snap.empty ? [] : snap.docs.map((d) => d.data() as School); if (this.currentSession && !this.currentSession.isLifetime) { const school = this.schools.find((s) => s.id === this.currentSession?.schoolId); if (school?.subscriptionExpiresAt) { this.currentSession.expiresAt = school.subscriptionExpiresAt; this.currentSession.daysRemaining = Math.max(0, Math.ceil((new Date(school.subscriptionExpiresAt).getTime() - Date.now()) / 86400000)); } } this.notify(); }, (error) => handleFirestoreError(error, OperationType.LIST, 'schools'));
      onSnapshot(collection(db, 'codes'), (snap) => { if (!snap.empty) { const map = new Map<string, ActivationCodeRecord>(); snap.docs.forEach((d) => { const c = d.data() as ActivationCodeRecord; if (c?.code) map.set(c.code.toUpperCase(), c); }); this.codes.forEach((c) => { if (c?.code && !map.has(c.code.toUpperCase())) map.set(c.code.toUpperCase(), c); }); this.codes = Array.from(map.values()); this.notify(); } }, (error) => handleFirestoreError(error, OperationType.LIST, 'codes'));
      onSnapshot(collection(db, 'activation_codes'), (snap) => { if (!snap.empty) { let changed = false; const existing = new Set(this.codes.map((c) => c.code.toUpperCase())); snap.docs.forEach((d) => { const c = d.data() as ActivationCodeRecord; if (c?.code && !existing.has(c.code.toUpperCase())) { this.codes.push(c); changed = true; setDoc(doc(db, 'codes', c.code.toUpperCase()), cleanFirestorePayload(c), { merge: true }).catch(() => {}); } }); if (changed) this.notify(); } }, () => {});
      this.syncAllCodesFromFirestore().catch((e) => console.warn('Codes sync notice:', e));
      const rawSession = sessionStorage.getItem('yemen_edu_active_session');
      if (rawSession) { try { const parsed: UserSession = JSON.parse(rawSession); if (!parsed.class && parsed.grade) parsed.class = parsed.grade; if (!parsed.studentCode && parsed.code) parsed.studentCode = parsed.code; if (parsed.isLifetime) this.currentSession = parsed; else { const school = this.schools.find((s) => s.id === parsed.schoolId); const expiry = school?.subscriptionExpiresAt || parsed.expiresAt; parsed.daysRemaining = Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)); parsed.expiresAt = expiry; this.currentSession = parsed; } } catch { this.currentSession = null; } }
      this.initialized = true;
    } catch (err) { console.error('Error bootstrapping Firebase auth/data:', err); }
  }
  public getSession(): UserSession | null { if (!this.currentSession) return null; if (!this.currentSession.class && this.currentSession.grade) this.currentSession.class = this.currentSession.grade; if (!this.currentSession.studentCode && this.currentSession.code) this.currentSession.studentCode = this.currentSession.code; if (this.currentSession.isLifetime) return this.currentSession; const school = this.schools.find((s) => s.id === this.currentSession?.schoolId); const expiry = school?.subscriptionExpiresAt || this.currentSession.expiresAt; this.currentSession.expiresAt = expiry; this.currentSession.daysRemaining = Math.max(0, Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)); return this.currentSession; }
  public getRegisteredCodes(): ActivationCodeRecord[] { return [...this.codes]; }
  public getSchools(): School[] { return [...this.schools]; }
  public generateSchoolPrefix(schoolName: string, reservedPrefixes: string[] = []): string { const clean = (schoolName || '').trim(); const eng = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); const taken = new Set([...this.schools.map((s) => (s.prefix || '').toUpperCase()), ...reservedPrefixes.map((p) => p.toUpperCase())]); let base = eng.length >= 3 ? eng.substring(0, Math.min(5, eng.length)) : `S${((Array.from(clean).reduce((h,c)=>((h<<5)+h+c.charCodeAt(0))>>>0,5381)%900)+100)}`; let candidate = base; let counter = 2; while (taken.has(candidate)) { candidate = `${base.slice(0,4)}${counter++}`; } return candidate; }
  public async addNewSchool(name: string, city: string, customPrefix?: string, customId?: string): Promise<School> { await ensureAuthReady(); const trimmed = name.trim(); let prefix = customPrefix?.trim() ? customPrefix.trim().toUpperCase() : this.generateSchoolPrefix(trimmed); const taken = new Set(this.schools.map(s=>(s.prefix||'').toUpperCase())); if(taken.has(prefix)&&!this.schools.some(s=>s.prefix.toUpperCase()===prefix&&(customId?s.id===customId:s.name.trim().toLowerCase()===trimmed.toLowerCase()))) prefix=this.generateSchoolPrefix(trimmed,Array.from(taken)); const now=new Date(); const school:School={id:customId?.trim()||`sch-${Date.now()}-${Math.floor(100+Math.random()*900)}`,name:trimmed,prefix,city:city.trim()||'صنعاء',isActive:true,subscriptionExpiresAt:new Date(now.getTime()+30*86400000).toISOString(),subscriptionDays:30,createdAt:now.toISOString()}; await setDoc(doc(db,'schools',school.id),school); if(!this.schools.some(s=>s.id===school.id)){this.schools=[...this.schools,school];this.notify();} return school; }
  public async deleteSchool(id: string): Promise<void> { await ensureAuthReady(); try { await deleteDoc(doc(db,'schools',id));this.schools=this.schools.filter(s=>s.id!==id);this.notify(); } catch(error){handleFirestoreError(error,OperationType.DELETE,`schools/${id}`);} }
  public async mergeAndCleanSchools(): Promise<{mergedCodesCount:number;deletedSchools:string[]}> { await ensureAuthReady(); const deletedSchools:string[]=[];let mergedCodesCount=0;try{await setDoc(doc(db,'schools','rasheed'),{id:'rasheed',name:'مدرسة الرشيد',prefix:'RASHEED',city:'صنعاء',isActive:true,updatedAt:new Date().toISOString()},{merge:true});const schools=await getDocs(collection(db,'schools'));for(const d of schools.docs)if(d.id!=='rasheed'){await deleteDoc(d.ref);deletedSchools.push(d.id);}const codes=await getDocs(collection(db,'codes'));for(const d of codes.docs){const data=d.data() as ActivationCodeRecord;let updated={...data};let changed=false;if(data.schoolId!=='rasheed'||data.schoolName!=='مدرسة الرشيد'){updated={...updated,schoolId:'rasheed',schoolName:'مدرسة الرشيد'};changed=true;}if(data.code.includes('-YEMN-')||data.code.includes('-RASH-')){const newCode=data.code.replace(/-YEMN-/g,'-RASHEED-').replace(/-RASH-/g,'-RASHEED-');await setDoc(doc(db,'codes',newCode),{...updated,code:newCode});await deleteDoc(d.ref);mergedCodesCount++;}else if(changed){await setDoc(d.ref,updated,{merge:true});mergedCodesCount++;}}this.schools=[{id:'rasheed',name:'مدرسة الرشيد',prefix:'RASHEED',city:'صنعاء',isActive:true}];this.notify();}catch(err){console.error('Error during mergeAndCleanSchools:',err);}return{mergedCodesCount,deletedSchools}; }
  public async activateWithCode(inputCode:string):Promise<{success:boolean;session?:UserSession;message:string}>{const code=(inputCode||'').trim();if(!code)return{success:false,message:'الكود غير صحيح'};const local=resolveLocalSessionForCode(code);if(local){this.setActiveSession(local);(async()=>{try{if(local.role==='super_admin')await withTimeout(setDoc(doc(db,'super_admins','owner-nabil'),{code:'Ebtisaam1144',name:'نبيل الزريقي',role:'super_admin',roleTitleAr:'مدير النظام (المالك)',isPermanent:true,isLifetime:true,phone:'773143897',updatedAt:new Date().toISOString(),schoolId:DEFAULT_SCHOOL_ID,schoolName:'إدارة النظام المركزية'},{merge:true}),5000,'تحديث بيانات السوبر أدمن');else await withTimeout(setDoc(doc(db,'codes',local.code),{isActivated:true,activatedAt:local.activatedAt,expiresAt:local.expiresAt,schoolId:local.schoolId,schoolName:local.schoolName},{merge:true}),5000,'تحديث تفعيل الكود');clearFirebaseError();}catch(e:any){console.warn('Background activation sync:',e?.message||e);}})();const d=new Date(local.expiresAt);return{success:true,session:local,message:local.isLifetime?`مرحباً بك أستاذ ${local.name} - تم تفعيل حساب السوبر أدمن`: `تم التفعيل بنجاح! مرحباً بك في ${local.schoolName} - صالح حتى ${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}م (${local.daysRemaining} يوم متبقي)`};}
    try{await ensureAuthReady(1500);const owner=await withTimeout(getDoc(doc(db,'super_admins','owner-nabil')),5000,'فحص حساب السوبر أدمن');if(owner.exists()){const data=owner.data();if(data.code&&data.code.toLowerCase()===code.toLowerCase()){const now=new Date();const session:UserSession={code:data.code,name:data.name||'نبيل الزريقي',role:'super_admin',roleTitleAr:data.roleTitleAr||'مدير النظام (المالك)',activatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+3650*86400000).toISOString(),daysRemaining:9999,isTest:false,isLifetime:true,phone:'773143897',schoolId:DEFAULT_SCHOOL_ID,schoolName:data.schoolName||'إدارة النظام المركزية'};this.setActiveSession(session);clearFirebaseError();return{success:true,session,message:`مرحباً بك أستاذ ${session.name} - تم تفعيل حساب السوبر أدمن`};}}
      const upper=code.toUpperCase();let record:ActivationCodeRecord|null=null;try{const snap=await withTimeout(getDoc(doc(db,'codes',upper)),5000,'التحقق من كود التفعيل');if(snap.exists())record=snap.data() as ActivationCodeRecord;else{const found=await withTimeout(getDocs(query(collection(db,'codes'),where('code','==',upper))),5000,'البحث عن الكود');if(!found.empty)record=found.docs[0].data() as ActivationCodeRecord;}}catch(e:any){setFirebaseError('مشكلة اتصال بالخادم - تعذر التحقق من الكود');return{success:false,message:'مشكلة اتصال بالخادم - اضغط إعادة المحاولة أو تأكد من الإنترنت'};}
      if(record){const schoolId=(record.schoolId||DEFAULT_SCHOOL_ID).trim();let school=this.schools.find(s=>s.id.toLowerCase()===schoolId.toLowerCase());if(!school&&schoolId){try{const s=await withTimeout(getDoc(doc(db,'schools',schoolId)),5000,'جلب بيانات المدرسة');if(s.exists())school=s.data() as School;}catch{}}
        const expiry=record.expiresAt||school?.subscriptionExpiresAt||(record.createdAt?new Date(new Date(record.createdAt).getTime()+30*86400000).toISOString():new Date(Date.now()+30*86400000).toISOString());const expDate=new Date(expiry);const days=Math.max(0,Math.ceil((expDate.getTime()-Date.now())/86400000));if(days<=0)return{success:false,message:`انتهت صلاحية الكود / اشتراك مدرستك (${record.schoolName||school?.name||'المدرسة'}) - تواصل مع الأدمن المطور`};
        const isPrincipal=record.role==='principal';const isSupervisor=record.role==='supervisor';const session:UserSession={code:record.code,name:isPrincipal||isSupervisor?record.assignedToName.replace(/صف\s*8|الصف\s*8/gi,'').trim():record.assignedToName,role:record.role,roleTitleAr:isPrincipal?'مدير مدرسة':isSupervisor?'مشرف م��رسي':record.roleTitleAr,activatedAt:record.activatedAt||new Date().toISOString(),expiresAt:expiry,daysRemaining:days,isTest:record.isTest||false,grade:isPrincipal?undefined:record.grade,class:isPrincipal?undefined:(record.class||record.grade),studentCode:record.code,subject:isPrincipal||isSupervisor?undefined:(record.role==='teacher'&&record.subject?(resolveSubjectItem(record.subject)?.nameAr||record.subject):record.subject),schoolId:school?.id||schoolId,schoolName:record.schoolName||school?.name||'منصة التعليم اليمني'};
        setDoc(doc(db,'codes',record.code),{isActivated:true,activatedAt:record.activatedAt||session.activatedAt,expiresAt:expiry,schoolId:session.schoolId,schoolName:session.schoolName},{merge:true}).catch(()=>{});this.setActiveSession(session);clearFirebaseError();return{success:true,session,message:`تم التفعيل بنجاح! مرحباً بك في ${session.schoolName} (${session.roleTitleAr})`};}
    }catch(error:any){console.error('Activation error:',error);handleFirestoreError(error,OperationType.GET,`codes/${code}`);}return{success:false,message:'الكود غير صحيح'};}
  private setActiveSession(session:UserSession){this.currentSession=session;sessionStorage.setItem('yemen_edu_active_session',JSON.stringify(session));localStorage.setItem('yemenedu_cached_session',JSON.stringify(session));localStorage.setItem('yemenedu_activation_code',session.code);this.notify();}
  public async renewSchoolSubscription(schoolId:string,additionalDays=30):Promise<{newExpiresAt:string;updatedCodesCount:number}>{await ensureAuthReady();const now=new Date();const school=this.schools.find(s=>s.id===schoolId||s.prefix===schoolId);let current=now;if(school?.subscriptionExpiresAt&&new Date(school.subscriptionExpiresAt)>now)current=new Date(school.subscriptionExpiresAt);const expiry=new Date(current.getTime()+additionalDays*86400000).toISOString();const canonical=school?.id||schoolId;await setDoc(doc(db,'schools',canonical),{subscriptionExpiresAt:expiry,subscriptionDays:additionalDays,lastRenewedAt:now.toISOString(),isActive:true},{merge:true});let updatedCodesCount=0;try{const batch=writeBatch(db);this.codes.filter(c=>(c.schoolId||'').toLowerCase()===canonical.toLowerCase()).forEach(c=>{batch.set(doc(db,'codes',c.code),{expiresAt:expiry,schoolId:canonical,schoolName:school?.name||c.schoolName},{merge:true});c.expiresAt=expiry;updatedCodesCount++;});await batch.commit();}catch(e){console.warn('Batch update codes expiry notice:',e);}const idx=this.schools.findIndex(s=>s.id===canonical);if(idx>=0)this.schools[idx]={...this.schools[idx],subscriptionExpiresAt:expiry,subscriptionDays:additionalDays,lastRenewedAt:now.toISOString(),isActive:true};if(this.currentSession?.schoolId===canonical&&!this.currentSession.isLifetime){this.currentSession.expiresAt=expiry;this.currentSession.daysRemaining=Math.ceil((new Date(expiry).getTime()-Date.now())/86400000);}this.notify();return{newExpiresAt:expiry,updatedCodesCount};}
  public async syncAllCodesFromFirestore():Promise<ActivationCodeRecord[]>{const map=new Map<string,ActivationCodeRecord>();this.codes.forEach(c=>{if(c?.code)map.set(c.code.toUpperCase(),c);});try{await ensureAuthReady(1500);try{const snap=await withTimeout(getDocs(collection(db,'codes')),5000,'مزامنة الأكواد');snap.docs.forEach(d=>{const data=d.data() as ActivationCodeRecord;if(data?.code)map.set(data.code.toUpperCase(),{...data,code:data.code.toUpperCase()});});clearFirebaseError();}catch(e:any){console.warn('Codes sync:',e?.message||e);}try{const snap=await withTimeout(getDocs(collection(db,'activation_codes')),5000,'مزامنة الأكواد القديمة');for(const d of snap.docs){const data=d.data() as ActivationCodeRecord;if(data?.code&&!map.has(data.code.toUpperCase())){map.set(data.code.toUpperCase(),data);setDoc(doc(db,'codes',data.code.toUpperCase()),cleanFirestorePayload(data),{merge:true}).catch(()=>{});}}}catch(e:any){console.warn('Legacy codes sync:',e?.message||e);}}catch(e){console.error('Firebase sync:',e);}try{const cached=localStorage.getItem('yemenedu_excel_codes_backup');if(cached){const list:ActivationCodeRecord[]=JSON.parse(cached);list.forEach(c=>{if(c?.code&&!map.has(c.code.toUpperCase()))map.set(c.code.toUpperCase(),c);});}}catch{}this.codes=Array.from(map.values());this.notify();return this.codes;}
  public async addRegisteredCode(record:ActivationCodeRecord):Promise<void>{await ensureAuthReady();const upper=record.code.toUpperCase();const payload=cleanFirestorePayload({...record,code:upper});try{await setDoc(doc(db,'codes',upper),payload,{merge:true});const idx=this.codes.findIndex(c=>c.code.toUpperCase()===upper);if(idx>=0)this.codes[idx]=payload;else this.codes.unshift(payload);try{localStorage.setItem('yemenedu_excel_codes_backup',JSON.stringify(this.codes));}catch{}this.notify();}catch(e){handleFirestoreError(e,OperationType.CREATE,`codes/${upper}`);}}
  public async addRegisteredCodesBatch(records:ActivationCodeRecord[]):Promise<void>{await ensureAuthReady();if(!records.length)return;for(let i=0;i<records.length;i+=400){const batch=writeBatch(db);records.slice(i,i+400).forEach(record=>{const upper=record.code.toUpperCase();const payload=cleanFirestorePayload({...record,code:upper});batch.set(doc(db,'codes',upper),payload,{merge:true});const idx=this.codes.findIndex(c=>c.code.toUpperCase()===upper);if(idx>=0)this.codes[idx]=payload;else this.codes.unshift(payload);});await batch.commit();}try{localStorage.setItem('yemenedu_excel_codes_backup',JSON.stringify(this.codes));}catch{}this.notify();}
  public async deleteCode(code:string):Promise<void>{await ensureAuthReady();const upper=code.toUpperCase();try{await deleteDoc(doc(db,'codes',upper));this.codes=this.codes.filter(c=>c.code.toUpperCase()!==upper);this.notify();}catch(e){handleFirestoreError(e,OperationType.DELETE,`codes/${code}`);}}
  public async deleteTestCodesOnly():Promise<number>{await ensureAuthReady();let count=0;const patterns=['M-YEMN-5190','T-8-SCI-YEMN-8842','STU-8-YEMN-4951','STU-9-YEMN-7301'];const test=(v:string)=>{const c=(v||'').trim().toUpperCase();return patterns.includes(c)||['YEMN','RASHEED','TEST','NOUR'].some(x=>c.includes(x))||c.startsWith('-');};for(const col of ['codes','registeredCodes','activation_codes','students','teachers','submissions','grades'])try{const snap=await getDocs(collection(db,col));for(const d of snap.docs){const data=d.data();if(test(data?.code||data?.studentCode||d.id)){await deleteDoc(d.ref);count++;}}}catch(e){console.warn(`Delete test data ${col}:`,e);}this.codes=this.codes.filter(c=>!test(c.code));try{localStorage.setItem('yemenedu_excel_codes_backup',JSON.stringify(this.codes));}catch{}const saved=localStorage.getItem('yemenedu_activation_code');if(saved&&test(saved))localStorage.removeItem('yemenedu_activation_code');this.notify();return count;}
  public async clearFakeCodes():Promise<number>{return this.deleteTestCodesOnly();}
  public async deleteAllFakeAndTestCodes():Promise<number>{return this.deleteTestCodesOnly();}
  public async purgeOldAndInvalidCodes():Promise<number>{return this.deleteTestCodesOnly();}
  public async clearOldCodes():Promise<{deletedCount:number}>{await ensureAuthReady();let deletedCount=0;for(const col of ['registeredCodes','codes','activation_codes','students','teachers','grades','submissions','schools','questions','answered_questions'])try{const snap=await getDocs(collection(db,col));for(const d of snap.docs)if(d.id.toUpperCase()!=='EBTISAAM1144'){await deleteDoc(d.ref);deletedCount++;}}catch(e){console.warn(`Wipe ${col}:`,e);}this.codes=[];this.schools=[];try{localStorage.removeItem('yemenedu_excel_codes_backup');localStorage.removeItem('yemenedu_cached_session');if(this.currentSession?.role!=='super_admin'){this.currentSession=null;sessionStorage.removeItem('yemen_edu_active_session');localStorage.removeItem('yemenedu_activation_code');}}catch{}this.notify();return{deletedCount};}
  public async repairArabicTeacherCodes():Promise<{repairedCount:number;mappings:Array<{oldCode:string;newCode:string}>}>{await ensureAuthReady();const regex=/[\u0600-\u06FF]/;const mappings:Array<{oldCode:string;newCode:string}>=[];for(const old of this.codes.filter(c=>regex.test(c.code||''))){const sub=resolveSubjectCodeAscii(old.subject||old.roleTitleAr||old.assignedToName);const newCode=`T-${old.grade||'8'}-${sub.code}-${(this.schools.find(s=>s.id===old.schoolId)?.prefix||'SCHL').toUpperCase()}-${Math.floor(1000+Math.random()*9000)}`;const updated={...old,code:newCode,subject:old.role==='teacher'?sub.nameAr:old.subject};try{await setDoc(doc(db,'codes',newCode),updated,{merge:true});await deleteDoc(doc(db,'codes',old.code)).catch(()=>{});this.codes=[updated,...this.codes.filter(c=>c.code.toUpperCase()!==old.code.toUpperCase())];mappings.push({oldCode:old.code,newCode});}catch(e){console.warn('Repair code failed:',e);}}if(mappings.length){try{localStorage.setItem('yemenedu_excel_codes_backup',JSON.stringify(this.codes));}catch{}await this.syncAllCodesFromFirestore();}return{repairedCount:mappings.length,mappings};}
  public logout(){this.currentSession=null;sessionStorage.removeItem('yemen_edu_active_session');localStorage.removeItem('yemenedu_cached_session');localStorage.removeItem('yemenedu_activation_code');this.notify();}
}
export const authService = new AuthService();
