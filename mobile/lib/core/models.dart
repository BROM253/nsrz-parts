// Модели данных API «НСРЗ. Заказ запчастей» (те же, что у сайта).

num _n(dynamic v) => v is num ? v : num.tryParse('$v') ?? 0;
DateTime? _d(dynamic v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

class Vessel {
  final String id;
  final String name;
  final String? imoNumber;
  final String vesselType;

  Vessel.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        name = j['name'],
        imoNumber = j['imoNumber'],
        vesselType = j['vesselType'] is Map ? j['vesselType']['name'] : '${j['vesselType'] ?? ''}';
}

class Profile {
  final String id;
  final String fullName;
  final String role;
  final String? phone;
  final String? email;
  final String? companyName;
  final List<Vessel> vessels;

  Profile.fromJson(Map<String, dynamic> j)
      : id = j['id'],
        fullName = j['fullName'],
        role = j['role'],
        phone = j['phoneFormatted'] ?? j['phone'],
        email = j['email'],
        companyName = j['company']?['name'],
        vessels = [for (final v in (j['vessels'] as List? ?? [])) Vessel.fromJson(v)];

  String get firstName => fullName.split(' ').length > 1 ? fullName.split(' ')[1] : fullName;
  String get initials => fullName.split(' ').take(2).map((p) => p.isEmpty ? '' : p[0]).join();
}

class StockView {
  final String availability; // IN_STOCK / ON_ORDER / OUT_OF_STOCK
  final String availabilityTitle;
  final int quantity;
  final int reserved;
  final int available;
  final int maxOrder;
  final bool orderable;
  final bool allReserved;
  final DateTime? updatedAt;

  StockView.fromJson(Map<String, dynamic> j)
      : availability = j['availability'],
        availabilityTitle = j['availabilityTitle'] ?? '',
        quantity = _n(j['quantity']).toInt(),
        reserved = _n(j['reserved']).toInt(),
        available = _n(j['available']).toInt(),
        maxOrder = _n(j['maxOrder']).toInt(),
        orderable = j['orderable'] == true,
        allReserved = j['allReserved'] == true,
        updatedAt = _d(j['updatedAt']);
}

class Part {
  final int id;
  final String name;
  final String? description;
  final String catalogNumber;
  final String? manufacturerPartNumber;
  final String categoryName;
  final String? categoryIcon;
  final double price;
  final String unit;
  final int leadTimeDays;
  final List<String> vesselTypes;
  final StockView stock;

  Part.fromJson(Map<String, dynamic> j)
      : id = _n(j['id']).toInt(),
        name = j['name'],
        description = j['description'],
        catalogNumber = j['catalogNumber'],
        manufacturerPartNumber = j['manufacturerPartNumber'],
        categoryName = j['category']['name'],
        categoryIcon = j['category']['icon'],
        price = _n(j['price']).toDouble(),
        unit = j['unit'] ?? 'шт.',
        leadTimeDays = _n(j['leadTimeDays']).toInt(),
        vesselTypes = [for (final v in (j['vesselTypes'] as List? ?? [])) '$v'],
        stock = StockView.fromJson(j['stock']);
}

class PartsPage {
  final List<Part> items;
  final int total;
  final int page;
  final int pageSize;
  final DateTime? stockUpdatedAt;

  PartsPage.fromJson(Map<String, dynamic> j)
      : items = [for (final p in j['items']) Part.fromJson(p)],
        total = _n(j['total']).toInt(),
        page = _n(j['page']).toInt(),
        pageSize = _n(j['pageSize']).toInt(),
        stockUpdatedAt = _d(j['stockUpdatedAt']);
}

class NamedItem {
  final int id;
  final String name;
  final String? icon;
  final int count;
  NamedItem.fromJson(Map<String, dynamic> j)
      : id = _n(j['id']).toInt(),
        name = j['name'],
        icon = j['icon'],
        count = _n(j['partsCount']).toInt();
}

class DeliveryMethod {
  final String code;
  final String title;
  final String hint;
  DeliveryMethod.fromJson(Map<String, dynamic> j)
      : code = j['code'],
        title = j['title'],
        hint = j['hint'];
}

class Dictionaries {
  final List<NamedItem> vesselTypes;
  final List<NamedItem> categories;
  final List<DeliveryMethod> deliveryMethods;
  final DateTime? stockUpdatedAt;

  Dictionaries.fromJson(Map<String, dynamic> j)
      : vesselTypes = [for (final v in j['vesselTypes']) NamedItem.fromJson(v)],
        categories = [for (final v in j['categories']) NamedItem.fromJson(v)],
        deliveryMethods = [for (final v in j['deliveryMethods']) DeliveryMethod.fromJson(v)],
        stockUpdatedAt = _d(j['stockUpdatedAt']);
}

class CartLine {
  final Part part;
  final int quantity;
  final double lineTotal;
  final String? problem;
  CartLine.fromJson(Map<String, dynamic> j)
      : part = Part.fromJson(j['part']),
        quantity = _n(j['quantity']).toInt(),
        lineTotal = _n(j['lineTotal']).toDouble(),
        problem = j['problem'];
}

class Cart {
  final List<CartLine> items;
  final int count;
  final int positions;
  final double total;
  final bool hasProblems;

  const Cart.empty()
      : items = const [],
        count = 0,
        positions = 0,
        total = 0,
        hasProblems = false;

  Cart.fromJson(Map<String, dynamic> j)
      : items = [for (final l in j['items']) CartLine.fromJson(l)],
        count = _n(j['count']).toInt(),
        positions = _n(j['positions']).toInt(),
        total = _n(j['total']).toDouble(),
        hasProblems = j['hasProblems'] == true;

  int quantityOf(int partId) => items.where((l) => l.part.id == partId).fold(0, (s, l) => s + l.quantity);
}

class OrderSummary {
  final int id;
  final String number;
  final String status;
  final String statusTitle;
  final DateTime createdAt;
  final double total;
  final String vesselName;
  final int itemsCount;
  final List<String> preview;

  OrderSummary.fromJson(Map<String, dynamic> j)
      : id = _n(j['id']).toInt(),
        number = j['number'],
        status = j['status'],
        statusTitle = j['statusTitle'],
        createdAt = _d(j['createdAt'])!,
        total = _n(j['total']).toDouble(),
        vesselName = j['vessel']['name'],
        itemsCount = _n(j['itemsCount']).toInt(),
        preview = [for (final p in (j['preview'] as List? ?? [])) '$p'];
}

class OrderItem {
  final int partId;
  final String name;
  final String catalogNumber;
  final String unit;
  final int quantity;
  final double price;
  final double lineTotal;
  OrderItem.fromJson(Map<String, dynamic> j)
      : partId = _n(j['partId']).toInt(),
        name = j['name'],
        catalogNumber = j['catalogNumber'],
        unit = j['unit'] ?? 'шт.',
        quantity = _n(j['quantity']).toInt(),
        price = _n(j['price']).toDouble(),
        lineTotal = _n(j['lineTotal']).toDouble();
}

class TimelineStep {
  final String status;
  final String title;
  final bool done;
  final bool current;
  final DateTime? at;
  TimelineStep.fromJson(Map<String, dynamic> j)
      : status = j['status'],
        title = j['title'],
        done = j['done'] == true,
        current = j['current'] == true,
        at = _d(j['at']);
}

class HistoryEntry {
  final String title;
  final DateTime at;
  final String? comment;
  final String? by;
  HistoryEntry.fromJson(Map<String, dynamic> j)
      : title = j['title'],
        at = _d(j['at'])!,
        comment = j['comment'],
        by = j['by'];
}

class OrderDetail {
  final int id;
  final String number;
  final String status;
  final String statusTitle;
  final DateTime createdAt;
  final String deliveryTitle;
  final String? comment;
  final String? rejectReason;
  final DateTime? rejectedAt;
  final double total;
  final String vesselName;
  final String vesselInfo;
  final String companyName;
  final String createdBy;
  final List<OrderItem> items;
  final List<TimelineStep> timeline;
  final List<HistoryEntry> history;
  final bool duplicate;

  OrderDetail.fromJson(Map<String, dynamic> j)
      : id = _n(j['id']).toInt(),
        number = j['number'],
        status = j['status'],
        statusTitle = j['statusTitle'],
        createdAt = _d(j['createdAt'])!,
        deliveryTitle = j['deliveryTitle'],
        comment = j['comment'],
        rejectReason = j['rejectReason'],
        rejectedAt = _d(j['rejectedAt']),
        total = _n(j['total']).toDouble(),
        vesselName = j['vessel']['name'],
        vesselInfo = [j['vessel']['vesselType'], j['vessel']['imoNumber']].whereType<String>().join(' · '),
        companyName = j['company']['name'],
        createdBy = j['createdBy']['fullName'],
        items = [for (final i in j['items']) OrderItem.fromJson(i)],
        timeline = [for (final t in j['timeline']) TimelineStep.fromJson(t)],
        history = [for (final h in j['history']) HistoryEntry.fromJson(h)],
        duplicate = j['duplicate'] == true;
}
