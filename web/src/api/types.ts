export type Role = 'OWNER' | 'SALES' | 'WAREHOUSE' | 'ADMIN';
export type Availability = 'IN_STOCK' | 'ON_ORDER' | 'OUT_OF_STOCK';
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'ASSEMBLING' | 'READY' | 'COMPLETED' | 'REJECTED';
export type DeliveryMethod = 'PICKUP' | 'TO_BOARD' | 'CARRIER';

export interface Vessel {
  id: string;
  name: string;
  imoNumber: string | null;
  vesselType: { id: number; name: string };
}

export interface Profile {
  id: string;
  fullName: string;
  role: Role;
  phone: string | null;
  phoneFormatted: string | null;
  email: string | null;
  company: { id: string; name: string; inn: string | null; contactPhone: string | null } | null;
  vessels: Vessel[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface StockView {
  availability: Availability;
  availabilityTitle: string;
  quantity: number;
  reserved: number;
  available: number;
  maxOrder: number;
  orderable: boolean;
  allReserved: boolean;
  updatedAt: string | null;
}

export interface Part {
  id: number;
  name: string;
  description?: string | null;
  catalogNumber: string;
  manufacturerPartNumber: string | null;
  category: { id: number; name: string; icon: string | null };
  price: number;
  unit: string;
  leadTimeDays: number;
  vesselTypes: string[];
  stock: StockView;
  stockUpdatedAt?: string | null;
  updatedBy?: string | null;
  warning?: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PartsPage extends Page<Part> {
  stockUpdatedAt: string | null;
}

export interface Dictionaries {
  vesselTypes: { id: number; name: string }[];
  categories: { id: number; name: string; icon: string | null; partsCount: number }[];
  deliveryMethods: { code: DeliveryMethod; title: string; hint: string }[];
  statuses: { code: OrderStatus; title: string }[];
  rejectReasons: string[];
  stockUpdatedAt: string | null;
}

export interface CartLine {
  part: Part;
  quantity: number;
  lineTotal: number;
  problem: string | null;
}

export interface Cart {
  items: CartLine[];
  count: number;
  positions: number;
  total: number;
  hasProblems: boolean;
}

export interface OrderSummary {
  id: number;
  number: string;
  status: OrderStatus;
  statusTitle: string;
  createdAt: string;
  updatedAt: string;
  total: number;
  vessel: { id: string; name: string };
  company: { id: string; name: string };
  createdBy: { fullName: string };
  itemsCount: number;
  totalQuantity: number;
  preview: string[];
  rejectReason: string | null;
}

export interface OrderItem {
  partId: number;
  name: string;
  catalogNumber: string;
  manufacturerPartNumber: string | null;
  unit: string;
  quantity: number;
  price: number;
  lineTotal: number;
  reserved: boolean;
  stock?: StockView;
}

export interface OrderDetail {
  id: number;
  number: string;
  status: OrderStatus;
  statusTitle: string;
  createdAt: string;
  updatedAt: string;
  deliveryMethod: DeliveryMethod;
  deliveryTitle: string;
  comment: string | null;
  rejectReason: string | null;
  rejectedAt: string | null;
  total: number;
  vessel: { id: string; name: string; imoNumber: string | null; vesselType: string };
  company: { id: string; name: string; inn: string | null; contactPhone: string | null };
  createdBy: { fullName: string; phone: string | null; email: string | null };
  items: OrderItem[];
  itemsCount: number;
  totalQuantity: number;
  timeline: { status: OrderStatus; title: string; done: boolean; current: boolean; at: string | null }[];
  history: { status: OrderStatus; title: string; at: string; comment: string | null; by: string | null }[];
  allowedTransitions: OrderStatus[];
  duplicate?: boolean;
}

export interface StaffOrdersPage extends Page<OrderSummary> {
  counts: Record<OrderStatus, number>;
}
