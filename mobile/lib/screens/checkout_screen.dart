import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/providers.dart';
import '../theme.dart';
import '../widgets/timeline.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String? _vesselId;
  String _delivery = 'PICKUP';
  final _comment = TextEditingController();
  bool _sending = false;
  ApiException? _error;
  OrderDetail? _done;

  /// Один ключ на одну попытку оформления: двойное нажатие или повтор после обрыва связи не создадут второй заказ.
  final _idempotencyKey = const Uuid().v4();

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final res = await ref.read(apiProvider).post('/orders', {
        'vesselId': _vesselId,
        'deliveryMethod': _delivery,
        if (_comment.text.trim().isNotEmpty) 'comment': _comment.text.trim(),
        'idempotencyKey': _idempotencyKey,
      });
      HapticFeedback.heavyImpact();
      setState(() => _done = OrderDetail.fromJson(res));
      ref.read(cartProvider.notifier).clearLocal();
      ref.invalidate(partsProvider);
    } on ApiException catch (e) {
      HapticFeedback.vibrate();
      setState(() => _error = e);
      ref.read(cartProvider.notifier).reload().ignore();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_done != null) return _Success(order: _done!);

    final user = ref.watch(sessionProvider).user!;
    final cart = ref.watch(cartProvider).value ?? const Cart.empty();
    final dict = ref.watch(dictionariesProvider).value;
    _vesselId ??= user.vessels.isNotEmpty ? user.vessels.first.id : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Оформление заказа')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        const _SectionTitle('1. Судно'),
        for (final (i, v) in user.vessels.indexed)
          _OptionCard(
            selected: _vesselId == v.id,
            title: v.name,
            subtitle: [v.vesselType, v.imoNumber].whereType<String>().join(' · '),
            icon: Icons.directions_boat_outlined,
            onTap: () => setState(() => _vesselId = v.id),
          ).animate(delay: (50 * i).ms).fadeIn().slideY(begin: 0.15),
        const _SectionTitle('2. Доставка'),
        for (final (i, d) in (dict?.deliveryMethods ?? <DeliveryMethod>[]).indexed)
          _OptionCard(
            selected: _delivery == d.code,
            title: d.title,
            subtitle: d.hint,
            icon: switch (d.code) { 'PICKUP' => Icons.warehouse_outlined, 'TO_BOARD' => Icons.anchor_outlined, _ => Icons.local_shipping_outlined },
            onTap: () => setState(() => _delivery = d.code),
          ).animate(delay: (50 * i + 100).ms).fadeIn().slideY(begin: 0.15),
        const _SectionTitle('3. Комментарий для НСРЗ'),
        TextField(controller: _comment, maxLines: 3, maxLength: 500, decoration: const InputDecoration(hintText: 'Например: нужно до отхода судна в пятницу')),
        const _SectionTitle('Ваш заказ'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              for (final l in cart.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: Text('${l.part.name} × ${l.quantity}')),
                    const SizedBox(width: 12),
                    Text(money(l.lineTotal), style: const TextStyle(fontWeight: FontWeight.w700)),
                  ]),
                ),
              const Divider(height: 20),
              Row(children: [
                const Expanded(child: Text('Итого', style: TextStyle(color: C.text2))),
                Text(money(cart.total), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              ]),
            ]),
          ),
        ),
        if (_error != null) _ErrorBanner(error: _error!).animate().fadeIn().shakeX(hz: 4, amount: 4),
      ]),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _sending || _vesselId == null || cart.items.isEmpty || cart.hasProblems ? null : _submit,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
            child: _sending ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)) : const Text('Отправить заказ'),
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 10),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
      );
}

class _OptionCard extends StatelessWidget {
  const _OptionCard({required this.selected, required this.title, required this.subtitle, required this.icon, required this.onTap});
  final bool selected;
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {
            HapticFeedback.selectionClick();
            onTap();
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: selected ? C.primaryTint : C.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: selected ? C.primary : C.border, width: 2),
            ),
            child: Row(children: [
              Icon(icon, color: selected ? C.primary : C.text2),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(subtitle, style: const TextStyle(color: C.text2, fontSize: 13)),
                ]),
              ),
              AnimatedScale(
                scale: selected ? 1 : 0,
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOutBack,
                child: const Icon(Icons.check_circle_rounded, color: C.primary),
              ),
            ]),
          ),
        ),
      );
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.error});
  final ApiException error;

  @override
  Widget build(BuildContext context) {
    final duplicate = error.code == 'DUPLICATE_ORDER';
    return Container(
      margin: const EdgeInsets.only(top: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: duplicate ? C.warningSoft : C.dangerSoft, borderRadius: BorderRadius.circular(14), border: Border.all(color: duplicate ? C.warning : C.danger)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(error.message, style: TextStyle(color: duplicate ? C.warning : C.danger, fontWeight: FontWeight.w600)),
        if (duplicate && error.body['orderId'] != null)
          TextButton(onPressed: () => context.pushReplacement('/order/${error.body['orderId']}'), child: Text('Открыть ${error.body['orderNumber']}')),
        if (error.code == 'NOT_ENOUGH_STOCK') TextButton(onPressed: () => context.pop(), child: const Text('Вернуться в корзину')),
      ]),
    );
  }
}

class _Success extends StatelessWidget {
  const _Success({required this.order});
  final OrderDetail order;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(children: [
                const SuccessCheck(size: 132),
                const SizedBox(height: 18),
                const Text('Заказ отправлен', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.6)).animate().fadeIn(delay: 700.ms).slideY(begin: 0.3),
                const SizedBox(height: 8),
                Text(order.number, style: mono.copyWith(fontSize: 26, color: C.primary)).animate().fadeIn(delay: 850.ms).scale(begin: const Offset(0.8, 0.8), curve: Curves.easeOutBack),
                const SizedBox(height: 12),
                Text('Статус: «${order.statusTitle}». Детали зарезервированы за вами. Как только склад НСРЗ подтвердит наличие, придёт SMS.',
                        textAlign: TextAlign.center, style: const TextStyle(color: C.text2, height: 1.5))
                    .animate()
                    .fadeIn(delay: 950.ms),
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(onPressed: () => context.pushReplacement('/order/${order.id}'), child: const Text('Следить за заказом')),
                ).animate().fadeIn(delay: 1050.ms).slideY(begin: 0.3),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(onPressed: () => context.go('/catalog'), child: const Text('Продолжить поиск')),
                ).animate().fadeIn(delay: 1150.ms),
              ]),
            ),
          ),
        ),
      );
}
