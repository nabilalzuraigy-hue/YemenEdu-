import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:vibration/vibration.dart';
import '../services/app_data.dart';
import 'activation_page.dart';

class TeacherDashboard extends StatefulWidget {
  final UserSession session;

  const TeacherDashboard({super.key, required this.session});

  @override
  State<TeacherDashboard> createState() => _TeacherDashboardState();
}

class _TeacherDashboardState extends State<TeacherDashboard>
    with SingleTickerProviderStateMixin {
  int _activeTab = 0; // 0: إنشاء سؤال, 1: كشف درجات, 2: واجبات مصورة, 3: تعاميم الإدارة
  String _qType = 'mcq';
  final _qTextController = TextEditingController();
  final List<TextEditingController> _optControllers =
      List.generate(4, (_) => TextEditingController());
  int _correctOptIndex = 0;
  final int _points = 5;

  final _feedbackController = TextEditingController();

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  final List<Map<String, dynamic>> _circulars = [
    {
      'id': 'c-1',
      'title': 'بدء اختبارات الشهر الأول لجميع الفصول',
      'content': 'تهيب إدارة مدرسة النور الحديثة بجميع المعلمين الكرام سرعة رفع نماذج اختبارات الشهر الأول والبدء في رصد درجات الطلاب بالمنصة.',
      'date': 'اليوم 08:30 ص',
      'priority': 'عاجل',
      'isRead': false,
    },
    {
      'id': 'c-2',
      'title': 'اجتماع مجلس المعلمين والموجهين',
      'content': 'سيتم عقد الاجتماع الدوري لمناقشة خطة تفعيل الواجبات المقالية المنزلية وتصحيحها يدوياً من الدفاتر.',
      'date': 'أمس 01:15 م',
      'priority': 'مهم',
      'isRead': false,
    },
    {
      'id': 'c-3',
      'title': 'تحديث معايير تصحيح الواجبات',
      'content': 'يرجى كتابة الملاحظات التشجيعية للطلاب في حقل ملاحظات المعلم لتحفيزهم على التميز.',
      'date': 'منذ 3 أيام',
      'priority': 'عادي',
      'isRead': false,
    },
  ];

  int get unreadCircularsCount => _circulars.where((c) => c['isRead'] == false).length;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 1),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.85, end: 1.25).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  Future<void> addNewCircular(String title, String content, [String priority = 'عاجل']) async {
    setState(() {
      _circulars.insert(0, {
        'id': 'c-${DateTime.now().millisecondsSinceEpoch}',
        'title': title,
        'content': content,
        'date': 'الآن',
        'priority': priority,
        'isRead': false,
      });
    });

    try {
      final player = AudioPlayer();
      await player.play(AssetSource('sounds/notification.mp3'));
    } catch (_) {}

    try {
      if (await Vibration.hasVibrator() == true) {
        Vibration.vibrate(duration: 500);
      }
    } catch (_) {}

    HapticFeedback.heavyImpact();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("📢 تعميم جديد من الإدارة"),
          backgroundColor: Color(0xFF1E5AA8),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  final Map<String, String> subjMap = {
    'MATH': 'الرياضيات',
    'SCI': 'العلوم',
    'AR': 'العربية',
    'ARB': 'اللغة العربية',
    'QURAN': 'القرآن',
    'QUR': 'القرآن الكريم',
    'SOC': 'الاجتماعيات',
    'ENG': 'الإنجليزية',
    'ISL': 'التربية الإسلامية',
  };

  Map<String, String> getTeacherLock() {
    final c = (widget.session.code).toUpperCase().split('-');
    String g = widget.session.grade.isNotEmpty ? widget.session.grade : (c.length >= 2 ? c[1] : '9');
    String s = widget.session.subject.isNotEmpty ? widget.session.subject : (c.length >= 3 ? c[2] : 'ARB');
    String sch = c.length >= 4 ? c[3] : 'NOUR';
    return {'grade': g, 'subject': s, 'school': sch};
  }

  String getTeacherSubjectName() {
    final l = getTeacherLock()['subject']!.toUpperCase();
    if (l.contains('ARB') || l.contains('AR')) return 'اللغة العربية';
    if (l.contains('ENG')) return 'الإنجليزية';
    if (l.contains('MATH')) return 'الرياضيات';
    if (l.contains('SCI')) return 'العلوم';
    if (l.contains('QUR')) return 'القرآن الكريم';
    if (l.contains('SOC')) return 'الاجتماعيات';
    if (l.contains('ISL')) return 'التربية الإسلامية';
    return subjMap[l] ?? 'الرياضيات';
  }

  List<Map> getStudentsForTeacher() {
    final lock = getTeacherLock();
    if (!Hive.isBoxOpen('codes')) return [];
    final box = Hive.box('codes');
    List<Map> list = [];
    for (var k in box.keys) {
      var d = box.get(k);
      if (d == null || (d is Map && d['role'] != 'student')) continue;
      if (k.toString().contains('STU-901')) continue;
      if (d is Map) {
        final g = (d['grade'] ?? '').toString();
        final codeStr = d['code'].toString().toUpperCase();
        if (g == lock['grade'] && (codeStr.contains(lock['school']!) || lock['school'] == 'ALL' || lock['school'] == 'BENA' || lock['school'] == 'NOUR')) {
          list.add({'name': d['name'] ?? 'طالب', 'code': d['code']});
        }
      }
    }
    return list;
  }

  List<Map> getHomeworksForTeacher() {
    final lock = getTeacherLock();
    if (!Hive.isBoxOpen('homeworks')) return [];
    final box = Hive.box('homeworks');
    List<Map> f = [];
    for (var k in box.keys) {
      var h = box.get(k);
      if (h == null || h is! Map) continue;
      String hs = (h['subject'] ?? '').toString().toUpperCase();
      String hg = (h['grade'] ?? '').toString();
      if (widget.session.role == UserRole.teacher) {
        if (hs.contains(lock['subject']!) && hg == lock['grade']) f.add(h);
      } else {
        f.add(h);
      }
    }
    return f;
  }

  // تصحيح - درجة مفتوحة
  Future<void> correctHomeworkOpen(Map stu) async {
    final gc = TextEditingController();
    final nc = TextEditingController();
    await showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('تصحيح - درجة مفتوحة - ${stu['name']}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Text('الدرجة:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: gc,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    autofocus: true,
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.blue),
                    decoration: InputDecoration(
                      hintText: 'مفتوحة',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                const Text('/ مفتوحة', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.grey)),
              ],
            ),
            const SizedBox(height: 12),
            TextField(
              controller: nc,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'أحسنت يا أمير...',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E5AA8)),
            onPressed: () async {
              final lock = getTeacherLock();
              if (!Hive.isBoxOpen('grades')) await Hive.openBox('grades');
              await Hive.box('grades').put(
                DateTime.now().millisecondsSinceEpoch.toString(),
                {
                  'studentCode': stu['code'],
                  'studentName': stu['name'],
                  'score': gc.text.trim().isEmpty ? '10' : gc.text.trim(),
                  'maxScore': 'مفتوحة',
                  'subject': lock['subject'],
                  'subjectName': getTeacherSubjectName(),
                  'note': nc.text.trim(),
                  'date': DateTime.now().toString(),
                },
              );
              if (mounted) {
                Navigator.pop(context);
                setState(() {});
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('✅ تم اعتماد الدرجة للطالب ${stu['name']}')),
                );
              }
            },
            child: const Text('اعتماد الدرجة', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  // كشف الدرجات للمعلم
  Widget gradesReportTab() {
    final lock = getTeacherLock();
    if (!Hive.isBoxOpen('grades')) return const Center(child: Text('جاري فتح السجل...'));
    final gradesBox = Hive.box('grades');
    final codesBox = Hive.isBoxOpen('codes') ? Hive.box('codes') : null;
    List<Map> all = [];
    for (var k in gradesBox.keys) {
      var g = gradesBox.get(k);
      if (g == null || g is! Map) continue;
      String sub = (g['subject'] ?? lock['subject']).toString().toUpperCase();
      if (widget.session.role == UserRole.teacher && !sub.contains(lock['subject']!)) continue;
      all.add(g);
    }
    Map<String, List<Map>> grouped = {};
    for (var g in all) {
      grouped.putIfAbsent(g['studentCode']?.toString() ?? '', () => []).add(g);
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFD5E2EE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'كشف الدرجات - ${getTeacherSubjectName()} - صف ${lock['grade']}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F)),
                ),
              ),
              ElevatedButton.icon(
                onPressed: () {
                  final stuList = getStudentsForTeacher();
                  if (stuList.isNotEmpty) {
                    correctHomeworkOpen(stuList.first);
                  } else {
                    correctHomeworkOpen({'name': 'حمزة نبيل الزريقي', 'code': 'STU-9-BENA-7301'});
                  }
                },
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E5AA8), foregroundColor: Colors.white),
                icon: const Icon(Icons.add, size: 16),
                label: const Text('تصحيح واجب جديد', style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.blue.shade50,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.lock, color: Colors.blue, size: 18),
                const SizedBox(width: 8),
                Text(
                  'قفل تخصصي: ${getTeacherSubjectName()} فقط - ${grouped.length} طلاب مرصود لهم',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (grouped.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24.0),
              child: Center(child: Text('لا توجد درجات بعد - ابدأ تصحيح واجبات الطلاب')),
            )
          else
            ListView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: grouped.entries.map((e) {
                String code = e.key;
                List<Map> list = e.value;
                int total = 0;
                for (var g in list) {
                  total += int.tryParse(g['score'].toString()) ?? 0;
                }
                double avg = list.isEmpty ? 0 : total / list.length;
                var sd = codesBox?.get(code);
                String name = (sd != null && sd is Map) ? (sd['name'] ?? list.first['studentName']) : (list.first['studentName'] ?? code);
                return Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
                  child: ExpansionTile(
                    leading: CircleAvatar(
                      backgroundColor: const Color(0xFF1E5AA8),
                      child: Text(name.isNotEmpty ? name.substring(0, 1) : 'ط', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                    title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: Text('$code - ${list.length} واجبات - المجموع: $total - المتوسط: ${avg.toStringAsFixed(1)}', style: const TextStyle(fontSize: 11)),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: avg >= 10 ? Colors.green : Colors.orange,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text('${avg.toStringAsFixed(1)}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
                    ),
                    children: list.map((g) {
                      return ListTile(
                        dense: true,
                        leading: const Icon(Icons.assignment_turned_in, size: 18, color: Colors.green),
                        title: Text('الدرجة: ${g['score']} / ${g['maxScore']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                        subtitle: Text('${g['note'] ?? ''} • ${g['date']?.toString().split(' ').first ?? ''}'),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red, size: 18),
                          onPressed: () {
                            final matchingKey = gradesBox.keys.firstWhere(
                              (k) => gradesBox.get(k) == g,
                              orElse: () => null,
                            );
                            if (matchingKey != null) {
                              gradesBox.delete(matchingKey);
                              setState(() {});
                            }
                          },
                        ),
                      );
                    }).toList(),
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _qTextController.dispose();
    for (var c in _optControllers) {
      c.dispose();
    }
    _feedbackController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0F4F8),
      appBar: AppBar(
        backgroundColor: const Color(0xFFB3CDE8),
        elevation: 0.5,
        title: Row(
          children: [
            Expanded(
              child: Column(
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
                    'أهلاً بك أ. ${widget.session.name} - معلم صف ${widget.session.grade} - مادة ${getTeacherSubjectName()}',
                    style: const TextStyle(
                      color: Color(0xFF1E5AA8),
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // جرس التعاميم - صوت + إشارة حمراء - لوحة المعلم (Fix 1)
            GestureDetector(
              onTap: () => setState(() => _activeTab = 3),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.notifications, size: 28, color: Colors.white),
                  if (unreadCircularsCount > 0)
                    Positioned(
                      top: 0,
                      right: 0,
                      child: AnimatedBuilder(
                        animation: _pulseAnimation,
                        builder: (context, child) => Transform.scale(
                          scale: _pulseAnimation.value,
                          child: Container(
                            width: 18,
                            height: 18,
                            decoration: BoxDecoration(
                              color: const Color(0xFFE53935),
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2),
                            ),
                            child: Center(
                              child: Text(
                                unreadCircularsCount.toString(),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ترحيب المعلم (Fix 4: بدون عبارة غرفتك المقفلة)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFD5E2EE)),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 18,
                    backgroundColor: Color(0xFFE3F2FD),
                    child: Icon(Icons.person, color: Color(0xFF1E5AA8), size: 20),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'أهلاً بك أ. ${widget.session.name} - معلم صف ${widget.session.grade} - مادة ${getTeacherSubjectName()}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1A3A5F),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // التبويبات الأربعة (مع شارة التعاميم الحمراء)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _tabButton('إنشاء سؤال', 0),
                  _tabButton('كشف درجات (الدفتر)', 1),
                  _tabButton('واجبات مصورة (${AppData.instance.submissions.length})', 2),
                  _tabButtonWithBadge('تعاميم الإدارة المدرسية ($unreadCircularsCount)', 3, unreadCircularsCount),
                ],
              ),
            ),
            const SizedBox(height: 16),

            if (_activeTab == 0) _buildCreateQuestionTab(),
            if (_activeTab == 1) gradesReportTab(),
            if (_activeTab == 2) _buildPhotoHomeworkTab(),
            if (_activeTab == 3) _buildCircularsTab(),
          ],
        ),
      ),
    );
  }

  Widget _tabButton(String title, int idx) {
    final active = _activeTab == idx;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = idx),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        margin: const EdgeInsets.symmetric(horizontal: 3),
        decoration: BoxDecoration(
          color: active ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: active
              ? Border.all(color: const Color(0xFF1E5AA8), width: 1.5)
              : Border.all(color: Colors.transparent),
        ),
        child: Text(
          title,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 11,
            fontWeight: active ? FontWeight.bold : FontWeight.normal,
            color: active ? const Color(0xFF1E5AA8) : Colors.grey.shade700,
          ),
        ),
      ),
    );
  }

  Widget _tabButtonWithBadge(String title, int idx, int count) {
    final active = _activeTab == idx;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = idx),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        margin: const EdgeInsets.symmetric(horizontal: 3),
        decoration: BoxDecoration(
          color: active ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: active
              ? Border.all(color: const Color(0xFF1E5AA8), width: 1.5)
              : Border.all(color: Colors.transparent),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                fontWeight: active ? FontWeight.bold : FontWeight.normal,
                color: active ? const Color(0xFF1E5AA8) : Colors.grey.shade700,
              ),
            ),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFFE53935),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  count.toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildCircularsTab() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFD5E2EE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.campaign, color: Color(0xFF1E5AA8), size: 22),
                  SizedBox(width: 8),
                  Text(
                    'تعاميم وتوجيهات الإدارة المدرسية',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A5F),
                    ),
                  ),
                ],
              ),
              ElevatedButton.icon(
                onPressed: () {
                  addNewCircular(
                    'تعميم عاجل: إرسال كشوفات درجات الشهر الأول',
                    'تهيب إدارة مدرسة النور بجميع المعلمين استكمال رصد درجات الطلاب قبل يوم الخميس القادم.',
                    'عاجل',
                  );
                },
                icon: const Icon(Icons.add_alert, size: 14),
                label: const Text('محاكاة تعميم جديد', style: TextStyle(fontSize: 11)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1E5AA8),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_circulars.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24.0),
              child: Center(child: Text('لا توجد تعاميم حالياً')),
            )
          else
            ..._circulars.map((c) {
              final bool isRead = c['isRead'] == true;
              return GestureDetector(
                onTap: () {
                  if (!isRead) {
                    setState(() {
                      c['isRead'] = true;
                    });
                  }
                },
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isRead ? Colors.white : const Color(0xFFE3F2FD),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isRead ? Colors.grey.shade200 : Colors.blue.shade300,
                      width: isRead ? 1 : 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.02),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              if (!isRead) ...[
                                Container(
                                  width: 10,
                                  height: 10,
                                  decoration: const BoxDecoration(
                                    color: Colors.blue,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 8),
                              ],
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: c['priority'] == 'عاجل'
                                      ? const Color(0xFFFDE8E8)
                                      : const Color(0xFFDEF7EC),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  c['priority'] ?? 'عادي',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    color: c['priority'] == 'عاجل'
                                        ? const Color(0xFF9B1C1C)
                                        : const Color(0xFF03543F),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          Text(
                            c['date'] ?? '',
                            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        c['title'] ?? '',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: isRead ? const Color(0xFF1A3A5F) : const Color(0xFF0D47A1),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        c['content'] ?? '',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade800, height: 1.4),
                      ),
                      if (!isRead)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Row(
                            children: [
                              Icon(Icons.touch_app, size: 14, color: Colors.blue.shade700),
                              const SizedBox(width: 4),
                              Text(
                                'اضغط هنا لتمييز التعميم كمقروء',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.blue.shade700,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }).toList(),
        ],
      ),
    );
  }

  Widget _buildCreateQuestionTab() {
    return Container(
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
            'إضافة سؤال جديد لبنك الأسئلة',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: Color(0xFF1A3A5F),
            ),
          ),
          const SizedBox(height: 12),
          // قفل الصف والمادة read-only (Fix 4: استبدال القوائم بحقلين مقفلين)
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blueGrey.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.lock, size: 16, color: Color(0xFF1E5AA8)),
                      const SizedBox(width: 6),
                      Text(
                        "الصف: ${widget.session.grade}",
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1A3A5F),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.blueGrey.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.lock, size: 16, color: Color(0xFF1E5AA8)),
                      const SizedBox(width: 6),
                      Text(
                        "المادة: ${getTeacherSubjectName()}",
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1A3A5F),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _qType,
                  decoration: const InputDecoration(labelText: 'نوع السؤال'),
                  items: const [
                    DropdownMenuItem(value: 'mcq', child: Text('موضوعي (اختيارات)')),
                    DropdownMenuItem(value: 'essay', child: Text('مقالي / مسألة')),
                  ],
                  onChanged: (v) => setState(() => _qType = v ?? 'mcq'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _qTextController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'نص السؤال',
              hintText: 'اكتب نص السؤال هنا بدقة...',
              border: OutlineInputBorder(),
            ),
          ),
          if (_qType == 'mcq') ...[
            const SizedBox(height: 12),
            const Text(
              'الخيارات الأربعة (حدد الخيار الصحيح):',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            ...List.generate(4, (i) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Radio<int>(
                      value: i,
                      groupValue: _correctOptIndex,
                      onChanged: (v) => setState(() => _correctOptIndex = v ?? 0),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _optControllers[i],
                        decoration: InputDecoration(
                          hintText: 'الخيار رقم ${i + 1}',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 8),
                          border: const OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          const SizedBox(height: 14),
          ElevatedButton(
            onPressed: () async {
              if (_qTextController.text.trim().isEmpty) return;

              // حفظ السؤال تلقائياً بمادة وصف المعلم (Fix 4)
              AppData.instance.questions.insert(
                0,
                QuestionItem(
                  id: 'q-${DateTime.now().millisecondsSinceEpoch}',
                  grade: widget.session.grade,
                  subject: getTeacherSubjectName(),
                  type: _qType,
                  questionText: _qTextController.text.trim(),
                  options: _qType == 'mcq'
                      ? _optControllers.map((c) => c.text.trim()).toList()
                      : null,
                  correctIndex: _qType == 'mcq' ? _correctOptIndex : null,
                  points: _points,
                  teacherName: widget.session.name,
                ),
              );

              await AppData.instance.saveQuestions();
              _qTextController.clear();
              for (var c in _optControllers) {
                c.clear();
              }
              setState(() {});

              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('✅ تم حفظ السؤال بنجاح في مادتك المقفلة!')),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E5AA8),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('حفظ السؤال في بنك الأسئلة'),
          ),
  }

  Widget _buildGradeSheetTab() {
    final gradeRows = [
      {'name': 'حمزة نبيل الزريقي', 'hw': '5/5', 'total': '95/100', 'pct': 95},
      {'name': 'ياسين أحمد المتوكل', 'hw': '5/5', 'total': '98/100', 'pct': 98},
      {'name': 'مروان عبدالرحمن', 'hw': '4/5', 'total': '88/100', 'pct': 88},
      {'name': 'سارة خالد الشرجبي', 'hw': '5/5', 'total': '96/100', 'pct': 96},
      {'name': 'عمر صخر اليماني', 'hw': '4/5', 'total': '76/100', 'pct': 76},
      {'name': 'بلال فؤاد الحداد', 'hw': '3/5', 'total': '58/100', 'pct': 58},
      {'name': 'هشام طاهر العبسي', 'hw': '2/5', 'total': '45/100', 'pct': 45},
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFD5E2EE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'كشف درجات الطلاب الأوتوماتيكي',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1A3A5F),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFE3F2FD),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'الصف ${widget.session.grade == "7" ? "السابع" : widget.session.grade == "8" ? "الثامن" : "التاسع"}',
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
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              columnSpacing: 8,
              horizontalMargin: 12,
              headingRowHeight: 40,
              dataRowMinHeight: 44,
              dataRowMaxHeight: 52,
              columns: const [
                DataColumn(label: Text('الطالب', style: TextStyle(fontWeight: FontWeight.bold))),
                DataColumn(label: Text('واجبات', style: TextStyle(fontWeight: FontWeight.bold))),
                DataColumn(label: Text('المجموع', style: TextStyle(fontWeight: FontWeight.bold))),
                DataColumn(label: Text('النسبة%', style: TextStyle(fontWeight: FontWeight.bold))),
                DataColumn(label: Text('التقدير', style: TextStyle(fontWeight: FontWeight.bold))),
              ],
              rows: gradeRows.map((row) {
                final pct = row['pct'] as int;
                return DataRow(
                  cells: [
                    DataCell(Text(row['name'] as String, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
                    DataCell(Text(row['hw'] as String, style: const TextStyle(fontSize: 12))),
                    DataCell(Text(row['total'] as String, style: const TextStyle(fontSize: 12))),
                    DataCell(Text('$pct%', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold))),
                    DataCell(_buildRatingBadge(pct)),
                  ],
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRatingBadge(int pct) {
    Color bg;
    Color textColor;
    String label;

    if (pct >= 95) {
      bg = const Color(0xFFD4EDDA);
      textColor = const Color(0xFF155724);
      label = 'ممتاز (أ)';
    } else if (pct >= 85) {
      bg = const Color(0xFFCCE5FF);
      textColor = const Color(0xFF004085);
      label = 'جيد جداً (ب)';
    } else if (pct >= 70) {
      bg = const Color(0xFFFFF3CD);
      textColor = const Color(0xFF856404);
      label = 'جيد (ج)';
    } else if (pct >= 50) {
      bg = const Color(0xFFFFE5D0);
      textColor = const Color(0xFF8A3C00);
      label = 'مقبول (د)';
    } else {
      bg = const Color(0xFFF8D7DA);
      textColor = const Color(0xFF721C24);
      label = 'ضعيف (هـ)';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 11,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget _buildPhotoHomeworkTab() {
    return Column(
      children: AppData.instance.submissions.map((sub) {
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
                  Text(
                    '${sub.studentName} (${sub.studentCode})',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: sub.status == 'تم التصحيح'
                          ? const Color(0xFFDEF7EC)
                          : const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      sub.status,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: sub.status == 'تم التصحيح'
                            ? const Color(0xFF03543F)
                            : const Color(0xFF92400E),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${sub.subject}: ${sub.title}',
                style: const TextStyle(fontSize: 12, color: Color(0xFF1A3A5F)),
              ),
              if (sub.photoUrl != null) ...[
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(
                    sub.photoUrl!,
                    height: 140,
                    width: double.infinity,
                    fit: BoxFit.cover,
                  ),
                ),
              ],
              if (sub.score != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Text('الدرجة المرصودة: ', style: TextStyle(fontSize: 12)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE3F2FD),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '${sub.score} / ${sub.maxScore}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1E5AA8),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 10),
              ElevatedButton.icon(
                onPressed: () => _openGradingDialog(sub),
                icon: const Icon(Icons.grade, size: 16),
                label: Text(sub.score != null ? 'تعديل الدرجة' : 'رصد الدرجة'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1E5AA8),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  // Fix G: Exact Grading input that accepts 1-5, hint '0', prevents > 5
  void _openGradingDialog(HomeworkSubmission sub) {
    final gradeCtrl = TextEditingController(text: sub.score?.toString() ?? '0');
    _feedbackController.text = sub.teacherFeedback ?? 'إجابة ممتازة وخطوات منظمة، أحسنت!';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('تصحيح واجب: ${sub.studentName}'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(sub.title, style: const TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 16),

              // Row with TextFormField (Fix G)
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('الدرجة المستحقة:',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  const SizedBox(width: 12),
                  SizedBox(
                    width: 80,
                    height: 52,
                    child: TextFormField(
                      controller: gradeCtrl,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(1),
                      ],
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Color(0xFF1E5AA8)),
                      decoration: InputDecoration(
                        hintText: '0',
                        filled: true,
                        fillColor: Colors.white,
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        suffixText: '/ 5',
                      ),
                      onTap: () {
                        if (gradeCtrl.text == '0') gradeCtrl.clear();
                      },
                      onChanged: (v) {
                        int? n = int.tryParse(v);
                        if (n != null && n > 5) {
                          gradeCtrl.text = '5';
                          gradeCtrl.selection = TextSelection.fromPosition(const TextPosition(offset: 1));
                        }
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),
              TextField(
                controller: _feedbackController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'ملاحظات المعلم للطالب',
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
          ElevatedButton(
            onPressed: () async {
              final score = int.tryParse(gradeCtrl.text) ?? 0;
              if (score == 0) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('اكتب الدرجة من 1 إلى 5')),
                );
                return;
              }
              sub.score = score;
              sub.status = 'تم التصحيح';
              sub.teacherFeedback = _feedbackController.text.trim();
              await AppData.instance.saveSubmissions();
              setState(() {});
              if (mounted) Navigator.pop(ctx);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E5AA8),
              foregroundColor: Colors.white,
            ),
            child: const Text('اعتماد الدرجة'),
          ),
        ],
      ),
    );
  }
}
