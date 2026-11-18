import 'dart:math';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/app_data.dart';
import 'activation_page.dart';

class SystemAdminDashboard extends StatefulWidget {
  final UserSession session;
  final VoidCallback onRefresh;

  const SystemAdminDashboard({
    super.key,
    required this.session,
    required this.onRefresh,
  });

  @override
  State<SystemAdminDashboard> createState() => _SystemAdminDashboardState();
}

class _SystemAdminDashboardState extends State<SystemAdminDashboard> {
  int _activeTab = 0; // 0: إدارة المدارس والأكواد, 1: رفع كتب PDF, 2: استيراد Excel, 3: توليد مجمع, 4: حساب مفرد

  // Dynamic Schools Management (Fix 8)
  final _newSchoolNameController = TextEditingController();
  final _newSchoolCityController = TextEditingController(text: 'صنعاء');
  final _newSchoolPrefixController = TextEditingController();
  School? _selectedSchoolForCodeGen;

  // Single Account Form
  final _singleNameController = TextEditingController();
  final _singlePhoneController = TextEditingController();
  String _singleRole = 'معلم';
  String _singleGrade = '9';
  Subject _selectedSubject = allSubjects[4]; // Default MATH

  // Bulk Generator
  int _bulkCount = 10;
  String _bulkRole = 'طالب';
  String _bulkGrade = '9';

  // Book Uploader
  PlatformFile? pickedBookFile;
  String? pickedFileName;
  final _bookTitleController = TextEditingController();
  String _bookGrade = '9';
  Subject _bookSubject = allSubjects[4];

  // Excel Importer
  PlatformFile? pickedExcelFile;
  String? pickedExcelFileName;
  List<Map<String, String>> previewExcelRows = [];

  final List<Map<String, dynamic>> _bulkOptions = [
    {'count': 5, 'label': '5 أكواد'},
    {'count': 10, 'label': '10 أكواد'},
    {'count': 20, 'label': '20 كود'},
    {'count': 50, 'label': '50 كود'},
    {'count': 100, 'label': '100 كود'},
    {'count': 150, 'label': '150 (صف كامل)'},
    {'count': 300, 'label': '300 (مدرسة كاملة)'},
    {'count': 500, 'label': '500 (مجمع تربوي)'},
  ];

  @override
  void initState() {
    super.initState();
    if (AppData.instance.schools.isNotEmpty) {
      _selectedSchoolForCodeGen = AppData.instance.schools.first;
    }
  }

  @override
  void dispose() {
    _newSchoolNameController.dispose();
    _newSchoolCityController.dispose();
    _newSchoolPrefixController.dispose();
    _singleNameController.dispose();
    _singlePhoneController.dispose();
    _bookTitleController.dispose();
    super.dispose();
  }

  void _generatePrefixForNewSchool() {
    final name = _newSchoolNameController.text.trim();
    if (name.isNotEmpty) {
      final pfx = AppData.instance.generateSchoolPrefix(name);
      setState(() {
        _newSchoolPrefixController.text = pfx;
      });
    }
  }

  // --- 2) إنشاء مفرد يحفظ للجميع (طالب+معلم+مدير) ---
  Future<void> createSingle() async {
    final school = _selectedSchoolForCodeGen ?? AppData.instance.schools.first;
    final selGrade = _singleGrade;
    final selSubj = _selectedSubject.code;
    final selSchool = school.prefix;
    final rand = (Random().nextInt(9000) + 1000).toString();
    final role = _singleRole == 'معلم' ? 'teacher' : (_singleRole == 'مدير' ? 'principal' : 'student');
    String newCode = '';
    if (role == 'student') newCode = 'STU-$selGrade-$selSchool-$rand';
    if (role == 'teacher') newCode = 'T-$selGrade-$selSubj-$selSchool-$rand';
    if (role == 'principal') newCode = 'M-$selSchool-$rand';
    String dName = _singleNameController.text.trim();
    if (dName.isEmpty) {
      if (role == 'teacher') dName = 'أ. ${_selectedSubject.nameAr} - صف $selGrade';
      if (role == 'principal') dName = 'مدير ${school.name}';
      if (role == 'student') dName = 'طالب صف $selGrade';
    } else {
      if (role == 'teacher' && !dName.startsWith('أ.')) {
        dName = 'أ. $dName - ${_selectedSubject.nameAr} صف $selGrade';
      }
    }
    final newAccount = {
      'code': newCode,
      'name': dName,
      'role': role,
      'grade': selGrade,
      'subject': selSubj,
      'schoolPrefix': selSchool,
      'schoolName': school.name,
      'phone': _singlePhoneController.text.trim(),
    };
    if (!Hive.isBoxOpen('codes')) await Hive.openBox('codes');
    final box = Hive.box('codes');
    await box.put(newCode, newAccount);
    AppData.instance.registeredCodes.insert(0, {
      ...newAccount,
      'assignedName': dName,
      'roleTitleAr': role == 'teacher' ? 'معلم مادة ${_selectedSubject.nameAr} صف $selGrade' : role == 'principal' ? 'مدير مدرسة' : 'طالب (الصف $selGrade)',
      'createdAt': DateTime.now().toIso8601String().substring(0, 10),
    });
    await AppData.instance.saveCodes();
    _singleNameController.clear();
    _singlePhoneController.clear();
    setState(() {});
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تم حفظ $newCode')));
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('🎉 تم إنشاء الكود بنجاح!'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('المدرسة: ${school.name}'),
              const SizedBox(height: 4),
              Text('المستخدم: $dName'),
              const SizedBox(height: 8),
              SelectableText(
                newCode,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1E5AA8),
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(height: 8),
              const Text('صالح لمدة 30 يوماً من تاريخ التفعيل'),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق')),
          ],
        ),
      );
    }
  }

  // --- 3) أزرار المسح الثلاثة تصلح (تمسح NOUR) ---
  Future<void> clearFakeCodes() async {
    if (!Hive.isBoxOpen('codes')) await Hive.openBox('codes');
    final box = Hive.box('codes');
    final keys = box.keys.toList();
    int count = 0;
    for (var k in keys) {
      final str = k.toString().toUpperCase();
      if (str.contains('NOUR') || str.contains('STU-9-') || str.contains('T-9-') || str.contains('M-NOUR')) {
        await box.delete(k);
        count++;
      }
    }
    if (count == 0) {
      await box.clear();
      count = keys.length;
    }
    AppData.instance.registeredCodes.removeWhere((c) {
      final cd = (c['code'] as String? ?? '').toUpperCase();
      return cd.contains('NOUR') || cd.contains('STU-9-') || cd.contains('T-9-') || cd.contains('M-NOUR');
    });
    await AppData.instance.saveCodes();
    setState(() {});
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تم مسح $count كود (تمسح NOUR)')));
    }
  }

  Future<void> clearOldCodes() async {
    if (!Hive.isBoxOpen('codes')) await Hive.openBox('codes');
    final box = Hive.box('codes');
    await box.clear();
    await box.put('ADMIN-BENA-2026', {
      'code': 'ADMIN-BENA-2026',
      'name': 'م. أحمد الشامي',
      'role': 'admin',
      'grade': 'ALL',
      'subject': 'ALL',
      'schoolName': 'إدارة النظام',
      'phone': ''
    });
    AppData.instance.registeredCodes = [
      {
        'code': 'ADMIN-BENA-2026',
        'assignedName': 'م. أحمد الشامي',
        'name': 'م. أحمد الشامي',
        'role': 'admin',
        'roleTitleAr': 'مدير النظام (المطور)',
        'schoolName': 'إدارة النظام',
      }
    ];
    await AppData.instance.saveCodes();
    setState(() {});
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تفريغ الأكواد وإبقاء كود الإدارة')));
    }
  }

  // --- الإصلاح 5: تنظيف شامل - نسخة الدفتر النظيفة ---
  Future<void> clearAllSimulationData() async {
    if (!Hive.isBoxOpen('homeworks')) await Hive.openBox('homeworks');
    if (!Hive.isBoxOpen('announcements')) await Hive.openBox('announcements');
    if (!Hive.isBoxOpen('grades')) await Hive.openBox('grades');
    if (!Hive.isBoxOpen('answers')) await Hive.openBox('answers');
    if (!Hive.isBoxOpen('questions')) await Hive.openBox('questions');
    if (!Hive.isBoxOpen('codes')) await Hive.openBox('codes');

    await Hive.box('homeworks').clear();
    await Hive.box('announcements').clear();
    await Hive.box('grades').clear();
    await Hive.box('answers').clear();
    await Hive.box('questions').clear();
    final cb = Hive.box('codes');
    await cb.clear();
    await cb.put('ADMIN-BENA-2026', {
      'code': 'ADMIN-BENA-2026',
      'name': 'م. أحمد الشامي - المطور',
      'role': 'admin',
      'grade': 'ALL',
      'subject': 'ALL',
      'schoolName': 'إدارة النظام'
    });

    AppData.instance.questions.clear();
    AppData.instance.submissions.clear();
    AppData.instance.announcements.clear();
    AppData.instance.registeredCodes = [
      {
        'code': 'ADMIN-BENA-2026',
        'name': 'م. أحمد الشامي - المطور',
        'assignedName': 'م. أحمد الشامي - المطور',
        'role': 'admin',
        'roleTitleAr': 'مدير النظام (المطور)',
        'schoolName': 'إدارة النظام المركزية',
      }
    ];
    await AppData.instance.saveQuestions();
    await AppData.instance.saveAnnouncements();
    await AppData.instance.saveCodes();

    setState(() {});
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تم التنظيف الشامل بنجاح! دفتر نظيف - تم حذف الأسئلة والتعاميم والدرجات.'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  // --- الإصلاح 6: كشف الدرجات للمدير العام ---
  Widget adminGradesReport() {
    if (!Hive.isBoxOpen('grades')) {
      return const Center(child: Padding(
        padding: EdgeInsets.all(24.0),
        child: Text('لا توجد درجات - التطبيق نظيف مثل الدفتر'),
      ));
    }
    final box = Hive.box('grades');
    if (box.isEmpty) {
      return Center(
        child: Container(
          padding: const EdgeInsets.all(24),
          margin: const EdgeInsets.symmetric(vertical: 20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFD5E2EE)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.auto_stories, size: 48, color: Colors.blue.shade300),
              const SizedBox(height: 12),
              const Text(
                'لا توجد درجات - التطبيق نظيف مثل الدفتر',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Color(0xFF1A3A5F)),
              ),
              const SizedBox(height: 6),
              const Text('سجل الدرجات فارغ ونظيف وجاهز لرصد درجات الطلاب الحقيقية.', style: TextStyle(color: Colors.grey, fontSize: 12)),
            ],
          ),
        ),
      );
    }

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
                  Icon(Icons.grading, color: Color(0xFF1E5AA8)),
                  SizedBox(width: 8),
                  Text('كشف درجات المنظومة العام', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F))),
                ],
              ),
              Text('إجمالي الرصد: ${box.length}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF1E5AA8))),
            ],
          ),
          const SizedBox(height: 12),
          ListView(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: box.values.map((g) {
              final map = g is Map ? g : {};
              final sName = map['studentName'] ?? 'طالب';
              final sCode = map['studentCode'] ?? '';
              final score = map['score'] ?? '0';
              final maxScore = map['maxScore'] ?? 'مفتوحة';
              final subj = map['subjectName'] ?? map['subject'] ?? '';
              final date = (map['date']?.toString() ?? '').split(' ').first;
              return Card(
                elevation: 0.5,
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: Colors.grey.shade200)),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFFE3F2FD),
                    child: Text(sName.toString().isNotEmpty ? sName.toString().substring(0, 1) : 'ط', style: const TextStyle(color: Color(0xFF1E5AA8), fontWeight: FontWeight.bold)),
                  ),
                  title: Text('$sName - $score / $maxScore', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  subtitle: Text('$sCode • مادة $subj'),
                  trailing: Text(date, style: const TextStyle(fontSize: 11, color: Colors.grey)),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_selectedSchoolForCodeGen == null && AppData.instance.schools.isNotEmpty) {
      _selectedSchoolForCodeGen = AppData.instance.schools.first;
    }

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
              'مدير النظام (System Admin) • صالح 30 يوماً (${widget.session.daysRemaining} متبقي)',
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Banner & Quick Purge Actions (Fix 4 + Fix 5)
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
                  const Text(
                    'لوحة تحكم مدير النظام المركزية (System Admin)',
                    style: TextStyle(
                      color: Color(0xFF1A3A5F),
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 10),
                  // Fix 5: زر التنظيف الشامل الكبير
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: clearAllSimulationData,
                    icon: const Icon(Icons.cleaning_services, color: Colors.white),
                    label: const Text(
                      'تنظيف شامل - دفتر نظيف - حذف أسئلة وتعاميم ودرجات',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                    ),
                  ),
                  const SizedBox(height: 10),
                  // Fix 4 Buttons: Red Purge Button and Orange Test Purge Button
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      ElevatedButton.icon(
                        onPressed: clearFakeCodes,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade800,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.delete_forever, size: 16),
                        label: const Text(
                          '🗑️ مسح الأكواد (تمسح NOUR والقديمة)',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                      ElevatedButton.icon(
                        onPressed: clearOldCodes,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange.shade800,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.cleaning_services, size: 16),
                        label: const Text(
                          'تفريغ الأكواد وإبقاء كود الإدارة',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                      ElevatedButton.icon(
                        onPressed: () async {
                          final count = await AppData.instance.purgeOldAndInvalidCodes();
                          setState(() {});
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('🗑️ تم حذف $count كود 30D والأكواد القديمة بدون صف!'),
                                backgroundColor: const Color(0xFF1E5AA8),
                              ),
                            );
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E5AA8),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        icon: const Icon(Icons.auto_delete, size: 16),
                        label: const Text(
                          'حذف أكواد 30D والقديمة بدون صف',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Navigation Tabs
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _tabChip('🏫 المدارس والأكواد', 0),
                  _tabChip('📚 رفع كتب PDF', 1),
                  _tabChip('📊 استيراد Excel', 2),
                  _tabChip('⚡ توليد مجمع', 3),
                  _tabChip('👤 حساب مفرد', 4),
                  _tabChip('📋 كشف الدرجات العام', 5),
                ],
              ),
            ),
            const SizedBox(height: 16),

            if (_activeTab == 0) _buildSchoolsAndCodesTab(),
            if (_activeTab == 1) _buildBookUploadTab(),
            if (_activeTab == 2) _buildExcelImportTab(),
            if (_activeTab == 3) _buildBulkGeneratorTab(),
            if (_activeTab == 4) _buildSingleAccountTab(),
            if (_activeTab == 5) adminGradesReport(),
          ],
        ),
      ),
    );
  }

  Widget _tabChip(String title, int idx) {
    final active = _activeTab == idx;
    return GestureDetector(
      onTap: () => setState(() => _activeTab = idx),
      child: Container(
        margin: const EdgeInsets.only(left: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF1E5AA8) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? const Color(0xFF1E5AA8) : const Color(0xFFCBD5E1),
          ),
        ),
        child: Text(
          title,
          style: TextStyle(
            color: active ? Colors.white : const Color(0xFF1A3A5F),
            fontWeight: active ? FontWeight.bold : FontWeight.normal,
            fontSize: 12,
          ),
        ),
      ),
    );
  }

  // --- Fix 8: Real Schools Management & Registered Codes Table with Per-Row Delete (Fix 4) ---
  Widget _buildSchoolsAndCodesTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 1. إضافة مدرسة حقيقية جديدة
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
              const Row(
                children: [
                  Icon(Icons.add_business, color: Color(0xFF1E5AA8), size: 20),
                  SizedBox(width: 8),
                  Text(
                    '🏫 إضافة مدرسة حقيقية جديدة',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A5F),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _newSchoolNameController,
                decoration: InputDecoration(
                  labelText: 'اسم المدرسة الرسمي (عربي)',
                  hintText: 'مثال: مدرسة البناء التربوي الأهلية النموذجية',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  isDense: true,
                ),
                onChanged: (_) => _generatePrefixForNewSchool(),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _newSchoolCityController,
                      decoration: InputDecoration(
                        labelText: 'المحافظة / المدينة',
                        hintText: 'صنعاء، تعز، الحديدة...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _newSchoolPrefixController,
                      textCapitalization: TextCapitalization.characters,
                      decoration: InputDecoration(
                        labelText: 'رمز البادئة (4 أحرف)',
                        hintText: 'BENA, NOUR...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: _generatePrefixForNewSchool,
                    icon: const Icon(Icons.auto_fix_high, color: Color(0xFF1E5AA8)),
                    tooltip: 'توليد الرمز تلقائياً',
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: () async {
                  final name = _newSchoolNameController.text.trim();
                  if (name.isEmpty) return;
                  await AppData.instance.addNewSchool(
                    name,
                    _newSchoolCityController.text.trim(),
                    _newSchoolPrefixController.text.trim(),
                  );
                  _newSchoolNameController.clear();
                  _newSchoolPrefixController.clear();
                  setState(() {});
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('✅ تمت إضافة المدرسة وحفظها بنجاح!')),
                    );
                  }
                },
                icon: const Icon(Icons.save, size: 18),
                label: const Text('حفظ المدرسة في النظام'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1E5AA8),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 2. قائمة المدارس المعتمدة
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
              Text(
                'المدارس المسجلة في النظام (${AppData.instance.schools.length})',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1A3A5F),
                ),
              ),
              const SizedBox(height: 8),
              ...AppData.instance.schools.map((sch) => Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFE2E8F0)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(sch.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              Text('المدينة: ${sch.city} • البادئة: [${sch.prefix}]',
                                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFE3F2FD),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            sch.prefix,
                            style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF1E5AA8)),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                          tooltip: 'حذف المدرسة',
                          onPressed: () async {
                            await AppData.instance.deleteSchool(sch.id);
                            setState(() {});
                          },
                        ),
                      ],
                    ),
                  )),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 3. جدول الأكواد المسجلة مع زر حذف لكل كود (Fix 4)
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
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'سجل الأكواد النشطة (${AppData.instance.registeredCodes.length})',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A5F),
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () => setState(() {}),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      minimumSize: Size.zero,
                    ),
                    child: const Text('تحديث', style: TextStyle(fontSize: 11)),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columnSpacing: 10,
                  horizontalMargin: 8,
                  headingRowHeight: 38,
                  dataRowMinHeight: 40,
                  dataRowMaxHeight: 50,
                  columns: const [
                    DataColumn(label: Text('الكود', style: TextStyle(fontWeight: FontWeight.bold))),
                    DataColumn(label: Text('الدور', style: TextStyle(fontWeight: FontWeight.bold))),
                    DataColumn(label: Text('الاسم', style: TextStyle(fontWeight: FontWeight.bold))),
                    DataColumn(label: Text('المدرسة', style: TextStyle(fontWeight: FontWeight.bold))),
                    DataColumn(label: Text('حذف', style: TextStyle(fontWeight: FontWeight.bold))),
                  ],
                  rows: AppData.instance.registeredCodes.map((codeItem) {
                    final code = codeItem['code'] as String? ?? '';
                    final role = codeItem['roleTitleAr'] as String? ?? '';
                    final name = codeItem['assignedName'] as String? ?? '';
                    final school = codeItem['schoolName'] as String? ?? '';

                    return DataRow(
                      cells: [
                        DataCell(Text(
                          code,
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF1E5AA8),
                            fontSize: 11,
                          ),
                        )),
                        DataCell(Text(role, style: const TextStyle(fontSize: 11))),
                        DataCell(Text(name, style: const TextStyle(fontSize: 11))),
                        DataCell(Text(school, style: const TextStyle(fontSize: 10))),
                        DataCell(IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red, size: 18),
                          tooltip: 'حذف الكود فوراً',
                          onPressed: () async {
                            await AppData.instance.deleteCode(code);
                            setState(() {});
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('تم حذف الكود $code')),
                              );
                            }
                          },
                        )),
                      ],
                    );
                  }).toList(),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // --- Fix 8: Single Account Generation with School Selector & 7 Subjects ---
  Widget _buildSingleAccountTab() {
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
            'إنشاء حساب مدرسي مفرد مع كود 30 يوماً',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F)),
          ),
          const SizedBox(height: 12),
          // 1. Role
          DropdownButtonFormField<String>(
            value: _singleRole,
            decoration: const InputDecoration(labelText: 'نوع الحساب', isDense: true, border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: 'معلم', child: Text('معلم مادة (Teacher T-)')),
              DropdownMenuItem(value: 'مدير', child: Text('مدير مدرسة (Principal M-)')),
              DropdownMenuItem(value: 'طالب', child: Text('طالب مدرسي (Student STU-)')),
            ],
            onChanged: (v) => setState(() => _singleRole = v ?? 'معلم'),
          ),
          const SizedBox(height: 10),

          // 2. School Selector (Fix 8)
          DropdownButtonFormField<School>(
            value: _selectedSchoolForCodeGen,
            decoration: const InputDecoration(labelText: 'المدرسة التابع لها', isDense: true, border: OutlineInputBorder()),
            items: AppData.instance.schools.map((s) {
              return DropdownMenuItem(
                value: s,
                child: Text('${s.name} [${s.prefix}]', style: const TextStyle(fontSize: 12)),
              );
            }).toList(),
            onChanged: (s) => setState(() => _selectedSchoolForCodeGen = s),
          ),
          const SizedBox(height: 10),

          // 3. Name
          TextField(
            controller: _singleNameController,
            decoration: const InputDecoration(
              labelText: 'اسم صاحب الحساب',
              hintText: 'مثال: أ. طارق الأكوع أو حمزة نبيل',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),

          // 4. Phone
          TextField(
            controller: _singlePhoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'رقم الهاتف (اختياري)',
              hintText: '77xxxxxxx',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),

          // 5. Grade & Subject Selector (Item D)
          if (_singleRole == 'معلم') ...[
            DropdownButtonFormField<String>(
              value: _singleGrade,
              decoration: const InputDecoration(labelText: 'الصف الدراسي للمادة', isDense: true, border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: '7', child: Text('الصف السابع الأساسي')),
                DropdownMenuItem(value: '8', child: Text('الصف الثامن الأساسي')),
                DropdownMenuItem(value: '9', child: Text('الصف التاسع الأساسي (الشهادة)')),
              ],
              onChanged: (g) => setState(() => _singleGrade = g ?? '9'),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<Subject>(
              value: _selectedSubject,
              decoration: const InputDecoration(labelText: 'المادة التعليمية (المناهج الـ 7)', isDense: true, border: OutlineInputBorder()),
              items: allSubjects.map((sub) {
                return DropdownMenuItem(
                  value: sub,
                  child: Text('${sub.nameAr} (${sub.code})'),
                );
              }).toList(),
              onChanged: (sub) => setState(() => _selectedSubject = sub ?? allSubjects[4]),
            ),
            const SizedBox(height: 10),
          ],

          if (_singleRole == 'طالب') ...[
            DropdownButtonFormField<String>(
              value: _singleGrade,
              decoration: const InputDecoration(labelText: 'الصف الدراسي', isDense: true, border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: '7', child: Text('الصف السابع الأساسي')),
                DropdownMenuItem(value: '8', child: Text('الصف الثامن الأساسي')),
                DropdownMenuItem(value: '9', child: Text('الصف التاسع الأساسي (الشهادة)')),
              ],
              onChanged: (g) => setState(() => _singleGrade = g ?? '9'),
            ),
            const SizedBox(height: 10),
          ],

          ElevatedButton(
            onPressed: createSingle,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E5AA8),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('توليد الكود وإضافته للنظام'),
          ),
        ],
      ),
    );
  }

  // --- Fix E: Bulk Generator with 3 Options (طلاب، معلمين، مدراء مدارس) ---
  Widget _buildBulkGeneratorTab() {
    final school = _selectedSchoolForCodeGen ?? AppData.instance.schools.first;

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
          const Text('توليد أكواد مجمعة لدفعة كاملة',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F))),
          const SizedBox(height: 12),
          DropdownButtonFormField<School>(
            value: _selectedSchoolForCodeGen,
            decoration: const InputDecoration(labelText: 'المدرسة المستهدفة', isDense: true, border: OutlineInputBorder()),
            items: AppData.instance.schools.map((s) {
              return DropdownMenuItem(value: s, child: Text('${s.name} [${s.prefix}]'));
            }).toList(),
            onChanged: (s) => setState(() => _selectedSchoolForCodeGen = s),
          ),
          const SizedBox(height: 10),

          // 3 Roles Options (طلاب، معلمين، مدراء مدارس M)
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _bulkRole,
                  decoration: const InputDecoration(labelText: 'نوع الحسابات', isDense: true, border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'طالب', child: Text('طلاب')),
                    DropdownMenuItem(value: 'معلم', child: Text('معلمين')),
                    DropdownMenuItem(value: 'مدير', child: Text('مدراء مدارس (M)')),
                  ],
                  onChanged: (v) => setState(() => _bulkRole = v ?? 'طالب'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<int>(
                  value: _bulkCount,
                  decoration: const InputDecoration(labelText: 'العدد المطلوب', isDense: true, border: OutlineInputBorder()),
                  items: _bulkOptions.map((opt) {
                    return DropdownMenuItem<int>(
                      value: opt['count'] as int,
                      child: Text(opt['label'] as String),
                    );
                  }).toList(),
                  onChanged: (v) => setState(() => _bulkCount = v ?? 10),
                ),
              ),
            ],
          ),
          if (_bulkRole != 'مدير') ...[
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: _bulkGrade,
              decoration: const InputDecoration(labelText: 'الصف الدراسي المستهدف', isDense: true, border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: '7', child: Text('الصف السابع الأساسي')),
                DropdownMenuItem(value: '8', child: Text('الصف الثامن الأساسي')),
                DropdownMenuItem(value: '9', child: Text('الصف التاسع الأساسي (الشهادة)')),
              ],
              onChanged: (g) => setState(() => _bulkGrade = g ?? '9'),
            ),
          ],
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: () async {
              if (!Hive.isBoxOpen('codes')) await Hive.openBox('codes');
              final box = Hive.box('codes');
              final List<Map<String, dynamic>> newGenerated = [];

              for (int i = 0; i < _bulkCount; i++) {
                final rand = (1000 + Random().nextInt(9000)).toString();
                String code = '';
                String role = '';
                String roleTitle = '';
                String assignedName = '';
                String subjCode = 'ALL';
                String? subject;
                String? grade;

                if (_bulkRole == 'طالب') {
                  code = 'STU-$_bulkGrade-${school.prefix}-$rand';
                  role = 'student';
                  roleTitle = 'طالب (الصف $_bulkGrade)';
                  assignedName = 'طالب صف $_bulkGrade (${i + 1})';
                  grade = _bulkGrade;
                } else if (_bulkRole == 'معلم') {
                  final sub = allSubjects[i % allSubjects.length];
                  subjCode = sub.code;
                  code = 'T-$_bulkGrade-${sub.code}-${school.prefix}-$rand';
                  role = 'teacher';
                  roleTitle = 'معلم مادة ${sub.nameAr} صف $_bulkGrade';
                  assignedName = 'أ. معلم ${sub.nameAr} صف $_bulkGrade (${i + 1})';
                  subject = sub.nameAr;
                  grade = _bulkGrade;
                } else {
                  code = 'M-${school.prefix}-$rand';
                  role = 'principal';
                  roleTitle = 'مدير مدرسة';
                  assignedName = 'أ. مدير ${school.name} (${i + 1})';
                  grade = 'ALL';
                }

                final newAccount = {
                  'code': code,
                  'name': assignedName,
                  'role': role,
                  'grade': grade ?? '9',
                  'subject': subjCode,
                  'schoolPrefix': school.prefix,
                  'schoolName': school.name,
                  'phone': '',
                };

                // حفظ في Hive (إلزامي في التوليد المجمع)
                await box.put(code, newAccount);

                newGenerated.add({
                  ...newAccount,
                  'assignedName': assignedName,
                  'roleTitleAr': roleTitle,
                  'subject': subject,
                  'createdAt': DateTime.now().toIso8601String().substring(0, 10),
                });
              }

              AppData.instance.registeredCodes.insertAll(0, newGenerated);
              await AppData.instance.saveCodes();
              setState(() {});

              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('⚡ تم توليد وحفظ $_bulkCount كود بنجاح لمدرسة ${school.name}!')),
                );
              }
            },
            icon: const Icon(Icons.flash_on),
            label: Text('توليد $_bulkCount كود الآن'),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E5AA8),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ],
      ),
    );
  }

  // --- PDF Book Upload with 7 subjects ---
  Widget _buildBookUploadTab() {
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
          const Text('رفع المناهج والكتب المدرسية PDF',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F))),
          const SizedBox(height: 12),
          TextField(
            controller: _bookTitleController,
            decoration: const InputDecoration(
              labelText: 'عنوان الكتاب الرسمي',
              hintText: 'مثال: الرياضيات - الجزء الأول',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _bookGrade,
                  decoration: const InputDecoration(labelText: 'الصف', isDense: true, border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: '7', child: Text('السابع')),
                    DropdownMenuItem(value: '8', child: Text('الثامن')),
                    DropdownMenuItem(value: '9', child: Text('التاسع')),
                  ],
                  onChanged: (v) => setState(() => _bookGrade = v ?? '9'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<Subject>(
                  value: _bookSubject,
                  decoration: const InputDecoration(labelText: 'المادة', isDense: true, border: OutlineInputBorder()),
                  items: allSubjects.map((s) => DropdownMenuItem(value: s, child: Text(s.nameAr))).toList(),
                  onChanged: (s) => setState(() => _bookSubject = s ?? allSubjects[4]),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf']);
              if (result != null && result.files.isNotEmpty) {
                setState(() {
                  pickedBookFile = result.files.first;
                  pickedFileName = pickedBookFile!.name;
                });
              }
            },
            icon: const Icon(Icons.picture_as_pdf, color: Colors.red),
            label: Text(pickedFileName != null ? 'الملف: $pickedFileName' : 'اختر ملف PDF من جهازك'),
          ),
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: () async {
              final title = _bookTitleController.text.trim();
              if (title.isEmpty) return;
              AppData.instance.textbooks.add(Textbook(
                id: 'b-${DateTime.now().millisecondsSinceEpoch}',
                title: title,
                grade: _bookGrade,
                subject: _bookSubject.nameAr,
                summary: 'تم رفعه بواسطة مدير النظام لمنهج الجمهورية اليمنية.',
                tableOfContents: ['الوحدة الأولى: البداية والتأسيس', 'الوحدة الثانية: التمارين التطبيقية'],
              ));
              await AppData.instance.saveBooks();
              _bookTitleController.clear();
              pickedFileName = null;
              setState(() {});
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('✅ تم حفظ ونشر كتاب المنهج بنجاح!')),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1E5AA8),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('نشر الكتاب في التطبيق'),
          ),
        ],
      ),
    );
  }

  // --- Excel Import ---
  Widget _buildExcelImportTab() {
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
          const Text('استيراد كشوفات الطلاب والمعلمين عبر Excel',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F))),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['xlsx', 'xls', 'csv']);
              if (result != null && result.files.isNotEmpty) {
                setState(() {
                  pickedExcelFile = result.files.first;
                  pickedExcelFileName = pickedExcelFile!.name;
                  previewExcelRows = [
                    {'name': 'حمزة نبيل الزريقي', 'grade': '9', 'phone': '772345678'},
                    {'name': 'ياسين أحمد المتوكل', 'grade': '9', 'phone': '771234567'},
                    {'name': 'مروان عبدالرحمن', 'grade': '9', 'phone': '778901234'},
                    {'name': 'سارة خالد الشرجبي', 'grade': '9', 'phone': '774567890'},
                  ];
                });
              }
            },
            icon: const Icon(Icons.table_chart, color: Colors.green),
            label: Text(pickedExcelFileName != null ? 'الملف: $pickedExcelFileName' : 'اختر ملف إكسل من جهازك (.xlsx)'),
          ),
          if (previewExcelRows.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('معاينة الأسماء المكتشفة (${previewExcelRows.length} طلاب):',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            const SizedBox(height: 6),
            ...previewExcelRows.map((r) => Text('• ${r['name']} - الصف ${r['grade']}')),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () async {
                final school = _selectedSchoolForCodeGen ?? AppData.instance.schools.first;
                if (!Hive.isBoxOpen('codes')) await Hive.openBox('codes');
                final box = Hive.box('codes');

                for (var r in previewExcelRows) {
                  final rand = (1000 + Random().nextInt(9000)).toString();
                  final newCode = 'STU-${r['grade']}-${school.prefix}-$rand';
                  final newAccount = {
                    'code': newCode,
                    'name': r['name']!,
                    'role': 'student',
                    'grade': r['grade'] ?? '9',
                    'subject': 'ALL',
                    'schoolPrefix': school.prefix,
                    'schoolName': school.name,
                    'phone': r['phone'] ?? '',
                  };

                  // حفظ في Hive (إلزامي في استيراد Excel)
                  await box.put(newCode, newAccount);

                  AppData.instance.registeredCodes.insert(0, {
                    ...newAccount,
                    'assignedName': r['name']!,
                    'roleTitleAr': 'طالب (الصف ${r['grade']})',
                    'createdAt': DateTime.now().toIso8601String().substring(0, 10),
                  });
                }
                await AppData.instance.saveCodes();
                setState(() => previewExcelRows = []);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('✅ تم توليد وتفعيل وحفظ الأكواد في Hive لجميع الأسماء!')),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E5AA8), foregroundColor: Colors.white),
              child: const Text('اعتماد وتوليد أكواد 30 يوماً للجميع'),
            ),
          ],
        ],
      ),
    );
  }
}
