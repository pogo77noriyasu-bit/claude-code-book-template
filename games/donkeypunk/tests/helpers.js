// テストで共通に使う補助関数(stage2.spec.js などから使う)
// ?test を付けて開くと window.__dp(テスト補助)が使える。ループを手動にして決まったステップ数だけ進める。
const { expect } = require('@playwright/test');

const snap = (page) => page.evaluate(() => window.__dp.snapshot());
const step = (page, n) => page.evaluate((k) => window.__dp.step(k), n);

// 各テストでコンソールのエラーを集め、最後に 0 件であることを確認する(test.beforeEach / afterEach で使う)
function watchConsoleErrors(test) {
  let errors;
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
  });
  test.afterEach(async () => {
    expect(errors, 'ブラウザのコンソールにエラーが出ていないこと').toEqual([]);
  });
}

// 指定の面(0 始まり)からゲームを始め、プレイ中まで進める。
// ゴリラの投下と、ファイヤースカルの自動の出現は止めておく(skulls: true で出現させる)
async function startAtStage(page, index, { url = './?test', skulls = false } = {}) {
  await page.goto(url);
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(([i, sk]) => {
    window.__dp.setManual(true); window.__dp.setSeed(1); window.__dp.setSkullsEnabled(sk); window.__dp.startStage(i);
  }, [index, skulls]);
  await step(page, 1);
  await page.evaluate(() => window.__dp.setBossEnabled(false));
  await step(page, 100); // READY 表示が終わるまで
  const s = await snap(page);
  expect(s.state).toBe('playing');
  return s;
}

// キーを押したまま n ステップ進める
async function hold(page, key, n) {
  await page.keyboard.down(key);
  const s = await step(page, n);
  await page.keyboard.up(key);
  return s;
}

// 地面の上で、指定の x まで歩く
async function walkTo(page, x) {
  let s = await snap(page);
  const key = s.player.x < x ? 'ArrowRight' : 'ArrowLeft';
  await page.keyboard.down(key);
  for (let i = 0; i < 600; i++) {
    s = await step(page, 1);
    if (Math.abs(s.player.x - x) <= 1 || s.state !== 'playing') break;
  }
  await page.keyboard.up(key);
  return s;
}

// ハシゴを上りきる(または下りきる)まで進める
async function climb(page, key) {
  let s;
  await page.keyboard.down(key);
  for (let i = 0; i < 300; i++) {
    s = await step(page, 1);
    if (i > 2 && s.player.state === 'ground') break;
  }
  await page.keyboard.up(key);
  return s;
}

module.exports = { snap, step, watchConsoleErrors, startAtStage, hold, walkTo, climb };
