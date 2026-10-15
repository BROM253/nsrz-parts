import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nsrz_parts/core/api.dart';
import 'package:nsrz_parts/core/providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Подменный API: можно «оборвать связь».
class FakeApi extends ApiClient {
  FakeApi(super.prefs);
  bool online = true;
  dynamic payload;

  @override
  Future<dynamic> get(String path) async {
    if (!online) throw ApiException(0, 'Нет связи');
    return payload;
  }
}

void main() {
  late SharedPreferences prefs;
  late FakeApi api;
  late ProviderContainer container;
  final probe = FutureProvider.family<(dynamic, DateTime?), String>((ref, path) => cachedGet(ref, path));

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    api = FakeApi(prefs);
    container = ProviderContainer(
      overrides: [prefsProvider.overrideWithValue(prefs), apiProvider.overrideWithValue(api)],
      retry: (_, _) => null,
    );
  });

  tearDown(() => container.dispose());

  test('при связи — свежие данные, без отметки «офлайн»', () async {
    api.payload = {'total': 36};
    final (data, offlineSince) = await container.read(probe('/parts?q=1').future);
    expect(data['total'], 36);
    expect(offlineSince, isNull);
  });

  test('связь пропала — показываем последний сохранённый ответ и его время', () async {
    api.payload = {'total': 36};
    await container.read(probe('/parts?q=2').future);
    api.online = false;
    container.invalidate(probe('/parts?q=2'));
    final (data, offlineSince) = await container.read(probe('/parts?q=2').future);
    expect(data['total'], 36);
    expect(offlineSince, isNotNull);
  });

  test('связи нет и сохранённого нет — честная ошибка', () async {
    api.online = false;
    await expectLater(container.read(probe('/parts?q=3').future), throwsA(isA<ApiException>()));
  });
}
