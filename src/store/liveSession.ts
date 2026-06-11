import { create } from 'zustand';
import { Message } from '@arco-design/web-react';
import { AuctionLot, listAuctions } from '@/services/auctions';
import {
  LiveSession,
  LiveSessionPatchRequest,
  LiveSessionStatus,
  activateLiveSessionAuction,
  attachAuctionToLiveSession,
  deactivateLiveSessionAuction,
  detachAuctionFromLiveSession,
  endLiveSession,
  fetchLiveSession,
  listLiveSessionLots,
  patchLiveSession,
  startLiveSession,
} from '@/services/liveSession';
import { buildIdempotencyKey } from '@/modules/auctions/utils';
import {
  buildAuctionTiming,
  normalizeAuctionDurationMinutes,
} from '@/modules/live-sessions/constants';

interface ActivateAuctionOptions {
  durationMinutes: number;
  startTime?: string;
}

interface LiveSessionStoreState {
  currentRoom?: LiveSession;
  lots: AuctionLot[];
  pendingAuctions: AuctionLot[];
  loading: boolean;
  pendingLoading: boolean;
  error?: string;

  loadRoom: (id: string | number) => Promise<LiveSession | undefined>;
  setCurrentRoom: (room?: LiveSession) => void;
  loadLots: (id: string | number) => Promise<AuctionLot[]>;
  loadPendingAuctions: (currentSellerId?: string) => Promise<AuctionLot[]>;
  attach: (
    roomId: string | number,
    auctionId: string | number
  ) => Promise<boolean>;
  detach: (
    roomId: string | number,
    auctionId: string | number
  ) => Promise<boolean>;
  activate: (
    roomId: string | number,
    auctionId: string | number,
    options: ActivateAuctionOptions
  ) => Promise<LiveSession | undefined>;
  deactivate: (roomId: string | number) => Promise<LiveSession | undefined>;
  cancelExplain: (roomId: string | number) => Promise<LiveSession | undefined>;
  setStatus: (
    roomId: string | number,
    status: LiveSessionStatus,
    extra?: LiveSessionPatchRequest
  ) => Promise<LiveSession | undefined>;
  reset: () => void;
}

export const useLiveSessionStore = create<LiveSessionStoreState>(
  (set, get) => ({
    currentRoom: undefined,
    lots: [],
    pendingAuctions: [],
    loading: false,
    pendingLoading: false,
    error: undefined,

    setCurrentRoom(room) {
      set({ currentRoom: room });
    },

    async loadRoom(id) {
      set({ loading: true, error: undefined });
      try {
        const room = await fetchLiveSession(id);
        set({ currentRoom: room });
        return room;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '直播间加载失败';
        set({ error: message });
        return undefined;
      } finally {
        set({ loading: false });
      }
    },

    async loadLots(id) {
      set({ loading: true });
      try {
        const result = await listLiveSessionLots(id);
        const lots = result?.lots || [];
        set({ lots });
        return lots;
      } catch (error) {
        set({ lots: [] });
        return [];
      } finally {
        set({ loading: false });
      }
    },

    async loadPendingAuctions(currentSellerId) {
      set({ pendingLoading: true });
      try {
        const result = await listAuctions({ status: 'READY' });
        const list = (result.auctions || []).filter((lot) => {
          const liveSessionId = Number(lot.liveSessionId || 0);
          if (liveSessionId !== 0) {
            return false;
          }
          if (currentSellerId && lot.sellerId !== currentSellerId) {
            return false;
          }
          return true;
        });
        set({ pendingAuctions: list });
        return list;
      } catch (error) {
        set({ pendingAuctions: [] });
        return [];
      } finally {
        set({ pendingLoading: false });
      }
    },

    async attach(roomId, auctionId) {
      try {
        await attachAuctionToLiveSession(
          roomId,
          auctionId,
          buildIdempotencyKey('live-session-attach', auctionId)
        );
        Message.success('已上架到直播间');
        await Promise.all([
          get().loadLots(roomId),
          get().loadPendingAuctions(),
        ]);
        return true;
      } catch (error) {
        return false;
      }
    },

    async detach(roomId, auctionId) {
      try {
        await detachAuctionFromLiveSession(
          roomId,
          auctionId,
          buildIdempotencyKey('live-session-detach', `${roomId}-${auctionId}`)
        );
        Message.success('已下架');
        await Promise.all([
          get().loadLots(roomId),
          get().loadPendingAuctions(),
        ]);
        return true;
      } catch (error) {
        return false;
      }
    },

    async activate(roomId, auctionId, options) {
      try {
        const nextDurationMinutes =
          normalizeAuctionDurationMinutes(options.durationMinutes);
        const timing = buildAuctionTiming(nextDurationMinutes);
        await activateLiveSessionAuction(
          roomId,
          {
            auctionId,
            durationSec: timing.durationSec,
            startTime: options.startTime,
          },
          buildIdempotencyKey('live-session-activate', auctionId)
        );
        const result = await get().loadRoom(roomId);
        Message.success(options.startTime ? '已预约开拍' : '已开拍');
        await get().loadLots(roomId);
        return result;
      } catch (error) {
        return undefined;
      }
    },

    async deactivate(roomId) {
      try {
        const hadScheduledLot = get().lots.some(
          (lot) => lot.status === 'WARMING_UP'
        );
        const result = await deactivateLiveSessionAuction(
          roomId,
          buildIdempotencyKey('live-session-deactivate', roomId)
        );
        set({ currentRoom: result });
        Message.success(hadScheduledLot ? '已取消预约' : '已取消讲解');
        await get().loadLots(roomId);
        return result;
      } catch (error) {
        return undefined;
      }
    },

    async cancelExplain(roomId) {
      try {
        const hadScheduledLot = get().lots.some(
          (lot) => lot.status === 'WARMING_UP'
        );
        const result = await deactivateLiveSessionAuction(
          roomId,
          buildIdempotencyKey('live-session-deactivate', roomId)
        );
        set({ currentRoom: result });
        Message.success(
          hadScheduledLot
            ? '已取消预约，可重新开拍或下架'
            : '已取消讲解，可重新开拍或下架'
        );
        await get().loadLots(roomId);
        return result;
      } catch (error) {
        return undefined;
      }
    },

    async setStatus(roomId, status, extra) {
      try {
        let result: LiveSession;
        if (extra && Object.keys(extra).length > 0) {
          await patchLiveSession(
            roomId,
            extra,
            buildIdempotencyKey('live-session-patch', roomId)
          );
        }
        if (status === 'LIVE') {
          result = await startLiveSession(
            roomId,
            buildIdempotencyKey('live-session-start', roomId)
          );
        } else if (status === 'ENDED') {
          result = await endLiveSession(
            roomId,
            buildIdempotencyKey('live-session-end', roomId)
          );
        } else {
          result = await patchLiveSession(
            roomId,
            { status, ...(extra || {}) },
            buildIdempotencyKey('live-session-patch-status', roomId)
          );
        }
        set({ currentRoom: result });
        return result;
      } catch (error) {
        return undefined;
      }
    },

    reset() {
      set({
        currentRoom: undefined,
        lots: [],
        pendingAuctions: [],
        loading: false,
        pendingLoading: false,
        error: undefined,
      });
    },
  })
);
