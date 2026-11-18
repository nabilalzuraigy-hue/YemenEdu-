import 'package:flutter/material.dart';
import '../services/app_data.dart';
import 'system_admin_dashboard.dart';
import 'principal_dashboard.dart';
import 'teacher_dashboard.dart';
import 'student_dashboard.dart';

class ActivationPage extends StatefulWidget {
  final VoidCallback? onSuccess;

  const ActivationPage({super.key, this.onSuccess});

  @override
  State<ActivationPage> createState() => _ActivationPageState();
}

class _ActivationPageState extends State<ActivationPage> {
  final TextEditingController _codeController = TextEditingController();
  bool _isLoading = false;
  bool _hasError = false;
  String? _successMessage;

  @override
  void initState() {
    super.initState();
    _codeController.addListener(() {
      setState(() {
        if (_hasError) _hasError = false;
      });
    });
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _activate() async {
    final code = _codeController.text.trim();
    if (code.length < 10) return;

    setState(() {
      _isLoading = true;
      _hasError = false;
      _successMessage = null;
    });

    final res = await AppData.instance.activateCode(code);
    setState(() => _isLoading = false);

    if (res['success'] == true) {
      final session = AppData.instance.currentSession;
      final schoolName = session?.schoolName ?? 'مدرسة البناء التربوي';
      setState(() {
        _successMessage = 'مرحباً بك في $schoolName - صالح 30 يوم';
      });

      await Future.delayed(const Duration(milliseconds: 700));

      if (session != null && mounted) {
        Widget targetPage;
        switch (session.role) {
          case UserRole.admin:
            targetPage = SystemAdminDashboard(
              session: session,
              onRefresh: () {},
            );
            break;
          case UserRole.principal:
            targetPage = PrincipalDashboard(session: session);
            break;
          case UserRole.teacher:
            targetPage = TeacherDashboard(session: session);
            break;
          case UserRole.student:
          default:
            targetPage = StudentDashboard(session: session);
            break;
        }

        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => targetPage),
          (route) => false,
        );
      }
      widget.onSuccess?.call();
    } else {
      setState(() {
        _hasError = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentCode = _codeController.text.trim();
    final isButtonEnabled = currentCode.length >= 6 && !_isLoading;

    return Scaffold(
      backgroundColor: const Color(0xFFF0F4F8),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // هيدر أزرق سماوي #B3CDE8 مع أيقونة #1E5AA8 بحجم 60 ونص #1A3A5F
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFB3CDE8),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: const Color(0xFF9BBEDF)),
                  ),
                  child: Column(
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.08),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.school,
                          color: Color(0xFF1E5AA8),
                          size: 60,
                        ),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'وزارة التربية والتعليم',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1A3A5F),
                          fontFamily: 'Cairo',
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'منصة التعليم الرقمية',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1A3A5F),
                          fontFamily: 'Cairo',
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),

                // كارت التفعيل النظيف (radius 16)
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.04),
                        blurRadius: 16,
                        offset: const Offset(0, 6),
                      ),
                    ],
                    border: Border.all(color: const Color(0xFFD5E2EE)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'أدخل كود التفعيل:',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1A3A5F),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _codeController,
                        textCapitalization: TextCapitalization.characters,
                        textAlign: TextAlign.center,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(
                          fontSize: 17,
                          letterSpacing: 1.5,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF1A3A5F),
                        ),
                        decoration: InputDecoration(
                          labelText: 'رمز التفعيل',
                          hintText: 'STU-9-NOUR-1234',
                          prefixIcon: const Icon(Icons.vpn_key, color: Color(0xFF1E5AA8)),
                          filled: true,
                          fillColor: const Color(0xFFF8FAFC),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide:
                                const BorderSide(color: Color(0xFFCBD5E1)),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: const BorderSide(
                                color: Color(0xFF1E5AA8), width: 2),
                          ),
                        ),
                        onChanged: (value) {
                          final upper = value.toUpperCase();
                          if (value != upper) {
                            _codeController.value = TextEditingValue(
                              text: upper,
                              selection: TextSelection.collapsed(offset: upper.length),
                            );
                          }
                          setState(() {
                            _hasError = false;
                          });
                        },
                      ),
                      const SizedBox(height: 14),

                      // رسالة الخطأ المقتضبة الصريحة فقط
                      if (_hasError)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 12),
                          child: Text(
                            'الكود غير صحيح',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.red,
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                        ),

                      // رسالة النجاح الترحيبية
                      if (_successMessage != null)
                        Container(
                          padding: const EdgeInsets.all(10),
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFDEF7EC),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFFB4E6CF)),
                          ),
                          child: Text(
                            _successMessage!,
                            style: const TextStyle(
                              color: Color(0xFF03543F),
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),

                      // زر التفعيل: معطل إذا كان طول الكود < 10
                      ElevatedButton(
                        onPressed: isButtonEnabled ? () => _activate() : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E5AA8),
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: Colors.grey.shade300,
                          disabledForegroundColor: Colors.grey.shade500,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: isButtonEnabled ? 2 : 0,
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text(
                                'تفعيل الحساب',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                      ),
                      const SizedBox(height: 18),

                      // جملة: تواصل مع إدارة المدرسة للحصول على كودك
                      Container(
                        padding: const EdgeInsets.symmetric(
                            vertical: 12, horizontal: 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFFB3CDE8).withOpacity(0.35),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFB3CDE8)),
                        ),
                        child: const Text(
                          '📢 تواصل مع إدارة المدرسة للحصول على كودك',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF1A3A5F),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
