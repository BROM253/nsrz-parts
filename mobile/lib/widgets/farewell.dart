import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../core/providers.dart';
import '../theme.dart';
import 'common.dart';

/// Полный выход из аккаунта с прощанием (как на сайте): «До свидания, Иван!», затем экран входа.
/// Сессия отзывается на сервере, токены и сохранённый профиль стираются.
Future<void> signOutWithFarewell(BuildContext context, WidgetRef ref) async {
  final name = ref.read(sessionProvider).user?.firstName ?? '';
  final overlay = Overlay.of(context, rootOverlay: true);
  final visible = ValueNotifier(true);
  final entry = OverlayEntry(builder: (_) => _Farewell(name: name, visible: visible));
  overlay.insert(entry);
  await Future.delayed(const Duration(milliseconds: 950));
  await ref.read(sessionProvider.notifier).signOut();
  await Future.delayed(const Duration(milliseconds: 350)); // экран входа уже под прощанием
  visible.value = false;
  await Future.delayed(const Duration(milliseconds: 320));
  entry.remove();
  visible.dispose();
}

class _Farewell extends StatelessWidget {
  const _Farewell({required this.name, required this.visible});
  final String name;
  final ValueNotifier<bool> visible;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
        valueListenable: visible,
        builder: (context, shown, child) => AnimatedOpacity(opacity: shown ? 1 : 0, duration: const Duration(milliseconds: 300), child: child),
        child: Material(
          child: Container(
            decoration: const BoxDecoration(
              gradient: RadialGradient(center: Alignment(0, -0.2), radius: 1.1, colors: [Color(0xFFFCEFD9), Color(0xFFF6E6D6)]),
            ),
            child: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Logo(size: 76).animate().scale(begin: const Offset(0.6, 0.6), duration: 500.ms, curve: Curves.elasticOut).rotate(begin: -0.06),
                const SizedBox(height: 20),
                Text(name.isEmpty ? 'До свидания!' : 'До свидания, $name!', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.5, color: C.text))
                    .animate()
                    .fadeIn(delay: 150.ms, duration: 400.ms)
                    .slideY(begin: 0.3),
                const SizedBox(height: 6),
                const Text('Выходим из аккаунта…', style: TextStyle(color: C.text2)).animate().fadeIn(delay: 300.ms),
              ]),
            ),
          ),
        ).animate().fadeIn(duration: 300.ms),
      );
}
