import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from '@arco-design/web-react';
import { FormInstance } from '@arco-design/web-react/es/Form';
import { useHistory, useParams } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import {
  LiveSession,
  LiveSessionStatus,
  fetchLiveSession,
  listLiveSessions,
} from '@/services/liveSession';
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
  canViewReport,
  isReportTaskRunning,
  fetchLiveAnalysisReportTaskMap,
  refreshLiveAnalysisReportTask,
  renderReportStatus,
  REPORT_POLL_INTERVAL_MS,
  StoredLiveAnalysisReportTask,
} from './analysis-report';
import ReportMarkdown from './report-markdown';

interface SessionFilters {
  status?: LiveSessionStatus;
}

interface PaginationState {
  current: number;
  pageSize: number;
  total: number;
}

const SESSION_STATUS_OPTIONS: Array<{
  label: string;
  value: LiveSessionStatus;
}> = [
  { label: '直播中', value: 'LIVE' },
  { label: '已结束', value: 'ENDED' },
];

function buildTotal(current: number, pageSize: number, length: number) {
  return (current - 1) * pageSize + length + (length === pageSize ? 1 : 0);
}

export default function LiveSessionSessionsPage() {
  const history = useHistory();
  const { id } = useParams() as { id?: string };
  const filterFormRef = useRef<FormInstance>();
  const [room, setRoom] = useState<LiveSession>();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [reportTasks, setReportTasks] = useState<
    Record<string, StoredLiveAnalysisReportTask>
  >({});
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [activeReportTask, setActiveReportTask] =
    useState<StoredLiveAnalysisReportTask>();
  const [filters, setFilters] = useState<SessionFilters>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  const hasFilters = useMemo(() => !!filters.status, [filters]);

  async function loadSessions(
    nextFilters: SessionFilters = filters,
    nextPagination: PaginationState = pagination
  ) {
    if (!id) {
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [roomResult, sessionResult] = await Promise.all([
        room ? Promise.resolve(room) : fetchLiveSession(id),
        listLiveSessions({
          status: nextFilters.status,
          limit: nextPagination.pageSize,
          offset: (nextPagination.current - 1) * nextPagination.pageSize,
        }),
      ]);
      setRoom(roomResult);
      const nextSessions = (sessionResult.sessions || []).filter(
        (session) => session.status === 'LIVE' || session.status === 'ENDED'
      );
      setSessions(nextSessions);
      setReportTasks(await fetchLiveAnalysisReportTaskMap(nextSessions));
      setPagination((prev) => ({
        ...prev,
        ...nextPagination,
        total: buildTotal(
          nextPagination.current,
          nextPagination.pageSize,
          nextSessions.length
        ),
      }));
    } catch (error) {
      setLoadError('直播记录加载失败，请稍后重试。');
      setSessions([]);
      setReportTasks({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function refreshReportTask(task: StoredLiveAnalysisReportTask) {
    try {
      const nextTask = await refreshLiveAnalysisReportTask(task);
      setReportTasks((current) => ({
        ...current,
        [nextTask.sessionId]: nextTask,
      }));
      setActiveReportTask((current) =>
        current?.sessionId === nextTask.sessionId ? nextTask : current
      );
    } catch (error) {
      // 查询失败不打断列表浏览，下一轮刷新或用户手动刷新会再次同步。
    }
  }

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

  function handleSearch(values: SessionFilters) {
    const nextFilters = {
      status: values.status || undefined,
    };
    const nextPagination = {
      ...pagination,
      current: 1,
    };
    setFilters(nextFilters);
    setPagination(nextPagination);
    loadSessions(nextFilters, nextPagination);
  }

  function handleReset() {
    filterFormRef.current?.resetFields();
    const nextFilters = {};
    const nextPagination = {
      ...pagination,
      current: 1,
    };
    setFilters(nextFilters);
    setPagination(nextPagination);
    loadSessions(nextFilters, nextPagination);
  }

  function handlePaginationChange(current: number, pageSize: number) {
    const nextPagination = {
      ...pagination,
      current,
      pageSize,
    };
    setPagination(nextPagination);
    loadSessions(filters, nextPagination);
  }

  function handleOpenReport(record: LiveSession) {
    const task = reportTasks[String(record.id)];
    if (!canViewReport(task)) {
      return;
    }
    setActiveReportTask(task);
    setReportModalVisible(true);
  }

  function handleCloseReport() {
    setReportModalVisible(false);
    setActiveReportTask(undefined);
  }

  const columns = [
    {
      title: '直播记录',
      dataIndex: 'title',
      width: 260,
      render: (_: unknown, record: LiveSession) => (
        <Space direction="vertical" size={4}>
          <Typography.Text className={styles.entityTitle} ellipsis>
            {getSessionTitle(record)}
          </Typography.Text>
          <Typography.Text type="secondary">
            {formatDateTime(record.openedAt)} 开播，时长 {formatSessionDuration(record)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value: LiveSessionStatus) => renderSessionStatus(value),
    },
    {
      title: '观看人数',
      dataIndex: 'viewerTotal',
      width: 160,
      render: (_: unknown, record: LiveSession) =>
        `${formatCount(record.viewerTotal)} 人 / 峰值 ${formatCount(
          record.viewerPeak
        )}`,
    },
    {
      title: '拍品',
      dataIndex: 'lotsTotal',
      width: 140,
      render: (_: unknown, record: LiveSession) =>
        `${formatCount(record.lotsTotal)} 件 / 成交 ${formatCount(
          record.lotsSold
        )}`,
    },
    {
      title: '出价',
      dataIndex: 'bidCount',
      width: 100,
      render: (value: number) => `${formatCount(value)} 次`,
    },
    {
      title: '成交额',
      dataIndex: 'gmvCent',
      width: 130,
      render: (value: number) => formatMoneyCent(value),
    },
    {
      title: 'AI报告',
      dataIndex: 'report',
      width: 190,
      fixed: 'right' as const,
      render: (_: unknown, record: LiveSession) => {
        const task = reportTasks[String(record.id)];
        if (record.status !== 'ENDED') {
          return <Typography.Text type="secondary">下播后生成</Typography.Text>;
        }
        return (
          <Space>
            {renderReportStatus(task)}
            {canViewReport(task) ? (
              <Button type="text" onClick={() => handleOpenReport(record)}>
                查看报告
              </Button>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '操作',
      dataIndex: 'operations',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: LiveSession) => (
        <Button
          type="text"
          onClick={() => history.push(`/live-sessions/${record.id}`)}
        >
          查看详情
        </Button>
      ),
    },
  ];

  return (
    <AppPage
      title="直播记录"
      extra={
        <Space>
          <Button onClick={() => history.push(`/live-sessions/${id}/workbench`)}>
            返回工作台
          </Button>
          <Button onClick={() => loadSessions(filters, pagination)}>
            刷新记录
          </Button>
        </Space>
      }
    >
      <Card className={styles.filterCard}>
        <Form
          ref={filterFormRef}
          layout="inline"
          initialValues={filters}
          onSubmit={handleSearch}
        >
          <Form.Item field="status" label="直播状态">
            <Select
              allowClear
              placeholder="全部状态"
              options={SESSION_STATUS_OPTIONS}
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button htmlType="submit" type="primary" loading={loading}>
                查询
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card className={styles.tableCard}>
        {loadError ? (
          <AppState
            status="500"
            title="直播记录加载失败"
            subtitle={loadError}
            actionText="重新加载"
            onAction={() => loadSessions(filters, pagination)}
          />
        ) : !loading && sessions.length === 0 ? (
          <AppState
            status="empty"
            title={hasFilters ? '未找到匹配记录' : '暂无直播记录'}
            subtitle={
              hasFilters
                ? '可以调整直播状态后重试。'
                : room
                ? `${room.title} 尚未产生直播记录。`
                : '下播后会自动生成直播记录。'
            }
            actionText={hasFilters ? '清空筛选' : '返回工作台'}
            onAction={
              hasFilters
                ? handleReset
                : () => history.push(`/live-sessions/${id}/workbench`)
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            data={sessions}
            loading={loading}
            scroll={{ x: 1120 }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: pagination.total,
              sizeCanChange: true,
              showTotal: true,
              onChange: handlePaginationChange,
            }}
          />
        )}
      </Card>
      <Modal
        title="AI直播总结报告"
        visible={reportModalVisible}
        footer={null}
        style={{ width: 920, maxWidth: 'calc(100vw - 48px)' }}
        className={styles.reportModal}
        alignCenter
        onCancel={handleCloseReport}
      >
        {activeReportTask ? (
          <div className={styles.reportModalBody}>
            <div className={styles.reportModalHeader}>
              <Space direction="vertical" size={8}>
                {renderReportStatus(activeReportTask)}
                <Typography.Text type="secondary">
                  更新时间：{formatDateTime(activeReportTask.updatedAt)}
                </Typography.Text>
              </Space>
            </div>
            <div className={styles.reportModalContent}>
              <ReportMarkdown content={activeReportTask.report} />
            </div>
          </div>
        ) : (
          <div className={styles.reportModalEmpty}>
            <AppState
              status="empty"
              title="暂无报告"
              subtitle="AI报告生成完成后可在这里查看。"
            />
          </div>
        )}
      </Modal>
    </AppPage>
  );
}
