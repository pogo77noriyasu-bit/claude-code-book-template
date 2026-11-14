// ドンキーパンク: 残機の表示のテスト
// 画面左上の残機(モヒカンの頭アイコン)は、プレイ中の 1 人を除いた予備の数 max(0, 残機 - 1) だけ描く。
// 内部の残機(開始時 3)・ミス・ゲームオーバーの判定は変えない(表示だけ)
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors } = require('./helpers');

watchConsoleErrors(test);

// 画面に描かれている残機のアイコンの数(アイコン i のモヒカン = 赤 #ff2a2a の 4×4 が x=14+i*14・y=40 にある)
const iconsOnScreen = (page) => page.evaluate(() => {
  const ctx = document.querySelector('canvas').getContext('2d');
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const d = ctx.getImageData(15 + i * 14, 41, 1, 1).data;
    if (d[0] === 0xff && d[1] === 0x2a && d[2] === 0x2a) n++;
  }
  return n;
});

// ミスさせて、再開(READY → プレイ中)かゲームオーバーまで進める
async function miss(page) {
  await page.evaluate(() => window.__dp.killPlayer('fall'));
  let s = await step(page, 1);
  for (let i = 0; i < 400 && s.state !== 'playing' && s.state !== 'gameover'; i++) s = await step(page, 1);
  return s;
}

test('L1. 全 4 面・1 周目と 2 周目で、開始時は予備の 2 人を表示(内部の残機は 3)。1 回ミスすると 1 人、2 回で 0 人(最後の 1 人をプレイ中)。3 回目のミスでゲームオーバー(判定は今までどおり)', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const round of [1, 2]) {
    for (const stage of [0, 1, 2, 3]) {
      const label = `${stage + 1} 面 ${round} 周目`;
      await page.evaluate(([i, r]) => {
        const d = window.__dp;
        d.setManual(true); d.setSeed(1);
        d.setSkullsEnabled(false); d.setCopsEnabled(false); d.setBirdsEnabled(false);
        d.startStage(i, r);
      }, [stage, round]);
      let s = await step(page, 1);
      await page.evaluate(() => window.__dp.setBossEnabled(false));
      for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
      await page.waitForTimeout(40);
      expect(s.lives, label).toBe(3);
      expect(await iconsOnScreen(page), label + ' 開始時').toBe(2);
      s = await miss(page);
      await page.waitForTimeout(40);
      expect([s.state, s.lives], label).toEqual(['playing', 2]);
      expect(await iconsOnScreen(page), label + ' 1 回ミス').toBe(1);
      s = await miss(page);
      await page.waitForTimeout(40);
      expect([s.state, s.lives], label).toEqual(['playing', 1]);
      expect(await iconsOnScreen(page), label + ' 最後の 1 人').toBe(0);
      s = await miss(page);
      await page.waitForTimeout(40);
      expect([s.state, s.lives], label).toEqual(['gameover', 0]);
      expect(await iconsOnScreen(page), label + ' ゲームオーバー').toBe(0);
    }
  }
});

test('L2. タイトルから ENTER で始めた READY の間も、予備の 2 人を表示(内部の残機は 3)。タイトル画面は全体に暗い幕がかかるので色では数えない', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => window.__dp.setManual(true));
  await page.keyboard.press('Enter');
  const s = await step(page, 2);
  await page.waitForTimeout(40);
  expect(s.state).toBe('ready');
  expect(s.lives).toBe(3);
  expect(await iconsOnScreen(page)).toBe(2);
});
