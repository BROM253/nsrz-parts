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

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(cartProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Корзина')),
      body: async.when(
        skipLoadingOnReload: true,
        loading: () => const SkeletonList(count: 3),
        error: (e, _) => ErrorView(e, onRetry: () => ref.invalidate(cartProvider)),
        data: (cart) => cart.items.isEmpty
            ? MessageView(
                icon: Icons.shopping_cart_outlined,
                title: 'Корзина пуста',
                text: 'Найдите нужные детали в каталоге — после отправки заказа они резервируются за вами.',
                action: 'Перейти к поиску',
                onAction: () => context.go('/catalog'),
              )
            : RefreshIndicator(
                onRefresh: () => ref.read(cartProvider.notifier).reload(),
                child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 16), children: [
                  Text('${cart.positions} ${plural(cart.positions, 'позиция', 'позиции', 'позиций')} · ${cart.count} ед. Смахните влево, чтобы удалить.',
                      style: const TextStyle(color: C.text2, fontSize: 13.5)),
                  const SizedBox(height: 12),
                  for (final (i, line) in cart.items.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CartLineTile(key: ValueKey(line.part.id), line: line).animate(delay: (40 * i).ms).fadeIn(duration: 280.ms).slideX(begin: 0.06),
                    ),
                ]),
              ),
      ),
      bottomNavigationBar: async.value == null || async.value!.items.isEmpty ? null : _Summary(cart: async.value!),
    );
  }
}

class _CartLineTile extends ConsumerWidget {
  const _CartLineTile({super.key, required this.line});
  final CartLine line;

  Future<void> _run(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, e.message, error: true);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = line.part;
    final notifier = ref.read(cartProvider.notifier);
    return Dismissible(
      key: ValueKey('dismiss-${p.id}'),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        decoration: BoxDecoration(color: C.danger, borderRadius: BorderRadius.circular(18)),
        child: const Row(mainAxisSize: MainAxisSize.min, children: [
          Text('Удалить', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
          SizedBox(width: 8),
          Icon(Icons.delete_outline_rounded, color: Colors.white),
        ]),
      ),
      onDismissed: (_) {
        HapticFeedback.mediumImpact();
        _run(context, () => notifier.remove(p.id));
        showMessage(context, '«${p.name}» удалено из корзины',
            action: SnackBarAction(label: 'Вернуть', textColor: C.accent, onPressed: () => _run(context, () => notifier.add(p.id, line.quantity))));
      },
      child: Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: line.problem != null ? C.danger : C.border, width: line.problem != null ? 1.5 : 1)),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => context.push('/part/${p.id}'),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                CategoryIcon(p.categoryIcon, size: 42),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    Text(p.catalogNumber, style: mono.copyWith(fontSize: 12.5, color: C.text3)),
                    const SizedBox(height: 6),
                    AvailabilityBadge(p),
                  ]),
                ),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                QtyStepper(
                  value: line.quantity,
                  max: line.quantity > p.stock.maxOrder ? line.quantity : p.stock.maxOrder,
                  onChanged: (v) => _run(context, () => notifier.setQuantity(p.id, v)),
                ),
                const Spacer(),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Text(money(line.lineTotal), key: ValueKey(line.lineTotal), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                  ),
                  Text('${money(p.price)} × ${line.quantity}', style: const TextStyle(color: C.text3, fontSize: 12.5)),
                ]),
              ]),
              if (line.problem != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.warning_amber_rounded, color: C.danger, size: 18),
                    const SizedBox(width: 6),
                    Expanded(child: Text('${line.problem}. Уменьшите количество или удалите позицию.', style: const TextStyle(color: C.danger, fontSize: 13.5))),
                  ]),
                ).animate().fadeIn().shakeX(hz: 4, amount: 3),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.cart});
  final Cart cart;

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: C.text.withValues(alpha: 0.08), blurRadius: 20, offset: const Offset(0, -4))]),
        child: SafeArea(
          top: false,
          child: Row(children: [
            Expanded(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Итого', style: TextStyle(color: C.text2, fontSize: 13)),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                  child: Text(money(cart.total), key: ValueKey(cart.total), style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
                ),
              ]),
            ),
            FilledButton(
              onPressed: cart.hasProblems ? null : () => context.push('/checkout'),
              child: const Text('Оформить заказ'),
            ),
          ]),
        ),
      );
}
