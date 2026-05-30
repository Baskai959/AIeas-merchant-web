import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import { ApiError } from '@/services/http/client';
import { listAuditLogs, AuditLogRecord } from '@/services/audit-logs';
import { useSessionStore } from '@/store';

const FormItem = Form.Item;
const RangePicker = DatePicker.RangePicker;
const PAGE_SIZE = 10;

type PageState = 'ready' | 'forbidden' | 'unavailable' | 'error';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '请求失败，请稍后重试';
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatPayloadSummary(payload?: Record<string, unknown>) {
  if (!payload || !Object.keys(payload).length) {
    return '无详情摘要';
  }

  const entries = Object.entries(payload)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.join(' | ');
}

function renderRole(role: string) {
  const colorMap: Record<string, string> = {
    admin: 'red',
    merchant: 'arcoblue',
    buyer: 'green',
  };
  const labelMap: Record<string, string> = {
    admin: '管理员',
    merchant: '商家',
    buyer: '买家',
  };

  return <Tag color={colorMap[role] || 'gray'}>{labelMap[role] || role}</Tag>;
}

export default function AuditLogListPage() {
  const user = useSessionStore((state) => state.user);
  const [operatorIdInput, setOperatorIdInput] = useState(user?.id || '');
  const [actionInput, setActionInput] = useState('');
  const [timeRangeInput, setTimeRangeInput] = useState<string[]>([]);
  const [timeRangePickerValue, setTimeRangePickerValue] = useState<any[] | undefined>();
  const [operatorId, setOperatorId] = useState(user?.id || '');
  const [action, setAction] = useState('');
  const [timeRange, setTimeRange] = useState<string[]>([]);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageState, setPageState] = useState<PageState>('ready');
  const [pageError, setPageError] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    setOperatorIdInput(user.id);
    setOperatorId(user.id);
  }, [user?.id]);

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAuditLogs({
        operatorId: operatorId || undefined,
        action: action || undefined,
        startTime: timeRange[0] || undefined,
        endTime: timeRange[1] || undefined,
        page,
        pageSize: PAGE_SIZE,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });

      setLogs(result.items || []);
      setTotal(result.total || 0);
      setPageState('ready');
      setPageError('');
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        if (fetchError.status === 403) {
          setPageState('unavailable');
          setPageError('当前暂无法查看操作日志，请稍后重试或联系管理员。');
          setLogs([]);
          setTotal(0);
          setLoading(false);
          return;
        }

        if ([404, 405, 501, 502, 503].includes(fetchError.status || 0)) {
          setPageState('unavailable');
          setPageError(getErrorMessage(fetchError));
          setLogs([]);
          setTotal(0);
          setLoading(false);
          return;
        }
      }

      setPageState('error');
      setPageError(getErrorMessage(fetchError));
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [action, operatorId, page, timeRange]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const columns = useMemo(
    () => [
      {
        title: '操作人',
        dataIndex: 'operatorId',
        width: 180,
      },
      {
        title: '角色',
        dataIndex: 'operatorRole',
        width: 100,
        render: (value: string) => renderRole(value),
      },
      {
        title: '动作',
        dataIndex: 'action',
        width: 160,
        render: (value: string) => <Tag color="purple">{value}</Tag>,
      },
      {
        title: '对象',
        dataIndex: 'target',
        width: 220,
        render: (_: unknown, record: AuditLogRecord) =>
          `${record.targetType} / ${record.targetId}`,
      },
      {
        title: '摘要',
        dataIndex: 'payload',
        ellipsis: true,
        render: (value: Record<string, unknown> | undefined) =>
          formatPayloadSummary(value),
      },
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: '操作',
        dataIndex: 'operations',
        width: 100,
        fixed: 'right' as const,
        render: (_: unknown, record: AuditLogRecord) => (
          <Button
            type="text"
            onClick={() => {
              setSelectedLog(record);
              setDetailVisible(true);
            }}
          >
            查看详情
          </Button>
        ),
      },
    ],
    []
  );

  const content = useMemo(() => {
    if (pageState === 'forbidden') {
      return (
        <AppState
          status="403"
          title="当前账号无权限查看操作日志"
          subtitle="当前账号暂不可查看自身操作记录，其他模块仍可正常使用。"
        />
      );
    }

    if (pageState === 'unavailable') {
      return (
        <AppState
          status="500"
          title="操作日志暂不可用"
          subtitle={pageError || '当前暂无法查看操作日志，请稍后重试或联系管理员。'}
          actionText="重新检测"
          onAction={loadAuditLogs}
        />
      );
    }

    if (pageState === 'error') {
      return (
        <AppState
          status="500"
          title="操作日志加载失败"
          subtitle={pageError}
          actionText="重新加载"
          onAction={loadAuditLogs}
        />
      );
    }

    return (
      <Table
        rowKey="id"
        columns={columns}
        data={logs}
        loading={loading}
        scroll={{ x: 1220 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          sizeCanChange: false,
          onChange: (nextPage) => setPage(nextPage),
        }}
        noDataElement={
          <AppState
            status="empty"
            title="暂无操作日志"
            subtitle="可以调整操作人、动作或时间范围后再次查询。"
          />
        }
      />
    );
  }, [columns, loadAuditLogs, loading, logs, page, pageError, pageState, total]);

  return (
    <AppPage title="操作日志">
      <Card style={{ marginBottom: 16 }}>
        <Form layout="inline">
          <FormItem label="操作人">
            <Input
              allowClear
              placeholder="默认查询本人"
              style={{ width: 180 }}
              value={operatorIdInput}
              onChange={setOperatorIdInput}
              disabled={Boolean(user?.id)}
            />
          </FormItem>
          <FormItem label="动作">
            <Input
              allowClear
              placeholder="如：开拍、下架、修改规则"
              style={{ width: 180 }}
              value={actionInput}
              onChange={setActionInput}
            />
          </FormItem>
          <FormItem label="时间范围">
            <RangePicker
              showTime
              style={{ width: 320 }}
              value={timeRangePickerValue}
              onChange={(dateStrings, value) => {
                setTimeRangePickerValue(value || undefined);
                setTimeRangeInput(dateStrings || []);
              }}
            />
          </FormItem>
          <FormItem>
            <Space>
              <Button
                type="primary"
                onClick={() => {
                  setPage(1);
                  setOperatorId(operatorIdInput.trim());
                  setAction(actionInput.trim());
                  setTimeRange(timeRangeInput);
                }}
              >
                查询
              </Button>
              <Button
                onClick={() => {
                  setOperatorIdInput(user?.id || '');
                  setActionInput('');
                  setTimeRangeInput([]);
                  setTimeRangePickerValue(undefined);
                  setOperatorId(user?.id || '');
                  setAction('');
                  setTimeRange([]);
                  setPage(1);
                }}
              >
                重置
              </Button>
            </Space>
          </FormItem>
        </Form>
      </Card>

      <Card>{content}</Card>

      <Drawer
        width={560}
        title="日志详情"
        visible={detailVisible}
        footer={null}
        onCancel={() => {
          setDetailVisible(false);
          setSelectedLog(null);
        }}
      >
        {selectedLog ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card>
              <Descriptions
                column={1}
                data={[
                  { label: '日志 ID', value: selectedLog.id },
                  { label: '操作人', value: selectedLog.operatorId },
                  { label: '角色', value: renderRole(selectedLog.operatorRole) },
                  { label: '动作', value: selectedLog.action },
                  {
                    label: '对象',
                    value: `${selectedLog.targetType} / ${selectedLog.targetId}`,
                  },
                  { label: '发生时间', value: formatDateTime(selectedLog.createdAt) },
                ]}
              />
            </Card>
            <Card>
              <Descriptions
                column={1}
                data={[
                  { label: 'IP', value: selectedLog.ip || '--' },
                  { label: '设备信息', value: selectedLog.userAgent || '--' },
                  {
                    label: '详情摘要',
                    value: formatPayloadSummary(selectedLog.payload),
                  },
                ]}
              />
            </Card>
            <Card>
              <Typography.Paragraph style={{ marginBottom: 8 }}>
                记录原文
              </Typography.Paragraph>
              <Typography.Paragraph
                code
                style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}
              >
                {selectedLog.payload
                  ? JSON.stringify(selectedLog.payload, null, 2)
                  : '无详情记录'}
              </Typography.Paragraph>
            </Card>
          </Space>
        ) : (
          <AppState
            status="empty"
            title="暂无日志详情"
            subtitle="请返回列表后重新选择一条日志。"
          />
        )}
      </Drawer>
    </AppPage>
  );
}
