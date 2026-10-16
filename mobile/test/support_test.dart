import 'package:flutter_test/flutter_test.dart';
import 'package:nsrz_parts/screens/support_screen.dart';

void main() {
  test('обращение: разбор ответа сервера, с ответом НСРЗ и заказом', () {
    final t = Ticket.fromJson({
      'id': 7,
      'number': 'ОБР-000007',
      'category': 'ORDER',
      'categoryTitle': 'Вопрос по заказу',
      'message': 'Когда будет готов заказ?',
      'status': 'RESOLVED',
      'statusTitle': 'Решено',
      'reply': 'Завтра к 12:00',
      'repliedAt': '2026-10-16T09:00:00.000Z',
      'createdAt': '2026-10-16T07:30:00.000Z',
      'order': {'id': 141, 'number': 'НСРЗ-000141'},
    });
    expect(t.number, 'ОБР-000007');
    expect(t.status, 'RESOLVED');
    expect(t.reply, 'Завтра к 12:00');
    expect(t.orderNumber, 'НСРЗ-000141');
    expect(t.repliedAt, isNotNull);
  });

  test('обращение без ответа и без заказа', () {
    final t = Ticket.fromJson({
      'id': 8,
      'number': 'ОБР-000008',
      'category': 'IDEA',
      'categoryTitle': 'Предложение',
      'message': 'Нужны push-уведомления',
      'status': 'NEW',
      'statusTitle': 'Новое',
      'reply': null,
      'repliedAt': null,
      'createdAt': '2026-10-16T07:30:00.000Z',
      'order': null,
    });
    expect(t.reply, isNull);
    expect(t.orderNumber, isNull);
  });
}
