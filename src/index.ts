import { Env, ParkingItem } from './types';
import { scrape591 } from './scrapers/591';
import { scrapeOhmi } from './scrapers/ohmi';
import { sendTelegramNotification } from './notifier/telegram';

const KV_SEEN_IDS_KEY = 'SEEN_PARKING_IDS';
const KV_LAST_RUN_KEY = 'LAST_RUN_METADATA';

/**
 * 核心執行函式：抓取、比對與通知
 */
async function processParkingCheck(
  env: Env,
  options: { dryRun?: boolean; forceNotifyAll?: boolean } = {}
) {
  console.log('[Runner] 開始執行板橋車位爬取與比對任務...');

  // 1. 同時爬取 591 與 ohmi
  const [items591, itemsOhmi] = await Promise.all([scrape591(), scrapeOhmi()]);
  const allCurrentItems: ParkingItem[] = [...items591, ...itemsOhmi];
  console.log(
    `[Runner] 抓取完成：591 共 ${items591.length} 筆，ohmi 共 ${itemsOhmi.length} 筆，總計 ${allCurrentItems.length} 筆`
  );

  // 2. 從 KV 讀取過去已看過的車位 ID
  let seenIds: string[] = [];
  let isFirstRun = false;

  try {
    const rawSeen = await env.PARKING_KV?.get(KV_SEEN_IDS_KEY);
    if (rawSeen) {
      seenIds = JSON.parse(rawSeen);
    } else {
      isFirstRun = true;
    }
  } catch (err) {
    console.error('[KV] 讀取 SEEN_PARKING_IDS 失敗:', err);
  }

  const seenSet = new Set<string>(seenIds);

  // 3. 比對出新進車位
  const currentIds = allCurrentItems.map((item) => item.id);
  const newItems = allCurrentItems.filter((item) => !seenSet.has(item.id));

  console.log(
    `[Runner] 比對結果：新發現 ${newItems.length} 個車位 (首次執行標記: ${isFirstRun})`
  );

  // 4. 發送通知
  if (!options.dryRun) {
    if (isFirstRun && !options.forceNotifyAll) {
      // 首次執行時，為避免一口氣發送幾十則通知洗版，先向 Telegram 發送初始化成功訊息
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        await sendTelegramNotification(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, [
          {
            id: 'init_summary',
            source: '591',
            title: `系統初始化完成！已為您監控板橋區共 ${allCurrentItems.length} 個車位（591: ${items591.length} 筆，ohmi: ${itemsOhmi.length} 筆）。後續每週一 06:00 若有新車位將自動推播！`,
            price: '監控中',
            url: 'https://rent.591.com.tw/list?region=3&section=26&kind=8',
          },
        ]);
      }
    } else if (newItems.length > 0) {
      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        await sendTelegramNotification(
          env.TELEGRAM_BOT_TOKEN,
          env.TELEGRAM_CHAT_ID,
          newItems
        );
      }
    }

    // 5. 將所有當前車位 ID 更新至 KV
    try {
      const mergedIds = Array.from(new Set([...seenIds, ...currentIds]));
      await env.PARKING_KV?.put(KV_SEEN_IDS_KEY, JSON.stringify(mergedIds));
      await env.PARKING_KV?.put(
        KV_LAST_RUN_KEY,
        JSON.stringify({
          lastRunAt: new Date().toISOString(),
          totalSeen: mergedIds.length,
          last591Count: items591.length,
          lastOhmiCount: itemsOhmi.length,
          lastNewCount: newItems.length,
        })
      );
      console.log(`[KV] 已更新記錄，累積共 ${mergedIds.length} 個車位 ID`);
    } catch (err) {
      console.error('[KV] 寫入更新資料失敗:', err);
    }
  }

  return {
    success: true,
    isFirstRun,
    dryRun: !!options.dryRun,
    totalCurrent: allCurrentItems.length,
    counts: {
      from591: items591.length,
      fromOhmi: itemsOhmi.length,
      newItems: newItems.length,
    },
    newItems,
  };
}

export default {
  /**
   * Cron 定時觸發進入點（由 Cloudflare 排程自動呼叫）
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Scheduled] 排程觸發: cron=${event.cron}, time=${new Date(event.scheduledTime).toISOString()}`);
    ctx.waitUntil(processParkingCheck(env));
  },

  /**
   * HTTP 請求進入點（可供手動除錯、即時檢查或狀態查詢）
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // 手動觸發比對並預覽（不寫入 KV、不發送 Telegram）
    if (path === '/dry-run') {
      const result = await processParkingCheck(env, { dryRun: true });
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // 檢查現有 KV 狀態
    if (path === '/status') {
      const rawMeta = await env.PARKING_KV?.get(KV_LAST_RUN_KEY);
      const meta = rawMeta ? JSON.parse(rawMeta) : { status: '尚無執行紀錄' };
      return new Response(JSON.stringify(meta, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // 立即手動執行一次檢查與通知
    if (path === '/run' || path === '/check') {
      const forceAll = url.searchParams.get('force') === 'true';
      const result = await processParkingCheck(env, { forceNotifyAll: forceAll });
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // 預設首頁：顯示簡易儀表板說明
    const welcomeHtml = `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
      <meta charset="utf-8">
      <title>板橋車位出租監控服務</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #333; }
        h1 { color: #1a73e8; border-bottom: 2px solid #eaeaea; padding-bottom: 12px; }
        .card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e1e4e8; }
        a.btn { display: inline-block; background: #1a73e8; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; margin-right: 10px; font-weight: 500; }
        a.btn:hover { background: #1557b0; }
        code { background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <h1>🚗 板橋車位出租即時監控</h1>
      <p>此服務運作於 Cloudflare Workers 免費版，定時監控 <b>591 租屋網</b> 與 <b>ohmi 歐密租車位</b> 的板橋車位新進資訊，並自動透過 Telegram Bot 發送提醒。</p>
      <div class="card">
        <h3>排程設定</h3>
        <p>⏰ <b>排程頻率：</b>每週一上午 06:00 (台灣時間)</p>
        <p>🎯 <b>監控目標：</b>新北市板橋區全區出租車位</p>
      </div>
      <div>
        <a class="btn" href="/dry-run">預覽最新車位清單 (/dry-run)</a>
        <a class="btn" href="/status">查看目前監控狀態 (/status)</a>
        <a class="btn" href="/check">手動執行檢查與發送 (/check)</a>
      </div>
    </body>
    </html>
    `;

    return new Response(welcomeHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
