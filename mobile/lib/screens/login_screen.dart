import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api.dart';
import '../core/providers.dart';
import '../theme.dart';

const _demo = [
  ('Черноморский флот', '+7 900 000-00-01'),
  ('Азов-Транс', '+7 900 000-00-02'),
  ('Рыбак Кубани (почта)', 'sergeeva@rybak-kuban.ru'),
];

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _login = TextEditingController();
  final _code = TextEditingController();
  final _codeFocus = FocusNode();
  Map<String, dynamic>? _sent;
  String? _error;
  bool _loading = false;
  int _shake = 0;
  int _left = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _login.dispose();
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  Future<void> _requestCode([String? value]) async {
    final login = value ?? _login.text;
    if (login.trim().isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await ref.read(apiProvider).post('/auth/request-code', {'login': login});
      _login.text = login;
      _code.clear();
      setState(() {
        _sent = Map<String, dynamic>.from(res);
        _left = (res['resendInSec'] as num).toInt();
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _left = (_left - 1).clamp(0, 999)));
      Future.delayed(const Duration(milliseconds: 350), () => _codeFocus.requestFocus());
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verify(String code) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = Map<String, dynamic>.from(await ref.read(apiProvider).post('/auth/verify', {'login': _login.text, 'code': code}));
      if (res['user']['role'] != 'OWNER') {
        // приложение — для судовладельцев; сотрудники работают в веб-панели
        setState(() {
          _error = 'Это приложение для судовладельцев. Сотрудникам НСРЗ — веб-панель: адрес сервера/panel';
          _sent = null;
        });
        return;
      }
      await ref.read(sessionProvider.notifier).signIn(res);
      HapticFeedback.mediumImpact();
    } on ApiException catch (e) {
      HapticFeedback.heavyImpact();
      _code.clear();
      setState(() {
        _error = e.message;
        _shake++;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _editServer() async {
    final api = ref.read(apiProvider);
    final ctrl = TextEditingController(text: api.serverUrl);
    String? status;
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Адрес сервера'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Адрес, который показывает окно сервера НСРЗ (например, https://….trycloudflare.com).', style: TextStyle(color: C.text2, fontSize: 14)),
            const SizedBox(height: 12),
            TextField(controller: ctrl, keyboardType: TextInputType.url, autocorrect: false, decoration: const InputDecoration(hintText: 'https://…')),
            if (status != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(status!, style: TextStyle(color: status!.startsWith('✓') ? C.success : C.danger, fontWeight: FontWeight.w600))),
          ]),
          actions: [
            TextButton(
              onPressed: () async {
                setLocal(() => status = 'Проверяю…');
                await api.setServerUrl(ctrl.text);
                final ok = await api.ping();
                setLocal(() => status = ok ? '✓ Сервер на связи' : '✕ Сервер не отвечает');
              },
              child: const Text('Проверить'),
            ),
            FilledButton(
              onPressed: () async {
                await api.setServerUrl(ctrl.text);
                if (ctx.mounted) Navigator.pop(ctx);
                setState(() {});
              },
              child: const Text('Сохранить'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(apiProvider);
    return Scaffold(
      body: SingleChildScrollView(
        child: Column(children: [
          // Тёплая шапка с волнами
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(24, MediaQuery.paddingOf(context).top + 28, 24, 40),
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFFA9502B), Color(0xFF8E3C1C), Color(0xFF5E2A15)], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
            ),
            child: Stack(children: [
              Positioned(right: -30, bottom: -40, child: Icon(Icons.waves_rounded, size: 180, color: Colors.white.withValues(alpha: 0.08))),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.anchor_rounded, color: Color(0xFFFFF7EF), size: 28),
                  ),
                  const SizedBox(width: 12),
                  const Text('АО «НСРЗ»', style: TextStyle(color: Color(0xFFFFF7EF), fontWeight: FontWeight.w700, fontSize: 17)),
                ]).animate().fadeIn(duration: 400.ms).slideY(begin: -0.3),
                const SizedBox(height: 28),
                const Text('Судовые запчасти\nсо склада завода', style: TextStyle(color: Colors.white, fontSize: 30, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -0.6))
                    .animate()
                    .fadeIn(delay: 100.ms, duration: 500.ms)
                    .slideY(begin: 0.2),
                const SizedBox(height: 10),
                Text('Найдите деталь, проверьте наличие и отправьте заказ за пару минут — без писем и звонков.',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontSize: 15, height: 1.45))
                    .animate()
                    .fadeIn(delay: 200.ms, duration: 500.ms),
              ]),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 320),
              switchInCurve: Curves.easeOutCubic,
              transitionBuilder: (child, a) => FadeTransition(
                opacity: a,
                child: SlideTransition(position: Tween(begin: const Offset(0.08, 0), end: Offset.zero).animate(a), child: child),
              ),
              child: _sent == null ? _loginStep() : _codeStep(),
            ),
          ),
          if (!kIsWeb)
            TextButton.icon(
              onPressed: _editServer,
              icon: const Icon(Icons.dns_outlined, size: 18),
              label: Text('Сервер: ${api.serverUrl.replaceFirst(RegExp(r'^https?://'), '')}', overflow: TextOverflow.ellipsis),
              style: TextButton.styleFrom(foregroundColor: C.text2),
            ),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }

  Widget _errorText() => AnimatedSize(
        duration: const Duration(milliseconds: 200),
        child: _error == null
            ? const SizedBox(width: double.infinity)
            : Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(_error!, style: const TextStyle(color: C.danger, fontWeight: FontWeight.w500)),
              ),
      );

  Widget _loginStep() => Column(key: const ValueKey('login'), crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Вход', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
        const SizedBox(height: 4),
        const Text('По номеру телефона или корпоративной почте — пришлём одноразовый код.', style: TextStyle(color: C.text2)),
        const SizedBox(height: 18),
        TextField(
          controller: _login,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          textInputAction: TextInputAction.go,
          onSubmitted: (_) => _requestCode(),
          decoration: const InputDecoration(prefixIcon: Icon(Icons.phone_outlined), hintText: '+7 900 000-00-00 или почта'),
        ),
        _errorText(),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _loading ? null : () => _requestCode(),
            child: _loading ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white)) : const Text('Получить код'),
          ),
        ),
        const SizedBox(height: 22),
        const Text('Демо-доступ для защиты проекта:', style: TextStyle(color: C.text3, fontSize: 13)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (i, d) in _demo.indexed)
            ActionChip(label: Text(d.$1), onPressed: _loading ? null : () => _requestCode(d.$2)).animate(delay: (80 * i).ms).fadeIn().slideY(begin: 0.3),
        ]),
      ]);

  Widget _codeStep() {
    final sent = _sent!;
    return Column(key: const ValueKey('code'), crossAxisAlignment: CrossAxisAlignment.start, children: [
      TextButton.icon(
        onPressed: () => setState(() {
          _sent = null;
          _error = null;
        }),
        icon: const Icon(Icons.arrow_back, size: 18),
        label: const Text('Другой номер'),
        style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: C.text2),
      ),
      const Text('Введите код', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4)),
      const SizedBox(height: 4),
      Text('${sent['channel'] == 'sms' ? 'SMS' : 'Письмо'} с кодом отправлено на ${sent['sentTo']}', style: const TextStyle(color: C.text2)),
      if (sent['devCode'] != null) ...[
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: C.accentSoft, borderRadius: BorderRadius.circular(12), border: Border.all(color: C.accent)),
          child: Text.rich(TextSpan(children: [
            const TextSpan(text: 'Демо-режим: код '),
            TextSpan(text: '${sent['devCode']}', style: mono.copyWith(fontSize: 16)),
            const TextSpan(text: ' (на реальном запуске он придёт только по SMS или почте)'),
          ]), style: const TextStyle(color: Color(0xFF7A4C0C))),
        ).animate().fadeIn().slideY(begin: -0.2),
      ],
      const SizedBox(height: 22),
      _PinBoxes(controller: _code, focusNode: _codeFocus, enabled: !_loading, onCompleted: _verify)
          .animate(key: ValueKey(_shake), target: _shake > 0 ? 1 : 0)
          .shakeX(hz: 6, amount: 8, duration: 420.ms),
      _errorText(),
      const SizedBox(height: 16),
      Center(
        child: _left > 0
            ? Text('Отправить код повторно через $_left с', style: const TextStyle(color: C.text3))
            : TextButton(onPressed: _loading ? null : () => _requestCode(), child: const Text('Отправить код ещё раз')),
      ),
    ]);
  }
}

/// Четыре поля для кода: одна скрытая строка ввода + анимированные ячейки.
class _PinBoxes extends StatelessWidget {
  const _PinBoxes({required this.controller, required this.focusNode, required this.onCompleted, this.enabled = true});
  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onCompleted;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      Opacity(
        opacity: 0,
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          enabled: enabled,
          autofocus: true,
          keyboardType: TextInputType.number,
          autofillHints: const [AutofillHints.oneTimeCode],
          maxLength: 4,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onChanged: (v) {
            if (v.length == 4) onCompleted(v);
          },
        ),
      ),
      GestureDetector(
        onTap: () => focusNode.requestFocus(),
        child: ListenableBuilder(
          listenable: Listenable.merge([controller, focusNode]),
          builder: (context, _) {
            final text = controller.text;
            return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 0; i < 4; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  width: 60,
                  height: 68,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: C.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: focusNode.hasFocus && i == text.length ? C.primary : C.borderStrong, width: focusNode.hasFocus && i == text.length ? 2 : 1.5),
                    boxShadow: i < text.length ? [BoxShadow(color: C.primary.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 4))] : null,
                  ),
                  child: i < text.length
                      ? Text(text[i], style: mono.copyWith(fontSize: 28)).animate().scale(begin: const Offset(0.6, 0.6), duration: 160.ms, curve: Curves.easeOutBack)
                      : null,
                ).animate(delay: (50 * i).ms).fadeIn(duration: 250.ms).slideY(begin: 0.3),
            ]);
          },
        ),
      ),
    ]);
  }
}
