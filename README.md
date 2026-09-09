# 高千穂峡貸しボート 9/21 船票監控

用 GitHub Actions + Playwright（無頭瀏覽器）每 5 分鐘檢查一次
https://eipro.jp/takachiho1/eventCalendars/index 上 2026/09/21 的船票時段，
一旦有時段從「×（已截止）」變成可預約，就透過 [ntfy.sh](https://ntfy.sh) 推播通知你的手機。
完全免費、全天候運行，不需要你的電腦或任何 session 保持開啟。

**這個腳本只會讀取頁面判斷狀態，絕不會自動送出預約表單或輸入任何信用卡/付款資訊。**

## 設定步驟

1. **建立 GitHub repo**（建議設為 Public，Public repo 的 GitHub Actions 用量完全免費且無限制；
   若設 Private，每月有 2000 分鐘免費額度，這個腳本很輕量，通常也夠用）。

2. **把這個資料夾的內容 push 上去**：
   ```bash
   cd takachiho-monitor
   git init
   git add .
   git commit -m "init: takachiho gorge boat monitor"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/<repo名稱>.git
   git push -u origin main
   ```

3. **設定 ntfy 通知 topic**：
   - 在手機安裝 [ntfy App](https://ntfy.sh/)（iOS / Android 都有）。
   - 在 App 裡訂閱一個你自訂的 topic 名稱，建議用不容易被猜到的字串，例如：
     `takachiho921-d034ae588aa8`（這是先前隨機產生的一個範例，你可以直接沿用，或自己換一個）。
   - 到 GitHub repo 的 **Settings → Secrets and variables → Actions → New repository secret**，
     新增一個名為 `NTFY_TOPIC`，值填入你訂閱的 topic 名稱。

4. **完成！** 排程會自動每 5 分鐘執行一次（`.github/workflows/monitor.yml`）。
   也可以到 repo 的 **Actions** 分頁手動點 "Run workflow" 立即測試一次。

## 本地測試（選用）

```bash
npm install
npx playwright install --with-deps chromium
NTFY_TOPIC=你的topic node check.mjs
```

## 運作細節

- 每次執行都會把目前開放（非 ×）的時段記錄在 `state.json` 裡，避免同一個時段重複發通知；
  若時段又變回 ×，之後重新開放時會再次通知。
- `state.json` 每輪都會更新時間戳記並自動 commit 回 repo，這是刻意設計——
  GitHub 會在 repo 60 天沒有任何 commit 時自動停用排程，這個機制確保 repo 一直「有動靜」，排程不會被停用。
- 若偵測到 `10:30` 時段開放，通知內容會特別標註「快去手動搶」。
- 若想調整監控日期或特別標註的時段，修改 `.github/workflows/monitor.yml` 裡的
  `TARGET_DATE` / `SPECIAL_SLOT` 環境變數即可。

## 限制

- GitHub Actions 的 cron 排程並非絕對精準，尖峰時段（例如整點）可能延遲數分鐘執行，這是 GitHub 平台本身的限制。
- 目前只監控單一日期（2026/09/21）；若要同時監控多個日期，需要修改腳本邏輯（可以再請 Claude 協助擴充）。
