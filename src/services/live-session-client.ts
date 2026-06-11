import { readSessionSnapshot } from './http/storage';
import { buildWebSocketUrl as createWebSocketUrl } from './websocket-url';

export type LiveSessionConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed'
  | 'error';

export interface LiveSessionEnvelope<T = Record<string, unknown>> {
  type: string;
  requestId?: string;
  seq?: number;
  ack?: boolean;
  liveSessionId?: number | string;
  payload?: T;
}

export interface LiveSessionClientOptions {
  liveSessionId: string | number;
  onStatusChange?: (status: LiveSessionConnectionStatus) => void;
  onMessage?: (message: LiveSessionEnvelope) => void;
  onError?: (message: string) => void;
  onReconnect?: () => void;
}

const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_RECONNECT_DELAY_MS = 10000;

function buildWebSocketUrl(liveSessionId: string | number, lastSeq?: number) {
  const accessToken = readSessionSnapshot().tokens?.accessToken;
  return createWebSocketUrl(`live-sessions/${liveSessionId}`, {
    token: accessToken,
    lastSeq: lastSeq && lastSeq > 0 ? lastSeq : undefined,
  });
}

export default class LiveSessionClient {
  private options: LiveSessionClientOptions;

  private socket?: WebSocket;

  private heartbeatTimer?: number;

  private reconnectTimer?: number;

  private reconnectAttempts = 0;

  private closedByClient = false;

  private subscribed = false;

  private lastSeq = 0;

  constructor(options: LiveSessionClientOptions) {
    this.options = options;
  }

  connect() {
    this.closedByClient = false;
    this.clearReconnectTimer();
    this.updateStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.socket = new WebSocket(
        buildWebSocketUrl(this.options.liveSessionId, this.lastSeq)
      );
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
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      const pendingSocket = this.socket;
      pendingSocket.onmessage = null;
      pendingSocket.onerror = null;
      pendingSocket.onclose = null;
      pendingSocket.onopen = () => pendingSocket.close();
    } else {
      this.socket?.close();
    }
    this.socket = undefined;
    this.updateStatus('closed');
  }

  subscribe() {
    if (this.subscribed) {
      return;
    }
    this.send({
      type: 'live_session.subscribe',
      requestId: this.buildRequestId('subscribe'),
      payload: {
        liveSessionId: this.options.liveSessionId,
      },
    });
    this.subscribed = true;
  }

  unsubscribe() {
    if (!this.subscribed) {
      return;
    }
    this.send({
      type: 'live_session.unsubscribe',
      requestId: this.buildRequestId('unsubscribe'),
      payload: {
        liveSessionId: this.options.liveSessionId,
      },
    });
    this.subscribed = false;
  }

  private send(message: LiveSessionEnvelope) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(rawData: string) {
    try {
      const message = JSON.parse(rawData) as LiveSessionEnvelope;
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
          liveSessionId: this.options.liveSessionId,
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

  private updateStatus(status: LiveSessionConnectionStatus) {
    this.options.onStatusChange?.(status);
  }

  private buildRequestId(action: string) {
    return `${action}-${this.options.liveSessionId}-${Date.now()}`;
  }
}
