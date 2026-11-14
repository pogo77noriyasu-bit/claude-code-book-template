// ドンキーパンク 1 面: ビール瓶・缶の画面の左右の端での動き
// 端の鉄骨から落ちた瓶・缶は、下の段に着地してその段の低い側へ向きを変える(画面の端で跳ね返って見える)。
// 周回が上がって速くなった瓶(4 周目から)は、落ちる間に下の段の端(x=0 / 480)を越えて画面の外へ消えていたので、
// 中心が画面の端を越えたとき、その下に鉄骨があれば端で跳ね返すようにした(js/physics.js の wallBounce)。
// 缶はどの周回でも端を越えないので動きは変わらない。最下段 g0 の左端からは、今までどおり画面の外へ出ていく
const { test, expect } = require('@playwright/test');
const { step, watchConsoleErrors, startAtStage } = require('./helpers');

watchConsoleErrors(test);

const ORDER = ['g5', 'g4', 'g3', 'g2', 'g1', 'g0'];

// round 周回の 1 面で、type の瓶・缶を girder の x に置き、消えるまで毎ステップの状態を集める
async function trace(page, round, type, girder, x) {
  return page.evaluate(([round, type, girder, x]) => {
    const d = window.__dp;
    d.startStage(0, round); d.step(1); d.setBossEnabled(false); d.step(100);
    d.setLadderChance(0); // ハシゴは降りない(端の動きだけを見る)
    d.placePlayer('top', 300); // 主人公はガールの足場の右(瓶・缶に当たらず、ガールにも触れない)
    d.clearHazards();
    d.spawnHazard(type, girder, x);
    const id = d.snapshot().hazards[0].id;
    const t = [];
    for (let i = 0; i < 4000; i++) {
      const s = d.step(1);
      const h = s.hazards.find((q) => q.id === id);
      if (!h) break;
      t.push({ x: h.x, y: h.y, state: h.state, girder: h.girder });
    }
    d.setLadderChance(null);
    return t;
  }, [round, type, girder, x]);
}

// 転がった段の順番(重複を除く)
const rolled = (t) => t.filter((p) => p.state === 'roll').map((p) => p.girder).filter((g, i, a) => a.indexOf(g) === i);

// 周回ごとに分ける(1 つのテストが重くなりすぎないように)
for (let round = 1; round <= 7; round++) {
  test(`E1-${round}. ${round} 周目: 瓶も缶も、最上段 g5 から 1 段ずつ左右の端で向きを変えて最下段 g0 まで降り、g0 の左端から画面の外へ出ていく(途中で消えない)。落ちている間は画面の中(0〜480)にいる`, async ({ page }) => {
    test.setTimeout(120000);
    await startAtStage(page, 0);
    for (const type of ['bottle', 'can']) {
      const t = await trace(page, round, type, 'g5', 224);
      const label = `${round} 周目の${type === 'bottle' ? '瓶' : '缶'}`;
      expect(rolled(t), label).toEqual(ORDER);
      // 最後は g0 の左端から出ていく
      const last = t[t.length - 1];
      expect(last.x, label).toBeLessThan(0);
      // g0 を離れるまでは、落ちている間も画面の左右の端の内側
      const lastG0 = t.map((p) => p.girder).lastIndexOf('g0');
      for (const p of t.slice(0, lastG0)) {
        expect(p.x, label).toBeGreaterThanOrEqual(0);
        expect(p.x, label).toBeLessThanOrEqual(480);
      }
    }
  });
}

test('E2. いちばん速い瓶(6 周目以降)は、左端でも右端でも画面の端で跳ね返って下の段に着地し、その段の低い側へ転がる(引っかからず、続けて折り返さない)', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, 0);
  // 左端: g4(左へ転がる)の左端から落ちる → g3(右へ転がる)に着地
  // 右端: g5(右へ転がる)の右端から落ちる → g4(左へ転がる)に着地
  for (const [label, from, to, x, toDir] of [['左端', 'g4', 'g3', 60, 1], ['右端', 'g5', 'g4', 420, -1]]) {
    const t = await trace(page, 6, 'bottle', from, x);
    const fallStart = t.findIndex((p) => p.state === 'fall');
    const landIdx = t.findIndex((p, i) => i > fallStart && p.state === 'roll');
    expect(t[landIdx].girder, label).toBe(to);
    const fall = t.slice(fallStart, landIdx);
    // 落ちている間に横の向きが変わるのは、端での 1 回と、着地して小さく跳ねるときの 1 回まで(連続して折り返さない)
    let turns = 0;
    for (let i = 2; i < fall.length; i++) {
      const a = fall[i - 1].x - fall[i - 2].x;
      const b = fall[i].x - fall[i - 1].x;
      if (a * b < 0) turns++;
    }
    expect(turns, label).toBeLessThanOrEqual(2);
    // 画面の外には出ていない
    for (const p of fall) {
      expect(p.x, label).toBeGreaterThanOrEqual(0);
      expect(p.x, label).toBeLessThanOrEqual(480);
    }
    // 着地したあとは、その段の低い側へ止まらずに転がっていく(端に引っかからない)
    const roll = t.slice(landIdx, landIdx + 30);
    expect(roll.every((p) => p.state === 'roll' && p.girder === to), label).toBe(true);
    expect((roll[roll.length - 1].x - roll[0].x) * toDir, label).toBeGreaterThan(40);
  }
});

test('E3. 速さ・大きさ(当たり判定)・ハシゴを降りる確率は変わらない(瓶 1.5 / 18×9、缶 1.15 / 12×12、25%)', async ({ page }) => {
  await startAtStage(page, 0);
  const c = await page.evaluate(() => window.DP.config.hazard);
  expect(c.bottle).toEqual({ width: 18, height: 9, speed: 1.5 });
  expect(c.can).toEqual({ width: 12, height: 12, speed: 1.15 });
  expect(c.ladderChance).toBe(0.25);
});

test('E4. 主人公(地面)に向かってきた瓶は、跳ね返ったあとも今までどおり当たる(跳ね返りで当たり判定が消えない)', async ({ page }) => {
  await startAtStage(page, 0);
  // 6 周目: g1 の右端から落ちて右端で跳ね返り、g0 に着地して左へ転がる。その先に主人公を立たせる
  await page.evaluate(() => {
    const d = window.__dp;
    d.startStage(0, 6); d.step(1); d.setBossEnabled(false); d.step(100);
    d.setLadderChance(0); d.clearHazards();
    d.placePlayer('g0', 400);
    d.spawnHazard('bottle', 'g1', 420);
  });
  let s;
  for (let i = 0; i < 300; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  await page.evaluate(() => window.__dp.setLadderChance(null));
  expect(s.state).toBe('dying');
});
