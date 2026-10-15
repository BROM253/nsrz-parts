import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/providers.dart';
import '../theme.dart';
import '../widgets/common.dart';

class PartScreen extends ConsumerStatefulWidget {
  const PartScreen({super.key, required this.id});
  final int id;

  @override
  ConsumerState<PartScreen> createState() => _PartScreenState();
}

class _PartScreenState extends ConsumerState<PartScreen> {
  int _qty = 1;
  bool _busy = false;

  Future<void> _add(Part p) async {
    setState(() => _busy = true);
    try {
      await ref.read(cartProvider.notifier).add(p.id, _qty);
      HapticFeedback.mediumImpact();
      ref.invalidate(partProvider(p.id));
      if (!mounted) return;
      showMessage(context, 'Добавлено: $_qty ${p.unit}', action: SnackBarAction(label: 'В корзину', textColor: C.accent, onPressed: () => context.go('/cart')));
      setState(() => _qty = 1);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(partProvider(widget.id));
    final inCart = ref.watch(cartProvider).value?.quantityOf(widget.id) ?? 0;
    final user = ref.watch(sessionProvider).user;

    return Scaffold(
      appBar: AppBar(title: const Text('Запчасть')),
      body: async.when(
        loading: () => const SkeletonList(count: 3, height: 140),
        error: (e, _) => ErrorView(e, onRetry: () => ref.invalidate(partProvider(widget.id))),
        data: (p) {
          final fits = user?.vessels.where((v) => p.vesselTypes.contains(v.vesselType)).toList() ?? [];
          return RefreshIndicator(
            onRefresh: () => ref.refresh(partProvider(widget.id).future),
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Hero(tag: 'part-icon-${p.id}', child: CategoryIcon(p.categoryIcon, size: 72)),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: C.primaryTint, borderRadius: BorderRadius.circular(999)),
                          child: Text(p.categoryName, style: const TextStyle(color: C.primaryDark, fontWeight: FontWeight.w600, fontSize: 13)),
                        ).animate().fadeIn(delay: 150.ms),
                      ),
                    ]),
                    const SizedBox(height: 16),
                    Text(p.name, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800, letterSpacing: -0.4, height: 1.2)).animate().fadeIn(delay: 100.ms).slideY(begin: 0.15),
                    const SizedBox(height: 10),
                    AvailabilityBadge(p),
                    const SizedBox(height: 16),
                    _NumberRow('Каталожный номер НСРЗ', p.catalogNumber),
                    if (p.manufacturerPartNumber != null) _NumberRow('Номер производителя', p.manufacturerPartNumber!),
                  ]),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text.rich(TextSpan(children: [
                      TextSpan(text: money(p.price), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.6)),
                      TextSpan(text: '  за ${p.unit}', style: const TextStyle(color: C.text2)),
                    ])),
                    const SizedBox(height: 12),
                    if (p.stock.availability != 'ON_ORDER') ...[
                      _InfoRow('На складе', '${p.stock.quantity} ${p.unit}'),
                      _InfoRow('В резерве по заказам', '${p.stock.reserved} ${p.unit}'),
                      _InfoRow('Доступно для заказа', '${p.stock.available} ${p.unit}', color: p.stock.available > 0 ? C.success : C.danger),
                    ] else
                      _InfoRow('Срок поставки', '${p.leadTimeDays} дн.'),
                    _InfoRow('Остатки обновлены', dateTime(p.stock.updatedAt)),
                  ]),
                ),
              ).animate().fadeIn(delay: 120.ms, duration: 350.ms).slideY(begin: 0.08),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Описание', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const SizedBox(height: 6),
                    Text(p.description ?? '—', style: const TextStyle(color: C.text2, height: 1.5)),
                    const SizedBox(height: 16),
                    const Text('Подходит для судов', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final t in p.vesselTypes)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(color: C.tealSoft, borderRadius: BorderRadius.circular(999)),
                          child: Text(t, style: const TextStyle(color: C.teal, fontWeight: FontWeight.w600, fontSize: 13)),
                        ),
                    ]),
                    if (fits.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Row(children: [
                        const Icon(Icons.verified_rounded, color: C.success, size: 20),
                        const SizedBox(width: 6),
                        Expanded(child: Text('Подходит вашим судам: ${fits.map((v) => v.name).join(', ')}', style: const TextStyle(color: C.success, fontWeight: FontWeight.w600))),
                      ]),
                    ],
                  ]),
                ),
              ).animate().fadeIn(delay: 200.ms, duration: 350.ms).slideY(begin: 0.08),
            ]),
          );
        },
      ),
      bottomNavigationBar: async.value == null ? null : _BuyBar(part: async.value!, inCart: inCart, qty: _qty, busy: _busy, onQty: (v) => setState(() => _qty = v), onAdd: () => _add(async.value!)),
    );
  }
}

class _BuyBar extends StatelessWidget {
  const _BuyBar({required this.part, required this.inCart, required this.qty, required this.busy, required this.onQty, required this.onAdd});
  final Part part;
  final int inCart;
  final int qty;
  final bool busy;
  final ValueChanged<int> onQty;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final max = (part.stock.maxOrder - inCart).clamp(0, 999);
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.paddingOf(context).bottom + 12),
      decoration: BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: C.text.withValues(alpha: 0.08), blurRadius: 20, offset: const Offset(0, -4))]),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (inCart > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              onTap: () => context.go('/cart'),
              borderRadius: BorderRadius.circular(10),
              child: Row(children: [
                const Icon(Icons.check_circle_rounded, color: C.success, size: 20),
                const SizedBox(width: 6),
                Expanded(child: Text('В корзине: $inCart ${part.unit}', style: const TextStyle(color: C.success, fontWeight: FontWeight.w600))),
                const Text('Перейти в корзину →', style: TextStyle(color: C.primary, fontWeight: FontWeight.w700)),
              ]),
            ),
          ).animate().fadeIn().slideY(begin: 0.4),
        if (part.stock.orderable && max > 0)
          Row(children: [
            QtyStepper(value: qty.clamp(1, max), max: max, onChanged: onQty),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: busy ? null : onAdd,
                child: busy
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : FittedBox(child: Text('В корзину · ${money(part.price * qty.clamp(1, max))}')),
              ),
            ),
          ])
        else
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: C.dangerSoft, borderRadius: BorderRadius.circular(14)),
            child: Text(
              inCart > 0 && part.stock.orderable
                  ? 'В корзине уже весь доступный остаток.'
                  : part.stock.allReserved
                      ? 'Весь остаток зарезервирован по другим заказам. Загляните позже.'
                      : 'Сейчас нет на складе. Отдел продаж НСРЗ подскажет срок поставки.',
              style: const TextStyle(color: C.danger, fontWeight: FontWeight.w600),
            ),
          ),
      ]),
    );
  }
}

class _NumberRow extends StatelessWidget {
  const _NumberRow(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.fromLTRB(14, 8, 4, 8),
        decoration: BoxDecoration(color: C.surfaceWarm, borderRadius: BorderRadius.circular(12), border: Border.all(color: C.border)),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(color: C.text3, fontSize: 12)),
              Text(value, style: mono.copyWith(fontSize: 16)),
            ]),
          ),
          IconButton(
            tooltip: 'Скопировать',
            icon: const Icon(Icons.copy_rounded, size: 18, color: C.text2),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: value));
              showMessage(context, 'Номер скопирован');
            },
          ),
        ]),
      );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(this.label, this.value, {this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.border))),
        child: Row(children: [
          Expanded(child: Text(label, style: const TextStyle(color: C.text2))),
          Text(value, style: TextStyle(fontWeight: FontWeight.w700, color: color)),
        ]),
      );
}
