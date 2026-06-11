import http, { HttpRequestConfig } from './http/client';

export type AIAssistantPermission = 'ASK' | 'ALLOW' | 'DENY';

export interface AIAssistantPermissionResult {
  permission: AIAssistantPermission;
}

export interface AIAssistantEventPayload {
  eventId?: string;
  kind?: 'status' | 'permission' | 'broadcast' | 'switch';
  status?: string;
  toolName?: string;
  merchantId?: string;
  liveSessionId?: number | string;
  requestId?: string;
  permission?: AIAssistantPermission;
  enabled?: boolean;
  videoSource?: 'recorded' | 'digitalHuman';
  liveRoom?: Record<string, unknown>;
  message?: string;
  broadcastText?: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface AIAssistantApprovalDecision {
  requestId: string;
  approved: boolean;
  message: string;
  decidedAt: string;
  liveSessionId?: number | string;
}

export function fetchAIAssistantPermission() {
  const config: HttpRequestConfig = {
    skipErrorMessage: true,
  };
  return http.get<any, AIAssistantPermissionResult>(
    '/api/v1/ai-assistant/permission',
    config
  );
}

export function updateAIAssistantPermission(
  permission: AIAssistantPermission,
  idempotencyKey: string
) {
  return http.patch<any, AIAssistantPermissionResult>(
    '/api/v1/ai-assistant/permission',
    { permission },
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    }
  );
}

export function decideAIAssistantApproval(
  requestId: string,
  approved: boolean,
  idempotencyKey: string
) {
  const config: HttpRequestConfig = {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    skipErrorMessage: true,
  };
  return http.post<any, AIAssistantApprovalDecision>(
    `/api/v1/ai-assistant/approvals/${encodeURIComponent(requestId)}/decision`,
    { approved },
    config
  );
}
