import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum UserRole { admin, principal, teacher, student }

class UserSession {
  final String code;
  final String name;
  final UserRole role;
  final String roleTitleAr;
  final DateTime activatedAt;
  final DateTime expiresAt;
  final int daysRemaining;
  final bool isTest;
  final String grade; // '7', '8', '9'
  final String subject;
  final String phone;
  final String schoolName;

  UserSession({
    required this.code,
    required this.name,
    required this.role,
    required this.roleTitleAr,
    required this.activatedAt,
    required this.expiresAt,
    required this.daysRemaining,
    this.isTest = false,
    this.grade = '9',
    this.subject = 'الرياضيات',
    this.phone = '77xxxxxxx',
    this.schoolName = 'مدرسة البناء التربوي الأهلية النموذجية',
  });

  Map<String, dynamic> toMap() => {
        'code': code,
        'name': name,
        'role': role.name,
        'roleTitleAr': roleTitleAr,
        'activatedAt': activatedAt.toIso8601String(),
        'expiresAt': expiresAt.toIso8601String(),
        'daysRemaining': daysRemaining,
        'isTest': isTest,
        'grade': grade,
        'subject': subject,
        'phone': phone,
        'schoolName': schoolName,
      };

  factory UserSession.fromMap(Map<String, dynamic> map) {
    final exp = DateTime.parse(map['expiresAt']);
    final now = DateTime.now();
    final days = exp.difference(now).inDays + (exp.isAfter(now) ? 1 : 0);
    return UserSession(
      code: map['code'] ?? '',
      name: map['name'] ?? '',
      role: UserRole.values.firstWhere(
        (e) => e.name == map['role'],
        orElse: () => UserRole.student,
      ),
      roleTitleAr: map['roleTitleAr'] ?? '',
      activatedAt: DateTime.parse(map['activatedAt']),
      expiresAt: exp,
      daysRemaining: days > 0 ? days : 0,
      isTest: map['isTest'] ?? false,
      grade: map['grade'] ?? '9',
      subject: map['subject'] ?? 'الرياضيات',
      phone: map['phone'] ?? '',
      schoolName: map['schoolName'] ?? 'مدرسة البناء التربوي الأهلية النموذجية',
    );
  }
}

/// Dynamic School Model for Yemen Schools System
class School {
  final String id;
  final String name;
  final String prefix; // e.g. BENA, NEHD, NOUR, RWAD, YEMN
  final String city;
  final bool isActive;

  School({
    required this.id,
    required this.name,
    required this.prefix,
    required this.city,
    this.isActive = true,
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'prefix': prefix,
        'city': city,
        'isActive': isActive,
      };

  factory School.fromMap(Map<String, dynamic> m) => School(
        id: m['id'] ?? '',
        name: m['name'] ?? '',
        prefix: m['prefix'] ?? 'BENA',
        city: m['city'] ?? 'صنعاء',
        isActive: m['isActive'] ?? true,
      );
}

/// 7 Official Yemeni Curriculum Subjects (Grades 7, 8, 9)
class Subject {
  final String code;
  final String nameAr;
  final String iconName;

  const Subject({
    required this.code,
    required this.nameAr,
    required this.iconName,
  });
}

const List<Subject> allSubjects = [
  Subject(code: 'QUR', nameAr: 'القرآن الكريم', iconName: 'menu_book'),
  Subject(code: 'ISL', nameAr: 'التربية الإسلامية', iconName: 'auto_stories'),
  Subject(code: 'ARB', nameAr: 'اللغة العربية', iconName: 'edit_note'),
  Subject(code: 'ENG', nameAr: 'اللغة الإنجليزية', iconName: 'language'),
  Subject(code: 'MATH', nameAr: 'الرياضيات', iconName: 'calculate'),
  Subject(code: 'SCI', nameAr: 'العلوم', iconName: 'science'),
  Subject(code: 'SOC', nameAr: 'الاجتماعيات', iconName: 'public'),
];

List<Subject> getSubjectsForGrade(String grade) {
  // Always return all 7 subjects for grades 7, 8, and 9!
  return allSubjects;
}

class Textbook {
  final String id;
  final String title;
  final String grade; // '7', '8', '9'
  final String subject;
  final String part;
  final int pagesCount;
  final double fileSizeMb;
  final String summary;
  final List<String> tableOfContents;

  Textbook({
    required this.id,
    required this.title,
    required this.grade,
    required this.subject,
    this.part = 'كامل',
    this.pagesCount = 200,
    this.fileSizeMb = 14.5,
    required this.summary,
    required this.tableOfContents,
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'title': title,
        'grade': grade,
        'subject': subject,
        'part': part,
        'pagesCount': pagesCount,
        'fileSizeMb': fileSizeMb,
        'summary': summary,
        'tableOfContents': tableOfContents,
      };

  factory Textbook.fromMap(Map<String, dynamic> m) => Textbook(
        id: m['id'],
        title: m['title'],
        grade: m['grade'],
        subject: m['subject'],
        part: m['part'] ?? 'كامل',
        pagesCount: m['pagesCount'] ?? 180,
        fileSizeMb: (m['fileSizeMb'] as num?)?.toDouble() ?? 12.0,
        summary: m['summary'] ?? '',
        tableOfContents: List<String>.from(m['tableOfContents'] ?? []),
      );
}

class Announcement {
  final String id;
  final String title;
  final String content;
  final String target; // 'all', 'teachers', 'students'
  final String priority; // 'عاجل', 'هام', 'عادي'
  final String senderName;
  final String createdAt;
  bool isRead;

  Announcement({
    required this.id,
    required this.title,
    required this.content,
    required this.target,
    this.priority = 'عادي',
    required this.senderName,
    required this.createdAt,
    this.isRead = false,
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'title': title,
        'content': content,
        'target': target,
        'priority': priority,
        'senderName': senderName,
        'createdAt': createdAt,
        'isRead': isRead,
      };

  factory Announcement.fromMap(Map<String, dynamic> m) => Announcement(
        id: m['id'],
        title: m['title'],
        content: m['content'],
        target: m['target'],
        priority: m['priority'] ?? 'عادي',
        senderName: m['senderName'] ?? '',
        createdAt: m['createdAt'] ?? '',
        isRead: m['isRead'] ?? false,
      );
}

class QuestionItem {
  final String id;
  final String grade;
  final String subject;
  final String type; // 'mcq', 'essay'
  final String questionText;
  final List<String>? options;
  final int? correctIndex;
  final String? modelAnswer;
  final int points;
  final String teacherName;

  QuestionItem({
    required this.id,
    required this.grade,
    required this.subject,
    required this.type,
    required this.questionText,
    this.options,
    this.correctIndex,
    this.modelAnswer,
    required this.points,
    required this.teacherName,
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'grade': grade,
        'subject': subject,
        'type': type,
        'questionText': questionText,
        'options': options,
        'correctIndex': correctIndex,
        'modelAnswer': modelAnswer,
        'points': points,
        'teacherName': teacherName,
      };

  factory QuestionItem.fromMap(Map<String, dynamic> m) => QuestionItem(
        id: m['id'],
        grade: m['grade'],
        subject: m['subject'],
        type: m['type'],
        questionText: m['questionText'],
        options: m['options'] != null ? List<String>.from(m['options']) : null,
        correctIndex: m['correctIndex'],
        modelAnswer: m['modelAnswer'],
        points: m['points'] ?? 5,
        teacherName: m['teacherName'] ?? '',
      );
}

class HomeworkSubmission {
  final String id;
  final String studentCode;
  final String studentName;
  final String grade;
  final String subject;
  final String title;
  final String? photoUrl;
  final String? studentNotes;
  int? score;
  final int maxScore;
  String status;
  bool isLocked;
  String? gradedAt;
  String? gradedBy;
  String? teacherFeedback;
  String? principalComment;
  final String submittedAt;

  HomeworkSubmission({
    required this.id,
    required this.studentCode,
    required this.studentName,
    required this.grade,
    required this.subject,
    required this.title,
    this.photoUrl,
    this.studentNotes,
    this.score,
    this.maxScore = 5,
    this.status = 'بانتظار المراجعة',
    this.isLocked = false,
    this.gradedAt,
    this.gradedBy,
    this.teacherFeedback,
    this.principalComment,
    required this.submittedAt,
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'studentCode': studentCode,
        'studentName': studentName,
        'grade': grade,
        'subject': subject,
        'title': title,
        'photoUrl': photoUrl,
        'studentNotes': studentNotes,
        'score': score,
        'maxScore': maxScore,
        'status': status,
        'isLocked': isLocked,
        'gradedAt': gradedAt,
        'gradedBy': gradedBy,
        'teacherFeedback': teacherFeedback,
        'principalComment': principalComment,
        'submittedAt': submittedAt,
      };

  factory HomeworkSubmission.fromMap(Map<String, dynamic> m) =>
      HomeworkSubmission(
        id: m['id'],
        studentCode: m['studentCode'],
        studentName: m['studentName'],
        grade: m['grade'] ?? '9',
        subject: m['subject'],
        title: m['title'],
        photoUrl: m['photoUrl'],
        studentNotes: m['studentNotes'],
        score: m['score'],
        maxScore: m['maxScore'] ?? 5,
        status: m['status'] ?? 'بانتظار المراجعة',
        isLocked: m['isLocked'] ?? false,
        gradedAt: m['gradedAt'],
        gradedBy: m['gradedBy'],
        teacherFeedback: m['teacherFeedback'],
        principalComment: m['principalComment'],
        submittedAt: m['submittedAt'] ?? '',
      );
}

class AppData {
  static final AppData instance = AppData._internal();
  AppData._internal();

  static const String keySession = 'yemen_edu_session_pref';
  static const String keyCodes = 'yemen_edu_codes_pref';
  static const String keyBooks = 'yemen_edu_books_pref';
  static const String keyAnc = 'yemen_edu_anc_pref';
  static const String keyQuestions = 'yemen_edu_questions_pref';
  static const String keySubs = 'yemen_edu_subs_pref';
  static const String keySchools = 'yemen_edu_schools_pref';

  UserSession? currentSession;
  List<Map<String, dynamic>> registeredCodes = [];
  List<School> schools = [];
  List<Textbook> textbooks = [];
  List<Announcement> announcements = [];
  List<QuestionItem> questions = [];
  List<HomeworkSubmission> submissions = [];

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();

    // 1. Load Schools or Seed
    final schoolsStr = prefs.getString(keySchools);
    if (schoolsStr != null) {
      try {
        final list = jsonDecode(schoolsStr) as List;
        schools = list.map((e) => School.fromMap(e)).toList();
      } catch (_) {
        schools = _seedSchools();
      }
    } else {
      schools = _seedSchools();
      await saveSchools();
    }

    // 2. Load Session
    final sessionStr = prefs.getString(keySession);
    if (sessionStr != null) {
      try {
        final sessionMap = jsonDecode(sessionStr);
        final sess = UserSession.fromMap(sessionMap);
        if (sess.daysRemaining > 0) {
          currentSession = sess;
        } else {
          await prefs.remove(keySession);
        }
      } catch (_) {}
    }

    // 3. Load Codes or Seed
    final codesStr = prefs.getString(keyCodes);
    if (codesStr != null) {
      try {
        final list = jsonDecode(codesStr) as List;
        registeredCodes = List<Map<String, dynamic>>.from(list);
      } catch (_) {
        registeredCodes = _seedCodes();
      }
    } else {
      registeredCodes = _seedCodes();
      await saveCodes();
    }

    // Ensure Hive box 'codes' is initialized and seeded
    try {
      if (!Hive.isBoxOpen('codes')) {
        await Hive.openBox('codes');
      }
      final box = Hive.box('codes');
      if (box.isEmpty && registeredCodes.isNotEmpty) {
        for (var c in registeredCodes) {
          final cd = (c['code'] as String? ?? '').toUpperCase();
          if (cd.isNotEmpty) {
            box.put(cd, {
              'code': cd,
              'name': c['name'] ?? c['assignedName'] ?? '',
              'role': c['role'] ?? '',
              'grade': c['grade'] ?? '9',
              'subject': c['subject'] ?? 'ALL',
              'schoolPrefix': c['schoolPrefix'] ?? 'BENA',
              'schoolName': c['schoolName'] ?? '',
              'phone': c['phone'] ?? '',
            });
          }
        }
      }
    } catch (_) {}

    // 4. Load Books or Seed
    final booksStr = prefs.getString(keyBooks);
    if (booksStr != null) {
      final list = jsonDecode(booksStr) as List;
      textbooks = list.map((e) => Textbook.fromMap(e)).toList();
    } else {
      textbooks = _seedTextbooks();
      await saveBooks();
    }

    // 5. Load Announcements or Seed
    final ancStr = prefs.getString(keyAnc);
    if (ancStr != null) {
      final list = jsonDecode(ancStr) as List;
      announcements = list.map((e) => Announcement.fromMap(e)).toList();
    } else {
      announcements = _seedAnnouncements();
      await saveAnnouncements();
    }

    // 6. Load Questions or Seed
    final qStr = prefs.getString(keyQuestions);
    if (qStr != null) {
      final list = jsonDecode(qStr) as List;
      questions = list.map((e) => QuestionItem.fromMap(e)).toList();
    } else {
      questions = _seedQuestions();
      await saveQuestions();
    }

    // 7. Load Submissions or Seed
    final subStr = prefs.getString(keySubs);
    if (subStr != null) {
      final list = jsonDecode(subStr) as List;
      submissions = list.map((e) => HomeworkSubmission.fromMap(e)).toList();
    } else {
      submissions = _seedSubmissions();
      await saveSubmissions();
    }
  }

  // String helper for code generation (Item D)
  String generateCode({
    required String role,
    required String grade,
    required String subjectCode,
    required String schoolPrefix,
  }) {
    final rand = (Random().nextInt(9000) + 1000).toString();
    if (role == 'student') return 'STU-$grade-$schoolPrefix-$rand'; // STU-9-NEHD-9218
    if (role == 'teacher') return 'T-$grade-$subjectCode-$schoolPrefix-$rand'; // T-9-SOC-NEHD-XXXX فيه 9
    if (role == 'principal') return 'M-$schoolPrefix-$rand'; // M-NEHD-4020 بدون 30D
    return '';
  }

  Future<Map<String, dynamic>> activateCode(String inputCode) async {
    final code = inputCode.trim().toUpperCase();
    print('--- محاولة تفعيل: $code ---');

    // 1) كود المطور يشتغل دائماً
    if (code == 'ADMIN-BENA-2026' || code == 'ADMIN-2026' || code == 'ADMIN-NOUR-2026') {
      final now = DateTime.now();
      final exp = now.add(const Duration(days: 365));
      final session = UserSession(
        code: code,
        name: 'م. أحمد الشامي - المطور',
        role: UserRole.admin,
        roleTitleAr: 'مدير النظام (المطور)',
        activatedAt: now,
        expiresAt: exp,
        daysRemaining: 365,
        isTest: false,
        grade: '9',
        subject: 'ALL',
        schoolName: 'إدارة النظام المركزية',
        phone: '',
      );
      currentSession = session;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(keySession, jsonEncode(session.toMap()));
      return {'success': true, 'session': session, 'message': 'تم تفعيل حساب المطور'};
    }

    // 2) دور في Hive مباشرة - بدون blackList
    try {
      if (!Hive.isBoxOpen('codes')) {
        await Hive.openBox('codes');
      }
      final box = Hive.box('codes');
      print('عدد الأكواد في الصندوق: ${box.length}');
      print('المفاتيح: ${box.keys.toList()}');

      if (!box.containsKey(code)) {
        // جرب بدون حساسية
        for (var k in box.keys) {
          if (k.toString().trim().toUpperCase() == code) {
            final foundData = box.get(k);
            return await _createSessionFromData(foundData is Map ? foundData : null);
          }
        }

        // تحقق من registeredCodes كإسناد احتياطي
        final match = registeredCodes.firstWhere(
          (c) => (c['code'] as String? ?? '').trim().toUpperCase() == code,
          orElse: () => {},
        );
        if (match.isNotEmpty) {
          await box.put(code, match);
          return await _createSessionFromData(match);
        }

        return {
          'success': false,
          'message': 'الكود $code غير موجود - الأكواد الموجودة: ${box.keys.join(', ')}'
        };
      }

      final foundData = box.get(code);
      return await _createSessionFromData(foundData is Map ? foundData : null);
    } catch (e) {
      return {'success': false, 'message': 'خطأ Hive: $e'};
    }
  }

  // دالة مساعدة جديدة - أضفها تحت activateCode مباشرة:
  Future<Map<String, dynamic>> _createSessionFromData(Map? foundData) async {
    if (foundData == null) return {'success': false, 'message': 'بيانات الكود فارغة'};
    final now = DateTime.now();
    final exp = now.add(const Duration(days: 30));
    UserRole uRole = UserRole.student;
    String r = (foundData['role'] ?? 'student').toString().toLowerCase();
    if (r.contains('teacher')) uRole = UserRole.teacher;
    if (r.contains('principal') || r.contains('manager')) uRole = UserRole.principal;
    if (r.contains('admin')) uRole = UserRole.admin;

    final session = UserSession(
      code: (foundData['code'] ?? '').toString(),
      name: (foundData['name'] ?? foundData['assignedName'] ?? 'مستخدم').toString(),
      role: uRole,
      roleTitleAr: (foundData['roleTitleAr'] ?? foundData['role'] ?? 'طالب').toString(),
      activatedAt: now,
      expiresAt: exp,
      daysRemaining: 30,
      isTest: false,
      grade: (foundData['grade'] ?? '9').toString(),
      subject: (foundData['subject'] ?? 'ALL').toString(),
      schoolName: (foundData['schoolName'] ?? '').toString(),
      phone: (foundData['phone'] ?? '').toString(),
    );
    currentSession = session;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keySession, jsonEncode(session.toMap()));
    return {'success': true, 'session': session, 'message': 'تم تفعيل ${session.name}'};
  }

  Future<void> logout() async {
    currentSession = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(keySession);
  }

  // --- Dynamic Schools Management (Fix 8) ---
  String generateSchoolPrefix(String schoolName) {
    final engOnly =
        schoolName.replaceAll(RegExp(r'[^a-zA-Z]'), '').toUpperCase();
    if (engOnly.length >= 3) {
      return engOnly.substring(0, engOnly.length >= 4 ? 4 : engOnly.length);
    }
    if (schoolName.contains('بناء')) return 'BENA';
    if (schoolName.contains('نهضة')) return 'NEHD';
    if (schoolName.contains('نور')) return 'NOUR';
    if (schoolName.contains('رواد')) return 'RWAD';
    if (schoolName.contains('يمن')) return 'YEMN';
    if (schoolName.contains('أمل') || schoolName.contains('امل')) return 'AMAL';
    if (schoolName.contains('فجر')) return 'FAJR';
    if (schoolName.contains('قدس')) return 'QUDS';
    if (schoolName.contains('شهيد')) return 'SHHD';
    if (schoolName.contains('ثورة')) return 'THWR';
    if (schoolName.contains('وحدة')) return 'WAHD';
    return 'SCHL';
  }

  Future<void> addNewSchool(String name, String city, String customPrefix) async {
    final prefix = customPrefix.trim().isNotEmpty
        ? customPrefix.trim().toUpperCase()
        : generateSchoolPrefix(name);
    final school = School(
      id: 'sch-${DateTime.now().millisecondsSinceEpoch}',
      name: name.trim(),
      prefix: prefix,
      city: city.trim().isNotEmpty ? city.trim() : 'صنعاء',
    );
    schools.add(school);
    await saveSchools();
  }

  Future<void> deleteSchool(String id) async {
    schools.removeWhere((s) => s.id == id);
    if (schools.isEmpty) {
      schools = _seedSchools();
    }
    await saveSchools();
  }

  Future<void> saveSchools() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      keySchools,
      jsonEncode(schools.map((e) => e.toMap()).toList()),
    );
  }

  // --- Code Purge & Management (Fix 4) ---
  Future<int> deleteAllFakeAndTestCodes() async {
    const fakePatterns = [
      '-STU',
      '-M',
      '-T',
      'ADMIN',
      'ADM',
      'STU-101',
      'M-BENA',
      'T-BENA'
    ];
    final beforeCount = registeredCodes.length;
    registeredCodes.removeWhere((c) {
      final code = (c['code'] as String? ?? '').toUpperCase();
      if (fakePatterns.any((p) => code == p || code == '-$p' || code.startsWith('-'))) return true;
      if (code.contains('TEST')) return true;
      if (code.length < 10 && code != 'ADMIN-BENA-2026') return true;
      return false;
    });
    await saveCodes();
    return beforeCount - registeredCodes.length;
  }

  Future<int> deleteTestCodesOnly() async {
    final beforeCount = registeredCodes.length;
    registeredCodes.removeWhere(
      (c) => (c['code'] as String? ?? '').toUpperCase().contains('TEST'),
    );
    await saveCodes();
    return beforeCount - registeredCodes.length;
  }

  Future<void> deleteCode(String code) async {
    registeredCodes.removeWhere((c) => c['code'] == code);
    await saveCodes();
  }

  Future<int> purgeTestAccounts() async {
    return await deleteAllFakeAndTestCodes();
  }

  // --- Fix I: مسح الأكواد القديمة وحذف أكواد 30D والأكواد بدون صف ---
  Future<int> purgeOldAndInvalidCodes() async {
    final beforeCount = registeredCodes.length;
    const blackList = [
      'STU-901', 'STU-902', '-STU', 'STU--', 'STU-101', 'M-BENA', 'T-BENA',
      '-M', '-T', 'ADMIN', 'ADM', 'TEST-555', 'TEST'
    ];

    registeredCodes.removeWhere((c) {
      final code = (c['code'] as String? ?? '').toUpperCase();
      // Keep developer codes
      if (code == 'ADMIN-2026' || code == 'ADMIN-BENA-2026') return false;
      // Remove any test code
      if (code.contains('TEST')) return true;
      // Remove old 30D tag in code
      if (code.contains('-30D-') || code.contains('30D')) return true;
      // Remove blacklist matches
      if (blackList.any((b) => code == b || code.startsWith(b))) return true;

      final parts = code.split('-');
      // Student must have grade (parts.length >= 4 and parts[1] is 7, 8, 9)
      if (parts[0] == 'STU') {
        if (parts.length < 4 || !['7', '8', '9'].contains(parts[1])) return true;
      }
      // Teacher must have grade (parts.length >= 5 and parts[1] is 7, 8, 9)
      if (parts[0] == 'T') {
        if (parts.length < 5 || !['7', '8', '9'].contains(parts[1])) return true;
      }
      // Principal M-PREFIX-RAND (parts.length >= 3)
      if (parts[0] == 'M') {
        if (parts.length < 3) return true;
      }
      return false;
    });

    await saveCodes();
    return beforeCount - registeredCodes.length;
  }

  // --- Storage Saves ---
  Future<void> saveCodes() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(keyCodes, jsonEncode(registeredCodes));
  }

  Future<void> saveBooks() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      keyBooks,
      jsonEncode(textbooks.map((e) => e.toMap()).toList()),
    );
  }

  Future<void> saveAnnouncements() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      keyAnc,
      jsonEncode(announcements.map((e) => e.toMap()).toList()),
    );
  }

  Future<void> saveQuestions() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      keyQuestions,
      jsonEncode(questions.map((e) => e.toMap()).toList()),
    );
  }

  Future<void> saveSubmissions() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      keySubs,
      jsonEncode(submissions.map((e) => e.toMap()).toList()),
    );
  }

  // --- Seeds ---
  List<School> _seedSchools() => [
        School(
          id: 'sch-1',
          name: 'مدرسة البناء التربوي الأهلية النموذجية',
          prefix: 'BENA',
          city: 'صنعاء',
        ),
        School(
          id: 'sch-2',
          name: 'مدرسة النهضة الأساسية للبنين',
          prefix: 'NEHD',
          city: 'صنعاء',
        ),
        School(
          id: 'sch-3',
          name: 'مدرسة النور الحديثة النموذجية',
          prefix: 'NOUR',
          city: 'تعز',
        ),
        School(
          id: 'sch-4',
          name: 'مدرسة الرواد التعليمية',
          prefix: 'RWAD',
          city: 'إب',
        ),
        School(
          id: 'sch-5',
          name: 'مدرسة اليمن السعيد الأساسية',
          prefix: 'YEMN',
          city: 'الحديدة',
        ),
      ];

  List<Map<String, dynamic>> _seedCodes() => [
        {
          'code': 'ADMIN-BENA-2026',
          'role': 'admin',
          'roleTitleAr': 'مدير النظام (المطور)',
          'assignedName': 'م. أحمد الشامي',
          'schoolName': 'إدارة النظام المركزية',
          'createdAt': '2026-03-01',
        },
        {
          'code': 'M-BENA-30D-5190',
          'role': 'principal',
          'roleTitleAr': 'مدير المدرسة',
          'assignedName': 'أ. عبدالله باجعفر',
          'schoolName': 'مدرسة البناء التربوي الأهلية النموذجية',
          'createdAt': '2026-03-01',
        },
        {
          'code': 'T-MATH-BENA-8492',
          'role': 'teacher',
          'roleTitleAr': 'معلم مادة الرياضيات',
          'assignedName': 'أ. طارق الأكوع',
          'subject': 'الرياضيات',
          'schoolName': 'مدرسة البناء التربوي الأهلية النموذجية',
          'createdAt': '2026-03-01',
        },
        {
          'code': 'STU-9-BENA-7301',
          'role': 'student',
          'roleTitleAr': 'طالب (الصف التاسع الأساسي)',
          'assignedName': 'حمزة نبيل الزريقي',
          'grade': '9',
          'schoolName': 'مدرسة البناء التربوي الأهلية النموذجية',
          'createdAt': '2026-03-01',
        },
        {
          'code': 'STU-8-RWAD-4951',
          'role': 'student',
          'roleTitleAr': 'طالب (الصف الثامن الأساسي)',
          'assignedName': 'سعيد أحمد',
          'grade': '8',
          'schoolName': 'مدرسة الرواد التعليمية',
          'phone': '778899001',
          'createdAt': '2026-03-01',
        },
        {
          'code': 'T-8-SCI-RWAD-8842',
          'role': 'teacher',
          'roleTitleAr': 'معلم مادة العلوم صف 8',
          'assignedName': 'أ. أسامة يحيى',
          'grade': '8',
          'subject': 'العلوم',
          'schoolName': 'مدرسة الرواد التعليمية',
          'phone': '774433221',
          'createdAt': '2026-03-01',
        },
      ];

  List<Textbook> _seedTextbooks() => [
        // 7th Grade Books
        Textbook(
          id: 'b-7-qur',
          title: 'القرآن الكريم وتلاوته - الصف السابع',
          grade: '7',
          subject: 'القرآن الكريم',
          summary: 'تلاوة وحفظ وتجويد الآيات المقررة للصف السابع الأساسي.',
          tableOfContents: ['الوحدة الأولى: أحكام النون الساكنة والتنوين', 'الوحدة الثانية: سور التلاوة والحفظ'],
        ),
        Textbook(
          id: 'b-7-isl',
          title: 'التربية الإسلامية - الصف السابع',
          grade: '7',
          subject: 'التربية الإسلامية',
          summary: 'العقيدة الإسلامية والعبادات والسيرة النبوية والحديث الشريف.',
          tableOfContents: ['الوحدة الأولى: الإيمان وأركانه', 'الوحدة الثانية: فقه الصلاة والزكاة', 'الوحدة الثالثة: من سيرة المصطفى'],
        ),
        Textbook(
          id: 'b-7-arb',
          title: 'اللغة العربية - الصف السابع',
          grade: '7',
          subject: 'اللغة العربية',
          summary: 'القراءة والنصوص والقواعد النحوية والإملاء للصف السابع.',
          tableOfContents: ['الوحدة الأولى: نصوص يمنية مختارة', 'الوحدة الثانية: الجملة الاسمية والخبر', 'الوحدة الثالثة: التعبير الإنشائي'],
        ),
        Textbook(
          id: 'b-7-eng',
          title: 'English for Yemen - Grade 7',
          grade: '7',
          subject: 'اللغة الإنجليزية',
          summary: 'Crescent English Course for Yemen: Pupil\'s Book 1.',
          tableOfContents: ['Unit 1: Welcome', 'Unit 2: At School', 'Unit 3: My Family and Home'],
        ),
        Textbook(
          id: 'b-7-math',
          title: 'الرياضيات - الصف السابع الأساسي',
          grade: '7',
          subject: 'الرياضيات',
          summary: 'الأعداد الصحيحة، النسبة والتناسب والنسب المئوية، والزوايا الهندسية.',
          tableOfContents: ['الوحدة الأولى: الأعداد الصحيحة', 'الوحدة الثانية: النسبة والتناسب', 'الوحدة الثالثة: الزوايا والمستقيمات'],
        ),
        Textbook(
          id: 'b-7-sci',
          title: 'العلوم العامة - الصف السابع الأساسي',
          grade: '7',
          subject: 'العلوم',
          summary: 'الكائنات الحية والخلية، المادة وخواصها، والطاقة وحركتها.',
          tableOfContents: ['الوحدة الأولى: تنوع الكائنات الحية', 'الوحدة الثانية: المادة والحرارة', 'الوحدة الثالثة: القوة والحركة'],
        ),
        Textbook(
          id: 'b-7-soc',
          title: 'الاجتماعيات (تاريخ وجغرافيا ووطنية) - السابع',
          grade: '7',
          subject: 'الاجتماعيات',
          summary: 'تاريخ اليمن القديم وحضارات سبأ وحمير، وجغرافية الجمهورية اليمنية والتربية الوطنية.',
          tableOfContents: ['الوحدة الأولى: حضارات اليمن القديمة', 'الوحدة الثانية: تضاريس ومناخ اليمن', 'الوحدة الثالثة: الهوية والانتماء الوطني'],
        ),

        // 8th Grade Books
        Textbook(
          id: 'b-8-qur',
          title: 'القرآن الكريم وتلاوته - الصف الثامن',
          grade: '8',
          subject: 'القرآن الكريم',
          summary: 'أحكام الميم الساكنة والمدود وسور التلاوة المقررة للصف الثامن.',
          tableOfContents: ['الوحدة الأولى: أحكام الميم والمدود', 'الوحدة الثانية: السور المقررة'],
        ),
        Textbook(
          id: 'b-8-isl',
          title: 'التربية الإسلامية - الصف الثامن',
          grade: '8',
          subject: 'التربية الإسلامية',
          summary: 'الإيمان بالغيب، فقه المعاملات الإسلامية، وسير الصحابة والتابعين.',
          tableOfContents: ['الوحدة الأولى: العقيدة والسلوك', 'الوحدة الثانية: فقه الصيام والحج', 'الوحدة الثالثة: أعلام الهدى'],
        ),
        Textbook(
          id: 'b-8-arb',
          title: 'اللغة العربية - الصف الثامن',
          grade: '8',
          subject: 'اللغة العربية',
          summary: 'نصوص أدبية وقواعد الفعل والإعراب والبلاغة للصف الثامن.',
          tableOfContents: ['الوحدة الأولى: من الأدب العربي واليمني', 'الوحدة الثانية: الأفعال وإعرابها', 'الوحدة الثالثة: فن الكتابة'],
        ),
        Textbook(
          id: 'b-8-eng',
          title: 'English for Yemen - Grade 8',
          grade: '8',
          subject: 'اللغة الإنجليزية',
          summary: 'Crescent English Course for Yemen: Pupil\'s Book 2.',
          tableOfContents: ['Unit 1: Back to School', 'Unit 2: Jobs and Places', 'Unit 3: Health and Sports'],
        ),
        Textbook(
          id: 'b-8-math',
          title: 'الرياضيات - الصف الثامن الأساسي',
          grade: '8',
          subject: 'الرياضيات',
          summary: 'الأعداد النسبية، المقادير الجبرية، المعادلات الخطية، والمساحات والحجوم.',
          tableOfContents: ['الوحدة الأولى: الأعداد النسبية', 'الوحدة الثانية: الحدود والمقادير الجبرية', 'الوحدة الثالثة: الهندسة والمجسمات'],
        ),
        Textbook(
          id: 'b-8-sci',
          title: 'العلوم العامة - الصف الثامن الأساسي',
          grade: '8',
          subject: 'العلوم',
          summary: 'أجهزة جسم الإنسان، التفاعلات الكيميائية البسيطة، والضوء والصوت.',
          tableOfContents: ['الوحدة الأولى: أجهزة الجسم والتغذية', 'الوحدة الثانية: التغيرات الكيميائية', 'الوحدة الثالثة: الأمواج والضوء'],
        ),
        Textbook(
          id: 'b-8-soc',
          title: 'الاجتماعيات - الصف الثامن الأساسي',
          grade: '8',
          subject: 'الاجتماعيات',
          summary: 'تاريخ اليمن في العصر الإسلامي، جغرافية الوطن العربي، ومؤسسات الدولة.',
          tableOfContents: ['الوحدة الأولى: اليمن في العصر الإسلامي', 'الوحدة الثانية: الوطن العربي الكبير', 'الوحدة الثالثة: الحقوق والواجبات'],
        ),

        // 9th Grade Books
        Textbook(
          id: 'b-9-qur',
          title: 'القرآن الكريم وتلاوته - الصف التاسع الأساسي',
          grade: '9',
          subject: 'القرآن الكريم',
          summary: 'أحكام التجويد المتقدمة ومخارج الحروف والسور المقررة للشهادة الأساسية.',
          tableOfContents: ['الوحدة الأولى: مخارج الحروف والصفات', 'الوحدة الثانية: سور التلاوة والتدبر'],
        ),
        Textbook(
          id: 'b-9-isl',
          title: 'التربية الإسلامية - الصف التاسع الأساسي',
          grade: '9',
          subject: 'التربية الإسلامية',
          summary: 'قضايا الفكر الإسلامي، فقه الأسرة، والتشريع والقيم الأخلاقية.',
          tableOfContents: ['الوحدة الأولى: العقيدة والشريعة', 'الوحدة الثانية: فقه الأسرة والمعاملات', 'الوحدة الثالثة: الحضارة الإسلامية'],
        ),
        Textbook(
          id: 'b-9-arb',
          title: 'اللغة العربية (لغتي الخالدة) - التاسع',
          grade: '9',
          subject: 'اللغة العربية',
          summary: 'نصوص أدبية يمنية، قواعد النحو والصرف، التعبير الإبداعي، والإملاء التطبيقي.',
          tableOfContents: ['الوحدة الأولى: من روائع الأدب اليمني', 'الوحدة الثانية: المنادى والممنوع من الصرف', 'الوحدة الثالثة: التوابع (النعت والعطف والتوكيد)', 'الوحدة الرابعة: فنون التحرير'],
        ),
        Textbook(
          id: 'b-9-eng',
          title: 'English for Yemen - Grade 9',
          grade: '9',
          subject: 'اللغة الإنجليزية',
          summary: 'Crescent English Course for Yemen: Pupil\'s Book 3 (Basic Certificate).',
          tableOfContents: ['Unit 1: Yemen and the World', 'Unit 2: Science and Discoveries', 'Unit 3: Communication and Media'],
        ),
        Textbook(
          id: 'b-9-math',
          title: 'الرياضيات - الصف التاسع الأساسي',
          grade: '9',
          subject: 'الرياضيات',
          summary: 'منهج وزارة التربية والتعليم - الجمهورية اليمنية: المجموعات، التطبيقات، الهندسة التحليلية، والمثلثات.',
          tableOfContents: ['الوحدة الأولى: المجموعات والعلاقات', 'الوحدة الثانية: التطبيقات والاقترانات', 'الوحدة الثالثة: كثيرات الحدود والعمليات عليها', 'الوحدة الرابعة: الهندسة والقياس'],
        ),
        Textbook(
          id: 'b-9-sci',
          title: 'العلوم العامة - الصف التاسع الأساسي',
          grade: '9',
          subject: 'العلوم',
          summary: 'الكيمياء والتركيب الذري، علم الأحياء والوراثة والتكاثر، والفيزياء والطاقة والكهرباء.',
          tableOfContents: ['الوحدة الأولى: بنية المادة والروابط', 'الوحدة الثانية: الوراثة وتنوع الكائنات', 'الوحدة الثالثة: الشحنات والمغناطيسية', 'الوحدة الرابعة: الموارد الطبيعية في اليمن'],
        ),
        Textbook(
          id: 'b-9-soc',
          title: 'الاجتماعيات (تاريخ وجغرافيا ووطنية) - التاسع',
          grade: '9',
          subject: 'الاجتماعيات',
          summary: 'تاريخ اليمن الحديث والمعاصر والثورات اليمنية، جغرافية العالم، والدستور والنظام السياسي اليمني.',
          tableOfContents: ['الوحدة الأولى: ثورتا 26 سبتمبر و 14 أكتوبر', 'الوحدة الثانية: جغرافية القارات والموارد العالمية', 'الوحدة الثالثة: الدستور والوحدة اليمنية والديمقراطية'],
        ),
      ];

  List<Announcement> _seedAnnouncements() => [
        Announcement(
          id: 'a-1',
          title: 'جدول اختبارات نهاية الفصل وتوزيع لجان المراقبة',
          content: 'نهيب بالمعلمين والطلاب الالتزام بجدول الاختبارات والحضور المبكر قبل الموعد بنصف ساعة.',
          target: 'all',
          priority: 'عاجل',
          senderName: 'أ. عبدالله باجعفر (المدير)',
          createdAt: 'منذ ساعتين',
          isRead: false,
        ),
        Announcement(
          id: 'a-2',
          title: 'اجتماع تنسيقي خاص بمعلمي الصف التاسع (الشهادة الأساسية)',
          content: 'يعقد مجلس إدارة المدرسة اجتماعاً لمراجعة خطة بنك الأسئلة الوزارية التجريبية يوم الأربعاء.',
          target: 'teachers',
          priority: 'هام',
          senderName: 'أ. عبدالله باجعفر (المدير)',
          createdAt: 'أمس',
          isRead: false,
        ),
        Announcement(
          id: 'a-3',
          title: 'تفعيل إرسال الواجبات المصورة عبر التطبيق',
          content: 'أعزائي الطلاب، يرجى تصوير دفاتر الواجبات بوضوح ورفعها لمعلم المادة للحصول على الدرجة.',
          target: 'students',
          priority: 'عادي',
          senderName: 'الإدارة المدرسية',
          createdAt: 'منذ 3 أيام',
          isRead: true,
        ),
      ];

  List<QuestionItem> _seedQuestions() => [
        QuestionItem(
          id: 'q-1',
          grade: '9',
          subject: 'الرياضيات',
          type: 'mcq',
          questionText: 'إذا كانت س = {١، ٢، ٣} وص = {٢، ٤، ٦} وقاعدة الاقتران ت(س) = ٢س، فإن مدى التطبيق هو:',
          options: ['{١، ٢، ٣}', '{٢، ٤، ٦}', '{٢، ٣، ٤}', '{٤، ٦}'],
          correctIndex: 1,
          points: 5,
          teacherName: 'أ. طارق الأكوع',
        ),
        QuestionItem(
          id: 'q-2',
          grade: '9',
          subject: 'العلوم',
          type: 'mcq',
          questionText: 'الجسيمات سالبة الشحنة التي تدور حول نواة الذرة في مستويات طاقة محددة تسمى:',
          options: ['البروتونات', 'النيوترونات', 'الإلكترونات', 'الفوتونات'],
          correctIndex: 2,
          points: 5,
          teacherName: 'أ. منير الشوافي',
        ),
        QuestionItem(
          id: 'q-3',
          grade: '9',
          subject: 'الرياضيات',
          type: 'essay',
          questionText: 'سؤال مقالي: أوجد مجموعة حل المعادلة التربيعية: س² - ٥س + ٦ = ٠ موضحاً خطوات التحليل.',
          modelAnswer: '(س - ٢)(س - ٣) = ٠ ، إما س = ٢ أو س = ٣. مجموعة الحل م.ح = {٢، ٣}',
          points: 5,
          teacherName: 'أ. طارق الأكوع',
        ),
        QuestionItem(
          id: 'q-8-atom',
          grade: '8',
          subject: 'العلوم',
          type: 'essay',
          questionText: 'عرف الذرة مع ذكر مكوناتها الأساسية في الطبيعة.',
          modelAnswer: 'الذرة هي أصغر جزء من العنصر الكيميائي يمكن أن يدخل في التفاعلات الكيميائية وتتكون من نواة موجبة وإلكترونات سالبة.',
          points: 5,
          teacherName: 'أ. أسامة يحيى',
        ),
      ];

  List<HomeworkSubmission> _seedSubmissions() => [
        HomeworkSubmission(
          id: 'STU-8-RWAD-4951_عرف_الذرة',
          studentCode: 'STU-8-RWAD-4951',
          studentName: 'سعيد أحمد',
          grade: '8',
          subject: 'العلوم',
          title: 'عرف الذرة',
          photoUrl: 'https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=800&q=80',
          studentNotes: 'تم حل سؤال عرف الذرة في دفتر العلوم بخط اليد.',
          score: 1,
          maxScore: 5,
          status: 'بانتظار المراجعة',
          isLocked: false,
          teacherFeedback: 'أحسنت يا أمير...',
          submittedAt: 'اليوم',
        ),
        HomeworkSubmission(
          id: 'sub-1',
          studentCode: 'STU-9-BENA-7301',
          studentName: 'حمزة نبيل الزريقي',
          grade: '9',
          subject: 'الرياضيات',
          title: 'حل تمارين نظرية فيثاغورس صفحة ٨٤',
          photoUrl: 'https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=800&q=80',
          studentNotes: 'تم حل المسألة رقم ٤ و ٥ بخط اليد مع الرسم.',
          score: 5,
          maxScore: 5,
          status: 'تم التصحيح',
          teacherFeedback: 'إجابة ممتازة وخطوات نموذجية يا حمزة، أحسنت!',
          principalComment: 'بوركت جهودك يا بني، طالب متميز نتوقع له الترتيب الأول على أمانة العاصمة.',
          submittedAt: 'منذ يومين',
        ),
        HomeworkSubmission(
          id: 'sub-2',
          studentCode: 'STU-9-BENA-7302',
          studentName: 'ياسين أحمد المتوكل',
          grade: '9',
          subject: 'الرياضيات',
          title: 'تطبيقات على الدالة الخطية',
          photoUrl: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=800&q=80',
          studentNotes: 'تم إرفاق صورة الحل كاملة.',
          score: 5,
          maxScore: 5,
          status: 'تم التصحيح',
          teacherFeedback: 'رائع جداً ومتقن.',
          principalComment: 'بارك الله فيك وإلى الأمام دوماً.',
          submittedAt: 'منذ يوم',
        ),
        HomeworkSubmission(
          id: 'sub-3',
          studentCode: 'STU-9-BENA-7303',
          studentName: 'مروان عبدالرحمن',
          grade: '9',
          subject: 'العلوم',
          title: 'رسم تركيب الذرة والمدارات الإلكترونية',
          photoUrl: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80',
          studentNotes: 'رسمت ذرة الكربون والنيتروجين.',
          score: 4,
          maxScore: 5,
          status: 'تم التصحيح',
          teacherFeedback: 'رسم دقيق وواضح، ممتاز.',
          principalComment: 'عمل مبدع يستحق التقدير.',
          submittedAt: 'منذ يومين',
        ),
        HomeworkSubmission(
          id: 'sub-4',
          studentCode: 'STU-9-BENA-7304',
          studentName: 'سارة خالد الشرجبي',
          grade: '9',
          subject: 'اللغة العربية',
          title: 'إعراب قصيدة أرض الجنتين',
          photoUrl: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=800&q=80',
          studentNotes: 'تم كتابة الحل بدقة.',
          score: 5,
          maxScore: 5,
          status: 'تم التصحيح',
          teacherFeedback: 'خط جميل وإعراب سليم.',
          principalComment: 'طالبة نموذجية فخر للمدرسة.',
          submittedAt: 'اليوم',
        ),
      ];
}
