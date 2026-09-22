/**
 * 本地測試腳本：直接在本地執行 591 與 ohmi 抓取驗證
 * 執行方式：npx tsx scripts/test-local.ts
 */
import { scrape591 } from '../src/scrapers/591';
import { scrapeOhmi } from '../src/scrapers/ohmi';

async function main() {
  console.log('=== 開始測試 591 爬蟲 ===');
  const items591 = await scrape591();
  console.log(`[591] 抓取成功，總計: ${items591.length} 筆`);
  if (items591.length > 0) {
    console.log('591 範例資料：', items591[0]);
  }

  console.log('\n=== 開始測試 ohmi 爬蟲 ===');
  const itemsOhmi = await scrapeOhmi();
  console.log(`[ohmi] 抓取成功，總計: ${itemsOhmi.length} 筆`);
  if (itemsOhmi.length > 0) {
    console.log('ohmi 範例資料：', itemsOhmi[0]);
  }

  console.log('\n=== 彙整結果 ===');
  console.log(`總計抓取車位數: ${items591.length + itemsOhmi.length} 筆`);
  console.log('測試完成！');
}

main().catch(console.error);
