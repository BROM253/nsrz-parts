import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Ошибка API с понятным сообщением для пользователя.
class ApiException implements Exception {
  final int status;
  final String message;
  final Map<String, dynamic> body;
  ApiException(this.status, this.message, [this.body = const {}]);

  String? get code => body['code'] as String?;

  @override
  String toString() => message;
}

/// Адрес сервера при сборке: flutter build apk --dart-define=API_URL=https://...
const _buildTimeUrl = String.fromEnvironment('API_URL');

/// HTTP-клиент: подставляет токен, сам обновляет его по refresh-токену, переводит ошибки в ApiException.
class ApiClient {
  ApiClient(this.prefs) {
    _dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
    ));
    _dio.interceptors.add(QueuedInterceptorsWrapper(
      onRequest: (options, handler) {
        options.baseUrl = '$serverUrl/api';
        final token = accessToken;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (error, handler) async {
        final path = error.requestOptions.path;
        if (error.response?.statusCode == 401 && refreshToken != null && !path.startsWith('/auth/')) {
          if (await _refresh()) {
            final retry = error.requestOptions..headers['Authorization'] = 'Bearer $accessToken';
            try {
              return handler.resolve(await _dio.fetch(retry));
            } on DioException catch (e) {
              return handler.next(e);
            }
          }
          await saveTokens(null, null);
          onSessionExpired?.call();
        }
        handler.next(error);
      },
    ));
  }

  final SharedPreferences prefs;
  late final Dio _dio;
  VoidCallback? onSessionExpired;

  /// На вебе (iPhone, «На экран Домой») приложение открыто с того же сервера — адрес берём из страницы.
  String get serverUrl {
    if (kIsWeb) return Uri.base.origin;
    final saved = prefs.getString('serverUrl');
    if (saved != null && saved.isNotEmpty) return saved;
    return _buildTimeUrl.isNotEmpty ? _buildTimeUrl : 'http://192.168.1.10:3000';
  }

  Future<void> setServerUrl(String url) async {
    var u = url.trim();
    if (!u.startsWith('http')) u = 'https://$u';
    while (u.endsWith('/')) {
      u = u.substring(0, u.length - 1);
    }
    if (u.endsWith('/api')) u = u.substring(0, u.length - 4);
    await prefs.setString('serverUrl', u);
  }

  String? get accessToken => prefs.getString('accessToken');
  String? get refreshToken => prefs.getString('refreshToken');

  Future<void> saveTokens(String? access, String? refresh) async {
    if (access == null) {
      await prefs.remove('accessToken');
      await prefs.remove('refreshToken');
    } else {
      await prefs.setString('accessToken', access);
      await prefs.setString('refreshToken', refresh!);
    }
  }

  Future<bool> _refresh() async {
    try {
      final res = await Dio(BaseOptions(baseUrl: '$serverUrl/api', connectTimeout: const Duration(seconds: 15)))
          .post('/auth/refresh', data: {'refreshToken': refreshToken});
      await saveTokens(res.data['accessToken'], res.data['refreshToken']);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<dynamic> get(String path) => _call(() => _dio.get(path));
  Future<dynamic> post(String path, [Object? data]) => _call(() => _dio.post(path, data: data ?? {}));
  Future<dynamic> put(String path, [Object? data]) => _call(() => _dio.put(path, data: data ?? {}));
  Future<dynamic> delete(String path) => _call(() => _dio.delete(path));

  Future<List<int>> bytes(String path) async {
    final res = await _call(() => _dio.get<List<int>>(path, options: Options(responseType: ResponseType.bytes)));
    return res as List<int>;
  }

  /// Проверка адреса сервера (экран входа).
  Future<bool> ping([String? url]) async {
    try {
      final res = await Dio(BaseOptions(connectTimeout: const Duration(seconds: 8), receiveTimeout: const Duration(seconds: 8)))
          .get('${url ?? serverUrl}/api/health');
      return res.data['status'] == 'ok';
    } catch (_) {
      return false;
    }
  }

  Future<dynamic> _call(Future<Response> Function() run) async {
    try {
      return (await run()).data;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map) {
        final m = data['message'];
        final message = m is List ? m.join('. ') : '${m ?? 'Ошибка сервера (${e.response?.statusCode})'}';
        throw ApiException(e.response?.statusCode ?? 0, message, Map<String, dynamic>.from(data));
      }
      if (e.response == null) {
        throw ApiException(0, 'Нет связи с сервером. Проверьте интернет — на судне связь может быть медленной.');
      }
      throw ApiException(e.response!.statusCode ?? 0, 'Ошибка сервера (${e.response!.statusCode})');
    }
  }
}
