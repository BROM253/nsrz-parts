import 'package:material_ui/material_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../theme.dart';

/// Значок категории оборудования.
class CategoryIcon extends StatelessWidget {
  const CategoryIcon(this.icon, {super.key, this.size = 46});
  final String? icon;
  final double size;

  static const _icons = <String, IconData>{
    'engine': Icons.settings_suggest_outlined,
    'generator': Icons.bolt_outlined,
    'pump': Icons.water_drop_outlined,
    'filter': Icons.filter_alt_outlined,
    'propeller': Icons.cyclone_outlined,
    'electric': Icons.electrical_services_outlined,
    'deck': Icons.anchor_outlined,
    'navigation': Icons.explore_outlined,
  };

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(size * 0.32)),
        child: Icon(_icons[icon] ?? Icons.build_outlined, color: C.primary, size: size * 0.52),
      );
}

/// Наличие: цвет + значок + текст.
class AvailabilityBadge extends StatelessWidget {
  const AvailabilityBadge(this.part, {super.key});
  final Part part;

  @override
  Widget build(BuildContext context) {
    final s = part.stock;
    final (Color bg, Color fg, IconData icon, String text) = s.allReserved
        ? (C.reservedSoft, C.reserved, Icons.pause_circle_outline, 'Всё в резерве')
        : switch (s.availability) {
            'IN_STOCK' => (C.successSoft, C.success, Icons.check_circle_outline, 'В наличии · ${s.available} ${part.unit}'),
            'ON_ORDER' => (C.warningSoft, C.warning, Icons.schedule, 'Под заказ${part.leadTimeDays > 0 ? ' · ${part.leadTimeDays} дн.' : ''}'),
            _ => (C.dangerSoft, C.danger, Icons.cancel_outlined, 'Нет на складе'),
          };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 15, color: fg),
        const SizedBox(width: 5),
        Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 13)),
      ]),
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, this.title, {super.key});
  final String status;
  final String title;

  static (Color, Color, IconData) style(String status) => switch (status) {
        'PENDING' => (C.warningSoft, C.warning, Icons.schedule),
        'CONFIRMED' => (C.tealSoft, C.teal, Icons.check),
        'ASSEMBLING' => (C.primarySoft, C.primaryDark, Icons.inventory_2_outlined),
        'READY' => (C.reservedSoft, C.reserved, Icons.local_shipping_outlined),
        'COMPLETED' => (C.successSoft, C.success, Icons.task_alt),
        _ => (C.dangerSoft, C.danger, Icons.block),
      };

  @override
  Widget build(BuildContext context) {
    final (bg, fg, icon) = style(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 15, color: fg),
        const SizedBox(width: 5),
        Flexible(child: Text(title, style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 13), overflow: TextOverflow.ellipsis)),
      ]),
    );
  }
}

/// Счётчик количества: число «перелистывается» при изменении.
class QtyStepper extends StatelessWidget {
  const QtyStepper({super.key, required this.value, required this.max, required this.onChanged, this.min = 1, this.enabled = true});
  final int value;
  final int min;
  final int max;
  final bool enabled;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    Widget btn(IconData icon, bool active, int next) => SizedBox(
          width: 48,
          height: 48,
          child: IconButton(
            onPressed: enabled && active ? () => onChanged(next) : null,
            icon: Icon(icon, size: 20),
            color: C.text,
            disabledColor: C.text3,
          ),
        );
    return Container(
      decoration: BoxDecoration(border: Border.all(color: C.borderStrong), borderRadius: BorderRadius.circular(14), color: C.surface),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        btn(Icons.remove, value > min, value - 1),
        SizedBox(
          width: 40,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            transitionBuilder: (child, a) => SlideTransition(
              position: Tween(begin: const Offset(0, -0.5), end: Offset.zero).animate(a),
              child: FadeTransition(opacity: a, child: child),
            ),
            child: Text('$value', key: ValueKey(value), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
          ),
        ),
        btn(Icons.add, value < max, value + 1),
      ]),
    );
  }
}

/// Плашка «Остатки на …».
class SyncPill extends StatelessWidget {
  const SyncPill(this.at, {super.key});
  final DateTime? at;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: C.tealSoft, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 7, height: 7, decoration: const BoxDecoration(color: C.teal, shape: BoxShape.circle))
              .animate(onPlay: (c) => c.repeat(reverse: true))
              .scaleXY(begin: 0.7, end: 1.3, duration: 900.ms)
              .fade(begin: 0.5, end: 1),
          const SizedBox(width: 7),
          Text('Остатки на ${dateTime(at)}', style: const TextStyle(color: C.teal, fontWeight: FontWeight.w600, fontSize: 12.5)),
        ]),
      );
}

/// Нет связи — показаны сохранённые данные (спутниковый канал на судне может пропадать).
class OfflineBanner extends StatelessWidget {
  const OfflineBanner(this.since, {super.key, this.onRetry});
  final DateTime since;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
        decoration: BoxDecoration(color: C.warningSoft, borderRadius: BorderRadius.circular(14), border: Border.all(color: C.warning)),
        child: Row(children: [
          const Icon(Icons.cloud_off_rounded, color: C.warning, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text('Нет связи. Показаны данные от ${dateTime(since)} — остатки могли измениться.',
                style: const TextStyle(color: C.warning, fontWeight: FontWeight.w600, fontSize: 13)),
          ),
          if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Повторить')),
        ]),
      ).animate().fadeIn(duration: 250.ms).slideY(begin: -0.3);
}

/// Заглушка загрузки с мерцанием.
class Skeleton extends StatelessWidget {
  const Skeleton({super.key, this.height = 110, this.radius = 18});
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
        height: height,
        decoration: BoxDecoration(color: const Color(0xFFF1E8DD), borderRadius: BorderRadius.circular(radius)),
      ).animate(onPlay: (c) => c.repeat()).shimmer(duration: 1300.ms, color: const Color(0xFFFBF6EF));
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 5, this.height = 120});
  final int count;
  final double height;

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: count,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (_, _) => Skeleton(height: height),
      );
}

/// Пустое состояние / ошибка с кнопкой «Повторить».
class MessageView extends StatelessWidget {
  const MessageView({super.key, required this.icon, required this.title, this.text, this.action, this.onAction});
  final IconData icon;
  final String title;
  final String? text;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 84,
              height: 84,
              decoration: const BoxDecoration(color: C.primaryTint, shape: BoxShape.circle),
              child: Icon(icon, size: 40, color: C.primary),
            ).animate().scale(duration: 400.ms, curve: Curves.easeOutBack),
            const SizedBox(height: 18),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (text != null) ...[
              const SizedBox(height: 6),
              Text(text!, textAlign: TextAlign.center, style: const TextStyle(color: C.text2)),
            ],
            if (action != null) ...[
              const SizedBox(height: 18),
              FilledButton(onPressed: onAction, child: Text(action!)),
            ],
          ]).animate().fadeIn(duration: 300.ms),
        ),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView(this.error, {super.key, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => MessageView(
        icon: Icons.wifi_off_rounded,
        title: 'Не удалось загрузить',
        text: '$error',
        action: onRetry == null ? null : 'Повторить',
        onAction: onRetry,
      );
}

/// Логотип: якорь в тёплом квадрате.
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 44});
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFC8653A), Color(0xFFA8471F)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(size * 0.3),
          boxShadow: [BoxShadow(color: C.primary.withValues(alpha: 0.3), blurRadius: 14, offset: const Offset(0, 6))],
        ),
        child: Icon(Icons.anchor_rounded, color: const Color(0xFFFFF7EF), size: size * 0.58),
      );
}

void showMessage(BuildContext context, String text, {bool error = false, SnackBarAction? action}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Row(children: [
        Icon(error ? Icons.error_outline : Icons.check_circle_outline, color: error ? const Color(0xFFFFB4A8) : const Color(0xFFB9E3A0)),
        const SizedBox(width: 10),
        Expanded(child: Text(text)),
      ]),
      action: action,
      duration: Duration(seconds: error ? 5 : 3),
    ));
}
