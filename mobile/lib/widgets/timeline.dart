import 'package:material_ui/material_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../core/format.dart';
import '../core/models.dart';
import '../theme.dart';

/// Вертикальная шкала статуса заказа: 5 шагов, пройденные заполняются по очереди.
class StatusTimeline extends StatelessWidget {
  const StatusTimeline({super.key, required this.steps, this.rejected = false});
  final List<TimelineStep> steps;
  final bool rejected;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      for (var i = 0; i < steps.length; i++) _Step(step: steps[i], index: i, last: i == steps.length - 1, nextDone: i < steps.length - 1 && steps[i + 1].done, rejected: rejected),
    ]);
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.step, required this.index, required this.last, required this.nextDone, required this.rejected});
  final TimelineStep step;
  final int index;
  final bool last;
  final bool nextDone;
  final bool rejected;

  @override
  Widget build(BuildContext context) {
    final color = rejected ? C.text3 : C.primary;
    final delay = (120 * index).ms;
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 36,
          child: Column(children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: step.done ? color : C.surface,
                border: Border.all(color: step.done ? color : C.border, width: 3),
                boxShadow: step.current && !rejected ? [BoxShadow(color: C.primary.withValues(alpha: 0.25), blurRadius: 0, spreadRadius: 5)] : null,
              ),
              child: Center(
                child: step.done
                    ? const Icon(Icons.check_rounded, size: 18, color: Colors.white)
                    : Text('${index + 1}', style: const TextStyle(color: C.text3, fontWeight: FontWeight.w700)),
              ),
            ).animate(delay: delay).scale(begin: const Offset(0.5, 0.5), duration: 350.ms, curve: Curves.easeOutBack).fadeIn(),
            if (!last)
              Expanded(
                child: Container(
                  width: 3,
                  margin: const EdgeInsets.symmetric(vertical: 3),
                  decoration: BoxDecoration(color: C.border, borderRadius: BorderRadius.circular(2)),
                  alignment: Alignment.topCenter,
                  child: nextDone
                      ? Container(decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)))
                          .animate(delay: delay + 150.ms)
                          .scaleY(begin: 0, end: 1, alignment: Alignment.topCenter, duration: 350.ms, curve: Curves.easeOut)
                      : null,
                ),
              ),
          ]),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(top: 5, bottom: last ? 0 : 22),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(step.title, style: TextStyle(fontWeight: step.current ? FontWeight.w800 : FontWeight.w600, color: step.done ? C.text : C.text3, fontSize: 15)),
              if (step.at != null) Text(dateTime(step.at), style: const TextStyle(color: C.text2, fontSize: 13)),
            ]),
          ).animate(delay: delay).fadeIn(duration: 300.ms).slideX(begin: 0.08),
        ),
      ]),
    );
  }
}

/// Анимированная галочка «заказ отправлен».
class SuccessCheck extends StatefulWidget {
  const SuccessCheck({super.key, this.size = 120});
  final double size;

  @override
  State<SuccessCheck> createState() => _SuccessCheckState();
}

class _SuccessCheckState extends State<SuccessCheck> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, _) => CustomPaint(size: Size.square(widget.size), painter: _CheckPainter(_c.value)),
      );
}

class _CheckPainter extends CustomPainter {
  _CheckPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2 - 4;
    final bg = Curves.easeOutBack.transform((t / 0.4).clamp(0, 1));
    canvas.drawCircle(c, r * bg, Paint()..color = C.successSoft);
    final ring = Curves.easeOut.transform(((t - 0.1) / 0.5).clamp(0, 1));
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -1.57, 6.283 * ring, false,
        Paint()
          ..color = C.success
          ..style = PaintingStyle.stroke
          ..strokeWidth = 5
          ..strokeCap = StrokeCap.round);
    final check = Curves.easeOut.transform(((t - 0.5) / 0.45).clamp(0, 1));
    if (check > 0) {
      final s = size.width / 120;
      final path = Path()
        ..moveTo(38 * s, 62 * s)
        ..lineTo(53 * s, 77 * s)
        ..lineTo(83 * s, 45 * s);
      final metric = path.computeMetrics().first;
      canvas.drawPath(metric.extractPath(0, metric.length * check),
          Paint()
            ..color = C.success
            ..style = PaintingStyle.stroke
            ..strokeWidth = 8 * s
            ..strokeCap = StrokeCap.round
            ..strokeJoin = StrokeJoin.round);
    }
  }

  @override
  bool shouldRepaint(_CheckPainter old) => old.t != t;
}
