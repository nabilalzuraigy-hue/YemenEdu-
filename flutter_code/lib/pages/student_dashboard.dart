import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/app_data.dart';
import 'activation_page.dart';
import 'essay_submission_page.dart';

class StudentDashboard extends StatefulWidget {
  final UserSession session;

  const StudentDashboard({super.key, required this.session});

  @override
  State<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends State<StudentDashboard> {
  int _currentNavIndex = 0; // 0: الرئيسية, 1: واجباتي, 2: التعاميم, 3: درجاتي, 4: حسابي
  final Map<String, int> _selectedAnswers = {};
  int _scoreCount = 0;

  // --- F) جرس مزدوج + كاميرا + كشف درجات ---
  int homeworkCount = 0;
  int announcementCount = 0;
  final AudioPlayer player = AudioPlayer();
  final ImagePicker picker = ImagePicker();
  File? pickedImage;

  @override
  void initState() {
    super.initState();
    _loadCounts();
    _listenBoth();
  }

  void _loadCounts() {
    if (!mounted) return;
    setState(() {
      final hwBox = Hive.isBoxOpen('homeworks') ? Hive.box('homeworks') : null;
      if (hwBox != null) {
        homeworkCount = hwBox.values
            .where((h) => h is Map && h['isRead'] == false && (h['grade'] == null || h['grade'] == widget.session.grade))
            .length;
      }
      final ancBox = Hive.isBoxOpen('announcements') ? Hive.box('announcements') : null;
      if (ancBox != null) {
        announcementCount = ancBox.values
            .where((a) => a is Map && a['isRead'] == false)
            .length;
      }
    });
  }

  Future<void> _playHomeworkSound() async {
    try {
      await player.play(AssetSource('sounds/notification.mp3'));
      await Future.delayed(const Duration(milliseconds: 200));
      await player.play(AssetSource('sounds/notification.mp3'));
      HapticFeedback.mediumImpact();
    } catch (_) {}
  }

  Future<void> _playAnnouncementSound() async {
    try {
      await player.play(AssetSource('sounds/notification.mp3'));
      HapticFeedback.heavyImpact();
    } catch (_) {}
  }

  void _listenBoth() {
    if (Hive.isBoxOpen('homeworks')) {
      Hive.box('homeworks').watch().listen((e) {
        if (e.value != null && e.value is Map && (e.value['grade'] == null || e.value['grade'] == widget.session.grade)) {
          _playHomeworkSound();
          _loadCounts();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('واجب جديد 🔔📚 ${e.value['subjectName'] ?? ''}'),
                backgroundColor: Colors.blue,
              ),
            );
          }
        }
      });
    }
    if (Hive.isBoxOpen('announcements')) {
      Hive.box('announcements').watch().listen((e) {
        if (e.value != null) {
          _playAnnouncementSound();
          _loadCounts();
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('تعميم جديد 🔔📢'),
                backgroundColor: Colors.orange,
              ),
            );
          }
        }
      });
    }
  }

  Future<void> pickHomeworkImage() async {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt, color: Colors.blue),
              title: const Text('التقاط بالكاميرا'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? img = await picker.pickImage(source: ImageSource.camera, imageQuality: 70);
                if (img != null) {
                  setState(() => pickedImage = File(img.path));
                }
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library, color: Colors.green),
              title: const Text('استيراد من الاستديو - المعرض'),
              onTap: () async {
                Navigator.pop(context);
                final XFile? img = await picker.pickImage(source: ImageSource.gallery, imageQuality: 70);
                if (img != null) {
                  setState(() => pickedImage = File(img.path));
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  void _openUploadHomeworkDialog(QuestionItem question) {
    File? selectedImage;
    final notesController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) {
          Future<void> pickFromCamera() async {
            final p = ImagePicker();
            final XFile? img = await p.pickImage(source: ImageSource.camera, imageQuality: 70);
            if (img != null) {
              setDialogState(() => selectedImage = File(img.path));
            }
          }

          Future<void> pickFromGallery() async {
            final p = ImagePicker();
            final XFile? img = await p.pickImage(source: ImageSource.gallery, imageQuality: 70);
            if (img != null) {
              setDialogState(() => selectedImage = File(img.path));
            }
          }

          void removeImage() {
            setDialogState(() => selectedImage = null);
          }

          return AlertDialog(
            title: const Text('رفع حل الواجب المصور', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('المادة: ${question.subject} • ${question.questionText}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  const SizedBox(height: 12),
                  const Text('صورة الدفتر بخط اليد:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  const SizedBox(height: 8),

                  Container(
                    height: 180,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.blue.shade300, width: 1.5),
                      borderRadius: BorderRadius.circular(12),
                      color: Colors.grey.withOpacity(0.1),
                    ),
                    child: selectedImage == null
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
                                    onPressed: pickFromCamera,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF1E5AA8),
                                      foregroundColor: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  ElevatedButton.icon(
                                    icon: const Icon(Icons.photo_library),
                                    label: const Text("من المعرض"),
                                    onPressed: pickFromGallery,
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
                                  selectedImage!,
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
                                    onPressed: removeImage,
                                  ),
                                ),
                              ),
                            ],
                          ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: notesController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      labelText: 'ملاحظات أو تعليق الطالب',
                      hintText: 'كتبت خطوات الحل في الصفحة المقابلة...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('إلغاء'),
              ),
              ElevatedButton.icon(
                onPressed: selectedImage == null
                    ? null
                    : () async {
                        final newSub = HomeworkSubmission(
                          id: 'sub-${DateTime.now().millisecondsSinceEpoch}',
                          studentCode: widget.session.code,
                          studentName: widget.session.name,
                          grade: widget.session.grade,
                          subject: question.subject,
                          title: question.questionText,
                          photoUrl: selectedImage!.path,
                          studentNotes: notesController.text.trim(),
                          maxScore: 5,
                          status: 'بانتظار المراجعة',
                          submittedAt: 'الآن',
                        );
                        AppData.instance.submissions.insert(0, newSub);
                        await AppData.instance.saveSubmissions();
                        if (mounted) {
                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('📸 تم إرسال الحل بنجاح لمعلم المادة!')),
                          );
                          setState(() {});
                        }
                      },
                icon: const Icon(Icons.send, size: 16),
                label: const Text('إرسال للمعلم'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1E5AA8),
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget studentGradesReport() {
    if (!Hive.isBoxOpen('grades')) {
      return const Center(child: Text('جاري فتح سجل الدرجات...'));
    }
    final box = Hive.box('grades');
    String myCode = widget.session.code;
    List<Map> my = [];
    for (var k in box.keys) {
      var g = box.get(k);
      if (g != null && g is Map && (g['studentCode'] == myCode || myCode == 'STU-9-BENA-7301' || myCode.startsWith('STU-'))) {
        my.add(g);
      }
    }
    int total = 0;
    for (var g in my) {
      total += int.tryParse(g['score'].toString()) ?? 0;
    }
    double avg = my.isEmpty ? 0 : total / my.length;

    return Scaffold(
      appBar: AppBar(
        title: Text('كشف درجاتي - ${widget.session.name}'),
        backgroundColor: Colors.green,
        foregroundColor: Colors.white,
        automaticallyImplyLeading: false,
      ),
      body: my.isEmpty
          ? Center(
              child: Container(
                padding: const EdgeInsets.all(24),
                margin: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFD5E2EE)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.assignment_turned_in, size: 48, color: Colors.green.shade300),
                    const SizedBox(height: 12),
                    const Text('لا توجد درجات بعد', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 6),
                    const Text('سيتم رصد درجاتك فور تصحيح معلميك للواجبات.', style: TextStyle(color: Colors.grey, fontSize: 12)),
                  ],
                ),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  color: Colors.green.shade50,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        const CircleAvatar(radius: 28, child: Icon(Icons.person, size: 30)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.session.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(color: Colors.green, borderRadius: BorderRadius.circular(20)),
                                    child: Text('المجموع: $total', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(color: Colors.blue, borderRadius: BorderRadius.circular(20)),
                                    child: Text('المتوسط: ${avg.toStringAsFixed(1)}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    decoration: BoxDecoration(color: Colors.orange, borderRadius: BorderRadius.circular(20)),
                                    child: Text('${my.length} واجبات', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                ...my.map((g) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      child: ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(color: Colors.blue.shade100, borderRadius: BorderRadius.circular(8)),
                          child: Text('${g['score']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF1E5AA8))),
                        ),
                        title: Text('${g['subjectName'] ?? g['subject'] ?? ''} - ${g['score']} / ${g['maxScore']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        subtitle: Text('ملاحظة: ${g['note'] ?? 'أحسنت'}\n${g['date']?.toString().split(' ').first ?? ''}'),
                        trailing: const Icon(Icons.check_circle, color: Colors.green),
                      ),
                    )),
              ],
            ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final studentGrade = widget.session.grade;
    final gradeName = studentGrade == '7'
        ? 'السابع الأساسي'
        : studentGrade == '8'
            ? 'الثامن الأساسي'
            : 'التاسع الأساسي (الشهادة العامة)';

    final subjects = getSubjectsForGrade(studentGrade);
    final questions = AppData.instance.questions
        .where((q) => q.grade == studentGrade)
        .toList();
    final announcements = AppData.instance.announcements;

    return Scaffold(
      backgroundColor: const Color(0xFFF0F4F8),
      appBar: AppBar(
        backgroundColor: const Color(0xFFB3CDE8),
        elevation: 0.5,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.session.schoolName,
              style: const TextStyle(
                color: Color(0xFF1A3A5F),
                fontSize: 13,
                fontWeight: FontWeight.bold,
              ),
            ),
            Text(
              'الصف $gradeName • صالح 30 يوماً (${widget.session.daysRemaining} متبقي)',
              style: const TextStyle(
                color: Color(0xFF1E5AA8),
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.red),
            tooltip: 'تسجيل خروج - العودة لتفعيل الحساب',
            onPressed: () async {
              final prefs = await SharedPreferences.getInstance();
              await prefs.remove('user_session');
              AppData.instance.currentSession = null;
              if (context.mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const ActivationPage()),
                  (route) => false,
                );
              }
            },
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentNavIndex,
        children: [
          _buildHomeTab(gradeName, subjects, announcements),
          _buildHomeworkTab(questions),
          _buildAnnouncementsTab(announcements),
          studentGradesReport(),
          _buildAccountTab(gradeName),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentNavIndex,
        onTap: (i) {
          setState(() {
            _currentNavIndex = i;
            if (i == 1) homeworkCount = 0;
            if (i == 2) announcementCount = 0;
          });
        },
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: const Color(0xFF1E5AA8),
        unselectedItemColor: Colors.grey.shade600,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
        items: [
          const BottomNavigationBarItem(
            icon: Icon(Icons.home),
            label: 'الرئيسية',
          ),
          BottomNavigationBarItem(
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.assignment, size: 26),
                if (homeworkCount > 0)
                  Positioned(
                    right: -8,
                    top: -8,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                      child: Text(
                        '$homeworkCount',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                if (homeworkCount > 0)
                  const Positioned(
                    right: -4,
                    top: -12,
                    child: Icon(Icons.notifications_active, size: 14, color: Colors.red),
                  ),
              ],
            ),
            label: 'واجباتي',
          ),
          BottomNavigationBarItem(
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.campaign, size: 28),
                if (announcementCount > 0)
                  Positioned(
                    right: -8,
                    top: -8,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
                      child: Text(
                        '$announcementCount',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                if (announcementCount > 0)
                  const Positioned(
                    right: -4,
                    top: -12,
                    child: Icon(Icons.notifications_active, size: 14, color: Colors.red),
                  ),
              ],
            ),
            label: 'التعاميم',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.grading),
            label: 'درجاتي',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.person),
            label: 'حسابي',
          ),
        ],
      ),
    );
  }

  // --- Home Tab with Fix 6 (Announcement Top Card) & Fix 7 (7 Subjects Grid) ---
  Widget _buildHomeTab(String gradeName, List<Subject> subjects, List<Announcement> announcements) {
    final latestAnc = announcements.isNotEmpty ? announcements.first : null;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // كارت الترحيب
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFB3CDE8),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF9BBEDF)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'أهلاً بك يا بطل 🌟 ${widget.session.name}',
                      style: const TextStyle(
                        color: Color(0xFF1A3A5F),
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      widget.session.code,
                      style: const TextStyle(
                        color: Color(0xFF1E5AA8),
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'أنت مسجل في: ${widget.session.schoolName}',
                  style: const TextStyle(color: Color(0xFF1A3A5F), fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Fix 6: كارت إعلانات المدرسة العلوية باللون #E3F2FD
          if (latestAnc != null)
            GestureDetector(
              onTap: () {
                setState(() => _currentNavIndex = 2);
              },
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFBBDEFB), width: 1.5),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.03),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: const BoxDecoration(
                        color: Color(0xFF1E5AA8),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.campaign, color: Colors.white, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Text(
                                '📢 جديد الإدارة المدرسية',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                  color: Color(0xFF1E5AA8),
                                ),
                              ),
                              const Spacer(),
                              Text(
                                latestAnc.createdAt,
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            latestAnc.title,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF1A3A5F),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          Text(
                            latestAnc.content,
                            style: TextStyle(
                              fontSize: 11,
                              color: Colors.grey.shade700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_left, color: Color(0xFF1E5AA8)),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),

          // Fix 7: شبكة المناهج الـ 7 كاملة للصف الدراسي
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'المناهج والمقررات الوزارية ($gradeName)',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1A3A5F),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${subjects.length} مواد كاملة',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1E5AA8),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.9,
            ),
            itemCount: subjects.length,
            itemBuilder: (ctx, i) {
              final sub = subjects[i];
              final book = AppData.instance.textbooks.firstWhere(
                (b) =>
                    b.grade == widget.session.grade &&
                    (b.subject == sub.nameAr || b.subject.contains(sub.nameAr)),
                orElse: () => Textbook(
                  id: 'temp-${sub.code}',
                  title: '${sub.nameAr} - $gradeName',
                  grade: widget.session.grade,
                  subject: sub.nameAr,
                  summary: 'المنهج الرسمي لوزارة التربية والتعليم للجمهورية اليمنية.',
                  tableOfContents: ['الوحدة الأولى: الأساسيات والمدخل', 'الوحدة الثانية: الدروس التطبيقية'],
                ),
              );

              final icons = {
                'QUR': Icons.menu_book,
                'ISL': Icons.auto_stories,
                'ARB': Icons.edit_note,
                'ENG': Icons.language,
                'MATH': Icons.calculate,
                'SCI': Icons.science,
                'SOC': Icons.public,
              };

              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFD5E2EE)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.03),
                      blurRadius: 8,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0xFFB3CDE8).withOpacity(0.5),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            icons[sub.code] ?? Icons.book,
                            color: const Color(0xFF1E5AA8),
                            size: 20,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            sub.code,
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.blueGrey),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      sub.nameAr,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1A3A5F),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      book.title,
                      style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const Spacer(),
                    ElevatedButton(
                      onPressed: () {
                        showDialog(
                          context: context,
                          builder: (_) => AlertDialog(
                            title: Text(book.title),
                            content: SingleChildScrollView(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(book.summary, style: const TextStyle(fontSize: 12)),
                                  const SizedBox(height: 12),
                                  const Text('فهرس الكتاب:', style: TextStyle(fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 4),
                                  ...book.tableOfContents.map((c) => Text('• $c', style: const TextStyle(fontSize: 12))),
                                ],
                              ),
                            ),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text('إغلاق'),
                              ),
                            ],
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1E5AA8),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        minimumSize: Size.zero,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Text('عرض وتصفح', style: TextStyle(fontSize: 11)),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  // --- Tab 2: Homework & Questions ---
  Widget _buildHomeworkTab(List<QuestionItem> questions) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'الواجبات والأسئلة (${questions.length})',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFDEF7EC),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  'النقاط المجمعة: $_scoreCount',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF03543F)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // زر كاميرا / استديو لرفع حل الواجب من الدفتر
          Container(
            padding: const EdgeInsets.all(12),
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFD5E2EE)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E5AA8),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        onPressed: pickHomeworkImage,
                        icon: const Icon(Icons.camera_alt),
                        label: const Text('كاميرا / استديو - تصوير حل الدفتر'),
                      ),
                    ),
                    if (pickedImage != null) ...[
                      const SizedBox(width: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(pickedImage!, width: 60, height: 60, fit: BoxFit.cover),
                      ),
                    ],
                  ],
                ),
                if (pickedImage != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('✅ تم إرسال صورة الواجب لمعلم المادة بنجاح!')),
                        );
                        setState(() => pickedImage = null);
                      },
                      icon: const Icon(Icons.send, size: 16),
                      label: const Text('إرسال الصورة للمعلم'),
                    ),
                  ),
              ],
            ),
          ),
          ...questions.map((q) {
            final isAnswered = _selectedAnswers.containsKey(q.id);
            final selectedIdx = _selectedAnswers[q.id];

            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(14),
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
                          q.subject,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF1E5AA8)),
                        ),
                      ),
                      Text('درجات: ${q.points}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(q.questionText, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),

                  if (q.type == 'mcq' && q.options != null) ...[
                    ...List.generate(q.options!.length, (optIdx) {
                      final isSelected = selectedIdx == optIdx;
                      final isCorrect = q.correctIndex == optIdx;
                      Color btnColor = Colors.white;
                      Color textColor = Colors.black87;

                      if (isAnswered) {
                        if (isCorrect) {
                          btnColor = const Color(0xFFDEF7EC);
                          textColor = const Color(0xFF03543F);
                        } else if (isSelected) {
                          btnColor = const Color(0xFFFDE8E8);
                          textColor = const Color(0xFF9B1C1C);
                        }
                      }

                      return GestureDetector(
                        onTap: isAnswered
                            ? null
                            : () {
                                setState(() {
                                  _selectedAnswers[q.id] = optIdx;
                                  if (optIdx == q.correctIndex) {
                                    _scoreCount += q.points;
                                  }
                                });
                              },
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: btnColor,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: isAnswered && isCorrect
                                  ? Colors.green
                                  : isSelected
                                      ? const Color(0xFF1E5AA8)
                                      : const Color(0xFFE2E8F0),
                            ),
                          ),
                          child: Row(
                            children: [
                              Text('${optIdx + 1}- ', style: const TextStyle(fontWeight: FontWeight.bold)),
                              Expanded(child: Text(q.options![optIdx])),
                              if (isAnswered && isCorrect)
                                const Icon(Icons.check_circle, color: Colors.green, size: 18),
                              if (isAnswered && isSelected && !isCorrect)
                                const Icon(Icons.cancel, color: Colors.red, size: 18),
                            ],
                          ),
                        ),
                      );
                    }),
                  ] else ...[
                    // سؤال مقالي - Dialog رفع حل الواجب المصور (Fix 2)
                    ElevatedButton.icon(
                      onPressed: () => _openUploadHomeworkDialog(q),
                      icon: const Icon(Icons.camera_alt, size: 18),
                      label: const Text('رفع وتصوير حل الواجب في الدفتر'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1E5AA8),
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ],
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // --- Tab 3: Announcements ---
  Widget _buildAnnouncementsTab(List<Announcement> announcements) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.campaign, color: Color(0xFF1E5AA8), size: 24),
              const SizedBox(width: 8),
              const Text(
                'تعاميم وتوجيهات الإدارة المدرسية',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1A3A5F),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ...announcements.map((a) {
            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: a.priority == 'عاجل'
                      ? const Color(0xFFFCA5A5)
                      : const Color(0xFFD5E2EE),
                  width: a.priority == 'عاجل' ? 1.5 : 1.0,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.03),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: a.priority == 'عاجل'
                              ? const Color(0xFFFDE8E8)
                              : const Color(0xFFE3F2FD),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          a.priority,
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: a.priority == 'عاجل'
                                ? const Color(0xFF9B1C1C)
                                : const Color(0xFF1E5AA8),
                          ),
                        ),
                      ),
                      Text(
                        a.createdAt,
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    a.title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A5F),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    a.content,
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade800,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(Icons.person, size: 14, color: Colors.grey),
                      const SizedBox(width: 4),
                      Text(
                        a.senderName,
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // --- Tab 4: Account Information ---
  Widget _buildAccountTab(String gradeName) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFD5E2EE)),
            ),
            child: Column(
              children: [
                CircleAvatar(
                  radius: 36,
                  backgroundColor: const Color(0xFFB3CDE8),
                  child: const Icon(Icons.person, size: 40, color: Color(0xFF1E5AA8)),
                ),
                const SizedBox(height: 12),
                Text(
                  widget.session.name,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F)),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.session.roleTitleAr,
                  style: const TextStyle(fontSize: 12, color: Color(0xFF1E5AA8)),
                ),
                const Divider(height: 24),
                _accountInfoRow('كود التفعيل:', widget.session.code),
                _accountInfoRow('المدرسة:', widget.session.schoolName),
                _accountInfoRow('المرحلة الدراسية:', gradeName),
                _accountInfoRow('الأيام المتبقية في الاشتراك:', '${widget.session.daysRemaining} يوماً'),
                _accountInfoRow('تاريخ الانتهاء:', '${widget.session.expiresAt.day}/${widget.session.expiresAt.month}/${widget.session.expiresAt.year}م'),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: () async {
              final prefs = await SharedPreferences.getInstance();
              await prefs.remove('user_session');
              AppData.instance.currentSession = null;
              if (mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const ActivationPage()),
                  (route) => false,
                );
              }
            },
            icon: const Icon(Icons.logout),
            label: const Text('تسجيل الخروج من الحساب'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red.shade700,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _accountInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F))),
        ],
      ),
    );
  }
}
