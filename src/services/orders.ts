import http from './http/client';

export type OrderStatus = 'CREATED' | 'PAID' | 'TIMEOUT' | 'CANCELLED';
export type OrderPayStatus = 'UNPAID' | 'PAID' | 'REFUNDED';
export type OrderFulfillmentStatus = 'UNSHIPPED' | 'SHIPPED' | 'RECEIVED';

export interface OrderDeal {
  id: number | string;
  auctionId: number | string;
  lotSnapshot?: {
    auctionId?: number | string;
    title?: string;
    description?: string;
    category?: string;
    brand?: string;
    condition?: string;
    imageUrls?: string[];
    coverUrl?: string;
    dealPrice?: number | string;
  } | null;
  winnerId: string;
  winnerNickname?: string;
  sellerId: string;
  liveSessionId?: number | string | null;
  dealPrice: number | string;
  depositAmount: number | string;
  status: OrderStatus;
  payStatus: OrderPayStatus;
  fulfillmentStatus?: OrderFulfillmentStatus;
  payDeadline?: string | null;
  paidAt?: string | null;
  shippedAt?: string | null;
  receivedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListOrdersParams {
  status?: OrderStatus;
  payStatus?: OrderPayStatus;
  winnerId?: string;
  sellerId?: string;
  limit?: number;
  offset?: number;
}

export interface ListOrdersResult {
  orders: OrderDeal[];
}

export function listOrders(params: ListOrdersParams) {
  return http.get<any, ListOrdersResult>('/api/v1/orders', {
    params,
  });
}

export function getOrderDetail(id: string | number) {
  return http.get<any, OrderDeal>(`/api/v1/orders/${id}`);
}

export function shipOrder(id: string | number, idempotencyKey: string) {
  return http.post<any, OrderDeal>(`/api/v1/orders/${id}/ship`, undefined, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  });
}
