import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:material_ui/material_ui.dart';

import '../core/providers.dart';
import 'common.dart';

/// Иллюстрация детали с сервера (SVG, 2–5 КБ). Пока грузится — мерцающая заглушка, без сети — значок категории.
class PartImage extends ConsumerWidget {
  const PartImage({super.key, required this.url, this.icon, this.height = 160, this.width, this.radius = 16, this.borderRadius});
  final String? url;
  final String? icon;
  final double height;
  final double? width;
  final double radius;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final base = ref.watch(apiProvider).serverUrl;
    final fallback = Center(child: CategoryIcon(icon, size: height > 100 ? 64 : 34));
    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.circular(radius),
      child: Container(
        height: height,
        width: width ?? double.infinity,
        // тот же «студийный» фон, что у рисунков, — картинка вписывается без видимых полей
        decoration: const BoxDecoration(gradient: LinearGradient(colors: [Color(0xFFFFF9F2), Color(0xFFF1E2D0)], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
        child: url == null
            ? fallback
            : SvgPicture.network(
                '$base$url',
                fit: BoxFit.contain,
                placeholderBuilder: (_) => const Skeleton(height: double.infinity, radius: 0),
                errorBuilder: (_, _, _) => fallback,
              ),
      ),
    );
  }
}
