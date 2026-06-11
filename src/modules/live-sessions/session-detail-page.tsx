import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Grid,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  IconFire,
  IconThunderbolt,
  IconTrophy,
  IconUserGroup,
} from '@arco-design/web-react/icon';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import SafeImage from '@/components/SafeImage';
import { AuctionLot } from '@/services/auctions';
import {
  fetchLiveSession,
  listLiveSessionBids,
  listLiveSessionLots,
  listLiveSessionOrders,
  LiveSession,
  LiveSessionBidRecord,
} from '@/services/liveSession';
import { OrderDeal, OrderStatus } from '@/services/orders';
import { renderAuctionStatusTag } from '@/modules/auctions/utils';
import styles from '../management.module.less';
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
  isReportTaskRunning,
  refreshLiveAnalysisReportTask,
  renderReportStatus,
  REPORT_POLL_INTERVAL_MS,
  StoredLiveAnalysisReportTask,
} from './analysis-report';
import ReportMarkdown from './report-markdown';

const Row = Grid.Row;
const Col = Grid.Col;
const TabPane = Tabs.TabPane;

const ORDER_STATUS_META: Record<OrderStatus, { label: string; color: string }> =
  {
    CREATED: { label: '已创建', color: 'arcoblue' },
    PAID: { label: '已支付', color: 'green' },
    TIMEOUT: { label: '已超时', color: 'orange' },
    CANCELLED: { label: '已取消', color: 'red' },
  };

function renderOrderStatus(status?: OrderStatus) {
  if (!status) {
    return '-';
  }
  const meta = ORDER_STATUS_META[status] || {
    label: status,
    color: 'gray',
  };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function getLotImage(lot?: AuctionLot) {
  return lot?.coverUrl || lot?.imageUrls?.[0];
}

function getLotTitle(lot?: AuctionLot) {
  if (!lot) {
    return '直播拍品';
  }
  return lot.title || '未命名拍品';
}

function pickValue(record: Record<string, unknown>, keys: string[]) {
  return keys
    .map((key) => record[key])
    .find((value) => value !== undefined && value !== null && value !== '');
}

function pickString(record: Record<string, unknown>, keys: string[]) {
  const value = pickValue(record, keys);
  return value === undefined ? undefined : String(value);
}

function pickNumber(record: Record<string, unknown>, keys: string[]) {
  const value = pickValue(record, keys);
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function getErrorStatus(error: unknown) {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return Number((error as { status?: number }).status);
  }
  return undefined;
}

export default function LiveSessionDetailPage() {
  const { sessionId } = useParams() as { sessionId?: string };
  const history = useHistory();

  const [session, setSession] = useState<LiveSession>();
  const [lots, setLots] = useState<AuctionLot[]>([]);
  const [bids, setBids] = useState<LiveSessionBidRecord[]>([]);
  const [orders, setOrders] = useState<OrderDeal[]>([]);
  const [reportTask, setReportTask] = useState<StoredLiveAnalysisReportTask>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const lotMap = useMemo(() => {
    const map = new Map<string, AuctionLot>();
    lots.forEach((lot) => {
      map.set(String(lot.auctionId), lot);
    });
    return map;
  }, [lots]);

  const bidRows = useMemo(
    () =>
      bids.map((bid, index) => ({
        ...bid,
        _rowKey: [
          bid.id,
          bid.auctionId,
          bid.lotId,
          bid.price || bid.bidPrice || bid.amountCent || bid.amount,
          bid.createdAt || bid.bidAt,
          index,
        ]
          .filter(
            (value) => value !== undefined && value !== null && value !== ''
          )
          .join('-'),
      })),
    [bids]
  );

  async function loadSessionDetail() {
    if (!sessionId) {
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const sessionResult = await fetchLiveSession(sessionId);
      const [lotResult, bidResult, orderResult] = await Promise.all([
        listLiveSessionLots(sessionId),
        listLiveSessionBids(sessionId, { limit: 100 }),
        listLiveSessionOrders(sessionId, { limit: 100, offset: 0 }),
      ]);
      const nextLots = lotResult.lots || [];
      setSession(sessionResult);
      setLots(nextLots);
      setBids(bidResult.bids || []);
      setOrders(orderResult.orders || []);
      setReportTask(undefined);
      if (sessionResult.status === 'ENDED') {
        const nextReportTask = await fetchLiveAnalysisReportTask(
          sessionResult.id
        ).catch(() => undefined);
        setReportTask(nextReportTask);
      }
    } catch (error) {
      if (getErrorStatus(error) === 404) {
        setSession(undefined);
        setLoadError('该直播记录不存在或已被删除。');
        return;
      }
      setLoadError('直播记录详情加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessionDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function refreshReportTask(task: StoredLiveAnalysisReportTask) {
    try {
      const nextTask = await refreshLiveAnalysisReportTask(task);
      setReportTask(nextTask);
    } catch (error) {
      // 报告任务轮询失败不影响直播记录详情展示。
    }
  }

  useEffect(() => {
    if (!isReportTaskRunning(reportTask)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      refreshReportTask(reportTask);
    }, REPORT_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportTask]);

  function renderAnalysisReport() {
    if (!session || session.status !== 'ENDED') {
      return (
        <Card title="AI直播总结报告">
          <Typography.Text type="secondary">
            直播结束后会自动生成 AI 总结报告。
          </Typography.Text>
        </Card>
      );
    }

    if (!reportTask || isReportTaskRunning(reportTask)) {
      return (
        <Card title="AI直播总结报告">
          <Space direction="vertical" size={8}>
            {renderReportStatus(reportTask)}
            <Typography.Text type="secondary">
              报告正在生成，完成后会自动展示在这里。
            </Typography.Text>
          </Space>
        </Card>
      );
    }

    if (reportTask.status === 'FAILED') {
      return (
        <Card title="AI直播总结报告">
          <Space direction="vertical" size={8}>
            {renderReportStatus(reportTask)}
            <Typography.Text type="secondary">
              {reportTask.errorMessage || '报告生成失败，请稍后重试。'}
            </Typography.Text>
          </Space>
        </Card>
      );
    }

    return (
      <Card title="AI直播总结报告">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space direction="vertical" size={8}>
            {renderReportStatus(reportTask)}
            <Typography.Text type="secondary">
              更新时间：{formatDateTime(reportTask.updatedAt)}
            </Typography.Text>
          </Space>
          <ReportMarkdown content={reportTask.report} />
        </Space>
      </Card>
    );
  }

  function renderSessionMetricCards(currentSession: LiveSession) {
    const metrics = [
      {
        key: 'viewers',
        label: '观看人数',
        value: formatCount(currentSession.viewerTotal),
        hint: '累计进入直播间',
        icon: <IconUserGroup />,
        className: styles.metricCardBlue,
      },
      {
        key: 'peak',
        label: '峰值在线',
        value: formatCount(currentSession.viewerPeak),
        hint: '同时在线最高值',
        icon: <IconFire />,
        className: styles.metricCardRose,
      },
      {
        key: 'lots',
        label: '拍品成交',
        value: `${formatCount(currentSession.lotsSold)} / ${formatCount(
          currentSession.lotsTotal
        )}`,
        hint: '成交 / 上架拍品',
        icon: <IconTrophy />,
        className: styles.metricCardAmber,
      },
      {
        key: 'gmv',
        label: '成交额',
        value: formatMoneyCent(currentSession.gmvCent),
        hint: '本场支付成交',
        icon: <IconThunderbolt />,
        className: styles.metricCardGreen,
      },
    ];

    return (
      <div className={styles.metricGrid}>
        {metrics.map((metric) => (
          <div
            className={[styles.metricCard, metric.className].join(' ')}
            key={metric.key}
          >
            <div className={styles.metricCardHeader}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <span className={styles.metricIcon}>{metric.icon}</span>
            </div>
            <div className={styles.metricValue}>{metric.value}</div>
            <div className={styles.metricHint}>{metric.hint}</div>
          </div>
        ))}
      </div>
    );
  }

  const lotColumns = [
    {
      title: '拍品',
      dataIndex: 'auctionId',
      render: (_: unknown, record: AuctionLot) => {
        const title = getLotTitle(record);
        return (
          <div className={styles.entityCell}>
            <SafeImage
              className={styles.entityImage}
              src={getLotImage(record)}
              alt={title}
              width={64}
              height={64}
            />
            <Space direction="vertical" size={4}>
              <Typography.Text className={styles.entityTitle} ellipsis>
                {title}
              </Typography.Text>
              <Typography.Text type="secondary">
                {record.category || '直播拍品'}
              </Typography.Text>
            </Space>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: renderAuctionStatusTag,
    },
    {
      title: '起拍价',
      dataIndex: 'startPrice',
      width: 120,
      render: formatMoneyCent,
    },
    {
      title: '成交价',
      dataIndex: 'dealPrice',
      width: 120,
      render: formatMoneyCent,
    },
    {
      title: '出价',
      dataIndex: 'bidCount',
      width: 100,
      render: (value: number) => `${formatCount(value)} 次`,
    },
    {
      title: '结束时间',
      dataIndex: 'closedAt',
      width: 190,
      render: (_: unknown, record: AuctionLot) =>
        formatDateTime(record.closedAt || record.endTime),
    },
  ];

  const bidColumns = [
    {
      title: '拍品',
      dataIndex: 'auctionId',
      render: (_: unknown, record: LiveSessionBidRecord) => {
        const source = record as Record<string, unknown>;
        const auctionId = pickString(source, ['auctionId', 'lotId']);
        const lot = auctionId ? lotMap.get(String(auctionId)) : undefined;
        return getLotTitle(lot);
      },
    },
    {
      title: '出价人',
      dataIndex: 'bidderName',
      width: 160,
      render: (_: unknown, record: LiveSessionBidRecord) => {
        const source = record as Record<string, unknown>;
        return (
          pickString(source, [
            'nickname',
            'bidderName',
            'userName',
            'buyerName',
          ]) || '竞拍用户'
        );
      },
    },
    {
      title: '出价金额',
      dataIndex: 'price',
      width: 140,
      render: (_: unknown, record: LiveSessionBidRecord) => {
        const source = record as Record<string, unknown>;
        return formatMoneyCent(
          pickNumber(source, ['price', 'bidPrice', 'amountCent', 'amount'])
        );
      },
    },
    {
      title: '出价时间',
      dataIndex: 'createdAt',
      width: 190,
      render: (_: unknown, record: LiveSessionBidRecord) => {
        const source = record as Record<string, unknown>;
        return formatDateTime(
          pickString(source, ['bidAt', 'createdAt', 'updatedAt'])
        );
      },
    },
  ];

  const orderColumns = [
    {
      title: '拍品',
      dataIndex: 'auctionId',
      render: (_: unknown, record: OrderDeal) => {
        const lot = lotMap.get(String(record.auctionId));
        return record.lotSnapshot?.title || getLotTitle(lot);
      },
    },
    {
      title: '成交金额',
      dataIndex: 'dealPrice',
      width: 140,
      render: formatMoneyCent,
    },
    {
      title: '订单状态',
      dataIndex: 'status',
      width: 120,
      render: renderOrderStatus,
    },
    {
      title: '成交时间',
      dataIndex: 'createdAt',
      width: 190,
      render: formatDateTime,
    },
  ];

  if (!sessionId) {
    return null;
  }

  return (
    <AppPage
      title={session ? getSessionTitle(session) : '直播记录详情'}
      extra={
        <Space>
          {session ? (
            <>
              <Button
                onClick={() =>
                  history.push(`/live-sessions/${session.id}/records`)
                }
              >
                返回直播记录
              </Button>
              <Button
                type="primary"
                onClick={() =>
                  history.push(`/live-sessions/${session.id}/workbench`)
                }
              >
                返回工作台
              </Button>
            </>
          ) : null}
          <Button onClick={loadSessionDetail}>刷新</Button>
        </Space>
      }
    >
      {loadError ? (
        <Card>
          <AppState
            status={loadError.includes('不存在') ? '404' : '500'}
            title={
              loadError.includes('不存在')
                ? '直播记录不存在'
                : '直播记录详情加载失败'
            }
            subtitle={loadError}
            actionText={loadError.includes('不存在') ? undefined : '重新加载'}
            onAction={
              loadError.includes('不存在') ? undefined : loadSessionDetail
            }
          />
        </Card>
      ) : loading && !session ? (
        <Card>
          <AppState
            status="empty"
            title="加载中"
            subtitle="正在加载直播记录详情..."
          />
        </Card>
      ) : session ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card className={styles.heroCard}>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={8}>
                <div className={styles.sessionSummaryPanel}>
                  <div className={styles.sessionStatusLine}>
                    <span className={styles.sessionSummaryLabel}>直播状态</span>
                    {renderSessionStatus(session.status)}
                  </div>
                  <div className={styles.sessionTimeList}>
                    <div className={styles.sessionTimeItem}>
                      <span>开播时间</span>
                      <strong>{formatDateTime(session.openedAt)}</strong>
                    </div>
                    <div className={styles.sessionTimeItem}>
                      <span>下播时间</span>
                      <strong>{formatDateTime(session.closedAt)}</strong>
                    </div>
                    <div className={styles.sessionTimeItem}>
                      <span>直播时长</span>
                      <strong>{formatSessionDuration(session)}</strong>
                    </div>
                  </div>
                </div>
              </Col>
              <Col xs={24} lg={16}>
                {renderSessionMetricCards(session)}
              </Col>
            </Row>
          </Card>

          {renderAnalysisReport()}

          <Card className={styles.tableCard}>
            <Tabs>
              <TabPane key="lots" title={`直播拍品（${lots.length}）`}>
                <Table
                  rowKey="auctionId"
                  columns={lotColumns}
                  data={lots}
                  loading={loading}
                  pagination={false}
                />
              </TabPane>
              <TabPane key="bids" title={`出价记录（${bids.length}）`}>
                <Table
                  rowKey="_rowKey"
                  columns={bidColumns}
                  data={bidRows}
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                />
              </TabPane>
              <TabPane key="orders" title={`成交订单（${orders.length}）`}>
                <Table
                  rowKey="id"
                  columns={orderColumns}
                  data={orders}
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                />
              </TabPane>
            </Tabs>
          </Card>
        </Space>
      ) : (
        <Card>
          <AppState
            status="404"
            title="直播记录不存在"
            subtitle="该直播记录可能已被删除。"
          />
        </Card>
      )}
    </AppPage>
  );
}
