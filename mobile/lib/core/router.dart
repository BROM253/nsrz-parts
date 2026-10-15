import 'package:animations/animations.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../screens/cart_screen.dart';
import '../screens/catalog_screen.dart';
import '../screens/checkout_screen.dart';
import '../screens/home_shell.dart';
import '../screens/login_screen.dart';
import '../screens/order_screen.dart';
import '../screens/orders_screen.dart';
import '../screens/part_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/splash_screen.dart';
import 'providers.dart';

/// Переход «общая ось»: новый экран мягко выезжает справа с затуханием.
CustomTransitionPage<void> _axis(GoRouterState state, Widget child) => CustomTransitionPage(
      key: state.pageKey,
      child: child,
      transitionDuration: const Duration(milliseconds: 320),
      reverseTransitionDuration: const Duration(milliseconds: 260),
      transitionsBuilder: (context, animation, secondary, child) => SharedAxisTransition(
        animation: animation,
        secondaryAnimation: secondary,
        transitionType: SharedAxisTransitionType.horizontal,
        fillColor: Theme.of(context).scaffoldBackgroundColor,
        child: child,
      ),
    );

/// Переход между вкладками нижнего меню — «сквозное затухание».
CustomTransitionPage<void> _fade(GoRouterState state, Widget child) => CustomTransitionPage(
      key: state.pageKey,
      child: child,
      transitionDuration: const Duration(milliseconds: 280),
      transitionsBuilder: (context, animation, secondary, child) => FadeThroughTransition(
        animation: animation,
        secondaryAnimation: secondary,
        fillColor: Theme.of(context).scaffoldBackgroundColor,
        child: child,
      ),
    );

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier(0);
  ref.listen(sessionProvider, (_, _) => refresh.value++);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/catalog',
    refreshListenable: refresh,
    redirect: (context, state) async {
      final session = ref.read(sessionProvider);
      final loc = state.matchedLocation;
      // nsrz://app/connect?server=https://… — ссылка со страницы /app на сайте: запоминаем адрес сервера
      if (loc == '/connect') {
        final server = state.uri.queryParameters['server'];
        if (server != null && server.isNotEmpty) await ref.read(apiProvider).setServerUrl(server);
        return session.user == null ? '/login' : '/catalog';
      }
      if (!session.ready) return loc == '/splash' ? null : '/splash';
      if (session.user == null) return loc == '/login' ? null : '/login';
      if (loc == '/login' || loc == '/splash') return '/catalog';
      return null;
    },
    routes: [
      GoRoute(path: '/splash', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/connect', builder: (_, _) => const SplashScreen()),
      GoRoute(path: '/login', pageBuilder: (_, s) => _fade(s, const LoginScreen())),
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/catalog', pageBuilder: (_, s) => _fade(s, const CatalogScreen()))]),
          StatefulShellBranch(routes: [GoRoute(path: '/cart', pageBuilder: (_, s) => _fade(s, const CartScreen()))]),
          StatefulShellBranch(routes: [GoRoute(path: '/orders', pageBuilder: (_, s) => _fade(s, const OrdersScreen()))]),
          StatefulShellBranch(routes: [GoRoute(path: '/profile', pageBuilder: (_, s) => _fade(s, const ProfileScreen()))]),
        ],
      ),
      GoRoute(path: '/part/:id', pageBuilder: (_, s) => _axis(s, PartScreen(id: int.parse(s.pathParameters['id']!)))),
      GoRoute(path: '/checkout', pageBuilder: (_, s) => _axis(s, const CheckoutScreen())),
      GoRoute(path: '/order/:id', pageBuilder: (_, s) => _axis(s, OrderScreen(id: int.parse(s.pathParameters['id']!)))),
    ],
  );
});
