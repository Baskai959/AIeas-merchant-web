import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Grid,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import AuctionLotCard from '@/components/AuctionLotCard';
import LiveRoomClient, {
  LiveRoomConnectionStatus,
  LiveRoomEnvelope,
} from '@/services/live-room-client';
import {
  AuctionLot,
  AuctionState,
  cancelAuction,
  fetchAuction,
  fetchAuctionState,
  hammerAuction,
  updateAuction,
} from '@/services/auctions';
import { fetchItem, Item } from '@/services/items';
import {
  activateLiveRoomAuction,
  deactivateLiveRoomAuction,
  detachAuctionFromLiveRoom,
  fetchLiveRoomAgentHookConfig,
  fetchLiveRoom,
  listLiveRoomLots,
  LiveRoom,
  updateLiveRoomAgentHookConfig,
} from '@/services/liveRoom';
import {
  buildIdempotencyKey,
  canDetachAuctionFromLiveRoom,
  formatDateTime,
  formatMoneyCent,
  isAuctionSuccessful,
  renderAuctionStatusTag,
} from '@/modules/auctions/utils';
import {
  AUCTION_DURATION_OPTIONS,
  DEFAULT_AUCTION_DURATION_MINUTES,
  buildAuctionTiming,
  isAuctionInProgress,
} from './constants';
import styles from '../management.module.less';

const Row = Grid.Row;
const Col = Grid.Col;
const TextArea = Input.TextArea;

interface RankingItem {
  bidderId: string;
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

const CONNECTION_STATUS_META: Record<
  LiveRoomConnectionStatus,
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
  'auction.started': '开拍',
  'bid.accepted': '出价',
  'ranking.updated': '榜单更新',
  'timer.tick': '倒计时',
  'timer.extended': '延时',
  'auction.closed': '结拍',
  'order.created': '订单',
  error: '异常',
};

const LIVE_METRIC_CARDS = [
  {
    key: 'viewers',
    label: '在线人数',
    color: '#165DFF',
    background: 'linear-gradient(135deg, #E8F3FF 0%, #FFFFFF 72%)',
  },
  {
    key: 'bids',
    label: '出价次数',
    color: '#F53F3F',
    background: 'linear-gradient(135deg, #FFECE8 0%, #FFFFFF 72%)',
  },
  {
    key: 'likes',
    label: '互动热度',
    color: '#00B42A',
    background: 'linear-gradient(135deg, #E8FFEA 0%, #FFFFFF 72%)',
  },
  {
    key: 'orders',
    label: '成交订单',
    color: '#FF7D00',
    background: 'linear-gradient(135deg, #FFF7E8 0%, #FFFFFF 72%)',
  },
];

function renderEventTypeTag(type: string) {
  return <Tag>{EVENT_TYPE_LABEL_MAP[type] || '通知'}</Tag>;
}

function getPayload(message: LiveRoomEnvelope) {
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

function getDateValue(payload: Record<string, any>, keys: string[]) {
  return getStringValue(payload, keys);
}

function buildEventContent(message: LiveRoomEnvelope) {
  const payload = getPayload(message);
  switch (message.type) {
    case 'auction.started':
      return `拍品已开拍，状态 ${getStringValue(payload, ['status']) || '-'}`;
    case 'bid.accepted':
      return `用户 ${
        getStringValue(payload, ['bidderId', 'userId']) || '-'
      } 出价 ${formatMoneyCent(
        getNumberValue(payload, ['price', 'amount', 'currentPrice'])
      )}`;
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
    case 'error':
      return (
        getStringValue(payload, ['message', 'error']) || '实时连接返回错误'
      );
    default:
      return message.type;
  }
}

function formatRemaining(ms: number) {
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

export default function LiveRoomControlPage() {
  const history = useHistory();
  const { id: roomId } = useParams() as { id?: string };
  const roomClientRef = useRef<LiveRoomClient>();

  const [room, setRoom] = useState<LiveRoom>();
  const [auction, setAuction] = useState<AuctionLot>();
  const [auctionState, setAuctionState] = useState<AuctionState>();
  const [lots, setLots] = useState<AuctionLot[]>([]);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLogItem[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<LiveRoomConnectionStatus>('idle');
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
  const [liveMetrics, setLiveMetrics] = useState({
    viewerCount: 0,
    bidCount: 0,
    likeCount: 0,
    orderCount: 0,
  });
  const [agentHookEnabled, setAgentHookEnabled] = useState(false);
  const [agentHookLoading, setAgentHookLoading] = useState(false);
  const [agentHookUpdating, setAgentHookUpdating] = useState(false);

  const fallbackActiveAuctionId = Number(
    lots.find((lot) => isAuctionInProgress(lot.status))?.auctionId || 0
  );
  const activeAuctionId = Number(
    room?.activeAuctionId || fallbackActiveAuctionId
  );
  const roomIsLive = room?.status === 'LIVE';
  const connectionMeta = CONNECTION_STATUS_META[connectionStatus];
  const currentPrice = auctionState?.currentPrice ?? auction?.startPrice;
  const leaderBidderId =
    auctionState?.leaderBidderId || auction?.winnerId || '-';
  const endTime = auctionState?.endTime || auction?.endTime;
  const remainingText = useMemo(() => {
    if (!endTime) {
      return '--:--:--';
    }
    return formatRemaining(new Date(endTime).getTime() - now);
  }, [endTime, now]);

  const canCancel =
    !!auctionState &&
    !['CLOSED_WON', 'CLOSED_FAILED', 'SETTLED'].includes(auctionState.status);
  const canHammer =
    !!auctionState &&
    ['RUNNING', 'EXTENDED', 'HAMMER_PENDING'].includes(auctionState.status);
  const metricValues: Record<string, string | number> = {
    viewers: liveMetrics.viewerCount,
    bids: liveMetrics.bidCount || auction?.bidCount || ranking.length,
    likes: liveMetrics.likeCount,
    orders: liveMetrics.orderCount,
  };

  async function loadRoomAndAuction() {
    if (!roomId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [liveRoom, lotResult] = await Promise.all([
        fetchLiveRoom(roomId),
        listLiveRoomLots(roomId).catch(() => ({ lots: [] })),
      ]);
      setRoom(liveRoom);
      setLots(lotResult.lots || []);
      if (liveRoom.status === 'LIVE') {
        loadAgentHookConfig(liveRoom.id);
      } else {
        setAgentHookEnabled(false);
        setAgentHookLoading(false);
      }
      const activeId = Number(liveRoom.activeAuctionId || 0);
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
      const config = await fetchLiveRoomAgentHookConfig(currentRoomId);
      setAgentHookEnabled(!!config.enabled);
    } catch (error) {
      setAgentHookEnabled(false);
    } finally {
      setAgentHookLoading(false);
    }
  }

  async function loadLots() {
    if (!roomId) return;
    setLotLoading(true);
    try {
      const result = await listLiveRoomLots(roomId);
      setLots(result.lots || []);
    } finally {
      setLotLoading(false);
    }
  }

  function appendEventLog(message: LiveRoomEnvelope) {
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

  function mergeStateFromMessage(message: LiveRoomEnvelope) {
    const payload = getPayload(message);
    const nextViewerCount = getNumberValue(payload, [
      'viewerCount',
      'onlineCount',
      'audienceCount',
      'roomUserCount',
    ]);
    const nextLikeCount = getNumberValue(payload, [
      'likeCount',
      'likes',
      'interactionCount',
    ]);
    const nextBidCount = getNumberValue(payload, ['bidCount', 'bids']);
    const nextStatus = getStringValue(payload, ['status']) as
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
    const nextEndTime = getDateValue(payload, ['endTime', 'newEndTime']);
    const nextExtendCount = getNumberValue(payload, ['extendCount']);
    const nextVersion = getNumberValue(payload, ['version']);
    const nextLastBidTsMs = getNumberValue(payload, ['lastBidTsMs', 'bidTsMs']);

    setLiveMetrics((prevMetrics) => ({
      viewerCount: nextViewerCount ?? prevMetrics.viewerCount,
      bidCount:
        nextBidCount ??
        (message.type === 'bid.accepted'
          ? prevMetrics.bidCount + 1
          : prevMetrics.bidCount),
      likeCount: nextLikeCount ?? prevMetrics.likeCount,
      orderCount:
        message.type === 'order.created'
          ? prevMetrics.orderCount + 1
          : prevMetrics.orderCount,
    }));

    if (message.type === 'ranking.updated') {
      const nextRanking =
        payload.ranking || payload.rankings || payload.list || payload.items;
      if (Array.isArray(nextRanking)) {
        setRanking(
          nextRanking
            .map((item) => ({
              bidderId: String(item.bidderId || item.userId || item.id || '-'),
              price: Number(
                item.price || item.amount || item.currentPrice || 0
              ),
              bidCount: Number(item.bidCount || item.count || 0) || undefined,
              updatedAt: item.updatedAt || item.createdAt,
            }))
            .filter((item) => item.bidderId !== '-' && item.price > 0)
        );
      }
    }

    if (message.type === 'bid.accepted') {
      const bidderId = nextLeader;
      const price = nextCurrentPrice;
      if (bidderId && price) {
        setRanking((prevRanking) => {
          const withoutCurrent = prevRanking.filter(
            (item) => item.bidderId !== bidderId
          );
          return [
            {
              bidderId,
              price,
              bidCount:
                (prevRanking.find((item) => item.bidderId === bidderId)
                  ?.bidCount || 0) + 1,
              updatedAt: new Date().toISOString(),
            },
            ...withoutCurrent,
          ]
            .sort((left, right) => right.price - left.price)
            .slice(0, 10);
        });
      }
    }

    setAuctionState((prevState) => {
      if (!prevState) {
        return prevState;
      }
      return {
        ...prevState,
        status: nextStatus || prevState.status,
        currentPrice: nextCurrentPrice ?? prevState.currentPrice,
        leaderBidderId: nextLeader || prevState.leaderBidderId,
        endTime: nextEndTime || prevState.endTime,
        extendCount: nextExtendCount ?? prevState.extendCount,
        version: nextVersion ?? prevState.version,
        lastBidTsMs: nextLastBidTsMs ?? prevState.lastBidTsMs,
      };
    });

    if (nextStatus) {
      setAuction((prevAuction) =>
        prevAuction
          ? {
              ...prevAuction,
              status: nextStatus,
              endTime: nextEndTime || prevAuction.endTime,
            }
          : prevAuction
      );
    }
  }

  function handleRoomMessage(message: LiveRoomEnvelope) {
    appendEventLog(message);
    mergeStateFromMessage(message);

    if (message.type === 'timer.extended') {
      const extendSec = getNumberValue(getPayload(message), [
        'extendSec',
        'extendedSec',
        'seconds',
      ]);
      setAntiSnipingTip(
        `防抢拍已触发${extendSec ? `，本轮延长 ${extendSec} 秒` : ''}`
      );
    }

    if (
      message.type === 'auction.started' ||
      message.type === 'auction.closed'
    ) {
      // 重新拉取直播间状态
      loadRoomAndAuction();
    }
  }

  useEffect(() => {
    setRanking([]);
    setEventLogs([]);
    setAntiSnipingTip('');
    setLiveMetrics({
      viewerCount: 0,
      bidCount: 0,
      likeCount: 0,
      orderCount: 0,
    });
    loadRoomAndAuction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    const idsToFetch = new Set<string | number>();
    lots.forEach((lot) => {
      const key = String(lot.itemId);
      if (!items[key]) {
        idsToFetch.add(lot.itemId);
      }
    });

    if (!idsToFetch.size) {
      return;
    }

    Promise.all(
      Array.from(idsToFetch).map((itemId) =>
        fetchItem(itemId).catch(() => undefined)
      )
    ).then((results) => {
      setItems((currentItems) => {
        const nextItems = { ...currentItems };
        results.forEach((item) => {
          if (item) {
            nextItems[String(item.id)] = item;
          }
        });
        return nextItems;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    roomClientRef.current?.disconnect();

    if (!roomId || !roomIsLive || activeAuctionId === 0) {
      setConnectionStatus('idle');
      return undefined;
    }

    const client = new LiveRoomClient({
      roomId,
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
      client.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomIsLive, activeAuctionId]);

  function openActionModal(type: ActionType) {
    setActionType(type);
    setActionReason('');
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
      Message.warning('请先开播，再开拍商品。');
      return;
    }
    if (activeAuctionId !== 0) {
      Message.warning('请先取消当前讲解。');
      return;
    }
    setDurationMinutes(DEFAULT_AUCTION_DURATION_MINUTES);
    setStartLot(lot);
  }

  async function submitStartLot() {
    if (!roomId || !startLot) return;
    setActingAuctionId(startLot.auctionId);
    try {
      const timing = buildAuctionTiming(durationMinutes);
      await updateAuction(startLot.auctionId, {
        startTime: timing.startTime,
        endTime: timing.endTime,
        status: 'READY',
      });
      const result = await activateLiveRoomAuction(
        roomId,
        {
          auctionId: startLot.auctionId,
          durationMinutes,
          durationSec: timing.durationSec,
        },
        buildIdempotencyKey('live-room-activate', startLot.auctionId)
      );
      setAuction(result);
      Message.success('已开拍');
      setStartLot(undefined);
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
    if (!canDetachAuctionFromLiveRoom(lot.status)) {
      Message.warning('已成交拍品已计入本场直播交易，不能下架。');
      return;
    }
    setActingAuctionId(lot.auctionId);
    try {
      await detachAuctionFromLiveRoom(
        roomId,
        lot.auctionId,
        buildIdempotencyKey('live-room-detach', `${roomId}-${lot.auctionId}`)
      );
      Message.success('已从直播间下架');
      await loadLots();
    } finally {
      setActingAuctionId(undefined);
    }
  }

  async function handleStopCurrentLot() {
    if (!roomId || activeAuctionId === 0) return;
    setActingAuctionId(activeAuctionId);
    try {
      const result = await deactivateLiveRoomAuction(
        roomId,
        buildIdempotencyKey('live-room-deactivate', roomId)
      );
      setRoom(result);
      setAuction(undefined);
      setAuctionState(undefined);
      Message.success('已取消讲解，可重新开拍或下架');
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
      const config = await updateLiveRoomAgentHookConfig(
        roomId,
        { enabled },
        buildIdempotencyKey('live-agent-hook', `${roomId}-${enabled}`)
      );
      setAgentHookEnabled(!!config.enabled);
      Message.success(config.enabled ? 'AI托管已开启' : 'AI托管已关闭');
    } finally {
      setAgentHookUpdating(false);
    }
  }

  if (!roomId) {
    history.replace('/live-rooms');
    return null;
  }

  const rankingColumns = [
    {
      title: '排名',
      dataIndex: 'rank',
      width: 80,
      render: (_: unknown, __: RankingItem, index: number) => index + 1,
    },
    { title: '用户', dataIndex: 'bidderId' },
    {
      title: '出价',
      dataIndex: 'price',
      render: (value: number) => formatMoneyCent(value),
    },
    {
      title: '次数',
      dataIndex: 'bidCount',
      render: (value?: number) => value || '-',
    },
  ];

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

  const lotPanel = (
    <Card
      title="直播拍品管理"
      extra={
        <Space>
          {activeAuctionId !== 0 ? (
            <Button
              status="warning"
              loading={actingAuctionId === activeAuctionId}
              onClick={handleStopCurrentLot}
            >
              取消讲解
            </Button>
          ) : null}
          <Button onClick={loadLots} loading={lotLoading}>
            刷新商品
          </Button>
          <Button
            onClick={() => history.push(`/live-rooms/${roomId}/workbench`)}
          >
            上架商品
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
          onAction={() => history.push(`/live-rooms/${roomId}/workbench`)}
        />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {lots.map((lot, index) => {
            const isActive =
              (Number(lot.auctionId) === activeAuctionId &&
                activeAuctionId !== 0) ||
              isAuctionInProgress(lot.status);
            const item = items[String(lot.itemId)];
            const disableStart =
              !roomIsLive || activeAuctionId !== 0 || isActive;
            const disableDetach =
              isActive ||
              isAuctionSuccessful(lot.status) ||
              actingAuctionId === lot.auctionId;
            return (
              <AuctionLotCard
                key={lot.auctionId}
                index={index}
                lot={lot}
                item={item}
                itemTitle={item?.title}
                isLive={roomIsLive}
                isActive={isActive}
                disableStart={disableStart}
                disableStartReason={
                  !roomIsLive
                    ? '开播后才能开拍'
                    : activeAuctionId !== 0
                    ? '请先取消当前讲解'
                    : undefined
                }
                disableDetach={disableDetach}
                disableDetachReason={
                  isAuctionSuccessful(lot.status)
                    ? '已成交拍品不能下架'
                    : isActive
                    ? '请先取消讲解'
                    : undefined
                }
                onStart={() => handleStartLot(lot)}
                onCancelExplain={handleStopCurrentLot}
                onDetach={() => handleDetachLot(lot)}
                onProduct={() => history.push(`/items/${lot.itemId}`)}
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
          <Button
            onClick={() => history.push(`/live-rooms/${roomId}/workbench`)}
          >
            返回工作台
          </Button>
          <Button onClick={loadRoomAndAuction} loading={loading}>
            刷新状态
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
            onAction={() => history.push(`/live-rooms/${roomId}/workbench`)}
          />
        </Card>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {antiSnipingTip ? (
            <Alert type="warning" content={antiSnipingTip} />
          ) : null}
          {activeAuctionId === 0 ? (
            <Alert
              type="info"
              content="当前没有开拍拍品，可在下方拍品管理中选择直播拍品开拍。"
            />
          ) : null}
          <Row gutter={16}>
            {LIVE_METRIC_CARDS.map((item) => (
              <Col span={6} key={item.key}>
                <Card
                  bordered={false}
                  style={{
                    background: item.background,
                    border: `1px solid ${item.color}22`,
                    borderRadius: 8,
                  }}
                  bodyStyle={{ padding: 18 }}
                >
                  <Typography.Text type="secondary">
                    {item.label}
                  </Typography.Text>
                  <Typography.Title
                    heading={3}
                    style={{ margin: '8px 0 0', color: item.color }}
                  >
                    {metricValues[item.key]}
                  </Typography.Title>
                </Card>
              </Col>
            ))}
          </Row>
          <Row gutter={16}>
            <Col span={16}>
              <Card loading={loading} title="竞拍核心指标">
                <Row gutter={16}>
                  <Col span={6}>
                    <Typography.Text type="secondary">当前价</Typography.Text>
                    <Typography.Title heading={3} style={{ margin: '8px 0 0' }}>
                      {formatMoneyCent(currentPrice)}
                    </Typography.Title>
                  </Col>
                  <Col span={6}>
                    <Typography.Text type="secondary">领先用户</Typography.Text>
                    <Typography.Title
                      heading={5}
                      style={{ margin: '12px 0 0' }}
                    >
                      {leaderBidderId}
                    </Typography.Title>
                  </Col>
                  <Col span={6}>
                    <Typography.Text type="secondary">剩余时间</Typography.Text>
                    <Typography.Title heading={3} style={{ margin: '8px 0 0' }}>
                      {remainingText}
                    </Typography.Title>
                  </Col>
                  <Col span={6}>
                    <Typography.Text type="secondary">连接状态</Typography.Text>
                    <div style={{ marginTop: 12 }}>
                      <Tag color={connectionMeta.color}>
                        {connectionMeta.label}
                      </Tag>
                    </div>
                  </Col>
                </Row>
              </Card>

              <Card loading={loading} title="出价榜" style={{ marginTop: 16 }}>
                <Table
                  rowKey="bidderId"
                  columns={rankingColumns}
                  data={ranking}
                  pagination={false}
                  noDataElement="等待出价更新"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card loading={loading} title="拍品与状态">
                <Descriptions
                  column={1}
                  data={[
                    { label: '当前拍品', value: auction ? '已开拍' : '-' },
                    {
                      label: '业务状态',
                      value: auctionState?.status
                        ? renderAuctionStatusTag(auctionState.status)
                        : auction?.status
                        ? renderAuctionStatusTag(auction.status)
                        : '-',
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

              <Card title="关键操作" style={{ marginTop: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    status="warning"
                    long
                    disabled={!canCancel}
                    onClick={() => openActionModal('cancel')}
                  >
                    异常取消
                  </Button>
                  <Button
                    status="danger"
                    long
                    disabled={!canHammer}
                    onClick={() => openActionModal('hammer')}
                  >
                    手工落锤
                  </Button>
                </Space>
              </Card>
            </Col>
          </Row>

          {lotPanel}

          <Card title="竞拍动态">
            <Table
              rowKey="id"
              columns={eventColumns}
              data={eventLogs}
              pagination={false}
              noDataElement="等待竞拍动态"
            />
          </Card>
        </Space>
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
        title="选择拍卖时长"
        visible={!!startLot}
        confirmLoading={actingAuctionId === startLot?.auctionId}
        okText="确认开拍"
        cancelText="取消"
        onOk={submitStartLot}
        onCancel={() => setStartLot(undefined)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Select
            value={durationMinutes}
            options={AUCTION_DURATION_OPTIONS}
            onChange={(value) => setDurationMinutes(Number(value))}
          />
        </Space>
      </Modal>
    </AppPage>
  );
}
