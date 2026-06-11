import React from 'react';
import { Tag } from '@arco-design/web-react';
import { LiveSession, LiveSessionStatus } from '@/services/liveSession';

const SESSION_STATUS_META: Record<
  LiveSessionStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: '草稿', color: 'gray' },
  SCHEDULED: { label: '已排期', color: 'arcoblue' },
  LIVE: { label: '直播中', color: 'green' },
  ENDED: { label: '已结束', color: 'gray' },
  CANCELLED: { label: '已取消', color: 'red' },
};

export function renderSessionStatus(status?: LiveSessionStatus) {
  if (!status) {
    return '-';
  }
  const meta = SESSION_STATUS_META[status] || {
    label: status,
    color: 'gray',
  };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return value;
  }

  return parsedValue.toLocaleString('zh-CN', {
    hour12: false,
  });
}

export function formatMoneyCent(value?: number | string | null) {
  if (value === null || value === undefined || value === '') {
    return '¥0.00';
  }
  return `¥${(Number(value) / 100).toFixed(2)}`;
}

export function formatCount(value?: number | string | null) {
  if (value === null || value === undefined || value === '') {
    return '0';
  }
  return String(value);
}

export function formatSessionDuration(session?: LiveSession) {
  if (!session?.openedAt) {
    return '-';
  }
  const start = new Date(session.openedAt).getTime();
  const end = session.closedAt ? new Date(session.closedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return '-';
  }
  const totalMinutes = Math.max(1, Math.round((end - start) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes} 分钟`;
  }
  return `${hours} 小时 ${minutes} 分钟`;
}

export function getSessionTitle(session: LiveSession) {
  return session.title || `${formatDateTime(session.openedAt)} 直播记录`;
}
