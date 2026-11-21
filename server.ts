import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { shuffleAndBalanceQuestions, type LessonQuestionKind } from './src/utils/questionShuffle.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ID = 'gemini-4-hydrogen';
const FALLBACK_MODEL_ID = 'gemini-3.1-flash-lite';

function extractBase64Image(rawInput: string, fallbackMime = 'image/jpeg'): { data: string; mimeType: string } {
  const trimmed = (rawInput || '').trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return {
      mimeType: match[1] || fallbackMime,
      data: match[2],
    };
  }
  return {
    mimeType: fallbackMime,
    data: trimmed,
  };
}

function createGeminiClient(timeoutMs = 15000): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح Gemini غير مهيأ على الخادم في Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('overloaded') ||
    lower.includes('internal') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('timeout') ||
    lower.includes('aborted') ||
    lower.includes('fetch failed')
  );
}

function formatGeminiErrorMessage(err: unknown, fallbackArabic: string): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  let extractedMsg = raw;
  let extractedStatus = '';
  let extractedCode: number | string = '';

  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const inner = parsed?.error || parsed;
      extractedMsg = String(inner?.message || raw);
      extractedStatus = String(inner?.status || '');
      extractedCode = inner?.code ?? '';
    } catch {
      // keep raw
    }
  }

  const lower = `${raw} ${extractedMsg} ${extractedStatus} ${extractedCode}`.toLowerCase();
  if (lower.includes('gemini_api_key') || lower.includes('مفتاح gemini')) {
    return 'مفتاح GEMINI_API_KEY غير مضاف أو غير نشط في Settings > Secrets.';
  }
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('403') || lower.includes('401')) {
    return 'تعذر التحقق من مفتاح Gemini API؛ يرجى مراجعة المفتاح في Settings > Secrets.';
  }
  if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('etimedout') || lower.includes('504') || lower.includes('deadline_exceeded')) {
    return 'استغرق الاتصال بخادم Gemini وقتاً أطول من المعتاد، يرجى المحاولة مرة أخرى.';
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return 'خادم الذكاء الاصطناعي مزدحم مؤقتاً الآن، يرجى المحاولة مرة أخرى بعد لحظات.';
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return 'تم تجاوز حد الطلبات المؤقت لمفتاح Gemini API، يرجى الانتظار قليلاً ثم المحاولة.';
  }
  if (extractedMsg && !extractedMsg.startsWith('{')) {
    return `${fallbackArabic}: ${extractedMsg}`;
  }
  return fallbackArabic;
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  maxAttempts = 2
) {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const useFallback = attempt > 1 && params.model === MODEL_ID;
      const attemptParams = useFallback
        ? {
            ...params,
            model: FALLBACK_MODEL_ID,
            config: params.config
              ? {
                  ...params.config,
                  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                }
              : undefined,
          }
        : params;
      return await ai.models.generateContent(attemptParams);
    } catch (err) {
      lastErr = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Gemini attempt ${attempt}/${maxAttempts} failed]:`, errMsg);
      if (!isTransientGeminiError(err) || attempt >= maxAttempts) {
        throw err;
      }
      const isQuotaBurst = errMsg.toLowerCase().includes('429') || errMsg.toLowerCase().includes('resource_exhausted');
      const delayMs = isQuotaBurst
        ? 1500
        : Math.round(500 * Math.pow(2, attempt - 1) + Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

const VALID_DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء'] as const;

function normalizeArabicDay(rawDay: string): string {
  const d = (rawDay || '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, '').trim();
  if (d.includes('سبت')) return 'السبت';
  if (d.includes('احد')) return 'الأحد';
  if (d.includes('اثنين') || d.includes('ثنين')) return 'الاثنين';
  if (d.includes('ثلاثاء') || d.includes('ثلوث')) return 'الثلاثاء';
  if (d.includes('اربعاء') || d.includes('ربوع')) return 'الأربعاء';
  return 'السبت';
}

function normalizePeriodNumber(rawPeriod: unknown): number {
  if (typeof rawPeriod === 'number' && !Number.isNaN(rawPeriod)) {
    return Math.min(6, Math.max(1, Math.round(rawPeriod)));
  }
  const str = String(rawPeriod || '').trim();
  const digitMatch = str.match(/[1-6]/);
  if (digitMatch) return Number(digitMatch[0]);
  if (str.includes('اول') || str.includes('أول')) return 1;
  if (str.includes('ثان')) return 2;
  if (str.includes('ثالث')) return 3;
  if (str.includes('رابع')) return 4;
  if (str.includes('خامس')) return 5;
  if (str.includes('سادس')) return 6;
  return 1;
}

function normalizeAttendanceStatus(
  rawStatus: string
): 'حاضر' | 'غائب بعذر' | 'غائب بدون عذر' | 'متأخر' {
  const s = (rawStatus || '').replace(/[أإآ]/g, 'ا').trim().toLowerCase();
  if (
    s.includes('بعذر') ||
    s.includes('عذر') ||
    s.includes('مبرر') ||
    s.includes('مرض') ||
    s.includes('اجازه') ||
    s.includes('excused')
  ) {
    return 'غائب بعذر';
  }
  if (
    s.includes('بدون عذر') ||
    s.includes('غائب') ||
    s.includes('غياب') ||
    s === 'غ' ||
    s === 'x' ||
    s === 'absent' ||
    s === 'unexcused'
  ) {
    return 'غائب بدون عذر';
  }
  if (s.includes('متاخر') || s.includes('تاخر') || s.includes('تاخير') || s === 'م' || s === 'late') {
    return 'متأخر';
  }
  return 'حاضر';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
    });
  });

  app.post('/api/gemini/parse-attendance', async (req, res) => {
    try {
      const { imageBase64, mimeType, gradeLabel, classNumber } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'يرجى إرفاق صورة كشف الحضور أولاً.' });
        return;
      }

      const ai = createGeminiClient();
      const img = extractBase64Image(imageBase64, mimeType || 'image/jpeg');

      const response = await generateContentWithRetry(ai, {
        model: MODEL_ID,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.data,
                },
              },
              {
                text: `أنت نظام ذكي متخصص في قراءة كشوفات الحضور والغياب المدرسية الورقية في المدارس اليمنية (خط يد أو مطبوع).
اقرأ صورة كشف الحضور المرفقة بعناية (${gradeLabel || ''} ${classNumber ? `شعبة ${classNumber}` : ''}).
استخرج جميع أسماء الطلاب الظاهرة في الكشف بدقة باللغة العربية، وحدد حالة كل طالب وملاحظة العذر إن وجدت:
- علامة صح (✓ / ✔) أو حرف (ح) أو كلمة (حاضر) -> "حاضر"
- غياب مع كتابة (بعذر / عذر / مبرر / مرضي / إجازة / حرف ع) -> "غائب بعذر"
- علامة خطأ (✗ / ×) أو حرف (غ) أو كلمة (غائب / بدون عذر) بدون أي عذر -> "غائب بدون عذر"
- حرف (م) أو كلمة (متأخر / تأخير) -> "متأخر"
- إذا كانت الخانة غير واضحة تماماً فاعتبره "حاضر" ما لم توجد علامة غياب/تأخير واضحة.
لا تخترع أسماء غير موجودة في الصورة، وأعد النتيجة بصيغة JSON منظمة فقط.`,
              },
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              students: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    studentName: { type: Type.STRING, description: 'اسم الطالب الكامل كما في الكشف' },
                    status: {
                      type: Type.STRING,
                      enum: ['حاضر', 'غائب بعذر', 'غائب بدون عذر', 'متأخر'],
                      description: 'حالة حضور الطالب',
                    },
                    note: {
                      type: Type.STRING,
                      description: 'سبب العذر أو ملاحظة قصيرة إن وجدت في الكشف',
                    },
                  },
                  required: ['studentName', 'status'],
                },
              },
              sheetNotes: { type: Type.STRING, description: 'ملاحظات اختيارية من الكشف إن وجدت' },
            },
            required: ['students'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const rawStudents = Array.isArray(parsed.students) ? parsed.students : [];
      const students = rawStudents
        .map((item: { studentName?: string; status?: string; note?: string }) => ({
          studentName: String(item.studentName || '').trim(),
          status: normalizeAttendanceStatus(String(item.status || 'حاضر')),
          note: typeof item.note === 'string' && item.note.trim() ? item.note.trim() : undefined,
        }))
        .filter((item: { studentName: string }) => item.studentName.length > 0);

      res.json({
        students,
        entries: students,
        sheetNotes: typeof parsed.sheetNotes === 'string' ? parsed.sheetNotes : '',
      });
    } catch (error) {
      const msg = formatGeminiErrorMessage(error, 'تعذر تحليل صورة كشف الحضور');
      console.error('[Gemini Attendance Parse Error]:', error);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/gemini/parse-schedule', async (req, res) => {
    try {
      const { imageBase64, mimeType, gradeLabel, classNumber } = req.body || {};
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'يرجى إرفاق صورة جدول الحصص أولاً.' });
        return;
      }

      const ai = createGeminiClient();
      const img = extractBase64Image(imageBase64, mimeType || 'image/jpeg');

      const response = await generateContentWithRetry(ai, {
        model: MODEL_ID,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: img.mimeType,
                  data: img.data,
                },
              },
              {
                text: `أنت نظام ذكي متخصص في قراءة جداول الحصص المدرسية الأسبوعية الورقية أو المصورة (${gradeLabel || ''} ${classNumber ? `فصل ${classNumber}` : ''}).
استخرج جدول الحصص كاملاً للأيام الدراسية من السبت إلى الأربعاء، وللحصص من 1 (الأولى) إلى 6 (السادسة).
لكل حصة استخرج:
- day: اليوم (يجب أن يكون واحداً فقط من: "السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء")
- period: رقم الحصة من 1 إلى 6 (1=الأولى, 2=الثانية, 3=الثالثة, 4=الرابعة, 5=الخامسة, 6=السادسة)
- subject: اسم المادة الدراسية بالعربية (مثل: القرآن الكريم، التربية الإسلامية، اللغة العربية، الرياضيات، العلوم، اللغة الإنجليزية، الاجتماعيات...)
- teacherName: اسم المعلم إن وجد في الخلية أو بجانب المادة، وإذا لم يكن مكتوباً اتركه نصاً فارغاً "".
تجاهل صفوف الاستراحة/الفسحة أو طابور الصباح إذا لم تكن ضمن الحصص 1-6.
أعد البيانات بصيغة JSON منظمة فقط.`,
              },
            ],
          },
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              entries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: {
                      type: Type.STRING,
                      enum: [...VALID_DAYS],
                    },
                    period: { type: Type.INTEGER },
                    subject: { type: Type.STRING },
                    teacherName: { type: Type.STRING },
                  },
                  required: ['day', 'period', 'subject', 'teacherName'],
                },
              },
            },
            required: ['entries'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const entries = rawEntries
        .map((item: { day?: string; period?: unknown; subject?: string; teacherName?: string }) => ({
          day: normalizeArabicDay(String(item.day || 'السبت')),
          period: normalizePeriodNumber(item.period),
          subject: String(item.subject || '').trim(),
          teacherName: String(item.teacherName || '').trim(),
        }))
        .filter((item: { subject: string }) => item.subject.length > 0);

      res.json({ entries });
    } catch (error) {
      const msg = formatGeminiErrorMessage(error, 'تعذر تحليل صورة جدول الحصص');
      console.error('[Gemini Schedule Parse Error]:', error);
      res.status(500).json({ error: msg });
    }
  });

  // Voice-first report drafting: transcribes Arabic/dialect audio then drafts a concise, formal Arabic report
  app.post('/api/gemini/draft-report-from-voice', async (req, res) => {
    try {
      const {
        audioBase64,
        mimeType,
        category,
        subType,
        targetGrade,
        targetClass,
        activityDate,
      } = req.body || {};

      if (!audioBase64 || typeof audioBase64 !== 'string') {
        res.status(400).json({ error: 'يرجى تسجيل الصوت أولاً قبل طلب الصياغة.' });
        return;
      }

      const cleanMime = String(mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
      if (cleanMime.startsWith('video/')) {
        res.status(400).json({ error: 'ممنوع رفع الفيديو، يُسمح بالصوت فقط.' });
        return;
      }

      const rawAudioData = audioBase64.includes(',')
        ? audioBase64.split(',')[1] || ''
        : audioBase64.trim();
      if (!rawAudioData) {
        res.status(400).json({ error: 'ملف التسجيل الصوتي فارغ.' });
        return;
      }

      const ai = createGeminiClient();
      const audioPart = {
        inlineData: {
          mimeType: cleanMime,
          data: rawAudioData,
        },
      };

      // Step 1: Transcribe audio cleanly using gemini-3.5-transcribe (fallback to gemini-4-hydrogen if container format fails)
      let transcript = '';
      try {
        const transcribeRes = await generateContentWithRetry(ai, {
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              audioPart,
              {
                text: 'استمع للتسجيل الصوتي بدقة واكتب النص المنطوق بالعربية كما هو (بما في ذلك اللهجة العامية اليمنية أو العربية)، دون إضافة تعليقات من عندك.',
              },
            ],
          },
        }, 2);
        transcript = (transcribeRes.text || '').trim();
      } catch (transcribeErr) {
        console.warn('[Gemini Transcribe fallback to 4-hydrogen]:', transcribeErr);
      }

      const contextDesc = `التصنيف: ${category || 'تقرير'} (${subType || 'عام'})، الصف: ${targetGrade || 'الكل'}، الفصل: ${targetClass || 'الكل'}، التاريخ: ${activityDate || ''}`;

      if (transcript) {
        const formalRes = await generateContentWithRetry(ai, {
          model: MODEL_ID,
          contents: `أنت سكرتير إداري وتربوي محترف في مدرسة يمنية.
سياق المنشور: ${contextDesc}
النص الأصلي الذي نطقه المشرف (قد يكون باللهجة العامية):
"""
${transcript}
"""

المطلوب:
1) صغ عنواناً رسمياً موجزاً ومناسباً في حقل suggestedTitle.
2) صغ من النص الأصلي تقريراً/وصفاً رسمياً مرتباً ومختصراً باللغة العربية الفصحى السليمة في حقل formalReport (بدون حشو أو مبالغة أو اختلاق وقائع غير موجودة في كلام المشرف، وبنقاط منظمة أو فقرة مهنية قصيرة واضحة).
أعد النتيجة بصيغة JSON فقط.`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suggestedTitle: { type: Type.STRING },
                formalReport: { type: Type.STRING },
              },
              required: ['suggestedTitle', 'formalReport'],
            },
          },
        });

        const parsed = JSON.parse(formalRes.text || '{}');
        res.json({
          transcript,
          suggestedTitle: String(parsed.suggestedTitle || '').trim(),
          formalReport: String(parsed.formalReport || '').trim(),
        });
        return;
      }

      // Single-step multimodal fallback if transcription model didn't extract text
      const fallbackRes = await generateContentWithRetry(ai, {
        model: MODEL_ID,
        contents: {
          parts: [
            audioPart,
            {
              text: `استمع إلى التسجيل الصوتي للمشرف المدرسي (قد يتحدث بالعامية).
سياق المنشور: ${contextDesc}
المطلوب في JSON:
1) transcript: تفريغ دقيق لما قاله المشرف كما نطقه.
2) suggestedTitle: عنوان رسمي موجز ومناسب.
3) formalReport: صياغة التقرير باللغة العربية الفصحى الرسمية المرتبة والمختصرة دون اختلاق معلومات غير مذكورة.`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcript: { type: Type.STRING },
              suggestedTitle: { type: Type.STRING },
              formalReport: { type: Type.STRING },
            },
            required: ['transcript', 'suggestedTitle', 'formalReport'],
          },
        },
      });

      const parsedFallback = JSON.parse(fallbackRes.text || '{}');
      res.json({
        transcript: String(parsedFallback.transcript || '').trim(),
        suggestedTitle: String(parsedFallback.suggestedTitle || '').trim(),
        formalReport: String(parsedFallback.formalReport || '').trim(),
      });
    } catch (error) {
      const msg = formatGeminiErrorMessage(error, 'تعذر تحويل التسجيل الصوتي إلى تقرير رسمي');
      console.error('[Gemini Voice Report Error]:', error);
      res.status(500).json({ error: msg });
    }
  });

  // Image + One-line caption report drafting
  app.post('/api/gemini/draft-report-from-image', async (req, res) => {
    try {
      const {
        images,
        oneLineNote,
        category,
        subType,
        targetGrade,
        targetClass,
        activityDate,
      } = req.body || {};

      const imageList: Array<{ base64?: string; mimeType?: string }> = Array.isArray(images)
        ? images.slice(0, 3)
        : [];
      const cleanOneLine = String(oneLineNote || '').trim();

      if (imageList.length === 0 || !imageList[0]?.base64) {
        res.status(400).json({ error: 'يرجى إرفاق صورة واحدة على الأقل.' });
        return;
      }
      if (!cleanOneLine) {
        res.status(400).json({ error: 'يرجى كتابة سطر واحد توضيحي مع الصورة.' });
        return;
      }

      const ai = createGeminiClient();
      const imageParts = imageList
        .filter((item) => item && typeof item.base64 === 'string' && item.base64.trim().length > 0)
        .map((item) => {
          const img = extractBase64Image(item.base64 || '', item.mimeType || 'image/jpeg');
          return {
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            },
          };
        });

      const response = await generateContentWithRetry(ai, {
        model: MODEL_ID,
        contents: {
          parts: [
            ...imageParts,
            {
              text: `أنت مشرف ومنسق إعلامي وتربوي في مدرسة يمنية.
تأمل الصور المرفقة واقرأ ملاحظة المشرف المختصرة (سطر واحد):
"${cleanOneLine}"

معلومات المنشور:
- التصنيف: ${category || 'نشاط'} (${subType || 'عام'})
- الصف: ${targetGrade || 'الكل'}
- الفصل: ${targetClass || 'الكل'}
- التاريخ: ${activityDate || ''}

المطلوب إرجاع JSON يحتوي على:
1) suggestedTitle: عنوان رسمي جذاب وموجز يعبر عن الصورة والسطر التوضيحي.
2) formalReport: وصف وتقرير متكامل ومرتب ومختصر باللغة العربية الفصحى الرسمية يدمج ما يظهر في الصورة مع ملاحظة المشرف بدقة واحترافية (بدون اختلاق تفاصيل مناقضة للصورة).`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedTitle: { type: Type.STRING },
              formalReport: { type: Type.STRING },
            },
            required: ['suggestedTitle', 'formalReport'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        suggestedTitle: String(parsed.suggestedTitle || '').trim(),
        formalReport: String(parsed.formalReport || '').trim(),
      });
    } catch (error) {
      const msg = formatGeminiErrorMessage(error, 'تعذر صياغة التقرير من الصورة');
      console.error('[Gemini Image Report Error]:', error);
      res.status(500).json({ error: msg });
    }
  });

  // Teacher Lesson Question Preparation (Strictly gemini-3.1-flash-lite, max 5 compressed page images, customizable 5-question distribution + anti-cheat shuffling)
  app.post('/api/lesson/prepare-questions', async (req, res) => {
    try {
      const { images, grade, subject, distribution, previousQuestions } = req.body || {};

      if (!Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: 'يرجى إرفاق صفحة واحدة على الأقل من الدرس.' });
        return;
      }
      if (images.length > 5) {
        res.status(400).json({ error: 'الحد الأقصى للدرس الواحد هو 5 صور أو صفحات فقط.' });
        return;
      }

      const validImages = images
        .slice(0, 5)
        .filter((item: unknown) => item && typeof (item as { base64?: unknown }).base64 === 'string');

      if (validImages.length === 0) {
        res.status(400).json({ error: 'لم يتم استلام صور صالحة من الدرس، يرجى المحاولة مرة أخرى.' });
        return;
      }

      for (const item of validImages as Array<{ base64: string; mimeType?: string }>) {
        const mime = String(item.mimeType || 'image/jpeg').toLowerCase();
        if (mime.startsWith('video/')) {
          res.status(400).json({ error: 'ممنوع رفع الفيديو، يُسمح بالصور والملفات فقط.' });
          return;
        }
      }

      // Normalize requested distribution (defaults implicitly to 3 questions: 2 MCQ + 1 True/False)
      const rawMcq = Number(distribution?.mcq);
      const rawTf = Number(distribution?.trueFalse);
      const rawFill = Number(distribution?.fillBlank);
      const requestedSum = rawMcq + rawTf + rawFill;
      const isValidCustom =
        Number.isInteger(rawMcq) &&
        Number.isInteger(rawTf) &&
        Number.isInteger(rawFill) &&
        rawMcq >= 0 &&
        rawTf >= 0 &&
        rawFill >= 0 &&
        (requestedSum === 3 || requestedSum === 5);

      const mcqCount = isValidCustom ? rawMcq : 2;
      const tfCount = isValidCustom ? rawTf : 1;
      const fillCount = isValidCustom ? rawFill : 0;
      const totalQuestions = mcqCount + tfCount + fillCount;

      const expectedKinds: LessonQuestionKind[] = [
        ...Array<LessonQuestionKind>(mcqCount).fill('mcq'),
        ...Array<LessonQuestionKind>(tfCount).fill('true_false'),
        ...Array<LessonQuestionKind>(fillCount).fill('fill_blank'),
      ];

      const avoidList = Array.isArray(previousQuestions)
        ? previousQuestions
            .map((q: unknown) => String(q || '').trim())
            .filter(Boolean)
            .slice(0, 10)
        : [];

      const avoidBlock =
        avoidList.length > 0
          ? `\n6. تنبيه مهم للإعادة: تم رفض الأسئلة السابقة التالية، يُمنع تكرارها أو إعادة صياغتها، ويجب إنشاء ${totalQuestions} أسئلة جديدة ومختلفة تماماً عن أفكارها:\n${avoidList
              .map((txt, i) => `   - (${i + 1}) ${txt}`)
              .join('\n')}`
          : '';

      const ai = createGeminiClient(30000);
      const pageParts = (validImages as Array<{ base64: string; mimeType?: string }>).flatMap((item, idx) => {
        const img = extractBase64Image(item.base64, item.mimeType || 'image/jpeg');
        return [
          { text: `صفحة الدرس رقم ${idx + 1} من ${validImages.length}:` },
          {
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            },
          },
        ];
      });

      const response = await generateContentWithRetry(
        ai,
        {
          model: FALLBACK_MODEL_ID, // Strictly gemini-3.1-flash-lite (free-tier compatible)
          contents: [
            {
              role: 'user',
              parts: [
                ...pageParts,
                {
                  text: `أنت معلم خبير ومعدّ اختبارات تربوية متقنة للمرحلة الأساسية (الصف: ${grade || 'الأساسي'}، المادة: ${subject || 'عامة'}).
اقرأ جميع صفحات الدرس المرفوعة أعلاه بالتسلسل من الصفحة 1 إلى الصفحة ${validImages.length} وافهمها معاً كدرس واحد متكامل متصل دون إغفال أي فكرة أو معلومة.

شروط صارمة:
1. اعتمد في صياغة الأسئلة على محتوى الصفحات المرفوعة فقط، ولا تضف أي معلومات من خارج الدرس.
2. قبل كتابة الأسئلة، حدّد الفكرة الرئيسية للدرس كاملاً ثم استخرج ${totalQuestions} أفكار فرعية رئيسية تغطي كامل الدرس عبر كل الصفحات المرفوعة (بداية الدرس، وسط الدرس، ونهايته).
3. أنشئ بالضبط ${totalQuestions} أسئلة بالتوزيع التالي حصراً:
   ${mcqCount > 0 ? `- عدد (${mcqCount}) سؤال من نوع "mcq" (اختيار من متعدد): سؤال واضح + 4 خيارات مميزة + correctIndex من 0 إلى 3.` : ''}
   ${tfCount > 0 ? `- عدد (${tfCount}) سؤال من نوع "true_false" (صح أو خطأ): عبارة خبرية دقيقة + خياران فقط ["صح", "خطأ"] + correctIndex (0 إذا كانت العبارة صحيحة، 1 إذا كانت العبارة خاطئة). نوّع بين الصح والخطأ ولا تجعل كل العبارات صحيحة.` : ''}
   ${fillCount > 0 ? `- عدد (${fillCount}) سؤال من نوع "fill_blank" (أكمل العبارة): جملة ناقصة تحتوي على فراغ "......" في موضع كلمة أو مفهوم محوري + 4 خيارات للكلمة الناقصة + correctIndex من 0 إلى 3.` : ''}
4. رتّب الأسئلة وفق هذه الأنواع بالضبط: [${expectedKinds.join(', ')}].
5. يُمنع منعاً باتاً كتابة أسئلة سطحية أو نسخ جمل الكتاب حرفياً. صُغ كل سؤال بلغة عربية فصحى سليمة ومناسبة لمستوى الطالب، واجعل مواقع الإجابات الصحيحة متنوعة.${avoidBlock}
أعد النتيجة بصيغة JSON مطابقة للبنية المطلوبة فقط.`,
                },
              ],
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                lessonMainIdea: { type: Type.STRING },
                subIdeas: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      questionKind: {
                        type: Type.STRING,
                        enum: ['mcq', 'true_false', 'fill_blank'],
                      },
                      questionText: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      correctIndex: { type: Type.INTEGER },
                    },
                    required: ['questionKind', 'questionText', 'options', 'correctIndex'],
                  },
                },
              },
              required: ['lessonMainIdea', 'subIdeas', 'questions'],
            },
          },
        },
        2
      );

      const parsed = JSON.parse(response.text || '{}');
      const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
      const sanitizedQuestions = rawQuestions
        .slice(0, totalQuestions)
        .map(
          (
            q: {
              questionKind?: unknown;
              questionText?: unknown;
              options?: unknown;
              correctIndex?: unknown;
            },
            idx: number
          ) => {
            const expectedKind = expectedKinds[idx] || 'mcq';
            const rawKind = String(q?.questionKind || '').trim();
            const questionKind: LessonQuestionKind =
              rawKind === 'true_false' || rawKind === 'fill_blank' || rawKind === 'mcq'
                ? (rawKind as LessonQuestionKind)
                : expectedKind;

            let questionText = String(q?.questionText || '').trim();
            const rawOpts = Array.isArray(q?.options)
              ? q.options.map((o: unknown) => String(o || '').trim()).filter(Boolean)
              : [];

            if (questionKind === 'true_false') {
              const numIdx = Number(q?.correctIndex);
              const rawChosen = String(rawOpts[numIdx] ?? rawOpts[0] ?? '').trim();
              const isFalse =
                rawChosen.includes('خطأ') ||
                rawChosen.includes('خطا') ||
                rawChosen.toLowerCase() === 'false' ||
                (rawOpts.length === 2 &&
                  rawOpts[0].includes('صح') &&
                  numIdx === 1);
              return {
                questionKind: 'true_false' as LessonQuestionKind,
                questionText,
                options: ['صح', 'خطأ'],
                correctIndex: isFalse ? 1 : 0,
              };
            }

            if (questionKind === 'fill_blank' && questionText && !questionText.includes('..') && !questionText.includes('__')) {
              questionText = `${questionText} (......)`;
            }

            const options = [
              rawOpts[0] || 'الخيار الأول',
              rawOpts[1] || 'الخيار الثاني',
              rawOpts[2] || 'الخيار الثالث',
              rawOpts[3] || 'الخيار الرابع',
            ];
            const numIdx = Number(q?.correctIndex);
            const correctIndex = Number.isInteger(numIdx) && numIdx >= 0 && numIdx <= 3 ? numIdx : 0;
            return {
              questionKind,
              questionText,
              options,
              correctIndex,
            };
          }
        )
        .filter((q: { questionText: string }) => q.questionText.length > 0);

      if (sanitizedQuestions.length === 0) {
        res.status(502).json({
          error: 'تعذر تجهيز الأسئلة بوضوح، يرجى المحاولة بصور أوضح لصفحات الدرس.',
        });
        return;
      }

      const shuffledQuestions = shuffleAndBalanceQuestions(sanitizedQuestions.slice(0, totalQuestions));

      res.json({
        questions: shuffledQuestions,
      });
    } catch (error) {
      console.error('[Lesson Prepare Questions Error]:', error);
      const raw = error instanceof Error ? error.message : String(error || '');
      const lower = raw.toLowerCase();
      let safeMessage = 'تعذر تجهيز الأسئلة حالياً، يرجى المحاولة مرة أخرى.';
      if (lower.includes('timeout') || lower.includes('aborted') || lower.includes('504') || lower.includes('deadline')) {
        safeMessage = 'استغرق تجهيز الأسئلة وقتاً أطول من المعتاد، يرجى المحاولة مرة أخرى.';
      } else if (lower.includes('503') || lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('429') || lower.includes('resource_exhausted')) {
        safeMessage = 'الخدمة مزدحمة مؤقتاً الآن، يرجى المحاولة مرة أخرى بعد قليل.';
      }
      res.status(500).json({ error: safeMessage });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(
        express.static(distPath, {
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
          },
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`YemenEduApp server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
