/**
 * WebSocket 心跳管理工具
 *
 * 每個間隔固定送一次 ping，收到訊息也照送。伺服器只在收到客戶端的東西時延長連線的
 * 讀取期限；串流期間字一直進來、客戶端卻什麼都不送的話，一則跑得比期限久的長回覆
 * 會被伺服器當成斷線切掉。
 */
import { ref } from 'vue';

export interface HeartbeatConfig {
  interval?: number; // 心跳間隔，預設 10000ms（10 秒）
  pingMessage?: any; // 自訂心跳內容，預設 {type: 'ping', timestamp: number}
}

export interface HeartbeatManager {
  start: (ws: WebSocket, config?: HeartbeatConfig) => void;
  stop: () => void;
  isActive: () => boolean;
}

export function createHeartbeatManager(): HeartbeatManager {
  const heartbeatTimer = ref<number | null>(null);
  const heartbeatInterval = ref<number>(10000);

  const start = (ws: WebSocket, config?: HeartbeatConfig) => {
    stop();
    if (config?.interval) {
      heartbeatInterval.value = config.interval;
    }
    heartbeatTimer.value = window.setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('[WebSocket Heartbeat] 連線未開啟，停止心跳');
        stop();
        return;
      }
      try {
        const pingMessage = config?.pingMessage || {
          type: 'ping',
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(pingMessage));
      } catch (error) {
        console.error('[WebSocket Heartbeat] 心跳發送失敗', error);
        stop();
      }
    }, heartbeatInterval.value);
  };

  const stop = () => {
    if (heartbeatTimer.value !== null) {
      window.clearInterval(heartbeatTimer.value);
      heartbeatTimer.value = null;
    }
  };

  const isActive = (): boolean => {
    return heartbeatTimer.value !== null;
  };

  return {
    start,
    stop,
    isActive
  };
}
