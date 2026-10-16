import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../theme.dart';
import 'part_image.dart';

/// Значок корзины в нижнем меню — сюда «прилетает» товар.
final cartIconKey = GlobalKey(debugLabel: 'cart-icon');

/// Счётчик «приземлений»: значок корзины подпрыгивает именно в момент, когда товар долетел.
final cartLanded = ValueNotifier<int>(0);

const _flight = Duration(milliseconds: 1400); // медленно, чтобы перенос товара было видно

/// Картинка товара летит от [from] к значку корзины [to] по дуге, уменьшаясь; в конце — «+N».
void flyToCart(BuildContext context, {required GlobalKey from, GlobalKey? to, String? imageUrl, String? icon, int quantity = 1}) {
  final overlay = Overlay.of(context, rootOverlay: true);
  final fromBox = from.currentContext?.findRenderObject() as RenderBox?;
  final toBox = (to ?? cartIconKey).currentContext?.findRenderObject() as RenderBox?;
  final overlayBox = overlay.context.findRenderObject() as RenderBox?;
  if (fromBox == null || toBox == null || overlayBox == null) return;

  final start = overlayBox.globalToLocal(fromBox.localToGlobal(fromBox.size.center(Offset.zero)));
  final end = overlayBox.globalToLocal(toBox.localToGlobal(toBox.size.center(Offset.zero)));
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _Flight(
      start: start,
      end: end,
      imageUrl: imageUrl,
      icon: icon,
      quantity: quantity,
      onDone: () {
        entry.remove();
        cartLanded.value++;
      },
    ),
  );
  overlay.insert(entry);
}

class _Flight extends ConsumerStatefulWidget {
  const _Flight({required this.start, required this.end, required this.imageUrl, required this.icon, required this.quantity, required this.onDone});
  final Offset start;
  final Offset end;
  final String? imageUrl;
  final String? icon;
  final int quantity;
  final VoidCallback onDone;

  @override
  ConsumerState<_Flight> createState() => _FlightState();
}

class _FlightState extends ConsumerState<_Flight> with SingleTickerProviderStateMixin {
  // полёт 1,4 с + 1 с на «+N» над корзиной
  late final _c = AnimationController(vsync: this, duration: _flight + const Duration(milliseconds: 1000))..forward().whenComplete(widget.onDone);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const w = 84.0, h = 63.0;
    final flightPart = _flight.inMilliseconds / (_flight.inMilliseconds + 1000);
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = (_c.value / flightPart).clamp(0.0, 1.0);
          final children = <Widget>[];
          if (t < 1) {
            // квадратичная кривая Безье: вверх и к корзине
            final e = Curves.easeInOutCubic.transform(t);
            final control = Offset(widget.start.dx + (widget.end.dx - widget.start.dx) * 0.3, math.min(widget.start.dy, widget.end.dy) - 170);
            final p = Offset(
              (1 - e) * (1 - e) * widget.start.dx + 2 * (1 - e) * e * control.dx + e * e * widget.end.dx,
              (1 - e) * (1 - e) * widget.start.dy + 2 * (1 - e) * e * control.dy + e * e * widget.end.dy,
            );
            final scale = t < 0.45 ? 1 + 0.15 * (t / 0.45) : 1.15 - 0.93 * ((t - 0.45) / 0.55);
            final angle = t < 0.45 ? -0.21 * (t / 0.45) : -0.21 + 0.35 * ((t - 0.45) / 0.55);
            children.add(Positioned(
              left: p.dx - w / 2,
              top: p.dy - h / 2,
              child: Transform.rotate(
                angle: angle,
                child: Transform.scale(
                  scale: scale,
                  child: Container(
                    width: w,
                    height: h,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: C.primary, width: 3),
                      boxShadow: [BoxShadow(color: C.text.withValues(alpha: 0.35), blurRadius: 22, offset: const Offset(0, 10))],
                    ),
                    child: PartImage(url: widget.imageUrl, icon: widget.icon, height: h, radius: 11),
                  ),
                ),
              ),
            ));
          } else {
            // «+N» всплывает над корзиной
            final k = ((_c.value - flightPart) / (1 - flightPart)).clamp(0.0, 1.0);
            children.add(Positioned(
              left: widget.end.dx + 4,
              top: widget.end.dy - 18 - 30 * k,
              child: Opacity(
                opacity: k < 0.7 ? 1 : (1 - (k - 0.7) / 0.3),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
                  decoration: BoxDecoration(color: C.primary, borderRadius: BorderRadius.circular(999)),
                  child: Text('+${widget.quantity}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14, decoration: TextDecoration.none)),
                ),
              ),
            ));
          }
          return Stack(children: children);
        },
      ),
    );
  }
}
