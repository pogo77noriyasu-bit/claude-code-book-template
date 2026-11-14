// ドンキーパンク 1 面: 複数同時ジャンプの得点のテスト
// 1 回のジャンプで飛び越えた瓶・缶の個数 n で、着地したときに 50 × n × (n + 1) 点を 1 回だけ加点する
// (1 個 100・2 個 300・3 個 600・4 個 1000・5 個 1500・6 個 2100)。2 個セットは 2 個、分かれた片割れは 1 個と数える。
// ジャンプ中にミスしたら加点しない。次のジャンプに持ち越さない。ゴミ箱・釘バット・2〜4 面の得点は変えない
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors } = require('./helpers');

watchConsoleErrors(test);

const combo = (n) => 50 * n * (n + 1);

// R10(瓶が速く、1 回のジャンプで越えられる長さが長い)の 1 面で、主人公を g1 の x=340 に左向きに立たせ、
// 瓶・缶を g1 に置く(右へ転がって主人公に向かってくる)。items: [[種類, x, 片割れの印(同じ数字は同じセット)], ...]
async function setup(page, items) {
  await page.evaluate((items) => {
    const d = window.__dp;
    const g = d.gameForRender().data;
    d.setSeed(1); d.startStage(0, 10);
    let s = d.step(1);
    while (s.state !== 'playing') s = d.step(1);
    d.setBossEnabled(false); d.clearHazards(); d.setLadderChance(0);
    d.placePlayer('g1', 340); d.setFacing(-1);
    for (const [type, x, group] of items) {
      d.spawnHazard(type, 'g1', x);
      if (group) { const h = g.hazards[g.hazards.length - 1]; h.piece = true; h.pairGroup = 1000 + group; }
    }
    d.clearSounds();
  }, items);
}

// 先頭の瓶・缶(いちばん右)との距離が dist になったら、歩きながら跳ぶ(本物のキーボード)。着地して少し進むまで
async function jumpAt(page, dist) {
  await page.keyboard.down('ArrowLeft');
  let s = await snap(page);
  for (let i = 0; i < 300; i++) {
    s = await step(page, 1);
    const front = Math.max(...s.hazards.map((h) => h.x));
    if (s.player.x - front <= dist) { await page.keyboard.press('Space'); s = await step(page, 2); break; }
  }
  // 着地するまで(坂の低い側へ跳ぶと空中にいる時間が少し延びる)進め、着地してから 5 ステップ
  for (let i = 0; i < 90 && s.state === 'playing' && s.player.state !== 'ground'; i++) s = await step(page, 1);
  for (let i = 0; i < 5 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowLeft');
  return s;
}

// 跳ぶ距離を変えながら試して、全部を越えて無事に着地できたときの結果を返す(見つからなければ null)
async function jumpOverAll(page, items) {
  for (let dist = 10; dist <= 130; dist += 2) {
    await setup(page, items);
    const s = await jumpAt(page, dist);
    // ミスすると面が組み立て直されて瓶・缶が 0 個になる(every が空で成り立つ)ので、数と残機も確かめる
    if (s.state === 'playing' && s.lives === 3 && s.hazards.length === items.length && s.hazards.every((h) => h.jumpedOver) && s.player.state === 'ground') {
      return { s, dist, sounds: await page.evaluate(() => window.__dp.sounds()) };
    }
  }
  return null;
}

test.beforeEach(async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => window.__dp.setManual(true));
});

test('J0. 得点の式: 50 × 個数 × (個数 + 1) = 1 個 100・2 個 300・3 個 600・4 個 1000・5 個 1500・6 個 2100', async ({ page }) => {
  const unit = await page.evaluate(() => window.DP.config.score.jumpComboUnit);
  expect([1, 2, 3, 4, 5, 6].map((n) => unit * n * (n + 1))).toEqual([100, 300, 600, 1000, 1500, 2100]);
});

// 個数ごとの組み合わせ(R10 の瓶は 1 回のジャンプで約 120px の長さまで越えられる)
const CASES = [
  ['J1. 単体 1 個 → 100 点', [['bottle', 200]], 1],
  ['J2. 2 個セット 1 つ → 300 点(2 個と数える)', [['bottle2', 200]], 2],
  ['J3. 単体 2 個を同時に → 300 点', [['bottle', 200], ['bottle', 178]], 2],
  ['J4. 単体 3 個を同時に → 600 点', [['bottle', 200], ['bottle', 178], ['bottle', 156]], 3],
  ['J5. 単体 4 個を同時に → 1000 点', [['bottle', 200], ['bottle', 178], ['bottle', 156], ['bottle', 134]], 4],
  ['J5b. 2 個セット 1 つ + 単体 2 個(4 個)→ 1000 点', [['bottle2', 200], ['bottle', 170], ['bottle', 148]], 4],
  ['J5c. 2 個セット 2 つ + 単体 1 個(5 個)→ 1500 点', [['bottle2', 200], ['bottle2', 162], ['bottle', 132]], 5],
  ['J6. 分かれた片割れ 2 個 + 単体 1 個(3 個)→ 600 点(片割れも 1 個と数える)', [['bottle', 200, 1], ['bottle', 178, 1], ['bottle', 156]], 3],
  ['J6b. 片割れ 1 個 + 2 個セット 1 つ + 缶 1 個(4 個)→ 1000 点', [['bottle', 200, 2], ['bottle2', 170], ['can', 142]], 4],
];
for (const [title, items, n] of CASES) {
  test(`${title}。得点表示はまとめて 1 回・効果音も 1 回(個別の得点は入らない)`, async ({ page }) => {
    test.setTimeout(120000);
    const r = await jumpOverAll(page, items);
    expect(r, '全部を越えて着地できる跳び方がある').not.toBe(null);
    expect(r.s.player.state, JSON.stringify({ dist: r.dist, score: r.s.score, popups: r.s.popups })).toBe('ground');
    expect(r.s.score).toBe(combo(n));
    expect(r.s.popups).toEqual([String(combo(n))]);
    expect(r.sounds.filter((x) => x === 'score').length).toBe(1);
  });
}

test('J7. 二重に数えない・二重に加点しない: 着地したあとに何ステップ進めても、もう一度その場で跳んでも、得点は増えない', async ({ page }) => {
  test.setTimeout(120000);
  const r = await jumpOverAll(page, [['bottle', 200], ['bottle', 178], ['bottle', 156]]);
  expect(r.s.score).toBe(600);
  let s = await step(page, 60);
  expect(s.score).toBe(600);
  // 瓶はもう主人公の後ろ(左)にいる。その場で跳んでも入らない
  await page.keyboard.press('Space');
  s = await step(page, 50);
  expect(s.score).toBe(600);
  // (得点表示は約 1 秒で消えるので、効果音で数える)加点の音は最初の着地の 1 回だけ
  expect((await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'score').length).toBe(1);
});

test('J8. ジャンプ中にミスしたら、そのジャンプで飛び越えた分も加点しない(1 個目を越えたあと、2 個目に当たる)', async ({ page }) => {
  test.setTimeout(120000);
  let found = null;
  for (let dist = 10; dist <= 100 && !found; dist += 2) {
    await setup(page, [['bottle', 200], ['bottle', 140]]);
    const s = await jumpAt(page, dist);
    // 1 個目(右)は真下を通って数えられたが、2 個目に当たってミス
    const first = s.hazards.find((h) => h.x > 0 && h.jumpedOver);
    if (s.state === 'dying' && first) found = s;
  }
  expect(found, '1 個目を越えてから 2 個目に当たる跳び方がある').not.toBe(null);
  expect(found.score).toBe(0);
  expect(found.popups).toEqual([]);
});

test('J9. 次のジャンプに個数を持ち越さない: 2 個を越えて 300 点、そのあと別のジャンプで 1 個を越えると +100 点(合計 400 点。600 点や 1000 点にはならない)', async ({ page }) => {
  test.setTimeout(180000);
  let ok = null;
  for (let dist = 10; dist <= 120 && !ok; dist += 2) {
    await setup(page, [['bottle', 200], ['bottle', 178], ['bottle', 40]]);
    let s = await jumpAt(page, dist);
    if (!(s.state === 'playing' && s.score === 300)) continue;
    // 2 回目: 3 個目に向かって、距離を変えながら跳ぶ(同じ状態から何度も試せないので、近づいたら決まった距離で)
    for (const d2 of [60, 50, 40, 70, 30]) {
      const before = s.score;
      await page.keyboard.down('ArrowLeft');
      for (let i = 0; i < 300; i++) {
        s = await step(page, 1);
        const third = s.hazards.find((h) => !h.jumpedOver);
        if (!third) break;
        if (s.player.x - third.x <= d2 && s.player.state === 'ground') { await page.keyboard.press('Space'); break; }
      }
      for (let i = 0; i < 45 && s.state === 'playing'; i++) s = await step(page, 1);
      await page.keyboard.up('ArrowLeft');
      if (s.state === 'playing' && s.score > before) { ok = s; break; }
      if (s.state !== 'playing') break;
    }
  }
  expect(ok, '2 回のジャンプで 2 個と 1 個を越えられる').not.toBe(null);
  expect(ok.score).toBe(400);
  expect(ok.popups.filter((t) => t === '300').length).toBe(1);
  expect(ok.popups.filter((t) => t === '100').length).toBe(1);
});

test('J10. 釘バットの得点は今までどおり(単体 300・2 個セット 300・片割れ 150)。ゴミ箱は飛び越えると真下を通ったその場で 100 点(まとめ方の対象外)', async ({ page }) => {
  // 釘バット
  for (const [items, expected] of [[[['bottle', 280]], 300], [[['bottle2', 280]], 300], [[['bottle', 280, 1]], 150]]) {
    await setup(page, items);
    await page.evaluate(() => { window.__dp.setFacing(-1); window.__dp.setBat(600); });
    let s;
    for (let i = 0; i < 80; i++) { s = await step(page, 1); if (!s.hazards.length) break; }
    expect(s.hazards.length, JSON.stringify(items)).toBe(0);
    expect(s.score, JSON.stringify(items)).toBe(expected);
  }
  // ゴミ箱: 主人公が跳んでいる間に真下を通る → その場で 100 点(着地を待たない)
  await setup(page, []);
  await page.keyboard.press('Space');
  let s = await step(page, 12);
  await page.evaluate(() => {
    const d = window.__dp; const g = d.gameForRender().data;
    d.spawnHazard('trash', 'g5', 300);
    const p = g.player;
    window.DP.hazards.zigzag(g.hazards[0], p.x - 6, d.surfaceY('g1', p.x - 6) - 4, 45, 2.7, 1);
    g.hazards[0].passed.add('g5'); g.hazards[0].passed.add('g4'); g.hazards[0].passed.add('g3'); g.hazards[0].passed.add('g2');
  });
  let scoredInAir = false;
  for (let i = 0; i < 50; i++) { s = await step(page, 1); if (s.score === 100 && s.player.state === 'air') scoredInAir = true; }
  expect(s.state).toBe('playing');
  expect(s.score).toBe(100);
  expect(scoredInAir).toBe(true);
});

test('J11. 2〜4 面の飛び越えの得点は今までどおり、真下を通ったその場で 1 体 100 点(2 面のスカル)', async ({ page }) => {
  await page.evaluate(() => {
    const d = window.__dp;
    d.setSeed(1); d.startStage(1, 1);
    let s = d.step(1);
    while (s.state !== 'playing') s = d.step(1);
    d.setSkullsEnabled(false); d.setBossEnabled(false); d.clearEnemies();
    d.placePlayer('mid', 300); d.setFacing(-1);
    d.spawnSkull('mid', 230, { dir: 1, skipSpawn: true });
  });
  await page.keyboard.down('ArrowLeft');
  let s;
  for (let i = 0; i < 200; i++) { s = await step(page, 1); if (s.player.x - s.enemies[0].x <= 30) { await page.keyboard.press('Space'); break; } }
  let scoredInAir = false;
  for (let i = 0; i < 50; i++) { s = await step(page, 1); if (s.score === 100 && s.player.state === 'air') scoredInAir = true; }
  await page.keyboard.up('ArrowLeft');
  expect(s.score).toBe(100);
  expect(scoredInAir).toBe(true);
});
