import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ID = 'gemini-4-hydrogen';

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

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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

function normalizeAttendanceStatus(rawStatus: string): 'حاضر' | 'غائب' | 'متأخر' {
  const s = (rawStatus || '').replace(/[أإآ]/g, 'ا').trim().toLowerCase();
  if (s.includes('غائب') || s.includes('غياب') || s === 'غ' || s === 'x' || s === 'absent') {
    return 'غائب';
  }
  if (s.includes('متاخر') || s.includes('تاخر') || s.includes('تاخير') || s === 'م' || s === 'late') {
    return 'متأخر';
  }
  return 'حاضر';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
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

      const response = await ai.models.generateContent({
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
استخرج جميع أسماء الطلاب الظاهرة في الكشف بدقة باللغة العربية، وحدد حالة كل طالب بناءً على العلامة بجانب اسمه:
- علامة صح (✓ / ✔) أو حرف (ح) أو كلمة (حاضر) أو خانة حضور -> "حاضر"
- علامة خطأ (✗ / ×) أو حرف (غ) أو كلمة (غائب) أو دائرة غياب -> "غائب"
- حرف (م) أو كلمة (متأخر / تأخير) -> "متأخر"
- إذا كانت الخانة غير واضحة تماماً فاعتبره "حاضر" ما لم توجد علامة غياب/تأخير واضحة.
لا تخترع أسماء غير موجودة في الصورة، وأعد النتيجة بصيغة JSON منظمة فقط.`,
              },
            ],
          },
        ],
        config: {
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
                      enum: ['حاضر', 'غائب', 'متأخر'],
                      description: 'حالة حضور الطالب',
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
        .map((item: { studentName?: string; status?: string }) => ({
          studentName: String(item.studentName || '').trim(),
          status: normalizeAttendanceStatus(String(item.status || 'حاضر')),
        }))
        .filter((item: { studentName: string }) => item.studentName.length > 0);

      res.json({
        students,
        sheetNotes: typeof parsed.sheetNotes === 'string' ? parsed.sheetNotes : '',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'تعذر تحليل صورة كشف الحضور';
      console.error('[Gemini Attendance Parse Error]:', msg);
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

      const response = await ai.models.generateContent({
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
      const msg = error instanceof Error ? error.message : 'تعذر تحليل صورة جدول الحصص';
      console.error('[Gemini Schedule Parse Error]:', msg);
      res.status(500).json({ error: msg });
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
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
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
