import http from './http/client';

export type AuditOperatorRole = 'buyer' | 'merchant' | 'admin';

export interface AuditLogRecord {
  id: number | string;
  operatorId: string;
  operatorRole: AuditOperatorRole;
  action: string;
  targetType: string;
  targetId: string;
  payload?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ListAuditLogsParams {
  operatorId?: string;
  action?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}

export interface ListAuditLogsResult {
  items: AuditLogRecord[];
  total: number;
  page: number;
  page_size: number;
}

export function listAuditLogs(params: ListAuditLogsParams) {
  return http.get<any, ListAuditLogsResult>('/api/v1/admin/audit-logs', {
    params: {
      ...params,
      page_size: params.pageSize,
    },
  });
}
