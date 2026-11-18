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
  UserCheck,
  Loader2,
  Printer,
} from 'lucide-react';

export interface GradeSheetRosterItem {
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

interface GradeSheetPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  roster: GradeSheetRosterItem[];
  schoolName: string;
  teacherName: string;
  subject: string;
  gradeLabel: string;
  monthLabel: string;
  isArchive: boolean;
  archiveDate?: string;
}

export const GradeSheetPdfModal: React.FC<GradeSheetPdfModalProps> = ({
  isOpen,
  onClose,
  roster,
  schoolName,
  teacherName,
  subject,
  gradeLabel,
  monthLabel,
  isArchive,
  archiveDate,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen) return null;

  // Key KPI stats
  const totalStudents = roster.length;
  const totalSubmissions = roster.reduce((sum, s) => sum + (s.submissionsCount || 0), 0);
  const avgPercentage =
    totalStudents > 0
      ? Math.round(roster.reduce((sum, s) => sum + (s.percentage || 0), 0) / totalStudents)
      : 0;
  const passingCount = roster.filter((s) => s.percentage >= 50).length;
  const passRate = totalStudents > 0 ? Math.round((passingCount / totalStudents) * 100) : 0;

  const issueDateStr = archiveDate || new Date().toLocaleDateString('ar-YE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const fileName = `كشف_درجات_${schoolName}_${gradeLabel}_${subject}_${monthLabel}.pdf`.replace(/\s+/g, '_');

  const handleDownloadPdf = async () => {
    if (!printRef.current || isGenerating) return;
    setIsGenerating(true);
    setDownloadSuccess(false);

    let container: HTMLElement | null = null;
    try {
      const element = printRef.current;

      // 1. Create an offscreen staging container with absolute positioning (NOT fixed)
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

      // Unclip all scrollable child wrappers inside the clone
      clone.querySelectorAll('*').forEach((node) => {
        const el = node as HTMLElement;
        if (el.style) {
          if (el.classList.contains('overflow-x-auto') || el.classList.contains('overflow-y-auto')) {
            el.style.overflow = 'visible';
            el.style.maxWidth = 'none';
          }
        }
      });

      container.appendChild(clone);
      document.body.appendChild(container);

      // Wait 120ms for complete browser layout and font rendering
      await new Promise((r) => setTimeout(r, 120));

      // 2. Render directly with html2canvas (clean, high-res canvas)
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 820,
        windowWidth: 820,
        logging: false,
      });

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Canvas rendering produced empty image');
      }

      // 3. Initialize jsPDF in A4 format (210mm x 297mm)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 7; // 7mm margins
      const printableWidth = pageWidth - margin * 2; // 196mm
      const printableHeight = pageHeight - margin * 2; // 283mm

      const totalMmHeight = (canvas.height * printableWidth) / canvas.width;

      // 4. Intelligent A4 Fitting:
      // If the document fits on 1 page (or fits with subtle <=22% proportional scaling),
      // place it on ONE complete page so nothing is sliced or separated!
      if (totalMmHeight <= printableHeight * 1.22) {
        let renderWidth = printableWidth;
        let renderHeight = totalMmHeight;

        if (totalMmHeight > printableHeight) {
          const fitScale = printableHeight / totalMmHeight;
          renderWidth = printableWidth * fitScale;
          renderHeight = printableHeight;
        }

        const offsetX = margin + (printableWidth - renderWidth) / 2;
        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        pdf.addImage(imgData, 'JPEG', offsetX, margin, renderWidth, renderHeight);
      } else {
        // Multi-page handling: Slice cleanly without clipping
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
              0, sourceY, canvas.width, sliceHeight,
              0, 0, canvas.width, sliceHeight
            );
          }

          const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.98);
          const sliceMmHeight = (sliceHeight * printableWidth) / canvas.width;

          if (pageIdx > 0) pdf.addPage();
          pdf.addImage(sliceDataUrl, 'JPEG', margin, margin, printableWidth, sliceMmHeight);

          sourceY += sliceHeight;
          pageIdx++;
        }
      }

      // 5. Save PDF
      pdf.save(fileName);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (error) {
      console.warn('Direct PDF canvas failed, falling back to window.print():', error);
      window.print();
    } finally {
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto font-['Cairo']">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] overflow-hidden border border-gray-200">
        
        {/* Top Control Header - Only 1 download button + Close button */}
        <div className="p-3 sm:p-4 bg-linear-to-r from-[#1A3A5F] to-[#1E5AA8] text-white flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-white/10 text-white border border-white/20 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-base truncate">
                كشف درجات الطلاب الشهري (A4)
              </h3>
              <p className="text-[11px] text-blue-100 truncate">
                {schoolName} • {subject} • {gradeLabel} • شهر: {monthLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Native Browser Print Button */}
            <button
              onClick={() => window.print()}
              type="button"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-bold transition cursor-pointer border border-white/20"
              title="طباعة عبر المتصفح / حفظ كـ PDF"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة مباشرة</span>
            </button>

            {/* The Primary Download Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري التحميل...</span>
                </>
              ) : downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span>تم التحميل بنجاح!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>تحميل ملف PDF</span>
                </>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Print Stylesheet for Grade Sheet */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                body * {
                  visibility: hidden !important;
                }
                #printable-grade-sheet, #printable-grade-sheet * {
                  visibility: visible !important;
                }
                #printable-grade-sheet {
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

        {/* Scrollable A4 Document Preview (block + mx-auto prevents flex justify-center mobile edge clipping) */}
        <div className="flex-1 p-2 sm:p-6 overflow-x-auto overflow-y-auto bg-gray-200/80">
          
          {/* Printable A4 Container: 210mm representation */}
          <div
            ref={printRef}
            id="printable-grade-sheet"
            dir="rtl"
            className="bg-white w-[820px] min-w-[820px] mx-auto p-5 sm:p-7 rounded-xl shadow-xl border border-gray-300 text-gray-900 print:shadow-none print:border-none print:p-4 print:w-full print:min-w-0 my-2"
          >
            {/* 1. Official Republic & School Header */}
            <div className="border-b-2 border-[#1E5AA8] pb-3 mb-3">
              <div className="grid grid-cols-3 items-center text-center">
                
                {/* Right: State & Directorate */}
                <div className="text-right space-y-0.5 text-xs font-bold text-gray-800">
                  <p className="text-[#1A3A5F] font-black text-sm">الجمهورية اليمنية</p>
                  <p className="text-gray-600">وزارة التربية والتعليم</p>
                  <p className="text-gray-600">مكتب التربية والتعليم</p>
                  <p className="text-[#1E5AA8] font-bold text-xs pt-0.5">
                    مدرسة: {schoolName || 'المدرسة النموذجية'}
                  </p>
                </div>

                {/* Center: Emblem & Title */}
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-linear-to-br from-[#1A3A5F] to-[#1E5AA8] flex items-center justify-center text-white shadow-md mb-1.5 border-2 border-amber-400">
                    <School className="w-6 h-6 text-amber-300" />
                  </div>
                  <h1 className="text-base sm:text-lg font-black text-[#1A3A5F] leading-tight">
                    كشف درجات الطلاب الشهري
                  </h1>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-3 py-0.5 rounded-full border border-emerald-200 mt-1">
                    تقويم الواجبات والأنشطة المستمرة
                  </span>
                </div>

                {/* Left: Academic Year, Date, and Term */}
                <div className="text-left space-y-0.5 text-xs font-semibold text-gray-700">
                  <p>العام الدراسي: <span className="font-bold text-gray-900">1446-1447هـ / 2025-2026م</span></p>
                  <p>الصف والشعبة: <span className="font-bold text-[#1E5AA8]">{gradeLabel}</span></p>
                  <p>المادة المقررة: <span className="font-bold text-gray-900">{subject}</span></p>
                  <p className="text-[11px] text-gray-500 pt-0.5">تاريخ الكشف: {issueDateStr}</p>
                </div>
              </div>
            </div>

            {/* 2. Metadata Ribbon */}
            <div className="bg-[#F0F7FF] border border-[#BFDBFE] rounded-xl p-3 mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1E5AA8]" />
                <span className="text-gray-600">شهر التقييم:</span>
                <span className="font-black text-[#1A3A5F] bg-blue-100 px-2.5 py-0.5 rounded-lg border border-blue-200">
                  شهر {monthLabel}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#1E5AA8]" />
                <span className="text-gray-600">معلم المادة:</span>
                <span className="font-bold text-gray-900">{teacherName}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-600">حالة الاعتماد:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-lg font-bold text-[11px] ${
                    isArchive
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {isArchive ? 'كشف معتمد ومؤرشف' : 'كشف حي ونشط'}
                </span>
              </div>
            </div>

            {/* 3. KPI Statistics Summary Cards */}
            <div className="grid grid-cols-4 gap-2.5 mb-4 text-center">
              <div className="bg-white p-2.5 rounded-xl border border-blue-200 shadow-2xs">
                <span className="text-[11px] text-gray-500 font-semibold block">إجمالي الطلاب</span>
                <span className="text-base font-black text-[#1A3A5F]">{totalStudents} طالب</span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-[11px] text-gray-500 font-semibold block">عدد التسليمات</span>
                <span className="text-base font-black text-indigo-700">{totalSubmissions} تسليم</span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-2xs">
                <span className="text-[11px] text-gray-500 font-semibold block">متوسط درجات الصف</span>
                <span className="text-base font-black text-emerald-700">{avgPercentage}%</span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-amber-200 shadow-2xs">
                <span className="text-[11px] text-gray-500 font-semibold block">نسبة الإنجاز</span>
                <span className="text-base font-black text-amber-700">{passRate}%</span>
              </div>
            </div>

            {/* 4. Grade Sheet Table (Only Student Name - NO Student Code) */}
            <div className="overflow-x-auto rounded-xl border border-gray-300 mb-6">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1A3A5F] text-white">
                    <th className="py-2.5 px-2 text-center w-8 border-b border-[#2A4D77] font-bold">#</th>
                    <th className="py-2.5 px-4 border-b border-[#2A4D77] font-bold">اسم الطالب كاملاً</th>
                    <th className="py-2.5 px-2.5 text-center border-b border-[#2A4D77] font-bold">الشهر</th>
                    <th className="py-2.5 px-2.5 text-center border-b border-[#2A4D77] font-bold">عدد التسليمات</th>
                    <th className="py-2.5 px-3 text-center border-b border-[#2A4D77] font-bold">الدرجة المحصلة</th>
                    <th className="py-2.5 px-2.5 text-center border-b border-[#2A4D77] font-bold">النسبة %</th>
                    <th className="py-2.5 px-3 text-center border-b border-[#2A4D77] font-bold">التقدير العام</th>
                    <th className="py-2.5 px-3 text-center border-b border-[#2A4D77] font-bold">الملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {roster.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400 font-bold">
                        لا توجد بيانات مسجلة في هذا الكشف
                      </td>
                    </tr>
                  ) : (
                    roster.map((student, idx) => {
                      const isPassing = student.percentage >= 50;
                      let badgeBg = 'bg-gray-100 text-gray-700 border-gray-300';
                      if (student.percentage >= 90) {
                        badgeBg = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                      } else if (student.percentage >= 80) {
                        badgeBg = 'bg-blue-100 text-blue-800 border-blue-300';
                      } else if (student.percentage >= 65) {
                        badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                      } else if (student.percentage >= 50) {
                        badgeBg = 'bg-orange-100 text-orange-800 border-orange-300';
                      } else if (student.submissionsCount > 0) {
                        badgeBg = 'bg-rose-100 text-rose-800 border-rose-300';
                      }

                      return (
                        <tr
                          key={student.code || idx}
                          className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}
                        >
                          <td className="py-2 px-2 text-center font-bold text-gray-500 border-l border-gray-200">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-4 font-bold text-gray-900 border-l border-gray-200">
                            {student.name}
                          </td>
                          <td className="py-2 px-2.5 text-center font-semibold text-gray-600 border-l border-gray-200">
                            {monthLabel}
                          </td>
                          <td className="py-2 px-2.5 text-center font-bold border-l border-gray-200">
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                              {student.submissionsCount}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center border-l border-gray-200">
                            <span className="font-black text-[#1A3A5F]">
                              {student.totalEarned}
                            </span>
                            <span className="text-[10px] text-gray-500 font-semibold mr-1">
                              / {student.totalPossible}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-center font-black border-l border-gray-200">
                            <span className={isPassing ? 'text-emerald-700' : 'text-rose-600'}>
                              {student.percentage}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center border-l border-gray-200">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeBg}`}
                            >
                              {student.rating}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center text-gray-500 font-semibold text-[11px]">
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
            <div className="pt-3 border-t-2 border-gray-300">
              <div className="grid grid-cols-3 gap-4 text-center text-xs font-bold text-gray-800">
                <div className="space-y-2">
                  <p className="text-[#1A3A5F]">معلم المادة</p>
                  <p className="text-gray-900 font-semibold text-[11px]">{teacherName}</p>
                  <p className="text-gray-400 font-normal text-[11px]">التوقيع: ............................</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[#1A3A5F]">المشرف التربوي</p>
                  <p className="text-gray-500 font-normal text-[11px]">الاسم: ............................</p>
                  <p className="text-gray-400 font-normal text-[11px]">التوقيع: ............................</p>
                </div>

                <div className="space-y-2">
                  <p className="text-[#1A3A5F]">مدير المدرسة والختم الرسمي</p>
                  <p className="text-gray-500 font-normal text-[11px]">الاسم: ............................</p>
                  <div className="w-18 h-10 border border-dashed border-gray-400 rounded-lg mx-auto flex items-center justify-center text-[9px] text-gray-400 font-normal">
                    (ختم المدرسة)
                  </div>
                </div>
              </div>

              {/* Bottom Official Watermark Note */}
              <div className="mt-3 pt-2 border-t border-gray-200 flex items-center justify-between text-[9px] text-gray-500">
                <span>وثيقة رسمية صادرة آلياً عن منصة اليمن التعليمية YemenEdu • معايير A4</span>
                <span>تاريخ التقرير: {issueDateStr}</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
