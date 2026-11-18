import { authService } from '../services/authService';

/**
 * Formats school name in Arabic based on Excel upload / Firestore school data.
 * Converts default English/short "Azal" / "AZAL" to "مدرسة آزال الأهلية".
 */
export function formatArabicSchoolName(schoolName?: string, schoolId?: string): string {
  let raw = (schoolName || '').trim();
  if (!raw && schoolId) {
    const found = authService
      .getSchools()
      .find((s) => s.id === schoolId || s.prefix?.toLowerCase() === schoolId.toLowerCase());
    if (found?.name) {
      raw = found.name.trim();
    }
  }

  const normalized = raw.toLowerCase();
  const normalizedId = (schoolId || '').trim().toLowerCase();

  if (
    normalized === 'azal' ||
    normalized === 'azal school' ||
    normalized === 'أزال' ||
    normalized === 'آزال' ||
    normalizedId === 'azal'
  ) {
    return 'مدرسة آزال الأهلية';
  }

  if (
    normalized === 'faisl' ||
    normalized === 'faisl school' ||
    normalized === 'faisal' ||
    normalized === 'faisal school' ||
    normalized === 'الفيصل' ||
    normalized === 'مدرسة الفيصل' ||
    normalized === 'مدارس الفيصل الاهلية' ||
    normalized === 'مدارس الفيصل الأهلية' ||
    normalized.includes('faisl') ||
    normalizedId === 'faisl' ||
    normalizedId === 'faisal' ||
    normalizedId.includes('faisl')
  ) {
    return 'مدارس الفيصل الاهلية';
  }

  if (
    normalized === 'sam' ||
    normalized === 'sam school' ||
    normalized === 'sam schools' ||
    normalized === 'سام' ||
    normalized === 'مدرسة سام' ||
    normalized === 'مدارس سام' ||
    normalized === 'مدارس سام الاهلية' ||
    normalized === 'مدارس سام الأهلية' ||
    normalizedId === 'sam' ||
    normalizedId === 'sch-sam'
  ) {
    return 'مدارس سام الاهلية';
  }

  if (
    normalized === 'amal' ||
    normalized === 'amal school' ||
    normalized === 'amal schools' ||
    normalized === 'الأمل' ||
    normalized === 'الامل' ||
    normalized === 'مدرسة الأمل' ||
    normalized === 'مدرسة الامل' ||
    normalized === 'مدارس الأمل' ||
    normalized === 'مدارس الامل' ||
    normalized === 'مدارس الأمل الاهلية' ||
    normalized === 'مدارس الأمل الأهلية' ||
    normalized === 'مدارس الامل الاهلية' ||
    normalized === 'مدارس الامل الأهلية' ||
    normalizedId === 'amal' ||
    normalizedId === 'sch-amal'
  ) {
    return 'مدارس الأمل الاهلية';
  }

  if (!raw) return 'المدرسة الأهلية';

  return raw;
}

/**
 * Extracts crisp user monogram initials from any Arabic or English full name.
 */
export function getUserInitials(fullName?: string): string {
  const cleaned = (fullName || '')
    .replace(/^(أ\.|أ\/|د\.|م\.)\s*/u, '')
    .trim();
  if (!cleaned) return 'م';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0);
    const second = parts[parts.length - 1].charAt(0);
    return `${first} ${second}`;
  }

  return parts[0].slice(0, 2);
}

/**
 * Formats an epoch timestamp into live Arabic relative time ("الآن", "منذ دقيقة", "منذ ساعة", ...).
 */
export function formatRelativeTimeAr(timestampMs: number, nowMs: number = Date.now()): string {
  if (!timestampMs || isNaN(timestampMs)) return 'الآن';
  const diffMs = Math.max(0, nowMs - timestampMs);

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'الآن';
  if (mins === 1) return 'منذ دقيقة';
  if (mins === 2) return 'منذ دقيقتين';
  if (mins <= 10) return `منذ ${mins} دقائق`;
  if (mins < 60) return `منذ ${mins} دقيقة`;

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours === 1) return 'منذ ساعة';
  if (hours === 2) return 'منذ ساعتين';
  if (hours <= 10) return `منذ ${hours} ساعات`;
  if (hours < 24) return `منذ ${hours} ساعة`;

  const days = Math.floor(diffMs / 86_400_000);
  if (days === 1) return 'منذ يوم';
  if (days === 2) return 'منذ يومين';
  if (days <= 10) return `منذ ${days} أيام`;
  return `منذ ${days} يوماً`;
}

/**
 * Checks whether a sender string is a generic placeholder rather than a real principal name.
 */
export function isGenericPrincipalSender(name?: string): boolean {
  const cleaned = (name || '').trim();
  return (
    !cleaned ||
    cleaned === 'إدارة المدرسة' ||
    cleaned === 'الإدارة المدرسية' ||
    cleaned === 'مدير المدرسة' ||
    cleaned === 'مدير مدرسة' ||
    cleaned === 'إدارة التعليم الأساسي'
  );
}

/**
 * Dynamically resolves the approved School Principal's name from the Excel-uploaded / Firestore
 * activation codes for the given schoolId or schoolName. Never falls back to a hardcoded personal name.
 */
export function getSchoolPrincipalName(schoolId?: string, _schoolName?: string): string {
  const normalizedTargetId = (schoolId || '').trim().toLowerCase();
  if (!normalizedTargetId) return 'مدير المدرسة';
  const codes = authService.getRegisteredCodes();

  const principalCodes = codes.filter(
    (c) => c.role === 'principal' || String(c.code || '').trim().toUpperCase().startsWith('M-')
  );

  let matched = principalCodes.find((c) => {
    const cSchoolId = (c.schoolId || '').trim().toLowerCase();
    return cSchoolId === normalizedTargetId;
  });

  if (!matched) {
    const targetSchool = authService
      .getSchools()
      .find((s) => (s.id || '').trim().toLowerCase() === normalizedTargetId);
    if (targetSchool?.prefix) {
      const pLower = targetSchool.prefix.trim().toLowerCase();
      const pUpper = targetSchool.prefix.trim().toUpperCase();
      matched = principalCodes.find(
        (c) =>
          (c.schoolId || '').trim().toLowerCase() === pLower ||
          String(c.code || '').trim().toUpperCase().includes(`-${pUpper}-`)
      );
    }
  }

  const rawName = (matched?.assignedToName || '').replace(/صف\s*8|الصف\s*8/gi, '').trim();
  return rawName || 'مدير المدرسة';
}

/**
 * Detects hardcoded/simulation announcements that must never appear in any school.
 */
export function isSimulationAnnouncement(anc?: {
  id?: string;
  title?: string;
  senderName?: string;
  schoolId?: string;
}): boolean {
  if (!anc) return true;
  const id = String(anc.id || '').trim();
  const title = String(anc.title || '').trim();
  const sender = String(anc.senderName || '').trim();
  const schoolId = String(anc.schoolId || '').trim();

  if (id === 'anc-1' || id === 'anc-2') return true;
  if (
    title === 'جدول اختبارات نهاية الفصل الدراسي وتوزيع اللجان' ||
    title === 'بدء تسليم الواجبات المقالية المصورة عبر المنصة'
  ) {
    return true;
  }
  if (sender === 'أ. عبدالله باجعفر' || sender === 'إدارة التعليم الأساسي') {
    return true;
  }
  if (!schoolId) {
    return true;
  }
  return false;
}

