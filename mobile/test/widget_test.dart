import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:nsrz_parts/core/format.dart';
import 'package:nsrz_parts/core/models.dart';
import 'package:nsrz_parts/widgets/common.dart';

Map<String, dynamic> partJson({String availability = 'IN_STOCK', int qty = 12, int reserved = 0, bool allReserved = false}) => {
      'id': 1,
      'name': 'Фильтр топливный тонкой очистки',
      'catalogNumber': 'НСРЗ-ГД-01427',
      'manufacturerPartNumber': '6L20-FF-118',
      'category': {'id': 1, 'name': 'Главный двигатель', 'icon': 'engine'},
      'price': 18450,
      'unit': 'шт.',
      'leadTimeDays': 7,
      'vesselTypes': ['Сухогруз', 'Танкер'],
      'stock': {
        'availability': availability,
        'availabilityTitle': '',
        'quantity': qty,
        'reserved': reserved,
        'available': (qty - reserved).clamp(0, 999),
        'maxOrder': availability == 'ON_ORDER' ? 999 : (qty - reserved).clamp(0, 999),
        'orderable': availability == 'ON_ORDER' || qty > reserved,
        'allReserved': allReserved,
        'updatedAt': '2026-10-15T05:00:00.000Z',
      },
    };

Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: Center(child: child)));

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('Форматирование', () {
    test('деньги в рублях', () => expect(money(18450).replaceAll(' ', ' '), '18 450 ₽'));
    test('склонение', () {
      expect(plural(1, 'позиция', 'позиции', 'позиций'), 'позиция');
      expect(plural(3, 'позиция', 'позиции', 'позиций'), 'позиции');
      expect(plural(11, 'позиция', 'позиции', 'позиций'), 'позиций');
      expect(plural(22, 'позиция', 'позиции', 'позиций'), 'позиции');
    });
  });

  group('Модели', () {
    test('запчасть разбирается из ответа API', () {
      final p = Part.fromJson(partJson(qty: 12, reserved: 10));
      expect(p.catalogNumber, 'НСРЗ-ГД-01427');
      expect(p.stock.available, 2);
      expect(p.stock.maxOrder, 2);
      expect(p.vesselTypes, contains('Танкер'));
    });

    test('корзина считает количество запчасти', () {
      final cart = Cart.fromJson({
        'items': [
          {'part': partJson(), 'quantity': 3, 'lineTotal': 55350, 'problem': null},
        ],
        'count': 3,
        'positions': 1,
        'total': 55350,
        'hasProblems': false,
      });
      expect(cart.quantityOf(1), 3);
      expect(cart.quantityOf(2), 0);
    });
  });

  group('Виджеты', () {
    testWidgets('бейдж «в наличии» показывает свободный остаток', (t) async {
      await t.pumpWidget(wrap(AvailabilityBadge(Part.fromJson(partJson(qty: 12, reserved: 4)))));
      expect(find.text('В наличии · 8 шт.'), findsOneWidget);
    });

    testWidgets('бейдж «всё в резерве»', (t) async {
      await t.pumpWidget(wrap(AvailabilityBadge(Part.fromJson(partJson(availability: 'OUT_OF_STOCK', qty: 5, reserved: 5, allReserved: true)))));
      expect(find.text('Всё в резерве'), findsOneWidget);
    });

    testWidgets('бейдж «под заказ» со сроком поставки', (t) async {
      await t.pumpWidget(wrap(AvailabilityBadge(Part.fromJson(partJson(availability: 'ON_ORDER', qty: 0)))));
      expect(find.text('Под заказ · 7 дн.'), findsOneWidget);
    });

    testWidgets('счётчик не даёт выбрать больше остатка', (t) async {
      var value = 2;
      await t.pumpWidget(wrap(StatefulBuilder(
        builder: (context, setState) => QtyStepper(value: value, max: 3, onChanged: (v) => setState(() => value = v)),
      )));
      await t.tap(find.byIcon(Icons.add));
      await t.pumpAndSettle();
      expect(value, 3);
      await t.tap(find.byIcon(Icons.add)); // на максимуме кнопка отключена
      await t.pumpAndSettle();
      expect(value, 3);
    });
  });
}
