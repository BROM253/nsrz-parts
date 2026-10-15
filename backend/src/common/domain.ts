import { Availability, DeliveryMethod, OrderStatus, Role } from '@prisma/client';

/** Роли сотрудников НСРЗ (доступ к панели). */
export const STAFF_ROLES: Role[] = [Role.SALES, Role.WAREHOUSE, Role.ADMIN];

/** «Под заказ» — склад не ограничивает количество, но разумный предел нужен. */
export const MAX_ON_ORDER_QTY = 999;

/** Статусы, в которых заказ держит резерв на складе. */
export const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.ASSEMBLING,
  OrderStatus.READY,
];

/** Статусная модель заказа (ТЗ п. 4.3): куда можно перейти из каждого статуса. */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.REJECTED],
  CONFIRMED: [OrderStatus.ASSEMBLING, OrderStatus.REJECTED],
  ASSEMBLING: [OrderStatus.READY],
  READY: [OrderStatus.COMPLETED],
  COMPLETED: [],
  REJECTED: [],
};

/** Пять шагов шкалы статуса (отклонение — отдельная ветка). */
export const STATUS_STEPS: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.ASSEMBLING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
];

export const STATUS_TITLES: Record<OrderStatus, string> = {
  PENDING: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждён',
  ASSEMBLING: 'Комплектуется',
  READY: 'Готов к выдаче / отправлен',
  COMPLETED: 'Завершён',
  REJECTED: 'Отклонён',
};

export const AVAILABILITY_TITLES: Record<Availability, string> = {
  IN_STOCK: 'В наличии',
  ON_ORDER: 'Под заказ',
  OUT_OF_STOCK: 'Нет на складе',
};

export const DELIVERY_METHODS: { code: DeliveryMethod; title: string; hint: string }[] = [
  { code: DeliveryMethod.PICKUP, title: 'Самовывоз со склада НСРЗ', hint: 'г. Новороссийск, Сухумское шоссе' },
  { code: DeliveryMethod.TO_BOARD, title: 'Доставка к борту судна', hint: 'в порту Новороссийск, в течение 1 рабочего дня' },
  { code: DeliveryMethod.CARRIER, title: 'Транспортная компания', hint: 'в другой порт, срок и стоимость по согласованию' },
];

export const REJECT_REASONS = [
  'Нет в наличии на складе',
  'Позиция снята с поставки',
  'Неверно указано судно',
  'Дубль заказа',
  'Другое',
];

export interface StockLike {
  quantity: number;
  reserved: number;
  availability: Availability;
  updatedAt: Date;
}

export interface StockView {
  /** Что показываем клиенту: «в наличии», «под заказ», «нет на складе». */
  availability: Availability;
  availabilityTitle: string;
  quantity: number;
  reserved: number;
  /** Свободно для заказа: остаток минус резерв. */
  available: number;
  /** Сколько максимум можно положить в корзину. */
  maxOrder: number;
  orderable: boolean;
  /** Всё, что есть на складе, уже в резерве по другим заказам. */
  allReserved: boolean;
  updatedAt: string | null;
}

/** Единое правило наличия для каталога, корзины и заказа. */
export function stockView(stock: StockLike | null | undefined): StockView {
  const quantity = stock?.quantity ?? 0;
  const reserved = stock?.reserved ?? 0;
  const available = Math.max(0, quantity - reserved);
  const base = stock?.availability ?? Availability.OUT_OF_STOCK;

  let availability: Availability = base;
  let maxOrder = 0;
  let allReserved = false;

  if (base === Availability.IN_STOCK) {
    maxOrder = available;
    if (available === 0) {
      availability = Availability.OUT_OF_STOCK;
      allReserved = reserved > 0;
    }
  } else if (base === Availability.ON_ORDER) {
    maxOrder = MAX_ON_ORDER_QTY;
  }

  return {
    availability,
    availabilityTitle: allReserved ? 'Всё в резерве' : AVAILABILITY_TITLES[availability],
    quantity,
    reserved,
    available,
    maxOrder,
    orderable: maxOrder > 0,
    allReserved,
    updatedAt: stock?.updatedAt ? stock.updatedAt.toISOString() : null,
  };
}

/** Номер заказа для пользователя: НСРЗ-000123. */
export function orderNumber(id: number): string {
  return `НСРЗ-${String(id).padStart(6, '0')}`;
}
