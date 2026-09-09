// 監控高千穂峡貸しボート預約網站，偵測指定日期的時段是否從「已截止(×)」變成「可預約」。
// 唯讀操作：只瀏覽頁面判斷狀態，絕不送出預約表單或輸入任何付款資訊。
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const URL = 'https://eipro.jp/takachiho1/eventCalendars/index';
const TARGET_DATE = process.env.TARGET_DATE || '2026/09/21';
const SPECIAL_SLOT = process.env.SPECIAL_SLOT || '10:30'; // 特別標註的時段起始時間
const NTFY_TOPIC = process.env.NTFY_TOPIC;
const STATE_FILE = 'state.json';
const MAX_WEEK_CLICKS = 15;

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    } catch {
      return { notifiedOpenSlots: [] };
    }
  }
  return { notifiedOpenSlots: [] };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

async function readSlotsForTargetDate(page) {
  return page.evaluate((targetDate) => {
    const evs = [...document.querySelectorAll('.fc-event')];
    return evs
      .map((e) => {
        const startInp = e.querySelector('.service_unit_service_start_datetime');
        const icon = e.querySelector('i.fa-icon');
        return {
          start: startInp ? startInp.value : null,
          isTimes: icon ? icon.className.indexOf('fa-times') !== -1 : null,
        };
      })
      .filter((x) => x.start && x.start.indexOf(targetDate) === 0);
  }, TARGET_DATE);
}

async function sendNtfy(message, title) {
  if (!NTFY_TOPIC) {
    console.log('[warn] NTFY_TOPIC 未設定，略過通知，訊息內容：', message);
    return;
  }
  const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: {
      Title: title,
      Priority: 'urgent',
      Tags: 'rowboat,bell',
    },
    body: message,
  });
  if (!res.ok) {
    console.error('[error] ntfy 發送失敗', res.status, await res.text());
  } else {
    console.log('[info] ntfy 已發送:', message);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });

  let slots = await readSlotsForTargetDate(page);
  let clicks = 0;
  while (slots.length === 0 && clicks < MAX_WEEK_CLICKS) {
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('.fc-next-button');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) break;
    await page.waitForTimeout(1000);
    slots = await readSlotsForTargetDate(page);
    clicks += 1;
  }

  await browser.close();

  if (slots.length === 0) {
    console.log(`[warn] 找不到 ${TARGET_DATE} 的時段資料（點擊 ${clicks} 次下一週後仍找不到），本輪跳過。`);
    return;
  }

  const openSlots = slots.filter((s) => s.isTimes !== true);
  const openStarts = openSlots.map((s) => s.start).sort();

  const state = loadState();
  const notified = new Set(state.notifiedOpenSlots || []);

  // 移除已經重新變回 × 的時段，讓它之後若再度開放能重新通知
  for (const prev of [...notified]) {
    if (!openStarts.includes(prev)) notified.delete(prev);
  }

  const newlyOpen = openStarts.filter((s) => !notified.has(s));

  if (newlyOpen.length > 0) {
    const timeLabels = newlyOpen.map((s) => {
      const time = s.split(' ')[1]?.slice(0, 5) || s;
      return time;
    });
    const hasSpecial = timeLabels.some((t) => t.startsWith(SPECIAL_SLOT));
    let message = `高千穂峡 ${TARGET_DATE} 開放時段：${timeLabels.join(', ')}`;
    if (hasSpecial) {
      message += `\n⚠️ ${SPECIAL_SLOT} 開放了，快去手動搶！`;
    }
    message += '\n(此為自動監控通知，不會自動幫你預約或輸入付款資訊，請手動前往網站搶訂)';

    await sendNtfy(message, '高千穂峡船票開放通知');

    newlyOpen.forEach((s) => notified.add(s));
  } else {
    console.log(`[info] ${TARGET_DATE} 本輪無新開放時段，開放中: [${openStarts.join(', ')}]`);
  }

  // 每次都更新時間戳記，確保 state.json 有變化而產生 commit，
  // 避免 repo 因為 60 天內無 commit 而被 GitHub 自動停用排程。
  saveState({ notifiedOpenSlots: [...notified], lastCheckedAt: new Date().toISOString() });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
