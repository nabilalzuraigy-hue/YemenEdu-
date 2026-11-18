import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/app_data.dart';

class EssaySubmissionPage extends StatefulWidget {
  final UserSession session;
  final QuestionItem question;

  const EssaySubmissionPage({
    super.key,
    required this.session,
    required this.question,
  });

  @override
  State<EssaySubmissionPage> createState() => _EssaySubmissionPageState();
}

class _EssaySubmissionPageState extends State<EssaySubmissionPage> {
  File? pickedImage;
  final TextEditingController _notesController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submitHomework() async {
    setState(() => _isSubmitting = true);

    final newSub = HomeworkSubmission(
      id: 'sub-${DateTime.now().millisecondsSinceEpoch}',
      studentCode: widget.session.code,
      studentName: widget.session.name,
      grade: widget.session.grade,
      subject: widget.question.subject,
      title: widget.question.questionText,
      photoUrl: pickedImage != null
          ? pickedImage!.path
          : 'https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=800&q=80',
      studentNotes: _notesController.text.trim(),
      maxScore: 5,
      status: 'بانتظار المراجعة',
      submittedAt: 'الآن',
    );

    AppData.instance.submissions.insert(0, newSub);
    await AppData.instance.saveSubmissions();

    setState(() => _isSubmitting = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('📸 تم إرسال الحل بنجاح لمعلم المادة!')),
      );
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0F4F8),
      appBar: AppBar(
        backgroundColor: const Color(0xFFB3CDE8),
        title: Text(
          'حل سؤال: ${widget.question.subject}',
          style: const TextStyle(
            color: Color(0xFF1A3A5F),
            fontSize: 14,
            fontWeight: FontWeight.bold,
          ),
        ),
        iconTheme: const IconThemeData(color: Color(0xFF1A3A5F)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // بطاقة السؤال المقالي
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFD5E2EE)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE3F2FD),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          widget.question.subject,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF1E5AA8),
                          ),
                        ),
                      ),
                      Text(
                        'درجات السؤال: ${widget.question.points}',
                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    widget.question.questionText,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A5F),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Fix 2: Container تصوير الواجب للأسئلة المقالية
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFD5E2EE)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'صورة الدفتر بخط اليد:',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A5F),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    height: 180,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.blue.shade300, width: 1.5),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.grey.withOpacity(0.1),
                    ),
                    child: pickedImage == null
                        ? Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.camera_alt, size: 50, color: Colors.blue),
                              const SizedBox(height: 4),
                              const Text("اضغط لتصوير الواجب", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              const SizedBox(height: 10),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.camera),
                                    label: const Text("تصوير بالكاميرا"),
                                    onPressed: () async {
                                      final p = ImagePicker();
                                      final XFile? img = await p.pickImage(source: ImageSource.camera, imageQuality: 70);
                                      if (img != null) {
                                        setState(() => pickedImage = File(img.path));
                                      }
                                    },
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF1E5AA8),
                                      foregroundColor: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.photo_library),
                                    label: const Text("من المعرض"),
                                    onPressed: () async {
                                      final p = ImagePicker();
                                      final XFile? img = await p.pickImage(source: ImageSource.gallery, imageQuality: 70);
                                      if (img != null) {
                                        setState(() => pickedImage = File(img.path));
                                      }
                                    },
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: const Color(0xFF1E5AA8),
                                      side: const BorderSide(color: Color(0xFF1E5AA8)),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          )
                        : Stack(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.file(
                                  pickedImage!,
                                  width: double.infinity,
                                  height: 180,
                                  fit: BoxFit.cover,
                                ),
                              ),
                              Positioned(
                                top: 5,
                                right: 5,
                                child: CircleAvatar(
                                  radius: 16,
                                  backgroundColor: Colors.black54,
                                  child: IconButton(
                                    padding: EdgeInsets.zero,
                                    icon: const Icon(Icons.close, color: Colors.white, size: 18),
                                    onPressed: () => setState(() => pickedImage = null),
                                  ),
                                ),
                              ),
                            ],
                          ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // ملاحظات إضافية
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFD5E2EE)),
              ),
              child: TextField(
                controller: _notesController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'ملاحظاتك أو خطوات الحل التوضيحية (اختياري)',
                  hintText: 'كتبت الحل كاملاً ورسمت المخطط في الصفحة المقابلة...',
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(height: 20),

            ElevatedButton.icon(
              onPressed: (_isSubmitting || pickedImage == null) ? null : _submitHomework,
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
              label: const Text(
                'إرسال للمعلم',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E5AA8),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
