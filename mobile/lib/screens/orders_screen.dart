import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/format.dart';
import '../core/providers.dart';
import '../theme.dart';
import '../widgets/common.dart';

const _filters = [('ALL', 'Все'), ('ACTIVE', 'В работе'), ('COMPLETED', 'Завершённые'), ('REJECTED', 'Отклонённые')];

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String _status = 'ALL';
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // статусы меняет НСРЗ — подтягиваем изменения каждые 20 секунд
    _timer = Timer.periodic(const Duration(seconds: 20), (_) => ref.invalidate(ordersProvider(_status)));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(ordersProvider(_status));
    return Scaffold(
      appBar: AppBar(title: const Text('Мои заказы')),
      body: Column(children: [
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
            for (final (code, title) in _filters)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(label: Text(title), selected: _status == code, onSelected: (_) => setState(() => _status = code)),
              ),
          ]),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(ordersProvider(_status).future),
            child: async.when(
              skipLoadingOnReload: true,
              loading: () => const SkeletonList(count: 4, height: 110),
              error: (e, _) => ListView(children: [ErrorView(e, onRetry: () => ref.invalidate(ordersProvider(_status)))]),
              data: (orders) => orders.isEmpty
                  ? ListView(children: [
                      const SizedBox(height: 60),
                      MessageView(icon: Icons.receipt_long_outlined, title: 'Заказов пока нет', action: 'Найти запчасти', onAction: () => context.go('/catalog')),
                    ])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      itemCount: orders.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (context, i) {
                        final o = orders[i];
                        return Card(
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            onTap: () => context.push('/order/${o.id}'),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(children: [
                                  Expanded(child: Text(o.number, style: mono.copyWith(fontSize: 17, color: C.primary))),
                                  Text(money(o.total), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                                ]),
                                const SizedBox(height: 2),
                                Text('${ago(o.createdAt)} · ${o.vesselName}', style: const TextStyle(color: C.text2, fontSize: 13)),
                                const SizedBox(height: 8),
                                Text(
                                  o.preview.join(', ') + (o.itemsCount > o.preview.length ? ' и ещё ${o.itemsCount - o.preview.length}' : ''),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 14),
                                ),
                                const SizedBox(height: 10),
                                Row(children: [
                                  Flexible(child: StatusChip(o.status, o.statusTitle)),
                                  const Spacer(),
                                  const Icon(Icons.chevron_right_rounded, color: C.text3),
                                ]),
                              ]),
                            ),
                          ),
                        ).animate(key: ValueKey('$_status-${o.id}'), delay: (i < 8 ? 40 * i : 0).ms).fadeIn(duration: 280.ms).slideY(begin: 0.1);
                      },
                    ),
            ),
          ),
        ),
      ]),
    );
  }
}
