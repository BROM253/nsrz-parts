import 'package:flutter/foundation.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/providers.dart';
import '../theme.dart';
import '../widgets/common.dart';

/// Версия приложения — уходит в обращение, чтобы поддержка знала, в какой версии ошибка.
const appVersion = '1.1.1'; // 1.1.0 — «Помощь и обратная связь» (этап 7); 1.1.1 — контраст выбранной темы

/// Техподдержка (этап 7): обращение из приложения и «Мои обращения» с ответами НСРЗ.
class Ticket {
  final int id;
  final String number;
  final String categoryTitle;
  final String message;
  final String status;
  final String statusTitle;
  final String? reply;
  final DateTime createdAt;
  final DateTime? repliedAt;
  final String? orderNumber;

  Ticket.fromJson(Map<String, dynamic> j)
      : id = j['id'] as int,
        number = j['number'] as String,
        categoryTitle = j['categoryTitle'] as String,
        message = j['message'] as String,
        status = j['status'] as String,
        statusTitle = j['statusTitle'] as String,
        reply = j['reply'] as String?,
        createdAt = DateTime.parse(j['createdAt'] as String).toLocal(),
        repliedAt = j['repliedAt'] == null ? null : DateTime.parse(j['repliedAt'] as String).toLocal(),
        orderNumber = (j['order'] as Map<String, dynamic>?)?['number'] as String?;
}

final myTicketsProvider = FutureProvider.autoDispose<List<Ticket>>((ref) async {
  final list = await ref.watch(apiProvider).get('/support') as List<dynamic>;
  return list.map((e) => Ticket.fromJson(e as Map<String, dynamic>)).toList();
});

const _categories = [
  ('QUESTION', 'Вопрос по работе', Icons.help_outline_rounded),
  ('ORDER', 'Вопрос по заказу', Icons.receipt_long_outlined),
  ('BUG', 'Ошибка', Icons.bug_report_outlined),
  ('IDEA', 'Предложение', Icons.lightbulb_outline_rounded),
];

class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  String _category = 'QUESTION';
  final _text = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    try {
      final t = await ref.read(apiProvider).post('/support', {
        'category': _category,
        'message': _text.text.trim(),
        'platform': kIsWeb ? 'iphone' : 'android',
        'appVersion': appVersion,
      }) as Map<String, dynamic>;
      _text.clear();
      ref.invalidate(myTicketsProvider);
      if (mounted) showMessage(context, 'Обращение ${t['number']} отправлено. Ответ придёт по SMS.');
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tickets = ref.watch(myTicketsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Помощь и обратная связь')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        const Text('Вопрос, ошибка или предложение — обращение получит отдел продаж НСРЗ. Ответ придёт по SMS и появится ниже.',
            style: TextStyle(color: C.text2)),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (code, title, icon) in _categories)
            ChoiceChip(
              selected: _category == code,
              onSelected: (_) => setState(() => _category = code),
              avatar: Icon(icon, size: 18, color: _category == code ? C.primaryDark : C.text2),
              label: Text(title),
              // явный тёмный цвет текста: тема даёт выбранному чипу белый текст, на светлом фоне он не читается
              labelStyle: TextStyle(color: _category == code ? C.primaryDark : C.text, fontWeight: _category == code ? FontWeight.w700 : FontWeight.w500),
              selectedColor: C.primarySoft,
              showCheckmark: false,
            ),
        ]),
        const SizedBox(height: 12),
        TextField(
          controller: _text,
          minLines: 4,
          maxLines: 8,
          maxLength: 2000,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(hintText: 'Опишите вопрос. Если что-то не работает — что вы делали и что произошло'),
        ),
        FilledButton.icon(
          onPressed: _sending || _text.text.trim().length < 5 ? null : _send,
          icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded),
          label: const Text('Отправить'),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(4, 24, 4, 10),
          child: Text('Мои обращения', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        ),
        tickets.when(
          loading: () => const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
          error: (e, _) => Text('Не удалось загрузить: $e', style: const TextStyle(color: C.danger)),
          data: (list) => list.isEmpty
              ? const Text('Обращений пока нет', style: TextStyle(color: C.text3))
              : Column(children: [
                  for (final (i, t) in list.indexed)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _TicketCard(t).animate(delay: (50 * i).ms).fadeIn().slideY(begin: 0.06),
                    ),
                ]),
        ),
      ]),
    );
  }
}

class _TicketCard extends StatelessWidget {
  final Ticket t;
  const _TicketCard(this.t);

  @override
  Widget build(BuildContext context) {
    final resolved = t.status == 'RESOLVED';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(t.number, style: const TextStyle(color: C.primary, fontWeight: FontWeight.w800)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: resolved ? C.successSoft : C.warningSoft, borderRadius: BorderRadius.circular(999)),
              child: Text(t.statusTitle, style: TextStyle(color: resolved ? C.success : C.warning, fontWeight: FontWeight.w700, fontSize: 12.5)),
            ),
          ]),
          const SizedBox(height: 4),
          Text('${t.categoryTitle} · ${dateTime(t.createdAt)}${t.orderNumber != null ? ' · ${t.orderNumber}' : ''}',
              style: const TextStyle(color: C.text3, fontSize: 12.5)),
          const SizedBox(height: 8),
          Text(t.message),
          if (t.reply != null) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: C.successSoft,
                borderRadius: BorderRadius.circular(10),
                border: const Border(left: BorderSide(color: C.success, width: 3)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Ответ НСРЗ · ${dateTime(t.repliedAt)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                const SizedBox(height: 4),
                Text(t.reply!),
              ]),
            ),
          ],
        ]),
      ),
    );
  }
}
