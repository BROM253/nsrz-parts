import 'package:material_ui/material_ui.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/providers.dart';

/// Нижнее меню: Поиск / Корзина / Заказы / Профиль. Значок корзины подпрыгивает при изменении.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(cartProvider).value?.count ?? 0;
    Widget cartIcon(IconData icon) => Badge(
          isLabelVisible: count > 0,
          label: Text('$count'),
          child: Icon(icon),
        ).animate(key: ValueKey(count)).scaleXY(begin: count > 0 ? 1.3 : 1, end: 1, duration: 450.ms, curve: Curves.elasticOut);

    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.search_rounded), label: 'Поиск'),
          NavigationDestination(icon: cartIcon(Icons.shopping_cart_outlined), selectedIcon: cartIcon(Icons.shopping_cart), label: 'Корзина'),
          const NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Заказы'),
          const NavigationDestination(icon: Icon(Icons.person_outline_rounded), selectedIcon: Icon(Icons.person_rounded), label: 'Профиль'),
        ],
      ),
    );
  }
}
