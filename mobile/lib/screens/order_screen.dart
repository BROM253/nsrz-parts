import 'dart:async';
import 'dart:io' show File;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/providers.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/part_image.dart';
import '../widgets/timeline.dart';

class OrderScreen extends ConsumerStatefulWidget {
  const OrderScreen({super.key, required this.id});
  final int id;

  @override
  ConsumerState<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends ConsumerState<OrderScreen> {
  Timer? _timer;
  bool _exporting = false;
  bool _repeating = false;
  int _pulse = 0;

  @override
  void initState() {
    super.initState();
    // смена статуса в панели НСРЗ появляется здесь в течение 15 секунд
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => ref.invalidate(orderProvider(widget.id)));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Экспорт детализации (ТЗ п. 4.1.2 Г): CSV для Excel — «Поделиться» в почту, мессенджер или файлы.
  Future<void> _export(OrderDetail o) async {
    setState(() => _exporting = true);
    try {
      final bytes = Uint8List.fromList(await ref.read(apiProvider).bytes('/orders/${o.id}/export.csv'));
      final name = '${o.number}.csv';
      XFile file;
      if (kIsWeb) {
        file = XFile.fromData(bytes, mimeType: 'text/csv', name: name);
      } else {
        final dir = await getTemporaryDirectory();
        final f = File('${dir.path}/$name');
        await f.writeAsBytes(bytes);
        file = XFile(f.path, mimeType: 'text/csv', name: name);
      }
      await SharePlus.instance.share(ShareParams(files: [file], subject: 'Заказ ${o.number}', fileNameOverrides: [name]));
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } catch (e) {
      if (mounted) showMessage(context, 'Не удалось поделиться файлом: $e', error: true);
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  /// «Повторить заказ»: позиции — в корзину; чего не хватает на складе, показываем.
  Future<void> _repeat(OrderDetail o) async {
    setState(() => _repeating = true);
    try {
      final skipped = await ref.read(cartProvider.notifier).repeat(o.id);
      if (!mounted) return;
      if (skipped.isNotEmpty) {
        await showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Не всё удалось добавить'),
            content: Text(skipped.join('\n\n')),
            actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Понятно'))],
          ),
        );
      } else {
        showMessage(context, 'Позиции заказа добавлены в корзину');
      }
      if (mounted) context.go('/cart');
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _repeating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderProvider(widget.id));
    // склад сменил статус, пока экран открыт, — сообщение, вибрация и «пульс» значка (как на сайте)
    ref.listen(orderProvider(widget.id), (prev, next) {
      final before = prev?.value?.status;
      final now = next.value;
      if (before != null && now != null && before != now.status) {
        HapticFeedback.mediumImpact();
        showMessage(context, now.status == 'REJECTED' ? 'Заказ ${now.number} отклонён: ${now.rejectReason}' : 'Заказ ${now.number}: «${now.statusTitle}»');
        setState(() => _pulse++);
      }
    });
    return Scaffold(
      appBar: AppBar(
        title: Text(async.value?.number ?? 'Заказ'),
        actions: [
          if (async.value != null)
            IconButton(
              tooltip: 'Экспорт в Excel (CSV)',
              onPressed: _exporting ? null : () => _export(async.value!),
              icon: _exporting ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.ios_share_rounded),
            ),
        ],
      ),
      bottomNavigationBar: async.value == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: OutlinedButton.icon(
                  onPressed: _repeating ? null : () => _repeat(async.value!),
                  icon: _repeating ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.replay_rounded),
                  label: const Text('Повторить заказ'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                ),
              ),
            ).animate().fadeIn(delay: 300.ms).slideY(begin: 0.5),
      body: async.when(
        skipLoadingOnReload: true,
        loading: () => const SkeletonList(count: 3, height: 160),
        error: (e, _) => ErrorView(e, onRetry: () => ref.invalidate(orderProvider(widget.id))),
        data: (o) => RefreshIndicator(
          onRefresh: () => ref.refresh(orderProvider(widget.id).future),
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  FittedBox(fit: BoxFit.scaleDown, child: Text(o.number, style: mono.copyWith(fontSize: 26, color: C.primary))),
                  const SizedBox(height: 8),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                    child: StatusChip(o.status, o.statusTitle, key: ValueKey(o.status)),
                  )
                      .animate(key: ValueKey(_pulse), autoPlay: _pulse > 0)
                      .scaleXY(begin: 1.25, end: 1, duration: 700.ms, curve: Curves.elasticOut)
                      .shimmer(duration: 1100.ms, color: Colors.white),
                  const SizedBox(height: 8),
                  Text('Оформлен ${dateTime(o.createdAt)} · обновляется автоматически', style: const TextStyle(color: C.text2, fontSize: 13)),
                  const SizedBox(height: 20),
                  StatusTimeline(key: ValueKey(o.status), steps: o.timeline, rejected: o.status == 'REJECTED'),
                  if (o.status == 'REJECTED')
                    Container(
                      margin: const EdgeInsets.only(top: 16),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: C.dangerSoft, borderRadius: BorderRadius.circular(14), border: Border.all(color: C.danger)),
                      child: Text('Заказ отклонён ${dateTime(o.rejectedAt)}. Причина: ${o.rejectReason}. Резерв снят — детали можно заказать заново.',
                          style: const TextStyle(color: C.danger, fontWeight: FontWeight.w600)),
                    ).animate().fadeIn().scale(begin: const Offset(0.96, 0.96)),
                ]),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Состав заказа', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 8),
                  for (final i in o.items)
                    Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.border))),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        PartImage(url: i.imageUrl, height: 42, width: 56, radius: 8),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(i.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text('${i.catalogNumber} · ${i.quantity} ${i.unit} × ${money(i.price)}', style: const TextStyle(color: C.text3, fontSize: 12.5)),
                          ]),
                        ),
                        Text(money(i.lineTotal), style: const TextStyle(fontWeight: FontWeight.w700)),
                      ]),
                    ),
                  const SizedBox(height: 10),
                  Row(children: [
                    const Expanded(child: Text('Итого', style: TextStyle(color: C.text2))),
                    Text(money(o.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
                  ]),
                ]),
              ),
            ).animate().fadeIn(delay: 150.ms).slideY(begin: 0.06),
            const SizedBox(height: 12),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Детали', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 8),
                  _Row('Судно', '${o.vesselName}\n${o.vesselInfo}'),
                  _Row('Доставка', o.deliveryTitle),
                  _Row('Оформил', o.createdBy),
                  if (o.comment != null) _Row('Комментарий', o.comment!),
                  const SizedBox(height: 12),
                  const Text('История', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 6),
                  for (final h in o.history.reversed)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Container(margin: const EdgeInsets.only(top: 6), width: 8, height: 8, decoration: const BoxDecoration(color: C.accent, shape: BoxShape.circle)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(h.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                            Text('${dateTime(h.at)}${h.by != null ? ' · ${h.by}' : ''}', style: const TextStyle(color: C.text3, fontSize: 12.5)),
                            if (h.comment != null) Text(h.comment!, style: const TextStyle(color: C.text2, fontSize: 13)),
                          ]),
                        ),
                      ]),
                    ),
                ]),
              ),
            ).animate().fadeIn(delay: 250.ms).slideY(begin: 0.06),
          ]),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 110, child: Text(label, style: const TextStyle(color: C.text2))),
          Expanded(child: Text(value)),
        ]),
      );
}
