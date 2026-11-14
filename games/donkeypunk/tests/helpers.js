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
// ゴリラの投下と、ファイヤースカル・怒ったポリスマン(4 面)の自動の出現は止めておく(skulls: true / cops: true で出現させる)
async function startAtStage(page, index, { url = './?test', skulls = false, cops = false } = {}) {
  await page.goto(url);
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(([i, sk, cp]) => {
    window.__dp.setManual(true); window.__dp.setSeed(1); window.__dp.setSkullsEnabled(sk); window.__dp.setCopsEnabled(cp); window.__dp.startStage(i);
  }, [index, skulls, cops]);
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

// 1〜3 面のクリア後の面間演出(やぐらを積み上げる)が流れていたら、終わって次の面の READY になるまで進める。
// 演出中でなければ何もしない(4 面のあと・タイトルからの開始など)。演出はステップ数が決まっているので、上限を超えたら失敗
async function passIntermission(page) {
  let s = await snap(page);
  for (let i = 0; i < 2000 && s.state === 'intermission'; i++) s = await step(page, 1);
  expect(s.state).not.toBe('intermission');
  return s;
}

// クリア表示(「Oi! Oi! Oi!」/ 4 面の「ROUND CLEAR」)は、決まった時間で自動的に次へ進む(ENTER は使わない)。
// クリア表示が終わるまで 1 ステップずつ進め、終わった直後の状態(1〜3 面のあとは面間演出、4 面のあとは次の周回の 1 面の READY)を返す
async function leaveClear(page) {
  let s = await snap(page);
  expect(s.state).toBe('clear');
  for (let i = 0; i < 1000 && s.state === 'clear'; i++) s = await step(page, 1);
  expect(s.state).not.toBe('clear');
  return s;
}

module.exports = { snap, step, watchConsoleErrors, startAtStage, hold, walkTo, climb, passIntermission, leaveClear };
