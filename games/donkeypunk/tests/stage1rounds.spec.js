// ドンキーパンク 1 面の周回難易度(2 個セット・初期配置・連投)のテスト
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { watchConsoleErrors } = require('./helpers');
const { SCENARIOS, SEEDS, traceR1 } = require('./r1trace');

watchConsoleErrors(test);

const FIXTURE = path.join(__dirname, 'fixtures', 'stage1-r1.json');

test('R0. R1 の投げる時刻・種類・瓶と缶の軌跡が改修前と同じ(乱数 3 通り × 主人公の位置 2 通り × 30 秒。改修前のコードで記録した tests/fixtures/stage1-r1.json と 1 ステップ単位で一致)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const now = {};
  for (const sc of SCENARIOS) for (const seed of SEEDS) now[sc.name + '/' + seed] = await traceR1(page, sc, seed);
  if (process.env.RECORD_R1) {
    fs.writeFileSync(FIXTURE, JSON.stringify(now, null, 1));
    return;
  }
  const before = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  expect(Object.keys(now)).toEqual(Object.keys(before));
  for (const k of Object.keys(before)) {
    expect(now[k].throws, k + ' の投げた時刻と種類').toEqual(before[k].throws);
    expect(now[k].hash, k + ' の軌跡の指紋').toBe(before[k].hash);
  }
});

const { step, snap, startAtStage } = require('./helpers');
const { playStage1 } = require('./stage1bot');

// 期待する表(R11 以降は R10 と同じ)。[開幕に続けて投げる本数, 必ず 2 個セットにする番号, 2 個セットの割合, 連投の割合]
// 開幕の本数は、開始時の配置があったころの難しさにそろえるため、R5〜R8 を提案から +1 本した
const TABLE = {
  1: [0, [], 0, 0], 2: [1, [], 0.1, 0], 3: [2, [], 0.15, 0], 4: [2, [2], 0.2, 0.1], 5: [5, [3], 0.25, 0.1],
  6: [5, [3], 0.3, 0.15], 7: [6, [3, 4], 0.35, 0.15], 8: [6, [3, 4], 0.4, 0.2], 9: [6, [4, 5], 0.45, 0.2], 10: [6, [3, 4, 5], 0.5, 0.25],
};
const THROW_X = 104; // ゴリラが瓶・缶を置く位置(g5)

// 1 面を round 周回目で始めてプレイ中にする(ゴリラの投下は止める。ハシゴは降りない)
async function start1(page, round, { keepOpening = false } = {}) {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(([r, keep]) => {
    const d = window.__dp;
    d.setManual(true); d.setSeed(1); d.startStage(0, r);
    d.step(1); d.setBossEnabled(false);
    let s = d.snapshot();
    while (s.state !== 'playing') s = d.step(1);
    if (!keep) d.clearHazards();
    d.setLadderChance(0);
  }, [round, keepOpening]);
  return snap(page);
}
const hz = (s, type) => s.hazards.filter((h) => h.type === type);

const FIXTURE_R2R4 = path.join(__dirname, 'fixtures', 'stage1-r2r4.json');

test('R0b. R2〜R4 の投げる時刻・種類・瓶と缶の軌跡が、ゴミ箱を足す前と同じ(ゴミ箱の出現率 0% の周回では乱数を引かない。tests/fixtures/stage1-r2r4.json と 1 ステップ単位で一致)', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const now = {};
  for (const round of [2, 3, 4]) for (const sc of SCENARIOS) for (const seed of SEEDS) now['R' + round + '/' + sc.name + '/' + seed] = await traceR1(page, sc, seed, round);
  if (process.env.RECORD_R1) {
    fs.writeFileSync(FIXTURE_R2R4, JSON.stringify(now, null, 1));
    return;
  }
  const before = JSON.parse(fs.readFileSync(FIXTURE_R2R4, 'utf8'));
  expect(Object.keys(now)).toEqual(Object.keys(before));
  for (const k of Object.keys(before)) {
    expect(now[k].throws, k + ' の投げた時刻と種類').toEqual(before[k].throws);
    expect(now[k].hash, k + ' の軌跡の指紋').toBe(before[k].hash);
  }
});

test('S1. 周回別の表: R1〜R10 の開幕の連続投げの本数・必ず 2 個セットにする番号・2 個セットの割合・連投の割合が表どおりで、R11・R20・R100 は R10 と同じ。どの周回も開始時の鉄骨の上に瓶・缶はない。速さと投げる間隔の倍率は今のまま', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 100]) {
    const s = await page.evaluate((r) => { const d = window.__dp; d.setManual(true); d.setSeed(1); d.startStage(0, r); return d.step(1); }, r);
    const [openingThrows, openingPairs, pairRate, doubleRate] = TABLE[Math.min(r, 10)];
    const trashRate = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0.1, 6: 0.1, 7: 0.2, 8: 0.2, 9: 0.25, 10: 0.3 }[Math.min(r, 10)]; // ゴミ箱(tests/trash.spec.js)
    expect(s.boss.rules, `R${r}`).toEqual({ openingThrows, openingPairs, pairRate, doubleRate, trashRate });
    expect(s.hazards, `R${r} の開始時`).toEqual([]);
  }
  // 速さと投げる間隔の倍率(game.js の difficulty())は今のまま
  const diff = await page.evaluate(() => [1, 2, 5, 10].map((r) => { const d = window.__dp; d.startStage(0, r); d.step(1); return d.gameForRender().data.boss.speedMul; }));
  expect(diff).toEqual([1, 1.15, 1.6, 1.8]);
});

test('S2. 2 個セットの形: 瓶 2 個は 4px 重なって全長 32px(高さ 9)、缶 2 個は 3px 重なって 21px(高さ 12)。単体と同じ速さで転がり、2 個が少し重なったドット絵で描かれる', async ({ page }) => {
  await start1(page, 2);
  await page.evaluate(() => { const d = window.__dp; d.placePlayer('top', 300); d.spawnHazard('bottle2', 'g3', 120); d.spawnHazard('can2', 'g1', 120); d.spawnHazard('bottle', 'g3', 60); d.spawnHazard('can', 'g1', 60); });
  const a = await snap(page);
  const b = await step(page, 10);
  const pick = (s, type, g) => s.hazards.find((h) => h.type === type && h.girder === g);
  expect(pick(a, 'bottle2', 'g3').box).toMatchObject({ w: 32, h: 9 });
  expect(pick(a, 'can2', 'g1').box).toMatchObject({ w: 21, h: 12 });
  // 同じ 10 ステップで進む距離が単体と同じ
  const dist = (type, g) => pick(b, type, g).x - pick(a, type, g).x;
  expect(dist('bottle2', 'g3')).toBeCloseTo(dist('bottle', 'g3'), 6);
  expect(dist('can2', 'g1')).toBeCloseTo(dist('can', 'g1'), 6);
  // 描画: 2 個セットの所に、単体よりずっと多くの瓶の緑(#1f8a3a)のドットがある
  await page.waitForTimeout(60);
  const px = await page.evaluate(() => {
    const s = window.__dp.snapshot();
    const ctx = document.querySelector('canvas').getContext('2d');
    const count = (h, rgb) => {
      const data = ctx.getImageData(Math.round(h.x - 24), Math.round(h.y - 16), 48, 18).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2]) n++;
      return n;
    };
    const one = (t, g) => s.hazards.find((h) => h.type === t && h.girder === g);
    return { pair: count(one('bottle2', 'g3'), [0x1f, 0x8a, 0x3a]), single: count(one('bottle', 'g3'), [0x1f, 0x8a, 0x3a]), canPair: count(one('can2', 'g1'), [0xe0, 0x2a, 0x2a]), can: count(one('can', 'g1'), [0xe0, 0x2a, 0x2a]) };
  });
  expect(px.pair).toBeGreaterThan(px.single * 1.5);
  expect(px.canPair).toBeGreaterThan(px.can * 1.3);
});

test('S3. ハシゴ・パターン A: 2 個とも縦に重なって降り(当たり判定は瓶 18×16 / 缶 12×21)、下の鉄骨に着いたら横並び(32×9 / 21×12)に戻ってその段の低い側へ転がる', async ({ page }) => {
  for (const [type, stack, row] of [['bottle2', { w: 18, h: 16 }, { w: 32, h: 9 }], ['can2', { w: 12, h: 21 }, { w: 21, h: 12 }]]) {
    await start1(page, 5);
    await page.evaluate((type) => {
      const d = window.__dp;
      d.placePlayer('top', 300);
      window.DP.config.hazard.pair.splitChance = 0; // 必ずパターン A
      d.setLadderChance(1);
      d.spawnHazard(type, 'g3', 150); // g3 を右へ → x=184 のハシゴで g2 へ
    }, type);
    let s; let sawStack = false;
    for (let i = 0; i < 200; i++) {
      s = await step(page, 1);
      const h = s.hazards[0];
      expect(s.hazards.length, type + ' は分かれない').toBe(1);
      if (h.state === 'ladder') { sawStack = true; expect(h.box, type).toMatchObject(stack); expect(h.x).toBe(184); }
      if (sawStack && h.state === 'roll') break;
    }
    const h = s.hazards[0];
    expect(sawStack).toBe(true);
    expect([h.type, h.state, h.girder, h.dir]).toEqual([type, 'roll', 'g2', -1]);
    expect(h.box).toMatchObject(row);
    await page.evaluate(() => { window.DP.config.hazard.pair.splitChance = 0.5; window.__dp.setLadderChance(null); });
  }
});

test('S4. ハシゴ・パターン B: 前の 1 個だけハシゴを降り、後ろの 1 個は鉄骨を転がり続ける。2 個は同じセットの片割れ(単体の大きさ)になり、それぞれ自然に動く(後ろの 1 個は同じハシゴを降りない)', async ({ page }) => {
  await start1(page, 5);
  await page.evaluate(() => {
    const d = window.__dp;
    d.placePlayer('top', 300);
    window.DP.config.hazard.pair.splitChance = 1; // 必ずパターン B
    d.setLadderChance(1);
    d.spawnHazard('bottle2', 'g3', 150);
  });
  let s;
  for (let i = 0; i < 100; i++) { s = await step(page, 1); if (s.hazards.length === 2) break; }
  expect(s.hazards.length).toBe(2);
  const [a, b] = s.hazards;
  expect(a.pairGroup).toBe(b.pairGroup);
  expect(s.hazards.every((h) => h.type === 'bottle' && h.piece && h.box.w === 18 && h.box.h === 9)).toBe(true);
  const front = s.hazards.find((h) => h.state === 'ladder');
  const rear = s.hazards.find((h) => h.state === 'roll');
  expect(front.x).toBe(184);
  expect(rear.girder).toBe('g3');
  expect(rear.x).toBeLessThan(184); // 後ろ(左)にいた 1 個
  // このあとはハシゴを降りない設定に戻して、それぞれを追う: 前は g2 に着いて左へ、後ろは g3 を右へ(x=184 は越えていく)
  await page.evaluate(() => { window.__dp.setLadderChance(0); window.DP.config.hazard.pair.splitChance = 0.5; });
  for (let i = 0; i < 60; i++) s = await step(page, 1);
  const f2 = s.hazards.find((h) => h.id === front.id);
  const r2 = s.hazards.find((h) => h.id === rear.id);
  expect([f2.state, f2.girder, f2.dir]).toEqual(['roll', 'g2', -1]);
  expect([r2.state, r2.girder]).toEqual(['roll', 'g3']);
  expect(r2.x).toBeGreaterThan(200);
  await page.evaluate(() => window.__dp.setLadderChance(null));
});

test('S5. 分かれた片割れ: 当たり判定は単体と同じで、触れるとミス。飛び越えると単体と同じく 1 個と数える(1 個だけなら 100 点。複数同時の数え方は tests/jumpcombo.spec.js)、釘バットで壊すと 1 個 150 点(1 個で 300 点は入らない)', async ({ page }) => {
  test.setTimeout(90000);
  // 片割れを作る(g3 の x=184 で分かれる)
  const makePieces = async () => {
    await start1(page, 2);
    await page.evaluate(() => {
      const d = window.__dp;
      d.placePlayer('top', 300);
      window.DP.config.hazard.pair.splitChance = 1;
      d.setLadderChance(1);
      d.spawnHazard('bottle2', 'g3', 150);
    });
    let s;
    for (let i = 0; i < 100; i++) { s = await step(page, 1); if (s.hazards.length === 2) break; }
    await page.evaluate(() => { window.__dp.setLadderChance(0); window.DP.config.hazard.pair.splitChance = 0.5; });
    return s;
  };
  // 飛び越え: g3 を右へ転がる後ろの 1 個に、右から歩いて近づいて跳ぶ
  let s = await makePieces();
  const rear = s.hazards.find((h) => h.state === 'roll');
  await page.evaluate(() => { window.__dp.placePlayer('g3', 380); window.__dp.setFacing(-1); });
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 200; i++) {
    s = await step(page, 1);
    const h = s.hazards.find((q) => q.id === rear.id);
    if (h && s.player.state === 'ground' && s.player.x - h.x <= 55) { await page.keyboard.press('Space'); break; }
  }
  for (let i = 0; i < 60; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowLeft');
  expect(s.state).toBe('playing');
  expect(s.score).toBe(100); // 1 回のジャンプで 1 個 = 100 点(着地したとき)
  expect(s.popups).toContain('100');
  // 釘バット: g2 を左へ転がる前の 1 個を、左で待って壊す
  const front = s.hazards.find((h) => h.girder === 'g2');
  await page.evaluate((x) => { const d = window.__dp; d.placePlayer('g2', x - 50); d.setFacing(1); d.setBat(600); }, front.x);
  for (let i = 0; i < 60; i++) { s = await step(page, 1); if (!s.hazards.some((h) => h.id === front.id)) break; }
  expect(s.hazards.some((h) => h.id === front.id)).toBe(false);
  expect(s.score).toBe(250); // 飛び越え 100 + 釘バット 150(釘バットでも 1 個で 300 点は入らない)
  // 当たり判定: 片割れに触れるとミス
  s = await makePieces();
  const piece = s.hazards.find((h) => h.state === 'roll');
  await page.evaluate((x) => window.__dp.placePlayer('g3', x + 12), piece.x);
  s = await step(page, 3);
  expect(s.state).toBe('dying');
});

// 2 個セット(R2)に向かって歩きながら、距離 dist で跳ぶ(本物のキーボード)
async function jumpPair(page, type, dist) {
  await start1(page, 2);
  await page.evaluate((type) => { const d = window.__dp; d.placePlayer('g1', 330); d.setFacing(-1); d.spawnHazard(type, 'g1', 150); window.__dp.clearSounds(); }, type);
  await page.keyboard.down('ArrowLeft');
  let s;
  for (let i = 0; i < 200; i++) {
    s = await step(page, 1);
    const h = s.hazards[0];
    if (s.player.x - h.x <= dist) { await page.keyboard.press('Space'); break; }
  }
  for (let i = 0; i < 80 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowLeft');
  return s;
}

test('S6. ジャンプで 2 個セットを 2 個とも飛び越えると 300 点(1 回だけ。100 点は入らない)。瓶 2 個・缶 2 個とも、向かって歩きながら跳べば越えられる', async ({ page }) => {
  for (const [type, dist] of [['bottle2', 58], ['can2', 50]]) {
    const s = await jumpPair(page, type, dist);
    expect(s.state, type).toBe('playing');
    expect(s.score, type).toBe(300);
    expect(s.popups.filter((t) => t === '300').length, type).toBe(1);
    expect(s.popups, type).not.toContain('100');
    expect(s.hazards[0].jumpedOver).toBe(true);
    expect((await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'score').length, type).toBe(1);
  }
});

test('S6b. 跳ぶのが遅れて後ろの 1 個に当たったら、ミスになって 300 点は入らない(真上は通っていても)', async ({ page }) => {
  const s = await jumpPair(page, 'bottle2', 92);
  expect(s.state).toBe('dying');
  expect(s.score).toBe(0);
});

test('S7. 釘バットで 2 個セットを壊すと 300 点(1 回だけ)。割れる演出は 2 個ぶん、破壊音は 1 回。縦に重なってハシゴを降りている間も同じ', async ({ page }) => {
  await start1(page, 5);
  await page.evaluate(() => { const d = window.__dp; d.placePlayer('g1', 330); d.setFacing(-1); d.setBat(600); d.spawnHazard('bottle2', 'g1', 200); d.clearSounds(); });
  let s;
  for (let i = 0; i < 120; i++) { s = await step(page, 1); if (!s.hazards.length) break; }
  expect(s.hazards.length).toBe(0);
  expect(s.score).toBe(300);
  expect((await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'smash').length).toBe(1);
  const fx = await page.evaluate(() => window.__dp.gameForRender().data.effects.filter((e) => e.type === 'bottle').length);
  expect(fx).toBe(2);
  // 縦に重なってハシゴを降りている 2 個セットも、2 個まとめて 300 点
  await start1(page, 5);
  await page.evaluate(() => {
    const d = window.__dp;
    window.DP.config.hazard.pair.splitChance = 0;
    d.setLadderChance(1);
    d.placePlayer('top', 300);
    d.spawnHazard('can2', 'g3', 150);
  });
  for (let i = 0; i < 100; i++) { s = await step(page, 1); if (s.hazards[0].state === 'ladder') break; }
  await page.evaluate(() => { const d = window.__dp; window.DP.config.hazard.pair.splitChance = 0.5; d.setLadderChance(null); d.placePlayer('g2', 164); d.setFacing(1); d.setBat(600); d.clearSounds(); });
  for (let i = 0; i < 60; i++) { s = await step(page, 1); if (!s.hazards.length) break; }
  expect(s.hazards.length).toBe(0);
  expect(s.score).toBe(300);
  expect((await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'smash').length).toBe(1);
});

test('S8. 連投: 同じ種類を続けて投げ、2 本の端と端の間隔は 140px 以上。2 本それぞれに 2 個セットの抽選があり、2 個セット同士でも間隔は保たれる', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  // R10 で、連投と 2 個セットの割合をテスト用に変えて、投げた直後の 2 本の間隔を測る
  for (const pairRate of [0, 1, 0.5]) {
    const res = await page.evaluate((pairRate) => {
      const d = window.__dp;
      d.setManual(true); d.setSeed(5); d.startStage(0, 10);
      let s = d.step(1);
      while (s.state !== 'playing') s = d.step(1);
      d.clearHazards(); d.setLadderChance(0); d.placePlayer('top', 300);
      const g = d.gameForRender().data;
      g.boss.rules = Object.assign({}, g.boss.rules, { pairRate, doubleRate: 1, trashRate: 0 }); // ゴミ箱(連投しない)は出さない
      g.boss.opening = null; // 開幕の連続投げは止めて、連投だけを見る
      const out = [];
      const spawned = [];
      for (let t = 0; t < 2400; t++) {
        s = d.step(1);
        for (const h of s.hazards) if (!spawned.find((q) => q.id === h.id)) spawned.push({ id: h.id, type: h.type, t });
        // 2 本目が出た瞬間に、1 本目との端と端の間隔を測る
        const last = spawned[spawned.length - 1];
        if (last && last.t === t && spawned.length % 2 === 0) {
          const a = s.hazards.find((h) => h.id === spawned[spawned.length - 2].id);
          const b = s.hazards.find((h) => h.id === last.id);
          if (a && b && a.state === 'roll' && a.girder === b.girder) out.push({ types: [a.type, b.type], gap: (a.x - a.box.w / 2) - (b.x + b.box.w / 2), dt: t - spawned[spawned.length - 2].t });
        }
      }
      return out;
    }, pairRate);
    expect(res.length, `pairRate ${pairRate}`).toBeGreaterThan(3);
    for (const r of res) {
      expect(r.types[0].replace('2', ''), JSON.stringify(r)).toBe(r.types[1].replace('2', '')); // 同じ種類
      expect(r.gap, JSON.stringify(r)).toBeGreaterThanOrEqual(139.9);
      expect(r.gap, JSON.stringify(r)).toBeLessThan(150);
    }
    if (pairRate === 1) expect(res.every((r) => r.types.every((t) => t.endsWith('2')))).toBe(true);
    if (pairRate === 0) expect(res.every((r) => r.types.every((t) => !t.endsWith('2')))).toBe(true);
  }
});

test('S9. R10・R20・R100 で長く動かしても物理が破綻しない: 瓶・缶は鉄骨の端で落ちて下の段に着地し、画面の外へ出るのは最下段の左端からだけ。分かれた片割れも同じ。止まったまま・落ちたままのものはない', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./?test&dev&inv=1'); // 主人公は無敵(瓶・缶の動きだけを見る)
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const round of [10, 20, 100]) {
    const r = await page.evaluate((round) => {
      const d = window.__dp;
      d.setManual(true); d.setSeed(round); d.startStage(0, round);
      let s = d.step(1);
      while (s.state !== 'playing') s = d.step(1);
      d.placePlayer('top', 300);
      const prev = new Map();
      const bad = [];
      const stats = { exits: 0, splits: 0, pairs: 0, maxFall: 0 };
      const fallLen = new Map();
      const still = new Map();
      for (let t = 0; t < 3600; t++) {
        s = d.step(1);
        const now = new Map(s.hazards.map((h) => [h.id, h]));
        for (const h of s.hazards) {
          if (h.type.endsWith('2')) stats.pairs++;
          if (h.state === 'fall') { fallLen.set(h.id, (fallLen.get(h.id) || 0) + 1); stats.maxFall = Math.max(stats.maxFall, fallLen.get(h.id)); } else fallLen.delete(h.id);
          const p = prev.get(h.id);
          if (p && h.state === 'roll' && Math.abs(p.x - h.x) < 0.01) still.set(h.id, (still.get(h.id) || 0) + 1); else still.delete(h.id);
          if ((still.get(h.id) || 0) > 30) bad.push('止まっている ' + JSON.stringify(h));
          // 最下段から出ていく途中以外は、画面の左右の端の内側
          const leaving = h.y >= 527 && h.x < 20;
          if (!leaving && (h.x < -1 || h.x > 481)) bad.push('画面の外 ' + JSON.stringify(h));
        }
        for (const [id, p] of prev) {
          if (now.has(id)) continue;
          if (s.hazards.some((h) => h.pairGroup === id)) { stats.splits++; continue; } // パターン B で分かれた
          if (p.x < 10 && p.y >= 527) { stats.exits++; continue; } // 最下段の左端から出た
          if (p.type === 'trash' && p.y > 540) continue; // ゴミ箱(ジグザグ落下)は最下段の下へ抜けて消える
          bad.push('途中で消えた ' + JSON.stringify(p));
        }
        prev.clear();
        for (const h of s.hazards) prev.set(h.id, h);
      }
      return { bad: bad.slice(0, 5), stats };
    }, round);
    expect(r.bad, `R${round}`).toEqual([]);
    expect(r.stats.exits, `R${round}`).toBeGreaterThan(5);
    expect(r.stats.pairs, `R${round}`).toBeGreaterThan(0);
    expect(r.stats.maxFall, `R${round}`).toBeLessThan(120);
  }
});

test('S10. 開始直後に回避不能な衝突はない: R2〜R10 で、開幕の連続投げが始まってもスタート地点に 3 秒立っていれば当たらない(乱数 3 通り)', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (let round = 2; round <= 10; round++) {
    for (const seed of [1, 2, 3]) {
      const st = await page.evaluate(([round, seed]) => {
        const d = window.__dp;
        d.setManual(true); d.setSeed(seed); d.startStage(0, round);
        let s = d.step(1);
        while (s.state !== 'playing') s = d.step(1);
        for (let t = 0; t < 180 && s.state === 'playing'; t++) s = d.step(1);
        return s.state;
      }, [round, seed]);
      expect(st, `R${round} 乱数 ${seed}`).toBe('playing');
    }
  }
});

// 無敵なしの自動プレイ(tests/stage1bot.js)。乱数を決めているので結果は毎回同じ。
// R5 はゴミ箱がジグザグ落下になってから 7/8(残る 1 通りは、ハシゴの途中で、登り始めたあとに投げられたゴミ箱に当たる。
// 人ならゴリラが持ち上げるのを見て待てるが、自動プレイはまだ投げていない物を予測できない)。R10 は 8/8
for (const [round, need] of [[1, 8], [5, 7], [10, 6]]) {
  test(`S11-R${round}. 無敵なしでクリアできる: R${round} を自動プレイ(瓶・缶をよけて進む)で、乱数 8 通りのうち ${need} 通り以上を残機のうちにクリア`, async ({ page }) => {
    test.setTimeout(300000);
    await page.goto('./?test');
    await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
    const results = [];
    for (let seed = 1; seed <= 8; seed++) results.push(await playStage1(page, { round, seed }));
    const cleared = results.filter((r) => r.state === 'escape').length;
    expect(cleared, JSON.stringify(results.map((r) => [r.state, r.deaths]))).toBeGreaterThanOrEqual(need);
  });
}

test('S12. 2〜4 面には周回の表も 2 個セットもない(ゴリラの rules は null、開始時の瓶・缶もない)', async ({ page }) => {
  for (const stage of [1, 2, 3]) {
    const s = await startAtStage(page, stage);
    expect(s.boss.rules, `${stage + 1} 面`).toBe(null);
    expect(s.hazards, `${stage + 1} 面`).toEqual([]);
  }
  // R10 の 2〜4 面も同じ
  for (const stage of [1, 2, 3]) {
    const s = await page.evaluate((i) => { const d = window.__dp; d.startStage(i, 10); return d.step(1); }, stage);
    expect(s.boss.rules).toBe(null);
    expect(s.hazards).toEqual([]);
  }
});

test('S13. どの周回でも、開始時(READY の間・プレイが始まった瞬間)とミス後の再開時に、鉄骨の上に瓶・缶はない', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const r of [1, 2, 5, 10, 20, 100]) {
    const res = await page.evaluate((r) => {
      const d = window.__dp;
      d.setManual(true); d.setSeed(2); d.startStage(0, r);
      const counts = [];
      let s = d.step(1);
      while (s.state !== 'playing') { counts.push(s.hazards.length); s = d.step(1); }
      counts.push(s.hazards.length); // プレイが始まった瞬間
      // しばらく進めて瓶・缶が出てからミスする → 再開の READY とプレイの始まり
      for (let i = 0; i < 300; i++) s = d.step(1);
      const before = s.hazards.length;
      d.killPlayer('hazard');
      const after = [];
      for (let i = 0; i < 400; i++) { s = d.step(1); if (s.state === 'ready' || (s.state === 'playing' && after.length)) after.push(s.hazards.length); if (s.state === 'playing') break; }
      return { counts, before, after, state: s.state };
    }, r);
    expect(res.counts.every((n) => n === 0), `R${r} の開始時`).toBe(true);
    expect(res.before, `R${r} はミスの前に瓶・缶が出ている`).toBeGreaterThan(0);
    expect(res.after.length, `R${r}`).toBeGreaterThan(0);
    expect(res.after.every((n) => n === 0), `R${r} のミス後の再開`).toBe(true);
  }
});

test('S14. 瓶・缶はすべてゴリラが投げて出る(g5 の x=104 に、ゴリラが転がした瞬間に出る。R5 以降のゴミ箱は同じ瞬間にゴリラの頭の上から斜めに飛び出す)。例外は 2 個セットがハシゴで分かれた片割れだけ。R1・R2・R5・R10・R100 で長く動かしても、それ以外の場所に突然出ない', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./?test&dev&inv=1');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const r of [1, 2, 5, 10, 100]) {
    const res = await page.evaluate(([r, X]) => {
      const d = window.__dp;
      d.setManual(true); d.setSeed(r + 3); d.startStage(0, r);
      let s = d.step(1);
      while (s.state !== 'playing') s = d.step(1);
      d.placePlayer('top', 300);
      const seen = new Set();
      const bad = [];
      let thrown = 0, pieces = 0;
      let prevBoss = s.boss.state;
      for (let t = 0; t < 3000; t++) {
        s = d.step(1);
        for (const h of s.hazards) {
          if (seen.has(h.id)) continue;
          seen.add(h.id);
          if (h.piece) { pieces++; continue; } // パターン B で分かれた片割れ
          // ゴリラが持ち上げた状態(grab)から転がす(throw)に変わった瞬間に、g5 の x=104(から 1 ステップ進んだ所)に出る
          const thrownNow = s.boss.state === 'throw' && prevBoss === 'grab';
          const fromBoss = thrownNow && (h.type === 'trash'
            ? h.state === 'zigzag' && h.x > s.boss.x + 18 && h.x < s.boss.x + 24 && h.y < s.boss.y - 50 // ゴミ箱: 頭の上からジグザグ落下で
            : h.girder === 'g5' && Math.abs(h.x - X) < 4);
          if (fromBoss) thrown++; else bad.push(JSON.stringify({ t, h, boss: s.boss.state, prevBoss }));
        }
        prevBoss = s.boss.state;
      }
      return { bad: bad.slice(0, 3), thrown, pieces };
    }, [r, THROW_X]);
    expect(res.bad, `R${r}`).toEqual([]);
    expect(res.thrown, `R${r}`).toBeGreaterThan(8);
  }
});

test('S15. 開幕の連続投げ(R2 以降): プレイが始まるとすぐ持ち上げて投げ、表の本数を同じ種類で続けて投げる(端と端は 140px 以上)。表の番号は必ず 2 個セット。ゴリラの持ち上げる → 転がす動きを使う。終わったら通常の間隔に戻る。ミス後の再開でもやり直す。R1 は今までどおり 90 ステップ目に 1 本目', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./?test&dev&inv=1');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const r of [1, 2, 4, 5, 7, 10, 20]) {
    for (const seed of [1, 2, 3]) {
      const res = await page.evaluate(([r, seed]) => {
        const d = window.__dp;
        d.setManual(true); d.setSeed(seed); d.startStage(0, r);
        let s = d.step(1);
        while (s.state !== 'playing') s = d.step(1);
        d.placePlayer('top', 300); d.setLadderChance(0);
        const throws = [];
        const seen = new Set();
        let grabbedBefore = true;
        for (let t = 1; t <= 900; t++) {
          const prev = s;
          s = d.step(1);
          for (const h of s.hazards) {
            if (seen.has(h.id) || h.piece) continue;
            seen.add(h.id);
            // 直前のステップでゴリラが持ち上げていた物と同じ種類か
            if (!(prev.boss.state === 'grab' && prev.boss.holding === h.type)) grabbedBefore = false;
            throws.push({ t, type: h.type, id: h.id });
          }
          // 1 本目と 2 本目…が g5 を転がっている間の、端と端の間隔
          for (let i = 1; i < throws.length && i < 8; i++) {
            const a = s.hazards.find((h) => h.id === throws[i - 1].id);
            const b = s.hazards.find((h) => h.id === throws[i].id);
            if (a && b && a.girder === 'g5' && b.girder === 'g5' && a.state === 'roll' && b.state === 'roll') throws[i].gap = Math.min(throws[i].gap ?? 1e9, (a.x - a.box.w / 2) - (b.x + b.box.w / 2));
          }
        }
        d.setLadderChance(null);
        return { throws, grabbedBefore, rules: s.boss.rules };
      }, [r, seed]);
      const [n, pairs] = TABLE[Math.min(r, 10)];
      const label = `R${r} 乱数 ${seed}`;
      expect(res.grabbedBefore, label + ' ゴリラが持ち上げた物を転がしている').toBe(true);
      if (n === 0) {
        expect(res.throws[0].t, label).toBe(90); // R1: 今までどおり
        continue;
      }
      expect(res.throws[0].t, label + ' すぐ投げる').toBe(31); // 持ち上げ 30 ステップのあと
      const opening = res.throws.slice(0, n);
      const base = opening[0].type.replace('2', '');
      opening.forEach((th, i) => {
        expect(th.type.replace('2', ''), `${label} ${i + 1} 本目は同じ種類`).toBe(base);
        if (pairs.includes(i + 1)) expect(th.type, `${label} ${i + 1} 本目は 2 個セット`).toBe(base + '2');
        if (i > 0) expect(th.gap, `${label} ${i + 1} 本目との間隔`).toBeGreaterThanOrEqual(139.9);
      });
      // 開幕の連続投げのあとは、通常の間隔(55 ステップ以上の待ち + 持ち上げ・転がす)に戻る
      if (res.throws.length > n) expect(res.throws[n].t - res.throws[n - 1].t, label + ' 通常の間隔').toBeGreaterThanOrEqual(55 + 54);
    }
  }
  // ミス後の再開でも、開幕の連続投げをやり直す
  const again = await page.evaluate(() => {
    const d = window.__dp;
    d.gameForRender().data.devInvincible = false;
    d.setSeed(4); d.startStage(0, 10);
    let s = d.step(1);
    while (s.state !== 'playing') s = d.step(1);
    for (let i = 0; i < 400; i++) s = d.step(1);
    d.killPlayer('hazard');
    s = d.step(1);
    while (s.state !== 'playing') s = d.step(1);
    const t0 = [];
    const seen = new Set(s.hazards.map((h) => h.id));
    for (let t = 1; t <= 600; t++) { s = d.step(1); for (const h of s.hazards) if (!seen.has(h.id) && !h.piece) { seen.add(h.id); t0.push(t); } }
    return t0;
  });
  expect(again[0]).toBe(31);
  // 6 本が短い間隔で続く(通常の間隔なら 109 ステップ以上あく)
  for (let i = 1; i < 6; i++) expect(again[i] - again[i - 1]).toBeLessThan(109);
});
