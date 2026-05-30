import http, { HttpRequestConfig } from './http/client';
import { OrderDeal } from './orders';

export type AuctionStatus =
  | 'DRAFT'
  | 'PENDING_AUDIT'
  | 'READY'
  | 'WARMING_UP'
  | 'RUNNING'
  | 'EXTENDED'
  | 'HAMMER_PENDING'
  | 'CLOSED_WON'
  | 'CLOSED_FAILED'
  | 'SETTLED';

export type AuctionType = 'ENGLISH';
export type AuctionAntiExtendMode = 'ADD' | 'RESET';
export type WritableAuctionStatus = 'DRAFT' | 'READY';

export interface AuctionIncrementStep {
  min: number;
  max?: number;
  amount: number;
}

export interface FixedAuctionIncrementRule {
  type: 'fixed';
  amount: number;
  maxBidSteps: number;
}

export interface LadderAuctionIncrementRule {
  type: 'ladder';
  maxBidSteps: number;
  steps: AuctionIncrementStep[];
}

export type AuctionIncrementRule =
  | FixedAuctionIncrementRule
  | LadderAuctionIncrementRule;

export interface AuctionCreateRequest {
  itemId: number;
  liveRoomId?: number;
  auctionType: AuctionType;
  startPrice: number;
  reservePrice: number;
  capPrice?: number;
  incrementRule: AuctionIncrementRule;
  antiSnipingSec?: number;
  antiExtendSec?: number;
  antiExtendMode?: AuctionAntiExtendMode;
  depositAmount?: number;
  status?: WritableAuctionStatus;
  startTime?: string;
  durationSec?: number;
}

export interface AuctionPatchRequest {
  startPrice?: number;
  reservePrice?: number;
  capPrice?: number;
  incrementRule?: AuctionIncrementRule;
  antiSnipingSec?: number;
  antiExtendSec?: number;
  antiExtendMode?: AuctionAntiExtendMode;
  depositAmount?: number;
  status?: WritableAuctionStatus;
  startTime?: string;
  durationSec?: number;
  endTime?: string;
  liveRoomId?: number;
}

export interface AuctionLot {
  auctionId: number | string;
  itemId: number | string;
  sellerId: string;
  auctionType: AuctionType;
  startPrice: number;
  reservePrice?: number | null;
  capPrice?: number | null;
  incrementRule: AuctionIncrementRule;
  antiSnipingSec: number;
  antiExtendSec: number;
  antiExtendMode?: AuctionAntiExtendMode;
  depositAmount: number;
  status: AuctionStatus;
  ruleSnapshot: Record<string, unknown> | string;
  startTime: string;
  durationSec?: number | null;
  endTime: string;
  winnerId?: string | null;
  dealPrice?: number | null;
  closedAt?: string | null;
  closedBy?: string;
  createdAt: string;
  updatedAt: string;
  liveRoomId?: number;
  liveSessionId?: number | string | null;
  bidCount?: number;
}

export interface ListAuctionsParams {
  sellerId?: string;
  itemId?: number;
  status?: AuctionStatus;
  limit?: number;
  offset?: number;
}

export interface ListAuctionsResult {
  auctions: AuctionLot[];
}

export interface AuctionState {
  auctionId: number | string;
  status: AuctionStatus;
  currentPrice: number;
  leaderBidderId?: string;
  startTime: string;
  endTime: string;
  lastBidTsMs: number;
  extendCount: number;
  version: number;
  source: string;
}

export interface HammerResult {
  requestId: string;
  auctionId: number | string;
  status: AuctionStatus;
  winnerId?: string;
  price?: number;
  duplicate?: boolean;
  closedAt: string;
  version?: number;
}

export interface HammerResponse {
  result: HammerResult;
  order?: OrderDeal | null;
}

export function createAuction(payload: AuctionCreateRequest) {
  return http.post<any, AuctionLot>('/api/v1/auctions', payload);
}

export function listAuctions(params: ListAuctionsParams) {
  return http.get<any, ListAuctionsResult>('/api/v1/auctions', {
    params,
  });
}

export function fetchAuction(id: string | number) {
  return http.get<any, AuctionLot>(`/api/v1/auctions/${id}`);
}

export function fetchAuctionState(id: string | number) {
  const config: HttpRequestConfig = {
    skipGlobalLoading: true,
  };

  return http.get<any, AuctionState>(`/api/v1/auctions/${id}/state`, {
    ...config,
  });
}

export function updateAuction(id: string | number, payload: AuctionPatchRequest) {
  return http.patch<any, AuctionLot>(`/api/v1/auctions/${id}`, payload);
}

export function startAuction(id: string | number, idempotencyKey: string) {
  return http.post<any, AuctionLot>(
    `/api/v1/auctions/${id}/start`,
    {},
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function cancelAuction(
  id: string | number,
  reason: string,
  idempotencyKey: string
) {
  return http.post<any, AuctionLot>(
    `/api/v1/auctions/${id}/cancel`,
    { reason },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function hammerAuction(
  id: string | number,
  reason: string,
  idempotencyKey: string
) {
  return http.post<any, HammerResponse>(
    `/api/v1/auctions/${id}/hammer`,
    { reason },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}
