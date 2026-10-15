import 'dart:async';

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

class CatalogScreen extends ConsumerStatefulWidget {
  const CatalogScreen({super.key});

  @override
  ConsumerState<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends ConsumerState<CatalogScreen> {
  late final _search = TextEditingController(text: ref.read(catalogFilterProvider).q);
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _setFilter(CatalogFilter f) => ref.read(catalogFilterProvider.notifier).set(f);

  /// Поиск с задержкой — не дёргаем сервер на каждую букву (важно на медленном спутниковом канале).
  void _onSearch(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _setFilter(ref.read(catalogFilterProvider).copy(q: v)));
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionProvider).user;
    final filter = ref.watch(catalogFilterProvider);
    final dict = ref.watch(dictionariesProvider).value;
    final parts = ref.watch(partsProvider);
    final myTypes = {for (final v in user?.vessels ?? <Vessel>[]) v.vesselType};

    return Scaffold(
      body: RefreshIndicator(
        color: C.primary,
        onRefresh: () async {
          ref.invalidate(dictionariesProvider);
          ref.invalidate(partsProvider);
          await ref.read(partsProvider.future);
        },
        child: CustomScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverToBoxAdapter(
              child: Container(
                padding: EdgeInsets.fromLTRB(20, MediaQuery.paddingOf(context).top + 16, 20, 20),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFFFFF8F0), Color(0xFFFBEADB)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    const Logo(size: 40),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Здравствуйте, ${user?.firstName ?? ''}!', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        Text(user?.companyName ?? '', style: const TextStyle(color: C.text2, fontSize: 13), overflow: TextOverflow.ellipsis),
                      ]),
                    ),
                  ]).animate().fadeIn(duration: 350.ms),
                  const SizedBox(height: 18),
                  const Text('Какая деталь нужна?', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.6)).animate().fadeIn(delay: 80.ms).slideY(begin: 0.2),
                  const SizedBox(height: 12),
                  Container(
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), boxShadow: [BoxShadow(color: C.text.withValues(alpha: 0.08), blurRadius: 24, offset: const Offset(0, 8))]),
                    child: TextField(
                      controller: _search,
                      onChanged: _onSearch,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (v) => _setFilter(filter.copy(q: v)),
                      decoration: InputDecoration(
                        hintText: 'Номер детали или название',
                        prefixIcon: const Icon(Icons.search_rounded, color: C.primary),
                        suffixIcon: _search.text.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close_rounded),
                                onPressed: () {
                                  _search.clear();
                                  _setFilter(filter.copy(q: ''));
                                  setState(() {});
                                },
                              ),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                      ),
                    ),
                  ).animate().fadeIn(delay: 140.ms).slideY(begin: 0.2),
                  const SizedBox(height: 6),
                  const Text('Например: 6L20 FF 118 — пробелы и дефисы не важны', style: TextStyle(color: C.text3, fontSize: 12.5)),
                ]),
              ),
            ),
            if (dict != null)
              SliverToBoxAdapter(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const SizedBox(height: 14),
                  _ChipRow(children: [
                    for (final t in dict.vesselTypes)
                      FilterChip(
                        label: Text(myTypes.contains(t.name) ? '${t.name} • ваш' : t.name),
                        selected: filter.vesselTypeId == t.id,
                        onSelected: (on) => _setFilter(filter.copy(vesselTypeId: () => on ? t.id : null)),
                      ),
                  ]),
                  const SizedBox(height: 8),
                  _ChipRow(children: [
                    for (final c in dict.categories)
                      FilterChip(
                        avatar: filter.categoryId == c.id ? null : CategoryIcon(c.icon, size: 22),
                        label: Text(c.name),
                        selected: filter.categoryId == c.id,
                        onSelected: (on) => _setFilter(filter.copy(categoryId: () => on ? c.id : null)),
                      ),
                  ]),
                ]).animate().fadeIn(delay: 180.ms, duration: 350.ms),
              ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
                child: Row(children: [
                  Expanded(
                    child: Text(
                      parts.value == null ? 'Ищем…' : '${parts.value!.total} ${plural(parts.value!.total, 'запчасть', 'запчасти', 'запчастей')}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                  ),
                  const Text('Только доступные', style: TextStyle(fontSize: 13, color: C.text2)),
                  Switch(value: filter.onlyAvailable, onChanged: (v) => _setFilter(filter.copy(onlyAvailable: v))),
                ]),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 10), child: Align(alignment: Alignment.centerLeft, child: SyncPill(parts.value?.stockUpdatedAt ?? dict?.stockUpdatedAt))),
            ),
            ...parts.when(
              skipLoadingOnReload: true,
              data: (page) => page.items.isEmpty
                  ? [
                      const SliverFillRemaining(
                        hasScrollBody: false,
                        child: MessageView(icon: Icons.search_off_rounded, title: 'Ничего не нашли', text: 'Проверьте номер или уберите фильтры. Если детали нет в каталоге — позвоните в отдел продаж НСРЗ.'),
                      ),
                    ]
                  : [
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                        sliver: SliverList.separated(
                          itemCount: page.items.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 12),
                          itemBuilder: (context, i) => PartCard(part: page.items[i])
                              .animate(key: ValueKey('${filter.toQuery()}-${page.items[i].id}'), delay: (i < 8 ? 45 * i : 0).ms)
                              .fadeIn(duration: 320.ms)
                              .slideY(begin: 0.12, curve: Curves.easeOutCubic),
                        ),
                      ),
                    ],
              loading: () => [
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList.separated(itemCount: 5, separatorBuilder: (_, _) => const SizedBox(height: 12), itemBuilder: (_, _) => const Skeleton(height: 150)),
                ),
              ],
              error: (e, _) => [SliverFillRemaining(hasScrollBody: false, child: ErrorView(e, onRetry: () => ref.invalidate(partsProvider)))],
            ),
          ],
        ),
      ),
    );
  }
}

class _ChipRow extends StatelessWidget {
  const _ChipRow({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 48,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: children.length,
          separatorBuilder: (_, _) => const SizedBox(width: 8),
          itemBuilder: (_, i) => children[i],
        ),
      );
}

/// Карточка запчасти в списке: значок «Hero» перелетает на экран детали.
class PartCard extends ConsumerStatefulWidget {
  const PartCard({super.key, required this.part});
  final Part part;

  @override
  ConsumerState<PartCard> createState() => _PartCardState();
}

class _PartCardState extends ConsumerState<PartCard> {
  bool _busy = false;
  bool _added = false;

  Future<void> _quickAdd() async {
    setState(() => _busy = true);
    try {
      await ref.read(cartProvider.notifier).add(widget.part.id, 1);
      HapticFeedback.lightImpact();
      setState(() => _added = true);
      Future.delayed(const Duration(milliseconds: 1600), () {
        if (mounted) setState(() => _added = false);
      });
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.part;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/part/${p.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Hero(tag: 'part-icon-${p.id}', child: CategoryIcon(p.categoryIcon)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(p.categoryName, style: const TextStyle(color: C.text3, fontSize: 12, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, height: 1.25)),
                ]),
              ),
            ]),
            const SizedBox(height: 10),
            Text(p.catalogNumber, style: mono.copyWith(fontSize: 13, color: C.text2)),
            if (p.manufacturerPartNumber != null) Text(p.manufacturerPartNumber!, style: mono.copyWith(fontSize: 13, color: C.text3)),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: Align(alignment: Alignment.centerLeft, child: AvailabilityBadge(p))),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: money(p.price), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                  TextSpan(text: ' / ${p.unit}', style: const TextStyle(color: C.text2, fontSize: 13)),
                ])),
              ),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                child: _added
                    ? const FilledButton.tonal(
                        key: ValueKey('added'),
                        onPressed: null,
                        child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.check_rounded, size: 18, color: C.success), SizedBox(width: 6), Text('Добавлено', style: TextStyle(color: C.success))]),
                      )
                    : FilledButton.icon(
                        key: const ValueKey('add'),
                        onPressed: p.stock.orderable && !_busy ? _quickAdd : null,
                        icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.add_shopping_cart_rounded, size: 18),
                        label: const Text('В корзину'),
                        style: FilledButton.styleFrom(minimumSize: const Size(48, 44), padding: const EdgeInsets.symmetric(horizontal: 14)),
                      ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}
