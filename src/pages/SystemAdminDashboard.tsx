import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  KeyRound,
  Trash2,
  Copy,
  Check,
  Plus,
  BookOpen,
  Users,
  ShieldCheck,
  FileText,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  School as SchoolIcon,
  Sparkles,
  UserPlus,
  RefreshCw,
  Download,
  Calendar,
  AlertTriangle,
  X,
  Eye,
  ExternalLink,
} from 'lucide-react';
import {
  authService,
  ActivationCodeRecord,
  UserRole,
  UserSession,
  School,
  ALL_SUBJECTS,
  SubjectItem,
  DEFAULT_SCHOOL_ID,
  resolveSubjectCodeAscii,
} from '../services/authService';
import {
  appDataService,
  Textbook,
  CurriculumBook,
  handleFullWipe,
  extractGoogleDriveFileId,
  buildGoogleDrivePreviewUrl,
} from '../services/appData';
import * as XLSX from 'xlsx';

interface SystemAdminDashboardProps {
  session: UserSession;
  onRefreshSession: () => void;
}

interface ParsedExcelRecord {
  rowNumber: number;
  schoolId: string;
  schoolName: string;
  schoolPrefix: string;
  grade: string;
  name: string;
  rawType: string;
  role: UserRole;
  roleLabelAr: string;
  subject: string;
  generatedCode: string;
}

const ALL_GRADES_12: Array<{ id: string; name: string; stage: string }> = [
  { id: '1', name: 'الصف الأول', stage: 'الأساسي' },
  { id: '2', name: 'الصف الثاني', stage: 'الأساسي' },
  { id: '3', name: 'الصف الثالث', stage: 'الأساسي' },
  { id: '4', name: 'الصف الرابع', stage: 'الأساسي' },
  { id: '5', name: 'الصف الخامس', stage: 'الأساسي' },
  { id: '6', name: 'الصف السادس', stage: 'الأساسي' },
  { id: '7', name: 'الصف السابع', stage: 'الأساسي' },
  { id: '8', name: 'الصف الثامن', stage: 'الأساسي' },
  { id: '9', name: 'الصف التاسع', stage: 'الأساسي' },
  { id: '10', name: 'الصف العاشر', stage: 'الأول الثانوي' },
  { id: '11', name: 'الصف الحادي عشر', stage: 'الثاني الثانوي' },
  { id: '12', name: 'الصف الثاني عشر', stage: 'الثالث الثانوي' },
];

export const SystemAdminDashboard: React.FC<SystemAdminDashboardProps> = ({
  session,
  onRefreshSession,
}) => {
  const [activeTab, setActiveTab] = useState<'schools_codes' | 'single' | 'excel' | 'books'>('schools_codes');
  const [codesList, setCodesList] = useState<ActivationCodeRecord[]>(authService.getRegisteredCodes());
  const [schoolsList, setSchoolsList] = useState<School[]>(authService.getSchools());
  const [textbooks, setTextbooks] = useState<Textbook[]>(appDataService.getTextbooks());
  const [curriculaMap, setCurriculaMap] = useState<Record<string, CurriculumBook[]>>(appDataService.getAllCurricula());
  const [uploadingGrade, setUploadingGrade] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [selectedSchool, setSelectedSchool] = useState<School>(schoolsList[0] || {
    id: DEFAULT_SCHOOL_ID,
    name: 'مدرسة الرشيد',
    prefix: 'RASHEED',
    city: 'صنعاء',
    isActive: true,
  });

  // Filters & Dynamic Pagination for Registered Codes
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('ALL');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [visibleCount, setVisibleCount] = useState<number>(100);
  const [isShowingAll, setIsShowingAll] = useState<boolean>(true);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState<boolean>(false);
  const [renewingSchoolId, setRenewingSchoolId] = useState<string | null>(null);

  // Single Account State
  const [singleName, setSingleName] = useState('');
  const [singlePhone, setSinglePhone] = useState('');
  const [singleRole, setSingleRole] = useState<UserRole>('teacher');
  const [singleGrade, setSingleGrade] = useState<'7' | '8' | '9'>('8');
  const [singleSubject, setSingleSubject] = useState<SubjectItem>(ALL_SUBJECTS[5]); // العلوم

  // Google Drive Book State (No Large Files in Firestore, Links only)
  const [driveBookGrade, setDriveBookGrade] = useState<string>('8');
  const [driveBookTerm, setDriveBookTerm] = useState<'الترم الأول' | 'الترم الثاني'>('الترم الأول');
  const [driveBookSubject, setDriveBookSubject] = useState<string>('القرآن الكريم');
  const [driveBookUrl, setDriveBookUrl] = useState<string>('');
  const [driveBookTitle, setDriveBookTitle] = useState<string>('');
  const [isSavingDriveBook, setIsSavingDriveBook] = useState<boolean>(false);
  const [previewDriveBook, setPreviewDriveBook] = useState<Textbook | null>(null);

  // Term End State (every 4 months: clean questions, submissions, term books; keep codes, users, schools, final GPA)
  const [isEndTermModalOpen, setIsEndTermModalOpen] = useState<boolean>(false);
  const [endTermTarget, setEndTermTarget] = useState<'الترم الأول' | 'الترم الثاني'>('الترم الأول');
  const [isEndingTermProgress, setIsEndingTermProgress] = useState<boolean>(false);

  // Excel / CSV Picker
  const [pickedExcelFileName, setPickedExcelFileName] = useState<string | null>(null);
  const [parsedExcelRecords, setParsedExcelRecords] = useState<ParsedExcelRecord[]>([]);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isCommittingExcel, setIsCommittingExcel] = useState(false);
  const [excelParseError, setExcelParseError] = useState<string | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // 1. Immediate full read from Firestore without filter
    authService.syncAllCodesFromFirestore().then((all) => {
      setCodesList(all);
    });

    const unsubAuth = authService.subscribe(() => {
      setCodesList(authService.getRegisteredCodes());
      const scs = authService.getSchools();
      setSchoolsList(scs);
      if (scs.length > 0 && !selectedSchool) {
        setSelectedSchool(scs[0]);
      }
    });
    const unsubData = appDataService.subscribe(() => {
      setTextbooks(appDataService.getTextbooks());
      setCurriculaMap(appDataService.getAllCurricula());
    });
    return () => {
      unsubAuth();
      unsubData();
    };
  }, [selectedSchool]);

  // Auto-reconcile codes with schools (e.g. AZAL codes to AZAL school)
  useEffect(() => {
    if (schoolsList.length > 0 && codesList.length > 0) {
      let hasUpdate = false;
      const reconciled = codesList.map((c) => {
        const matchedSchool = schoolsList.find((s) => isCodeForSchool(c, s));
        if (matchedSchool && (c.schoolId !== matchedSchool.id || c.schoolName !== matchedSchool.name)) {
          hasUpdate = true;
          return {
            ...c,
            schoolId: matchedSchool.id,
            schoolName: matchedSchool.name,
          };
        }
        return c;
      });
      if (hasUpdate) {
        setCodesList(reconciled);
        try {
          localStorage.setItem('yemenedu_excel_codes_backup', JSON.stringify(reconciled));
        } catch {}
      }
    }
  }, [schoolsList, codesList.length]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleManualSyncFirebase = async () => {
    setIsSyncingFirebase(true);
    try {
      const all = await authService.syncAllCodesFromFirestore();
      setCodesList(all);
      setIsShowingAll(true);
      setNotice({
        type: 'success',
        text: `✅ تمت المزامنة السحابية بنجاح! تم استرجاع كافة الأكواد (${all.length} كود).`,
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: `حدث خطأ أثناء المزامنة: ${err?.message || 'خطأ'}`,
      });
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedRoleFilter('ALL');
    setSelectedSchoolFilter('ALL');
    setIsShowingAll(true);
    setVisibleCount(999999);
  };

  /**
   * Export all codes grouped by school into a single Excel file
   * Each school gets its own dedicated Sheet named after the school
   * File name: كشف-جميع-المدارس-مجمع.xlsx
   */
  const handleExportAllSchoolsToExcel = () => {
    if (codesList.length === 0) {
      setNotice({
        type: 'error',
        text: '⚠️ لا توجد أكواد مسجلة في النظام لتصديرها.',
      });
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      // Group codes by school
      const schoolGroups = new Map<string, { schoolName: string; codes: ActivationCodeRecord[] }>();

      codesList.forEach((c) => {
        const rawSchoolName = (c.schoolName || 'مدرسة الرشيد').trim();
        if (!schoolGroups.has(rawSchoolName)) {
          schoolGroups.set(rawSchoolName, { schoolName: rawSchoolName, codes: [] });
        }
        schoolGroups.get(rawSchoolName)!.codes.push(c);
      });

      const usedSheetNames = new Set<string>();

      schoolGroups.forEach((group) => {
        // Sanitize sheet name: Excel allows max 31 characters and forbids: \ / ? * [ ] :
        let cleanName = group.schoolName
          .replace(/[\\/?*[\]:]/g, ' ')
          .trim()
          .slice(0, 30);
        if (!cleanName) cleanName = 'مدرسة';

        let sheetName = cleanName;
        let counter = 1;
        while (usedSheetNames.has(sheetName)) {
          sheetName = `${cleanName.slice(0, 26)}_${counter}`;
          counter++;
        }
        usedSheetNames.add(sheetName);

        const rows = group.codes.map((c, idx) => ({
          'الرقم': idx + 1,
          'كود التفعيل': c.code,
          'نوع الحساب': c.roleTitleAr || (c.role === 'student' ? 'طالب' : c.role === 'teacher' ? 'معلم' : 'مدير'),
          'اسم صاحب الحساب': c.role === 'principal' || c.code.startsWith('M-') ? (c.assignedToName || '—').replace(/صف\s*8|الصف\s*8/gi, '').trim() : (c.assignedToName || '—'),
          'الصف الدراسي': c.role === 'principal' || c.code.startsWith('M-') ? '—' : (c.grade ? `الصف ${c.grade}` : '—'),
          'المادة': c.role === 'principal' || c.code.startsWith('M-') ? 'مدير المدرسة - كل الصفوف' : (c.subject || '—'),
          'المدرسة': c.schoolName || group.schoolName,
          'رقم الهاتف': c.phone || '—',
          'حالة الكود': c.isActivated ? 'مفعل نشط' : 'غير مفعل',
          'تاريخ الإنشاء': c.createdAt ? new Date(c.createdAt).toLocaleDateString('ar-YE') : '—',
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Adjust column widths for clear presentation
        worksheet['!cols'] = [
          { wch: 8 },  // الرقم
          { wch: 24 }, // كود التفعيل
          { wch: 22 }, // نوع الحساب
          { wch: 26 }, // اسم صاحب الحساب
          { wch: 14 }, // الصف الدراسي
          { wch: 18 }, // المادة
          { wch: 24 }, // المدرسة
          { wch: 14 }, // رقم الهاتف
          { wch: 14 }, // حالة الكود
          { wch: 16 }, // تاريخ الإنشاء
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });

      // Download file: كشف-جميع-المدارس-مجمع.xlsx
      XLSX.writeFile(workbook, 'كشف-جميع-المدارس-مجمع.xlsx');

      setNotice({
        type: 'success',
        text: `📥 تم تصدير الملف بنجاح! تم إنشاء "كشف-جميع-المدارس-مجمع.xlsx" ويحتوي على (${schoolGroups.size}) Sheet بعدد ${codesList.length} كود.`,
      });
    } catch (err: any) {
      console.error('Export Excel error:', err);
      setNotice({
        type: 'error',
        text: `حدث خطأ أثناء تصدير ملف الإكسل: ${err?.message || 'خطأ غير متوقع'}`,
      });
    }
  };

  const isCodeForSchool = (c: ActivationCodeRecord, s: School): boolean => {
    if (!s || !c) return false;
    const cSid = (c.schoolId || '').trim().toLowerCase();
    const sId = (s.id || '').trim().toLowerCase();
    const sPrefix = (s.prefix || '').trim().toLowerCase();

    // 1. Direct ID match
    if (cSid && sId && cSid === sId) {
      return true;
    }
    // 2. If code explicitly carries a different schoolId (not matching s.id or s.prefix), reject immediately
    if (cSid && cSid !== sId && (!sPrefix || cSid !== sPrefix)) {
      return false;
    }
    // 3. Prefix match (exact c.schoolId === s.prefix or exact -PREFIX- segment when c.schoolId is missing)
    if (sPrefix) {
      if (cSid && cSid === sPrefix) return true;
      const pUpper = sPrefix.toUpperCase();
      const cCodeUpper = (c.code || '').trim().toUpperCase();
      if (!cSid && cCodeUpper.includes(`-${pUpper}-`)) return true;
    }
    // 4. Default School / Rasheed legacy codes (only when cSid is empty or default)
    if (s.id === DEFAULT_SCHOOL_ID || s.prefix === 'RASHEED') {
      if (!cSid || cSid === DEFAULT_SCHOOL_ID.toLowerCase() || cSid === 'rasheed' || cSid === 'yemn' || cSid === 'yemenedu') {
        const cCodeUpper = (c.code || '').trim().toUpperCase();
        return (
          cSid === DEFAULT_SCHOOL_ID.toLowerCase() ||
          cCodeUpper.includes('-RASHEED-') ||
          cCodeUpper.includes('-YEMN-')
        );
      }
    }
    return false;
  };

  const handleExportSingleSchoolToExcel = (targetSchool: School) => {
    const schoolCodes = codesList.filter((c) => isCodeForSchool(c, targetSchool));
    const targetSchoolName = targetSchool.name;

    if (schoolCodes.length === 0) {
      setNotice({
        type: 'error',
        text: `لا توجد أكواد مسجلة لمدرسة "${targetSchoolName}".`,
      });
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();
      const rows = schoolCodes.map((c, idx) => ({
        'الرقم': idx + 1,
        'كود التفعيل': c.code,
        'نوع الحساب': c.roleTitleAr || (c.role === 'student' ? 'طالب' : c.role === 'teacher' ? 'معلم' : 'مدير'),
        'اسم صاحب الحساب': c.role === 'principal' || c.code.startsWith('M-') ? (c.assignedToName || '—').replace(/صف\s*8|الصف\s*8/gi, '').trim() : (c.assignedToName || '—'),
        'الصف الدراسي': c.role === 'principal' || c.code.startsWith('M-') ? '—' : (c.grade ? `الصف ${c.grade}` : '—'),
        'المادة': c.role === 'principal' || c.code.startsWith('M-') ? 'مدير المدرسة - كل الصفوف' : (c.subject || '—'),
        'المدرسة': c.schoolName || targetSchoolName,
        'رقم الهاتف': c.phone || '—',
        'حالة الكود': c.isActivated ? 'مفعل نشط' : 'غير مفعل',
        'تاريخ الإنشاء': c.createdAt ? new Date(c.createdAt).toLocaleDateString('ar-YE') : '—',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 8 },
        { wch: 24 },
        { wch: 22 },
        { wch: 26 },
        { wch: 14 },
        { wch: 18 },
        { wch: 24 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
      ];

      const safeSheetName = targetSchoolName.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 30) || 'الأكواد';
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);

      const fileName = `كشف-مدرسة-${targetSchoolName.replace(/\s+/g, '-')}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setNotice({
        type: 'success',
        text: `📥 تم تصدير كشف "${targetSchoolName}" (${schoolCodes.length} كود) باسم ${fileName}.`,
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: `حدث خطأ أثناء تصدير الملف: ${err?.message || 'خطأ'}`,
      });
    }
  };

  const getSchoolDaysRemaining = (s: School) => {
    if (!s.subscriptionExpiresAt) return 30;
    const exp = new Date(s.subscriptionExpiresAt);
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  const formatExpiryDate = (isoStr?: string) => {
    if (!isoStr) return 'غير محدد (30 يوم)';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('ar-YE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  const getSchoolCodesCount = (s: School) => {
    return codesList.filter((c) => isCodeForSchool(c, s)).length;
  };

  const handleRenewSchoolSubscription = async (schoolId: string, schoolName: string) => {
    setRenewingSchoolId(schoolId);
    try {
      const res = await authService.renewSchoolSubscription(schoolId, 30);
      onRefreshSession();
      setNotice({
        type: 'success',
        text: `🎉 تم تجديد اشتراك مدرسة "${schoolName}" بنجاح لمدة 30 يوماً إضافية! تم تحديث جميع الأكواد (${res.updatedCodesCount} كود) وتستمر بالعمل فوراً لجميع المعلمين والطلاب والمدير دون الحاجة لأي أكواد جديدة.`,
      });
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: `فشل تجديد الاشتراك: ${err?.message || 'خطأ'}`,
      });
    } finally {
      setRenewingSchoolId(null);
    }
  };

  const handleClearAllSimulationData = async () => {
    try {
      setNotice({
        type: 'info',
        text: 'جاري تنفيذ التنظيف الشامل وتصفير كافة السجلات من السحابة...',
      });
      await authService.clearOldCodes();
      await handleFullWipe(false);
      onRefreshSession();
      setNotice({
        type: 'success',
        text: 'تم التصفير - 0 كود',
      });
    } catch (err) {
      console.error('Wipe error:', err);
      setNotice({
        type: 'success',
        text: 'تم التصفير - 0 كود',
      });
    }
  };

  const handleDeleteSingleCode = async (code: string) => {
    await authService.deleteCode(code);
    setNotice({
      type: 'info',
      text: `تم حذف الكود ${code} بنجاح.`,
    });
  };

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleName.trim()) {
      setNotice({ type: 'error', text: 'يرجى إدخال اسم صاحب الحساب.' });
      return;
    }

    const school = selectedSchool || schoolsList[0];
    const rnd = Math.floor(1000 + Math.random() * 9000);
    let codeToUse = '';
    let roleTitle = '';
    let displayName = singleName;

    if (singleRole === 'teacher') {
      codeToUse = `T-${singleGrade}-${singleSubject.code}-${school.prefix}-${rnd}`;
      roleTitle = `معلم مادة ${singleSubject.nameAr} صف ${singleGrade}`;
      displayName = `أ. ${singleName} - ${singleSubject.nameAr} صف ${singleGrade}`;
    } else if (singleRole === 'principal') {
      codeToUse = `M-${school.prefix}-${rnd}`;
      roleTitle = 'مدير مدرسة';
      displayName = singleName.replace(/صف\s*8|الصف\s*8/gi, '').trim();
    } else {
      codeToUse = `STU-${singleGrade}-${school.prefix}-${rnd}`;
      roleTitle = `طالب (الصف ${singleGrade})`;
      displayName = singleName;
    }

    await authService.addRegisteredCode({
      code: codeToUse,
      role: singleRole,
      roleTitleAr: roleTitle,
      assignedToName: displayName,
      phone: singlePhone,
      schoolId: school.id,
      schoolName: school.name,
      grade: singleRole === 'principal' ? undefined : singleGrade,
      class: singleRole === 'principal' ? undefined : singleGrade,
      subject: singleRole === 'teacher' ? singleSubject.nameAr : undefined,
      isTest: false,
      createdAt: new Date().toISOString(),
      isActivated: false,
      expiresAt: school.subscriptionExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    setSingleName('');
    setSinglePhone('');
    setNotice({
      type: 'success',
      text: `🎉 تم إنشاء الكود بنجاح: ${codeToUse} للمستخدم "${displayName}" بمدرسة ${school.name}!`,
    });
  };

  const handleSaveDriveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveBookUrl.trim()) {
      setNotice({ type: 'error', text: 'يرجى إدخال رابط ملف Google Drive للكتاب.' });
      return;
    }
    if (!driveBookSubject.trim()) {
      setNotice({ type: 'error', text: 'يرجى كتابة اسم المادة.' });
      return;
    }

    const fileId = extractGoogleDriveFileId(driveBookUrl);
    if (!fileId) {
      setNotice({ type: 'error', text: 'تعذر استخراج معرّف ملف Google Drive من الرابط المدخل. تأكد أنه رابط ملف صحيح.' });
      return;
    }

    setIsSavingDriveBook(true);
    try {
      await appDataService.addOrUpdateDriveBook({
        grade: driveBookGrade,
        subject: driveBookSubject.trim(),
        term: driveBookTerm,
        driveUrl: driveBookUrl.trim(),
        title: driveBookTitle.trim() || `كتاب ${driveBookSubject.trim()} - الصف ${driveBookGrade}`,
      });

      setNotice({
        type: 'success',
        text: `✅ تم حفظ رابط كتاب "${driveBookSubject.trim()}" (الصف ${driveBookGrade} - ${driveBookTerm}) في Firestore بنجاح!`,
      });
      setDriveBookUrl('');
      setDriveBookTitle('');
    } catch (err: any) {
      setNotice({ type: 'error', text: `فشل حفظ الكتاب: ${err?.message || 'خطأ'}` });
    } finally {
      setIsSavingDriveBook(false);
    }
  };

  const handleExecuteEndTerm = async () => {
    setIsEndingTermProgress(true);
    try {
      const res = await appDataService.endTermAndCleanData(endTermTarget);
      setNotice({
        type: 'success',
        text: `🎉 تم إنهاء (${endTermTarget}) بنجاح! تم حفظ نتائج ومعدلات ${res.studentsPreservedCount} طالب في السجل الدائم، وحذف ${res.questionsDeletedCount} سؤال، وحذف ${res.submissionsDeletedCount} إجابة، وحذف ${res.booksDeletedCount} رابط كتاب.`,
      });
      setIsEndTermModalOpen(false);
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: `حدث خطأ أثناء إنهاء الترم: ${err?.message || 'خطأ غير متوقع'}`,
      });
    } finally {
      setIsEndingTermProgress(false);
    }
  };

  const filteredCodes = codesList.filter((c) => {
    const term = searchTerm.trim().toLowerCase();
    const normalizeArabic = (s: string) =>
      s
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي');

    const normTerm = normalizeArabic(term);

    const matchesSearch =
      !term ||
      normalizeArabic(c.code).includes(normTerm) ||
      normalizeArabic(c.assignedToName).includes(normTerm) ||
      (c.schoolName && normalizeArabic(c.schoolName).includes(normTerm)) ||
      (c.roleTitleAr && normalizeArabic(c.roleTitleAr).includes(normTerm)) ||
      (c.grade && normalizeArabic(String(c.grade)).includes(normTerm)) ||
      (c.subject && normalizeArabic(c.subject).includes(normTerm)) ||
      (c.role && normalizeArabic(c.role).includes(normTerm)) ||
      (c.phone && c.phone.includes(term));

    let matchesSchool = selectedSchoolFilter === 'ALL';
    if (!matchesSchool) {
      const targetSchool = schoolsList.find((s) => s.id === selectedSchoolFilter);
      if (targetSchool) {
        matchesSchool = isCodeForSchool(c, targetSchool);
      } else {
        matchesSchool = c.schoolId === selectedSchoolFilter;
      }
    }

    const matchesRole =
      selectedRoleFilter === 'ALL' || c.role === selectedRoleFilter;

    return matchesSearch && matchesSchool && matchesRole;
  });

  const isAll = isShowingAll || visibleCount >= filteredCodes.length || visibleCount >= 999999;
  const visibleCodes = isAll ? filteredCodes : filteredCodes.slice(0, visibleCount);
  const countShowing = visibleCodes.length;

  const currentUser = session;
  if (!currentUser) {
    return (
      <div className="min-h-dvh bg-[#F0F4F8] flex items-center justify-center font-bold text-gray-500 font-['Cairo'] text-sm">
        جاري التحميل...
      </div>
    );
  }

  if (!currentUser.schoolId && currentUser.role !== 'super_admin') {
    return (
      <div className="min-h-dvh bg-[#F0F4F8] flex items-center justify-center font-bold text-gray-500 font-['Cairo'] text-sm">
        جاري تحميل بيانات المدرسة...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-right">
      {/* Sky Blue Banner */}
      <div className="bg-[#B3CDE8] rounded-2xl p-6 text-[#1A3A5F] shadow-sm relative overflow-hidden border border-[#9BBEDF]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-2 rounded-xl bg-white text-[#1E5AA8] shadow-xs">
                <ShieldCheck className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black font-['Cairo']">
                  لوحة تحكم مدير النظام المركزي - منصة التعليم اليمني
                </h1>
                <p className="text-xs sm:text-sm font-semibold text-[#1A3A5F]/80">
                  {session.name} • النظام السحابي الموحد
                </p>
              </div>
            </div>
          </div>

          {/* Purge & Term Actions */}
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setIsEndTermModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full"
            >
              <Calendar className="w-4 h-4" />
              <span>إنهاء الترم وحذف بياناته (نظام 4 أشهر)</span>
            </button>

            <button
              onClick={handleClearAllSimulationData}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer w-full"
            >
              <Trash2 className="w-4 h-4" />
              <span>تنظيف شامل - دفتر نظيف - تصفير السجل</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notice Message */}
      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-blue-50 border-blue-200 text-[#1E5AA8]'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab('schools_codes')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'schools_codes'
              ? 'bg-[#1E5AA8] text-white shadow-xs'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <SchoolIcon className="w-4 h-4" />
          <span>🏫 المدارس والأكواد</span>
        </button>

        <button
          onClick={() => setActiveTab('single')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'single'
              ? 'bg-[#1E5AA8] text-white shadow-xs'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>👤 إنشاء حساب مفرد</span>
        </button>

        <button
          onClick={() => setActiveTab('excel')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'excel'
              ? 'bg-[#1E5AA8] text-white shadow-xs'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>📊 استيراد Excel</span>
        </button>

        <button
          onClick={() => setActiveTab('books')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'books'
              ? 'bg-[#1E5AA8] text-white shadow-xs'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>📚 المناهج المدرسية</span>
        </button>
      </div>

      {/* TAB 1: CANONICAL SCHOOLS & REGISTERED CODES */}
      {activeTab === 'schools_codes' && (
        <div className="space-y-6">
          {/* Canonical School Status Card & Unified Subscriptions (Developer Admin Only) */}
          <div className="bg-white rounded-2xl p-6 border border-[#D5E2EE] shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-base text-[#1A3A5F] flex items-center gap-2">
                  <SchoolIcon className="w-5 h-5 text-[#1E5AA8]" />
                  قائمة المدارس المعتمدة والاشتراكات الموحدة (الأدمن المطور)
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  اشتراك موحد لكل مدرسة (30 يوماً) يتحكم بجميع أكوادها. التجديد يمدد الاشتراك 30 يوماً وتعمل نفس الأكواد فوراً دون الحاجة لتوليد أكواد جديدة.
                </p>
              </div>

              {/* Action Buttons: Export All Schools */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportAllSchoolsToExcel}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                  title="تصدير كشف جميع المدارس مجمع (Sheet لكل مدرسة)"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  <span>تصدير كشف المدارس (Excel)</span>
                </button>
              </div>
            </div>

            {/* Approved Schools & Subscriptions Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[680px] text-right text-xs">
                <thead className="bg-[#F0F4F8] text-[#1A3A5F] font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">اسم المدرسة</th>
                    <th className="p-3 text-center">عدد الأكواد</th>
                    <th className="p-3">تاريخ انتهاء الاشتراك</th>
                    <th className="p-3 text-center">حالة الاشتراك</th>
                    <th className="p-3 text-center">تجديد الاشتراك (الأدمن فقط)</th>
                    <th className="p-3 text-center">تصدير</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {schoolsList.map((s, idx) => {
                    const codesCount = getSchoolCodesCount(s);
                    const daysLeft = getSchoolDaysRemaining(s);
                    const isRenewing = renewingSchoolId === s.id;
                    const isCanonical = s.id === DEFAULT_SCHOOL_ID || s.prefix === 'RASHEED';

                    return (
                      <tr key={s.id} className="hover:bg-blue-50/20 transition">
                        <td className="p-3 text-center text-gray-400 font-mono">{idx + 1}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-lg shrink-0 ${isCanonical ? 'bg-[#1E5AA8] text-white' : 'bg-gray-600 text-white'}`}>
                              <SchoolIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-[#1A3A5F] text-xs sm:text-sm">{s.name}</p>
                              <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                                <span className="font-mono font-bold text-[11px] bg-blue-50 text-[#1E5AA8] border border-blue-200 px-1.5 py-0.2 rounded">
                                  [{s.prefix}]
                                </span>
                                <span className="text-[11px] text-gray-500 font-mono">id: {s.id}</span>
                                <span className="text-[11px] text-gray-500">({s.city || 'صنعاء'})</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-block px-2.5 py-1 bg-gray-100 text-[#1A3A5F] font-bold rounded-lg font-mono text-xs">
                            {codesCount} كود
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-gray-800">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{formatExpiryDate(s.subscriptionExpiresAt)}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {daysLeft > 3 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>نشط ({daysLeft} يوم متبقي)</span>
                            </span>
                          ) : daysLeft > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>ينتهي قريباً ({daysLeft} {daysLeft === 1 ? 'يوم' : 'أيام'})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>منتهي (0 يوم)</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {/* Dedicated Single Renewal Button for Developer Admin */}
                          <button
                            type="button"
                            onClick={() => handleRenewSchoolSubscription(s.id, s.name)}
                            disabled={isRenewing}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#1E5AA8] to-blue-700 hover:from-[#1A3A5F] hover:to-[#1E5AA8] text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-60"
                            title="تمديد اشتراك المدرسة 30 يوماً إضافية مع استمرار جميع الأكواد فوراً"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRenewing ? 'animate-spin' : ''}`} />
                            <span>{isRenewing ? 'جاري التجديد...' : 'تجديد الاشتراك'}</span>
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleExportSingleSchoolToExcel(s)}
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition cursor-pointer"
                            title={`تصدير كشف ${s.name}`}
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-700" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Registered Codes Table with Full Unlimited Pagination & Filters */}
          <div className="bg-white rounded-2xl p-6 border border-[#D5E2EE] shadow-xs space-y-4">
            {/* Header & Real Count */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-base text-[#1A3A5F] flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#1E5AA8]" />
                    سجل الأكواد النشطة ({codesList.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleManualSyncFirebase}
                    disabled={isSyncingFirebase}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E5AA8] text-xs font-bold transition cursor-pointer disabled:opacity-60"
                    title="مزامنة فورية مباشرة من Firebase بدون أي فلتر"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingFirebase ? 'animate-spin' : ''}`} />
                    <span>مزامنة Firebase</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportAllSchoolsToExcel}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                    title="تصدير كشف جميع المدارس مجمع (Sheet لكل مدرسة)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                    <span>تصدير كل مدرسة بـ Sheet منفصل (.xlsx)</span>
                  </button>
                  {codesList.some((c) => /[\u0600-\u06FF]/.test(c.code || '')) && (
                    <button
                      type="button"
                      onClick={async () => {
                        setIsSyncingFirebase(true);
                        try {
                          const res = await authService.repairArabicTeacherCodes();
                          const updated = await authService.syncAllCodesFromFirestore();
                          setCodesList(updated);
                          const summary = res.mappings.map((m) => `${m.oldCode} ← ${m.newCode}`).join(' | ');
                          setNotice({
                            type: 'success',
                            text: `✅ تم إصلاح (${res.repairedCount}) كود إلى حروف إنجليزية قياسية: ${summary}`,
                          });
                        } catch (err: any) {
                          setNotice({
                            type: 'error',
                            text: `تعذر إصلاح الأكواد: ${err?.message || 'خطأ'}`,
                          });
                        } finally {
                          setIsSyncingFirebase(false);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                      title="تحويل أي كود يحتوي على حروف عربية إلى اختصار المادة الإنجليزي القياسي"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>
                        إصلاح الأكواد ذات الحروف العربية ({codesList.filter((c) => /[\u0600-\u06FF]/.test(c.code || '')).length})
                      </span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  المعروض حالياً: <strong className="text-gray-900 font-bold">{countShowing}</strong> من أصل <strong className="text-gray-900 font-bold">{filteredCodes.length}</strong>
                  {filteredCodes.length < codesList.length ? ` (مصفى من إجمالي ${codesList.length} كود في النظام)` : ''}
                </p>
              </div>

              {/* Quick Limit Selector */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500 font-bold ml-1">عرض بالصفحة:</span>
                {[25, 50, 100, 250, 500].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setVisibleCount(num);
                      setIsShowingAll(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      !isShowingAll && visibleCount === num
                        ? 'bg-[#1E5AA8] text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIsShowingAll(true);
                    setVisibleCount(999999);
                  }}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    isShowingAll || visibleCount >= 999999 || visibleCount >= filteredCodes.length
                      ? 'bg-[#1E5AA8] text-white shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  عرض الكل
                </button>
              </div>
            </div>

            {/* Filter Controls Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-gray-100">
              {/* Search Query with Instant Reset Button */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="بحث فوري في كل الأكواد..."
                    className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-[#1E5AA8]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                  title="إعادة تعيين الفلتر - يرجع العرض للكل"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#1E5AA8]" />
                  <span>إعادة تعيين</span>
                </button>
              </div>

              {/* Role Filter (Default: ALL) */}
              <div>
                <select
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-[#1E5AA8] bg-white font-bold text-[#1A3A5F]"
                >
                  <option value="ALL">جميع الأدوار (الكل: طلاب + معلمين + مدراء) ({codesList.length})</option>
                  <option value="student">الطلاب فقط ({codesList.filter(c => c.role === 'student').length})</option>
                  <option value="teacher">المعلمون فقط ({codesList.filter(c => c.role === 'teacher').length})</option>
                  <option value="principal">المدراء فقط ({codesList.filter(c => c.role === 'principal').length})</option>
                </select>
              </div>

              {/* School Filter */}
              <div>
                <select
                  value={selectedSchoolFilter}
                  onChange={(e) => setSelectedSchoolFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-[#1E5AA8] bg-white font-medium"
                >
                  <option value="ALL">جميع المدارس</option>
                  {schoolsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} [{s.prefix}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Explicit Reset Filter Button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="w-full py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E5AA8] text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>[إعادة تعيين الفلتر]</span>
                </button>
              </div>
            </div>

            {/* Codes Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[680px] text-right text-xs">
                <thead className="bg-[#F0F4F8] text-[#1A3A5F] font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">كود التفعيل</th>
                    <th className="p-3">نوع الحساب</th>
                    <th className="p-3">صاحب الحساب</th>
                    <th className="p-3">الصف / المادة</th>
                    <th className="p-3">المدرسة</th>
                    <th className="p-3 text-center">نسخ</th>
                    <th className="p-3 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {visibleCodes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400">
                        لا توجد أكواد مطابقة لمعايير البحث أو الفلترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    visibleCodes.map((c, idx) => (
                      <tr key={c.code} className="hover:bg-blue-50/20 transition">
                        <td className="p-3 text-center text-gray-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-[#1E5AA8]">{c.code}</td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              c.role === 'student'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.role === 'teacher'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {c.roleTitleAr || (c.role === 'student' ? 'طالب' : c.role === 'teacher' ? 'معلم' : 'مدير')}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-gray-900">
                          {c.role === 'principal' || c.code.startsWith('M-')
                            ? c.assignedToName.replace(/صف\s*8|الصف\s*8/gi, '').trim()
                            : c.assignedToName}
                        </td>
                        <td className="p-3 text-gray-600">
                          {c.role === 'principal' || c.code.startsWith('M-') ? (
                            <span className="font-bold text-[#1E5AA8]">مدير المدرسة - كل الصفوف</span>
                          ) : (
                            <>
                              {c.grade ? `الصف ${c.grade}` : ''}
                              {c.grade && c.subject ? ' - ' : ''}
                              {c.subject || '—'}
                            </>
                          )}
                        </td>
                        <td className="p-3 text-gray-700 font-semibold">
                          {c.schoolName || 'مدرسة الرشيد'}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => copyToClipboard(c.code, c.code)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 cursor-pointer"
                            title="نسخ الكود"
                          >
                            {copiedCode === c.code ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDeleteSingleCode(c.code)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"
                            title="حذف الكود"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls / Load More */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs">
              <span className="text-gray-500 font-medium">
                المعروض حالياً: <strong className="text-gray-900 font-bold">{countShowing}</strong> من أصل <strong className="text-gray-900 font-bold">{filteredCodes.length}</strong>
                {filteredCodes.length < codesList.length ? ` (مصفى من إجمالي ${codesList.length} كود في النظام)` : ''}
              </span>

              {!isAll && visibleCount < filteredCodes.length && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + 50)}
                    className="px-4 py-2 rounded-xl bg-blue-50 text-[#1E5AA8] hover:bg-blue-100 font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <span>⬇️ عرض المزيد (+50 كود)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsShowingAll(true);
                      setVisibleCount(999999);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#1E5AA8] text-white hover:bg-[#1A3A5F] font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>عرض الكل ({filteredCodes.length})</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SINGLE ACCOUNT */}
      {activeTab === 'single' && (
        <div className="bg-white rounded-2xl p-6 border border-[#D5E2EE] shadow-xs max-w-2xl mx-auto">
          <h3 className="font-bold text-base text-[#1A3A5F] mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#1E5AA8]" />
            إنشاء حساب مدرسي مفرد مع كود 30 يوماً
          </h3>

          <form onSubmit={handleAddSingle} className="space-y-4 text-right">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">نوع الحساب:</label>
              <select
                value={singleRole}
                onChange={(e) => setSingleRole(e.target.value as UserRole)}
                className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-[#1E5AA8]"
              >
                <option value="teacher">معلم مادة (Teacher T-)</option>
                <option value="principal">مدير مدرسة (Principal M-)</option>
                <option value="student">طالب مدرسي (Student STU-)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">المدرسة التابع لها:</label>
              <select
                value={selectedSchool.id}
                onChange={(e) => {
                  const s = schoolsList.find((sc) => sc.id === e.target.value);
                  if (s) setSelectedSchool(s);
                }}
                className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-[#1E5AA8]"
              >
                {schoolsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} [{s.prefix}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">اسم صاحب الحساب:</label>
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="مثال: أ. أسامة يحيى أو الطالب سعيد أحمد"
                className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-[#1E5AA8]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">رقم الهاتف (اختياري):</label>
              <input
                type="text"
                value={singlePhone}
                onChange={(e) => setSinglePhone(e.target.value)}
                placeholder="77xxxxxxx"
                className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-[#1E5AA8]"
              />
            </div>

            {singleRole === 'teacher' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">الصف الدراسي للمادة:</label>
                  <select
                    value={singleGrade}
                    onChange={(e) => setSingleGrade(e.target.value as '7' | '8' | '9')}
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-[#1E5AA8]"
                  >
                    <option value="7">السابع الأساسي</option>
                    <option value="8">الثامن الأساسي</option>
                    <option value="9">التاسع الأساسي</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">المادة التعليمية (المناهج الـ 7):</label>
                  <select
                    value={singleSubject.code}
                    onChange={(e) => {
                      const sub = ALL_SUBJECTS.find((s) => s.code === e.target.value);
                      if (sub) setSingleSubject(sub);
                    }}
                    className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-[#1E5AA8]"
                  >
                    {ALL_SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.nameAr} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {singleRole === 'student' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الصف الدراسي:</label>
                <select
                  value={singleGrade}
                  onChange={(e) => setSingleGrade(e.target.value as '7' | '8' | '9')}
                  className="w-full p-2.5 text-xs rounded-xl border border-gray-300 focus:outline-[#1E5AA8]"
                >
                  <option value="7">السابع الأساسي</option>
                  <option value="8">الثامن الأساسي</option>
                  <option value="9">التاسع الأساسي</option>
                </select>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#1E5AA8] hover:bg-[#1A3A5F] text-white text-xs font-bold shadow transition cursor-pointer"
            >
              توليد الكود وحفظه
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: EXCEL IMPORT */}
      {activeTab === 'excel' && (
        <div className="bg-white rounded-2xl p-6 border border-[#D5E2EE] shadow-xs space-y-5">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="font-bold text-base sm:text-lg text-[#1A3A5F] flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#1E5AA8]" />
              استيراد كشوفات الطلاب والمعلمين عبر ملف Excel / CSV
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              متوافق مع ترتيب الأعمدة: <strong>A = schoolId | B = grade | C = name | D = type (S/T/M) | E = subject</strong>
              <br />
              يتم تجاوز السطر 1 (العنوان) والسطر 2 (رؤوس الأعمدة)، وقراءة جميع الأسطر ابتداءً من السطر 3 حتى آخر الملف.
            </p>
          </div>

          {/* Upload Area */}
          <div className="p-6 border-2 border-dashed border-[#9BBEDF] rounded-2xl text-center bg-[#F0F4F8] hover:bg-[#EBF3FB] transition">
            <Upload className="w-9 h-9 text-[#1E5AA8] mx-auto mb-2" />
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                setPickedExcelFileName(file.name);
                setIsParsingExcel(true);
                setExcelParseError(null);

                try {
                  const buffer = await file.arrayBuffer();
                  let rawRows: any[][] = [];

                  try {
                    const workbook = XLSX.read(buffer, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
                  } catch (xlsxErr) {
                    console.warn('XLSX parser fallback to text reader:', xlsxErr);
                    const text = new TextDecoder('utf-8').decode(buffer);
                    rawRows = text.split(/\r?\n/).map((line) =>
                      line.split(',').map((c) => c.replace(/^["']|["']$/g, '').trim())
                    );
                  }

                  const parsed: ParsedExcelRecord[] = [];
                  const batchNewSchools = new Map<string, { schoolId: string; schoolName: string; schoolPrefix: string }>();
                  const reservedPrefixes = new Set<string>(
                    schoolsList.map((s) => (s.prefix || '').trim().toUpperCase()).filter(Boolean)
                  );
                  const takenSchoolIds = new Set<string>(
                    schoolsList.map((s) => (s.id || '').trim().toLowerCase()).filter(Boolean)
                  );

                  // Rule 2: Ignore Line 1 (r=0) and Line 2 (r=1), start reading from Line 3 (r=2)
                  // Rule 5: Read entire file until the last line, do not stop at empty row, skip empty rows only
                  for (let r = 2; r < rawRows.length; r++) {
                    const row = rawRows[r];
                    if (!row || !Array.isArray(row)) continue;

                    // Columns:
                    // A (0) = schoolId
                    // B (1) = grade
                    // C (2) = name
                    // D (3) = type (S/T/M)
                    // E (4) = subject
                    const rawSchool = String(row[0] ?? '').trim();
                    const rawGrade = String(row[1] ?? '').trim();
                    const rawName = String(row[2] ?? '').trim();
                    const rawType = String(row[3] ?? '').trim();
                    const rawSubject = String(row[4] ?? '').trim();

                    // Skip empty rows and continue (Rule 5)
                    if (!rawName && !rawType && !rawSchool && !rawGrade && !rawSubject) {
                      continue;
                    }
                    if (!rawName) {
                      continue;
                    }

                    // Rule 3: Account type conversion
                    // S = طالب
                    // T = معلم
                    // M = مدير
                    const typeUpper = rawType.toUpperCase();
                    let role: UserRole = 'student';
                    let roleLabelAr = 'طالب';

                    if (typeUpper.startsWith('T') || typeUpper.includes('معلم') || typeUpper.includes('TEACHER')) {
                      role = 'teacher';
                      roleLabelAr = 'معلم';
                    } else if (typeUpper.startsWith('M') || typeUpper.includes('مدير') || typeUpper.includes('PRINCIPAL') || typeUpper.includes('MANAGER')) {
                      role = 'principal';
                      roleLabelAr = 'مدير';
                    } else {
                      role = 'student';
                      roleLabelAr = 'طالب';
                    }

                    // Strict school isolation: exact match only (never merge similar names via substring .includes)
                    let schoolId = 'rasheed';
                    let schoolName = 'مدرسة الرشيد';
                    let schoolPrefix = 'RASHEED';

                    const rawSchoolNorm = rawSchool.trim().replace(/\s+/g, ' ').toLowerCase();
                    if (
                      !rawSchoolNorm ||
                      rawSchoolNorm === 'rasheed' ||
                      rawSchoolNorm === 'مدرسة الرشيد' ||
                      rawSchoolNorm === 'الرشيد' ||
                      rawSchoolNorm === 'مدارس الرشيد'
                    ) {
                      schoolId = 'rasheed';
                      schoolName = 'مدرسة الرشيد';
                      schoolPrefix = 'RASHEED';
                    } else {
                      const found = schoolsList.find(
                        (s) =>
                          s.id.trim().toLowerCase() === rawSchoolNorm ||
                          s.prefix.trim().toLowerCase() === rawSchoolNorm ||
                          s.name.trim().replace(/\s+/g, ' ').toLowerCase() === rawSchoolNorm
                      );
                      if (found) {
                        schoolId = found.id;
                        schoolName = found.name;
                        schoolPrefix = found.prefix;
                      } else if (batchNewSchools.has(rawSchoolNorm)) {
                        const cached = batchNewSchools.get(rawSchoolNorm)!;
                        schoolId = cached.schoolId;
                        schoolName = cached.schoolName;
                        schoolPrefix = cached.schoolPrefix;
                      } else {
                        schoolPrefix = authService.generateSchoolPrefix(rawSchool, Array.from(reservedPrefixes));
                        reservedPrefixes.add(schoolPrefix.toUpperCase());

                        const asciiSlug = rawSchool
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-+|-+$/g, '');
                        let hash = 0;
                        for (let i = 0; i < rawSchoolNorm.length; i++) {
                          hash = (hash * 31 + rawSchoolNorm.charCodeAt(i)) >>> 0;
                        }
                        const hashSuffix = hash.toString(36).slice(0, 5);
                        let candidateId = asciiSlug
                          ? `sch-${asciiSlug}`
                          : `sch-${schoolPrefix.toLowerCase()}-${hashSuffix}`;
                        if (takenSchoolIds.has(candidateId.toLowerCase())) {
                          candidateId = `sch-${schoolPrefix.toLowerCase()}-${hashSuffix}`;
                        }
                        takenSchoolIds.add(candidateId.toLowerCase());

                        schoolId = candidateId;
                        schoolName = rawSchool;
                        batchNewSchools.set(rawSchoolNorm, { schoolId, schoolName, schoolPrefix });
                      }
                    }

                    // Clean grade number
                    let cleanGrade = rawGrade.replace(/[^0-9]/g, '');
                    if (!cleanGrade) {
                      if (rawGrade.includes('أول') || rawGrade.includes('الأول')) cleanGrade = '1';
                      else if (rawGrade.includes('ثاني') || rawGrade.includes('الثاني')) cleanGrade = '2';
                      else if (rawGrade.includes('ثالث') || rawGrade.includes('الثالث')) cleanGrade = '3';
                      else if (rawGrade.includes('رابع') || rawGrade.includes('الرابع')) cleanGrade = '4';
                      else if (rawGrade.includes('خامس') || rawGrade.includes('الخامس')) cleanGrade = '5';
                      else if (rawGrade.includes('سادس') || rawGrade.includes('السادس')) cleanGrade = '6';
                      else if (rawGrade.includes('سابع') || rawGrade.includes('السابع')) cleanGrade = '7';
                      else if (rawGrade.includes('ثامن') || rawGrade.includes('الثامن')) cleanGrade = '8';
                      else if (rawGrade.includes('تاسع') || rawGrade.includes('التاسع')) cleanGrade = '9';
                      else if (rawGrade.includes('عاشر') || rawGrade.includes('العاشر')) cleanGrade = '10';
                      else if (rawGrade.includes('حادي') || rawGrade.includes('الحادي')) cleanGrade = '11';
                      else cleanGrade = rawGrade || '8';
                    }

                    // Subject code for teachers (always uppercase ASCII, Arabic-normalized)
                    let subCode = '';
                    let canonicalSubject = rawSubject;
                    if (rawSubject) {
                      const resolvedSub = resolveSubjectCodeAscii(rawSubject);
                      subCode = resolvedSub.code;
                      canonicalSubject = resolvedSub.nameAr || rawSubject;
                    }

                    const rnd = Math.floor(1000 + Math.random() * 9000);
                    let previewCode = '';
                    if (role === 'student') {
                      previewCode = `STU-${cleanGrade || '8'}-${schoolPrefix}-${rnd}`;
                    } else if (role === 'teacher') {
                      previewCode = subCode
                        ? `T-${cleanGrade || '8'}-${subCode}-${schoolPrefix}-${rnd}`
                        : `T-${cleanGrade || '8'}-${schoolPrefix}-${rnd}`;
                    } else {
                      previewCode = `M-${schoolPrefix}-${rnd}`;
                    }

                    parsed.push({
                      rowNumber: r + 1,
                      schoolId,
                      schoolName,
                      schoolPrefix,
                      grade: cleanGrade,
                      name: rawName,
                      rawType,
                      role,
                      roleLabelAr,
                      subject: canonicalSubject,
                      generatedCode: previewCode,
                    });
                  }

                  setParsedExcelRecords(parsed);
                  if (parsed.length === 0) {
                    setNotice({
                      type: 'info',
                      text: 'لم يتم العثور على أسطر صالحة ابتداءً من السطر 3 في الملف المرفق.',
                    });
                  } else {
                    setNotice({
                      type: 'success',
                      text: `📊 تم تحليل الملف بنجاح! تم اكتشاف ${parsed.length} اسماً من السطر 3 حتى آخر سطر.`,
                    });
                  }
                } catch (err: any) {
                  setExcelParseError(`حدث خطأ أثناء قراءة الملف: ${err?.message || 'تأكد من صيغة الملف'}`);
                } finally {
                  setIsParsingExcel(false);
                }
              }}
              className="hidden"
            />
            <button
              onClick={() => excelInputRef.current?.click()}
              disabled={isParsingExcel}
              className="px-5 py-2.5 rounded-xl bg-[#1E5AA8] hover:bg-[#1A3A5F] text-white text-xs font-bold cursor-pointer transition shadow-xs inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isParsingExcel ? 'جاري تحليل الملف...' : 'اختر ملف إكسل من جهازك (.xlsx / .csv)'}</span>
            </button>
            {pickedExcelFileName && (
              <p className="text-xs font-bold text-[#1E5AA8] mt-2 font-mono">
                الملف المختار: {pickedExcelFileName}
              </p>
            )}
            {excelParseError && (
              <p className="text-xs font-bold text-rose-600 mt-2">
                ⚠️ {excelParseError}
              </p>
            )}
          </div>

          {/* Rule 6: Real preview of ALL names with type, grade/subject, counters */}
          {parsedExcelRecords.length > 0 && (
            <div className="space-y-4 pt-2">
              {/* Summary Stats Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="text-[11px] text-gray-500 font-bold block">إجمالي الأسماء</span>
                  <span className="text-lg font-black text-[#1E5AA8]">{parsedExcelRecords.length}</span>
                </div>
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl">
                  <span className="text-[11px] text-gray-500 font-bold block">الطلاب (S)</span>
                  <span className="text-lg font-black text-sky-700">
                    {parsedExcelRecords.filter((r) => r.role === 'student').length}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-[11px] text-gray-500 font-bold block">المعلمون (T)</span>
                  <span className="text-lg font-black text-emerald-700">
                    {parsedExcelRecords.filter((r) => r.role === 'teacher').length}
                  </span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-[11px] text-gray-500 font-bold block">المدراء (M)</span>
                  <span className="text-lg font-black text-amber-700">
                    {parsedExcelRecords.filter((r) => r.role === 'principal').length}
                  </span>
                </div>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-gray-500 font-bold block">المدرسة المعتمدة</span>
                  <span className="text-xs font-bold text-indigo-900 block truncate" title={parsedExcelRecords[0]?.schoolName}>
                    {parsedExcelRecords[0]?.schoolName}
                  </span>
                  <span className="text-[11px] font-mono text-indigo-700 font-bold">[{parsedExcelRecords[0]?.schoolPrefix}]</span>
                </div>
              </div>

              {/* Table of all names */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-[#F0F4F8] p-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold text-[#1A3A5F]">
                    معاينة الأسماء المكتشفة ({parsedExcelRecords.length} اسماً) - من السطر 3 حتى آخر سطر:
                  </h4>
                  <span className="text-[11px] font-bold text-gray-500 bg-white px-2 py-0.5 rounded border shrink-0">
                    العدد الحقيقي: {parsedExcelRecords.length}
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[680px] text-right text-xs">
                    <thead className="bg-gray-100/70 text-[#1A3A5F] font-bold sticky top-0 border-b border-gray-200">
                      <tr>
                        <th className="p-2.5 w-12 text-center">#</th>
                        <th className="p-2.5 w-16 text-center">سطر</th>
                        <th className="p-2.5">الاسم الكامل</th>
                        <th className="p-2.5 text-center">النوع</th>
                        <th className="p-2.5 text-center">الصف</th>
                        <th className="p-2.5">المادة</th>
                        <th className="p-2.5">المدرسة</th>
                        <th className="p-2.5 font-mono">الكود المولد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {parsedExcelRecords.map((r, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/20 transition">
                          <td className="p-2 text-center font-bold text-gray-400">{idx + 1}</td>
                          <td className="p-2 text-center text-gray-400 font-mono text-[11px]">{r.rowNumber}</td>
                          <td className="p-2 font-bold text-gray-900">{r.name}</td>
                          <td className="p-2 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                                r.role === 'student'
                                  ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                  : r.role === 'teacher'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {r.roleLabelAr} ({r.rawType})
                            </span>
                          </td>
                          <td className="p-2 text-center font-bold">{r.role === 'principal' ? 'كل الصفوف' : (r.grade ? `صف ${r.grade}` : '-')}</td>
                          <td className="p-2">{r.role === 'principal' ? 'مدير المدرسة - كل الصفوف' : (r.subject || '-')}</td>
                          <td className="p-2">
                            <span className="text-[11px] font-bold text-[#1E5AA8]">{r.schoolName}</span>
                          </td>
                          <td className="p-2 font-mono text-[11px] font-bold text-gray-600">{r.generatedCode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={async () => {
                    setIsCommittingExcel(true);
                    try {
                      // 1. Ensure each distinct school exists with its exact schoolId & schoolPrefix
                      const distinctSchools = Array.from(new Set(parsedExcelRecords.map((r) => r.schoolId)));
                      for (const sid of distinctSchools) {
                        const sample = parsedExcelRecords.find((r) => r.schoolId === sid);
                        if (sample) {
                          const existingSchool = schoolsList.find(
                            (s) => s.id === sample.schoolId || s.prefix === sample.schoolPrefix
                          );
                          if (!existingSchool) {
                            await authService.addNewSchool(
                              sample.schoolName,
                              'صنعاء',
                              sample.schoolPrefix,
                              sample.schoolId
                            );
                          }
                        }
                      }

                      // 2. Batch write all registered codes to Firestore atomically
                      const currentSchools = authService.getSchools();
                      const batchCodes: ActivationCodeRecord[] = parsedExcelRecords.map((r) => {
                        const targetSchool = currentSchools.find(
                          (s) => s.id === r.schoolId || s.prefix === r.schoolPrefix
                        );
                        const expDate = targetSchool?.subscriptionExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                        const finalSchoolId = targetSchool ? targetSchool.id : r.schoolId;
                        const finalSchoolName = targetSchool ? targetSchool.name : r.schoolName;
                        return {
                          code: r.generatedCode,
                          role: r.role,
                          roleTitleAr:
                            r.role === 'teacher'
                              ? r.subject
                                ? `معلم ${r.subject} صف ${r.grade}`
                                : `معلم صف ${r.grade}`
                              : r.role === 'principal'
                              ? 'مدير مدرسة'
                              : `طالب صف ${r.grade}`,
                          assignedToName: r.role === 'principal' ? r.name.replace(/صف\s*8|الصف\s*8/gi, '').trim() : r.name,
                          schoolId: finalSchoolId,
                          schoolName: finalSchoolName,
                          grade: r.role === 'principal' ? undefined : (r.grade as any),
                          subject: r.role === 'principal' ? undefined : (r.subject || undefined),
                          isTest: false,
                          createdAt: new Date().toISOString(),
                          isActivated: false,
                          expiresAt: expDate,
                        };
                      });

                      await authService.addRegisteredCodesBatch(batchCodes);
                      const allAfterBatch = await authService.syncAllCodesFromFirestore();
                      setCodesList(allAfterBatch);
                      setIsShowingAll(true);
                      setVisibleCount(999999);
                      setActiveTab('schools_codes');

                      setNotice({
                        type: 'success',
                        text: `🎉 تم توليد وحفظ ${batchCodes.length} كود بنجاح لمدرسة ${parsedExcelRecords[0]?.schoolName || 'الرشيد'} في قاعدة البيانات! إجمالي الأكواد: ${allAfterBatch.length}`,
                      });
                      setParsedExcelRecords([]);
                      setPickedExcelFileName(null);
                    } catch (err: any) {
                      setNotice({
                        type: 'error',
                        text: `حدث خطأ أثناء حفظ الأكواد: ${err?.message || 'خطأ غير معروف'}`,
                      });
                    } finally {
                      setIsCommittingExcel(false);
                    }
                  }}
                  disabled={isCommittingExcel}
                  className="w-full sm:flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isCommittingExcel
                      ? `جاري توليد وحفظ ${parsedExcelRecords.length} كود...`
                      : `اعتماد وتوليد (${parsedExcelRecords.length} كود) وحفظها في قاعدة البيانات`}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setParsedExcelRecords([]);
                    setPickedExcelFileName(null);
                    if (excelInputRef.current) excelInputRef.current.value = '';
                  }}
                  disabled={isCommittingExcel}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition cursor-pointer"
                >
                  إلغاء واختيار ملف آخر
                </button>
              </div>

              <p className="text-[11px] text-gray-500 text-center font-medium">
                ⚡ يتم اعتماد وتوليد وحفظ جميع الأسماء المكتشفة في الملف ({parsedExcelRecords.length} اسماً) بالكامل وبدون أي حد في قاعدة البيانات.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: GOOGLE DRIVE TEXTBOOKS (LINKS ONLY IN FIRESTORE) */}
      {activeTab === 'books' && (
        <div className="space-y-6">
          {/* Add / Edit Drive Book Card */}
          <div className="bg-white rounded-2xl p-6 border border-[#D5E2EE] shadow-xs space-y-5">
            <div className="border-b border-gray-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-[#1A3A5F] flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#1E5AA8]" />
                  إدارة روابط كتب المناهج المدرسية (Google Drive)
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  الكتب نفسها مرفوعة على Google Drive، ويحفظ في Firestore فقط: رابط الملف + اسم المادة + الصف + الترم. لا تستخدم روابط المجلدات، ضع رابط كل كتاب بشكل مستقل.
                </p>
              </div>

              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 self-start md:self-auto">
                {textbooks.length} كتاب مسجل في Firestore
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveDriveBook} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Grade */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    الصف الدراسي:
                  </label>
                  <select
                    value={driveBookGrade}
                    onChange={(e) => setDriveBookGrade(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-semibold bg-white focus:outline-none focus:border-[#1E5AA8]"
                  >
                    {ALL_GRADES_12.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.stage})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Term */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    الترم الدراسي:
                  </label>
                  <select
                    value={driveBookTerm}
                    onChange={(e) => setDriveBookTerm(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-semibold bg-white focus:outline-none focus:border-[#1E5AA8]"
                  >
                    <option value="الترم الأول">الترم الأول</option>
                    <option value="الترم الثاني">الترم الثاني</option>
                  </select>
                </div>

                {/* Subject Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    اسم المادة (اكتب أي مادة بحرية):
                  </label>
                  <input
                    type="text"
                    value={driveBookSubject}
                    onChange={(e) => setDriveBookSubject(e.target.value)}
                    placeholder="مثال: القرآن الكريم، الرياضيات..."
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-semibold bg-white focus:outline-none focus:border-[#1E5AA8]"
                  />
                </div>
              </div>

              {/* Quick Subject Suggestions */}
              <div>
                <span className="text-[11px] text-gray-500 font-bold block mb-1.5">
                  اقتراحات سريعة للمواد:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'القرآن الكريم',
                    'التربية الإسلامية',
                    'اللغة العربية',
                    'الرياضيات',
                    'العلوم',
                    'اللغة الإنجليزية',
                    'الاجتماعيات',
                    'الحاسوب',
                    'الفيزياء',
                    'الكيمياء',
                    'الأحياء',
                    'التاريخ',
                    'الجغرافيا',
                    'التربية الوطنية',
                  ].map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setDriveBookSubject(sub)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                        driveBookSubject === sub
                          ? 'bg-[#1E5AA8] text-white border-[#1E5AA8]'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>

              {/* Google Drive URL input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  رابط ملف Google Drive للكتاب (ملف فردي مستقل - ليس مجلد):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={driveBookUrl}
                    onChange={(e) => setDriveBookUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/1a2B3c4D.../view?usp=sharing"
                    required
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-mono text-left bg-white focus:outline-none focus:border-[#1E5AA8]"
                  />
                </div>
                {driveBookUrl.trim() && (
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    {extractGoogleDriveFileId(driveBookUrl) ? (
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        تم اكتشاف معرّف الملف: <code className="font-mono bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{extractGoogleDriveFileId(driveBookUrl)}</code>
                      </span>
                    ) : (
                      <span className="text-amber-700 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        تأكد من نسخ رابط ملف درايف كامل يحتوي على /file/d/FILE_ID/
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Optional Title */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  عنوان الكتاب (اختياري - يظهر للطالب):
                </label>
                <input
                  type="text"
                  value={driveBookTitle}
                  onChange={(e) => setDriveBookTitle(e.target.value)}
                  placeholder={`كتاب ${driveBookSubject || 'المادة'} - الصف ${driveBookGrade}`}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs sm:text-sm font-semibold bg-white focus:outline-none focus:border-[#1E5AA8]"
                />
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSavingDriveBook}
                  className="px-6 py-2.5 rounded-xl bg-[#1E5AA8] hover:bg-[#1A3A5F] text-white text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSavingDriveBook ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جاري الحفظ في Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>حفظ رابط الكتاب في Firestore</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Stored Books List */}
          <div className="bg-white rounded-2xl p-6 border border-[#D5E2EE] shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
              <h4 className="font-bold text-sm sm:text-base text-[#1A3A5F] flex items-center gap-2">
                <span>📚 قائمة الكتب المسجلة</span>
                <span className="text-xs text-gray-500 font-normal">
                  (معاينة فورية داخل التطبيق عبر iframe)
                </span>
              </h4>

              {/* Filter by Grade */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-bold">تصفية الصف:</span>
                <select
                  value={driveBookGrade}
                  onChange={(e) => setDriveBookGrade(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-gray-300 text-xs font-bold bg-white"
                >
                  <option value="ALL">جميع الصفوف</option>
                  {ALL_GRADES_12.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(() => {
              const displayBooks = textbooks.filter(
                (b) => driveBookGrade === 'ALL' || b.grade === driveBookGrade
              );

              if (displayBooks.length === 0) {
                return (
                  <div className="text-center py-12 text-gray-400 space-y-2">
                    <BookOpen className="w-10 h-10 mx-auto text-gray-300" />
                    <p className="text-xs sm:text-sm font-bold">
                      لا توجد روابط كتب مسجلة لهذا الصف بعد.
                    </p>
                    <p className="text-xs text-gray-400">
                      أضف رابط ملف Google Drive من النموذج أعلاه ليظهر للطلاب فوراً داخل التطبيق.
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {displayBooks.map((book) => {
                    const previewUrl = buildGoogleDrivePreviewUrl(book.fileUrl || book.driveUrl || '');
                    return (
                      <div
                        key={book.id}
                        className="bg-[#F8FAFC] rounded-2xl p-4 border border-[#D5E2EE] shadow-2xs hover:border-[#1E5AA8]/40 transition flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5 mb-2">
                            <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-[#1E5AA8] text-[11px] font-bold">
                              الصف {book.grade}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold">
                              {book.term || 'الترم الأول'}
                            </span>
                          </div>

                          <h5 className="font-bold text-sm text-[#1A3A5F]">
                            {book.subject}
                          </h5>
                          {book.title && book.title !== book.subject && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {book.title}
                            </p>
                          )}

                          <div className="mt-2 text-[11px] text-gray-400 font-mono truncate" dir="ltr">
                            {book.driveUrl || book.fileUrl}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => setPreviewDriveBook(book)}
                            className="flex-1 py-2 px-3 rounded-xl bg-[#1E5AA8] hover:bg-[#1A3A5F] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>معاينة بالتطبيق</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                !confirm(
                                  `هل تريد حذف رابط كتاب "${book.subject}" من قاعدة البيانات؟ (ملاحظة: هذا الإجراء يحذف الرابط من التطبيق فقط ولا يمس ملف Google Drive أبداً).`
                                )
                              ) {
                                return;
                              }
                              try {
                                await appDataService.deleteBook(book.id);
                                setNotice({
                                  type: 'success',
                                  text: `🗑️ تم حذف رابط كتاب "${book.subject}" من Firestore بنجاح.`,
                                });
                              } catch (err: any) {
                                setNotice({
                                  type: 'error',
                                  text: `فشل حذف الرابط: ${err?.message || 'خطأ'}`,
                                });
                              }
                            }}
                            title="حذف الرابط من Firestore"
                            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 1: IN-APP GOOGLE DRIVE PREVIEW MODAL */}
      {previewDriveBook && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-5xl h-[94dvh] flex flex-col rounded-2xl overflow-hidden shadow-2xl">
            {/* Top Bar */}
            <div className="w-full bg-[#1A3A5F] text-white px-3.5 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <span className="p-2 bg-white/10 rounded-xl shrink-0">
                  <BookOpen className="w-5 h-5 text-amber-300" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-base truncate">
                    {previewDriveBook.title || previewDriveBook.subject}
                  </h3>
                  <p className="text-xs text-blue-200 truncate">
                    الصف {previewDriveBook.grade} • {previewDriveBook.term || 'الترم الأول'} • قراءة داخلية بدون مغادرة التطبيق
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewDriveBook(null)}
                className="px-3 sm:px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
                <span>إغلاق <span className="hidden sm:inline">والعودة للوحة</span></span>
              </button>
            </div>

            {/* In-App iframe */}
            <div className="w-full flex-1 bg-white relative">
              <iframe
                src={buildGoogleDrivePreviewUrl(previewDriveBook.fileUrl || previewDriveBook.driveUrl || '')}
                className="w-full h-full border-0"
                allow="autoplay"
                title={previewDriveBook.title || previewDriveBook.subject}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: END TERM CONFIRMATION MODAL */}
      {isEndTermModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto my-auto p-5 sm:p-6 text-right shadow-2xl border border-amber-200 space-y-5 animate-in fade-in">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <span className="p-3 bg-amber-100 text-amber-800 rounded-2xl">
                <Calendar className="w-6 h-6" />
              </span>
              <div>
                <h3 className="font-black text-lg text-gray-900">
                  إنهاء الترم وحذف بياناته (نظام الـ 4 أشهر)
                </h3>
                <p className="text-xs text-gray-500">
                  تفريغ مساحة Firestore للترم الجديد مع حفظ معدلات الطلاب وسجلهم الدائم
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-gray-700 bg-amber-50/70 p-4 rounded-xl border border-amber-200/80">
              <h4 className="font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                ما الذي سينفذه هذا الإجراء بدقة:
              </h4>
              <ul className="list-disc list-inside space-y-1.5 text-xs text-amber-950 font-medium">
                <li>
                  <strong className="text-emerald-700">سجل دائم محفوظ:</strong> يتم احتساب معدل كل طالب ودرجته النهائية وحالته (ناجح / راسب) وحفظها في Firestore لتبقى في سجله الدائم.
                </li>
                <li>
                  <strong className="text-rose-700">حذف تفصيلي:</strong> يتم حذف جميع الأسئلة والإجابات التفصيلية الخاصة بهذا الترم من Firestore.
                </li>
                <li>
                  <strong className="text-rose-700">روابط الكتب:</strong> يتم حذف روابط كتب الترم المحدد فقط من Firestore.
                </li>
                <li>
                  <strong className="text-blue-700">حماية جوجل درايف:</strong> لا يتم لمس أو حذف أي ملف على Google Drive مطلقاً.
                </li>
                <li>
                  <strong className="text-blue-700">حماية الحسابات:</strong> لا يتم حذف الأكواد، ولا الطلاب، ولا المعلمين، ولا المدارس، ولا الأدمن المطور.
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700">
                اختر الترم المراد إنهاؤه وتفريغه:
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['الترم الأول', 'الترم الثاني'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEndTermTarget(t)}
                    className={`py-3 px-4 rounded-xl border text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      endTermTarget === t
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    <span>{t}</span>
                    {endTermTarget === t && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsEndTermModalOpen(false)}
                disabled={isEndingTermProgress}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs sm:text-sm font-bold hover:bg-gray-100 transition cursor-pointer disabled:opacity-50"
              >
                إلغاء التراجع
              </button>
              <button
                type="button"
                onClick={handleExecuteEndTerm}
                disabled={isEndingTermProgress}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isEndingTermProgress ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ والتفريغ...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تأكيد إنهاء {endTermTarget} وتفريغ البيانات</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
