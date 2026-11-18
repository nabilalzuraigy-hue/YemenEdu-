import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'services/app_data.dart';
import 'pages/activation_page.dart';
import 'pages/system_admin_dashboard.dart';
import 'pages/principal_dashboard.dart';
import 'pages/teacher_dashboard.dart';
import 'pages/student_dashboard.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Hive.openBox('codes');
  await Hive.openBox('homeworks');
  await Hive.openBox('announcements');
  await Hive.openBox('grades');
  await Hive.openBox('answers');
  await Hive.openBox('questions');
  await AppData.instance.init();
  runApp(const YemenEduApp());
}

class YemenEduApp extends StatelessWidget {
  const YemenEduApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'YemenEduApp - منصة التعليم اليمني',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        scaffoldBackgroundColor: const Color(0xFFF0F4F8),
        primaryColor: const Color(0xFF1E5AA8),
        textTheme: GoogleFonts.cairoTextTheme(Theme.of(context).textTheme),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1E5AA8),
          primary: const Color(0xFF1E5AA8),
        ),
      ),
      builder: (context, child) {
        return Directionality(
          textDirection: TextDirection.rtl,
          child: child!,
        );
      },
      home: const RootRouter(),
    );
  }
}

class RootRouter extends StatefulWidget {
  const RootRouter({super.key});

  @override
  State<RootRouter> createState() => _RootRouterState();
}

class _RootRouterState extends State<RootRouter> {
  @override
  Widget build(BuildContext context) {
    final session = AppData.instance.currentSession;

    // إذا لم يكن هناك جلسة مفعّلة، اعرض صفحة التفعيل مباشرة
    if (session == null) {
      return ActivationPage(
        onSuccess: () => setState(() {}),
      );
    }

    // الانتقال النظيف المعتمد بحسب دور المستخدم المسجل فقط
    switch (session.role) {
      case UserRole.admin:
        return SystemAdminDashboard(
          session: session,
          onRefresh: () => setState(() {}),
        );
      case UserRole.principal:
        return PrincipalDashboard(
          session: session,
        );
      case UserRole.teacher:
        return TeacherDashboard(
          session: session,
        );
      case UserRole.student:
      default:
        return StudentDashboard(
          session: session,
        );
    }
  }
}
