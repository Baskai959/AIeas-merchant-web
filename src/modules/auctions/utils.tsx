import React from 'react';
import { Space, Tag, Typography } from '@arco-design/web-react';
import { AuctionIncrementRule, AuctionStatus } from '@/services/auctions';

type NormalizedIncrementRule = Record<string, unknown> & {
  type?: string;
  amount?: number;
  maxBidSteps?: number;
  steps?: unknown[];
};

export const AUCTION_STATUS_OPTIONS: Array<{
  label: string;
  value: AuctionStatus;
}> = [
  { label: '草稿', value: 'DRAFT' },
  { label: '待审核', value: 'PENDING_AUDIT' },
  { label: '审核未通过', value: 'AUDIT_REJECTED' },
  { label: '待开拍', value: 'READY' },
  { label: '预热中', value: 'WARMING_UP' },
  { label: '竞拍中', value: 'RUNNING' },
  { label: '延时中', value: 'EXTENDED' },
  { label: '待落锤', value: 'HAMMER_PENDING' },
  { label: '已成交', value: 'CLOSED_WON' },
  { label: '已流拍', value: 'CLOSED_FAILED' },
  { label: '已结算', value: 'SETTLED' },
];

export const AUCTION_CATEGORY_OPTIONS = [
  { label: '珠宝玉石', value: 'jewelry' },
  { label: '腕表钟表', value: 'watch' },
  { label: '工艺收藏', value: 'craft' },
  { label: '潮流配饰', value: 'fashion' },
  { label: '茶酒滋补', value: 'tea' },
  { label: '数码潮玩', value: 'digital' },
  { label: '书画篆刻', value: 'painting' },
  { label: '瓷器陶艺', value: 'ceramic' },
  { label: '名酒陈酿', value: 'wine' },
  { label: '箱包皮具', value: 'bag' },
  { label: '钱币邮票', value: 'coin' },
  { label: '古典家具', value: 'furniture' },
  { label: '影像器材', value: 'camera' },
  { label: '乐器音响', value: 'music' },
  { label: '户外收藏', value: 'outdoor' },
];

export type AuctionCategoryOption = (typeof AUCTION_CATEGORY_OPTIONS)[number];

export function normalizeAuctionCategory(
  value?: string | null,
  options: AuctionCategoryOption[] = AUCTION_CATEGORY_OPTIONS
) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return '';
  }
  const category = options.find(
    (item) => item.value === normalizedValue || item.label === normalizedValue
  );
  return category?.value || normalizedValue;
}

export function formatAuctionCategory(
  value?: string | null,
  options: AuctionCategoryOption[] = AUCTION_CATEGORY_OPTIONS
) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return '';
  }
  const category = options.find(
    (item) => item.value === normalizedValue || item.label === normalizedValue
  );
  return category?.label || normalizedValue;
}

export const AUCTION_EDITABLE_STATUS: AuctionStatus[] = [
  'DRAFT',
  'PENDING_AUDIT',
  'AUDIT_REJECTED',
  'READY',
];

const AUCTION_STATUS_COLOR_MAP: Record<AuctionStatus, string> = {
  DRAFT: 'gray',
  PENDING_AUDIT: 'orange',
  AUDIT_REJECTED: 'red',
  READY: 'arcoblue',
  WARMING_UP: 'purple',
  RUNNING: 'green',
  EXTENDED: 'cyan',
  HAMMER_PENDING: 'gold',
  CLOSED_WON: 'lime',
  CLOSED_FAILED: 'orangered',
  SETTLED: 'blue',
};

const AUCTION_STATUS_LABEL_MAP: Record<AuctionStatus, string> = {
  DRAFT: '草稿',
  PENDING_AUDIT: '待审核',
  AUDIT_REJECTED: '审核未通过',
  READY: '待开拍',
  WARMING_UP: '预热中',
  RUNNING: '竞拍中',
  EXTENDED: '延时中',
  HAMMER_PENDING: '待落锤',
  CLOSED_WON: '已成交',
  CLOSED_FAILED: '已流拍',
  SETTLED: '已结算',
};

export function canEditAuctionRules(status?: AuctionStatus) {
  return !!status && AUCTION_EDITABLE_STATUS.includes(status);
}

export function canAttachAuctionToLiveSession(status?: AuctionStatus) {
  return status === 'READY';
}

export function isAuctionSuccessful(status?: AuctionStatus) {
  return status === 'CLOSED_WON' || status === 'SETTLED';
}

export function isAuctionLiveInProgress(status?: AuctionStatus) {
  return (
    status === 'RUNNING' || status === 'EXTENDED' || status === 'HAMMER_PENDING'
  );
}

export function canDetachAuctionFromLiveSession(status?: AuctionStatus) {
  return (
    status !== 'WARMING_UP' &&
    !isAuctionSuccessful(status) &&
    !isAuctionLiveInProgress(status)
  );
}

export function canRestartAuctionAfterCancel(status?: AuctionStatus) {
  return status === 'CLOSED_FAILED';
}

export function renderAuctionStatusTag(status: AuctionStatus) {
  return (
    <Tag color={AUCTION_STATUS_COLOR_MAP[status] || 'gray'}>
      {AUCTION_STATUS_LABEL_MAP[status] || status}
    </Tag>
  );
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }
  if (value.startsWith('0001-01-01')) {
    return '-';
  }

  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return value;
  }
  if (parsedValue.getUTCFullYear() <= 1) {
    return '-';
  }

  return parsedValue.toLocaleString('zh-CN', {
    hour12: false,
  });
}

export function formatMoneyCent(value?: number | null) {
  if (value === null || value === undefined) {
    return '-';
  }

  return `¥${(value / 100).toFixed(2)}`;
}

export function formatCapPrice(value?: number | null) {
  if (value === null || value === undefined || value <= 0) {
    return '不封顶';
  }
  return formatMoneyCent(value);
}

export function yuanToCent(value?: number | string) {
  if (value === undefined || value === '') {
    return undefined;
  }

  return Math.round(Number(value) * 100);
}

export function centToYuan(value?: number | null) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return Number((value / 100).toFixed(2));
}

export function normalizeDateTime(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsedValue = new Date(value);
  if (Number.isNaN(parsedValue.getTime())) {
    return value;
  }

  return parsedValue.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeJsonRuleValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    const shouldTryParse =
      trimmedValue.startsWith('{') ||
      trimmedValue.startsWith('[') ||
      trimmedValue.startsWith('"{') ||
      trimmedValue.startsWith('"[');

    if (!shouldTryParse) {
      return value;
    }

    try {
      return normalizeJsonRuleValue(JSON.parse(trimmedValue));
    } catch (error) {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonRuleValue(item));
  }

  if (isRecord(value)) {
    return Object.entries(value).reduce<Record<string, unknown>>(
      (result, [key, item]) => ({
        ...result,
        [key]: normalizeJsonRuleValue(item),
      }),
      {}
    );
  }

  return value;
}

export function normalizeIncrementRule(
  rule?: AuctionIncrementRule | NormalizedIncrementRule | string | null
) {
  const normalizedRule = normalizeJsonRuleValue(rule);

  if (!isRecord(normalizedRule)) {
    return undefined;
  }

  return normalizedRule as NormalizedIncrementRule;
}

export function getFixedIncrementAmount(rule?: AuctionIncrementRule | string) {
  const normalizedRule = normalizeIncrementRule(rule);

  if (!normalizedRule || typeof normalizedRule.amount !== 'number') {
    return undefined;
  }

  return centToYuan(normalizedRule.amount);
}

export function getMaxBidSteps(rule?: AuctionIncrementRule | string) {
  const normalizedRule = normalizeIncrementRule(rule);

  if (!normalizedRule || typeof normalizedRule.maxBidSteps !== 'number') {
    return undefined;
  }

  return normalizedRule.maxBidSteps;
}

const INCREMENT_TYPE_LABEL_MAP: Record<string, string> = {
  fixed: '固定加价',
  FIXED: '固定加价',
  percent: '按比例加价',
  ladder: '阶梯加价',
  tiered: '阶梯加价',
  STEP: '阶梯加价',
  step: '阶梯加价',
};

const RULE_KEY_LABEL_MAP: Record<string, string> = {
  type: '加价类型',
  amount: '加价金额',
  increment: '加价幅度',
  incrementAmount: '加价金额',
  inc: '加价幅度',
  ratio: '加价比例',
  percent: '加价比例',
  step: '加价幅度',
  steps: '阶梯档位',
  tiers: '阶梯档位',
  tier: '阶梯档位',
  min: '起始价',
  max: '结束价',
  from: '起始价',
  to: '结束价',
  upTo: '截止价',
  lower: '起始价',
  upper: '结束价',
  lt: '低于价格',
  lte: '最高价',
  gt: '高于价格',
  gte: '最低价',
  threshold: '价格门槛',
  minPrice: '起始价',
  maxPrice: '结束价',
  priceFrom: '起始价',
  priceTo: '结束价',
  startPrice: '起拍价',
  reservePrice: '保留价',
  capPrice: '封顶价',
  depositAmount: '保证金',
  maxBidSteps: '单次最多加价步数',
  antiSnipingSec: '防抢拍触发窗口',
  antiExtendSec: '防抢拍延长时长',
  antiExtendMode: '防抢拍延时模式',
  startTime: '开始时间',
  endTime: '结束时间',
  durationSec: '拍卖时长',
  incrementRule: '加价规则',
  depositPolicy: '保证金规则',
  auctionType: '拍卖类型',
};

function getIncrementTypeLabel(type?: string) {
  if (!type) {
    return '-';
  }

  return (
    INCREMENT_TYPE_LABEL_MAP[type] ||
    INCREMENT_TYPE_LABEL_MAP[type.toLowerCase()] ||
    type
  );
}

function isMoneyCentKey(key: string) {
  return new Set([
    'amount',
    'increment',
    'incrementAmount',
    'inc',
    'step',
    'min',
    'max',
    'from',
    'to',
    'upTo',
    'lower',
    'upper',
    'lt',
    'lte',
    'gt',
    'gte',
    'threshold',
    'minPrice',
    'maxPrice',
    'priceFrom',
    'priceTo',
    'startPrice',
    'reservePrice',
    'capPrice',
    'depositAmount',
    'dealPrice',
    'currentPrice',
    'price',
  ]).has(key);
}

function isSecondsKey(key: string) {
  return ['antiSnipingSec', 'antiExtendSec', 'durationSec'].includes(key);
}

function isDateKey(key: string) {
  return ['startTime', 'endTime', 'closedAt'].includes(key);
}

function formatRuleValue(key: string, value: unknown): React.ReactNode {
  const normalizedValue = normalizeJsonRuleValue(value);

  if (
    normalizedValue === null ||
    normalizedValue === undefined ||
    normalizedValue === ''
  ) {
    return '-';
  }

  if (key === 'incrementRule') {
    const normalizedRule = normalizeIncrementRule(normalizedValue as any);

    if (normalizedRule) {
      return renderIncrementRule(normalizedRule);
    }
  }

  if (key === 'type' && typeof normalizedValue === 'string') {
    return getIncrementTypeLabel(normalizedValue);
  }

  if (typeof normalizedValue === 'number') {
    if (isMoneyCentKey(key)) {
      return formatMoneyCent(normalizedValue);
    }
    if (isSecondsKey(key)) {
      return `${normalizedValue} 秒`;
    }
    return String(normalizedValue);
  }

  if (typeof normalizedValue === 'string') {
    if (isDateKey(key)) {
      return formatDateTime(normalizedValue);
    }
    return normalizedValue;
  }

  if (typeof normalizedValue === 'boolean') {
    return normalizedValue ? '是' : '否';
  }

  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length === 0) {
      return '-';
    }
    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {normalizedValue.map((item, index) => (
          <Typography.Text key={`rule-array-${key}-${index}`}>
            {isRecord(item)
              ? Object.entries(item)
                  .map(
                    ([k, v]) =>
                      `${RULE_KEY_LABEL_MAP[k] || k}：${formatPlainValue(k, v)}`
                  )
                  .join('，')
              : formatPlainValue('', item)}
          </Typography.Text>
        ))}
      </Space>
    );
  }

  if (isRecord(normalizedValue)) {
    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {Object.entries(normalizedValue).map(([k, v]) => (
          <Typography.Text key={`rule-object-${key}-${k}`}>
            {RULE_KEY_LABEL_MAP[k] || k}：{formatPlainValue(k, v)}
          </Typography.Text>
        ))}
      </Space>
    );
  }

  return String(normalizedValue);
}

function formatPlainValue(key: string, value: unknown): string {
  const normalizedValue = normalizeJsonRuleValue(value);

  if (
    normalizedValue === null ||
    normalizedValue === undefined ||
    normalizedValue === ''
  ) {
    return '-';
  }
  if (typeof normalizedValue === 'number') {
    if (isMoneyCentKey(key)) {
      return formatMoneyCent(normalizedValue) || '-';
    }
    if (isSecondsKey(key)) {
      return `${normalizedValue} 秒`;
    }
    return String(normalizedValue);
  }
  if (typeof normalizedValue === 'string') {
    if (isDateKey(key)) {
      return formatDateTime(normalizedValue);
    }
    if (key === 'type') {
      return getIncrementTypeLabel(normalizedValue);
    }
    return normalizedValue;
  }
  if (typeof normalizedValue === 'boolean') {
    return normalizedValue ? '是' : '否';
  }
  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length === 0) {
      return '-';
    }
    return normalizedValue.map((item) => formatPlainValue('', item)).join('；');
  }
  if (isRecord(normalizedValue)) {
    return Object.entries(normalizedValue)
      .map(
        ([k, v]) => `${RULE_KEY_LABEL_MAP[k] || k}：${formatPlainValue(k, v)}`
      )
      .join('，');
  }
  return String(normalizedValue);
}

function sortLadderStepEntries(entries: Array<[string, unknown]>) {
  const keyOrder = [
    'min',
    'minPrice',
    'from',
    'priceFrom',
    'lower',
    'threshold',
    'max',
    'maxPrice',
    'to',
    'priceTo',
    'upTo',
    'upper',
    'lt',
    'lte',
    'amount',
    'incrementAmount',
    'increment',
    'inc',
    'step',
  ];

  return [...entries].sort(([leftKey], [rightKey]) => {
    const leftIndex = keyOrder.indexOf(leftKey);
    const rightIndex = keyOrder.indexOf(rightKey);

    return (
      (leftIndex === -1 ? keyOrder.length : leftIndex) -
      (rightIndex === -1 ? keyOrder.length : rightIndex)
    );
  });
}

function formatLadderStep(step: unknown, index: number) {
  const normalizedStep = normalizeJsonRuleValue(step);

  if (!isRecord(normalizedStep)) {
    return `档位 ${index + 1}：${formatPlainValue('', normalizedStep)}`;
  }

  return `档位 ${index + 1}：${sortLadderStepEntries(
    Object.entries(normalizedStep)
  )
    .map(
      ([key, value]) =>
        `${RULE_KEY_LABEL_MAP[key] || key}：${formatPlainValue(key, value)}`
    )
    .join('，')}`;
}

export function isLadderIncrementRule(
  rule?: AuctionIncrementRule | NormalizedIncrementRule | string | null
) {
  const normalizedRule = normalizeIncrementRule(rule);

  if (!normalizedRule) {
    return false;
  }

  const normalizedType =
    typeof normalizedRule.type === 'string'
      ? normalizedRule.type.toLowerCase()
      : '';

  return (
    ['ladder', 'tiered', 'step'].includes(normalizedType) ||
    Array.isArray(normalizedRule.steps) ||
    Array.isArray((normalizedRule as Record<string, unknown>).tiers)
  );
}

export function getIncrementRuleLadderSteps(
  rule?: AuctionIncrementRule | NormalizedIncrementRule | string | null
) {
  const normalizedRule = normalizeIncrementRule(rule);

  if (!normalizedRule) {
    return [];
  }

  const tiers = (normalizedRule as Record<string, unknown>).tiers;

  if (Array.isArray(normalizedRule.steps)) {
    return normalizedRule.steps;
  }

  if (Array.isArray(tiers)) {
    return tiers;
  }

  return [];
}

export function formatIncrementRuleSummary(
  rule?: AuctionIncrementRule | NormalizedIncrementRule | string | null
) {
  const normalizedRule = normalizeIncrementRule(rule);

  if (!normalizedRule) {
    return '-';
  }

  if (typeof normalizedRule.amount === 'number') {
    const amountText = formatMoneyCent(normalizedRule.amount);
    return typeof normalizedRule.maxBidSteps === 'number'
      ? `${amountText} / 最多 ${normalizedRule.maxBidSteps} 步`
      : amountText;
  }

  if (isLadderIncrementRule(normalizedRule)) {
    const steps = getIncrementRuleLadderSteps(normalizedRule);
    const stepText = steps.length ? `阶梯加价 ${steps.length} 档` : '阶梯加价';
    return typeof normalizedRule.maxBidSteps === 'number'
      ? `${stepText} / 最多 ${normalizedRule.maxBidSteps} 步`
      : stepText;
  }

  return getIncrementTypeLabel(normalizedRule.type);
}

export function renderIncrementRule(
  rule?: AuctionIncrementRule | NormalizedIncrementRule | string | null
) {
  const normalizedRule = normalizeIncrementRule(rule);

  if (!normalizedRule) {
    return '-';
  }

  const normalizedType =
    typeof normalizedRule.type === 'string'
      ? normalizedRule.type.toLowerCase()
      : '';

  if (normalizedType === 'fixed' || typeof normalizedRule.amount === 'number') {
    const maxBidSteps =
      typeof normalizedRule.maxBidSteps === 'number'
        ? normalizedRule.maxBidSteps
        : undefined;
    const amount = normalizedRule.amount || 0;
    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Typography.Text>固定加价</Typography.Text>
        <Typography.Text type="secondary">
          每次加价：{formatMoneyCent(amount)}
        </Typography.Text>
        {maxBidSteps !== undefined ? (
          <Typography.Text type="secondary">
            单次最高加价：{maxBidSteps} 步，最多{' '}
            {formatMoneyCent(amount * maxBidSteps)}
          </Typography.Text>
        ) : null}
      </Space>
    );
  }

  const typeLabel = isLadderIncrementRule(normalizedRule)
    ? '阶梯加价'
    : getIncrementTypeLabel(normalizedRule.type);
  const entries = Object.entries(normalizedRule).filter(
    ([key]) => key !== 'type' && key !== 'steps' && key !== 'tiers'
  );
  const steps = getIncrementRuleLadderSteps(normalizedRule);

  if (isLadderIncrementRule(normalizedRule)) {
    const maxBidSteps =
      typeof normalizedRule.maxBidSteps === 'number'
        ? normalizedRule.maxBidSteps
        : undefined;

    return (
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Typography.Text>{typeLabel}</Typography.Text>
        {maxBidSteps !== undefined ? (
          <Typography.Text type="secondary">
            单次最高加价：{maxBidSteps} 步
          </Typography.Text>
        ) : null}
        {steps.length ? (
          steps.map((step, index) => (
            <Typography.Text key={`increment-step-${index}`} type="secondary">
              {formatLadderStep(step, index)}
            </Typography.Text>
          ))
        ) : (
          <Typography.Text type="secondary">暂无阶梯档位</Typography.Text>
        )}
        {entries.map(([key, value]) => (
          <Typography.Text key={`increment-extra-${key}`} type="secondary">
            {RULE_KEY_LABEL_MAP[key] || key}：{formatPlainValue(key, value)}
          </Typography.Text>
        ))}
      </Space>
    );
  }

  if (entries.length === 0) {
    return typeLabel;
  }

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      <Typography.Text>{typeLabel}</Typography.Text>
      {entries.map(([key, value]) => (
        <Typography.Text key={`increment-field-${key}`} type="secondary">
          {RULE_KEY_LABEL_MAP[key] || key}：{formatPlainValue(key, value)}
        </Typography.Text>
      ))}
    </Space>
  );
}

export function buildIdempotencyKey(action: string, id: string | number) {
  return `${action}-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function renderReadonlyReason(status?: AuctionStatus) {
  if (!status || canEditAuctionRules(status)) {
    return null;
  }

  return (
    <Typography.Text type="secondary">
      当前状态为 {renderAuctionStatusTag(status)}
      ，拍品已开拍或进入结算，规则字段暂不可修改。
    </Typography.Text>
  );
}
