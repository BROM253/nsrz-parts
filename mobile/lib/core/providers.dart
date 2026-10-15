import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'models.dart';

/// SharedPreferences подставляется в main() до запуска приложения.
final prefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError());

final apiProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(prefsProvider)));

// ---------- Сессия ----------

class Session {
  final Profile? user;
  final bool ready;
  const Session(this.user, this.ready);
}

class SessionNotifier extends Notifier<Session> {
  @override
  Session build() {
    final api = ref.watch(apiProvider);
    api.onSessionExpired = () => state = const Session(null, true);
    Future.microtask(_restore);
    return const Session(null, false);
  }

  ApiClient get _api => ref.read(apiProvider);
  SharedPreferences get _prefs => ref.read(prefsProvider);

  Future<void> _restore() async {
    if (_api.accessToken == null) {
      state = const Session(null, true);
      return;
    }
    try {
      final json = await _api.get('/me') as Map<String, dynamic>;
      await _prefs.setString('profile', jsonEncode(json));
      state = Session(Profile.fromJson(json), true);
    } on ApiException catch (e) {
      // нет связи — работаем с сохранённым профилем, данные подтянутся, когда связь появится
      final cached = _prefs.getString('profile');
      if (e.status == 0 && cached != null) {
        state = Session(Profile.fromJson(jsonDecode(cached)), true);
      } else {
        await _api.saveTokens(null, null);
        state = const Session(null, true);
      }
    }
  }

  Future<void> signIn(Map<String, dynamic> verifyResponse) async {
    await _api.saveTokens(verifyResponse['accessToken'], verifyResponse['refreshToken']);
    await _prefs.setString('profile', jsonEncode(verifyResponse['user']));
    state = Session(Profile.fromJson(verifyResponse['user']), true);
  }

  Future<void> signOut() async {
    final refresh = _api.refreshToken;
    if (refresh != null) {
      try {
        await _api.post('/auth/logout', {'refreshToken': refresh});
      } catch (_) {}
    }
    await _api.saveTokens(null, null);
    await _prefs.remove('profile');
    ref.invalidate(cartProvider);
    state = const Session(null, true);
  }
}

final sessionProvider = NotifierProvider<SessionNotifier, Session>(SessionNotifier.new);

// ---------- Офлайн-кэш ----------

/// GET с сохранением ответа на устройстве. Если связи нет (спутниковый канал оборвался),
/// возвращает последний сохранённый ответ и время, когда он был получен (ТЗ п. 4.5, риски ТЗ).
Future<(dynamic, DateTime?)> cachedGet(Ref ref, String path) async {
  final api = ref.read(apiProvider);
  final prefs = ref.read(prefsProvider);
  final key = 'cache:$path';
  try {
    final data = await api.get(path);
    await prefs.setString(key, jsonEncode({'at': DateTime.now().toIso8601String(), 'data': data}));
    return (data, null);
  } on ApiException catch (e) {
    final raw = e.status == 0 ? prefs.getString(key) : null;
    if (raw == null) rethrow;
    final saved = jsonDecode(raw) as Map<String, dynamic>;
    return (saved['data'], DateTime.parse(saved['at'] as String));
  }
}

// ---------- Справочники и каталог ----------

final dictionariesProvider = FutureProvider<Dictionaries>((ref) async {
  ref.watch(sessionProvider);
  final (data, _) = await cachedGet(ref, '/dictionaries');
  return Dictionaries.fromJson(data);
});

class CatalogFilter {
  final String q;
  final int? vesselTypeId;
  final int? categoryId;
  final bool onlyAvailable;
  const CatalogFilter({this.q = '', this.vesselTypeId, this.categoryId, this.onlyAvailable = false});

  CatalogFilter copy({String? q, int? Function()? vesselTypeId, int? Function()? categoryId, bool? onlyAvailable}) => CatalogFilter(
        q: q ?? this.q,
        vesselTypeId: vesselTypeId != null ? vesselTypeId() : this.vesselTypeId,
        categoryId: categoryId != null ? categoryId() : this.categoryId,
        onlyAvailable: onlyAvailable ?? this.onlyAvailable,
      );

  String toQuery() {
    final p = <String, String>{'pageSize': '50'};
    if (q.trim().isNotEmpty) p['q'] = q.trim();
    if (vesselTypeId != null) p['vesselTypeId'] = '$vesselTypeId';
    if (categoryId != null) p['categoryId'] = '$categoryId';
    if (onlyAvailable) p['onlyAvailable'] = 'true';
    return Uri(queryParameters: p).query;
  }
}

class CatalogFilterNotifier extends Notifier<CatalogFilter> {
  @override
  CatalogFilter build() => const CatalogFilter();
  void set(CatalogFilter f) => state = f;
}

final catalogFilterProvider = NotifierProvider<CatalogFilterNotifier, CatalogFilter>(CatalogFilterNotifier.new);

final partsProvider = FutureProvider<PartsPage>((ref) async {
  final filter = ref.watch(catalogFilterProvider);
  final (data, offlineSince) = await cachedGet(ref, '/parts?${filter.toQuery()}');
  return PartsPage.fromJson(data, offlineSince: offlineSince);
});

final partProvider = FutureProvider.autoDispose.family<Part, int>((ref, id) async {
  final (data, offlineSince) = await cachedGet(ref, '/parts/$id');
  return Part.fromJson(data, offlineSince: offlineSince);
});

// ---------- Корзина ----------

class CartNotifier extends AsyncNotifier<Cart> {
  @override
  Future<Cart> build() async {
    final session = ref.watch(sessionProvider);
    if (session.user == null) return const Cart.empty();
    return Cart.fromJson(await ref.read(apiProvider).get('/cart'));
  }

  ApiClient get _api => ref.read(apiProvider);

  Future<void> _apply(Future<dynamic> Function() call) async {
    final cart = Cart.fromJson(await call());
    state = AsyncData(cart);
    ref.invalidate(partsProvider);
  }

  /// Повторное добавление той же детали увеличивает количество — сервер не создаёт вторую строку.
  Future<void> add(int partId, int quantity) => _apply(() => _api.post('/cart/items', {'partId': partId, 'quantity': quantity}));
  Future<void> setQuantity(int partId, int quantity) => _apply(() => _api.put('/cart/items/$partId', {'quantity': quantity}));
  Future<void> remove(int partId) => _apply(() => _api.delete('/cart/items/$partId'));
  /// «Повторить заказ»: позиции прошлого заказа — в корзину. Возвращает то, чего не хватило на складе.
  Future<List<String>> repeat(int orderId) async {
    final res = await _api.post('/cart/repeat/$orderId');
    state = AsyncData(Cart.fromJson(res['cart']));
    ref.invalidate(partsProvider);
    return [
      for (final s in (res['skipped'] as List)) '${s['name']}: добавлено ${s['added']} из ${s['requested']} — ${s['reason']}',
    ];
  }

  void clearLocal() => state = const AsyncData(Cart.empty());
  Future<void> reload() async => state = AsyncData(Cart.fromJson(await _api.get('/cart')));
}

final cartProvider = AsyncNotifierProvider<CartNotifier, Cart>(CartNotifier.new);

// ---------- Заказы ----------

final ordersProvider = FutureProvider.autoDispose.family<List<OrderSummary>, String>((ref, status) async {
  final res = await ref.watch(apiProvider).get('/orders?status=$status');
  return [for (final o in res['items']) OrderSummary.fromJson(o)];
});

final orderProvider = FutureProvider.autoDispose.family<OrderDetail, int>((ref, id) async {
  return OrderDetail.fromJson(await ref.watch(apiProvider).get('/orders/$id'));
});
