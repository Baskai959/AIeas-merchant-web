import React, { useEffect, useState } from 'react';
import { Button, Tag, Space } from '@arco-design/web-react';
import { AuctionLot, AuctionStatus } from '@/services/auctions';
import SafeImage from '../SafeImage';
import {
  canRestartAuctionAfterCancel,
  formatAuctionCategory,
  formatCapPrice,
  formatDateTime,
  formatIncrementRuleSummary,
  formatMoneyCent,
  isAuctionSuccessful,
} from '@/modules/auctions/utils';
import styles from './index.module.less';

export interface AuctionLotCardProps {
  index: number;
  lot: AuctionLot;
  isLive: boolean;
  isActive: boolean;
  disableStart?: boolean;
  disableStartReason?: string;
  disableDetach?: boolean;
  disableDetachReason?: string;
  onStart?: () => void;
  onCancelExplain?: () => void;
  onDetach?: () => void;
  onAttach?: () => void;
  onMore?: () => void;
  onProduct?: () => void;
  onExplain?: () => void;
}

const DEFAULT_TAGS = [
  { label: '晚发即赔', color: '#FF7D00', bg: '#FFF7E8' },
  { label: '包退', color: '#168CFF', bg: '#E8F3FF' },
  { label: '运费险', color: '#00B42A', bg: '#E8FFEA' },
  { label: '竞拍', color: '#F53F3F', bg: '#FFECE8' },
];

function getLotImage(lot: AuctionLot) {
  return lot.coverUrl || lot.imageUrls?.[0];
}

function deriveTags() {
  return DEFAULT_TAGS;
}

function formatRemaining(ms: number) {
  if (ms <= 0) {
    return '00:00:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

const ACTIVE_STATUSES: AuctionStatus[] = [
  'RUNNING',
  'EXTENDED',
  'HAMMER_PENDING',
];

const CLOSED_STATUSES: AuctionStatus[] = [
  'CLOSED_WON',
  'SETTLED',
  'CLOSED_FAILED',
];

export default function AuctionLotCard(props: AuctionLotCardProps) {
  const {
    index,
    lot,
    isLive,
    isActive,
    disableStart,
    disableStartReason,
    disableDetach,
    disableDetachReason,
    onStart,
    onCancelExplain,
    onDetach,
    onAttach,
    onMore,
    onProduct,
    onExplain,
  } = props;

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  const isClosed = CLOSED_STATUSES.includes(lot.status);
  const isSuccessful = isAuctionSuccessful(lot.status);
  const isScheduled = lot.status === 'WARMING_UP' && !isActive;
  const canRestart = canRestartAuctionAfterCancel(lot.status);
  const canShowStartAction =
    !!onStart && !isActive && !isSuccessful && !isScheduled;
  const showLiveBadge = isActive || ACTIVE_STATUSES.includes(lot.status);
  const showScheduledBadge = isScheduled && !showLiveBadge;
  const showDoneBadge = isClosed && !showLiveBadge;
  const doneBadgeText = lot.status === 'CLOSED_FAILED' ? '已取消' : '已成交';

  const incrementDisplay = formatIncrementRuleSummary(lot.incrementRule);

  const capPriceDisplay = formatCapPrice(lot.capPrice);
  const startPriceDisplay = formatMoneyCent(lot.startPrice);

  const dealOrCurrent = (() => {
    if (lot.status === 'CLOSED_WON' || lot.status === 'SETTLED') {
      return {
        label: '成交金额',
        value: formatMoneyCent(lot.dealPrice),
      };
    }
    if (isActive) {
      return {
        label: '当前出价',
        value: formatMoneyCent(
          lot.currentPrice ?? lot.dealPrice ?? lot.startPrice
        ),
      };
    }
    return { label: '当前出价', value: '--' };
  })();

  const bidCount = lot.bidCount ?? 0;
  const tags = deriveTags();
  const imageUrl = getLotImage(lot);
  const title = lot.title || '未命名拍品';
  const sellPoint = lot.subtitle?.trim() || lot.description?.trim() || '暂未填写拍品卖点';

  const remainingText = (() => {
    if (!isActive || !lot.endTime) {
      return '';
    }
    return formatRemaining(new Date(lot.endTime).getTime() - now);
  })();
  const scheduledText =
    isScheduled && lot.startTime ? `预约 ${formatDateTime(lot.startTime)}` : '';

  return (
    <div className={styles.card}>
      <div className={styles.left}>
        <div className={styles.indexBox}>
          {String(index + 1).padStart(2, '0')}
        </div>
        <div className={styles.imageWrapper}>
          <SafeImage
            src={imageUrl}
            alt={title}
            className={styles.image}
            width={80}
            height={80}
          />
          {showLiveBadge ? (
            <div className={`${styles.statusBadge} ${styles.badgeLive}`}>
              讲解中
            </div>
          ) : showScheduledBadge ? (
            <div className={`${styles.statusBadge} ${styles.badgeScheduled}`}>
              已预约
            </div>
          ) : showDoneBadge ? (
            <div className={`${styles.statusBadge} ${styles.badgeDone}`}>
              {doneBadgeText}
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.middle}>
          <div className={styles.title} title={title}>
            {title}
          </div>
          <div className={styles.id}>{formatAuctionCategory(lot.category) || '直播拍品'}</div>
          <div className={styles.tagRow}>
            {tags.map((tag) => (
              <span
                key={tag.label}
                className={styles.tag}
                style={{
                  color: tag.color,
                  borderColor: tag.color,
                  backgroundColor: tag.bg,
                }}
              >
                {tag.label}
              </span>
            ))}
          </div>
          <div className={styles.sellPoint}>
            <span className={styles.sellPointLabel}>卖点</span>
            {sellPoint}
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.rightCol}>
            <div className={styles.colLabel}>起拍价</div>
            <div className={styles.colValue}>{startPriceDisplay}</div>
          </div>
          <div className={styles.rightCol}>
            <div className={styles.colLabel}>加价规则</div>
            <div className={styles.colValue}>{incrementDisplay}</div>
          </div>
          <div className={styles.rightCol}>
            <div className={styles.colLabel}>封顶价</div>
            <div className={styles.colValue}>{capPriceDisplay}</div>
          </div>
          <div className={styles.rightCol}>
            <div className={styles.colLabel}>{dealOrCurrent.label}</div>
            <div className={styles.colValue}>{dealOrCurrent.value}</div>
          </div>
          <div className={styles.rightCol}>
            <div className={styles.colLabel}>出价次数</div>
            <div className={styles.colValue}>{bidCount}</div>
            {isActive && remainingText ? (
              <div className={styles.colCountdown}>竞拍中 {remainingText}</div>
            ) : scheduledText ? (
              <div className={styles.colCountdown}>{scheduledText}</div>
            ) : null}
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        {isLive ? (
          <Space>
            <Button size="small" onClick={onProduct}>
              拍品
            </Button>
            {isActive ? (
              <Tag color="red">竞拍中</Tag>
            ) : isScheduled ? (
              <Tag color="purple">已预约</Tag>
            ) : isSuccessful ? (
              <Tag color="green">已成交</Tag>
            ) : canShowStartAction ? (
              <Button
                size="small"
                type="primary"
                disabled={!!disableStart}
                title={disableStart ? disableStartReason : undefined}
                onClick={onStart}
              >
                {canRestart ? '重新开拍' : '开拍'}
              </Button>
            ) : null}
            {isActive || isScheduled ? (
              <Button size="small" onClick={onCancelExplain}>
                {isScheduled ? '取消预约' : '取消讲解'}
              </Button>
            ) : isSuccessful ? null : (
              <Button
                size="small"
                status="danger"
                disabled={!!disableDetach}
                title={disableDetach ? disableDetachReason : undefined}
                onClick={onDetach}
              >
                下架
              </Button>
            )}
            {canShowStartAction && canRestart ? (
              <Tag color="orange">可重新开拍</Tag>
            ) : null}
            {onExplain ? (
              <Button size="small" onClick={onExplain}>
                讲解
              </Button>
            ) : null}
            {onMore ? (
              <Button size="small" onClick={onMore}>
                更多
              </Button>
            ) : null}
          </Space>
        ) : (
          <Space>
            <Button size="small" onClick={onProduct}>
              拍品
            </Button>
            <Button size="small" type="primary" onClick={onAttach}>
              上架到直播间
            </Button>
            {onMore ? (
              <Button size="small" onClick={onMore}>
                更多
              </Button>
            ) : null}
          </Space>
        )}
      </div>
    </div>
  );
}
