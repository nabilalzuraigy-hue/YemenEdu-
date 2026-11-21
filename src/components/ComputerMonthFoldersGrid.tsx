import React from 'react';
import { Folder } from 'lucide-react';
import { ACADEMIC_MONTHS } from '../services/appData';

interface ComputerMonthFoldersGridProps {
  currentMonth: string;
  getCountForMonth: (monthName: string) => number;
  unitLabel: string;
  headerTitle?: string;
  onSelectMonth: (monthName: string) => void;
}

export const ComputerMonthFoldersGrid: React.FC<ComputerMonthFoldersGridProps> = ({
  currentMonth,
  getCountForMonth,
  unitLabel,
  headerTitle = 'اختر مجلد الشهر لفتح محتوياته:',
  onSelectMonth,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 rounded-2xl border border-[#DCE7F3] shadow-2xs">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-amber-600 fill-amber-300" />
          <span className="text-xs sm:text-sm font-black text-[#1A3A5F]">
            {headerTitle}
          </span>
        </div>
        <span className="text-[11px] font-bold text-[#5C7085] tabular-nums">
          {ACADEMIC_MONTHS.length} مجلدات شهرية
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 pt-1">
        {ACADEMIC_MONTHS.map((monthName) => {
          const itemCount = getCountForMonth(monthName);
          const isCurrent = monthName === currentMonth;
          return (
            <button
              key={`teacher-folder-${monthName}`}
              type="button"
              onClick={() => onSelectMonth(monthName)}
              className="group text-right focus:outline-none cursor-pointer"
            >
              {/* Computer Desktop Folder Tab */}
              <div className="flex items-end pr-1.5">
                <div
                  className={`w-14 h-3 rounded-t-lg border-t-2 border-x-2 transition-colors ${
                    itemCount > 0 || isCurrent
                      ? 'bg-[#E5A926] border-[#B7791F] group-hover:bg-[#D99B16]'
                      : 'bg-[#CBD5E1] border-[#94A3B8] group-hover:bg-[#E5A926] group-hover:border-[#B7791F]'
                  }`}
                />
              </div>

              {/* Computer Desktop Folder Body */}
              <div
                className={`relative rounded-b-2xl rounded-tl-2xl border-2 p-3.5 transition-all shadow-xs group-hover:-translate-y-1 group-hover:shadow-md ${
                  itemCount > 0 || isCurrent
                    ? 'bg-gradient-to-b from-[#FFE699] via-[#FFD86B] to-[#F4C144] border-[#C68A1E]'
                    : 'bg-gradient-to-b from-[#F1F5F9] via-[#E2E8F0] to-[#CBD5E1] border-[#94A3B8] group-hover:from-[#FFE699] group-hover:via-[#FFD86B] group-hover:to-[#F4C144] group-hover:border-[#C68A1E]'
                }`}
              >
                {itemCount > 0 && (
                  <div className="mx-1 mb-2 h-1.5 rounded-full bg-white/90 border border-amber-700/20 shadow-2xs" />
                )}

                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <Folder
                    className={`w-7 h-7 transition-transform group-hover:scale-105 ${
                      itemCount > 0 || isCurrent
                        ? 'text-[#8C5A08] fill-[#B7791F]/20'
                        : 'text-slate-600 fill-slate-400/20 group-hover:text-[#8C5A08]'
                    }`}
                  />
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black border tabular-nums ${
                      itemCount > 0
                        ? 'bg-white/95 text-[#1A3A5F] border-amber-700/25 shadow-2xs'
                        : 'bg-white/75 text-slate-600 border-slate-300'
                    }`}
                  >
                    {itemCount > 0 ? `${itemCount} ${unitLabel}` : 'فارغ'}
                  </span>
                </div>

                <div className="font-black text-xs sm:text-sm text-[#1A3A5F] leading-snug">
                  مجلد {monthName}
                </div>
                <div className="text-[10px] font-bold text-[#4A3B12]/80 mt-0.5">
                  {isCurrent ? 'الشهر الحالي' : 'اضغط لفتح المجلد'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
