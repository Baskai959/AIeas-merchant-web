import { AuctionStatus } from '@/services/auctions';

export const DEFAULT_AUCTION_DURATION_MINUTES = 10;
export const MIN_AUCTION_DURATION_MINUTES = 1;
export const MAX_AUCTION_DURATION_MINUTES = 240;

export const AUCTION_DURATION_OPTIONS = [
  { label: '5 分钟', value: 5 },
  { label: '10 分钟', value: 10 },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
];

export function normalizeAuctionDurationMinutes(durationMinutes: number) {
  if (!Number.isFinite(durationMinutes)) {
    return DEFAULT_AUCTION_DURATION_MINUTES;
  }
  return Math.min(
    MAX_AUCTION_DURATION_MINUTES,
    Math.max(MIN_AUCTION_DURATION_MINUTES, Math.floor(durationMinutes))
  );
}

export function buildAuctionTiming(durationMinutes: number) {
  const normalizedDuration = normalizeAuctionDurationMinutes(durationMinutes);
  const durationSec = normalizedDuration * 60;
  const startTime = new Date();
  startTime.setMilliseconds(0);
  const endTime = new Date(startTime.getTime() + durationSec * 1000);

  return {
    durationSec,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };
}

const ACTIVE_AUCTION_STATUSES: AuctionStatus[] = [
  'RUNNING',
  'EXTENDED',
  'HAMMER_PENDING',
];

export function isAuctionInProgress(status?: AuctionStatus) {
  return !!status && ACTIVE_AUCTION_STATUSES.includes(status);
}
