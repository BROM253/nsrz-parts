import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api.dart';
import 'core/providers.dart';
import 'core/router.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  final prefs = await SharedPreferences.getInstance();
  runApp(ProviderScope(
    overrides: [prefsProvider.overrideWithValue(prefs)],
    // ошибки 4xx (нет прав, не найдено, неверные данные) повторять бессмысленно
    retry: (count, error) {
      if (error is ApiException && error.status >= 400 && error.status < 500) return null;
      return count < 2 ? Duration(milliseconds: 600 * (count + 1)) : null;
    },
    child: const NsrzApp(),
  ));
}

class NsrzApp extends ConsumerWidget {
  const NsrzApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'НСРЗ · Запчасти',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: ref.watch(routerProvider),
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
    );
  }
}
