import http, { HttpRequestConfig } from './http/client';
import { OrderDeal } from './orders';

export type AuctionStatus =
  | 'DRAFT'
  | 'PENDING_AUDIT'
  | 'AUDIT_REJECTED'
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
export type WritableAuctionStatus = 'DRAFT' | 'PENDING_AUDIT';
export type LotCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';

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
  liveSessionId?: number;
  title: string;
  subtitle?: string;
  description?: string;
  category: string;
  brand?: string;
  condition: LotCondition;
  imageUrls: string[];
  coverUrl?: string;
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
  title?: string;
  subtitle?: string;
  description?: string;
  category?: string;
  brand?: string;
  condition?: LotCondition;
  imageUrls?: string[];
  coverUrl?: string;
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
  liveSessionId?: number;
}

export interface AuctionLot {
  auctionId: number | string;
  sellerId: string;
  title: string;
  subtitle?: string;
  description?: string;
  category: string;
  brand?: string;
  condition: LotCondition;
  imageUrls?: string[];
  coverUrl?: string;
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
  auditRejectReason?: string;
  ruleSnapshot: Record<string, unknown> | string;
  startTime: string;
  durationSec?: number | null;
  endTime: string;
  winnerId?: string | null;
  dealPrice?: number | null;
  closedAt?: string | null;
  closedBy?: string;
  currentPrice?: number | null;
  leaderBidderId?: string;
  createdAt: string;
  updatedAt: string;
  liveSessionId?: number | string | null;
  bidCount?: number;
}

export interface ListAuctionsParams {
  sellerId?: string;
  status?: AuctionStatus;
  category?: string;
  keyword?: string;
  liveSessionId?: number | string;
  limit?: number;
  offset?: number;
}

export interface ListAuctionsResult {
  auctions: AuctionLot[];
}

export interface AuctionImageUploadResult {
  imageUrls: string[];
  coverUrl?: string;
}

export interface AuctionCategory {
  id: string;
  name: string;
  iconName?: string;
}

export interface ListAuctionCategoriesResult {
  categories: AuctionCategory[];
}

export function listAuctionCategories() {
  const config: HttpRequestConfig = {
    params: {
      limit: 50,
      offset: 0,
    },
    skipGlobalLoading: true,
    skipErrorMessage: true,
  };

  return http.get<any, ListAuctionCategoriesResult>(
    '/api/v1/categories',
    config
  );
}

export interface AuctionState {
  auctionId: number | string;
  status: AuctionStatus;
  startPrice: number;
  capPrice: number;
  incrementRule?: AuctionIncrementRule;
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

export function updateAuction(
  id: string | number,
  payload: AuctionPatchRequest
) {
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

export interface LotDescriptionOptimizeResult {
  title: string;
  category: string;
  description: string;
}

export function optimizeLotDescription(payload: FormData) {
  return http.post<any, LotDescriptionOptimizeResult>(
    '/api/v1/auctions/description/optimize',
    payload,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
}

export function uploadAuctionImages(payload: FormData) {
  const config: HttpRequestConfig = {
    headers: { 'Content-Type': 'multipart/form-data' },
    skipErrorMessage: true,
  };
  return http.post<any, AuctionImageUploadResult>(
    '/api/v1/auctions/images',
    payload,
    config
  );
}
