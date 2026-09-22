export interface ParkingItem {
  id: string;
  source: '591' | 'ohmi';
  title: string;
  price: string;
  address?: string;
  url: string;
  available?: boolean;
}

export interface Env {
  PARKING_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}
