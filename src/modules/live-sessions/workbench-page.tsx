import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Message,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from '@arco-design/web-react';
import type { UploadItem } from '@arco-design/web-react/es/Upload';
import {
  IconImage,
  IconPlayArrow,
  IconUpload,
  IconVideoCamera,
} from '@arco-design/web-react/icon';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import AuctionLotCard from '@/components/AuctionLotCard';
import SafeImage from '@/components/SafeImage';
import { AuctionLot } from '@/services/auctions';
import {
  fetchLiveSessionAgentHookConfig,
  listLiveSessions,
  LiveSessionStatus,
  LiveSession,
  patchLiveSession,
  updateLiveSessionAgentHookConfig,
  uploadLiveSessionCover,
} from '@/services/liveSession';
import { useLiveSessionStore } from '@/store/liveSession';
import { useSessionStore } from '@/store';
import styles from '../management.module.less';
import { isAuctionInProgress } from './constants';
import {
  buildIdempotencyKey,
  canDetachAuctionFromLiveSession,
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

const STATUS_META: Record<LiveSessionStatus, { label: string; color: string }> =
  {
    DRAFT: { label: '草稿', color: 'gray' },
    SCHEDULED: { label: '已排期', color: 'arcoblue' },
    LIVE: { label: '直播中', color: 'green' },
    ENDED: { label: '已结束', color: 'gray' },
    CANCELLED: { label: '已取消', color: 'red' },
  };

const TabPane = Tabs.TabPane;
const LIVE_TITLE_MAX_LENGTH = 60;
const MAX_LIVE_COVER_SIZE = 5 * 1024 * 1024;

function formatUploadSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${Math.round((size / 1024 / 1024) * 10) / 10}MB`;
  }
  return `${Math.ceil(size / 1024)}KB`;
}

export default function LiveSessionWorkbenchPage() {
  const { id } = useParams() as { id?: string };
  const history = useHistory();
  const sessionUser = useSessionStore((state) => state.user);

  const currentRoom = useLiveSessionStore((state) => state.currentRoom);
  const lots = useLiveSessionStore((state) => state.lots);
  const pendingAuctions = useLiveSessionStore((state) => state.pendingAuctions);
  const loading = useLiveSessionStore((state) => state.loading);
  const pendingLoading = useLiveSessionStore((state) => state.pendingLoading);
  const loadRoom = useLiveSessionStore((state) => state.loadRoom);
  const loadLots = useLiveSessionStore((state) => state.loadLots);
  const loadPendingAuctions = useLiveSessionStore(
    (state) => state.loadPendingAuctions
  );
  const attach = useLiveSessionStore((state) => state.attach);
  const detach = useLiveSessionStore((state) => state.detach);
  const cancelExplain = useLiveSessionStore((state) => state.cancelExplain);
  const setStatus = useLiveSessionStore((state) => state.setStatus);
  const reset = useLiveSessionStore((state) => state.reset);

  const [acting, setActing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'pending' | 'records'>(
    'live'
  );
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [reportTasks, setReportTasks] = useState<
    Record<string, StoredLiveAnalysisReportTask>
  >({});
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [liveTitle, setLiveTitle] = useState('');
  const [coverFileList, setCoverFileList] = useState<UploadItem[]>([]);
  const [titleSaving, setTitleSaving] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [agentHookEnabled, setAgentHookEnabled] = useState(false);
  const [agentHookLoading, setAgentHookLoading] = useState(false);
  const [agentHookUpdating, setAgentHookUpdating] = useState(false);

  useEffect(() => {
    if (!id) {
      history.replace('/live-sessions');
      return;
    }
    reset();
    loadRoom(id);
    loadLots(id);
    loadPendingAuctions(sessionUser?.id);
    loadRecentSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (currentRoom?.id) {
      setLiveTitle(currentRoom.title || '我的直播间');
    }
  }, [currentRoom?.id, currentRoom?.title]);

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
    fetchLiveSessionAgentHookConfig(currentRoom.id)
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

  useEffect(() => {
    if (!currentRoom?.id) {
      return undefined;
    }
    const title = liveTitle.trim();
    if (!title || title === currentRoom.title) {
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setTitleSaving(true);
      try {
        await patchLiveSession(
          currentRoom.id,
          { title },
          buildIdempotencyKey(
            'live-session-title',
            `${currentRoom.id}-${Date.now()}`
          )
        );
        await loadRoom(currentRoom.id);
      } finally {
        setTitleSaving(false);
      }
    }, 800);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTitle, currentRoom?.id, currentRoom?.title]);

  if (!id) {
    return null;
  }

  const room: LiveSession | undefined = currentRoom;
  const fallbackActiveAuctionId = Number(
    lots.find((lot) => isAuctionInProgress(lot.status))?.auctionId || 0
  );
  const activeAuctionId = Number(
    room?.activeAuctionId || fallbackActiveAuctionId
  );

  async function loadRecentSessions() {
    setSessionsLoading(true);
    try {
      const result = await listLiveSessions({
        status: 'ENDED',
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

  async function findLatestEndedSession(endedAfterMs?: number) {
    for (let index = 0; index < 5; index += 1) {
      const result = await listLiveSessions({
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

  async function startLiveAnalysisReport(endedAfterMs?: number) {
    try {
      const latestSession = await findLatestEndedSession(endedAfterMs);
      if (!latestSession) {
        return;
      }
      const task = await fetchLiveAnalysisReportTask(latestSession.id);
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

  async function handleCoverAutoUpload(file?: File) {
    if (!room || !file) {
      return;
    }
    if (file.size > MAX_LIVE_COVER_SIZE) {
      Message.error(
        `图片 ${file.name} 超过 ${formatUploadSize(
          MAX_LIVE_COVER_SIZE
        )} 限制，请压缩后再上传`
      );
      return;
    }
    setCoverUploading(true);
    try {
      await uploadLiveSessionCover(
        room.id,
        { image: file },
        buildIdempotencyKey('live-session-cover', `${room.id}-${Date.now()}`)
      );
      Message.success('直播封面已保存');
      setCoverFileList([]);
      await loadRoom(room.id);
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleStartLive() {
    if (!room) return;
    const title = liveTitle.trim();
    if (!title) {
      Message.warning('请输入直播标题');
      return;
    }
    setActing(true);
    try {
      const nextRoom = await setStatus(
        room.id,
        'LIVE',
        title === room.title ? undefined : { title }
      );
      if (!nextRoom) {
        return;
      }
      Message.success('已开播');
      await loadRoom(room.id);
      await loadRecentSessions();
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
      await setStatus(room.id, 'ENDED');
      Message.success('已下播');
      await loadRoom(room.id);
      await loadLots(room.id);
      await startLiveAnalysisReport(stopStartedAt);
      await loadRecentSessions();
      history.replace('/live-sessions');
    } finally {
      setActing(false);
    }
  }

  async function handleCancelExplain() {
    if (!room) return;
    if (
      activeAuctionId === 0 &&
      !lots.some((lot) => lot.status === 'WARMING_UP')
    )
      return;
    await cancelExplain(room.id);
    await loadRoom(room.id);
    await loadLots(room.id);
    await loadRecentSessions();
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
    if (lot.status === 'WARMING_UP') {
      Message.warning('请先取消预约，再下架拍品。');
      return;
    }
    if (!canDetachAuctionFromLiveSession(lot.status)) {
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
      const config = await updateLiveSessionAgentHookConfig(
        room.id,
        { enabled },
        buildIdempotencyKey('live-agent-hook', `${room.id}-${enabled}`)
      );
      setAgentHookEnabled(!!config.enabled);
      await loadRoom(room.id);
      Message.success(config.enabled ? 'AI托管已开启' : 'AI托管已关闭');
    } finally {
      setAgentHookUpdating(false);
    }
  }

  function handleProduct(lot: AuctionLot) {
    history.push(`/auctions/${lot.auctionId}`);
  }

  const sessionColumns = [
    {
      title: '直播记录',
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
      title="我的直播间"
      extra={
        <Space wrap className={styles.liveWorkbenchActions}>
          {room ? (
            <>
              {room.status === 'LIVE' ? (
                <Tag color={STATUS_META[room.status]?.color || 'green'}>
                  直播中
                </Tag>
              ) : null}
              <Button
                onClick={() => history.push(`/live-sessions/${id}/records`)}
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
                  icon={<IconPlayArrow />}
                  loading={acting}
                  onClick={handleStartLive}
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
                  history.push(`/live-sessions/${id}/control`);
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
            subtitle="该直播间可能已被删除，请重新进入我的直播间。"
            actionText="重新进入"
            onAction={() => history.push('/live-sessions')}
          />
        </Card>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card className={styles.liveSettingsCard}>
            <div className={styles.liveSettingsLayout}>
              <div className={styles.liveSettingsMain}>
                <div className={styles.liveSettingsHeader}>
                  <span className={styles.liveSettingsIcon}>
                    <IconVideoCamera />
                  </span>
                  <div>
                    <Typography.Text className={styles.liveSettingsTitle}>
                      直播间信息
                    </Typography.Text>
                    <div className={styles.liveSettingsStatusLine}>
                      {room?.status === 'LIVE' ? '直播中' : '待开播'}
                      {titleSaving ? ' · 标题保存中' : ' · 已自动保存'}
                    </div>
                  </div>
                </div>
                <div className={styles.liveTitleField}>
                  <Typography.Text className={styles.liveSettingsLabel}>
                    直播间标题
                  </Typography.Text>
                  <Input
                    className={styles.liveTitleInput}
                    value={liveTitle}
                    maxLength={LIVE_TITLE_MAX_LENGTH}
                    showWordLimit
                    placeholder="请输入直播间标题"
                    onChange={setLiveTitle}
                  />
                </div>
                <div className={styles.liveSetupStats}>
                  <div className={styles.liveSetupStat}>
                    <span>已上架</span>
                    <strong>{formatCount(lots.length)}</strong>
                  </div>
                  <div className={styles.liveSetupStat}>
                    <span>待上架</span>
                    <strong>{formatCount(pendingAuctions.length)}</strong>
                  </div>
                  <div className={styles.liveSetupStat}>
                    <span>历史记录</span>
                    <strong>{formatCount(sessions.length)}</strong>
                  </div>
                </div>
              </div>
              <div className={styles.liveCoverPanel}>
                <div className={styles.liveCoverHeader}>
                  <Typography.Text className={styles.liveSettingsLabel}>
                    直播间图片
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {coverUploading ? '上传中' : '自动保存'}
                  </Typography.Text>
                </div>
                <div className={styles.liveCoverFrame}>
                  {room?.coverUrl ? (
                    <button
                      type="button"
                      className={styles.liveCoverPreview}
                      onClick={() => window.open(room.coverUrl, '_blank')}
                    >
                      <SafeImage
                        src={room.coverUrl}
                        alt="当前直播间图片"
                        className={styles.liveCoverImage}
                      />
                    </button>
                  ) : (
                    <div className={styles.liveCoverEmpty}>
                      <IconImage />
                      <span>暂无直播间图片</span>
                    </div>
                  )}
                  <Upload
                    accept="image/*"
                    autoUpload={false}
                    showUploadList={false}
                    fileList={coverFileList}
                    disabled={coverUploading}
                    beforeUpload={(file) => {
                      if (file.size > MAX_LIVE_COVER_SIZE) {
                        Message.error(
                          `图片 ${file.name} 超过 ${formatUploadSize(
                            MAX_LIVE_COVER_SIZE
                          )} 限制，请压缩后再上传`
                        );
                        return false;
                      }
                      return true;
                    }}
                    onChange={(nextFileList) => {
                      const nextList = nextFileList
                        .filter((item) => {
                          const size = item.originFile?.size;
                          return (
                            size === undefined || size <= MAX_LIVE_COVER_SIZE
                          );
                        })
                        .slice(-1);
                      setCoverFileList(nextList);
                      const file = nextList[0]?.originFile as File | undefined;
                      handleCoverAutoUpload(file);
                    }}
                  >
                    <Button
                      className={styles.liveCoverUpload}
                      icon={<IconUpload />}
                      loading={coverUploading}
                    >
                      更换图片
                    </Button>
                  </Upload>
                </div>
              </div>
            </div>
          </Card>
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
                    const isActive =
                      (Number(lot.auctionId) === activeAuctionId &&
                        activeAuctionId !== 0) ||
                      isAuctionInProgress(lot.status);
                    const soldInCurrentLive = isAuctionSuccessful(lot.status);
                    const isScheduled = lot.status === 'WARMING_UP';
                    const disableDetach =
                      isActive || isScheduled || soldInCurrentLive;
                    return (
                      <AuctionLotCard
                        key={lot.auctionId}
                        index={index}
                        lot={lot}
                        isLive={true}
                        isActive={isActive}
                        disableDetach={disableDetach}
                        disableDetachReason={
                          soldInCurrentLive
                            ? '已成交拍品不能下架'
                            : isScheduled
                            ? '请先取消预约'
                            : isActive
                            ? '请先取消讲解'
                            : undefined
                        }
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
                    return (
                      <AuctionLotCard
                        key={lot.auctionId}
                        index={index}
                        lot={lot}
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
                    subtitle="下播后会形成直播记录。"
                    actionText="查看全部"
                    onAction={() =>
                      history.push(`/live-sessions/${id}/records`)
                    }
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
        </Space>
      )}
    </AppPage>
  );
}
