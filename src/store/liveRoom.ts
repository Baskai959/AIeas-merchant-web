import { create } from 'zustand';
import { Message } from '@arco-design/web-react';
import { AuctionLot, listAuctions, updateAuction } from '@/services/auctions';
import {
  LiveRoom,
  LiveRoomPatchRequest,
  LiveRoomStatus,
  activateLiveRoomAuction,
  attachAuctionToLiveRoom,
  deactivateLiveRoomAuction,
  detachAuctionFromLiveRoom,
  fetchLiveRoom,
  listLiveRoomLots,
  patchLiveRoom,
} from '@/services/liveRoom';
import { buildIdempotencyKey } from '@/modules/auctions/utils';
import { buildAuctionTiming } from '@/modules/live-rooms/constants';

interface LiveRoomStoreState {
  currentRoom?: LiveRoom;
  lots: AuctionLot[];
  pendingAuctions: AuctionLot[];
  loading: boolean;
  pendingLoading: boolean;
  error?: string;

  loadRoom: (id: string | number) => Promise<LiveRoom | undefined>;
  setCurrentRoom: (room?: LiveRoom) => void;
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
    durationMinutes: number
  ) => Promise<LiveRoom | undefined>;
  deactivate: (roomId: string | number) => Promise<LiveRoom | undefined>;
  cancelExplain: (roomId: string | number) => Promise<LiveRoom | undefined>;
  setStatus: (
    roomId: string | number,
    status: LiveRoomStatus,
    extra?: LiveRoomPatchRequest
  ) => Promise<LiveRoom | undefined>;
  reset: () => void;
}

export const useLiveRoomStore = create<LiveRoomStoreState>((set, get) => ({
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
      const room = await fetchLiveRoom(id);
      set({ currentRoom: room });
      return room;
    } catch (error) {
      const message = error instanceof Error ? error.message : '直播间加载失败';
      set({ error: message });
      return undefined;
    } finally {
      set({ loading: false });
    }
  },

  async loadLots(id) {
    set({ loading: true });
    try {
      const result = await listLiveRoomLots(id);
      const lots = result?.lots || [];
      set({ lots });
      return lots;
    } catch (error) {
      // 接口尚未上线时降级：从全部拍品中按 liveRoomId 过滤
      try {
        const fallback = await listAuctions({});
        const lots = (fallback.auctions || []).filter(
          (lot) => Number(lot.liveRoomId || 0) === Number(id)
        );
        set({ lots });
        return lots;
      } catch (innerError) {
        set({ lots: [] });
        return [];
      }
    } finally {
      set({ loading: false });
    }
  },

  async loadPendingAuctions(currentSellerId) {
    set({ pendingLoading: true });
    try {
      const result = await listAuctions({ status: 'READY' });
      const list = (result.auctions || []).filter((lot) => {
        const liveRoomId = Number(lot.liveRoomId || 0);
        if (liveRoomId !== 0) {
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
      await attachAuctionToLiveRoom(
        auctionId,
        buildIdempotencyKey('live-room-attach', auctionId)
      );
      Message.success('已上架到直播间');
      await Promise.all([get().loadLots(roomId), get().loadPendingAuctions()]);
      return true;
    } catch (error) {
      return false;
    }
  },

  async detach(roomId, auctionId) {
    try {
      await detachAuctionFromLiveRoom(
        roomId,
        auctionId,
        buildIdempotencyKey('live-room-detach', `${roomId}-${auctionId}`)
      );
      Message.success('已下架');
      await Promise.all([get().loadLots(roomId), get().loadPendingAuctions()]);
      return true;
    } catch (error) {
      return false;
    }
  },

  async activate(roomId, auctionId, durationMinutes) {
    try {
      const timing = buildAuctionTiming(durationMinutes);
      await updateAuction(auctionId, {
        startTime: timing.startTime,
        endTime: timing.endTime,
        status: 'READY',
      });
      await activateLiveRoomAuction(
        roomId,
        {
          auctionId,
          durationMinutes,
          durationSec: timing.durationSec,
        },
        buildIdempotencyKey('live-room-activate', auctionId)
      );
      const result = await get().loadRoom(roomId);
      Message.success('已开拍');
      await get().loadLots(roomId);
      return result;
    } catch (error) {
      return undefined;
    }
  },

  async deactivate(roomId) {
    try {
      const result = await deactivateLiveRoomAuction(
        roomId,
        buildIdempotencyKey('live-room-deactivate', roomId)
      );
      set({ currentRoom: result });
      Message.success('已取消讲解');
      await get().loadLots(roomId);
      return result;
    } catch (error) {
      return undefined;
    }
  },

  async cancelExplain(roomId) {
    try {
      const result = await deactivateLiveRoomAuction(
        roomId,
        buildIdempotencyKey('live-room-deactivate', roomId)
      );
      set({ currentRoom: result });
      Message.success('已取消讲解，可重新开拍或下架');
      await get().loadLots(roomId);
      return result;
    } catch (error) {
      return undefined;
    }
  },

  async setStatus(roomId, status, extra) {
    try {
      const result = await patchLiveRoom(
        roomId,
        { status, ...(extra || {}) },
        buildIdempotencyKey('live-room-patch-status', roomId)
      );
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
}));
