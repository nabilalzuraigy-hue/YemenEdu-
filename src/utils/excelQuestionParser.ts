import * as XLSX from 'xlsx';
import {
  LessonQuestionKind,
  ShuffleableQuestion,
  shuffleAndBalanceQuestions,
} from './questionShuffle';

export interface ImportedExcelQuestion extends ShuffleableQuestion {
  id: string;
  questionKind: LessonQuestionKind;
  points: number;
}

function resolveCorrectOptionIndex(
  rawAnswer: unknown,
  options: string[],
  isTrueFalse: boolean
): number {
  const raw = String(rawAnswer ?? '').trim();
  const upper = raw.toUpperCase();
  const normalizedAr = raw.replace(/[أإآ]/g, 'ا').trim();

  if (isTrueFalse) {
    if (
      normalizedAr.includes('خطا') ||
      upper === 'FALSE' ||
      upper === 'F' ||
      upper === 'B' ||
      raw === '2' ||
      raw === 'ب' ||
      normalizedAr === 'لا'
    ) {
      return 1;
    }
    return 0;
  }

  if (upper === 'A' || raw === 'أ' || raw === 'ا' || raw === '1') return 0;
  if (upper === 'B' || raw === 'ب' || raw === '2') return 1;
  if (upper === 'C' || raw === 'ج' || raw === '3') return 2;
  if (upper === 'D' || raw === 'د' || raw === '4') return 3;

  // Match exact option text
  const textMatchIdx = options.findIndex(
    (opt) => opt.trim().toLowerCase() === raw.toLowerCase()
  );
  if (textMatchIdx >= 0) return textMatchIdx;

  return 0;
}

function isHeaderRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return (
    joined.includes('السؤال') ||
    joined.includes('نص السؤال') ||
    joined.includes('question') ||
    joined.includes('الخيار') ||
    joined.includes('option')
  );
}

/**
 * Parses an Excel/CSV question sheet (.xlsx, .xls, .csv) and applies
 * anti-cheat random shuffling + balanced A/B/C/D answer distribution.
 */
export async function parseAndShuffleExcelQuestions(
  file: File
): Promise<ImportedExcelQuestion[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('ملف الإكسل فارغ ولا يحتوي على أي ورقة عمل.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error('لم يتم العثور على بيانات في ملف الإكسل.');
  }

  const parsed: ImportedExcelQuestion[] = [];

  for (let r = 0; r < rawRows.length; r++) {
    const row = Array.isArray(rawRows[r])
      ? rawRows[r].map((c) => String(c ?? '').trim())
      : [];
    if (row.length === 0 || row.every((c) => !c)) continue;
    if (r === 0 && isHeaderRow(row)) continue;

    const questionText = row[0] || '';
    if (!questionText) continue;

    const opt1 = row[1] || '';
    const opt2 = row[2] || '';
    const opt3 = row[3] || '';
    const opt4 = row[4] || '';
    const answerCell = row[5] || '';
    const pointsNum = Number(row[6]);
    const points = Number.isFinite(pointsNum) && pointsNum > 0 ? Math.min(50, Math.round(pointsNum)) : 5;
    const typeHint = (row[7] || '').toLowerCase();

    const nonEmptyOpts = [opt1, opt2, opt3, opt4].filter(Boolean);
    const looksLikeTrueFalse =
      typeHint.includes('صح') ||
      typeHint.includes('true') ||
      (nonEmptyOpts.length === 2 &&
        nonEmptyOpts.some((o) => o.includes('صح') || o.toLowerCase() === 'true')) ||
      (nonEmptyOpts.length === 0 &&
        (answerCell.includes('صح') || answerCell.includes('خط')));

    if (looksLikeTrueFalse) {
      const correctIndex = resolveCorrectOptionIndex(answerCell, ['صح', 'خطأ'], true);
      parsed.push({
        id: `excel-${Date.now()}-${r}-${Math.random().toString(36).slice(2, 6)}`,
        questionKind: 'true_false',
        questionText,
        options: ['صح', 'خطأ'],
        correctIndex,
        points,
      });
    } else if (nonEmptyOpts.length >= 2) {
      const options =
        nonEmptyOpts.length >= 4
          ? nonEmptyOpts.slice(0, 4)
          : [
              nonEmptyOpts[0] || 'الخيار الأول',
              nonEmptyOpts[1] || 'الخيار الثاني',
              nonEmptyOpts[2] || 'الخيار الثالث',
              nonEmptyOpts[3] || 'الخيار الرابع',
            ];
      const correctIndex = resolveCorrectOptionIndex(answerCell, options, false);
      const isFillBlank = questionText.includes('...') || questionText.includes('___') || typeHint.includes('أكمل');
      parsed.push({
        id: `excel-${Date.now()}-${r}-${Math.random().toString(36).slice(2, 6)}`,
        questionKind: isFillBlank ? 'fill_blank' : 'mcq',
        questionText,
        options,
        correctIndex,
        points,
      });
    }
  }

  if (parsed.length === 0) {
    throw new Error(
      'لم يتم العثور على أسئلة صالحة. تأكد من تنسيق الأعمدة: نص السؤال، الخيار 1، الخيار 2، الخيار 3، الخيار 4، الإجابة الصحيحة.'
    );
  }

  return shuffleAndBalanceQuestions(parsed) as ImportedExcelQuestion[];
}
