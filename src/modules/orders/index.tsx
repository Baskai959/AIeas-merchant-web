import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Grid,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import {
  getOrderDetail,
  listOrders,
  OrderDeal,
  OrderPayStatus,
  OrderStatus,
} from '@/services/orders';

const FormItem = Form.Item;
const Row = Grid.Row;
const Col = Grid.Col;
const PAGE_SIZE = 10;

const orderStatusOptions: Array<{ label: string; value: OrderStatus }> = [
  { label: '已创建', value: 'CREATED' },
  { label: '已支付', value: 'PAID' },
  { label: '已超时', value: 'TIMEOUT' },
  { label: '已取消', value: 'CANCELLED' },
];

const payStatusOptions: Array<{ label: string; value: OrderPayStatus }> = [
  { label: '待支付', value: 'UNPAID' },
  { label: '已支付', value: 'PAID' },
  { label: '已退款', value: 'REFUNDED' },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '请求失败，请稍后重试';
}

function formatCurrency(value?: number | string | null) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return `¥${(numericValue / 100).toFixed(2)}`;
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

function renderOrderStatus(status: OrderStatus) {
  const colorMap: Record<OrderStatus, string> = {
    CREATED: 'arcoblue',
    PAID: 'green',
    TIMEOUT: 'orange',
    CANCELLED: 'red',
  };
  const labelMap: Record<OrderStatus, string> = {
    CREATED: '已创建',
    PAID: '已支付',
    TIMEOUT: '已超时',
    CANCELLED: '已取消',
  };

  return <Tag color={colorMap[status]}>{labelMap[status]}</Tag>;
}

function renderPayStatus(status: OrderPayStatus) {
  const colorMap: Record<OrderPayStatus, string> = {
    UNPAID: 'orange',
    PAID: 'green',
    REFUNDED: 'purple',
  };
  const labelMap: Record<OrderPayStatus, string> = {
    UNPAID: '待支付',
    PAID: '已支付',
    REFUNDED: '已退款',
  };

  return <Tag color={colorMap[status]}>{labelMap[status]}</Tag>;
}

export default function OrderListPage() {
  const [winnerIdInput, setWinnerIdInput] = useState('');
  const [statusInput, setStatusInput] = useState<OrderStatus | undefined>();
  const [payStatusInput, setPayStatusInput] = useState<OrderPayStatus | undefined>();
  const [winnerId, setWinnerId] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [payStatus, setPayStatus] = useState<OrderPayStatus | undefined>();
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<OrderDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tableTotal, setTableTotal] = useState(0);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detail, setDetail] = useState<OrderDeal | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const result = await listOrders({
        winnerId: winnerId || undefined,
        status,
        payStatus,
        limit: PAGE_SIZE,
        offset,
      });
      const nextOrders = result.orders || [];
      const hasMore = nextOrders.length === PAGE_SIZE;

      setOrders(nextOrders);
      setTableTotal(offset + nextOrders.length + (hasMore ? 1 : 0));
      setError('');
    } catch (fetchError) {
      setOrders([]);
      setTableTotal(0);
      setError(getErrorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }, [page, payStatus, status, winnerId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const columns = useMemo(
    () => [
      {
        title: '订单号',
        dataIndex: 'id',
        width: 170,
      },
      {
        title: '中拍用户',
        dataIndex: 'winnerId',
        width: 140,
      },
      {
        title: '成交价',
        dataIndex: 'dealPrice',
        width: 120,
        render: (value: number | string) => formatCurrency(value),
      },
      {
        title: '保证金',
        dataIndex: 'depositAmount',
        width: 120,
        render: (value: number | string) => formatCurrency(value),
      },
      {
        title: '订单状态',
        dataIndex: 'status',
        width: 120,
        render: (value: OrderStatus) => renderOrderStatus(value),
      },
      {
        title: '支付状态',
        dataIndex: 'payStatus',
        width: 120,
        render: (value: OrderPayStatus) => renderPayStatus(value),
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: '操作',
        dataIndex: 'operations',
        width: 100,
        fixed: 'right' as const,
        render: (_: unknown, record: OrderDeal) => (
          <Button
            type="text"
            onClick={async () => {
              setDetailVisible(true);
              setDetailLoading(true);
              setDetailError('');
              try {
                const nextDetail = await getOrderDetail(record.id);
                setDetail(nextDetail);
              } catch (detailFetchError) {
                setDetail(null);
                setDetailError(getErrorMessage(detailFetchError));
              } finally {
                setDetailLoading(false);
              }
            }}
          >
            查看详情
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <AppPage title="成交订单">
      <Card style={{ marginBottom: 16 }}>
        <Form layout="inline">
          <FormItem label="订单状态">
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 160 }}
              value={statusInput}
              options={orderStatusOptions}
              onChange={(value) => setStatusInput(value as OrderStatus | undefined)}
            />
          </FormItem>
          <FormItem label="支付状态">
            <Select
              allowClear
              placeholder="全部支付状态"
              style={{ width: 160 }}
              value={payStatusInput}
              options={payStatusOptions}
              onChange={(value) => setPayStatusInput(value as OrderPayStatus | undefined)}
            />
          </FormItem>
          <FormItem label="中拍用户">
            <Input
              allowClear
              placeholder="输入中拍用户"
              style={{ width: 180 }}
              value={winnerIdInput}
              onChange={setWinnerIdInput}
            />
          </FormItem>
          <FormItem>
            <Space>
              <Button
                type="primary"
                onClick={() => {
                  setPage(1);
                  setWinnerId(winnerIdInput.trim());
                  setStatus(statusInput);
                  setPayStatus(payStatusInput);
                }}
              >
                查询
              </Button>
              <Button
                onClick={() => {
                  setWinnerIdInput('');
                  setStatusInput(undefined);
                  setPayStatusInput(undefined);
                  setWinnerId('');
                  setStatus(undefined);
                  setPayStatus(undefined);
                  setPage(1);
                }}
              >
                重置
              </Button>
            </Space>
          </FormItem>
        </Form>
      </Card>

      <Card>
        {error ? (
          <AppState
            status="500"
            title="订单列表加载失败"
            subtitle={error}
            actionText="重新加载"
            onAction={loadOrders}
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            data={orders}
            loading={loading}
            scroll={{ x: 1250 }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: tableTotal,
              sizeCanChange: false,
              onChange: (nextPage) => setPage(nextPage),
            }}
            noDataElement={
              <AppState
                status="empty"
                title="暂无成交订单"
                subtitle="当前筛选条件下没有查询到订单，可以调整状态或支付条件后重试。"
              />
            }
          />
        )}
      </Card>

      <Drawer
        width={520}
        title="订单详情"
        visible={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setDetail(null);
          setDetailError('');
        }}
        footer={null}
      >
        {detailError ? (
          <AppState
            status="500"
            title="订单详情加载失败"
            subtitle={detailError}
            actionText="关闭"
            onAction={() => setDetailVisible(false)}
          />
        ) : detailLoading ? (
          <Typography.Text type="secondary">正在加载订单详情...</Typography.Text>
        ) : detail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card>
              <Descriptions
                column={1}
                data={[
                  { label: '订单号', value: detail.id },
                  { label: '中拍用户', value: detail.winnerId },
                  { label: '订单状态', value: renderOrderStatus(detail.status) },
                  { label: '支付状态', value: renderPayStatus(detail.payStatus) },
                ]}
              />
            </Card>
            <Card>
              <Row gutter={16}>
                <Col span={12}>
                  <Descriptions
                    column={1}
                    data={[
                      { label: '成交价', value: formatCurrency(detail.dealPrice) },
                      {
                        label: '保证金金额',
                        value: formatCurrency(detail.depositAmount),
                      },
                    ]}
                  />
                </Col>
                <Col span={12}>
                  <Descriptions
                    column={1}
                    data={[
                      {
                        label: '支付截止时间',
                        value: formatDateTime(detail.payDeadline),
                      },
                      { label: '支付时间', value: formatDateTime(detail.paidAt) },
                    ]}
                  />
                </Col>
              </Row>
            </Card>
            <Card>
              <Descriptions
                column={1}
                data={[
                  { label: '创建时间', value: formatDateTime(detail.createdAt) },
                  { label: '更新时间', value: formatDateTime(detail.updatedAt) },
                  { label: '关闭时间', value: formatDateTime(detail.closedAt) },
                ]}
              />
            </Card>
          </Space>
        ) : (
          <AppState
            status="empty"
            title="暂无详情数据"
            subtitle="请返回列表后重新选择需要查看的订单。"
          />
        )}
      </Drawer>
    </AppPage>
  );
}
