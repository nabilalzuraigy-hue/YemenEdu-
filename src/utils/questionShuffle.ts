export type LessonQuestionKind = 'mcq' | 'true_false' | 'fill_blank';

export interface ShuffleableQuestion {
  questionKind?: LessonQuestionKind;
  questionText: string;
  options: string[];
  correctIndex: number;
  points?: number;
}

function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Normalizes a True/False question to canonical ['صح', 'خطأ'] options
 * while preserving the correct answer index (0 = صح, 1 = خطأ).
 */
function normalizeTrueFalseQuestion<T extends ShuffleableQuestion>(q: T): T {
  const chosenText = String(q.options?.[q.correctIndex] ?? '').trim();
  const lower = chosenText.toLowerCase();
  const isFalse =
    lower.includes('خطا') ||
    lower.includes('خطأ') ||
    lower === 'false' ||
    lower === 'no' ||
    lower === 'لا' ||
    lower === '0';

  const correctIndex = isFalse ? 1 : 0;
  return {
    ...q,
    questionKind: 'true_false',
    options: ['صح', 'خطأ'],
    correctIndex,
  };
}

/**
 * Anti-cheat option shuffler & balanced A/B/C/D distributor:
 * - Shuffles options randomly for every 4-option question
 * - Distributes correct answers evenly across positions 0 (A), 1 (B), 2 (C), 3 (D)
 * - Prevents two consecutive questions from having the same correct answer index
 */
export function shuffleAndBalanceQuestions<T extends ShuffleableQuestion>(questions: T[]): T[] {
  if (!Array.isArray(questions) || questions.length === 0) return [];

  const normalized = questions.map((q) => {
    const cleanOpts = (Array.isArray(q.options) ? q.options : [])
      .map((o) => String(o || '').trim())
      .filter(Boolean);

    if (q.questionKind === 'true_false' || cleanOpts.length === 2) {
      return normalizeTrueFalseQuestion({
        ...q,
        options: cleanOpts.length >= 2 ? cleanOpts.slice(0, 2) : ['صح', 'خطأ'],
      });
    }

    const paddedOpts = [
      cleanOpts[0] || 'الخيار الأول',
      cleanOpts[1] || 'الخيار الثاني',
      cleanOpts[2] || 'الخيار الثالث',
      cleanOpts[3] || 'الخيار الرابع',
    ];
    const safeIdx =
      Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3
        ? q.correctIndex
        : 0;

    return {
      ...q,
      questionKind: q.questionKind || 'mcq',
      options: paddedOpts,
      correctIndex: safeIdx,
    };
  });

  // Count how many 4-option questions exist
  const fourOptionIndices: number[] = [];
  normalized.forEach((q, idx) => {
    if (q.options.length === 4) {
      fourOptionIndices.push(idx);
    }
  });

  if (fourOptionIndices.length === 0) {
    return normalized;
  }

  // Build an evenly balanced pool of target positions (0..3)
  const pool: number[] = [];
  const fullCycles = Math.floor(fourOptionIndices.length / 4);
  for (let c = 0; c < fullCycles; c++) {
    pool.push(...fisherYatesShuffle([0, 1, 2, 3]));
  }
  const remainder = fourOptionIndices.length % 4;
  if (remainder > 0) {
    pool.push(...fisherYatesShuffle([0, 1, 2, 3]).slice(0, remainder));
  }

  // Assign slots from pool such that no two adjacent questions share the same correctIndex
  const assignedTargetByQuestionIndex = new Map<number, number>();
  let bestAssignment: Map<number, number> | null = null;

  for (let attempt = 0; attempt < 40; attempt++) {
    const candidatePool = fisherYatesShuffle(pool);
    const candidateMap = new Map<number, number>();
    let prevPos = -1;
    let valid = true;

    for (let i = 0; i < normalized.length; i++) {
      const q = normalized[i];
      if (q.options.length !== 4) {
        prevPos = q.correctIndex;
        continue;
      }

      const nextQ = i + 1 < normalized.length ? normalized[i + 1] : null;
      const nextFixedPos = nextQ && nextQ.options.length !== 4 ? nextQ.correctIndex : -1;

      // Pick a slot in candidatePool avoiding prevPos (and nextFixedPos if possible)
      let pickIdx = candidatePool.findIndex(
        (slot) => slot !== prevPos && (nextFixedPos === -1 || slot !== nextFixedPos)
      );
      if (pickIdx === -1) {
        pickIdx = candidatePool.findIndex((slot) => slot !== prevPos);
      }
      if (pickIdx === -1) {
        valid = false;
        break;
      }

      const [chosenSlot] = candidatePool.splice(pickIdx, 1);
      candidateMap.set(i, chosenSlot);
      prevPos = chosenSlot;
    }

    if (valid) {
      bestAssignment = candidateMap;
      break;
    }
  }

  if (bestAssignment) {
    bestAssignment.forEach((slot, qIdx) => assignedTargetByQuestionIndex.set(qIdx, slot));
  } else {
    // Deterministic fallback avoiding consecutive repeats while staying balanced
    let prevPos = -1;
    const fallbackPool = fisherYatesShuffle(pool);
    for (let i = 0; i < normalized.length; i++) {
      if (normalized[i].options.length !== 4) {
        prevPos = normalized[i].correctIndex;
        continue;
      }
      let idx = fallbackPool.findIndex((s) => s !== prevPos);
      if (idx === -1) idx = 0;
      const [chosen] = fallbackPool.splice(idx, 1);
      assignedTargetByQuestionIndex.set(i, chosen);
      prevPos = chosen;
    }
  }

  return normalized.map((q, qIdx) => {
    if (q.options.length !== 4) {
      return q;
    }

    const targetIdx = assignedTargetByQuestionIndex.get(qIdx) ?? q.correctIndex;
    const correctText = q.options[q.correctIndex];
    const distractors = fisherYatesShuffle(
      q.options.filter((_, idx) => idx !== q.correctIndex)
    );

    const newOptions = new Array<string>(4);
    newOptions[targetIdx] = correctText;
    let dPtr = 0;
    for (let slot = 0; slot < 4; slot++) {
      if (slot !== targetIdx) {
        newOptions[slot] = distractors[dPtr++] || `خيار ${slot + 1}`;
      }
    }

    return {
      ...q,
      options: newOptions,
      correctIndex: targetIdx,
    };
  });
}
