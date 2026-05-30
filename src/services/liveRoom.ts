import { Message } from '@arco-design/web-react';
import http, { HttpRequestConfig } from './http/client';
import { AuctionLot } from './auctions';
import { OrderDeal } from './orders';

export type LiveRoomStatus = 'OFFLINE' | 'LIVE' | 'CLOSED';
export type LiveSessionStatus = 'LIVE' | 'ENDED';
export type LiveAnalysisReportStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface LiveRoom {
  id: number | string;
  merchantId: string;
  title: string;
  description?: string;
  coverUrl?: string;
  status: LiveRoomStatus;
  activeAuctionId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LiveRoomCreateRequest {
  title: string;
  description?: string;
  coverUrl?: string;
  status?: LiveRoomStatus;
}

export interface LiveRoomPatchRequest {
  title?: string;
  description?: string;
  coverUrl?: string;
  status?: LiveRoomStatus;
}

export interface LiveRoomCoverUploadRequest {
  image: File;
}

export interface LiveAgentHookConfig {
  enabled: boolean;
}

export interface LiveAgentHookUpdateRequest {
  enabled: boolean;
}

export interface LiveRoomActivateRequest {
  auctionId: number | string;
  durationMinutes: number;
  durationSec: number;
}

export interface ListLiveRoomsParams {
  merchantId?: string;
  status?: LiveRoomStatus;
  limit?: number;
  offset?: number;
}

export interface ListLiveRoomsResult {
  liveRooms?: LiveRoom[];
  rooms?: LiveRoom[];
  items?: LiveRoom[];
}

export interface ListLiveRoomLotsResult {
  lots: AuctionLot[];
}

export interface LiveSession {
  id: number | string;
  liveRoomId: number | string;
  merchantId: string;
  title: string;
  status: LiveSessionStatus;
  openedAt: string;
  closedAt?: string | null;
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

export interface ListLiveSessionsParams {
  status?: LiveSessionStatus;
  limit?: number;
  offset?: number;
}

export interface ListLiveSessionsResult {
  sessions: LiveSession[];
}

export interface LiveSessionBidRecord {
  id?: number | string;
  auctionId?: number | string;
  lotId?: number | string;
  bidderId?: string;
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

export function listLiveRooms(params: ListLiveRoomsParams = {}) {
  return http.get<any, ListLiveRoomsResult>('/api/v1/live-rooms', { params });
}

export function fetchLiveRoom(id: string | number) {
  return http.get<any, LiveRoom>(`/api/v1/live-rooms/${id}`);
}

export function createLiveRoom(payload: LiveRoomCreateRequest) {
  return http.post<any, LiveRoom>('/api/v1/live-rooms', payload);
}

export function patchLiveRoom(
  id: string | number,
  payload: LiveRoomPatchRequest,
  idempotencyKey?: string
) {
  const config: HttpRequestConfig = {};
  if (idempotencyKey) {
    config.headers = { 'Idempotency-Key': idempotencyKey };
  }
  return http.patch<any, LiveRoom>(`/api/v1/live-rooms/${id}`, payload, config);
}

export function uploadLiveRoomCover(
  id: string | number,
  payload: LiveRoomCoverUploadRequest,
  idempotencyKey: string
) {
  const formData = new FormData();
  formData.append('image', payload.image);
  return http.post<any, LiveRoom>(`/api/v1/live-rooms/${id}/cover`, formData, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  });
}

export function fetchLiveRoomAgentHookConfig(id: string | number) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.get<any, LiveAgentHookConfig>(
    `/api/v1/live-rooms/${id}/agent-hook`,
    config
  );
}

export function updateLiveRoomAgentHookConfig(
  id: string | number,
  payload: LiveAgentHookUpdateRequest,
  idempotencyKey: string
) {
  return http.patch<any, LiveAgentHookConfig>(
    `/api/v1/live-rooms/${id}/agent-hook`,
    payload,
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function deleteLiveRoom(id: string | number) {
  return http.delete<any, { deleted?: boolean }>(`/api/v1/live-rooms/${id}`);
}

export function listLiveRoomLots(id: string | number) {
  return http.get<any, ListLiveRoomLotsResult>(`/api/v1/live-rooms/${id}/lots`);
}

export function listLiveSessionsByRoom(
  id: string | number,
  params: ListLiveSessionsParams = {}
) {
  const config: HttpRequestConfig = {
    params,
    skipErrorMessage: true,
  };
  return http.get<any, ListLiveSessionsResult>(
    `/api/v1/live-rooms/${id}/sessions`,
    config
  );
}

export function listLiveSessionsByMerchant(
  merchantId: string | number,
  params: ListLiveSessionsParams = {}
) {
  const config: HttpRequestConfig = {
    params,
    skipErrorMessage: true,
  };
  return http.get<any, ListLiveSessionsResult>(
    `/api/v1/merchants/${merchantId}/live-sessions`,
    config
  );
}

export function fetchLiveSession(sessionId: string | number) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.get<any, LiveSession>(`/api/v1/live-sessions/${sessionId}`, {
    ...config,
  });
}

export function listLiveSessionLots(sessionId: string | number) {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.get<any, ListLiveRoomLotsResult>(
    `/api/v1/live-sessions/${sessionId}/lots`,
    config
  );
}

export function listLiveSessionBids(
  sessionId: string | number,
  params: Pick<ListLiveSessionsParams, 'limit'> = {}
) {
  const config: HttpRequestConfig = {
    params,
    skipErrorMessage: true,
  };
  return http.get<any, ListLiveSessionBidsResult>(
    `/api/v1/live-sessions/${sessionId}/bids`,
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

export function activateLiveRoomAuction(
  id: string | number,
  payload: LiveRoomActivateRequest,
  idempotencyKey: string
) {
  return http.post<any, AuctionLot>(
    `/api/v1/live-rooms/${id}/activate`,
    payload,
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function deactivateLiveRoomAuction(
  id: string | number,
  idempotencyKey: string
) {
  return http.post<any, LiveRoom>(
    `/api/v1/live-rooms/${id}/deactivate`,
    {},
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export async function attachAuctionToLiveRoom(
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
      '/api/v1/live-rooms/lots',
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

export async function detachAuctionFromLiveRoom(
  roomId: string | number,
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
      `/api/v1/live-rooms/${roomId}/lots/${auctionId}`,
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
