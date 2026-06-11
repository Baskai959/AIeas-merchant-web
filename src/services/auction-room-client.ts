import { readSessionSnapshot } from './http/storage';
import { buildWebSocketUrl as createWebSocketUrl } from './websocket-url';

export type AuctionRoomConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error';

export interface AuctionRoomEnvelope<T = Record<string, unknown>> {
  type: string;
  requestId?: string;
  seq?: number;
  ack?: boolean;
  payload?: T;
}

export interface AuctionRoomClientOptions {
  auctionId: string | number;
  onStatusChange?: (status: AuctionRoomConnectionStatus) => void;
  onMessage?: (message: AuctionRoomEnvelope) => void;
  onError?: (message: string) => void;
  onReconnect?: () => void;
}

const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_RECONNECT_DELAY_MS = 10000;

function buildWebSocketUrl(auctionId: string | number, lastSeq?: number) {
  const accessToken = readSessionSnapshot().tokens?.accessToken;
  return createWebSocketUrl(`auctions/${auctionId}`, {
    token: accessToken,
    lastSeq: lastSeq && lastSeq > 0 ? lastSeq : undefined,
  });
}

export default class AuctionRoomClient {
  private options: AuctionRoomClientOptions;

  private socket?: WebSocket;

  private heartbeatTimer?: number;

  private reconnectTimer?: number;

  private reconnectAttempts = 0;

  private closedByClient = false;

  private subscribed = false;

  private lastSeq = 0;

  constructor(options: AuctionRoomClientOptions) {
    this.options = options;
  }

  connect() {
    this.closedByClient = false;
    this.clearReconnectTimer();
    this.updateStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.socket = new WebSocket(buildWebSocketUrl(this.options.auctionId, this.lastSeq));
    } catch (error) {
      this.options.onError?.('实时连接创建失败');
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
      this.subscribe();
      this.startHeartbeat();
      this.options.onReconnect?.();
    };

    this.socket.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.socket.onerror = () => {
      this.updateStatus('error');
      this.options.onError?.('实时连接异常');
    };

    this.socket.onclose = () => {
      this.stopHeartbeat();
      this.socket = undefined;
      this.subscribed = false;
      if (this.closedByClient) {
        this.updateStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  disconnect() {
    this.closedByClient = true;
    this.unsubscribe();
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = undefined;
    this.updateStatus('closed');
  }

  subscribe() {
    if (this.subscribed) {
      return;
    }
    this.send({
      type: 'room.subscribe',
      requestId: this.buildRequestId('subscribe'),
      payload: {
        auctionId: this.options.auctionId,
      },
    });
    this.subscribed = true;
  }

  unsubscribe() {
    if (!this.subscribed) {
      return;
    }
    this.send({
      type: 'room.unsubscribe',
      requestId: this.buildRequestId('unsubscribe'),
      payload: {
        auctionId: this.options.auctionId,
      },
    });
    this.subscribed = false;
  }

  private send(message: AuctionRoomEnvelope) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(rawData: string) {
    try {
      const message = JSON.parse(rawData) as AuctionRoomEnvelope;
      if (typeof message.seq === 'number') {
        this.lastSeq = Math.max(this.lastSeq, message.seq);
      }
      this.options.onMessage?.(message);
    } catch (error) {
      this.options.onError?.('实时消息解析失败');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.send({
        type: 'heartbeat',
        requestId: this.buildRequestId('heartbeat'),
        payload: {
          auctionId: this.options.auctionId,
          ts: Date.now(),
        },
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempts += 1;
    this.updateStatus('reconnecting');
    const delay = Math.min(
      1000 * 2 ** Math.max(0, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );
    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private updateStatus(status: AuctionRoomConnectionStatus) {
    this.options.onStatusChange?.(status);
  }

  private buildRequestId(action: string) {
    return `${action}-${this.options.auctionId}-${Date.now()}`;
  }
}
