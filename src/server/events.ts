export interface StoreUpdatedEvent {
  updatedAt: string;
  sourceClientId?: string;
}

export type StoreEventListener = (event: StoreUpdatedEvent) => void;

export interface StoreEventBus {
  subscribe: (listener: StoreEventListener) => () => void;
  publish: (event: StoreUpdatedEvent) => void;
  subscriberCount: () => number;
}

/**
 * ローカル API サーバー内の複数クライアント（ウィンドウ・タブ）へ
 * ストア更新イベントを配信するためのシンプルな Pub/Sub バス。
 */
export function createStoreEventBus(): StoreEventBus {
  const listeners = new Set<StoreEventListener>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(event) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // 個別リスナーの送信失敗で他クライアントへの配信を止めない
        }
      }
    },
    subscriberCount() {
      return listeners.size;
    },
  };
}
