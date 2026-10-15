// Демо-данные: каталог, компании, суда, пользователи и история заказов.
// Данные выдуманные, но правдоподобные — для показа на защите и для автотестов.

export const VESSEL_TYPES = ['Сухогруз', 'Танкер', 'Буксир', 'Паром', 'Рыболовное судно'] as const;
type VT = (typeof VESSEL_TYPES)[number];
const ALL: VT[] = [...VESSEL_TYPES];

export const CATEGORIES = [
  { name: 'Главный двигатель', icon: 'engine' },
  { name: 'Дизель-генераторы', icon: 'generator' },
  { name: 'Насосы', icon: 'pump' },
  { name: 'Сепараторы и фильтры', icon: 'filter' },
  { name: 'Валопровод и движитель', icon: 'propeller' },
  { name: 'Электрооборудование', icon: 'electric' },
  { name: 'Палубное оборудование', icon: 'deck' },
  { name: 'Навигация и связь', icon: 'navigation' },
] as const;
type Cat = (typeof CATEGORIES)[number]['name'];

export interface SeedPart {
  name: string;
  cat: Cat;
  num: string;
  mpn: string;
  price: number;
  qty: number;
  av: 'IN_STOCK' | 'ON_ORDER' | 'OUT_OF_STOCK';
  lead?: number;
  unit?: string;
  vt: VT[];
  desc: string;
}

export const PARTS: SeedPart[] = [
  // Главный двигатель
  { name: 'Фильтр топливный тонкой очистки', cat: 'Главный двигатель', num: 'НСРЗ-ГД-01427', mpn: '6L20-FF-118', price: 18450, qty: 12, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер'], desc: 'Сменный фильтрующий элемент топливной системы среднеоборотного дизеля 6L20. Тонкость фильтрации 10 мкм, ресурс 2000 моточасов.' },
  { name: 'Кольцо уплотнительное крышки цилиндра', cat: 'Главный двигатель', num: 'НСРЗ-ГД-00981', mpn: 'L23-302-11', price: 2960, qty: 48, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер', 'Паром'], desc: 'Медное уплотнительное кольцо крышки цилиндра двигателей L23/30. Поставляется поштучно.' },
  { name: 'Форсунка топливная в сборе', cat: 'Главный двигатель', num: 'НСРЗ-ГД-01455', mpn: '6L20-INJ-02', price: 48700, qty: 2, av: 'ON_ORDER', lead: 7, vt: ['Сухогруз', 'Танкер'], desc: 'Форсунка в сборе с распылителем. Складской остаток закреплён за ремонтом в доке, новые поставляются под заказ.' },
  { name: 'Кольцо поршневое компрессионное', cat: 'Главный двигатель', num: 'НСРЗ-ГД-01102', mpn: '6L20-PR-031', price: 7350, qty: 24, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер', 'Паром'], desc: 'Верхнее компрессионное кольцо с хромокерамическим покрытием, диаметр 200 мм.' },
  { name: 'Вкладыш коренного подшипника', cat: 'Главный двигатель', num: 'НСРЗ-ГД-00877', mpn: '6L20-MB-205', price: 23900, qty: 6, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер'], desc: 'Комплект из верхнего и нижнего вкладыша коренного подшипника, номинальный размер.' },
  { name: 'Клапан выпускной', cat: 'Главный двигатель', num: 'НСРЗ-ГД-01310', mpn: 'L23-EXV-07', price: 31200, qty: 4, av: 'IN_STOCK', vt: ['Сухогруз', 'Паром'], desc: 'Выпускной клапан с наплавкой стеллитом для двигателей L23/30.' },
  { name: 'Картридж ротора турбокомпрессора', cat: 'Главный двигатель', num: 'НСРЗ-ГД-02011', mpn: 'TCR18-CART', price: 412000, qty: 0, av: 'ON_ORDER', lead: 30, vt: ['Сухогруз', 'Танкер'], desc: 'Сменный картридж ротора турбокомпрессора TCR18 в сборе с подшипниками. Поставка под заказ.' },
  { name: 'Прокладка головки блока цилиндров', cat: 'Главный двигатель', num: 'НСРЗ-ГД-00764', mpn: '6L20-HG-12', price: 5480, qty: 15, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер', 'Паром', 'Буксир'], desc: 'Металлоасбестовая прокладка головки блока цилиндров.' },
  // Дизель-генераторы
  { name: 'Фильтр масляный дизель-генератора', cat: 'Дизель-генераторы', num: 'НСРЗ-ДГ-00412', mpn: 'DG-OF-2240', price: 3150, qty: 30, av: 'IN_STOCK', vt: ALL, desc: 'Масляный фильтр полнопоточной очистки для судовых дизель-генераторов мощностью до 500 кВт.' },
  { name: 'Термостат системы охлаждения', cat: 'Дизель-генераторы', num: 'НСРЗ-ДГ-00530', mpn: 'DG-TH-82', price: 4780, qty: 9, av: 'IN_STOCK', vt: ['Буксир', 'Рыболовное судно', 'Паром'], desc: 'Термостат с температурой открытия 82 °C.' },
  { name: 'Ремень привода генератора', cat: 'Дизель-генераторы', num: 'НСРЗ-ДГ-00618', mpn: 'DG-BLT-1450', price: 2240, qty: 3, av: 'IN_STOCK', vt: ['Буксир', 'Рыболовное судно'], desc: 'Поликлиновой ремень длиной 1450 мм.' },
  { name: 'Стартер электрический 24 В', cat: 'Дизель-генераторы', num: 'НСРЗ-ДГ-00702', mpn: 'DG-ST-24V', price: 38600, qty: 0, av: 'OUT_OF_STOCK', vt: ['Буксир', 'Рыболовное судно', 'Паром'], desc: 'Стартер 24 В, 7 кВт. Сейчас нет на складе, срок поставки уточняется у производителя.' },
  // Насосы
  { name: 'Рабочее колесо центробежного насоса', cat: 'Насосы', num: 'НСРЗ-НС-03310', mpn: 'CNP-150-IMP', price: 64200, qty: 0, av: 'ON_ORDER', lead: 14, vt: ['Танкер', 'Буксир'], desc: 'Бронзовое рабочее колесо насоса забортной воды CNP-150.' },
  { name: 'Торцевое уплотнение насоса забортной воды', cat: 'Насосы', num: 'НСРЗ-НС-03122', mpn: 'MS-45-SW', price: 15900, qty: 7, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер', 'Буксир', 'Паром'], desc: 'Торцевое уплотнение вала 45 мм, пара трения карбид кремния.' },
  { name: 'Насос топливоподкачивающий шестерённый', cat: 'Насосы', num: 'НСРЗ-НС-02987', mpn: 'GP-25-FT', price: 56800, qty: 1, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер'], desc: 'Шестерённый насос подачи топлива, 2,5 м³/ч.' },
  { name: 'Подшипник насоса 6309-2RS', cat: 'Насосы', num: 'НСРЗ-НС-03045', mpn: '6309-2RS', price: 1890, qty: 40, av: 'IN_STOCK', vt: ALL, desc: 'Шариковый подшипник с двусторонним уплотнением.' },
  // Сепараторы и фильтры
  { name: 'Тарелка сепаратора топлива', cat: 'Сепараторы и фильтры', num: 'НСРЗ-СП-00215', mpn: 'MOPX-205-D', price: 7800, qty: 3, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер', 'Паром'], desc: 'Тарелка пакета сепаратора тяжёлого топлива MOPX-205.' },
  { name: 'Ремкомплект уплотнений сепаратора', cat: 'Сепараторы и фильтры', num: 'НСРЗ-СП-00240', mpn: 'MOPX-205-KIT', price: 26400, qty: 5, av: 'IN_STOCK', unit: 'компл.', vt: ['Сухогруз', 'Танкер'], desc: 'Полный комплект колец и уплотнений для планового обслуживания сепаратора.' },
  { name: 'Фильтроэлемент льяльного сепаратора 15 ppm', cat: 'Сепараторы и фильтры', num: 'НСРЗ-СП-00318', mpn: 'OWS-15-CE', price: 12750, qty: 8, av: 'IN_STOCK', vt: ['Сухогруз', 'Танкер', 'Паром', 'Рыболовное судно'], desc: 'Коалесцирующий элемент для льяльных сепараторов с содержанием нефтепродуктов на выходе до 15 ppm.' },
  // Валопровод и движитель
  { name: 'Подшипник опорный гребного вала', cat: 'Валопровод и движитель', num: 'НСРЗ-ВП-00057', mpn: 'SB-280-W', price: 212000, qty: 0, av: 'OUT_OF_STOCK', lead: 45, vt: ['Сухогруз'], desc: 'Опорный подшипник водяной смазки для вала 280 мм. Сейчас нет на складе.' },
  { name: 'Уплотнение дейдвудное', cat: 'Валопровод и движитель', num: 'НСРЗ-ВП-00112', mpn: 'ST-SEAL-300', price: 148500, qty: 1, av: 'IN_STOCK', unit: 'компл.', vt: ['Сухогруз', 'Танкер'], desc: 'Комплект кормового дейдвудного уплотнения для вала 300 мм.' },
  { name: 'Втулка дейдвудная капролоновая', cat: 'Валопровод и движитель', num: 'НСРЗ-ВП-00098', mpn: 'SB-BUSH-220', price: 64300, qty: 0, av: 'ON_ORDER', lead: 21, vt: ['Буксир', 'Рыболовное судно'], desc: 'Втулка под вал 220 мм, изготавливается по размерам заказчика.' },
  { name: 'Шпонка гребного винта', cat: 'Валопровод и движитель', num: 'НСРЗ-ВП-00140', mpn: 'PK-80-22', price: 8900, qty: 4, av: 'IN_STOCK', vt: ['Буксир', 'Рыболовное судно', 'Паром'], desc: 'Призматическая шпонка 80×22 мм, сталь 40Х.' },
  // Электрооборудование
  { name: 'Реле контроля фаз', cat: 'Электрооборудование', num: 'НСРЗ-ЭЛ-01102', mpn: 'EKF-RKF-3', price: 3350, qty: 21, av: 'IN_STOCK', vt: ALL, desc: 'Реле контроля последовательности и обрыва фаз, 380 В.' },
  { name: 'Автоматический выключатель 3P 63 А', cat: 'Электрооборудование', num: 'НСРЗ-ЭЛ-01215', mpn: 'NSX-63-3P', price: 18700, qty: 10, av: 'IN_STOCK', vt: ALL, desc: 'Трёхполюсный автоматический выключатель в литом корпусе, морское исполнение.' },
  { name: 'Светильник палубный светодиодный IP67', cat: 'Электрооборудование', num: 'НСРЗ-ЭЛ-01340', mpn: 'LED-DK-50', price: 9450, qty: 16, av: 'IN_STOCK', vt: ALL, desc: 'Палубный прожектор 50 Вт, корпус из морского алюминия.' },
  { name: 'Датчик давления масла 0–10 бар', cat: 'Электрооборудование', num: 'НСРЗ-ЭЛ-01408', mpn: 'PS-10B-420', price: 11200, qty: 0, av: 'OUT_OF_STOCK', vt: ['Сухогруз', 'Танкер', 'Буксир'], desc: 'Датчик давления с выходом 4–20 мА.' },
  { name: 'Аккумуляторная батарея 12 В 190 А·ч', cat: 'Электрооборудование', num: 'НСРЗ-ЭЛ-01550', mpn: 'AGM-12-190', price: 42800, qty: 6, av: 'IN_STOCK', vt: ALL, desc: 'Необслуживаемая AGM-батарея для аварийного освещения и пуска.' },
  // Палубное оборудование
  { name: 'Трос стальной швартовный, 24 мм', cat: 'Палубное оборудование', num: 'НСРЗ-ПЛ-00433', mpn: 'GOST-7668-24', price: 890, qty: 600, av: 'IN_STOCK', unit: 'м', vt: ['Буксир', 'Паром'], desc: 'Канат двойной свивки по ГОСТ 7668-80. Цена за погонный метр.' },
  { name: 'Скоба такелажная 12 т', cat: 'Палубное оборудование', num: 'НСРЗ-ПЛ-00512', mpn: 'SHK-12T', price: 6900, qty: 14, av: 'IN_STOCK', vt: ALL, desc: 'Скоба с винтовым штырём, рабочая нагрузка 12 т, с сертификатом РМРС.' },
  { name: 'Кранец пневматический 1,0×1,5 м', cat: 'Палубное оборудование', num: 'НСРЗ-ПЛ-00587', mpn: 'PF-1015', price: 96500, qty: 0, av: 'ON_ORDER', lead: 20, vt: ['Буксир', 'Паром'], desc: 'Пневматический кранец в сетке из автомобильных шин.' },
  { name: 'Блок однорольный 5 т', cat: 'Палубное оборудование', num: 'НСРЗ-ПЛ-00620', mpn: 'BLK-5T-1', price: 12400, qty: 2, av: 'IN_STOCK', vt: ['Сухогруз', 'Буксир'], desc: 'Грузовой блок с откидной щекой.' },
  // Навигация и связь
  { name: 'Антенна УКВ морская 156–163 МГц', cat: 'Навигация и связь', num: 'НСРЗ-НВ-00211', mpn: 'VHF-ANT-1.5', price: 14300, qty: 5, av: 'IN_STOCK', vt: ALL, desc: 'Штыревая антенна длиной 1,5 м для УКВ-радиостанций.' },
  { name: 'Датчик эхолота 200 кГц', cat: 'Навигация и связь', num: 'НСРЗ-НВ-00305', mpn: 'TR-200-SS', price: 58900, qty: 0, av: 'ON_ORDER', lead: 14, vt: ['Рыболовное судно', 'Буксир'], desc: 'Забортный датчик эхолота в корпусе из нержавеющей стали.' },
  { name: 'Батарея аварийного радиобуя КОСПАС-САРСАТ', cat: 'Навигация и связь', num: 'НСРЗ-НВ-00412', mpn: 'EPIRB-BAT-3', price: 27600, qty: 3, av: 'IN_STOCK', vt: ALL, desc: 'Литиевая батарея для аварийного радиобуя, срок службы 5 лет.' },
  { name: 'Огонь ходовой топовый светодиодный', cat: 'Навигация и связь', num: 'НСРЗ-НВ-00450', mpn: 'NAV-MH-LED', price: 15200, qty: 7, av: 'IN_STOCK', vt: ALL, desc: 'Топовый огонь с одобрением РМРС, дальность видимости 6 миль.' },
];

export const COMPANIES = [
  { key: 'chf', name: 'ООО «Черноморский флот»', inn: '2315123456', contactPhone: '+78617601010' },
  { key: 'azov', name: 'ООО «Азов-Транс»', inn: '6164234567', contactPhone: '+78632555020' },
  { key: 'rybak', name: 'ООО «Рыбак Кубани»', inn: '2308345678', contactPhone: '+78612404030' },
] as const;

export const VESSELS = [
  { key: 'cemes', company: 'chf', type: 'Сухогруз', name: 'т/х «Цемесская бухта»', imo: 'IMO 9384117' },
  { key: 'myshako', company: 'chf', type: 'Танкер', name: 'т/х «Мысхако»', imo: 'IMO 9512036' },
  { key: 'kabard', company: 'azov', type: 'Буксир', name: 'буксир «Кабардинка»', imo: 'IMO 9701245' },
  { key: 'anapa', company: 'azov', type: 'Паром', name: 'паром «Анапа»', imo: 'IMO 9622310' },
  { key: 'utrish', company: 'rybak', type: 'Рыболовное судно', name: 'СРТМ «Утриш»', imo: 'IMO 8724031' },
] as const;

/** Демо-учётные записи. Вход — по номеру или почте и одноразовому коду. */
export const USERS = {
  owner1: { fullName: 'Кравец Иван Петрович', role: 'OWNER', company: 'chf', phone: '+79000000001', email: null },
  owner2: { fullName: 'Гаврилов Дмитрий Евгеньевич', role: 'OWNER', company: 'azov', phone: '+79000000002', email: null },
  owner3: { fullName: 'Сергеева Анна Викторовна', role: 'OWNER', company: 'rybak', phone: null, email: 'sergeeva@rybak-kuban.ru' },
  warehouse: { fullName: 'Сидоренко Ольга Викторовна', role: 'WAREHOUSE', company: null, phone: '+79000000011', email: 'sklad@nsrz.ru' },
  sales: { fullName: 'Мартыненко Алексей Сергеевич', role: 'SALES', company: null, phone: '+79000000012', email: 'prodazhi@nsrz.ru' },
  admin: { fullName: 'Черный Павел Сергеевич', role: 'ADMIN', company: null, phone: null, email: 'admin@nsrz.ru' },
  disabled: { fullName: 'Полищук Роман Андреевич', role: 'SALES', company: null, phone: null, email: 'polishuk@nsrz.ru', isActive: false },
} as const;

type UserKey = keyof typeof USERS;
type VesselKey = (typeof VESSELS)[number]['key'];

export interface SeedOrder {
  daysAgo: number;
  hour?: number; // час по Москве
  vessel: VesselKey;
  user: UserKey;
  delivery: 'PICKUP' | 'TO_BOARD' | 'CARRIER';
  items: [string, number][];
  /** статусы после «ожидает подтверждения» и через сколько часов после оформления */
  path: [('CONFIRMED' | 'ASSEMBLING' | 'READY' | 'COMPLETED' | 'REJECTED'), number][];
  reason?: string;
  comment?: string;
}

export const ORDERS: SeedOrder[] = [
  { daysAgo: 12, vessel: 'cemes', user: 'owner1', delivery: 'TO_BOARD', items: [['НСРЗ-ГД-01427', 4], ['НСРЗ-ДГ-00412', 2]], path: [['CONFIRMED', 1], ['ASSEMBLING', 5], ['READY', 24], ['COMPLETED', 48]] },
  { daysAgo: 11, vessel: 'kabard', user: 'owner2', delivery: 'PICKUP', items: [['НСРЗ-НС-03122', 1], ['НСРЗ-ЭЛ-01102', 2]], path: [['CONFIRMED', 2], ['ASSEMBLING', 4], ['READY', 22], ['COMPLETED', 29]] },
  { daysAgo: 10, vessel: 'myshako', user: 'owner1', delivery: 'TO_BOARD', items: [['НСРЗ-СП-00215', 2]], path: [['REJECTED', 3]], reason: 'Неверно указано судно' },
  { daysAgo: 9, vessel: 'utrish', user: 'owner3', delivery: 'CARRIER', items: [['НСРЗ-НВ-00211', 1], ['НСРЗ-ПЛ-00512', 4]], path: [['CONFIRMED', 1], ['ASSEMBLING', 3], ['READY', 6], ['COMPLETED', 30]], comment: 'Отправить в порт Темрюк' },
  { daysAgo: 8, vessel: 'anapa', user: 'owner2', delivery: 'TO_BOARD', items: [['НСРЗ-ПЛ-00433', 120], ['НСРЗ-ПЛ-00512', 2]], path: [['CONFIRMED', 2], ['ASSEMBLING', 6], ['READY', 20], ['COMPLETED', 26]] },
  { daysAgo: 7, vessel: 'cemes', user: 'owner1', delivery: 'PICKUP', items: [['НСРЗ-ГД-00981', 12], ['НСРЗ-ГД-00764', 2]], path: [['CONFIRMED', 1], ['ASSEMBLING', 2], ['READY', 5], ['COMPLETED', 24]] },
  { daysAgo: 6, vessel: 'kabard', user: 'owner2', delivery: 'PICKUP', items: [['НСРЗ-ДГ-00530', 2]], path: [['CONFIRMED', 3], ['ASSEMBLING', 4], ['READY', 8], ['COMPLETED', 25]] },
  { daysAgo: 5, vessel: 'utrish', user: 'owner3', delivery: 'CARRIER', items: [['НСРЗ-СП-00318', 2]], path: [['REJECTED', 2]], reason: 'Дубль заказа' },
  { daysAgo: 4, vessel: 'myshako', user: 'owner1', delivery: 'TO_BOARD', items: [['НСРЗ-НС-03045', 6], ['НСРЗ-ЭЛ-01215', 1]], path: [['CONFIRMED', 1], ['ASSEMBLING', 5], ['READY', 26]] },
  { daysAgo: 3, vessel: 'anapa', user: 'owner2', delivery: 'TO_BOARD', items: [['НСРЗ-ЭЛ-01340', 4]], path: [['CONFIRMED', 2], ['ASSEMBLING', 20]] },
  { daysAgo: 2, vessel: 'cemes', user: 'owner1', delivery: 'PICKUP', items: [['НСРЗ-ГД-01102', 8]], path: [['CONFIRMED', 1]] },
  { daysAgo: 1, vessel: 'utrish', user: 'owner3', delivery: 'CARRIER', items: [['НСРЗ-ЭЛ-01550', 2]], path: [['CONFIRMED', 3]] },
  { daysAgo: 0, hour: -3, vessel: 'kabard', user: 'owner2', delivery: 'PICKUP', items: [['НСРЗ-ГД-00877', 2], ['НСРЗ-НС-03122', 1]], path: [] },
  { daysAgo: 0, hour: -1, vessel: 'myshako', user: 'owner1', delivery: 'TO_BOARD', items: [['НСРЗ-СП-00240', 1], ['НСРЗ-ДГ-00412', 4]], path: [], comment: 'Нужно до отхода судна в пятницу' },
];
