import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/app_data.dart';
import 'activation_page.dart';

class PrincipalDashboard extends StatefulWidget {
  final UserSession session;

  const PrincipalDashboard({super.key, required this.session});

  @override
  State<PrincipalDashboard> createState() => _PrincipalDashboardState();
}

class _PrincipalDashboardState extends State<PrincipalDashboard> {
  int _activeTab = 2; // 0: نشر تعاميم, 1: إجابات الطلاب, 2: التقارير والإحصائيات, 3: كشف الدرجات

  final _ancTitleController = TextEditingController();
  final _ancContentController = TextEditingController();
  String _ancTarget = 'all';
  String _ancPriority = 'عادي';
  final _commentController = TextEditingController();

  Future<void> _handleLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('user_session');
    AppData.instance.currentSession = null;
    if (mounted) {
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const ActivationPage()),
        (route) => false,
      );
    }
  }

  Widget _buildPrincipalGradesReport() {
    if (!Hive.isBoxOpen('grades')) {
      return const Center(child: Text('لا توجد درجات - التطبيق نظيف مثل الدفتر'));
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
              const Text('سجل درجات المدرسة نظيف وجاهز لرصد درجات الطلاب الحقيقية.', style: TextStyle(color: Colors.grey, fontSize: 12)),
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
                  Text('كشف درجات طلاب المدرسة', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1A3A5F))),
                ],
              ),
              Text('الإجمالي: ${box.length}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF1E5AA8))),
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
              'إدارة المدرسة (Principal M-) • صالح 30 يوماً (${widget.session.daysRemaining} متبقي)',
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
            onPressed: _handleLogout,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.small(
        backgroundColor: Colors.red,
        tooltip: 'تسجيل خروج تجريبي',
        onPressed: _handleLogout,
        child: const Icon(Icons.exit_to_app, color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Banner
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
                Text(
                  'مرحباً بك أستاذ ${widget.session.name}',
                  style: const TextStyle(
                    color: Color(0xFF1A3A5F),
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'لوحة إدارة المدرسة (Principal M-) • متابعة التعاميم وإجابات الطلاب والتقارير البيانية',
                  style: TextStyle(color: Color(0xFF1A3A5F), fontSize: 11),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Tabs
          Row(
            children: [
              _tabButton('نشر تعميم', 0),
              _tabButton('إجابات الطلاب', 1),
              _tabButton('الإحصائيات', 2),
              _tabButton('كشف الدرجات', 3),
            ],
          ),
          const SizedBox(height: 16),

          if (_activeTab == 0) _buildAnnouncementsTab(),
          if (_activeTab == 1) _buildStudentAnswersTab(),
          if (_activeTab == 2) PrincipalStatsTab(submissions: AppData.instance.submissions),
          if (_activeTab == 3) _buildPrincipalGradesReport(),
        ],
      ),
    ),
  );
}

  Widget _tabButton(String title, int idx) {
    final active = _activeTab == idx;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _activeTab = idx),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          margin: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(
            color: active ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            border: active
                ? Border.all(color: const Color(0xFF1E5AA8), width: 1.5)
                : null,
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
      ),
    );
  }

  Widget _buildAnnouncementsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
              const Text('نشر تعميم مدرسي جديد',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              TextField(
                controller: _ancTitleController,
                decoration: InputDecoration(
                  labelText: 'عنوان التعميم',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _ancContentController,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: 'نص وتفاصيل التعميم...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: () async {
                  if (_ancTitleController.text.isEmpty ||
                      _ancContentController.text.isEmpty) return;
                  AppData.instance.announcements.insert(
                    0,
                    Announcement(
                      id: 'a-${DateTime.now().millisecondsSinceEpoch}',
                      title: _ancTitleController.text,
                      content: _ancContentController.text,
                      target: _ancTarget,
                      priority: _ancPriority,
                      senderName: widget.session.name,
                      createdAt: 'الآن',
                    ),
                  );
                  await AppData.instance.saveAnnouncements();
                  _ancTitleController.clear();
                  _ancContentController.clear();
                  setState(() {});
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('📢 تم نشر التعميم الإداري بنجاح!')),
                    );
                  }
                },
                icon: const Icon(Icons.send),
                label: const Text('نشر التعميم المعتمد'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1E5AA8),
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStudentAnswersTab() {
    final gradeRows = [
      {'name': 'حمزة نبيل الزريقي', 'hw': '5/5', 'total': '95/100', 'pct': 95},
      {'name': 'ياسين أحمد المتوكل', 'hw': '5/5', 'total': '98/100', 'pct': 98},
      {'name': 'مروان عبدالرحمن', 'hw': '4/5', 'total': '88/100', 'pct': 88},
      {'name': 'سارة خالد الشرجبي', 'hw': '5/5', 'total': '96/100', 'pct': 96},
      {'name': 'عمر صخر اليماني', 'hw': '4/5', 'total': '76/100', 'pct': 76},
      {'name': 'بلال فؤاد الحداد', 'hw': '3/5', 'total': '58/100', 'pct': 58},
      {'name': 'هشام طاهر العبسي', 'hw': '2/5', 'total': '45/100', 'pct': 45},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // كشف درجات الطلاب الإجمالي للمدير (Fix 5)
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFD5E2EE)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'كشف درجات الطلاب العام - الصف التاسع الأساسي',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1A3A5F),
                ),
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columnSpacing: 8,
                  horizontalMargin: 12,
                  headingRowHeight: 40,
                  dataRowMinHeight: 42,
                  dataRowMaxHeight: 50,
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
        ),

        const Text(
          'تسليمات الطلاب الأخيرة وتعليق الإدارة:',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: Color(0xFF1A3A5F),
          ),
        ),
        const SizedBox(height: 8),

        ...AppData.instance.submissions.map((sub) => Container(
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
                  Text('${sub.studentName} (${sub.studentCode})',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  Text(sub.title, style: const TextStyle(fontSize: 12)),
                  if (sub.photoUrl != null) ...[
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(
                        sub.photoUrl!,
                        height: 120,
                        width: double.infinity,
                        fit: BoxFit.cover,
                      ),
                    ),
                  ],
                  if (sub.principalComment != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E5AA8).withOpacity(0.08),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '⭐ تعليق المدير: ${sub.principalComment}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xFF1A3A5F),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: () {
                      _commentController.text = sub.principalComment ?? '';
                      showDialog(
                        context: context,
                        builder: (_) => AlertDialog(
                          title: Text('تعليق المدير على ${sub.studentName}'),
                          content: TextField(
                            controller: _commentController,
                            maxLines: 3,
                            decoration: const InputDecoration(
                              hintText: 'اكتب كلمات تشجيعية وتوجيهية للطالب...',
                            ),
                          ),
                          actions: [
                            TextButton(
                                onPressed: () => Navigator.pop(context),
                                child: const Text('إلغاء')),
                            ElevatedButton(
                              onPressed: () async {
                                sub.principalComment = _commentController.text;
                                await AppData.instance.saveSubmissions();
                                setState(() {});
                                if (mounted) Navigator.pop(context);
                              },
                              child: const Text('حفظ التعليق'),
                            ),
                          ],
                        ),
                      );
                    },
                    icon: const Icon(Icons.comment, size: 16),
                    label: const Text('إضافة / تعديل تعليق المدير',
                        style: TextStyle(fontSize: 11)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1E5AA8),
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            )).toList(),
      ],
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
}

/// =======================================================================
/// Widget PrincipalStatsTab - كامل مع رسمين بيانيين و3 كروت وأداء المواد (Fix 3)
/// =======================================================================
class PrincipalStatsTab extends StatefulWidget {
  final List<HomeworkSubmission> submissions;

  const PrincipalStatsTab({super.key, required this.submissions});

  @override
  State<PrincipalStatsTab> createState() => _PrincipalStatsTabState();
}

class _PrincipalStatsTabState extends State<PrincipalStatsTab> {
  String _selectedGradeFilter = 'الكل'; // 'الكل' 'سابع' 'ثامن' 'تاسع'

  List<Map<String, dynamic>> _getSortedSubjects() {
    // نسب كل صف مع متوسط "الكل" (Fix 3)
    final Map<String, Map<String, int>> gradePercents = {
      'القرآن الكريم': {'الكل': 90, 'سابع': 92, 'ثامن': 90, 'تاسع': 88},
      'اللغة العربية': {'الكل': 85, 'سابع': 87, 'ثامن': 85, 'تاسع': 83},
      'التربية الإسلامية': {'الكل': 82, 'سابع': 84, 'ثامن': 82, 'تاسع': 80},
      'الرياضيات': {'الكل': 75, 'سابع': 78, 'ثامن': 75, 'تاسع': 72},
      'الاجتماعيات': {'الكل': 70, 'سابع': 72, 'ثامن': 70, 'تاسع': 68},
      'العلوم': {'الكل': 60, 'سابع': 62, 'ثامن': 60, 'تاسع': 58},
      'اللغة الانجليزية': {'الكل': 45, 'سابع': 48, 'ثامن': 45, 'تاسع': 42},
    };

    final allSubjects = [
      {"name": "القرآن الكريم", "percent": gradePercents['القرآن الكريم']![_selectedGradeFilter] ?? 90, "color": const Color(0xFF0F5D2F), "icon": "📖"},
      {"name": "التربية الإسلامية", "percent": gradePercents['التربية الإسلامية']![_selectedGradeFilter] ?? 82, "color": const Color(0xFF1A7A3A), "icon": "🕌"},
      {"name": "اللغة العربية", "percent": gradePercents['اللغة العربية']![_selectedGradeFilter] ?? 85, "color": const Color(0xFF2E7D32), "icon": "✒️"},
      {"name": "الرياضيات", "percent": gradePercents['الرياضيات']![_selectedGradeFilter] ?? 75, "color": const Color(0xFF1565C0), "icon": "🔢"},
      {"name": "اللغة الانجليزية", "percent": gradePercents['اللغة الانجليزية']![_selectedGradeFilter] ?? 45, "color": const Color(0xFFD32F2F), "icon": "🔤"},
      {"name": "العلوم", "percent": gradePercents['العلوم']![_selectedGradeFilter] ?? 60, "color": const Color(0xFF00838F), "icon": "🔬"},
      {"name": "الاجتماعيات", "percent": gradePercents['الاجتماعيات']![_selectedGradeFilter] ?? 70, "color": const Color(0xFF6A1B9A), "icon": "🌍"},
    ];

    // ترتيب تنازلي: قرآن 90% فوق
    allSubjects.sort((a, b) => (b['percent'] as int).compareTo(a['percent'] as int));
    return allSubjects;
  }

  @override
  Widget build(BuildContext context) {
    final totalSubmissions = widget.submissions.isNotEmpty ? widget.submissions.length + 312 : 344;
    final dailyRate = totalSubmissions ~/ 7;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 1. 3 كروت علوية أفقية (أبيض، borderRadius 18، أيقونة دائرية #B3CDE8)
        Row(
          children: [
            // كارت 1: إجمالي التسليمات
            Expanded(
              child: _buildTopMetricCard(
                title: 'إجمالي التسليمات',
                value: '$totalSubmissions',
                badgeText: '+12% عن الأسبوع الماضي',
                badgeColor: Colors.green.shade700,
                icon: Icons.assignment_turned_in,
              ),
            ),
            const SizedBox(width: 8),
            // كارت 2: المعدل اليومي
            Expanded(
              child: _buildTopMetricCard(
                title: 'المعدل اليومي',
                value: '$dailyRate',
                badgeText: 'تسليم / يوم',
                badgeColor: const Color(0xFF1E5AA8),
                icon: Icons.calendar_month,
              ),
            ),
            const SizedBox(width: 8),
            // كارت 3: أعلى يوم
            Expanded(
              child: _buildTopMetricCard(
                title: 'أعلى يوم',
                value: 'الأربعاء 89',
                badgeText: 'ذروة التسليمات',
                badgeColor: const Color(0xFF3B82C4),
                icon: Icons.trending_up,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // 2. الرسم البياني الأول - منحنى خطي "عدد تسليمات الواجب المنزلي" (Container أبيض radius 24)
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFFD5E2EE)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.03),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.show_chart, color: Color(0xFF3B82C4), size: 22),
                      SizedBox(width: 6),
                      Text(
                        'عدد تسليمات الواجب المنزلي',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1A3A5F),
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFB3CDE8).withOpacity(0.4),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'أسبوعي',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1A3A5F),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // LineChart من fl_chart
              SizedBox(
                height: 180,
                child: LineChart(
                  LineChartData(
                    minX: 0,
                    maxX: 6,
                    minY: 0,
                    maxY: 100,
                    gridData: FlGridData(
                      show: true,
                      drawVerticalLine: false,
                      horizontalInterval: 20,
                      getDrawingHorizontalLine: (value) => FlLine(
                        color: const Color(0xFFE2E8F0),
                        strokeWidth: 1,
                        dashArray: value == 0 ? null : [4, 4],
                      ),
                    ),
                    titlesData: FlTitlesData(
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      leftTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          interval: 20,
                          reservedSize: 30,
                          getTitlesWidget: (value, meta) {
                            if (value > 80) return const SizedBox.shrink();
                            return Text(
                              '${value.toInt()}',
                              style: const TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            );
                          },
                        ),
                      ),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          interval: 1,
                          reservedSize: 26,
                          getTitlesWidget: (value, meta) {
                            const days = [
                              'السبت',
                              'الأحد',
                              'الاثنين',
                              'الثلاثاء',
                              'الأربعاء',
                              'الخميس',
                              'الجمعة',
                            ];
                            final index = value.toInt();
                            if (index >= 0 && index < days.length) {
                              return Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  days[index],
                                  style: const TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              );
                            }
                            return const SizedBox.shrink();
                          },
                        ),
                      ),
                    ),
                    borderData: FlBorderData(show: false),
                    lineBarsData: [
                      LineChartBarData(
                        spots: const [
                          FlSpot(0, 32),
                          FlSpot(1, 32),
                          FlSpot(2, 46),
                          FlSpot(3, 60),
                          FlSpot(4, 89),
                          FlSpot(5, 53),
                          FlSpot(6, 32),
                        ],
                        isCurved: true,
                        curveSmoothness: 0.35,
                        color: const Color(0xFF3B82C4),
                        barWidth: 3,
                        dotData: FlDotData(
                          show: true,
                          getDotPainter: (spot, percent, barData, index) {
                            return FlDotCirclePainter(
                              radius: 4.5,
                              color: Colors.white,
                              strokeWidth: 2.5,
                              strokeColor: const Color(0xFF3B82C4),
                            );
                          },
                        ),
                        belowBarData: BarAreaData(
                          show: true,
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              const Color(0xFF3B82C4).withOpacity(0.40),
                              const Color(0xFF3B82C4).withOpacity(0.0),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 3. الرسم البياني الثاني - "أداء المواد الدراسية" الـ 7 كاملة (Fix 3)
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: const Color(0xFFD5E2EE)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.03),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'أداء المواد الدراسية',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1A3A5F),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFB3CDE8).withOpacity(0.4),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'معدل إنجاز الفصول',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF1E5AA8),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // FilterChip: "الكل" "سابع" "ثامن" "تاسع" (Fix 3)
              Row(
                children: ['الكل', 'سابع', 'ثامن', 'تاسع'].map((grade) {
                  final isSelected = _selectedGradeFilter == grade;
                  return Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: FilterChip(
                      label: Text(grade),
                      selected: isSelected,
                      onSelected: (val) {
                        setState(() {
                          _selectedGradeFilter = grade;
                        });
                      },
                      selectedColor: const Color(0xFF1E5AA8),
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : const Color(0xFF1A3A5F),
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                      backgroundColor: const Color(0xFFF0F4F8),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),

              // 7 مواد: Row(icon + name + Spacer + percent%) + LinearProgressIndicator(height:12, borderRadius:10)
              ..._getSortedSubjects().map((sub) {
                final String name = sub['name'];
                final int pct = sub['percent'];
                final Color color = sub['color'];
                final String icon = sub['icon'];

                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Text(icon, style: const TextStyle(fontSize: 16)),
                          const SizedBox(width: 8),
                          Text(
                            name,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF1A3A5F),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            '$pct%',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: color,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: LinearProgressIndicator(
                          value: pct / 100.0,
                          minHeight: 12,
                          backgroundColor: const Color(0xFFE0EAF5),
                          valueColor: AlwaysStoppedAnimation<Color>(color),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // 4. في الأسفل جملة: "تحديث: اليوم 17:30 - زيادة 12% مقارنة بالأسبوع الماضي" مع سهم أخضر
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFD5E2EE)),
          ),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: const BoxDecoration(
                  color: Color(0xFFE8F5E9),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.arrow_upward,
                  color: Color(0xFF2E7D32),
                  size: 15,
                ),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'تحديث: اليوم 17:30 - زيادة 12% مقارنة بالأسبوع الماضي',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF2E7D32),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // كارت علوي
  Widget _buildTopMetricCard({
    required String title,
    required String value,
    required String badgeText,
    required Color badgeColor,
    required IconData icon,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFD5E2EE)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.02),
            blurRadius: 8,
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
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 11, color: Colors.grey, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                width: 32,
                height: 32,
                decoration: const BoxDecoration(
                  color: Color(0xFFB3CDE8),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: const Color(0xFF1E5AA8), size: 16),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Color(0xFF1A3A5F),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            badgeText,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: badgeColor,
            ),
          ),
        ],
      ),
    );
  }

  // صف أداء المادة: اسم المادة يمين + شريط في الوسط (خلفية #E0EAF5 ولون #3B82C4) + النسبة يسار
  Widget _buildSubjectRow(String subjectName, double progress, String percentageText) {
    return Row(
      children: [
        // اسم المادة يمين
        SizedBox(
          width: 85,
          child: Text(
            subjectName,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Color(0xFF1A3A5F),
            ),
          ),
        ),
        // شريط في الوسط
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 10,
              backgroundColor: const Color(0xFFE0EAF5),
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF3B82C4)),
            ),
          ),
        ),
        const SizedBox(width: 12),
        // النسبة يسار
        SizedBox(
          width: 36,
          child: Text(
            percentageText,
            textAlign: TextAlign.left,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: Color(0xFF3B82C4),
            ),
          ),
        ),
      ],
    );
  }
}
