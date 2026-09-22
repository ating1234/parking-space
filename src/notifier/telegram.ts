import { ParkingItem } from '../types';

/**
 * 透過 Telegram Bot API 發送訊息
 */
export async function sendTelegramNotification(
  token: string,
  chatId: string,
  newItems: ParkingItem[]
): Promise<void> {
  if (!token || !chatId) {
    console.warn('[Telegram] 未提供 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID，跳過發送通知');
    return;
  }

  if (newItems.length === 0) {
    console.log('[Telegram] 本次無新進車位，不發送通知');
    return;
  }

  // 格式化訊息標題
  const now = new Date();
  const timeStr = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const header = `🚗 <b>【板橋車位出租】發現 ${newItems.length} 個新進車位！</b>\n📅 檢查時間：${timeStr}\n\n`;

  // 格式化車位項目列表
  const itemTexts = newItems.map((item, index) => {
    const badge = item.source === '591' ? '🏢 591租屋' : '🅿️ ohmi歐密';
    let text = `<b>${index + 1}. [${badge}] ${escapeHtml(item.title)}</b>\n`;
    text += `💰 <b>租金：</b>${escapeHtml(item.price)}\n`;
    if (item.address) {
      text += `📍 <b>地點：</b>${escapeHtml(item.address)}\n`;
    }
    text += `🔗 <a href="${item.url}">點擊前往查看車位詳情</a>\n`;
    return text;
  });

  // 處理 Telegram 4096 字元長度限制，進行分批發送
  let currentMessage = header;
  const messagesToSend: string[] = [];

  for (const itemText of itemTexts) {
    if ((currentMessage + itemText).length > 3900) {
      messagesToSend.push(currentMessage);
      currentMessage = itemText;
    } else {
      currentMessage += itemText + '\n';
    }
  }
  if (currentMessage.trim().length > 0) {
    messagesToSend.push(currentMessage);
  }

  // 發送每則訊息
  const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  for (const message of messagesToSend) {
    try {
      const resp = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`[Telegram] 發送失敗: HTTP ${resp.status} - ${errorText}`);
      } else {
        console.log('[Telegram] 訊息發送成功');
      }
    } catch (err) {
      console.error('[Telegram] 網路請求例外:', err);
    }
  }
}

/**
 * HTML 特殊字元跳脫函數
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
