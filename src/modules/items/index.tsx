import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
} from '@arco-design/web-react';
import { FormInstance } from '@arco-design/web-react/es/Form';
import { useHistory } from 'react-router-dom';
import AppPage from '@/components/AppPage';
import AppState from '@/components/AppState';
import SafeImage from '@/components/SafeImage';
import { Item, ItemStatus, listItems } from '@/services/items';
import {
  formatDateTime,
  getItemConditionLabel,
  ITEM_STATUS_OPTIONS,
  renderItemStatusTag,
} from './utils';
import styles from '../management.module.less';

interface ItemFilters {
  category?: string;
  status?: ItemStatus;
  timeSort?: ItemTimeSort;
}

interface PaginationState {
  current: number;
  pageSize: number;
  total: number;
}

type ItemTimeSort = 'updatedDesc' | 'updatedAsc' | 'createdDesc' | 'createdAsc';

const DEFAULT_ITEM_FILTERS: ItemFilters = {
  timeSort: 'updatedDesc',
};

const MAX_LIST_FETCH_COUNT = 1000;
const LIST_FETCH_PAGE_SIZE = 100;

const ITEM_TIME_SORT_OPTIONS: Array<{ label: string; value: ItemTimeSort }> = [
  { label: '更新时间最新', value: 'updatedDesc' },
  { label: '更新时间最早', value: 'updatedAsc' },
  { label: '创建时间最新', value: 'createdDesc' },
  { label: '创建时间最早', value: 'createdAsc' },
];

function getTimeValue(value?: string) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortItemsByTime(list: Item[], sort: ItemTimeSort = 'updatedDesc') {
  const sortedList = [...list];
  sortedList.sort((left, right) => {
    const leftValue = sort.startsWith('created')
      ? getTimeValue(left.createdAt)
      : getTimeValue(left.updatedAt);
    const rightValue = sort.startsWith('created')
      ? getTimeValue(right.createdAt)
      : getTimeValue(right.updatedAt);
    return sort.endsWith('Asc')
      ? leftValue - rightValue
      : rightValue - leftValue;
  });
  return sortedList;
}

function paginateItems(
  list: Item[],
  pagination: Pick<PaginationState, 'current' | 'pageSize'>
) {
  const start = (pagination.current - 1) * pagination.pageSize;
  return list.slice(start, start + pagination.pageSize);
}

export default function ItemListPage() {
  const history = useHistory();
  const filterFormRef = useRef<FormInstance>();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<ItemFilters>(DEFAULT_ITEM_FILTERS);
  const [pagination, setPagination] = useState<PaginationState>({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  const hasFilters = useMemo(() => {
    return !!(
      filters.category ||
      filters.status ||
      filters.timeSort !== DEFAULT_ITEM_FILTERS.timeSort
    );
  }, [filters]);

  async function fetchAllItems(nextFilters: ItemFilters) {
    const resultItems: Item[] = [];
    let offset = 0;

    while (offset < MAX_LIST_FETCH_COUNT) {
      const result = await listItems({
        status: nextFilters.status || undefined,
        limit: LIST_FETCH_PAGE_SIZE,
        offset,
      });
      const nextItems = result.items || [];
      resultItems.push(...nextItems);
      if (nextItems.length < LIST_FETCH_PAGE_SIZE) {
        break;
      }
      offset += LIST_FETCH_PAGE_SIZE;
    }

    const category = nextFilters.category?.trim().toLowerCase();
    if (!category) {
      return resultItems;
    }
    return resultItems.filter((item) =>
      item.category?.toLowerCase().includes(category)
    );
  }

  async function loadItemList(
    nextFilters: ItemFilters = filters,
    nextPagination: PaginationState = pagination
  ) {
    setLoading(true);
    setLoadError('');
    try {
      const resultItems = await fetchAllItems(nextFilters);
      const sortedItems = sortItemsByTime(resultItems, nextFilters.timeSort);
      setItems(paginateItems(sortedItems, nextPagination));
      setPagination((prev) => ({
        ...prev,
        ...nextPagination,
        total: sortedItems.length,
      }));
    } catch (error) {
      setLoadError('商品列表加载失败，请检查筛选条件或稍后重试。');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItemList();
  }, []);

  function handleSearch(values: ItemFilters) {
    const nextFilters: ItemFilters = {
      category: values.category?.trim() || undefined,
      status: values.status || undefined,
      timeSort: values.timeSort || DEFAULT_ITEM_FILTERS.timeSort,
    };
    const nextPagination: PaginationState = {
      ...pagination,
      current: 1,
    };

    setFilters(nextFilters);
    setPagination(nextPagination);
    loadItemList(nextFilters, nextPagination);
  }

  function handleReset() {
    filterFormRef.current?.resetFields();
    filterFormRef.current?.setFieldsValue(DEFAULT_ITEM_FILTERS);
    const nextFilters = { ...DEFAULT_ITEM_FILTERS };
    const nextPagination: PaginationState = {
      ...pagination,
      current: 1,
    };
    setFilters(nextFilters);
    setPagination(nextPagination);
    loadItemList(nextFilters, nextPagination);
  }

  function handlePaginationChange(current: number, pageSize: number) {
    const nextPagination: PaginationState = {
      ...pagination,
      current,
      pageSize,
    };
    setPagination(nextPagination);
    loadItemList(filters, nextPagination);
  }

  const columns = [
    {
      title: '图片',
      dataIndex: 'images',
      width: 96,
      render: (_: unknown, record: Item) => (
        <SafeImage
          src={record.images?.[0]}
          alt={record.title}
          className={styles.entityImage}
          width={64}
          height={64}
        />
      ),
    },
    {
      title: '商品标题',
      dataIndex: 'title',
      render: (_: unknown, record: Item) => (
        <Space direction="vertical" size={6}>
          <Typography.Text className={styles.entityTitle} ellipsis>
            {record.title}
          </Typography.Text>
          <div className={styles.entityMeta}>
            <span>{record.brand || '未填写品牌'}</span>
            <span>{getItemConditionLabel(record.conditionGrade)}</span>
            <span>{formatDateTime(record.updatedAt)}</span>
          </div>
        </Space>
      ),
    },
    {
      title: '类目',
      dataIndex: 'category',
      width: 160,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 140,
      render: (value: ItemStatus) => renderItemStatusTag(value),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 200,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      dataIndex: 'operations',
      width: 180,
      render: (_: unknown, record: Item) => (
        <Space>
          <Button
            type="text"
            onClick={() => history.push(`/items/${record.id}`)}
          >
            查看
          </Button>
          <Button
            type="text"
            onClick={() => history.push(`/items/${record.id}/edit`)}
          >
            编辑
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <AppPage
      title="商品管理"
      extra={
        <Space>
          <Button onClick={() => loadItemList(filters, pagination)}>
            刷新列表
          </Button>
          <Button type="primary" onClick={() => history.push('/items/create')}>
            创建商品
          </Button>
        </Space>
      }
    >
      <Card className={styles.filterCard}>
        <Form
          ref={filterFormRef}
          layout="inline"
          initialValues={DEFAULT_ITEM_FILTERS}
          onSubmit={handleSearch}
        >
          <Form.Item field="category" label="类目">
            <Input
              allowClear
              placeholder="例如：数码配件"
              style={{ width: 220 }}
            />
          </Form.Item>
          <Form.Item field="status" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              options={ITEM_STATUS_OPTIONS}
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item field="timeSort" label="时间排序">
            <Select options={ITEM_TIME_SORT_OPTIONS} style={{ width: 180 }} />
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
            title="商品列表加载失败"
            subtitle={loadError}
            actionText="重新加载"
            onAction={() => loadItemList(filters, pagination)}
          />
        ) : !loading && items.length === 0 ? (
          <AppState
            status="empty"
            title={hasFilters ? '未找到匹配商品' : '暂无商品'}
            subtitle={
              hasFilters
                ? '可以调整类目或状态筛选条件后重试。'
                : '先创建商品，完善图片和描述后即可创建拍品。'
            }
            actionText={hasFilters ? '清空筛选' : '创建商品'}
            onAction={
              hasFilters
                ? handleReset
                : () => {
                    history.push('/items/create');
                  }
            }
          />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            data={items}
            loading={loading}
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
