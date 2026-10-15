import 'package:cupertino_ui/cupertino_ui.dart' show CupertinoPageTransitionsBuilder;
import 'package:material_ui/material_ui.dart';
import 'package:google_fonts/google_fonts.dart';

/// Тёплая палитра — та же, что у сайта (web/src/theme.ts). Контраст текста и статусов ≥ 4,5 : 1.
class C {
  static const primary = Color(0xFFB4532A); // терракота
  static const primaryDark = Color(0xFF9C4422);
  static const primarySoft = Color(0xFFF6E3D6);
  static const primaryTint = Color(0xFFFCF1E9);
  static const accent = Color(0xFFD9922E); // мёд / охра
  static const accentSoft = Color(0xFFFCEFD9);
  static const teal = Color(0xFF2F5D73);
  static const tealSoft = Color(0xFFE3EDF0);
  static const bg = Color(0xFFFAF5EE); // песок
  static const surface = Color(0xFFFFFFFF);
  static const surfaceWarm = Color(0xFFFFFBF6);
  static const border = Color(0xFFEADFD2);
  static const borderStrong = Color(0xFFD9C9B6);
  static const text = Color(0xFF2F2620);
  static const text2 = Color(0xFF6E5F53);
  static const text3 = Color(0xFF9A8B7E);
  static const success = Color(0xFF4E7D3A);
  static const successSoft = Color(0xFFE7F0DF);
  static const warning = Color(0xFFA8660F);
  static const warningSoft = Color(0xFFFBEBD3);
  static const danger = Color(0xFFA8392C);
  static const dangerSoft = Color(0xFFF8E1DC);
  static const reserved = Color(0xFF6B4A7D);
  static const reservedSoft = Color(0xFFEFE7F3);
}

const mono = TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600, letterSpacing: -0.2);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: C.primary,
    primary: C.primary,
    onPrimary: Colors.white,
    secondary: C.accent,
    tertiary: C.teal,
    error: C.danger,
    surface: C.surface,
    onSurface: C.text,
    surfaceContainerLowest: C.surface,
    surfaceContainerLow: C.surfaceWarm,
    surfaceContainer: C.bg,
    outline: C.borderStrong,
    outlineVariant: C.border,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: C.bg);
  final text = GoogleFonts.interTextTheme(base.textTheme).apply(bodyColor: C.text, displayColor: C.text);

  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: C.bg,
      surfaceTintColor: Colors.transparent,
      foregroundColor: C.text,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      titleTextStyle: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
    ),
    cardTheme: CardThemeData(
      color: C.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: const BorderSide(color: C.border)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        foregroundColor: C.text,
        side: const BorderSide(color: C.borderStrong),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: C.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.borderStrong)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.borderStrong)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: C.primary, width: 2)),
      hintStyle: const TextStyle(color: C.text3),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: C.surface,
      selectedColor: C.primary,
      secondarySelectedColor: C.primary,
      checkmarkColor: Colors.white,
      side: const BorderSide(color: C.borderStrong),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      labelStyle: const TextStyle(fontWeight: FontWeight.w500, color: C.text),
      secondaryLabelStyle: const TextStyle(fontWeight: FontWeight.w600, color: Colors.white),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: C.surface,
      indicatorColor: C.primarySoft,
      surfaceTintColor: Colors.transparent,
      height: 70,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(fontSize: 12, fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500, color: s.contains(WidgetState.selected) ? C.primary : C.text2),
      ),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? C.primary : C.text2)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: C.text,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
    }),
    dividerTheme: const DividerThemeData(color: C.border, space: 1),
  );
}
