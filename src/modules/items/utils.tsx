import React from 'react';
import { Link, Tag } from '@arco-design/web-react';
import { ItemConditionGrade, ItemStatus } from '@/services/items';

export const ITEM_STATUS_OPTIONS: Array<{ label: string; value: ItemStatus }> = [
  { label: '草稿', value: 'DRAFT' },
  { label: '待审核', value: 'PENDING_AUDIT' },
  { label: '待上架', value: 'READY' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '已上架', value: 'LISTED' },
  { label: '已下线', value: 'OFFLINE' },
];

export const ITEM_CONDITION_OPTIONS: Array<{
  label: string;
  value: ItemConditionGrade;
}> = [
  { label: '全新', value: 'NEW' },
  { label: '近新', value: 'LIKE_NEW' },
  { label: '良好', value: 'GOOD' },
  { label: '一般', value: 'FAIR' },
];

const ITEM_STATUS_COLOR_MAP: Record<ItemStatus, string> = {
  DRAFT: 'gray',
  PENDING_AUDIT: 'orange',
  READY: 'arcoblue',
  REJECTED: 'red',
  LISTED: 'green',
  OFFLINE: 'orangered',
};

const ITEM_STATUS_LABEL_MAP: Record<ItemStatus, string> = {
  DRAFT: '草稿',
  PENDING_AUDIT: '待审核',
  READY: '待上架',
  REJECTED: '已驳回',
  LISTED: '已上架',
  OFFLINE: '已下线',
};

const ITEM_CONDITION_LABEL_MAP: Record<ItemConditionGrade, string> = {
  NEW: '全新',
  LIKE_NEW: '近新',
  GOOD: '良好',
  FAIR: '一般',
};

export function renderItemStatusTag(status: ItemStatus) {
  return (
    <Tag color={ITEM_STATUS_COLOR_MAP[status] || 'gray'}>
      {ITEM_STATUS_LABEL_MAP[status] || status}
    </Tag>
  );
}

export function getItemConditionLabel(condition?: ItemConditionGrade) {
  if (!condition) {
    return '-';
  }

  return ITEM_CONDITION_LABEL_MAP[condition] || condition;
}

export function formatDateTime(value?: string) {
  if (!value) {
    return '-';
  }

  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return value;
  }

  return parsedValue.toLocaleString('zh-CN', {
    hour12: false,
  });
}

export function toImageText(images?: string[]) {
  return (images || []).join('\n');
}

export function parseImageText(value?: string) {
  return (value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function renderImageLinks(images?: string[]) {
  if (!images?.length) {
    return '未配置';
  }

  return (
    <>
      {images.map((image, index) => (
        <React.Fragment key={image}>
          <Link href={image} target="_blank">
            图片 {index + 1}
          </Link>
          {index < images.length - 1 ? '、' : null}
        </React.Fragment>
      ))}
    </>
  );
}
