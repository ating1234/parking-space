import { ParkingItem } from '../types';

const OHMI_BANQIAO_JSON_URL = 'https://ohmi.com.tw/collections/banqiao/products.json?limit=250';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  published_at?: string;
  created_at?: string;
  variants: Array<{
    title: string;
    price: string;
    available: boolean;
  }>;
}

interface ShopifyResponse {
  products: ShopifyProduct[];
}

/**
 * 抓取 ohmi 歐密租車位 板橋區車位列表
 */
export async function scrapeOhmi(): Promise<ParkingItem[]> {
  try {
    const response = await fetch(OHMI_BANQIAO_JSON_URL, {
      headers: HEADERS,
    });

    if (!response.ok) {
      console.error(`[ohmi] HTTP error! Status: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as ShopifyResponse;
    const items: ParkingItem[] = [];

    if (!data || !Array.isArray(data.products)) {
      console.warn('[ohmi] 回傳資料中未包含 products 陣列');
      return [];
    }

    for (const prod of data.products) {
      const primaryVariant = prod.variants?.[0];
      const priceRaw = primaryVariant?.price ? parseFloat(primaryVariant.price) : 0;
      const priceStr = priceRaw > 0 ? `${priceRaw.toLocaleString()} 元/月` : '請洽內頁';
      const available = primaryVariant?.available ?? true;

      // 提取地址或簡述（若 body_html 中有地點資訊）
      let address: string | undefined = undefined;
      if (prod.body_html) {
        const addrMatch = prod.body_html.match(/地址[：:]\s*([^<]+)/);
        if (addrMatch) {
          address = addrMatch[1].trim();
        }
      }

      items.push({
        id: `ohmi_${prod.id}`,
        source: 'ohmi',
        title: prod.title,
        price: priceStr,
        address,
        url: `https://ohmi.com.tw/products/${prod.handle}`,
        available,
      });
    }

    console.log(`[ohmi] 成功抓取 ${items.length} 筆車位資料`);
    return items;
  } catch (error) {
    console.error('[ohmi] 抓取過程發生錯誤:', error);
    return [];
  }
}
