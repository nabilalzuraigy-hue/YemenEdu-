import React, { useState } from 'react';
import { Calendar, Image as ImageIcon, Lock, Maximize2, User, X } from 'lucide-react';
import { SCHEDULE_DAYS, SCHEDULE_PERIODS, ScheduleSlot } from '../services/appData';
import { normalizeArabicForMatch } from '../services/authService';

interface ScheduleGridViewProps {
  entries: ScheduleSlot[];
  scheduleImageUrl?: string;
  title?: string;
  subtitle?: string;
  highlightTeacherName?: string;
  highlightSubject?: string;
  compact?: boolean;
}

const cleanTeacherTitle = (name?: string) =>
  (name || '')
    .replace(/^(أ\.?|أستاذ|الاستاذ|الأستاذ|معلم|المعلم)\s*/gi, '')
    .split('-')[0]
    .trim();

export const doesSlotMatchTeacher = (
  slot: ScheduleSlot,
  teacherName?: string,
  teacherSubject?: string
): boolean => {
  if (!slot) return false;
  const normTarget = normalizeArabicForMatch(cleanTeacherTitle(teacherName));
  const normSlotTeacher = normalizeArabicForMatch(cleanTeacherTitle(slot.teacherName));
  if (normTarget && normSlotTeacher) {
    if (
      normSlotTeacher === normTarget ||
      normSlotTeacher.includes(normTarget) ||
      normTarget.includes(normSlotTeacher)
    ) {
      return true;
    }
    const targetWords = normTarget.split(' ').filter((w) => w.length >= 2);
    const slotWords = normSlotTeacher.split(' ').filter((w) => w.length >= 2);
    if (targetWords.length >= 2 && slotWords.length >= 2) {
      const common = targetWords.filter((w) => slotWords.includes(w));
      if (common.length >= 2) return true;
    }
  }
  const normSubjTarget = normalizeArabicForMatch(teacherSubject || '');
  const normSlotSubj = normalizeArabicForMatch(slot.subject || '');
  if (!normSlotTeacher && normSubjTarget && normSlotSubj) {
    return normSlotSubj.includes(normSubjTarget) || normSubjTarget.includes(normSlotSubj);
  }
  return false;
};

export const ScheduleGridView: React.FC<ScheduleGridViewProps> = ({
  entries,
  scheduleImageUrl,
  title,
  subtitle,
  highlightTeacherName,
  highlightSubject,
  compact = false,
}) => {
  const [isImageZoomed, setIsImageZoomed] = useState(false);
  const [showOriginalImage, setShowOriginalImage] = useState(false);

  const hasStructuredEntries = Array.isArray(entries) && entries.length > 0;
  const slotMap = new Map<string, ScheduleSlot>();
  (entries || []).forEach((slot) => {
    if (slot && slot.day && slot.period) {
      slotMap.set(`${slot.day}_${slot.period}`, slot);
    }
  });

  return (
    <div dir="rtl" className="space-y-2.5 text-right font-['Cairo','Tajawal']">
      {(title || subtitle) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && (
              <h4 className="text-sm sm:text-base font-black text-[#1A3A5F] flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#1F5AAA] shrink-0" />
                <span>{title}</span>
              </h4>
            )}
            {subtitle && (
              <p className="text-[11px] sm:text-xs font-semibold text-[#5C7085] mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {hasStructuredEntries && scheduleImageUrl && (
              <button
                type="button"
                onClick={() => setShowOriginalImage((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black cursor-pointer transition"
              >
                <ImageIcon className="w-3 h-3" />
                <span>{showOriginalImage ? 'إخفاء صورة الجدول' : 'صورة الجدول'}</span>
              </button>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black">
              <Lock className="w-3 h-3" />
              <span>ثابت — الترم الأول</span>
            </span>
          </div>
        </div>
      )}

      {scheduleImageUrl && (!hasStructuredEntries || showOriginalImage) && (
        <div className="rounded-2xl border border-[#DCE7F3] bg-[#F8FAFD] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#1A3A5F]">
              <ImageIcon className="w-4 h-4 text-[#1F5AAA]" />
              <span>{hasStructuredEntries ? 'صورة الجدول الأصلية' : 'صورة جدول الحصص (مرفوعة كما هي)'}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsImageZoomed(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white hover:bg-[#EEF5FC] text-[#1F5AAA] border border-[#C6DCF2] text-[11px] font-black cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>تكبير</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsImageZoomed(true)}
            className="block w-full rounded-xl overflow-hidden border border-[#DCE7F3] bg-white cursor-zoom-in"
          >
            <img
              src={scheduleImageUrl}
              alt={title || 'صورة جدول الحصص'}
              className="w-full max-h-[420px] object-contain mx-auto"
            />
          </button>
        </div>
      )}

      {(hasStructuredEntries || !scheduleImageUrl) && (
        <div className="overflow-x-auto rounded-2xl border border-[#DCE7F3] bg-white shadow-2xs">
          <table className="w-full min-w-[660px] text-right border-collapse">
            <thead>
              <tr className="bg-[#1F5AAA] text-white text-xs font-black">
                <th className="sticky right-0 z-10 bg-[#1F5AAA] p-2.5 sm:p-3 border-l border-[#3771BD] w-24 whitespace-nowrap">
                  اليوم / الحصة
                </th>
                {SCHEDULE_PERIODS.map((p) => (
                  <th
                    key={p.period}
                    className="p-2.5 sm:p-3 text-center border-l border-[#3771BD]/50 last:border-l-0 whitespace-nowrap"
                  >
                    <div>الحصة {p.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DCE7F3] text-xs">
              {SCHEDULE_DAYS.map((day) => (
                <tr key={day} className="hover:bg-[#F8FAFD] transition">
                  <td className="sticky right-0 z-10 bg-[#F4F8FC] p-2.5 sm:p-3 font-black text-[#1A3A5F] border-l border-[#DCE7F3] whitespace-nowrap">
                    {day}
                  </td>
                  {SCHEDULE_PERIODS.map((p) => {
                    const slot = slotMap.get(`${day}_${p.period}`);
                    const hasContent = Boolean(slot && (slot.subject?.trim() || slot.teacherName?.trim()));
                    const isHighlighted =
                      Boolean(highlightTeacherName || highlightSubject) &&
                      slot &&
                      doesSlotMatchTeacher(slot, highlightTeacherName, highlightSubject);

                    return (
                      <td
                        key={`${day}_${p.period}`}
                        className={`p-2 border-l border-[#E6EEF7] last:border-l-0 align-top ${
                          isHighlighted
                            ? 'bg-[#EEF5FC] ring-2 ring-inset ring-[#1F5AAA]/40'
                            : hasContent
                            ? 'bg-white'
                            : 'bg-[#FAFBFD]'
                        }`}
                      >
                        {hasContent && slot ? (
                          <div className={compact ? 'space-y-0.5' : 'space-y-1 min-h-[42px]'}>
                            <div className="font-black text-[#1A3A5F] text-xs leading-snug">
                              {slot.subject || '—'}
                            </div>
                            {slot.teacherName && (
                              <div className="text-[11px] font-semibold text-[#5C7085] flex items-center gap-1">
                                <User className="w-3 h-3 text-[#1F5AAA] shrink-0" />
                                <span className="truncate">{slot.teacherName}</span>
                              </div>
                            )}
                            {isHighlighted && (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-[#1F5AAA] text-white text-[10px] font-black">
                                حصتك
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-center text-[11px] text-slate-300 font-bold py-2">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isImageZoomed && scheduleImageUrl && (
        <div
          onClick={() => setIsImageZoomed(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl w-full bg-white rounded-2xl p-2 shadow-2xl border border-[#DCE7F3]"
          >
            <button
              type="button"
              onClick={() => setIsImageZoomed(false)}
              className="absolute top-3 left-3 z-10 w-9 h-9 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center cursor-pointer"
              aria-label="إغلاق الصورة"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={scheduleImageUrl}
              alt={title || 'صورة جدول الحصص'}
              className="w-full max-h-[85dvh] object-contain rounded-xl bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
};
