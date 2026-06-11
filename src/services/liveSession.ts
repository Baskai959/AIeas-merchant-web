import { Message } from '@arco-design/web-react';
import http, { HttpRequestConfig } from './http/client';
import { AuctionLot } from './auctions';
import { OrderDeal } from './orders';

export type LiveSessionStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'LIVE'
  | 'ENDED'
  | 'CANCELLED';
export type LiveAnalysisReportStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface LiveSession {
  id: number | string;
  merchantId: string;
  title: string;
  description?: string;
  coverUrl?: string;
  status: LiveSessionStatus;
  videoSource?: 'recorded' | 'digitalHuman';
  aiAssistantEnabled?: boolean;
  digitalHuman?: {
    idleVideoUrl?: string;
    speakingVideoUrl?: string;
    ttsWsUrl?: string;
  };
  activeAuctionId?: number;
  openedAt?: string;
  closedAt?: string | null;
  scheduledStartTime?: string | null;
  plannedDurationSec?: number;
  lotsTotal?: number;
  lotsSold?: number;
  lotsUnsold?: number;
  bidCount?: number;
  gmvCent?: number;
  viewerPeak?: number;
  viewerTotal?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiveSessionCreateRequest {
  title: string;
  description?: string;
  coverUrl?: string;
  status?: LiveSessionStatus;
  scheduledStartTime?: string;
  plannedDurationSec?: number;
}

export interface LiveSessionPatchRequest {
  title?: string;
  description?: string;
  coverUrl?: string;
  status?: LiveSessionStatus;
  scheduledStartTime?: string;
  plannedDurationSec?: number;
}

export interface LiveSessionCoverUploadRequest {
  image: File;
}

export interface LiveAgentHookConfig {
  enabled: boolean;
}

export interface LiveAgentHookUpdateRequest {
  enabled: boolean;
}

export interface LiveSessionActivateRequest {
  auctionId: number | string;
  durationSec: number;
  startTime?: string;
}

export interface ListLiveSessionsParams {
  merchantId?: string;
  status?: LiveSessionStatus;
  limit?: number;
  offset?: number;
}

export interface ListLiveSessionsResult {
  sessions: LiveSession[];
}

export interface ListLiveSessionLotsResult {
  lots: AuctionLot[];
}

export interface LiveSessionBidRecord {
  id?: number | string;
  auctionId?: number | string;
  lotId?: number | string;
  bidderId?: string;
  bidderNickname?: string;
  userId?: string;
  buyerId?: string;
  nickname?: string;
  bidderName?: string;
  price?: number;
  bidPrice?: number;
  amount?: number;
  amountCent?: number;
  createdAt?: string;
  bidAt?: string;
  [key: string]: unknown;
}

export interface ListLiveSessionBidsResult {
  bids: LiveSessionBidRecord[];
}

export interface LiveSessionStats {
  liveSessionId: number | string;
  online: number;
  lotsTotal: number;
  lotsSold: number;
  lotsUnsold: number;
  bidCount: number;
  gmvCent: number;
  viewerPeak: number;
  viewerTotal: number;
  merchantFollowerCount: number;
  activeAuctionId: number | string;
  currentBidCount: number;
  currentRemainSeconds: number;
  currentPrice: number;
}

export interface ListLiveSessionOrdersResult {
  orders: OrderDeal[];
}

export interface LiveAnalysisReportTask {
  taskId: string;
  agentRequestId?: string;
  liveSessionId: number | string;
  merchantId: string;
  status: LiveAnalysisReportStatus;
  attemptCount: number;
  prompt: string;
  report: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

const NOT_IMPLEMENTED_HINT = '当前操作暂不可用，请稍后再试。';

function isNotImplementedError(error: any) {
  if (!error) {
    return false;
  }
  const status = error.status || error?.response?.status;
  const code = error.code;
  if (status === 404 || status === 501) {
    return true;
  }
  if (code === 404 || code === 501) {
    return true;
  }
  return false;
}

export function listLiveSessions(params: ListLiveSessionsParams = {}) {
  return http.get<any, ListLiveSessionsResult>('/api/v1/live-sessions', {
    params,
  });
}

export function fetchLiveSession(id: string | number) {
  return http.get<any, LiveSession>(`/api/v1/live-sessions/${id}`);
}

export function createLiveSession(payload: LiveSessionCreateRequest) {
  return http.post<any, LiveSession>('/api/v1/live-sessions', payload);
}

export function patchLiveSession(
  id: string | number,
  payload: LiveSessionPatchRequest,
  idempotencyKey?: string
) {
  const config: HttpRequestConfig = {};
  if (idempotencyKey) {
    config.headers = { 'Idempotency-Key': idempotencyKey };
  }
  return http.patch<any, LiveSession>(
    `/api/v1/live-sessions/${id}`,
    payload,
    config
  );
}

export function startLiveSession(id: string | number, idempotencyKey: string) {
  return http.post<any, LiveSession>(
    `/api/v1/live-sessions/${id}/start`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } }
  );
}

export function endLiveSession(id: string | number, idempotencyKey: string) {
  return http.post<any, LiveSession>(
    `/api/v1/live-sessions/${id}/end`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } }
  );
}

export function uploadLiveSessionCover(
  id: string | number,
  payload: LiveSessionCoverUploadRequest,
  idempotencyKey: string
) {
  const formData = new FormData();
  formData.append('image', payload.image);
  return http.post<any, LiveSession>(
    `/api/v1/live-sessions/${id}/cover`,
    formData,
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function fetchLiveSessionAgentHookConfig(id: string | number) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.get<any, LiveAgentHookConfig>(
    `/api/v1/live-sessions/${id}/agent-hook`,
    config
  );
}

export function updateLiveSessionAgentHookConfig(
  id: string | number,
  payload: LiveAgentHookUpdateRequest,
  idempotencyKey: string
) {
  return http.patch<any, LiveAgentHookConfig>(
    `/api/v1/live-sessions/${id}/agent-hook`,
    payload,
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function deleteLiveSession(id: string | number) {
  return http.post<any, LiveSession>(`/api/v1/live-sessions/${id}/end`, {});
}

export function listLiveSessionLots(id: string | number) {
  return http.get<any, ListLiveSessionLotsResult>(
    `/api/v1/live-sessions/${id}/lots`
  );
}

export function listLiveSessionsByMerchant(
  merchantId: string | number,
  params: ListLiveSessionsParams = {}
) {
  const config: HttpRequestConfig = {
    params: {
      ...params,
      merchantId,
    },
    skipErrorMessage: true,
  };
  return http.get<any, ListLiveSessionsResult>(
    `/api/v1/live-sessions`,
    config
  );
}

export function listLiveSessionBids(
  sessionId: string | number,
  params: { limit?: number; auctionId?: number | string } = {}
) {
  const config: HttpRequestConfig = {
    params,
    skipErrorMessage: true,
    skipGlobalLoading: true,
  };
  return http.get<any, ListLiveSessionBidsResult>(
    `/api/v1/live-sessions/${sessionId}/bids`,
    config
  );
}

export function fetchLiveSessionStats(sessionId: string | number) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
    skipGlobalLoading: true,
  };
  return http.get<any, LiveSessionStats>(
    `/api/v1/live-sessions/${sessionId}/stats`,
    config
  );
}

export function listLiveSessionOrders(
  sessionId: string | number,
  params: Pick<ListLiveSessionsParams, 'limit' | 'offset'> = {}
) {
  const config: HttpRequestConfig = {
    params,
    skipErrorMessage: true,
  };
  return http.get<any, ListLiveSessionOrdersResult>(
    `/api/v1/live-sessions/${sessionId}/orders`,
    config
  );
}

export function fetchLiveAnalysisReport(liveSessionId: string | number) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.get<any, LiveAnalysisReportTask>(
    `/api/v1/live-analysis/reports/${liveSessionId}`,
    config
  );
}

export function activateLiveSessionAuction(
  id: string | number,
  payload: LiveSessionActivateRequest,
  idempotencyKey: string
) {
  return http.post<any, AuctionLot>(
    `/api/v1/live-sessions/${id}/activate`,
    payload,
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function deactivateLiveSessionAuction(
  id: string | number,
  idempotencyKey: string
) {
  return http.post<any, LiveSession>(
    `/api/v1/live-sessions/${id}/deactivate`,
    {},
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export async function attachAuctionToLiveSession(
  sessionId: number | string,
  auctionId: number | string,
  idempotencyKey: string
) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  };
  try {
    return await http.post<any, { lot: AuctionLot }>(
      `/api/v1/live-sessions/${sessionId}/lots`,
      { auctionId },
      config
    );
  } catch (error) {
    if (isNotImplementedError(error)) {
      Message.warning(NOT_IMPLEMENTED_HINT);
      throw error;
    }
    if (error instanceof Error) {
      Message.error(error.message);
    }
    throw error;
  }
}

export async function detachAuctionFromLiveSession(
  liveSessionId: string | number,
  auctionId: number | string,
  idempotencyKey: string
) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  };
  try {
    return await http.delete<any, { removed: boolean }>(
      `/api/v1/live-sessions/${liveSessionId}/lots/${auctionId}`,
      config
    );
  } catch (error) {
    if (isNotImplementedError(error)) {
      Message.warning(NOT_IMPLEMENTED_HINT);
      throw error;
    }
    if (error instanceof Error) {
      Message.error(error.message);
    }
    throw error;
  }
}
