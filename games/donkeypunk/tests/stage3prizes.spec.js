// 3 面: ボーナスアイテム(カセットテープ・革ジャン・エレキギター)と、釘バットの撤去のテスト
// アイテムは 4 面と同じ仕掛け 'prizes'(歩いて触れると取れる。ミスしても取った状態が続き、次の周回で置き直す)。
// 6 個すべてへ実際のキー操作で行って戻れることは tests/stage3.spec.js の L40 で確かめる。
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage } = require('./helpers');

watchConsoleErrors(test);

const WANT = [
  { id: 'tapeF0', type: 'tape', girder: 'f0', x: 318, y: 540, score: 300 },
  { id: 'tapeR1', type: 'tape', girder: 'r1', x: 456, y: 430, score: 300 },
  { id: 'jacketR2', type: 'jacket', girder: 'r2', x: 468, y: 296, score: 500 },
  { id: 'jacketK1', type: 'jacket', girder: 'K1', x: 470, y: 150, score: 500 },
  { id: 'guitarR2', type: 'guitar', girder: 'R2', x: 468, y: 252, score: 1000 },
  { id: 'guitarK3', type: 'guitar', girder: 'K3', x: 468, y: 102, score: 1000 },
];

// 3 面を周回 round で始めてプレイ中まで進める(鳥は出さない・鉄球の当たり判定は止める。アイテムに触れる操作だけを確かめるため)
async function start3(page, round = 1) {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const s = await page.evaluate((r) => {
    const d = window.__dp;
    d.setManual(true); d.setSeed(1); d.setBirdsEnabled(false); d.setWreckingBallEnabled(false); d.startStage(2, r);
    let q = d.snapshot();
    while (q.state !== 'playing') q = d.step(1);
    return d.step(1);
  }, round);
  expect(s.stageId).toBe('squat');
  return s;
}

// アイテム id の上に主人公を置いて 1 ステップ進める
const touch = (page, p) => page.evaluate(([g, x]) => { window.__dp.placePlayer(g, x); return window.__dp.step(1); }, [p.girder, p.x]);

test.describe('3 面 ボーナスアイテムと釘バットの撤去', () => {
  test('P1 6 個の配置(種類・足場・位置・得点)と合計 3,600 点。3 面には釘バットがない', async ({ page }) => {
    const s = await start3(page);
    expect(s.prizes.map((p) => ({ id: p.id, type: p.type, girder: p.girder, x: p.x, y: p.y, score: p.score }))).toEqual(WANT);
    expect(s.prizes.every((p) => !p.taken)).toBe(true);
    expect(WANT.reduce((a, p) => a + p.score, 0)).toBe(3600);
    expect(s.items).toEqual([]); // 釘バットを置いていない
  });

  test('P2 1 個ずつ取ると、その得点・得点表示・効果音・キラキラ。全部取ると +3,600 点', async ({ page }) => {
    await start3(page);
    const score0 = (await snap(page)).score;
    let total = 0;
    for (const p of WANT) {
      await page.evaluate(() => window.__dp.clearSounds());
      const before = (await snap(page)).score;
      const s = await touch(page, p);
      const got = s.prizes.find((q) => q.id === p.id);
      expect(got.taken, p.id).toBe(true);
      expect(s.score - before, p.id).toBe(p.score);
      expect(s.popups).toContain(String(p.score));
      expect(await page.evaluate(() => window.__dp.sounds())).toContain('prize');
      total += p.score;
      await step(page, 2);
    }
    expect((await snap(page)).score - score0).toBe(3600);
    expect(total).toBe(3600);
  });

  test('P3 同じアイテムに触れ続けても 1 回しか加点されない(二重取得・二重加点なし)', async ({ page }) => {
    await start3(page);
    const p = WANT[4]; // エレキギター(R2)
    const score0 = (await snap(page)).score;
    const r = await page.evaluate(([g, x]) => {
      const d = window.__dp;
      let s;
      for (let i = 0; i < 120; i++) { d.placePlayer(g, x); s = d.step(1); }
      return { score: s.score, sounds: d.sounds().filter((n) => n === 'prize').length };
    }, [p.girder, p.x]);
    expect(r.score - score0).toBe(1000);
    expect(r.sounds).toBe(1); // 効果音も 1 回だけ
  });

  test('P4 ミスしても取ったアイテムは復活しない(取っていないものは残る)', async ({ page }) => {
    await start3(page);
    await touch(page, WANT[0]);
    await touch(page, WANT[3]);
    const s = await page.evaluate(() => {
      const d = window.__dp;
      d.killPlayer('fall');
      let q = d.step(1);
      while (q.state !== 'playing') q = d.step(1);
      return d.step(1);
    });
    expect(s.lives).toBe(2);
    expect(s.prizes.map((p) => p.id + ':' + p.taken)).toEqual(
      ['tapeF0:true', 'tapeR1:false', 'jacketR2:false', 'jacketK1:true', 'guitarR2:false', 'guitarK3:false']);
    // 取ったものに触れても加点されない
    const before = s.score;
    const t = await touch(page, WANT[0]);
    expect(t.score).toBe(before);
  });

  test('P5 次の周回の 3 面では 6 個とも置き直される(R2 で始め直しても同じ)', async ({ page }) => {
    await start3(page, 1);
    for (const p of WANT) await touch(page, p);
    expect((await snap(page)).prizes.every((p) => p.taken)).toBe(true);
    const s = await start3(page, 2);
    expect(s.round).toBe(2);
    expect(s.prizes.every((p) => !p.taken)).toBe(true);
    expect(s.prizes).toHaveLength(6);
    // クリアして 4 面 → 次の周回の 3 面へ進んだときも置き直す(面を組み立て直すたびに、引き継ぎなしで初期状態)
    const r = await page.evaluate(() => {
      const d = window.__dp;
      d.placePlayer('K3', 468); d.step(1); // 1 個取る
      d.startStage(2, 3); // 次の周回の 3 面(DEV と同じ始め方)
      let q = d.snapshot();
      while (q.state !== 'playing') q = d.step(1);
      return d.step(1);
    });
    expect(r.round).toBe(3);
    expect(r.prizes.every((p) => !p.taken)).toBe(true);
  });

  test('P6 クリアの条件には入らない: アイテムを取らなくてもガールに触れればクリア(逃走演出)', async ({ page }) => {
    await start3(page);
    const s = await page.evaluate(() => { const d = window.__dp; d.placePlayer('top', 214); return d.step(1); });
    expect(s.state).toBe('escape');
    expect(s.prizes.every((p) => !p.taken)).toBe(true);
  });

  test('P7 ほかの面への影響なし: 1・2・4 面の釘バットはそのまま、4 面のボーナスアイテム(3 個・得点)も同じ', async ({ page }) => {
    const bats = {};
    for (const [idx, n] of [[0, 'stage1'], [1, 'stage2'], [3, 'stage4']]) {
      const s = await startAtStage(page, idx);
      bats[n] = s.items.filter((i) => i.type === 'bat').length;
    }
    expect(bats.stage1).toBeGreaterThan(0);
    expect(bats.stage2).toBe(2);
    expect(bats.stage4).toBe(3);
    const s4 = await startAtStage(page, 3);
    expect(s4.prizes.map((p) => [p.type, p.score])).toEqual([['beer', 300], ['hbook', 500], ['cash', 800]]);
  });
});
