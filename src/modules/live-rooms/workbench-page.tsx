import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import AuctionLotCard from '@/components/AuctionLotCard';
import SafeImage from '@/components/SafeImage';
import { AuctionLot } from '@/services/auctions';
import { Item, fetchItem } from '@/services/items';
import {
  fetchLiveRoomAgentHookConfig,
  listLiveSessionsByRoom,
  LiveRoom,
  LiveRoomStatus,
  LiveSession,
  updateLiveRoomAgentHookConfig,
  uploadLiveRoomCover,
} from '@/services/liveRoom';
import { useLiveRoomStore } from '@/store/liveRoom';
import { useSessionStore } from '@/store';
import styles from '../management.module.less';
import {
  AUCTION_DURATION_OPTIONS,
  DEFAULT_AUCTION_DURATION_MINUTES,
  isAuctionInProgress,
} from './constants';
import {
  buildIdempotencyKey,
  canDetachAuctionFromLiveRoom,
  isAuctionSuccessful,
} from '@/modules/auctions/utils';
import {
  formatCount,
  formatDateTime,
  formatMoneyCent,
  formatSessionDuration,
  getSessionTitle,
  renderSessionStatus,
} from './session-utils';
import {
  fetchLiveAnalysisReportTask,
  fetchLiveAnalysisReportTaskMap,
  isReportTaskRunning,
  refreshLiveAnalysisReportTask,
  renderReportStatus,
  REPORT_POLL_INTERVAL_MS,
  StoredLiveAnalysisReportTask,
} from './analysis-report';

const STATUS_META: Record<LiveRoomStatus, { label: string; color: string }> = {
  OFFLINE: { label: '未开播', color: 'gray' },
  LIVE: { label: '直播中', color: 'green' },
  CLOSED: { label: '已关闭', color: 'red' },
};

const TabPane = Tabs.TabPane;
const LIVE_TITLE_MAX_LENGTH = 60;
const MAX_LIVE_COVER_SIZE = 2 * 1024 * 1024;

export default function LiveRoomWorkbenchPage() {
  const { id } = useParams() as { id?: string };
  const history = useHistory();
  const sessionUser = useSessionStore((state) => state.user);

  const currentRoom = useLiveRoomStore((state) => state.currentRoom);
  const lots = useLiveRoomStore((state) => state.lots);
  const pendingAuctions = useLiveRoomStore((state) => state.pendingAuctions);
  const loading = useLiveRoomStore((state) => state.loading);
  const pendingLoading = useLiveRoomStore((state) => state.pendingLoading);
  const loadRoom = useLiveRoomStore((state) => state.loadRoom);
  const loadLots = useLiveRoomStore((state) => state.loadLots);
  const loadPendingAuctions = useLiveRoomStore(
    (state) => state.loadPendingAuctions
  );
  const attach = useLiveRoomStore((state) => state.attach);
  const detach = useLiveRoomStore((state) => state.detach);
  const activate = useLiveRoomStore((state) => state.activate);
  const cancelExplain = useLiveRoomStore((state) => state.cancelExplain);
  const setStatus = useLiveRoomStore((state) => state.setStatus);
  const reset = useLiveRoomStore((state) => state.reset);

  const [acting, setActing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'pending' | 'records'>(
    'live'
  );
  const [items, setItems] = useState<Record<string, Item>>({});
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [reportTasks, setReportTasks] = useState<
    Record<string, StoredLiveAnalysisReportTask>
  >({});
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [startLot, setStartLot] = useState<AuctionLot>();
  const [durationMinutes, setDurationMinutes] = useState(
    DEFAULT_AUCTION_DURATION_MINUTES
  );
  const [startLoading, setStartLoading] = useState(false);
  const [startLiveVisible, setStartLiveVisible] = useState(false);
  const [startLiveTitle, setStartLiveTitle] = useState('');
  const [coverFileList, setCoverFileList] = useState<UploadItem[]>([]);
  const [agentHookEnabled, setAgentHookEnabled] = useState(false);
  const [agentHookLoading, setAgentHookLoading] = useState(false);
  const [agentHookUpdating, setAgentHookUpdating] = useState(false);

  useEffect(() => {
    if (!id) {
      history.replace('/live-rooms');
      return;
    }
    reset();
    loadRoom(id);
    loadLots(id);
    loadPendingAuctions(sessionUser?.id);
    loadRecentSessions(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const allLots = useMemo(
    () => [...(lots || []), ...(pendingAuctions || [])],
    [lots, pendingAuctions]
  );

  useEffect(() => {
    const idsToFetch = new Set<string | number>();
    allLots.forEach((lot) => {
      if (lot.itemId !== undefined && lot.itemId !== null) {
        const key = String(lot.itemId);
        if (!items[key]) {
          idsToFetch.add(lot.itemId);
        }
      }
    });
    if (idsToFetch.size === 0) {
      return;
    }
    Promise.all(
      Array.from(idsToFetch).map((itemId) =>
        fetchItem(itemId).catch(() => undefined)
      )
    ).then((results) => {
      const next = { ...items };
      results.forEach((item) => {
        if (item) {
          next[String(item.id)] = item;
        }
      });
      setItems(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLots]);

  useEffect(() => {
    const runningTasks = Object.values(reportTasks).filter(isReportTaskRunning);
    if (!runningTasks.length) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      runningTasks.forEach((task) => {
        refreshReportTask(task);
      });
    }, REPORT_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportTasks]);

  useEffect(() => {
    let ignore = false;

    if (!currentRoom?.id || currentRoom.status !== 'LIVE') {
      setAgentHookEnabled(false);
      setAgentHookLoading(false);
      return undefined;
    }

    setAgentHookLoading(true);
    fetchLiveRoomAgentHookConfig(currentRoom.id)
      .then((config) => {
        if (!ignore) {
          setAgentHookEnabled(!!config.enabled);
        }
      })
      .catch(() => {
        if (!ignore) {
          setAgentHookEnabled(false);
        }
      })
      .finally(() => {
        if (!ignore) {
          setAgentHookLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [currentRoom?.id, currentRoom?.status]);

  if (!id) {
    return null;
  }

  const room: LiveRoom | undefined = currentRoom;
  const fallbackActiveAuctionId = Number(
    lots.find((lot) => isAuctionInProgress(lot.status))?.auctionId || 0
  );
  const activeAuctionId = Number(
    room?.activeAuctionId || fallbackActiveAuctionId
  );
  const isLive = room?.status === 'LIVE';

  async function loadRecentSessions(roomId: string | number) {
    setSessionsLoading(true);
    try {
      const result = await listLiveSessionsByRoom(roomId, {
        limit: 5,
        offset: 0,
      });
      const nextSessions = result.sessions || [];
      setSessions(nextSessions);
      setReportTasks(await fetchLiveAnalysisReportTaskMap(nextSessions));
    } catch (error) {
      setSessions([]);
      setReportTasks({});
    } finally {
      setSessionsLoading(false);
    }
  }

  function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function findLatestEndedSession(
    roomId: string | number,
    endedAfterMs?: number
  ) {
    for (let index = 0; index < 5; index += 1) {
      const result = await listLiveSessionsByRoom(roomId, {
        status: 'ENDED',
        limit: 1,
        offset: 0,
      });
      const latestSession = result.sessions?.[0];
      if (latestSession) {
        const endedAt = new Date(
          latestSession.closedAt ||
            latestSession.updatedAt ||
            latestSession.createdAt
        ).getTime();
        if (
          !endedAfterMs ||
          Number.isNaN(endedAt) ||
          endedAt >= endedAfterMs - 30000
        ) {
          return latestSession;
        }
      }
      await wait(500);
    }
    return undefined;
  }

  async function startLiveAnalysisReport(
    roomId: string | number,
    endedAfterMs?: number
  ) {
    try {
      const latestSession = await findLatestEndedSession(roomId, endedAfterMs);
      if (!latestSession) {
        return;
      }
      const task = await fetchLiveAnalysisReportTask(latestSession.id, {
        liveRoomId: roomId,
      });
      setReportTasks((current) => ({
        ...current,
        [task.sessionId]: task,
      }));
      Message.info(
        task.report?.trim()
          ? 'AI报告已生成，可在直播记录查看。'
          : 'AI报告生成中，可在直播记录查看。'
      );
    } catch (error) {
      Message.warning('AI报告同步失败，可稍后刷新直播记录。');
    }
  }

  async function refreshReportTask(task: StoredLiveAnalysisReportTask) {
    try {
      const nextTask = await refreshLiveAnalysisReportTask(task);
      setReportTasks((current) => ({
        ...current,
        [nextTask.sessionId]: nextTask,
      }));
    } catch (error) {
      // 轮询失败不影响控台使用，下一轮会继续同步。
    }
  }

  function openStartLiveModal() {
    if (!room) return;
    setStartLiveTitle(room.title || '');
    setCoverFileList([]);
    setStartLiveVisible(true);
  }

  async function submitStartLive() {
    if (!room) return;
    const title = startLiveTitle.trim();
    if (!title) {
      Message.warning('请输入直播标题');
      return;
    }
    setActing(true);
    try {
      const coverFile = coverFileList.find((item) => item.originFile)
        ?.originFile as File | undefined;
      if (coverFile) {
        await uploadLiveRoomCover(
          room.id,
          { image: coverFile },
          buildIdempotencyKey('live-room-cover', room.id)
        );
      }
      const nextRoom = await setStatus(room.id, 'LIVE', { title });
      if (!nextRoom) {
        return;
      }
      Message.success('已开播');
      await loadRoom(room.id);
      await loadRecentSessions(room.id);
      setStartLiveVisible(false);
      setCoverFileList([]);
    } finally {
      setActing(false);
    }
  }

  async function handleStopLive() {
    if (!room) return;
    setActing(true);
    try {
      const stopStartedAt = Date.now();
      if (activeAuctionId !== 0) {
        await cancelExplain(room.id);
      }
      await setStatus(room.id, 'OFFLINE');
      Message.success('已下播');
      await loadRoom(room.id);
      await loadLots(room.id);
      await startLiveAnalysisReport(room.id, stopStartedAt);
      await loadRecentSessions(room.id);
    } finally {
      setActing(false);
    }
  }

  function handleStartLot(lot: AuctionLot) {
    if (!room) return;
    if (room.status !== 'LIVE') {
      Message.warning('请先开播');
      return;
    }
    if (activeAuctionId !== 0) {
      Message.warning('请等待当前商品讲解结束');
      return;
    }
    setDurationMinutes(DEFAULT_AUCTION_DURATION_MINUTES);
    setStartLot(lot);
  }

  async function submitStartLot() {
    if (!room || !startLot) return;
    setStartLoading(true);
    try {
      await activate(room.id, startLot.auctionId, durationMinutes);
      await loadRoom(room.id);
      await loadLots(room.id);
      await loadRecentSessions(room.id);
      setStartLot(undefined);
    } finally {
      setStartLoading(false);
    }
  }

  async function handleCancelExplain() {
    if (!room) return;
    if (activeAuctionId === 0) return;
    await cancelExplain(room.id);
    await loadRoom(room.id);
    await loadLots(room.id);
    await loadRecentSessions(room.id);
  }

  async function handleDetachLot(lot: AuctionLot) {
    if (!room) return;
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
    await detach(room.id, lot.auctionId);
  }

  async function handleAttachLot(lot: AuctionLot) {
    if (!room) return;
    await attach(room.id, lot.auctionId);
  }

  async function handleAgentHookChange(enabled: boolean) {
    if (!room) return;
    if (room.status !== 'LIVE') {
      Message.warning('开播后才能设置 AI 托管');
      return;
    }
    setAgentHookUpdating(true);
    try {
      const config = await updateLiveRoomAgentHookConfig(
        room.id,
        { enabled },
        buildIdempotencyKey('live-agent-hook', `${room.id}-${enabled}`)
      );
      setAgentHookEnabled(!!config.enabled);
      Message.success(config.enabled ? 'AI托管已开启' : 'AI托管已关闭');
    } finally {
      setAgentHookUpdating(false);
    }
  }

  function handleProduct(lot: AuctionLot) {
    history.push(`/items/${lot.itemId}`);
  }

  const sessionColumns = [
    {
      title: '直播场次',
      dataIndex: 'title',
      width: 240,
      render: (_: unknown, record: LiveSession) => (
        <Space direction="vertical" size={4}>
          <Typography.Text className={styles.entityTitle} ellipsis>
            {getSessionTitle(record)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {formatDateTime(record.openedAt)}，{formatSessionDuration(record)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: renderSessionStatus,
    },
    {
      title: '人数',
      dataIndex: 'viewerTotal',
      width: 140,
      render: (_: unknown, record: LiveSession) =>
        `${formatCount(record.viewerTotal)} / 峰值 ${formatCount(
          record.viewerPeak
        )}`,
    },
    {
      title: '拍品',
      dataIndex: 'lotsTotal',
      width: 120,
      render: (_: unknown, record: LiveSession) =>
        `${formatCount(record.lotsTotal)} 件 / ${formatCount(
          record.lotsSold
        )} 成交`,
    },
    {
      title: '出价',
      dataIndex: 'bidCount',
      width: 90,
      render: (value: number) => `${formatCount(value)} 次`,
    },
    {
      title: '成交额',
      dataIndex: 'gmvCent',
      width: 120,
      render: formatMoneyCent,
    },
    {
      title: 'AI报告',
      dataIndex: 'report',
      width: 140,
      fixed: 'right' as const,
      render: (_: unknown, record: LiveSession) =>
        record.status === 'ENDED' ? (
          renderReportStatus(reportTasks[String(record.id)])
        ) : (
          <Tag color="gray">下播后生成</Tag>
        ),
    },
    {
      title: '操作',
      dataIndex: 'operations',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: LiveSession) => (
        <Button
          type="text"
          onClick={() => history.push(`/live-sessions/${record.id}`)}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <AppPage
      title={room ? room.title : '直播间工作台'}
      extra={
        <Space>
          {room ? (
            <>
              <Tag color={STATUS_META[room.status]?.color || 'gray'}>
                {STATUS_META[room.status]?.label || room.status}
              </Tag>
              <Button
                onClick={() => history.push(`/live-rooms/${id}/sessions`)}
              >
                直播记录
              </Button>
              {room.status === 'LIVE' ? (
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
              {activeAuctionId !== 0 ? (
                <Typography.Text>当前有拍品正在讲解</Typography.Text>
              ) : null}
              {room.status === 'LIVE' ? (
                <Button
                  status="warning"
                  loading={acting}
                  onClick={handleStopLive}
                >
                  下播
                </Button>
              ) : (
                <Button
                  type="primary"
                  loading={acting}
                  onClick={openStartLiveModal}
                >
                  开播
                </Button>
              )}
              <Button
                type="primary"
                disabled={room.status !== 'LIVE'}
                title={
                  room.status !== 'LIVE' ? '开播后才能进入控场' : undefined
                }
                onClick={() => {
                  if (room.status !== 'LIVE') {
                    Message.warning('请先开播，再进入控场。');
                    return;
                  }
                  history.push(`/live-rooms/${id}/control`);
                }}
              >
                进入控场
              </Button>
            </>
          ) : null}
        </Space>
      }
    >
      {!room && !loading ? (
        <Card>
          <AppState
            status="404"
            title="直播间不存在"
            subtitle="该直播间可能已被删除，请重新进入直播间。"
            actionText="重新进入"
            onAction={() => history.push('/live-rooms')}
          />
        </Card>
      ) : (
        <Card>
          <Tabs
            activeTab={activeTab}
            onChange={(key) =>
              setActiveTab(key as 'live' | 'pending' | 'records')
            }
          >
            <TabPane key="live" title={`直播拍品（${lots.length}）`}>
              {loading ? (
                <AppState
                  status="empty"
                  title="加载中"
                  subtitle="正在加载直播拍品..."
                />
              ) : lots.length === 0 ? (
                <AppState
                  status="empty"
                  title="暂无直播拍品"
                  subtitle="切换到「待上架拍品」选择拍品上架到直播间。"
                />
              ) : (
                lots.map((lot, index) => {
                  const itemKey = String(lot.itemId);
                  const item = items[itemKey];
                  const isActive =
                    (Number(lot.auctionId) === activeAuctionId &&
                      activeAuctionId !== 0) ||
                    isAuctionInProgress(lot.status);
                  const disableStart =
                    !isLive || activeAuctionId !== 0 || isActive;
                  const disableStartReason = !isLive
                    ? '请先开播'
                    : activeAuctionId !== 0
                    ? '请等待当前商品讲解结束'
                    : undefined;
                  const soldInCurrentLive = isAuctionSuccessful(lot.status);
                  const disableDetach = isActive || soldInCurrentLive;
                  return (
                    <AuctionLotCard
                      key={lot.auctionId}
                      index={index}
                      lot={lot}
                      item={item}
                      itemTitle={item?.title}
                      isLive
                      isActive={isActive}
                      disableStart={disableStart}
                      disableStartReason={disableStartReason}
                      disableDetach={disableDetach}
                      disableDetachReason={
                        soldInCurrentLive
                          ? '已成交拍品不能下架'
                          : isActive
                          ? '请先取消讲解'
                          : undefined
                      }
                      onStart={() => handleStartLot(lot)}
                      onCancelExplain={handleCancelExplain}
                      onDetach={() => handleDetachLot(lot)}
                      onProduct={() => handleProduct(lot)}
                    />
                  );
                })
              )}
            </TabPane>
            <TabPane
              key="pending"
              title={`待上架拍品（${pendingAuctions.length}）`}
            >
              {pendingLoading ? (
                <AppState
                  status="empty"
                  title="加载中"
                  subtitle="正在加载待上架拍品..."
                />
              ) : pendingAuctions.length === 0 ? (
                <AppState
                  status="empty"
                  title="暂无待上架拍品"
                  subtitle="先在拍品管理中创建待开拍状态的拍品。"
                />
              ) : (
                pendingAuctions.map((lot, index) => {
                  const itemKey = String(lot.itemId);
                  const item = items[itemKey];
                  return (
                    <AuctionLotCard
                      key={lot.auctionId}
                      index={index}
                      lot={lot}
                      item={item}
                      itemTitle={item?.title}
                      isLive={false}
                      isActive={false}
                      onAttach={() => handleAttachLot(lot)}
                      onProduct={() => handleProduct(lot)}
                    />
                  );
                })
              )}
            </TabPane>
            <TabPane key="records" title={`直播记录（${sessions.length}）`}>
              {sessionsLoading ? (
                <AppState
                  status="empty"
                  title="加载中"
                  subtitle="正在加载直播记录..."
                />
              ) : sessions.length === 0 ? (
                <AppState
                  status="empty"
                  title="暂无直播记录"
                  subtitle="开播和下播后会形成直播场次记录。"
                  actionText="查看全部"
                  onAction={() => history.push(`/live-rooms/${id}/sessions`)}
                />
              ) : (
                <Table
                  rowKey="id"
                  columns={sessionColumns}
                  data={sessions}
                  scroll={{ x: 1060 }}
                  pagination={false}
                />
              )}
            </TabPane>
          </Tabs>
        </Card>
      )}
      <Modal
        title="开播设置"
        visible={startLiveVisible}
        confirmLoading={acting}
        okText="确认开播"
        cancelText="取消"
        okButtonProps={{ disabled: !startLiveTitle.trim() }}
        onOk={submitStartLive}
        onCancel={() => setStartLiveVisible(false)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>直播标题</Typography.Text>
          <Input
            value={startLiveTitle}
            maxLength={LIVE_TITLE_MAX_LENGTH}
            showWordLimit
            placeholder="请输入本场直播标题"
            onChange={setStartLiveTitle}
          />
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text>直播封面</Typography.Text>
            {room?.coverUrl ? (
              <button
                type="button"
                className={styles.liveCoverPreview}
                onClick={() => window.open(room.coverUrl, '_blank')}
              >
                <SafeImage
                  src={room.coverUrl}
                  alt="当前直播封面"
                  className={styles.liveCoverImage}
                />
              </button>
            ) : (
              <Typography.Text type="secondary">
                当前暂无直播封面
              </Typography.Text>
            )}
            <Upload
              accept="image/*"
              autoUpload={false}
              listType="picture-card"
              fileList={coverFileList}
              beforeUpload={(file) => {
                if (file.size > MAX_LIVE_COVER_SIZE) {
                  Message.error(
                    `图片 ${file.name} 超过 2MB 限制，请压缩后再上传`
                  );
                  return false;
                }
                return true;
              }}
              onChange={(nextFileList) =>
                setCoverFileList(
                  nextFileList
                    .filter((item) => {
                      const size = item.originFile?.size;
                      return size === undefined || size <= MAX_LIVE_COVER_SIZE;
                    })
                    .slice(-1)
                )
              }
            />
            <Typography.Text type="secondary">
              选择新封面后会在确认开播前上传。单张不超过 2MB。
            </Typography.Text>
          </Space>
        </Space>
      </Modal>
      <Modal
        title="选择拍卖时长"
        visible={!!startLot}
        confirmLoading={startLoading}
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
