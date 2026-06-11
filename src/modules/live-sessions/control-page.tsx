import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography,
} from '@arco-design/web-react';
import {
  IconClockCircle,
  IconExclamationCircle,
  IconLiveBroadcast,
  IconOrderedList,
  IconPauseCircle,
  IconPlayArrow,
  IconPlus,
  IconRefresh,
  IconThunderbolt,
  IconTrophy,
  IconUserGroup,
} from '@arco-design/web-react/icon';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import AuctionLotCard from '@/components/AuctionLotCard';
import LiveSessionClient, {
  LiveSessionConnectionStatus,
  LiveSessionEnvelope,
} from '@/services/live-session-client';
import {
  AuctionLot,
  AuctionState,
  cancelAuction,
  fetchAuction,
  fetchAuctionState,
  hammerAuction,
} from '@/services/auctions';
import {
  activateLiveSessionAuction,
  deactivateLiveSessionAuction,
  detachAuctionFromLiveSession,
  fetchLiveSessionStats,
  fetchLiveSessionAgentHookConfig,
  fetchLiveSession,
  listLiveSessionBids,
  listLiveSessionLots,
  LiveSession,
  LiveSessionBidRecord,
  updateLiveSessionAgentHookConfig,
} from '@/services/liveSession';
import {
  AIAssistantEventPayload,
  AIAssistantPermission,
  decideAIAssistantApproval,
  fetchAIAssistantPermission,
  updateAIAssistantPermission,
} from '@/services/aiAssistant';
import {
  buildIdempotencyKey,
  canDetachAuctionFromLiveSession,
  formatDateTime,
  formatMoneyCent,
  isAuctionSuccessful,
  renderAuctionStatusTag,
} from '@/modules/auctions/utils';
import {
  DEFAULT_AUCTION_DURATION_MINUTES,
  buildAuctionTiming,
  isAuctionInProgress,
  normalizeAuctionDurationMinutes,
} from './constants';
import AuctionDurationPicker from './duration-picker';
import styles from '../management.module.less';

const TextArea = Input.TextArea;

interface RankingItem {
  bidderId: string;
  bidderName: string;
  price: number;
  bidCount?: number;
  updatedAt?: string;
}

interface EventLogItem {
  id: string;
  type: string;
  content: string;
  createdAt: string;
}

type ActionType = 'cancel' | 'hammer';
type StartMode = 'now' | 'scheduled';

const START_TIME_FORMAT = 'HH:mm';

function rangeNumber(end: number) {
  return Array.from({ length: Math.max(0, end) }, (_, index) => index);
}

function formatTimeValue(date: Date) {
  return [date.getHours(), date.getMinutes()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function nextSelectableTodayTime(nowMs: number) {
  const current = new Date(nowMs);
  const next = new Date(nowMs);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  if (
    next.getFullYear() !== current.getFullYear() ||
    next.getMonth() !== current.getMonth() ||
    next.getDate() !== current.getDate()
  ) {
    return '';
  }
  return formatTimeValue(next);
}

function parseTodayStartTime(value: string) {
  const raw = value.trim();
  if (!raw) {
    return undefined;
  }
  const parts = raw.split(':').map((part) => Number(part));
  const [hour, minute, second = 0] = parts;
  if (
    parts.length < 2 ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return undefined;
  }
  const date = new Date();
  date.setHours(hour, minute, second, 0);
  return date;
}

interface RealtimePatch {
  serverTimeMs?: number;
  auctionId?: number;
  viewerCount?: number;
  likeCount?: number;
  bidCount?: number;
  bidAcceptedDelta: number;
  orderCreatedDelta: number;
  status?: AuctionState['status'];
  startPrice?: number;
  capPrice?: number;
  currentPrice?: number;
  leaderBidderId?: string;
  startTime?: string;
  endTime?: string;
  extendCount?: number;
  version?: number;
  lastBidTsMs?: number;
  incrementRule?: AuctionState['incrementRule'];
  source?: string;
  ranking?: RankingItem[];
  topBid?: RankingItem;
  antiSnipingTip?: string;
  shouldRefreshRoom: boolean;
}

const CONNECTION_STATUS_META: Record<
  LiveSessionConnectionStatus,
  { label: string; color: string }
> = {
  idle: { label: '未连接', color: 'gray' },
  connecting: { label: '连接中', color: 'arcoblue' },
  connected: { label: '已连接', color: 'green' },
  reconnecting: { label: '重连中', color: 'orange' },
  closed: { label: '已关闭', color: 'gray' },
  error: { label: '连接异常', color: 'red' },
};

const EVENT_TYPE_LABEL_MAP: Record<string, string> = {
  'room.snapshot': '实时快照',
  'room.online': '在线人数',
  'auction.started': '开拍',
  'bid.ack': '出价确认',
  'bid.accepted': '出价成功',
  'bid.rejected': '出价失败',
  'bidder.overtaken': '领先变化',
  'ranking.updated': '榜单更新',
  'timer.tick': '倒计时',
  'timer.extended': '自动延时',
  'auction.closed': '结拍',
  'order.created': '成交订单',
  announcement: '直播公告',
  'risk.event': '风控提醒',
  error: '异常',
};

const BUSINESS_EVENT_TYPES = new Set([
  'auction.started',
  'bid.ack',
  'bid.accepted',
  'bid.rejected',
  'bidder.overtaken',
  'ranking.updated',
  'timer.tick',
  'timer.extended',
  'auction.closed',
  'order.created',
  'announcement',
  'risk.event',
  'error',
]);

const LIVE_STATS_FALLBACK_INTERVAL_MS = 30000;
const REALTIME_FLUSH_INTERVAL_MS = 200;
const SCHEDULED_AUCTION_REFRESH_INTERVAL_MS = 3000;
const SCHEDULED_AUCTION_REFRESH_OFFSET_MS = 800;

const HIGH_FREQUENCY_MESSAGE_TYPES = new Set([
  'room.snapshot',
  'room.online',
  'bid.accepted',
  'ranking.updated',
]);

const QUIET_EVENT_LOG_TYPES = new Set([
  'room.snapshot',
  'room.online',
  'bid.accepted',
  'ranking.updated',
  'timer.tick',
]);

const LIVE_METRIC_CARDS = [
  {
    key: 'viewers',
    label: '在线人数',
    hint: '实时在线',
    icon: <IconUserGroup />,
    className: styles.metricCardBlue,
  },
  {
    key: 'bids',
    label: '出价次数',
    hint: '当前拍品',
    icon: <IconThunderbolt />,
    className: styles.metricCardRose,
  },
  {
    key: 'followers',
    label: '粉丝数',
    hint: '关注商家',
    icon: <IconUserGroup />,
    className: styles.metricCardGreen,
  },
  {
    key: 'orders',
    label: '成交订单',
    hint: '本场成交',
    icon: <IconTrophy />,
    className: styles.metricCardAmber,
  },
];

const AI_PERMISSION_OPTIONS: Array<{
  label: string;
  value: AIAssistantPermission;
}> = [
  { label: '每次询问', value: 'ASK' },
  { label: '自动允许', value: 'ALLOW' },
  { label: '全部拒绝', value: 'DENY' },
];

function renderEventTypeTag(type: string) {
  return (
    <Tag>{EVENT_TYPE_LABEL_MAP[type] || formatUnknownEventType(type)}</Tag>
  );
}

function formatUnknownEventType(type: string) {
  return type
    .split('.')
    .filter(Boolean)
    .map((part) => EVENT_TYPE_LABEL_MAP[part] || part)
    .join(' / ');
}

function isBusinessEvent(message: LiveSessionEnvelope) {
  if (message.ack && !BUSINESS_EVENT_TYPES.has(message.type)) {
    return false;
  }
  return BUSINESS_EVENT_TYPES.has(message.type);
}

function getPayload(message: LiveSessionEnvelope) {
  return (message.payload || {}) as Record<string, any>;
}

function getStringValue(payload: Record<string, any>, keys: string[]) {
  const value = keys
    .map((key) => payload[key])
    .find((item) => item !== undefined && item !== null);
  return value === undefined || value === null ? undefined : String(value);
}

function getNumberValue(payload: Record<string, any>, keys: string[]) {
  const value = keys
    .map((key) => payload[key])
    .find((item) => item !== undefined && item !== null);
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeTimestampMs(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  const numericValue = Number(text);
  if (Number.isFinite(numericValue)) {
    return numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue;
  }
  const parsedTime = new Date(text).getTime();
  return Number.isFinite(parsedTime) ? parsedTime : undefined;
}

function normalizeTimestampISO(value: unknown) {
  const time = normalizeTimestampMs(value);
  return time === undefined ? undefined : new Date(time).toISOString();
}

function getDateValue(payload: Record<string, any>, keys: string[]) {
  const value = keys
    .map((key) => payload[key])
    .find((item) => item !== undefined && item !== null);
  return normalizeTimestampISO(value);
}

function getBidderNameFromPayload(payload: Record<string, any>) {
  return (
    getStringValue(payload, [
      'bidderNickname',
      'nickname',
      'bidderName',
      'userName',
      'buyerName',
    ]) || '匿名用户'
  );
}

function normalizeAssistantEvent(
  message: LiveSessionEnvelope
): AIAssistantEventPayload {
  const payload = getPayload(message) as AIAssistantEventPayload;
  return {
    ...payload,
    kind:
      payload.kind ||
      (message.type === 'ai.assistant.permission_request'
        ? 'permission'
        : message.type === 'ai.assistant.broadcast'
        ? 'broadcast'
        : 'status'),
    status:
      payload.status ||
      (message.type === 'ai.assistant.permission_request'
        ? 'pending'
        : 'running'),
    requestId: payload.requestId || message.requestId,
    liveSessionId: payload.liveSessionId || message.liveSessionId,
    message: payload.message || buildEventContent(message),
    createdAt: payload.createdAt || new Date().toISOString(),
    eventId:
      payload.eventId ||
      `${message.type}-${message.requestId || message.seq || Date.now()}`,
  };
}

function sanitizeAssistantDisplayText(value?: string) {
  if (!value) {
    return undefined;
  }

  const cleanedText = value
    .replace(/,\s*"(?:liveSessionId|live_session_id)"\s*:\s*"?[\w-]+"?/gi, '')
    .replace(/"(?:liveSessionId|live_session_id)"\s*:\s*"?[\w-]+"?\s*,?/gi, '')
    .replace(/live\s*session\s*id\s*[:：=]\s*[\w-]+[，,、;；]?\s*/gi, '')
    .replace(/liveSessionId\s*[:：=]\s*[\w-]+[，,、;；]?\s*/g, '')
    .replace(/live_session_id\s*[:：=]\s*[\w-]+[，,、;；]?\s*/gi, '')
    .replace(
      /(?:直播)?场次\s*(?:ID|编号)\s*[:：=]?\s*[\w-]+[，,、;；]?\s*/gi,
      ''
    )
    .replace(/^[\s，,、;；]+|[\s，,、;；]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleanedText || undefined;
}

function assistantDotClass(status?: string) {
  switch (status) {
    case 'completed':
    case 'approved':
      return styles.aiAssistantDotCompleted;
    case 'failed':
    case 'rejected':
    case 'timeout':
      return styles.aiAssistantDotFailed;
    case 'pending':
      return styles.aiAssistantDotPending;
    default:
      return styles.aiAssistantDotRunning;
  }
}

function assistantApprovalRemainSeconds(
  event: AIAssistantEventPayload,
  nowMs: number
) {
  if (!event.expiresAt) {
    return undefined;
  }
  const expiresAt = new Date(event.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) {
    return undefined;
  }
  return Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
}

function shouldRefreshAfterAssistantEvent(event: AIAssistantEventPayload) {
  return (
    event.kind === 'switch' ||
    (event.kind === 'status' &&
      event.toolName === 'operate_live_session_lot' &&
      event.status === 'completed')
  );
}

function getBidderNameFromRecord(record: LiveSessionBidRecord) {
  return (
    record.bidderNickname || record.nickname || record.bidderName || '匿名用户'
  );
}

function getBidPriceFromRecord(record: LiveSessionBidRecord) {
  return Number(
    record.bidPrice ?? record.price ?? record.amountCent ?? record.amount ?? 0
  );
}

function buildRankingFromBids(records: LiveSessionBidRecord[]) {
  const rankingMap = new Map<string, RankingItem>();
  records.forEach((record) => {
    const bidderId = String(
      record.bidderId || record.userId || record.buyerId || ''
    );
    const bidderName = getBidderNameFromRecord(record);
    const price = getBidPriceFromRecord(record);
    if (!bidderId || !Number.isFinite(price) || price <= 0) {
      return;
    }
    const current = rankingMap.get(bidderId);
    rankingMap.set(bidderId, {
      bidderId,
      bidderName: current?.bidderName || bidderName,
      price: Math.max(current?.price || 0, price),
      bidCount: (current?.bidCount || 0) + 1,
      updatedAt: String(
        record.createdAt || record.bidAt || current?.updatedAt || ''
      ),
    });
  });
  return Array.from(rankingMap.values())
    .sort((left, right) => right.price - left.price)
    .slice(0, 10);
}

function createEmptyRealtimePatch(): RealtimePatch {
  return {
    bidAcceptedDelta: 0,
    orderCreatedDelta: 0,
    shouldRefreshRoom: false,
  };
}

function buildRankingFromPayload(payload: Record<string, any>) {
  const nextRanking =
    payload.ranking || payload.rankings || payload.list || payload.items;
  if (!Array.isArray(nextRanking)) {
    return undefined;
  }
  return nextRanking
    .map((item) => ({
      bidderId: String(item.bidderId || item.userId || item.id || '-'),
      bidderName: getBidderNameFromPayload(item),
      price: Number(item.price || item.amount || item.currentPrice || 0),
      bidCount: Number(item.bidCount || item.count || 0) || undefined,
      updatedAt: item.updatedAt || item.createdAt,
    }))
    .filter((item) => item.bidderId !== '-' && item.price > 0)
    .sort((left, right) => right.price - left.price)
    .slice(0, 10);
}

function buildRealtimePatch(message: LiveSessionEnvelope): RealtimePatch {
  const payload = getPayload(message);
  const patch = createEmptyRealtimePatch();
  const serverTimeMs = normalizeTimestampMs(
    payload.serverTime ?? payload.serverTs ?? payload.now
  );
  const nextAuctionId = getNumberValue(payload, [
    'auctionId',
    'auctionID',
    'activeAuctionId',
  ]);
  const nextStatus = getStringValue(payload, ['status', 'auctionStatus']) as
    | AuctionState['status']
    | undefined;
  const nextCurrentPrice = getNumberValue(payload, [
    'currentPrice',
    'price',
    'amount',
    'bidPrice',
  ]);
  const nextLeader = getStringValue(payload, [
    'leaderBidderId',
    'bidderId',
    'userId',
  ]);

  patch.serverTimeMs = serverTimeMs;
  patch.auctionId = nextAuctionId;
  patch.viewerCount = getNumberValue(payload, [
    'online',
    'viewerCount',
    'onlineCount',
    'audienceCount',
    'roomUserCount',
  ]);
  patch.likeCount = getNumberValue(payload, [
    'likeCount',
    'likes',
    'interactionCount',
  ]);
  patch.bidCount = getNumberValue(payload, ['bidCount', 'bids']);
  patch.status = nextStatus;
  patch.startPrice = getNumberValue(payload, ['startPrice']);
  patch.capPrice = getNumberValue(payload, ['capPrice']);
  patch.currentPrice = nextCurrentPrice;
  patch.leaderBidderId = nextLeader;
  patch.startTime = getDateValue(payload, ['startTime']);
  patch.endTime = getDateValue(payload, ['endTime', 'newEndTime']);
  patch.extendCount = getNumberValue(payload, ['extendCount']);
  patch.version = getNumberValue(payload, ['version']);
  patch.lastBidTsMs = getNumberValue(payload, ['lastBidTsMs', 'bidTsMs']);
  patch.incrementRule = payload.incrementRule as
    | AuctionState['incrementRule']
    | undefined;
  patch.source = getStringValue(payload, ['source']);

  if (message.type === 'bid.accepted') {
    patch.bidAcceptedDelta = 1;
    if (nextLeader && nextCurrentPrice) {
      patch.topBid = {
        bidderId: nextLeader,
        bidderName: getBidderNameFromPayload(payload),
        price: nextCurrentPrice,
        bidCount: 1,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (message.type === 'ranking.updated') {
    patch.ranking = buildRankingFromPayload(payload);
  }

  if (message.type === 'order.created') {
    patch.orderCreatedDelta = 1;
  }

  if (message.type === 'timer.extended') {
    const extendSec = getNumberValue(payload, [
      'extendSec',
      'extendedSec',
      'seconds',
    ]);
    patch.antiSnipingTip = `防抢拍已触发${
      extendSec ? `，本轮延长 ${extendSec} 秒` : ''
    }`;
  }

  if (message.type === 'auction.started' || message.type === 'auction.closed') {
    patch.shouldRefreshRoom = true;
  }

  return patch;
}

function absorbRealtimePatch(target: RealtimePatch, patch: RealtimePatch) {
  target.bidAcceptedDelta += patch.bidAcceptedDelta;
  target.orderCreatedDelta += patch.orderCreatedDelta;
  target.shouldRefreshRoom =
    target.shouldRefreshRoom || patch.shouldRefreshRoom;

  if (patch.serverTimeMs !== undefined)
    target.serverTimeMs = patch.serverTimeMs;
  if (patch.auctionId !== undefined) target.auctionId = patch.auctionId;
  if (patch.viewerCount !== undefined) target.viewerCount = patch.viewerCount;
  if (patch.likeCount !== undefined) target.likeCount = patch.likeCount;
  if (patch.bidCount !== undefined) target.bidCount = patch.bidCount;
  if (patch.status !== undefined) target.status = patch.status;
  if (patch.startPrice !== undefined) target.startPrice = patch.startPrice;
  if (patch.capPrice !== undefined) target.capPrice = patch.capPrice;
  if (patch.currentPrice !== undefined)
    target.currentPrice = patch.currentPrice;
  if (patch.leaderBidderId !== undefined) {
    target.leaderBidderId = patch.leaderBidderId;
  }
  if (patch.startTime !== undefined) target.startTime = patch.startTime;
  if (patch.endTime !== undefined) target.endTime = patch.endTime;
  if (patch.extendCount !== undefined) target.extendCount = patch.extendCount;
  if (patch.version !== undefined) target.version = patch.version;
  if (patch.lastBidTsMs !== undefined) target.lastBidTsMs = patch.lastBidTsMs;
  if (patch.incrementRule !== undefined) {
    target.incrementRule = patch.incrementRule;
  }
  if (patch.source !== undefined) target.source = patch.source;
  if (patch.ranking !== undefined) target.ranking = patch.ranking;
  if (patch.topBid !== undefined) target.topBid = patch.topBid;
  if (patch.antiSnipingTip !== undefined) {
    target.antiSnipingTip = patch.antiSnipingTip;
  }
}

function buildEventContent(message: LiveSessionEnvelope) {
  const payload = getPayload(message);
  switch (message.type) {
    case 'auction.started':
      return `拍品已开拍，状态 ${getStringValue(payload, ['status']) || '-'}`;
    case 'bid.ack':
      return '出价请求已确认';
    case 'bid.accepted':
      return `${getBidderNameFromPayload(payload)} 出价 ${formatMoneyCent(
        getNumberValue(payload, ['price', 'amount', 'currentPrice'])
      )}`;
    case 'bid.rejected':
      return (
        getStringValue(payload, ['reason', 'message', 'error']) || '出价未通过'
      );
    case 'bidder.overtaken':
      return `${getBidderNameFromPayload(payload)} 的领先位置发生变化`;
    case 'ranking.updated':
      return '出价榜已更新';
    case 'timer.tick':
      return `倒计时同步，结束时间 ${formatDateTime(
        getDateValue(payload, ['endTime'])
      )}`;
    case 'timer.extended':
      return `防抢拍已触发，延长 ${
        getNumberValue(payload, ['extendSec', 'extendedSec', 'seconds']) || 0
      } 秒`;
    case 'auction.closed':
      return `拍品已结束，状态 ${getStringValue(payload, ['status']) || '-'}`;
    case 'order.created':
      return '成交订单已创建';
    case 'announcement':
      return (
        getStringValue(payload, ['text', 'message', 'content']) || '直播公告'
      );
    case 'risk.event':
      return (
        getStringValue(payload, ['message', 'reason', 'riskResult']) ||
        '触发风控提醒'
      );
    case 'error':
      return (
        getStringValue(payload, ['message', 'error']) || '实时连接返回错误'
      );
    default:
      return formatUnknownEventType(message.type);
  }
}

function formatRemaining(ms: number) {
  if (!Number.isFinite(ms)) {
    return '--:--:--';
  }
  if (ms <= 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export default function LiveSessionControlPage() {
  const history = useHistory();
  const { id: liveSessionId } = useParams() as { id?: string };
  const roomId = liveSessionId;
  const roomClientRef = useRef<LiveSessionClient>();
  const lotPanelRef = useRef<HTMLDivElement>(null);
  const serverTimeOffsetRef = useRef(0);
  const realtimePatchRef = useRef<RealtimePatch>(createEmptyRealtimePatch());
  const realtimeFlushTimerRef = useRef<number>();

  const [room, setRoom] = useState<LiveSession>();
  const [auction, setAuction] = useState<AuctionLot>();
  const [auctionState, setAuctionState] = useState<AuctionState>();
  const [lots, setLots] = useState<AuctionLot[]>([]);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLogItem[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<LiveSessionConnectionStatus>('idle');
  const [loading, setLoading] = useState(false);
  const [lotLoading, setLotLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [antiSnipingTip, setAntiSnipingTip] = useState('');
  const [actionType, setActionType] = useState<ActionType>();
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actingAuctionId, setActingAuctionId] = useState<string | number>();
  const [startLot, setStartLot] = useState<AuctionLot>();
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_AUCTION_DURATION_MINUTES
  );
  const [startMode, setStartMode] = useState<StartMode>('now');
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [liveMetrics, setLiveMetrics] = useState({
    viewerCount: 0,
    bidCount: 0,
    followerCount: 0,
    orderCount: 0,
  });
  const [agentHookEnabled, setAgentHookEnabled] = useState(false);
  const [agentHookLoading, setAgentHookLoading] = useState(false);
  const [agentHookUpdating, setAgentHookUpdating] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPermission, setAssistantPermission] =
    useState<AIAssistantPermission>('ASK');
  const [assistantPermissionLoading, setAssistantPermissionLoading] =
    useState(false);
  const [assistantDecisionLoading, setAssistantDecisionLoading] = useState<
    Record<string, boolean>
  >({});
  const [assistantEvents, setAssistantEvents] = useState<
    AIAssistantEventPayload[]
  >([]);

  const scheduledTimeBoundary = useMemo(() => {
    const current = new Date(now);
    return {
      hour: current.getHours(),
      minute: current.getMinutes(),
    };
  }, [now]);
  const hasSelectableScheduledTime =
    scheduledTimeBoundary.hour < 23 || scheduledTimeBoundary.minute < 59;
  const disabledScheduledHours = useMemo(() => {
    const pastHours = rangeNumber(scheduledTimeBoundary.hour);
    if (scheduledTimeBoundary.minute >= 59) {
      return [...pastHours, scheduledTimeBoundary.hour];
    }
    return pastHours;
  }, [scheduledTimeBoundary.hour, scheduledTimeBoundary.minute]);
  const disabledScheduledMinutes = (selectedHour: number | string) => {
    if (Number(selectedHour) !== scheduledTimeBoundary.hour) {
      return [];
    }
    return rangeNumber(scheduledTimeBoundary.minute + 1);
  };

  const fallbackActiveAuctionId = Number(
    lots.find((lot) => isAuctionInProgress(lot.status))?.auctionId || 0
  );
  const activeAuctionId = Number(
    room?.activeAuctionId || fallbackActiveAuctionId
  );
  const hasActiveAuction = activeAuctionId !== 0;
  const scheduledLot = lots.find((lot) => lot.status === 'WARMING_UP');
  const hasScheduledLot = !!scheduledLot;
  const roomIsLive = room?.status === 'LIVE';
  const connectionMeta = CONNECTION_STATUS_META[connectionStatus];
  const currentPrice = hasActiveAuction
    ? auctionState?.currentPrice ?? auction?.currentPrice ?? auction?.startPrice
    : undefined;
  const leaderBidderId = hasActiveAuction
    ? auctionState?.leaderBidderId || auction?.winnerId || ''
    : '';
  const leaderBidderName = hasActiveAuction
    ? ranking.find((item) => item.bidderId === leaderBidderId)?.bidderName ||
      ranking[0]?.bidderName ||
      '-'
    : '-';
  const endTime = hasActiveAuction
    ? auctionState?.endTime || auction?.endTime
    : undefined;
  const remainingText = useMemo(() => {
    const endTimeMs = normalizeTimestampMs(endTime);
    if (endTimeMs === undefined) {
      return '--:--:--';
    }
    return formatRemaining(endTimeMs - now);
  }, [endTime, now]);

  const canCancel =
    !!auctionState &&
    !['CLOSED_WON', 'CLOSED_FAILED', 'SETTLED'].includes(auctionState.status);
  const canHammer =
    !!auctionState &&
    ['RUNNING', 'EXTENDED', 'HAMMER_PENDING'].includes(auctionState.status);
  const startableLots = lots.filter((lot) => {
    const isActive =
      (Number(lot.auctionId) === activeAuctionId && activeAuctionId !== 0) ||
      isAuctionInProgress(lot.status);
    return (
      roomIsLive &&
      activeAuctionId === 0 &&
      !hasScheduledLot &&
      !isActive &&
      lot.status !== 'WARMING_UP'
    );
  });
  const metricValues: Record<string, string | number> = {
    viewers: liveMetrics.viewerCount,
    bids: liveMetrics.bidCount ?? auction?.bidCount ?? ranking.length,
    followers: liveMetrics.followerCount,
    orders: liveMetrics.orderCount,
  };
  const settledAssistantApprovalIds = new Set(
    assistantEvents
      .filter(
        (event) =>
          event.kind === 'permission' &&
          event.status !== 'pending' &&
          !!event.requestId
      )
      .map((event) => String(event.requestId))
  );
  const pendingAssistantApprovals = assistantEvents.filter((event) => {
    if (
      event.kind !== 'permission' ||
      event.status !== 'pending' ||
      !event.requestId ||
      settledAssistantApprovalIds.has(String(event.requestId))
    ) {
      return false;
    }
    if (!event.expiresAt) {
      return true;
    }
    return new Date(event.expiresAt).getTime() > now;
  });
  const latestAssistantEvent = assistantEvents[0];

  async function loadRoomAndAuction() {
    if (!liveSessionId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [liveSession, lotResult] = await Promise.all([
        fetchLiveSession(liveSessionId),
        listLiveSessionLots(liveSessionId).catch(() => ({ lots: [] })),
      ]);
      const nextLots = lotResult.lots || [];
      const fallbackActiveId = Number(
        nextLots.find((lot) => isAuctionInProgress(lot.status))?.auctionId || 0
      );
      const nextRoom =
        !Number(liveSession.activeAuctionId || 0) && fallbackActiveId
          ? { ...liveSession, activeAuctionId: fallbackActiveId }
          : liveSession;
      setRoom(nextRoom);
      setLots(nextLots);
      if (liveSession.status === 'LIVE') {
        loadAgentHookConfig(liveSession.id);
      } else {
        setAgentHookEnabled(false);
        setAgentHookLoading(false);
      }
      const activeId = Number(nextRoom.activeAuctionId || 0);
      if (activeId !== 0) {
        const [auctionResult, stateResult] = await Promise.all([
          fetchAuction(activeId),
          fetchAuctionState(activeId).catch(() => undefined),
        ]);
        setAuction(auctionResult);
        if (stateResult) {
          setAuctionState(stateResult);
        }
      } else {
        setAuction(undefined);
        setAuctionState(undefined);
      }
    } catch (error) {
      setLoadError('直播间或拍品加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function loadAgentHookConfig(currentRoomId: string | number) {
    setAgentHookLoading(true);
    try {
      const config = await fetchLiveSessionAgentHookConfig(currentRoomId);
      setAgentHookEnabled(!!config.enabled);
    } catch (error) {
      setAgentHookEnabled(false);
    } finally {
      setAgentHookLoading(false);
    }
  }

  async function loadAssistantPermission() {
    setAssistantPermissionLoading(true);
    try {
      const result = await fetchAIAssistantPermission();
      setAssistantPermission(result.permission || 'ASK');
    } catch (error) {
      setAssistantPermission('ASK');
    } finally {
      setAssistantPermissionLoading(false);
    }
  }

  async function loadLots() {
    if (!liveSessionId) return;
    setLotLoading(true);
    try {
      const result = await listLiveSessionLots(liveSessionId);
      setLots(result.lots || []);
    } finally {
      setLotLoading(false);
    }
  }

  async function loadLiveStats() {
    if (!liveSessionId) return;
    try {
      const stats = await fetchLiveSessionStats(liveSessionId);
      const statsActiveAuctionId = Number(stats.activeAuctionId || 0);
      const bidResult =
        statsActiveAuctionId !== 0
          ? await listLiveSessionBids(liveSessionId, {
              limit: 50,
              auctionId: statsActiveAuctionId,
            }).catch(() => ({
              bids: [],
            }))
          : { bids: [] };
      const currentBidCount =
        statsActiveAuctionId !== 0 ? Number(stats.currentBidCount || 0) : 0;
      setLiveMetrics((prevMetrics) => ({
        ...prevMetrics,
        viewerCount: Number(stats.online || 0),
        bidCount: currentBidCount,
        followerCount: Number(stats.merchantFollowerCount || 0),
      }));
      setRanking(
        statsActiveAuctionId !== 0
          ? buildRankingFromBids(bidResult.bids || [])
          : []
      );
      if (statsActiveAuctionId !== 0 && stats.currentPrice > 0) {
        setAuctionState((prevState) =>
          prevState
            ? {
                ...prevState,
                currentPrice: stats.currentPrice,
              }
            : prevState
        );
        setAuction((prevAuction) =>
          prevAuction
            ? {
                ...prevAuction,
                currentPrice: stats.currentPrice,
                bidCount: currentBidCount,
              }
            : prevAuction
        );
      }
    } catch (error) {
      // stats 轮询失败不阻断控场页主链路，下一轮继续刷新。
    }
  }

  function refreshAll() {
    loadRoomAndAuction();
    loadLiveStats();
  }

  function appendEventLog(message: LiveSessionEnvelope) {
    setEventLogs((prevLogs) =>
      [
        {
          id: `${message.type}-${message.seq || Date.now()}-${Math.random()}`,
          type: message.type,
          content: buildEventContent(message),
          createdAt: new Date().toISOString(),
        },
        ...prevLogs,
      ].slice(0, 20)
    );
  }

  function clearRealtimeFlushTimer() {
    if (realtimeFlushTimerRef.current !== undefined) {
      window.clearTimeout(realtimeFlushTimerRef.current);
      realtimeFlushTimerRef.current = undefined;
    }
  }

  function applyRealtimePatch(patch: RealtimePatch) {
    if (patch.serverTimeMs !== undefined) {
      serverTimeOffsetRef.current = patch.serverTimeMs - Date.now();
      setNow(patch.serverTimeMs);
    }

    if (patch.auctionId) {
      setRoom((prevRoom) =>
        prevRoom && Number(prevRoom.activeAuctionId || 0) !== patch.auctionId
          ? {
              ...prevRoom,
              activeAuctionId: patch.auctionId,
            }
          : prevRoom
      );
    }

    if (
      patch.viewerCount !== undefined ||
      patch.bidCount !== undefined ||
      patch.bidAcceptedDelta > 0 ||
      patch.likeCount !== undefined ||
      patch.orderCreatedDelta > 0
    ) {
      setLiveMetrics((prevMetrics) => ({
        viewerCount: patch.viewerCount ?? prevMetrics.viewerCount,
        bidCount:
          patch.bidCount ?? prevMetrics.bidCount + patch.bidAcceptedDelta,
        followerCount: prevMetrics.followerCount,
        orderCount: prevMetrics.orderCount + patch.orderCreatedDelta,
      }));
    }

    if (patch.ranking) {
      setRanking(patch.ranking);
    } else if (patch.topBid) {
      setRanking((prevRanking) => {
        const current = prevRanking.find(
          (item) => item.bidderId === patch.topBid?.bidderId
        );
        const withoutCurrent = prevRanking.filter(
          (item) => item.bidderId !== patch.topBid?.bidderId
        );
        return [
          {
            ...patch.topBid,
            bidCount: (current?.bidCount || 0) + patch.bidAcceptedDelta,
          },
          ...withoutCurrent,
        ]
          .sort((left, right) => right.price - left.price)
          .slice(0, 10);
      });
    }

    const hasAuctionStatePatch =
      patch.status ||
      patch.startPrice !== undefined ||
      patch.capPrice !== undefined ||
      patch.currentPrice !== undefined ||
      patch.leaderBidderId ||
      patch.startTime ||
      patch.endTime ||
      patch.extendCount !== undefined ||
      patch.version !== undefined ||
      patch.lastBidTsMs !== undefined ||
      patch.incrementRule ||
      patch.source;

    if (hasAuctionStatePatch) {
      setAuctionState((prevState) => {
        if (!prevState) {
          const auctionId = patch.auctionId || Number(auction?.auctionId || 0);
          const status = patch.status || auction?.status;
          if (!auctionId || !status) {
            return prevState;
          }
          return {
            auctionId,
            status,
            startPrice: patch.startPrice ?? Number(auction?.startPrice || 0),
            capPrice: patch.capPrice ?? Number(auction?.capPrice || 0),
            incrementRule: patch.incrementRule || auction?.incrementRule,
            currentPrice:
              patch.currentPrice ??
              Number(auction?.currentPrice ?? auction?.startPrice ?? 0),
            leaderBidderId:
              patch.leaderBidderId || auction?.leaderBidderId || '',
            startTime: patch.startTime || auction?.startTime || '',
            endTime: patch.endTime || auction?.endTime || '',
            lastBidTsMs: patch.lastBidTsMs ?? 0,
            extendCount: patch.extendCount ?? 0,
            version: patch.version ?? 0,
            source: patch.source || 'ws',
          };
        }
        return {
          ...prevState,
          status: patch.status || prevState.status,
          startPrice: patch.startPrice ?? prevState.startPrice,
          capPrice: patch.capPrice ?? prevState.capPrice,
          incrementRule: patch.incrementRule || prevState.incrementRule,
          currentPrice: patch.currentPrice ?? prevState.currentPrice,
          leaderBidderId: patch.leaderBidderId || prevState.leaderBidderId,
          startTime: patch.startTime || prevState.startTime,
          endTime: patch.endTime || prevState.endTime,
          extendCount: patch.extendCount ?? prevState.extendCount,
          version: patch.version ?? prevState.version,
          lastBidTsMs: patch.lastBidTsMs ?? prevState.lastBidTsMs,
          source: patch.source || prevState.source,
        };
      });

      setAuction((prevAuction) =>
        prevAuction
          ? {
              ...prevAuction,
              status: patch.status || prevAuction.status,
              currentPrice: patch.currentPrice ?? prevAuction.currentPrice,
              leaderBidderId:
                patch.leaderBidderId || prevAuction.leaderBidderId,
              bidCount:
                patch.bidCount ??
                (patch.bidAcceptedDelta > 0
                  ? (prevAuction.bidCount || 0) + patch.bidAcceptedDelta
                  : prevAuction.bidCount),
              startTime: patch.startTime || prevAuction.startTime,
              endTime: patch.endTime || prevAuction.endTime,
              incrementRule: patch.incrementRule || prevAuction.incrementRule,
            }
          : prevAuction
      );
    }

    if (patch.antiSnipingTip) {
      setAntiSnipingTip(patch.antiSnipingTip);
    }

    if (patch.shouldRefreshRoom) {
      loadRoomAndAuction();
    }
  }

  function flushRealtimePatch() {
    clearRealtimeFlushTimer();
    const patch = realtimePatchRef.current;
    realtimePatchRef.current = createEmptyRealtimePatch();
    applyRealtimePatch(patch);
  }

  function queueRealtimePatch(patch: RealtimePatch) {
    absorbRealtimePatch(realtimePatchRef.current, patch);
    if (realtimeFlushTimerRef.current === undefined) {
      realtimeFlushTimerRef.current = window.setTimeout(
        flushRealtimePatch,
        REALTIME_FLUSH_INTERVAL_MS
      );
    }
  }

  function handleRoomMessage(message: LiveSessionEnvelope) {
    if (message.type.startsWith('ai.assistant')) {
      const nextEvent = normalizeAssistantEvent(message);
      setAssistantOpen(true);
      setAssistantEvents((prevEvents) =>
        [
          nextEvent,
          ...prevEvents.filter(
            (item) =>
              item.eventId !== nextEvent.eventId ||
              item.status !== nextEvent.status
          ),
        ].slice(0, 30)
      );
      if (shouldRefreshAfterAssistantEvent(nextEvent)) {
        refreshAll();
      }
      return;
    }
    if (message.type === 'live.voice_broadcast') {
      const payload = getPayload(message);
      const text = getStringValue(payload, ['text']);
      if (text) {
        const voiceEvent: AIAssistantEventPayload = {
          eventId: `voice-${message.requestId || message.seq || Date.now()}`,
          kind: 'broadcast',
          status: 'completed',
          requestId: message.requestId,
          liveSessionId: message.liveSessionId,
          message: 'AI 直播播报已推送',
          broadcastText: text,
          createdAt: new Date().toISOString(),
        };
        setAssistantEvents((prevEvents) =>
          [voiceEvent, ...prevEvents].slice(0, 30)
        );
      }
    }
    if (isBusinessEvent(message) && !QUIET_EVENT_LOG_TYPES.has(message.type)) {
      appendEventLog(message);
    }

    const patch = buildRealtimePatch(message);
    if (HIGH_FREQUENCY_MESSAGE_TYPES.has(message.type)) {
      queueRealtimePatch(patch);
      return;
    }
    applyRealtimePatch(patch);
  }

  useEffect(() => {
    setRanking([]);
    setEventLogs([]);
    setAntiSnipingTip('');
    clearRealtimeFlushTimer();
    realtimePatchRef.current = createEmptyRealtimePatch();
    serverTimeOffsetRef.current = 0;
    setLiveMetrics({
      viewerCount: 0,
      bidCount: 0,
      followerCount: 0,
      orderCount: 0,
    });
    loadRoomAndAuction();
    loadLiveStats();
    loadAssistantPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now() + serverTimeOffsetRef.current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (startMode !== 'scheduled' || !scheduledStartTime) {
      return;
    }
    const scheduledDate = parseTodayStartTime(scheduledStartTime);
    if (!scheduledDate || scheduledDate.getTime() <= now) {
      setScheduledStartTime(nextSelectableTodayTime(now));
    }
  }, [now, scheduledStartTime, startMode]);

  useEffect(
    () => () => {
      clearRealtimeFlushTimer();
      realtimePatchRef.current = createEmptyRealtimePatch();
    },
    []
  );

  useEffect(() => {
    if (!roomId || !roomIsLive) {
      return undefined;
    }
    loadLiveStats();
    const timer = window.setInterval(() => {
      loadLiveStats();
    }, LIVE_STATS_FALLBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomIsLive, activeAuctionId]);

  useEffect(() => {
    if (!roomId || !roomIsLive || !scheduledLot?.startTime) {
      return undefined;
    }
    const scheduledStartMs = normalizeTimestampMs(scheduledLot.startTime);
    if (scheduledStartMs === undefined) {
      return undefined;
    }

    let refreshInterval: number | undefined;
    const refreshScheduledAuction = () => {
      refreshAll();
    };
    const refreshDelay = Math.max(
      0,
      scheduledStartMs - Date.now() + SCHEDULED_AUCTION_REFRESH_OFFSET_MS
    );
    const refreshTimer = window.setTimeout(() => {
      refreshScheduledAuction();
      refreshInterval = window.setInterval(
        refreshScheduledAuction,
        SCHEDULED_AUCTION_REFRESH_INTERVAL_MS
      );
    }, refreshDelay);

    return () => {
      window.clearTimeout(refreshTimer);
      if (refreshInterval !== undefined) {
        window.clearInterval(refreshInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomIsLive, scheduledLot?.auctionId, scheduledLot?.startTime]);

  useEffect(() => {
    roomClientRef.current?.disconnect();

    if (!roomId || !roomIsLive) {
      setConnectionStatus('idle');
      return undefined;
    }

    const client = new LiveSessionClient({
      liveSessionId: roomId,
      onStatusChange: setConnectionStatus,
      onMessage: handleRoomMessage,
      onError: (message) => {
        Message.warning(message);
      },
      onReconnect: () => {
        loadRoomAndAuction();
      },
    });
    roomClientRef.current = client;
    client.connect();

    return () => {
      clearRealtimeFlushTimer();
      realtimePatchRef.current = createEmptyRealtimePatch();
      client.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomIsLive, activeAuctionId]);

  async function handleAssistantPermissionChange(
    permission: AIAssistantPermission
  ) {
    setAssistantPermissionLoading(true);
    try {
      const result = await updateAIAssistantPermission(
        permission,
        buildIdempotencyKey('ai-permission', `${roomId}-${permission}`)
      );
      setAssistantPermission(result.permission || permission);
      Message.success('AI权限已更新');
    } finally {
      setAssistantPermissionLoading(false);
    }
  }

  async function handleAssistantDecision(requestId: string, approved: boolean) {
    setAssistantDecisionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await decideAIAssistantApproval(
        requestId,
        approved,
        buildIdempotencyKey('ai-approval', `${requestId}-${approved}`)
      );
      setAssistantEvents((prevEvents) =>
        prevEvents.map((event) =>
          event.requestId === requestId && event.kind === 'permission'
            ? {
                ...event,
                status: approved ? 'approved' : 'rejected',
                message: approved ? '已允许 AI 执行' : '已拒绝 AI 执行',
              }
            : event
        )
      );
    } catch (error) {
      const apiError = error as { code?: number; message?: string };
      if (apiError.code === 20004 || apiError.code === 20010) {
        setAssistantEvents((prevEvents) =>
          prevEvents.map((event) =>
            event.requestId === requestId && event.kind === 'permission'
              ? {
                  ...event,
                  status: 'timeout',
                  message: 'AI 控制请求已自动处理，请查看执行结果',
                }
              : event
          )
        );
        Message.info('AI 控制请求已自动处理，请查看执行结果');
        return;
      }
      Message.error(apiError.message || 'AI 控制确认失败');
    } finally {
      setAssistantDecisionLoading((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    }
  }

  function openActionModal(type: ActionType) {
    setActionType(type);
    setActionReason('');
  }

  function closeStartLotModal() {
    setStartLot(undefined);
    setStartMode('now');
    setScheduledStartTime('');
  }

  async function submitAction() {
    if (!auction || !actionType) {
      return;
    }
    const reason = actionReason.trim();
    if (!reason) {
      Message.warning('请填写操作原因');
      return;
    }
    setActionLoading(true);
    try {
      if (actionType === 'cancel') {
        const result = await cancelAuction(
          auction.auctionId,
          reason,
          buildIdempotencyKey('auction-cancel', auction.auctionId)
        );
        setAuction(result);
        Message.success('异常取消已提交');
      } else {
        const result = await hammerAuction(
          auction.auctionId,
          reason,
          buildIdempotencyKey('auction-hammer', auction.auctionId)
        );
        Message.success(
          result.order
            ? `落锤成功，订单 ${result.order.id} 已创建`
            : '落锤成功，暂无成交订单'
        );
      }
      setActionType(undefined);
      loadRoomAndAuction();
    } catch (error) {
      if (error instanceof Error) {
        Message.error(error.message);
      }
    } finally {
      setActionLoading(false);
    }
  }

  function handleStartLot(lot: AuctionLot) {
    if (!room || !roomId) return;
    if (!roomIsLive) {
      Message.warning('请先开播，再开拍拍品。');
      return;
    }
    if (activeAuctionId !== 0) {
      Message.warning('请先取消当前讲解。');
      return;
    }
    if (hasScheduledLot) {
      Message.warning('已有预约开拍的拍品，请先处理预约拍品。');
      return;
    }
    setDurationMinutes(DEFAULT_AUCTION_DURATION_MINUTES);
    setStartMode('now');
    setScheduledStartTime('');
    setStartLot(lot);
  }

  function handlePrimaryStartAction() {
    if (!roomIsLive) {
      Message.warning('请先开播，再开拍拍品。');
      return;
    }
    if (activeAuctionId !== 0) {
      Message.warning('请先取消当前讲解。');
      return;
    }
    if (hasScheduledLot) {
      Message.warning('已有预约开拍的拍品，请先处理预约拍品。');
      return;
    }
    if (startableLots.length === 1) {
      handleStartLot(startableLots[0]);
      return;
    }
    lotPanelRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  async function submitStartLot() {
    if (!roomId || !startLot) return;
    setActingAuctionId(startLot.auctionId);
    try {
      const nextDurationMinutes =
        normalizeAuctionDurationMinutes(durationMinutes);
      const timing = buildAuctionTiming(nextDurationMinutes);
      let startTime: string | undefined;
      if (startMode === 'scheduled') {
        const scheduledDate = parseTodayStartTime(scheduledStartTime);
        if (!scheduledDate) {
          Message.warning('请选择有效的开拍时间');
          return;
        }
        if (scheduledDate.getTime() <= Date.now()) {
          Message.warning('定时开拍时间必须晚于当前时间');
          return;
        }
        startTime = scheduledDate.toISOString();
      }
      const result = await activateLiveSessionAuction(
        roomId,
        {
          auctionId: startLot.auctionId,
          durationSec: timing.durationSec,
          startTime,
        },
        buildIdempotencyKey('live-session-activate', startLot.auctionId)
      );
      setAuction(result);
      setLots((prevLots) =>
        prevLots.map((lot) =>
          Number(lot.auctionId) === Number(result.auctionId) ? result : lot
        )
      );
      Message.success(startTime ? '已预约开拍' : '已开拍');
      closeStartLotModal();
      await loadRoomAndAuction();
    } finally {
      setActingAuctionId(undefined);
    }
  }

  async function handleDetachLot(lot: AuctionLot) {
    if (!roomId) return;
    if (
      Number(lot.auctionId) === activeAuctionId ||
      isAuctionInProgress(lot.status)
    ) {
      Message.warning('请先取消讲解，再下架拍品。');
      return;
    }
    if (lot.status === 'WARMING_UP') {
      Message.warning('请先取消预约，再下架拍品。');
      return;
    }
    if (!canDetachAuctionFromLiveSession(lot.status)) {
      Message.warning('已成交拍品已计入本场直播交易，不能下架。');
      return;
    }
    setActingAuctionId(lot.auctionId);
    try {
      await detachAuctionFromLiveSession(
        roomId,
        lot.auctionId,
        buildIdempotencyKey('live-session-detach', `${roomId}-${lot.auctionId}`)
      );
      Message.success('已从直播间下架');
      await loadLots();
    } finally {
      setActingAuctionId(undefined);
    }
  }

  async function handleStopCurrentLot() {
    if (!roomId || (activeAuctionId === 0 && !scheduledLot)) return;
    const targetAuctionId = activeAuctionId || scheduledLot?.auctionId;
    setActingAuctionId(targetAuctionId);
    try {
      const result = await deactivateLiveSessionAuction(
        roomId,
        buildIdempotencyKey('live-session-deactivate', roomId)
      );
      setRoom(result);
      setAuction(undefined);
      setAuctionState(undefined);
      Message.success(
        activeAuctionId === 0
          ? '已取消预约，可重新开拍或下架'
          : '已取消讲解，可重新开拍或下架'
      );
      await loadRoomAndAuction();
    } finally {
      setActingAuctionId(undefined);
    }
  }

  async function handleAgentHookChange(enabled: boolean) {
    if (!roomId || !roomIsLive) {
      Message.warning('开播后才能设置 AI 托管');
      return;
    }
    setAgentHookUpdating(true);
    try {
      const config = await updateLiveSessionAgentHookConfig(
        roomId,
        { enabled },
        buildIdempotencyKey('live-agent-hook', `${roomId}-${enabled}`)
      );
      setAgentHookEnabled(!!config.enabled);
      if (config.enabled) {
        setAssistantOpen(true);
      }
      await loadRoomAndAuction();
      Message.success(config.enabled ? 'AI托管已开启' : 'AI托管已关闭');
    } finally {
      setAgentHookUpdating(false);
    }
  }

  if (!roomId) {
    history.replace('/live-sessions');
    return null;
  }

  const eventColumns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '事件',
      dataIndex: 'type',
      width: 160,
      render: (value: string) => renderEventTypeTag(value),
    },
    { title: '摘要', dataIndex: 'content' },
  ];

  const activeStatus = auctionState?.status || auction?.status;
  const activeLotTitle = auction?.title || '当前没有开拍拍品';
  const scheduledLotTitle = scheduledLot?.title || '预约拍品';
  const activeLotSubtitle = auction
    ? `当前拍品：${auction.title || '未命名拍品'}`
    : '可从下方拍品管理中选择拍品开拍';

  const rankingPanel = (
    <Card
      className={styles.controlSideCard}
      loading={loading}
      title={
        <Space size={8}>
          <IconOrderedList />
          <span>出价榜</span>
        </Space>
      }
    >
      {ranking.length > 0 ? (
        <div className={styles.bidRankList}>
          {ranking.map((item, index) => (
            <div className={styles.bidRankItem} key={item.bidderId}>
              <div className={styles.bidRankIndex}>{index + 1}</div>
              <div className={styles.bidRankUser}>
                <strong>{item.bidderName}</strong>
                <span>{item.bidCount || 1} 次出价</span>
              </div>
              <div className={styles.bidRankPrice}>
                {formatMoneyCent(item.price)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.controlEmpty}>等待出价更新</div>
      )}
    </Card>
  );

  const statusPanel = (
    <Card className={styles.controlSideCard} loading={loading} title="拍品状态">
      <Descriptions
        column={1}
        data={[
          { label: '当前拍品', value: auction ? '已开拍' : '-' },
          {
            label: '业务状态',
            value: activeStatus ? renderAuctionStatusTag(activeStatus) : '-',
          },
          {
            label: '开始时间',
            value: formatDateTime(
              auctionState?.startTime || auction?.startTime
            ),
          },
          { label: '结束时间', value: formatDateTime(endTime) },
          {
            label: '延长次数',
            value: auctionState?.extendCount ?? '-',
          },
        ]}
      />
    </Card>
  );

  const assistantPanel = roomIsLive ? (
    <div
      className={[
        styles.aiAssistantPanel,
        assistantOpen ? styles.aiAssistantPanelOpen : '',
      ].join(' ')}
    >
      {assistantOpen ? (
        <>
          <div className={styles.aiAssistantHeader}>
            <div>
              <div className={styles.aiAssistantTitle}>AI直播助手</div>
              <div className={styles.aiAssistantSubtitle}>
                {sanitizeAssistantDisplayText(latestAssistantEvent?.message) ||
                  '等待 AI 调用直播工具'}
              </div>
            </div>
            <Space size={8}>
              <Tag color={agentHookEnabled ? 'green' : 'gray'}>
                {agentHookEnabled ? '已托管' : '未托管'}
              </Tag>
              <Button size="mini" onClick={() => setAssistantOpen(false)}>
                收起
              </Button>
            </Space>
          </div>
          <div className={styles.aiAssistantPermissionBar}>
            <span>控制权限</span>
            <Select
              size="small"
              value={assistantPermission}
              loading={assistantPermissionLoading}
              disabled={assistantPermissionLoading}
              options={AI_PERMISSION_OPTIONS}
              triggerProps={{
                style: { zIndex: 1301 },
              }}
              onChange={(value) =>
                handleAssistantPermissionChange(value as AIAssistantPermission)
              }
            />
          </div>
          {pendingAssistantApprovals.length > 0 ? (
            <div className={styles.aiAssistantApprovalList}>
              {pendingAssistantApprovals.map((event) => {
                const requestId = String(event.requestId);
                const deciding = !!assistantDecisionLoading[requestId];
                const remainSeconds = assistantApprovalRemainSeconds(
                  event,
                  now
                );
                return (
                  <div className={styles.aiAssistantApproval} key={requestId}>
                    <div className={styles.aiAssistantApprovalText}>
                      {sanitizeAssistantDisplayText(event.message) ||
                        'AI 请求执行直播控制操作'}
                    </div>
                    <div className={styles.aiAssistantApprovalMeta}>
                      {remainSeconds === undefined
                        ? '等待商家确认，超时将自动允许'
                        : `剩余 ${remainSeconds} 秒，超时自动允许`}
                    </div>
                    <Space size={8}>
                      <Button
                        size="small"
                        type="primary"
                        loading={deciding}
                        onClick={() => handleAssistantDecision(requestId, true)}
                      >
                        允许
                      </Button>
                      <Button
                        size="small"
                        status="danger"
                        loading={deciding}
                        onClick={() =>
                          handleAssistantDecision(requestId, false)
                        }
                      >
                        拒绝
                      </Button>
                    </Space>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className={styles.aiAssistantTimeline}>
            {assistantEvents.length > 0 ? (
              assistantEvents.slice(0, 8).map((event) => (
                <div
                  className={styles.aiAssistantTimelineItem}
                  key={`${event.eventId}-${event.status}`}
                >
                  <span
                    className={[
                      styles.aiAssistantDot,
                      assistantDotClass(event.status),
                    ].join(' ')}
                  />
                  <div>
                    <div className={styles.aiAssistantTimelineText}>
                      {sanitizeAssistantDisplayText(
                        event.broadcastText || event.message
                      )}
                    </div>
                    <div className={styles.aiAssistantTimelineMeta}>
                      {event.toolName || 'AI助手'} ·{' '}
                      {formatDateTime(event.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.aiAssistantEmpty}>暂无 AI 调用记录</div>
            )}
          </div>
        </>
      ) : (
        <Button
          type="primary"
          icon={<IconThunderbolt />}
          onClick={() => setAssistantOpen(true)}
        >
          AI助手
        </Button>
      )}
    </div>
  ) : null;

  const primaryActionPanel = (
    <section className={styles.controlCommandBar}>
      <div className={styles.controlCommandInfo}>
        <div className={styles.controlCommandEyebrow}>关键操作</div>
        <div className={styles.controlCommandTitle}>
          {activeAuctionId === 0
            ? hasScheduledLot
              ? '已有预约开拍'
              : '选择拍品开拍'
            : '正在控场讲解'}
        </div>
        <div className={styles.controlCommandHint}>
          {activeAuctionId === 0 && hasScheduledLot
            ? `${scheduledLotTitle} 已预约开拍，到点后会自动进入竞拍。`
            : activeAuctionId === 0
            ? '没有正在拍卖的拍品，可从直播拍品中选择一件开始。'
            : '当前拍品正在竞拍，可取消讲解、手工落锤或异常取消。'}
        </div>
      </div>
      <div className={styles.controlCommandActions}>
        <Button
          type={activeAuctionId === 0 ? 'primary' : 'secondary'}
          icon={<IconPlayArrow />}
          disabled={
            !roomIsLive ||
            activeAuctionId !== 0 ||
            hasScheduledLot ||
            startableLots.length === 0
          }
          onClick={handlePrimaryStartAction}
        >
          选择开拍
        </Button>
        <Button
          status="warning"
          icon={<IconPauseCircle />}
          disabled={activeAuctionId === 0 && !hasScheduledLot}
          loading={
            actingAuctionId === (activeAuctionId || scheduledLot?.auctionId)
          }
          onClick={handleStopCurrentLot}
        >
          {activeAuctionId === 0 && hasScheduledLot ? '取消预约' : '取消讲解'}
        </Button>
        <Button
          status="warning"
          icon={<IconExclamationCircle />}
          disabled={!canCancel}
          onClick={() => openActionModal('cancel')}
        >
          异常取消
        </Button>
        <Button
          type={canHammer ? 'primary' : 'secondary'}
          status="danger"
          icon={<IconThunderbolt />}
          disabled={!canHammer}
          onClick={() => openActionModal('hammer')}
        >
          手工落锤
        </Button>
        <Button
          icon={<IconPlus />}
          onClick={() => history.push(`/live-sessions/${roomId}/workbench`)}
        >
          上架拍品
        </Button>
        <Button icon={<IconRefresh />} onClick={refreshAll} loading={loading}>
          刷新
        </Button>
      </div>
    </section>
  );

  const lotPanel = (
    <Card
      title="直播拍品管理"
      extra={
        <Space>
          <Button onClick={loadLots} loading={lotLoading}>
            刷新拍品
          </Button>
          <Button
            onClick={() => history.push(`/live-sessions/${roomId}/workbench`)}
          >
            上架拍品
          </Button>
        </Space>
      }
    >
      {lotLoading ? (
        <AppState
          status="empty"
          title="加载中"
          subtitle="正在刷新直播拍品..."
        />
      ) : lots.length === 0 ? (
        <AppState
          status="empty"
          title="暂无直播拍品"
          subtitle="返回工作台选择待上架拍品，开播后可在控场页管理开拍。"
          actionText="返回工作台"
          onAction={() => history.push(`/live-sessions/${roomId}/workbench`)}
        />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {lots.map((lot, index) => {
            const isActive =
              (Number(lot.auctionId) === activeAuctionId &&
                activeAuctionId !== 0) ||
              isAuctionInProgress(lot.status);
            const disableStart =
              !roomIsLive ||
              activeAuctionId !== 0 ||
              hasScheduledLot ||
              isActive ||
              lot.status === 'WARMING_UP';
            const disableDetach =
              isActive ||
              lot.status === 'WARMING_UP' ||
              isAuctionSuccessful(lot.status) ||
              actingAuctionId === lot.auctionId;
            return (
              <AuctionLotCard
                key={lot.auctionId}
                index={index}
                lot={lot}
                isLive={roomIsLive}
                isActive={isActive}
                disableStart={disableStart}
                disableStartReason={
                  !roomIsLive
                    ? '开播后才能开拍'
                    : activeAuctionId !== 0
                    ? '请先取消当前讲解'
                    : hasScheduledLot
                    ? '已有预约开拍的拍品'
                    : undefined
                }
                disableDetach={disableDetach}
                disableDetachReason={
                  isAuctionSuccessful(lot.status)
                    ? '已成交拍品不能下架'
                    : lot.status === 'WARMING_UP'
                    ? '请先取消预约'
                    : isActive
                    ? '请先取消讲解'
                    : undefined
                }
                onStart={() => handleStartLot(lot)}
                onCancelExplain={handleStopCurrentLot}
                onDetach={() => handleDetachLot(lot)}
                onProduct={() => history.push(`/auctions/${lot.auctionId}`)}
                onMore={() => history.push(`/auctions/${lot.auctionId}`)}
              />
            );
          })}
        </Space>
      )}
    </Card>
  );

  return (
    <AppPage
      title={room ? `${room.title} - 控场` : '直播间控场'}
      extra={
        <Space>
          {room?.status === 'LIVE' ? (
            <Space size={8} className={styles.agentHookControl}>
              <Typography.Text type="secondary">AI托管</Typography.Text>
              <Switch
                type="round"
                checked={agentHookEnabled}
                loading={agentHookLoading || agentHookUpdating}
                disabled={agentHookLoading || agentHookUpdating}
                checkedText="开"
                uncheckedText="关"
                onChange={handleAgentHookChange}
              />
            </Space>
          ) : null}
          {room?.status === 'LIVE' ? (
            <Button
              type={assistantOpen ? 'primary' : 'secondary'}
              icon={<IconThunderbolt />}
              onClick={() => setAssistantOpen((open) => !open)}
            >
              AI助手
            </Button>
          ) : null}
          <Button
            onClick={() => history.push(`/live-sessions/${roomId}/workbench`)}
          >
            返回工作台
          </Button>
        </Space>
      }
    >
      {loadError ? (
        <Card>
          <AppState
            status="500"
            title="加载失败"
            subtitle={loadError}
            actionText="重新加载"
            onAction={loadRoomAndAuction}
          />
        </Card>
      ) : room && room.status !== 'LIVE' ? (
        <Card>
          <AppState
            status="empty"
            title="未开播"
            subtitle="直播间开播后才能进入控场。请先返回工作台开播。"
            actionText="返回工作台"
            onAction={() => history.push(`/live-sessions/${roomId}/workbench`)}
          />
        </Card>
      ) : (
        <div className={styles.controlPage}>
          {antiSnipingTip ? (
            <Alert type="warning" content={antiSnipingTip} />
          ) : null}
          {activeAuctionId === 0 ? (
            <Alert
              type="info"
              content="当前没有开拍拍品，可在下方拍品管理中选择直播拍品开拍。"
            />
          ) : null}
          {primaryActionPanel}
          <div className={styles.controlLayout}>
            <main className={styles.controlMain}>
              <section className={styles.controlOverview}>
                <div className={styles.controlOverviewMain}>
                  <div className={styles.controlOverviewStatus}>
                    <IconLiveBroadcast />
                    <span>{activeAuctionId === 0 ? '待开拍' : '竞拍中'}</span>
                    <Tag color={connectionMeta.color}>
                      {connectionMeta.label}
                    </Tag>
                  </div>
                  <Typography.Title
                    heading={3}
                    className={styles.controlOverviewTitle}
                  >
                    {activeLotTitle}
                  </Typography.Title>
                  <Typography.Text type="secondary">
                    {activeLotSubtitle}
                  </Typography.Text>
                </div>
                <div className={styles.controlTimerPanel}>
                  <div className={styles.controlTimerLabel}>
                    <IconClockCircle />
                    剩余时间
                  </div>
                  <div className={styles.controlTimerValue}>
                    {remainingText}
                  </div>
                </div>
              </section>

              <div className={styles.controlCoreGrid}>
                <div className={styles.controlCoreItem}>
                  <span>当前价</span>
                  <strong>{formatMoneyCent(currentPrice)}</strong>
                </div>
                <div className={styles.controlCoreItem}>
                  <span>领先用户</span>
                  <strong>{leaderBidderName}</strong>
                </div>
                <div className={styles.controlCoreItem}>
                  <span>出价次数</span>
                  <strong>{metricValues.bids}</strong>
                </div>
              </div>

              <div className={styles.metricGrid}>
                {LIVE_METRIC_CARDS.map((item) => (
                  <div
                    className={[styles.metricCard, item.className].join(' ')}
                    key={item.key}
                  >
                    <div className={styles.metricCardHeader}>
                      <span className={styles.metricLabel}>{item.label}</span>
                      <span className={styles.metricIcon}>{item.icon}</span>
                    </div>
                    <div className={styles.metricValue}>
                      {metricValues[item.key]}
                    </div>
                    <div className={styles.metricHint}>{item.hint}</div>
                  </div>
                ))}
              </div>

              <div ref={lotPanelRef}>{lotPanel}</div>

              <Card title="竞拍动态">
                <Table
                  rowKey="id"
                  columns={eventColumns}
                  data={eventLogs}
                  pagination={false}
                  noDataElement="等待竞拍动态"
                />
              </Card>
            </main>
            <aside className={styles.controlSidebar}>
              {rankingPanel}
              {statusPanel}
            </aside>
          </div>
        </div>
      )}

      <Modal
        title={actionType === 'cancel' ? '异常取消' : '手工落锤'}
        visible={!!actionType}
        confirmLoading={actionLoading}
        okText="确认提交"
        cancelText="取消"
        onOk={submitAction}
        onCancel={() => setActionType(undefined)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>
            {actionType === 'cancel'
              ? '请填写异常取消原因，提交后会刷新拍品状态。'
              : '请填写手工落锤原因，提交后会展示成交结果或失败提示。'}
          </Typography.Text>
          <TextArea
            value={actionReason}
            placeholder="请输入操作原因"
            maxLength={200}
            showWordLimit
            autoSize={{ minRows: 3, maxRows: 5 }}
            onChange={setActionReason}
          />
        </Space>
      </Modal>
      <Modal
        title="选择开拍方式"
        visible={!!startLot}
        style={{ width: 560, maxWidth: 'calc(100vw - 32px)' }}
        confirmLoading={actingAuctionId === startLot?.auctionId}
        okText={startMode === 'scheduled' ? '确认预约' : '确认开拍'}
        cancelText="取消"
        onOk={submitStartLot}
        onCancel={closeStartLotModal}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div className={styles.startModeRow}>
            <Typography.Text className={styles.durationCustomTitle}>
              开拍方式
            </Typography.Text>
            <div
              className={styles.startModeSegment}
              role="radiogroup"
              aria-label="开拍方式"
            >
              <button
                type="button"
                role="radio"
                aria-checked={startMode === 'now'}
                className={[
                  styles.startModeOption,
                  startMode === 'now' ? styles.startModeOptionActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setStartMode('now')}
              >
                <IconPlayArrow />
                <span>立即开拍</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={startMode === 'scheduled'}
                className={[
                  styles.startModeOption,
                  startMode === 'scheduled' ? styles.startModeOptionActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setStartMode('scheduled');
                  setScheduledStartTime(
                    (current) => current || nextSelectableTodayTime(now)
                  );
                }}
              >
                <IconClockCircle />
                <span>定时开拍</span>
              </button>
            </div>
          </div>
          {startMode === 'scheduled' ? (
            <div className={styles.startSchedulePanel}>
              <Typography.Text className={styles.durationCustomTitle}>
                开拍时间
              </Typography.Text>
              <div className={styles.startTimePickerWrap}>
                <span className={styles.startTimeTodayBadge}>今天</span>
                <TimePicker
                  format={START_TIME_FORMAT}
                  value={scheduledStartTime || undefined}
                  placeholder="选择时间"
                  size="large"
                  disabled={!hasSelectableScheduledTime}
                  disableConfirm
                  editable={false}
                  hideDisabledOptions
                  disabledHours={() => disabledScheduledHours}
                  disabledMinutes={disabledScheduledMinutes}
                  showNowBtn={false}
                  prefix={<IconClockCircle />}
                  style={{ width: '100%' }}
                  onChange={(timeString) =>
                    setScheduledStartTime(timeString || '')
                  }
                />
              </div>
              <Typography.Text
                type={hasSelectableScheduledTime ? 'secondary' : 'error'}
                className={styles.startTimeHint}
              >
                {hasSelectableScheduledTime
                  ? '只能选择当前时间之后的时间'
                  : '今天已没有可预约时间'}
              </Typography.Text>
            </div>
          ) : null}
          <AuctionDurationPicker
            value={durationMinutes}
            onChange={setDurationMinutes}
          />
        </Space>
      </Modal>
      {assistantPanel}
    </AppPage>
  );
}
