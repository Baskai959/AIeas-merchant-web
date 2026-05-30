import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { FormInstance } from '@arco-design/web-react/es/Form';
import { useHistory } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import SafeImage from '@/components/SafeImage';
import { AuctionLot, AuctionStatus, listAuctions } from '@/services/auctions';
import { fetchItem, Item } from '@/services/items';
import {
  attachAuctionToLiveRoom,
  detachAuctionFromLiveRoom,
} from '@/services/liveRoom';
import {
  AUCTION_STATUS_OPTIONS,
  buildIdempotencyKey,
  canAttachAuctionToLiveRoom,
  canDetachAuctionFromLiveRoom,
  canEditAuctionRules,
  formatDateTime,
  formatMoneyCent,
  renderAuctionStatusTag,
} from './utils';
import styles from '../management.module.less';

interface AuctionFilters {
  category?: string;
  status?: AuctionStatus;
  timeSort?: AuctionTimeSort;
}

interface PaginationState {
  current: number;
  pageSize: number;
  total: number;
}

type AuctionTimeSort =
  | 'createdDesc'
  | 'createdAsc'
  | 'updatedDesc'
  | 'updatedAsc'
  | 'startDesc'
  | 'startAsc';

const DEFAULT_AUCTION_FILTERS: AuctionFilters = {
  timeSort: 'createdDesc',
};

const MAX_LIST_FETCH_COUNT = 1000;
const LIST_FETCH_PAGE_SIZE = 100;

const AUCTION_TIME_SORT_OPTIONS: Array<{
  label: string;
  value: AuctionTimeSort;
}> = [
  { label: '创建时间最新', value: 'createdDesc' },
  { label: '创建时间最早', value: 'createdAsc' },
  { label: '更新时间最新', value: 'updatedDesc' },
  { label: '更新时间最早', value: 'updatedAsc' },
  { label: '开拍时间最近', value: 'startDesc' },
  { label: '开拍时间最早', value: 'startAsc' },
];

function getTimeValue(value?: string | null) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getAuctionTimeValue(auction: AuctionLot, sort: AuctionTimeSort) {
  if (sort.startsWith('start')) {
    return getTimeValue(auction.startTime);
  }
  if (sort.startsWith('updated')) {
    return getTimeValue(auction.updatedAt);
  }
  return getTimeValue(auction.createdAt);
}

function sortAuctionsByTime(
  list: AuctionLot[],
  sort: AuctionTimeSort = 'createdDesc'
) {
  const sortedList = [...list];
  sortedList.sort((left, right) => {
    const leftValue = getAuctionTimeValue(left, sort);
    const rightValue = getAuctionTimeValue(right, sort);
    return sort.endsWith('Asc')
      ? leftValue - rightValue
      : rightValue - leftValue;
  });
  return sortedList;
}

function paginateAuctions(
  list: AuctionLot[],
  pagination: Pick<PaginationState, 'current' | 'pageSize'>
) {
  const start = (pagination.current - 1) * pagination.pageSize;
  return list.slice(start, start + pagination.pageSize);
}

export default function AuctionListPage() {
  const history = useHistory();
  const filterFormRef = useRef<FormInstance>();
  const [auctions, setAuctions] = useState<AuctionLot[]>([]);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<AuctionFilters>(
    DEFAULT_AUCTION_FILTERS
  );
  const [pagination, setPagination] = useState<PaginationState>({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  const [attachLoading, setAttachLoading] = useState(false);

  const hasFilters = useMemo(() => {
    return !!(
      filters.category ||
      filters.status ||
      filters.timeSort !== DEFAULT_AUCTION_FILTERS.timeSort
    );
  }, [filters]);

  async function fetchAllAuctions(nextFilters: AuctionFilters) {
    const resultAuctions: AuctionLot[] = [];
    let offset = 0;

    while (offset < MAX_LIST_FETCH_COUNT) {
      const result = await listAuctions({
        status: nextFilters.status || undefined,
        limit: LIST_FETCH_PAGE_SIZE,
        offset,
      });
      const nextAuctions = result.auctions || [];
      resultAuctions.push(...nextAuctions);
      if (nextAuctions.length < LIST_FETCH_PAGE_SIZE) {
        break;
      }
      offset += LIST_FETCH_PAGE_SIZE;
    }

    return resultAuctions;
  }

  async function fetchAuctionItems(nextAuctions: AuctionLot[]) {
    const itemIds = Array.from(
      new Set(
        nextAuctions
          .map((auction) => auction.itemId)
          .filter((itemId) => itemId !== undefined && itemId !== null)
          .map(String)
      )
    );
    const missingItemIds = itemIds.filter((itemId) => !items[itemId]);
    const itemResults = await Promise.all(
      missingItemIds.map((itemId) => fetchItem(itemId).catch(() => undefined))
    );
    const nextItems = { ...items };
    itemResults.forEach((item) => {
      if (item) {
        nextItems[String(item.id)] = item;
      }
    });
    setItems(nextItems);
    return nextItems;
  }

  function filterAuctionsByCategory(
    nextAuctions: AuctionLot[],
    nextItems: Record<string, Item>,
    category?: string
  ) {
    const normalizedCategory = category?.trim().toLowerCase();
    if (!normalizedCategory) {
      return nextAuctions;
    }
    return nextAuctions.filter((auction) =>
      nextItems[String(auction.itemId)]?.category
        ?.toLowerCase()
        .includes(normalizedCategory)
    );
  }

  async function loadAuctionList(
    nextFilters: AuctionFilters = filters,
    nextPagination: PaginationState = pagination
  ) {
    setLoading(true);
    setLoadError('');
    try {
      const nextAuctions = await fetchAllAuctions(nextFilters);
      const nextItems = await fetchAuctionItems(nextAuctions);
      const filteredAuctions = filterAuctionsByCategory(
        nextAuctions,
        nextItems,
        nextFilters.category
      );
      const sortedAuctions = sortAuctionsByTime(
        filteredAuctions,
        nextFilters.timeSort
      );
      setAuctions(paginateAuctions(sortedAuctions, nextPagination));
      setPagination((prev) => ({
        ...prev,
        ...nextPagination,
        total: sortedAuctions.length,
      }));
    } catch (error) {
      setLoadError('拍品列表加载失败，请检查筛选条件或稍后重试。');
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAuctionList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(values: AuctionFilters) {
    const nextFilters: AuctionFilters = {
      category: values.category?.trim() || undefined,
      status: values.status || undefined,
      timeSort: values.timeSort || DEFAULT_AUCTION_FILTERS.timeSort,
    };
    const nextPagination: PaginationState = {
      ...pagination,
      current: 1,
    };
    setFilters(nextFilters);
    setPagination(nextPagination);
    loadAuctionList(nextFilters, nextPagination);
  }

  function handleReset() {
    filterFormRef.current?.resetFields();
    filterFormRef.current?.setFieldsValue(DEFAULT_AUCTION_FILTERS);
    const nextFilters = { ...DEFAULT_AUCTION_FILTERS };
    const nextPagination: PaginationState = {
      ...pagination,
      current: 1,
    };
    setFilters(nextFilters);
    setPagination(nextPagination);
    loadAuctionList(nextFilters, nextPagination);
  }

  function handlePaginationChange(current: number, pageSize: number) {
    const nextPagination: PaginationState = {
      ...pagination,
      current,
      pageSize,
    };
    setPagination(nextPagination);
    loadAuctionList(filters, nextPagination);
  }

  async function handleAttach(record: AuctionLot) {
    setAttachLoading(true);
    try {
      await attachAuctionToLiveRoom(
        record.auctionId,
        buildIdempotencyKey('live-room-attach', record.auctionId)
      );
      Message.success('已上架到直播间');
      loadAuctionList();
    } catch (error) {
      // 已提示
    } finally {
      setAttachLoading(false);
    }
  }

  async function handleDetach(record: AuctionLot) {
    if (!record.liveRoomId) {
      return;
    }
    if (!canDetachAuctionFromLiveRoom(record.status)) {
      Message.warning('已成交拍品已计入直播交易，不能下架。');
      return;
    }
    Modal.confirm({
      title: '下架拍品',
      content: '确定将该拍品从直播间下架吗？',
      okText: '下架',
      cancelText: '取消',
      onOk: async () => {
        try {
          await detachAuctionFromLiveRoom(
            record.liveRoomId!,
            record.auctionId,
            buildIdempotencyKey(
              'live-room-detach',
              `${record.liveRoomId}-${record.auctionId}`
            )
          );
          Message.success('已从直播间下架');
          loadAuctionList();
        } catch (error) {
          // 已提示
        }
      },
    });
  }

  const columns = [
    {
      title: '拍品',
      dataIndex: 'auctionId',
      width: 330,
      render: (_: unknown, record: AuctionLot) => {
        const item = items[String(record.itemId)];
        return (
          <div className={styles.entityCell}>
            <SafeImage
              src={item?.images?.[0]}
              alt={item?.title || '拍品'}
              className={styles.entityImage}
              width={64}
              height={64}
            />
            <Space direction="vertical" size={6}>
              <Typography.Text className={styles.entityTitle} ellipsis>
                {item?.title || '未命名拍品'}
              </Typography.Text>
              <div className={styles.entityMeta}>
                <span>{item?.category || '未分类'}</span>
                <span>{item?.brand || '未填写品牌'}</span>
                {record.liveRoomId ? (
                  <Tag color="green">已上架直播间</Tag>
                ) : (
                  <Tag>未上架</Tag>
                )}
              </div>
            </Space>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 140,
      render: (value: AuctionStatus) => renderAuctionStatusTag(value),
    },
    {
      title: '起拍价',
      dataIndex: 'startPrice',
      width: 120,
      render: (value: number) => formatMoneyCent(value),
    },
    {
      title: '封顶价',
      dataIndex: 'capPrice',
      width: 120,
      render: (value: number) => formatMoneyCent(value),
    },
    {
      title: '保证金',
      dataIndex: 'depositAmount',
      width: 120,
      render: (value: number) => formatMoneyCent(value),
    },
    {
      title: '开拍时间',
      dataIndex: 'startTime',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      dataIndex: 'operations',
      width: 260,
      render: (_: unknown, record: AuctionLot) => (
        <Space>
          <Button
            type="text"
            onClick={() => history.push(`/auctions/${record.auctionId}`)}
          >
            查看
          </Button>
          <Button
            type="text"
            disabled={!canEditAuctionRules(record.status)}
            onClick={() => history.push(`/auctions/${record.auctionId}/edit`)}
          >
            编辑
          </Button>
          {record.liveRoomId ? (
            canDetachAuctionFromLiveRoom(record.status) ? (
              <Button
                type="text"
                status="warning"
                onClick={() => handleDetach(record)}
              >
                下架
              </Button>
            ) : (
              <Tag color="green">已成交留档</Tag>
            )
          ) : (
            <Button
              type="text"
              disabled={!canAttachAuctionToLiveRoom(record.status)}
              loading={attachLoading}
              onClick={() => handleAttach(record)}
            >
              上架到直播间
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <AppPage
      title="拍品管理"
      extra={
        <Space>
          <Button onClick={() => loadAuctionList(filters, pagination)}>
            刷新列表
          </Button>
          <Button
            type="primary"
            onClick={() => history.push('/auctions/create')}
          >
            创建拍品
          </Button>
        </Space>
      }
    >
      <Card className={styles.filterCard}>
        <Form
          ref={filterFormRef}
          layout="inline"
          initialValues={DEFAULT_AUCTION_FILTERS}
          onSubmit={handleSearch}
        >
          <Form.Item field="category" label="类目">
            <Input
              allowClear
              placeholder="输入商品类目"
              style={{ width: 220 }}
            />
          </Form.Item>
          <Form.Item field="status" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              options={AUCTION_STATUS_OPTIONS}
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item field="timeSort" label="时间排序">
            <Select
              options={AUCTION_TIME_SORT_OPTIONS}
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
            title="拍品列表加载失败"
            subtitle={loadError}
            actionText="重新加载"
            onAction={() => loadAuctionList(filters, pagination)}
          />
        ) : !loading && auctions.length === 0 ? (
          <AppState
            status="empty"
            title={hasFilters ? '未找到匹配拍品' : '暂无拍品'}
            subtitle={
              hasFilters
                ? '可以调整类目、状态或时间排序后重试。'
                : '先基于商品创建拍品，再上架到直播间开拍。'
            }
            actionText={hasFilters ? '清空筛选' : '创建拍品'}
            onAction={
              hasFilters
                ? handleReset
                : () => {
                    history.push('/auctions/create');
                  }
            }
          />
        ) : (
          <Table
            rowKey="auctionId"
            columns={columns}
            data={auctions}
            loading={loading}
            scroll={{ x: 1100 }}
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
    </AppPage>
  );
}
