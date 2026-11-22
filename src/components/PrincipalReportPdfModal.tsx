import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Download,
  X,
  FileText,
  School,
  CheckCircle2,
  Calendar,
  Award,
  Loader2,
  Printer,
} from 'lucide-react';

export interface PrincipalStudentReportItem {
  studentName: string;
  grade?: string;
  submissionsCount: number;
  gpa: number;
  status: 'متميز' | 'ناجح' | 'راسب' | string;
}

interface PrincipalReportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: PrincipalStudentReportItem[];
  schoolName: string;
  gradeLabel: string;
  periodLabel: string; // e.g. "شهر سبتمبر" or "التقرير التراكمي السنوي"
  reportTitle: string; // e.g. "كشف إنجاز وتقييم الطلاب الشهري" or "التقرير التراكمي العام"
  isAnnual?: boolean;
}

// Converts modern CSS color functions (oklch, oklab, lch, lab, color-mix) into standard rgb/hex for html2canvas
function sanitizeCssTextForCanvas(cssText: string): string {
  if (!/(oklch|oklab|color-mix|lch|lab)\(/i.test(cssText)) return cssText;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1;
  tempCanvas.height = 1;
  const ctx = tempCanvas.getContext('2d');

  const resolveColor = (fnExpr: string): string => {
    if (!ctx) return '#1A3A5F';
    try {
      ctx.fillStyle = '#000001';
      ctx.fillStyle = fnExpr;
      const computed = ctx.fillStyle;
      if (computed && (computed.startsWith('#') || computed.startsWith('rgb'))) {
        return computed;
      }
    } catch {
      // ignore invalid expression
    }
    return 'transparent';
  };

  let out = '';
  let i = 0;
  const targetRegex = /(?:oklch|oklab|color-mix|lch|lab)\(/gi;
  while (i < cssText.length) {
    targetRegex.lastIndex = i;
    const match = targetRegex.exec(cssText);
    if (!match) {
      out += cssText.slice(i);
      break;
    }
    out += cssText.slice(i, match.index);
    const startIdx = match.index;
    let depth = 0;
    let endIdx = startIdx;
    for (let j = startIdx; j < cssText.length; j++) {
      if (cssText[j] === '(') depth++;
      else if (cssText[j] === ')') {
        depth--;
        if (depth === 0) {
          endIdx = j + 1;
          break;
        }
      }
    }
    if (depth === 0 && endIdx > startIdx) {
      const expr = cssText.slice(startIdx, endIdx);
      out += resolveColor(expr);
      i = endIdx;
    } else {
      out += cssText.slice(startIdx, startIdx + match[0].length);
      i = startIdx + match[0].length;
    }
  }
  return out;
}

function triggerFastBlobDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Keep URL alive long enough for Android Chrome Download Manager to finish saving
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }, 25000);
}

export const PrincipalReportPdfModal: React.FC<PrincipalReportPdfModalProps> = ({
  isOpen,
  onClose,
  students,
  schoolName,
  gradeLabel,
  periodLabel,
  reportTitle,
  isAnnual = false,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  const totalStudents = students.length;
  const totalSubmissions = students.reduce((sum, s) => sum + (s.submissionsCount || 0), 0);
  const avgGpa =
    totalStudents > 0
      ? Math.round(students.reduce((sum, s) => sum + (s.gpa || 0), 0) / totalStudents)
      : 0;
  const passingCount = students.filter((s) => s.gpa >= 50).length;
  const passRate = totalStudents > 0 ? Math.round((passingCount / totalStudents) * 100) : 0;

  const issueDateStr = new Date().toLocaleDateString('ar-YE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const safeCleanPart = (v: string) =>
    (v || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_');

  const fileName = `كشف_إنجاز_${safeCleanPart(schoolName)}_${safeCleanPart(gradeLabel)}_${safeCleanPart(periodLabel)}.pdf`;

  const getStudentRatingLabel = (student: PrincipalStudentReportItem) => {
    if (student.gpa >= 90 || student.status === 'متميز') return 'متميز (أ)';
    if (student.gpa >= 80) return 'جيد جداً (ب)';
    if (student.gpa >= 65) return 'جيد (ج)';
    if (student.gpa >= 50 || student.status === 'ناجح') return 'مقبول (د)';
    if (student.submissionsCount > 0) return 'يحتاج متابعة';
    return 'لم يسلم واجبات';
  };

  // Pure HTML5 Canvas A4 fallback renderer so mobile PDF download never fails
  const buildPdfViaDirectCanvas = async (): Promise<jsPDF> => {
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    const rowsPerPage = 24;
    const chunks: PrincipalStudentReportItem[][] = [];
    for (let i = 0; i < Math.max(1, students.length); i += rowsPerPage) {
      chunks.push(students.slice(i, i + rowsPerPage));
    }

    chunks.forEach((chunk, pageIdx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.direction = 'rtl';

      // Top Header
      ctx.fillStyle = '#1A3A5F';
      ctx.font = 'bold 24px Cairo, Tajawal, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('الجمهورية اليمنية - وزارة التربية والتعليم', 1180, 75);
      ctx.font = 'bold 20px Cairo, Tajawal, sans-serif';
      ctx.fillStyle = '#1E5AA8';
      ctx.fillText(`مدرسة: ${schoolName || 'المدرسة النموذجية'}`, 1180, 112);

      ctx.textAlign = 'center';
      ctx.fillStyle = '#1A3A5F';
      ctx.font = 'bold 28px Cairo, Tajawal, sans-serif';
      ctx.fillText(reportTitle, 620, 90);
      ctx.font = 'bold 18px Cairo, Tajawal, sans-serif';
      ctx.fillStyle = '#065F46';
      ctx.fillText(`${gradeLabel} • ${periodLabel}`, 620, 126);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 18px Cairo, Tajawal, sans-serif';
      ctx.fillText('العام الدراسي: 1446-1447هـ / 2025-2026م', 60, 75);
      ctx.fillText(`تاريخ الإصدار: ${issueDateStr}`, 60, 110);

      ctx.strokeStyle = '#1E5AA8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(60, 150);
      ctx.lineTo(1180, 150);
      ctx.stroke();

      // Summary Row
      ctx.fillStyle = '#F0F7FF';
      ctx.fillRect(60, 170, 1120, 60);
      ctx.strokeStyle = '#BFDBFE';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(60, 170, 1120, 60);

      ctx.fillStyle = '#1A3A5F';
      ctx.textAlign = 'center';
      ctx.font = 'bold 19px Cairo, Tajawal, sans-serif';
      ctx.fillText(`الطلاب: ${totalStudents}`, 1030, 207);
      ctx.fillText(`التسليمات: ${totalSubmissions}`, 760, 207);
      ctx.fillText(`متوسط الأداء: ${avgGpa}%`, 490, 207);
      ctx.fillText(`نسبة النجاح: ${passRate}%`, 210, 207);

      // Table Header
      const startY = 260;
      const rowH = 48;
      ctx.fillStyle = '#1A3A5F';
      ctx.fillRect(60, startY, 1120, rowH);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px Cairo, Tajawal, sans-serif';
      ctx.fillText('#', 1140, startY + 31);
      ctx.textAlign = 'right';
      ctx.fillText('اسم الطالب كاملاً', 1070, startY + 31);
      ctx.textAlign = 'center';
      ctx.fillText('الصف', 680, startY + 31);
      ctx.fillText('التسليمات', 530, startY + 31);
      ctx.fillText('المعدل %', 370, startY + 31);
      ctx.fillText('التقدير العام', 190, startY + 31);

      chunk.forEach((student, idx) => {
        const y = startY + (idx + 1) * rowH;
        ctx.fillStyle = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        ctx.fillRect(60, y, 1120, rowH);
        ctx.strokeStyle = '#E5E7EB';
        ctx.strokeRect(60, y, 1120, rowH);

        ctx.fillStyle = '#111827';
        ctx.font = 'bold 17px Cairo, Tajawal, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(pageIdx * rowsPerPage + idx + 1), 1140, y + 31);
        ctx.textAlign = 'right';
        ctx.fillText(student.studentName || '', 1070, y + 31);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1E5AA8';
        ctx.fillText(student.grade ? `الصف ${student.grade}` : gradeLabel, 680, y + 31);
        ctx.fillStyle = '#111827';
        ctx.fillText(String(student.submissionsCount), 530, y + 31);
        ctx.fillStyle = student.gpa >= 50 ? '#047857' : '#DC2626';
        ctx.fillText(`${student.gpa}%`, 370, y + 31);
        ctx.fillStyle = '#1A3A5F';
        ctx.fillText(getStudentRatingLabel(student), 190, y + 31);
      });

      // Signatures Footer
      const sigY = 1580;
      ctx.strokeStyle = '#D1D5DB';
      ctx.beginPath();
      ctx.moveTo(60, sigY);
      ctx.lineTo(1180, sigY);
      ctx.stroke();

      ctx.fillStyle = '#1A3A5F';
      ctx.font = 'bold 19px Cairo, Tajawal, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('المشرف التربوي ورائد الصف', 980, sigY + 42);
      ctx.fillText('وكيل شؤون الطلاب', 620, sigY + 42);
      ctx.fillText('مدير المدرسة والختم الرسمي', 240, sigY + 42);

      ctx.fillStyle = '#6B7280';
      ctx.font = '15px Cairo, Tajawal, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`تاريخ التقرير: ${issueDateStr}`, 60, 1700);

      if (pageIdx > 0) pdf.addPage();
      const imgData = canvas.toDataURL('image/jpeg', 0.88);
      pdf.addImage(imgData, 'JPEG', 5, 5, 200, 287);
    });

    return pdf;
  };

  const handleNativePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current || isGenerating) return;
    setIsGenerating(true);
    setDownloadSuccess(false);

    let container: HTMLElement | null = null;
    try {
      const element = printRef.current;

      if (document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((r) => setTimeout(r, 150)),
        ]);
      }

      container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '820px';
      container.style.minWidth = '820px';
      container.style.maxWidth = '820px';
      container.style.backgroundColor = '#ffffff';
      container.style.zIndex = '-9999';
      container.style.overflow = 'visible';
      container.style.pointerEvents = 'none';

      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.width = '820px';
      clone.style.minWidth = '820px';
      clone.style.maxWidth = '820px';
      clone.style.height = 'auto';
      clone.style.maxHeight = 'none';
      clone.style.overflow = 'visible';
      clone.style.backgroundColor = '#ffffff';
      clone.style.boxSizing = 'border-box';
      clone.style.transform = 'none';
      clone.style.margin = '0';

      clone.querySelectorAll('*').forEach((node) => {
        const el = node as HTMLElement;
        if (el.style && (el.classList.contains('overflow-x-auto') || el.classList.contains('overflow-y-auto'))) {
          el.style.overflow = 'visible';
          el.style.maxWidth = 'none';
        }
      });

      container.appendChild(clone);
      document.body.appendChild(container);

      await new Promise((r) => setTimeout(r, 40));

      const canvas = await html2canvas(clone, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 820,
        windowWidth: 820,
        logging: false,
        onclone: (clonedDoc) => {
          let sanitizedCss = '';
          try {
            Array.from(document.styleSheets).forEach((sheet) => {
              try {
                const rules = sheet.cssRules;
                if (rules) {
                  for (let i = 0; i < rules.length; i++) {
                    sanitizedCss += rules[i].cssText + '\n';
                  }
                }
              } catch {
                // cross-origin stylesheet (like Google Fonts); keep untouched
              }
            });
          } catch {
            // ignore
          }

          if (sanitizedCss) {
            clonedDoc.querySelectorAll('style').forEach((s) => s.remove());
            clonedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((lnk) => {
              const href = lnk.getAttribute('href') || '';
              if (!href.includes('fonts.googleapis.com')) {
                lnk.remove();
              }
            });
            const cleanStyle = clonedDoc.createElement('style');
            cleanStyle.textContent = sanitizeCssTextForCanvas(sanitizedCss);
            clonedDoc.head.appendChild(cleanStyle);
          }
        },
      });

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Canvas rendering produced empty image');
      }

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 7;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;

      const totalMmHeight = (canvas.height * printableWidth) / canvas.width;

      if (totalMmHeight <= printableHeight * 1.22) {
        let renderWidth = printableWidth;
        let renderHeight = totalMmHeight;

        if (totalMmHeight > printableHeight) {
          const fitScale = printableHeight / totalMmHeight;
          renderWidth = printableWidth * fitScale;
          renderHeight = printableHeight;
        }

        const offsetX = margin + (printableWidth - renderWidth) / 2;
        const imgData = canvas.toDataURL('image/jpeg', 0.86);
        pdf.addImage(imgData, 'JPEG', offsetX, margin, renderWidth, renderHeight, undefined, 'FAST');
      } else {
        const pxPerMm = canvas.width / printableWidth;
        const pagePxHeight = Math.floor(printableHeight * pxPerMm);

        let sourceY = 0;
        let pageIdx = 0;

        while (sourceY < canvas.height) {
          const sliceHeight = Math.min(pagePxHeight, canvas.height - sourceY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeight;

          const sliceCtx = sliceCanvas.getContext('2d');
          if (sliceCtx) {
            sliceCtx.fillStyle = '#ffffff';
            sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            sliceCtx.drawImage(
              canvas,
              0,
              sourceY,
              canvas.width,
              sliceHeight,
              0,
              0,
              canvas.width,
              sliceHeight
            );
          }

          const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.86);
          const sliceMmHeight = (sliceHeight * printableWidth) / canvas.width;

          if (pageIdx > 0) pdf.addPage();
          pdf.addImage(sliceDataUrl, 'JPEG', margin, margin, printableWidth, sliceMmHeight, undefined, 'FAST');

          sourceY += sliceHeight;
          pageIdx++;
        }
      }

      const pdfBlob = pdf.output('blob');
      triggerFastBlobDownload(pdfBlob, fileName);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (error) {
      console.warn('Primary Principal PDF render fallback to direct canvas:', error);
      try {
        const fallbackPdf = await buildPdfViaDirectCanvas();
        const pdfBlob = fallbackPdf.output('blob');
        triggerFastBlobDownload(pdfBlob, fileName);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 4000);
      } catch {
        window.print();
      }
    } finally {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto font-['Cairo']">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] overflow-hidden border border-[#E5E7EB]">
        {/* Top Control Bar */}
        <div className="p-3 sm:p-4 bg-[#1A3A5F] text-white flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-white/10 text-white border border-white/20 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-base truncate">
                {reportTitle} (A4)
              </h3>
              <p className="text-[11px] text-[#DBEAFE] truncate">
                {schoolName} • {gradeLabel} • {periodLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleNativePrint}
              type="button"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-bold transition cursor-pointer border border-white/20 whitespace-nowrap shrink-0"
              title="طباعة عبر المتصفح / حفظ كـ PDF"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة مباشرة</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري التجهيز...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#A7F3D0]" />
                  <span>تم التنزيل في الهاتف!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>تحميل ملف PDF</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Print Stylesheet */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-principal-report, #printable-principal-report * {
                  visibility: visible !important;
                }
                #printable-principal-report {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: 100% !important;
                  margin: 0 !important;
                  padding: 10mm !important;
                  box-shadow: none !important;
                  border: none !important;
                }
              }
            `,
          }}
        />

        {/* Scrollable A4 Document Preview */}
        <div className="flex-1 p-2 sm:p-6 overflow-x-auto overflow-y-auto bg-[#E5E7EB]">
          {/* Printable A4 Container using strict Hex Colors for crisp, fast PDF export */}
          <div
            ref={printRef}
            id="printable-principal-report"
            dir="rtl"
            className="bg-[#FFFFFF] w-[820px] min-w-[820px] mx-auto p-5 sm:p-7 rounded-xl border border-[#D1D5DB] text-[#111827] print:border-none print:p-4 print:w-full print:min-w-0 my-2"
          >
            {/* 1. Republic & School Header */}
            <div className="border-b-2 border-[#1E5AA8] pb-3 mb-3">
              <div className="grid grid-cols-3 items-center text-center">
                <div className="text-right space-y-0.5 text-xs font-bold text-[#1F2937]">
                  <p className="text-[#1A3A5F] font-black text-sm">الجمهورية اليمنية</p>
                  <p className="text-[#4B5563]">وزارة التربية والتعليم</p>
                  <p className="text-[#4B5563]">مكتب التربية والتعليم</p>
                  <p className="text-[#1E5AA8] font-bold text-xs pt-0.5">
                    مدرسة: {schoolName || 'المدرسة النموذجية'}
                  </p>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-[#1A3A5F] flex items-center justify-center text-[#FFFFFF] mb-1.5 border-2 border-[#FBBF24]">
                    <School className="w-6 h-6 text-[#FCD34D]" />
                  </div>
                  <h1 className="text-base sm:text-lg font-black text-[#1A3A5F] leading-tight">
                    {reportTitle}
                  </h1>
                  <span className="text-[11px] font-bold text-[#065F46] bg-[#ECFDF5] px-3 py-0.5 rounded-full border border-[#A7F3D0] mt-1">
                    {isAnnual ? 'التقرير التراكمي للعام الدراسي' : 'تقويم الإنجاز والواجبات المستمرة'}
                  </span>
                </div>

                <div className="text-left space-y-0.5 text-xs font-semibold text-[#374151]">
                  <p>
                    العام الدراسي:{' '}
                    <span className="font-bold text-[#111827]">1446-1447هـ / 2025-2026م</span>
                  </p>
                  <p>
                    الصف الدراسي: <span className="font-bold text-[#1E5AA8]">{gradeLabel}</span>
                  </p>
                  <p>
                    فترة التقرير: <span className="font-bold text-[#111827]">{periodLabel}</span>
                  </p>
                  <p className="text-[11px] text-[#6B7280] pt-0.5">تاريخ الإصدار: {issueDateStr}</p>
                </div>
              </div>
            </div>

            {/* 2. Metadata Ribbon */}
            <div className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-xl p-3 mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1E5AA8]" />
                <span className="text-[#4B5563]">الصف المستهدف:</span>
                <span className="font-black text-[#1A3A5F] bg-[#DBEAFE] px-2.5 py-0.5 rounded-lg border border-[#BFDBFE]">
                  {gradeLabel}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-[#1E5AA8]" />
                <span className="text-[#4B5563]">الفترة:</span>
                <span className="font-bold text-[#111827]">{periodLabel}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[#4B5563]">حالة التقرير:</span>
                <span className="px-2.5 py-0.5 rounded-lg font-bold text-[11px] bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7]">
                  كشف معتمد
                </span>
              </div>
            </div>

            {/* 3. KPI Statistics Summary Cards */}
            <div className="grid grid-cols-4 gap-2.5 mb-4 text-center">
              <div className="bg-[#FFFFFF] p-2.5 rounded-xl border border-[#BFDBFE]">
                <span className="text-[11px] text-[#6B7280] font-semibold block">الطلاب المسجلون</span>
                <span className="text-base font-black text-[#1A3A5F] tabular-nums">{totalStudents} طالب</span>
              </div>

              <div className="bg-[#FFFFFF] p-2.5 rounded-xl border border-[#C7D2FE]">
                <span className="text-[11px] text-[#6B7280] font-semibold block">إجمالي التسليمات</span>
                <span className="text-base font-black text-[#4338CA] tabular-nums">{totalSubmissions} تسليم</span>
              </div>

              <div className="bg-[#FFFFFF] p-2.5 rounded-xl border border-[#A7F3D0]">
                <span className="text-[11px] text-[#6B7280] font-semibold block">متوسط أداء الطلاب</span>
                <span className="text-base font-black text-[#047857] tabular-nums">{avgGpa}%</span>
              </div>

              <div className="bg-[#FFFFFF] p-2.5 rounded-xl border border-[#FDE68A]">
                <span className="text-[11px] text-[#6B7280] font-semibold block">نسبة النجاح العامة</span>
                <span className="text-base font-black text-[#B45309] tabular-nums">{passRate}%</span>
              </div>
            </div>

            {/* 4. Grade Sheet Table */}
            <div className="overflow-visible rounded-xl border border-[#D1D5DB] mb-5 bg-[#FFFFFF]">
              <table className="w-full text-right border-collapse text-xs table-fixed">
                <thead>
                  <tr className="bg-[#1A3A5F] text-[#FFFFFF]">
                    <th style={{ width: '6%' }} className="py-2.5 px-1 text-center border-b border-[#2A4D77] font-bold">#</th>
                    <th style={{ width: '28%' }} className="py-2.5 px-3 border-b border-[#2A4D77] font-bold">اسم الطالب كاملاً</th>
                    <th style={{ width: '11%' }} className="py-2.5 px-2 text-center border-b border-[#2A4D77] font-bold">الصف</th>
                    <th style={{ width: '12%' }} className="py-2.5 px-2 text-center border-b border-[#2A4D77] font-bold">عدد التسليمات</th>
                    <th style={{ width: '11%' }} className="py-2.5 px-2 text-center border-b border-[#2A4D77] font-bold">المعدل %</th>
                    <th style={{ width: '16%' }} className="py-2.5 px-2 text-center border-b border-[#2A4D77] font-bold">التقدير العام</th>
                    <th style={{ width: '16%' }} className="py-2.5 px-2 text-center border-b border-[#2A4D77] font-bold">الملاحظات والاعتماد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#9CA3AF] font-bold">
                        لا يوجد طلاب مسجلون في هذا الصف
                      </td>
                    </tr>
                  ) : (
                    students.map((student, idx) => {
                      const isPassing = student.gpa >= 50;
                      let badgeBg = 'bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]';
                      const statusText = getStudentRatingLabel(student);

                      if (student.gpa >= 90 || student.status === 'متميز') {
                        badgeBg = 'bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]';
                      } else if (student.gpa >= 80) {
                        badgeBg = 'bg-[#DBEAFE] text-[#1E40AF] border-[#93C5FD]';
                      } else if (student.gpa >= 65) {
                        badgeBg = 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]';
                      } else if (student.gpa >= 50 || student.status === 'ناجح') {
                        badgeBg = 'bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]';
                      } else if (student.submissionsCount > 0) {
                        badgeBg = 'bg-[#FFE4E6] text-[#9F1239] border-[#FDA4AF]';
                      }

                      return (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? 'bg-[#FFFFFF]' : 'bg-[#F8FAFC]'}
                        >
                          <td style={{ width: '6%' }} className="py-1.5 px-1 text-center font-bold text-[#6B7280] border-l border-[#E5E7EB] tabular-nums">
                            {idx + 1}
                          </td>
                          <td style={{ width: '28%' }} className="py-1.5 px-3 font-bold text-[#111827] border-l border-[#E5E7EB] truncate">
                            {student.studentName}
                          </td>
                          <td style={{ width: '11%' }} className="py-1.5 px-2 text-center font-bold text-[#1E5AA8] border-l border-[#E5E7EB]">
                            {student.grade ? `الصف ${student.grade}` : gradeLabel}
                          </td>
                          <td style={{ width: '12%' }} className="py-1.5 px-2 text-center font-bold border-l border-[#E5E7EB] tabular-nums">
                            <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] font-mono text-xs">
                              {student.submissionsCount}
                            </span>
                          </td>
                          <td style={{ width: '11%' }} className="py-1.5 px-2 text-center font-black border-l border-[#E5E7EB] tabular-nums">
                            <span className={`text-xs ${isPassing ? 'text-[#047857] font-bold' : 'text-[#DC2626] font-bold'}`}>
                              {student.gpa}%
                            </span>
                          </td>
                          <td style={{ width: '16%' }} className="py-1.5 px-2 text-center border-l border-[#E5E7EB]">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeBg}`}
                            >
                              {statusText}
                            </span>
                          </td>
                          <td style={{ width: '16%' }} className="py-1.5 px-2 text-center text-[#6B7280] font-semibold text-[10px]">
                            {student.submissionsCount > 0 ? 'متابع ومشارك' : 'لم يسلم واجبات'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 5. Official Signatures Section */}
            <div className="pt-3 border-t-2 border-[#D1D5DB]">
              <div className="grid grid-cols-3 gap-4 text-center text-xs font-bold text-[#1F2937]">
                <div className="space-y-2">
                  <p className="text-[#1A3A5F]">المشرف التربوي ورائد الصف</p>
                  <p className="text-[#6B7280] font-normal text-[11px]">الاسم: ............................</p>
                  <p className="text-[#9CA3AF] font-normal text-[11px]">التوقيع: ............................</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[#1A3A5F]">وكيل شؤون الطلاب</p>
                  <p className="text-[#6B7280] font-normal text-[11px]">الاسم: ............................</p>
                  <p className="text-[#9CA3AF] font-normal text-[11px]">التوقيع: ............................</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[#1A3A5F]">مدير المدرسة والختم الرسمي</p>
                  <p className="text-[#6B7280] font-normal text-[11px]">الاسم: ............................</p>
                  <div className="w-18 h-10 border border-dashed border-[#9CA3AF] rounded-lg mx-auto flex items-center justify-center text-[9px] text-[#9CA3AF] font-normal">
                    (ختم المدرسة)
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-[#E5E7EB] flex items-center justify-end text-[9px] text-[#6B7280]">
                <span>تاريخ التقرير: {issueDateStr}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
