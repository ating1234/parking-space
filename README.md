# 🚗 板橋車位出租即時監控與通知系統 (Cloudflare Workers)

自動定時監控 **591 租屋網** 與 **ohmi 歐密租車位** 的新北市板橋區出租車位，比對出每週「新進車位」，並透過 **Telegram Bot** 即時推播提醒。

整個架構完全運作於 **Cloudflare 免費方案 (Cloudflare Workers + Workers KV + Cron Triggers)**，支援 GitHub Actions 自動化 CI/CD 部署。

---

## 🌟 功能特色

- **雙平台即時爬取**：
  - **591 租屋網**：自動抓取板橋區最新出租車位（標題、價格、地址、專屬連結）。
  - **ohmi 歐密租車位**：透過 Shopify API 取得板橋車位集合之最新出租車位。
- **智慧差異比對**：
  - 採用 **Cloudflare KV** 記錄已存在的車位 ID，僅在發現**全新刊登**車位時發出通知。
  - 具備初次啟用防洗版機制（首次執行自動建立基準資料庫並發送初始化確認通知）。
- **Telegram 即時提醒**：
  - 格式化美觀卡片排版，一鍵直達車位網址。
  - 具備長訊息自動分段防溢出機制。
- **免費定時排程**：
  - 內建 Cloudflare Cron Triggers，每週一上午 06:00 (台灣時間) 自動醒來檢查，零主機伺服器成本。
- **GitHub 整合與自動部署**：
  - 程式碼 Push 到 GitHub 即透過 GitHub Actions 自動部署到 Cloudflare。

---

## 🛠️ 事前準備（只需設定一次）

### 1. 取得 Telegram Bot Token 與 Chat ID
1. 打開 Telegram，搜尋並與 **`@BotFather`** 對話。
2. 輸入 `/newbot`，依序輸入機器人名稱與帳號（需以 `bot` 結尾）。
3. 建立完成後，BotFather 會給您一串 **HTTP API Token**（即 `TELEGRAM_BOT_TOKEN`，格式如 `123456789:ABCdefGhIJKlmNo...`）。
4. 在 Telegram 搜尋您剛剛建立的 Bot，點擊 **Start** 傳送一則任意訊息（例如 `hello`）。
5. 搜尋並開啟 **`@userinfobot`**，傳送任何訊息，即可取得您的 **Id**（即 `TELEGRAM_CHAT_ID`，通常是一串數字如 `123456789`）。

---

### 2. 建立 Cloudflare KV 命名空間
本專案使用 Cloudflare KV 儲存歷史車位 ID。請在專案目錄下執行以下指令登入 Cloudflare 並建立 KV：

```bash
# 登入 Cloudflare（會開啟瀏覽器進行授權）
npx wrangler login

# 建立 KV 命名空間
npx wrangler kv namespace create PARKING_KV
```

執行後會看到類似輸出：
```
🌀 Creating namespace with title "parking-space-checker-PARKING_KV"
✨ Success!
Add the following to your configuration file:
[[kv_namespaces]]
binding = "PARKING_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

請將輸出的 `id` 貼入專案根目錄的 `wrangler.jsonc`：
```jsonc
"kv_namespaces": [
  {
    "binding": "PARKING_KV",
    "id": "填入您的_KV_ID"
  }
]
```

---

## 🧪 本地測試與預覽

### 安裝套件
```bash
npm install
```

### 本地測試抓取與解析
您可以在本機直接驗證 591 與 ohmi 能否順利抓到車位資料：
```bash
npx tsx scripts/test-local.ts
```

### 本機模擬 Workers 運作
```bash
npm run dev
```
啟動後可以在瀏覽器開啟：
- `http://localhost:8787/dry-run`：預覽最新抓到的板橋車位清單（不寫入 KV、不發 Telegram）。
- `http://localhost:8787/check`：手動觸發一次完整檢查與比對流程。
- `http://localhost:8787/status`：查看上次檢查狀態與紀錄車位數。

---

## 🚀 部署至 GitHub 與 Cloudflare 自動化

### 步驟 1：建立 GitHub 儲存庫並推播
```bash
git init
git add .
git commit -m "feat: initial commit for banqiao parking space checker"
git branch -M main
git remote add origin https://github.com/您的帳號/您的倉庫名.git
git push -u origin main
```

### 步驟 2：設定 GitHub Repository Secrets
進入 GitHub 儲存庫頁面 -> **Settings** -> **Secrets and variables** -> **Actions**，點擊 **New repository secret**，新增以下 4 個環境變數：

1. **`CLOUDFLARE_API_TOKEN`**：
   - 至 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) 建立 Token，權限選擇範本「**Edit Cloudflare Workers**」。
2. **`CLOUDFLARE_ACCOUNT_ID`**：
   - 在 Cloudflare Dashboard 右側側邊欄或網址中可查到您的 Account ID。
3. **`TELEGRAM_BOT_TOKEN`**：
   - 剛才從 `@BotFather` 取得的 Token。
4. **`TELEGRAM_CHAT_ID`**：
   - 您的 Telegram Chat ID。

設定完成後，每次您 push 程式碼到 `main` 分支，GitHub Actions 都會自動驗證型別並部署到您的 Cloudflare Workers！

---

## ⏰ 排程時間自訂說明

預設排程為**每週一上午 06:00 (台灣時間 UTC+8)**。
若需要調整時間，請修改 `wrangler.jsonc` 中的 `triggers.crons`：

```jsonc
"triggers": {
  "crons": [
    // 格式: 分 時 日 月 週 (以 UTC 時間為準，UTC 22:00 = 台灣時間隔天 06:00)
    "0 22 * * 0"
  ]
}
```
常見時間對照（UTC+8 台灣時間）：
- 每週一 06:00：`0 22 * * 0` (UTC 週日 22:00)
- 每週一 09:00：`0 1 * * 1` (UTC 週一 01:00)
- 每天 08:00：`0 0 * * *` (UTC 每天 00:00)
