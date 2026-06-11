import React from 'react';
import { Button, InputNumber, Space, Typography } from '@arco-design/web-react';
import {
  AUCTION_DURATION_OPTIONS,
  MAX_AUCTION_DURATION_MINUTES,
  MIN_AUCTION_DURATION_MINUTES,
  normalizeAuctionDurationMinutes,
} from './constants';
import styles from '../management.module.less';

interface AuctionDurationPickerProps {
  value: number;
  onChange: (value: number) => void;
}

export default function AuctionDurationPicker({
  value,
  onChange,
}: AuctionDurationPickerProps) {
  const normalizedValue = normalizeAuctionDurationMinutes(value);

  function handleChange(nextValue: number | undefined) {
    onChange(normalizeAuctionDurationMinutes(Number(nextValue)));
  }

  return (
    <div className={styles.durationPicker}>
      <div className={styles.durationPresetGrid}>
        {AUCTION_DURATION_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type={normalizedValue === option.value ? 'primary' : 'secondary'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className={styles.durationCustomRow}>
        <div className={styles.durationCustomText}>
          <Typography.Text className={styles.durationCustomTitle}>
            自定义时长
          </Typography.Text>
          <Typography.Text type="secondary">
            支持 {MIN_AUCTION_DURATION_MINUTES}-{MAX_AUCTION_DURATION_MINUTES}{' '}
            分钟
          </Typography.Text>
        </div>
        <Space size={8}>
          <InputNumber
            min={MIN_AUCTION_DURATION_MINUTES}
            max={MAX_AUCTION_DURATION_MINUTES}
            precision={0}
            step={1}
            value={normalizedValue}
            onChange={handleChange}
          />
          <Typography.Text type="secondary">分钟</Typography.Text>
        </Space>
      </div>
    </div>
  );
}
