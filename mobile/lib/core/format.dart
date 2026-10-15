import 'package:intl/intl.dart';

final _money = NumberFormat.decimalPattern('ru');
final _dateTime = DateFormat('dd.MM.yyyy · HH:mm', 'ru');
final _time = DateFormat('HH:mm', 'ru');
final _dayMonth = DateFormat('d MMMM', 'ru');

String money(num v) => '${_money.format(v)} ₽';
String dateTime(DateTime? d) => d == null ? '—' : _dateTime.format(d);

String ago(DateTime? d) {
  if (d == null) return '—';
  final diff = DateTime.now().difference(d);
  if (diff.inSeconds < 60) return 'только что';
  if (diff.inMinutes < 60) return '${diff.inMinutes} мин назад';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  if (day == today) return 'сегодня в ${_time.format(d)}';
  if (day == today.subtract(const Duration(days: 1))) return 'вчера в ${_time.format(d)}';
  return '${_dayMonth.format(d)} в ${_time.format(d)}';
}

String plural(int n, String one, String few, String many) {
  final m10 = n % 10, m100 = n % 100;
  if (m10 == 1 && m100 != 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
