import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CalendarDays, Camera, CheckCircle2, ClipboardCheck, Image as ImageIcon, Mic, Plus, Save, Send, Users } from 'lucide-react';
import { UserSession } from '../services/authService';
import { ActivityInputType, ActivityType, AttendanceRecord, AttendanceRow, AttendanceStatus, ClassSchedule, extractJsonArray, fileToCompressedDataUrl, hasAttendanceForToday, analyzeImageWithGemini, polishTextWithGemini, reviewAttendance, saveActivity, saveAttendance, saveSchedule, ScheduleCell, subscribeActivities, subscribeAttendance, subscribeSchedules, SupervisorActivity } from '../services/supervisorService';

interface Props { session: UserSession }
const GRADES = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const days = ['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء'];

export const SupervisorDashboard: React.FC<Props> = ({ session }) => {
  const [nav, setNav] = useState<'activities' | 'attendance' | 'schedule'>('activities');
  const [activityType, setActivityType] = useState<ActivityType>('تقرير');
  const [subtype, setSubtype] = useState('زيارة فصلية');
  const [grade, setGrade] = useState(session.grade || '1');
  const [className, setClassName] = useState(session.class || '1-أ');
  const [title, setTitle] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [professionalText, setProfessionalText] = useState('');
  const [inputType, setInputType] = useState<ActivityInputType>('نص');
  const [activityImages, setActivityImages] = useState<string[]>([]);
  const [isPolishing, setIsPolishing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [activities, setActivities] = useState<SupervisorActivity[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [toast, setToast] = useState('');

  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceImage, setAttendanceImage] = useState<string | null>(null);
  const [isReadingAttendance, setIsReadingAttendance] = useState(false);
  const attendanceCameraRef = useRef<HTMLInputElement>(null);
  const attendanceGalleryRef = useRef<HTMLInputElement>(null);
  const activityImageRef = useRef<HTMLInputElement>(null);

  const [scheduleImage, setScheduleImage] = useState<string | null>(null);
  const [isReadingSchedule, setIsReadingSchedule] = useState(false);
  const [scheduleCells, setScheduleCells] = useState<ScheduleCell[]>([]);
  const scheduleCameraRef = useRef<HTMLInputElement>(null);
  const scheduleGalleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeActivities(session.schoolId, setActivities), [session.schoolId]);
  useEffect(() => subscribeSchedules(session.schoolId, setSchedules), [session.schoolId]);
  useEffect(() => subscribeAttendance(session.schoolId, setAttendance), [session.schoolId]);
  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3500); };

  const addActivityImages = async (files: FileList | null) => {
    if (!files) return;
    if (Array.from(files).some((file) => !file.type.startsWith('image/'))) return flash('يسمح برفع الصور فقط ولا يقبل الفيديو');
    try {
      const compressed = await Promise.all(Array.from(files).slice(0, 3 - activityImages.length).map((f) => fileToCompressedDataUrl(f)));
      setActivityImages((prev) => [...prev, ...compressed].slice(0, 3));
      setInputType('صورة');
    } catch (e: any) { flash(e?.message || 'تعذر معالجة الصور'); }
  };

  const polishActivity = async () => {
    if (!originalText.trim()) return flash('اكتب ملخصاً قصيراً أو سجل ملاحظة صوتية أولاً');
    setIsPolishing(true);
    try {
      const polished = await polishTextWithGemini(originalText.trim(), activityType, subtype, activityImages);
      setProfessionalText(polished);
    } catch (e: any) { flash(e?.message || 'تعذرت صياغة التقرير'); }
    finally { setIsPolishing(false); }
  };

  const startRecording = async () => {
    try {
      if (!('MediaRecorder' in window)) return flash('التسجيل الصوتي غير مدعوم في هذا المتصفح');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        try {
          const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('تعذر قراءة الصوت')); reader.readAsDataURL(audioBlob);
          });
          const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
          if (!apiKey) throw new Error('أضف VITE_GEMINI_API_KEY لتفعيل التفريغ الصوتي');
          const { GoogleGenAI } = await import('@google/genai');
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{ role: 'user', parts: [{ inlineData: { mimeType: audioBlob.type, data: base64 } }, { text: 'حوّل التسجيل العربي العامي إلى نص عربي مطابق للكلام دون صياغة رسمية أو إضافة معلومات.' }] }] });
          setOriginalText(String(response.text || '').trim()); setInputType('نص');
        } catch (e: any) { flash(e?.message || 'تعذر تفريغ التسجيل الصوتي'); }
      };
      recorderRef.current = recorder; recorder.start(); setIsRecording(true);
      window.setTimeout(() => { if (recorder.state === 'recording') { recorder.stop(); setIsRecording(false); flash('انتهى التسجيل (الحد الأقصى دقيقتان)'); } }, 120_000);
    } catch { flash('اسمح باستخدام الميكروفون لبدء التسجيل'); }
  };

  const saveSupervisorActivity = async () => {
    if (!title.trim() || !professionalText.trim()) return flash('أدخل العنوان وراجع النص الاحترافي قبل الإرسال');
    try {
      await saveActivity({ schoolId: session.schoolId, grade, className, type: activityType, subtype, title: title.trim(), originalText: originalText.trim(), professionalText: professionalText.trim(), inputType, imageUrls: activityImages, date: activityDate, supervisorCode: session.code, supervisorName: session.name, createdAt: Date.now(), status: 'pending' });
      setTitle(''); setOriginalText(''); setProfessionalText(''); setActivityImages([]); flash('تم إرسال الطلب للمدير للاعتماد');
    } catch (e: any) { flash(e?.message || 'تعذر إرسال الطلب'); }
  };

  const readAttendanceImage = async (file: File) => {
    try {
      const dataUrl = await fileToCompressedDataUrl(file); setAttendanceImage(dataUrl); setIsReadingAttendance(true);
      const text = await analyzeImageWithGemini(dataUrl, 'اقرأ كشف الحضور بالعربية. أرجع JSON array فقط، كل عنصر studentName و status، حيث status واحد من حاضر أو غائب بعذر أو غائب بدون عذر أو متأخر. علامات الحضور تعني حاضر والعلامات الواضحة للغياب تعني غائب بدون عذر إذا لم يوجد عذر مكتوب. لا تخمن الاسم غير المقروء، واكتب الاسم كما يظهر.');
      setAttendanceRows(extractJsonArray(text).map((x: any) => ({ studentName: String(x.studentName || '').trim(), studentCode: x.studentCode ? String(x.studentCode) : undefined, status: (['حاضر','غائب بعذر','غائب بدون عذر','متأخر'].includes(x.status) ? x.status : 'حاضر') as AttendanceStatus })).filter((x) => x.studentName));
    } catch (e: any) { flash(e?.message || 'تعذر تحليل صورة الحضور'); } finally { setIsReadingAttendance(false); }
  };
  const saveAttendanceRows = async () => {
    if (!attendanceRows.length) return flash('لا توجد قائمة حضور للحفظ');
    if (await hasAttendanceForToday(session.schoolId, grade, className, attendanceDate)) return flash('تم تسجيل هذا الفصل لهذا اليوم مسبقاً');
    try { await saveAttendance({ schoolId: session.schoolId, date: attendanceDate, grade, className, rows: attendanceRows, supervisorCode: session.code, supervisorName: session.name, createdAt: Date.now() }); flash('تم إرسال كشف الحضور إلى المدير للاعتماد'); }
    catch (e: any) { flash(e?.message || 'تعذر حفظ الحضور'); }
  };

  const readScheduleImage = async (file: File) => {
    try {
      const dataUrl = await fileToCompressedDataUrl(file); setScheduleImage(dataUrl); setIsReadingSchedule(true);
      const text = await analyzeImageWithGemini(dataUrl, 'حلل جدول حصص الصف. أرجع JSON array فقط: day من السبت، الأحد، الاثنين، الثلاثاء، الأربعاء؛ period من 1 إلى 6؛ subject؛ teacherName؛ room. لا تضف أي نص خارج JSON.');
      setScheduleCells(extractJsonArray(text).map((x: any) => ({ day: days.includes(x.day) ? x.day : 'السبت', period: Math.max(1, Math.min(6, Number(x.period) || 1)), subject: String(x.subject || '').trim(), teacherName: String(x.teacherName || '').trim(), room: String(x.room || '').trim() })).filter((x) => x.subject));
    } catch (e: any) { flash(e?.message || 'تعذر تحليل الجدول'); } finally { setIsReadingSchedule(false); }
  };
  const submitSchedule = async () => {
    if (!scheduleCells.length) return flash('أضف أو حلل الجدول أولاً');
    try { await saveSchedule({ schoolId: session.schoolId, grade, className, term: 'الترم الأول', cells: scheduleCells, uploadedByCode: session.code, uploadedByName: session.name, uploadedAt: Date.now(), status: 'pending' }); setScheduleImage(null); flash('تم إرسال الجدول للمدير للاعتماد'); }
    catch (e: any) { flash(e?.message || 'تعذر رفع الجدول'); }
  };
  const addManualScheduleRow = () => setScheduleCells((prev) => [...prev, { day: 'السبت', period: prev.length % 6 + 1, subject: '', teacherName: '', room: '' }]);
  const activityFiltered = useMemo(() => activities.filter((a) => a.grade === grade), [activities, grade]);
  const scheduleForClass = useMemo(() => schedules.find((s) => s.grade === grade && s.className === className), [schedules, grade, className]);
  const statusLabel: Record<string, string> = { pending: 'بانتظار الاعتماد', approved: 'معتمد', revision_requested: 'مطلوب التعديل', rejected: 'مرفوض' };
  const statusStyle: Record<string, string> = { pending: 'bg-amber-100 text-amber-900', approved: 'bg-emerald-100 text-emerald-900', revision_requested: 'bg-orange-100 text-orange-900', rejected: 'bg-rose-100 text-rose-900' };

  return <div dir="rtl" className="min-h-dvh bg-[#EDF0F5] pb-28"><div className="max-w-5xl mx-auto px-3 sm:px-6 py-5 space-y-5">
    <div className="rounded-[28px] bg-gradient-to-l from-[#B3CDE8] to-[#CBE0F4] border border-[#9BBEDF] p-5 shadow-sm"><div className="flex items-center gap-3"><div className="p-3 rounded-2xl bg-white text-[#1F5AAA]"><ClipboardCheck className="w-7 h-7" /></div><div><h1 className="text-xl sm:text-2xl font-black text-[#1A3A5F]">بوابة المشرف المدرسي</h1><p className="text-xs sm:text-sm font-bold text-[#28486B]">{session.name} • {session.schoolName}</p></div></div></div>
    {toast && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{toast}</div>}
    {nav === 'activities' && <div className="space-y-4">
      <section className="rounded-2xl bg-white border border-[#DCE7F3] p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">{(['تقرير','نشاط','فعالية'] as ActivityType[]).map((v)=><button key={v} onClick={()=>{setActivityType(v);setSubtype(v==='تقرير'?'زيارة فصلية':v==='نشاط'?'رياضي':'حفل تكريم')}} className={`rounded-xl border p-3 text-xs font-black ${activityType===v?'bg-[#1F5AAA] text-white':'bg-[#F4F8FC] text-[#1A3A5F]'}`}>{v}</button>)}</div>
        <select value={subtype} onChange={(e)=>setSubtype(e.target.value)} className="w-full rounded-xl border border-[#DCE7F3] p-3 text-sm">{(activityType==='تقرير'?['زيارة فصلية','زيارة خاصة','تقرير عام']:activityType==='نشاط'?['رياضي','ثقافي','مسابقة علمية','ترفيهي']:['حفل تكريم','يوم وطني','فعالية عامة','مناسبة']).map(x=><option key={x}>{x}</option>)}</select>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><select value={grade} onChange={(e)=>setGrade(e.target.value)} className="rounded-xl border p-3 text-sm">{GRADES.map(g=><option key={g} value={g}>الصف {g}</option>)}</select><input value={className} onChange={e=>setClassName(e.target.value)} placeholder="الفصل" className="rounded-xl border p-3 text-sm"/><input type="date" value={activityDate} onChange={e=>setActivityDate(e.target.value)} className="rounded-xl border p-3 text-sm"/></div>
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="عنوان التقرير أو النشاط" className="w-full rounded-xl border p-3 text-sm"/>
        <div className="flex flex-wrap gap-2"><button onClick={isRecording?()=>{recorderRef.current?.stop();setIsRecording(false)}:startRecording} className="rounded-xl bg-[#EEF5FC] border border-[#C6DCF2] p-3 text-sm font-black text-[#1F5AAA] flex gap-2 items-center"><Mic className="w-4 h-4"/>{isRecording?'إيقاف التسجيل':'تسجيل صوت (دقيقتان كحد أقصى)'}</button><button onClick={()=>activityImageRef.current?.click()} className="rounded-xl border p-3 text-sm font-black text-[#1F5AAA] flex gap-2 items-center"><Camera className="w-4 h-4"/>إضافة حتى 3 صور</button><input ref={activityImageRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>addActivityImages(e.target.files)}/></div>
        {activityImages.length>0&&<div className="grid grid-cols-3 gap-2">{activityImages.map((im,i)=><div key={i} className="relative"><img src={im} className="w-full h-24 object-cover rounded-lg"/><button onClick={()=>setActivityImages(p=>p.filter((_,n)=>n!==i))} className="absolute top-1 left-1 rounded bg-rose-600 text-white px-2">×</button></div>)}</div>}
        <textarea value={originalText} onChange={e=>setOriginalText(e.target.value)} rows={2} placeholder="اكتب سطراً عن النشاط أو راجع النص المفرغ من الصوت" className="w-full rounded-xl border p-3 text-sm"/>
        <button onClick={polishActivity} disabled={isPolishing} className="rounded-xl bg-[#1F5AAA] px-4 py-3 text-sm font-black text-white">{isPolishing?'جاري إعداد الصياغة...':'صياغة احترافية بواسطة Gemini'}</button>
        {professionalText&&<><textarea value={professionalText} onChange={e=>setProfessionalText(e.target.value)} rows={6} className="w-full rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm"/><button onClick={saveSupervisorActivity} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-black text-white flex justify-center gap-2"><Send className="w-4 h-4"/>إرسال للاعتماد</button></>}
      </section>
      <div className="space-y-2">{activityFiltered.map(a=><article key={a.id} className="rounded-2xl border bg-white p-4"><div className="flex justify-between gap-2"><b>{a.title}</b><span className={`rounded-full px-2 py-1 text-xs ${statusStyle[a.status]}`}>{statusLabel[a.status]}</span></div><div className="text-xs text-slate-500 mt-1">{a.type} • {a.subtype} • {a.date} • الصف {a.grade} / {a.className}</div>{a.imageUrls.map((im,i)=><img key={i} src={im} className="mt-2 inline-block h-20 w-24 object-cover rounded-lg ml-2"/>)}<p className="mt-2 text-sm whitespace-pre-wrap">{a.professionalText}</p>{a.principalNote&&<p className="mt-2 text-xs text-orange-800">ملاحظة المدير: {a.principalNote}</p>}</article>)}</div>
    </div>}
    {nav==='attendance'&&<div className="space-y-4"><div className="rounded-2xl border bg-white p-4 space-y-3"><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><select value={grade} onChange={e=>setGrade(e.target.value)} className="rounded-xl border p-3">{GRADES.map(g=><option value={g} key={g}>الصف {g}</option>)}</select><input value={className} onChange={e=>setClassName(e.target.value)} placeholder="الفصل / الشعبة" className="rounded-xl border p-3"/><input type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)} className="rounded-xl border p-3"/></div><div className="grid grid-cols-2 gap-2"><input ref={attendanceCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>e.target.files?.[0]&&readAttendanceImage(e.target.files[0])}/><input ref={attendanceGalleryRef} type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&readAttendanceImage(e.target.files[0])}/><button onClick={()=>attendanceCameraRef.current?.click()} className="rounded-xl border bg-[#EEF5FC] p-3 font-black text-[#1F5AAA]"><Camera className="inline w-4 h-4 ml-1"/>تصوير الكشف</button><button onClick={()=>attendanceGalleryRef.current?.click()} className="rounded-xl border p-3 font-black text-[#1F5AAA]"><ImageIcon className="inline w-4 h-4 ml-1"/>اختيار صورة</button></div>{attendanceImage&&<img src={attendanceImage} alt="كشف" className="max-h-72 w-full object-contain rounded-xl border"/>}</div>
      {isReadingAttendance?<div className="rounded-xl bg-white p-8 text-center">Gemini يقرأ الكشف...</div>:attendanceRows.length>0&&<div className="rounded-2xl bg-white p-4 space-y-2">{attendanceRows.map((r,i)=><div key={i} className="grid grid-cols-[1fr_150px] gap-2"><input value={r.studentName} onChange={e=>setAttendanceRows(p=>p.map((x,n)=>n===i?{...x,studentName:e.target.value}:x))} className="rounded-lg border p-2"/><select value={r.status} onChange={e=>setAttendanceRows(p=>p.map((x,n)=>n===i?{...x,status:e.target.value as AttendanceStatus}:x))} className="rounded-lg border p-2"><option>حاضر</option><option>غائب بعذر</option><option>غائب بدون عذر</option><option>متأخر</option></select></div>)}<button onClick={saveAttendanceRows} className="w-full rounded-xl bg-emerald-600 p-3 text-white font-black">مراجعة وإرسال للمدير</button></div>}
      <section className="space-y-2">{attendance.filter(a=>a.supervisorCode===session.code).map(a=><article key={a.id} className="rounded-xl border bg-white p-3"><b>الصف {a.grade} • {a.className} • {a.date}</b><span className="float-left">{statusLabel[a.status||'pending']}</span>{a.rows.map((r,i)=><p key={i} className="text-sm">{r.studentName} — {r.status}</p>)}</article>)}</section>
    </div>}
    {nav==='schedule'&&<div className="space-y-4"><section className="rounded-2xl border bg-white p-4 space-y-3"><div className="grid grid-cols-2 gap-3"><select value={grade} onChange={e=>setGrade(e.target.value)} className="rounded-xl border p-3">{GRADES.map(g=><option value={g} key={g}>الصف {g}</option>)}</select><input value={className} onChange={e=>setClassName(e.target.value)} placeholder="الفصل / الشعبة" className="rounded-xl border p-3"/></div><div className="grid grid-cols-2 gap-2"><input ref={scheduleCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>e.target.files?.[0]&&readScheduleImage(e.target.files[0])}/><input ref={scheduleGalleryRef} type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&readScheduleImage(e.target.files[0])}/><button onClick={()=>scheduleCameraRef.current?.click()} className="rounded-xl border p-3 text-[#1F5AAA] font-black"><Camera className="inline w-4 h-4 ml-1"/>تصوير الجدول</button><button onClick={()=>scheduleGalleryRef.current?.click()} className="rounded-xl border p-3 text-[#1F5AAA] font-black"><ImageIcon className="inline w-4 h-4 ml-1"/>اختيار صورة</button></div>{scheduleImage&&<img src={scheduleImage} alt="جدول" className="max-h-64 w-full object-contain rounded-xl border"/>}</section>
      {isReadingSchedule?<div className="rounded-xl bg-white p-8 text-center">Gemini يحلل الجدول...</div>:<section className="rounded-2xl border bg-white p-4 space-y-2">{scheduleCells.map((c,i)=><div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2"><select value={c.day} onChange={e=>setScheduleCells(p=>p.map((x,n)=>n===i?{...x,day:e.target.value}:x))} className="rounded border p-2">{days.map(d=><option key={d}>{d}</option>)}</select><select value={c.period} onChange={e=>setScheduleCells(p=>p.map((x,n)=>n===i?{...x,period:Number(e.target.value)}:x))} className="rounded border p-2">{[1,2,3,4,5,6].map(p=><option key={p}>{p}</option>)}</select><input value={c.subject} onChange={e=>setScheduleCells(p=>p.map((x,n)=>n===i?{...x,subject:e.target.value}:x))} placeholder="المادة" className="rounded border p-2"/><input value={c.teacherName} onChange={e=>setScheduleCells(p=>p.map((x,n)=>n===i?{...x,teacherName:e.target.value}:x))} placeholder="المعلم" className="rounded border p-2"/><input value={c.room} onChange={e=>setScheduleCells(p=>p.map((x,n)=>n===i?{...x,room:e.target.value}:x))} placeholder="الفصل" className="rounded border p-2"/></div>)}<div className="flex gap-2"><button onClick={addManualScheduleRow} className="rounded-xl border px-4 py-2 text-[#1F5AAA] font-black"><Plus className="inline w-4 h-4"/>حصة يدوية</button><button onClick={submitSchedule} className="rounded-xl bg-[#1F5AAA] px-4 py-2 text-white font-black"><Send className="inline w-4 h-4"/>إرسال للاعتماد</button></div>{scheduleForClass&&<p className="rounded-lg bg-amber-50 p-3 text-sm">حالة الجدول: {statusLabel[scheduleForClass.status]}</p>}</section>}
    </div>}
    </div><nav className="fixed bottom-3 inset-x-3 z-40 mx-auto max-w-xl rounded-[24px] border bg-white/95 p-1.5 shadow-lg grid grid-cols-3">{([['activities','الأنشطة',Activity],['attendance','الحضور والغياب',Users],['schedule','جدول الحصص',CalendarDays]] as const).map(([key,label,Icon])=><button key={key} onClick={()=>setNav(key)} className={`min-h-14 rounded-2xl flex flex-col items-center justify-center gap-1 text-[11px] font-black ${nav===key?'bg-[#EEF5FC] text-[#1F5AAA]':'text-[#5C7085]'}`}><Icon className="w-5 h-5"/><span>{label}</span></button>)}</nav></div>;
};
