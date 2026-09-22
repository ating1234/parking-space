import { ParkingItem } from '../types';

const BANQIAO_591_URL = 'https://rent.591.com.tw/list?region=3&section=26&kind=8';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

/**
 * 抓取 591 新北市板橋區最新車位出租列表
 */
export async function scrape591(): Promise<ParkingItem[]> {
  try {
    const response = await fetch(BANQIAO_591_URL, {
      headers: HEADERS,
    });

    if (!response.ok) {
      console.error(`[591] HTTP error! Status: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const items: ParkingItem[] = [];

    // 匹配每個車位卡片：<div class="item" data-id="21910286" ...>
    const itemRegex = /<div class="item" data-id="(\d+)"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(html)) !== null) {
      const block = match[0];
      const id = match[1];

      // 提取標題
      const titleMatch = block.match(/title="([^"]+)"/);
      const title = titleMatch ? titleMatch[1].trim() : `591 車位 #${id}`;

      // 提取價格
      const priceMatch = block.match(
        /class="text-26px[^"]*"[^>]*><div[^>]*>([\d,]+)<\/div><\/strong>\s*<span[^>]*>([^<]+)<\/span>/
      );
      const price = priceMatch ? `${priceMatch[1]} ${priceMatch[2]}`.trim() : '請洽內頁';

      // 提取地址
      const addressMatch = block.match(
        /ic-house house-place[\s\S]*?<div class="inline-flex-row"[^>]*>([^<]+)<\/div>/
      );
      const address = addressMatch ? addressMatch[1].trim() : undefined;

      const url = `https://rent.591.com.tw/${id}`;

      items.push({
        id: `591_${id}`,
        source: '591',
        title,
        price,
        address,
        url,
      });
    }

    // 備用機制：若 HTML 結構調整導致 regex 未命中，檢查 JSON-LD ItemList
    if (items.length === 0) {
      const ldMatch = html.match(/<script id="rent-list-structured-data"[^>]*>([\s\S]*?)<\/script>/);
      if (ldMatch) {
        try {
          const ld = JSON.parse(ldMatch[1]);
          const itemList = ld['@graph']?.find((x: any) => x['@type'] === 'ItemList');
          if (itemList && Array.isArray(itemList.itemListElement)) {
            for (const elem of itemList.itemListElement) {
              const itemUrl: string = elem.url || '';
              const idMatch = itemUrl.match(/\/(\d+)/);
              if (idMatch) {
                const id = idMatch[1];
                items.push({
                  id: `591_${id}`,
                  source: '591',
                  title: `591 車位 #${id}`,
                  price: '請至網站查看',
                  url: itemUrl,
                });
              }
            }
          }
        } catch (jsonErr) {
          console.error('[591] 解析 JSON-LD 失敗:', jsonErr);
        }
      }
    }

    console.log(`[591] 成功抓取 ${items.length} 筆車位資料`);
    return items;
  } catch (error) {
    console.error('[591] 抓取過程發生錯誤:', error);
    return [];
  }
}
