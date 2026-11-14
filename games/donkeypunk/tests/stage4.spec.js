// ドンキーパンク 4 面「決戦のやぐら」のテスト
// 第 1 段階: 鉄骨・ハシゴ・安全ピン 8 本・ゴリラ警官・ガールの配置(R1〜R8)
// 第 2 段階: ピンを抜く・足場に穴が開く・穴を跳び越える・得点、どの順番でも詰まないこと(R9〜R14)
// 第 3 段階: 8 本目で鉄骨崩壊 → 拳銃乱射(約 3 秒)→ ゴリラ落下 → ガール救出 → ROUND CLEAR → 次の周回の 1 面(R15〜R20)。雑魚敵なし
// ミス後の再挑戦: 抜いたピンと穴はミスしても残る。新しいゲーム・次の周回では元に戻る(R14・R21〜R24)
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage, walkTo, climb, passIntermission, leaveClear } = require('./helpers');

watchConsoleErrors(test);

const STAGE4 = 3; // 4 面の番号(0 始まり)
// 取ったボーナスアイテムの得点の合計(自動操作の道すじがアイテムの上を通ることがあるので、ピンの得点を確かめるときに差し引く)
const prizeScore = (s) => (s.prizes || []).filter((p) => p.taken).reduce((a, p) => a + p.score, 0);
const level = (page) => page.evaluate(() => window.__dp.level());
const stageData = (page) => page.evaluate(() => window.DP.stages[3]);

test('R1. 4 面は stageIds の 4 番目で、通常の並び 1 → 2 → 3 → 4 → 1 に入っている(devOnly は外した)。開発用ショートカットとテスト補助からも始められる', async ({ page }) => {
  const s = await startAtStage(page, STAGE4);
  expect(await page.evaluate(() => window.__dp.stageIds())).toEqual(['girders', 'livehouse', 'squat', 'rivets']);
  expect(s.stageId).toBe('rivets');
  expect(s.state).toBe('playing');
  const st = await stageData(page);
  expect(st.devOnly).toBeUndefined();
  expect(st.name).toBe('STAGE 4');
  expect(st.mechanics).toEqual(['pins', 'cops', 'prizes']); // 安全ピン・雑魚敵「怒ったポリスマン」(tests/cops.spec.js)・ボーナスアイテム(tests/prizes.spec.js)
});

test('R2. 床は地面 + F1〜F4 + ガールの足場で、段の間隔は 95px。ハシゴは隣の段どうしをつなぎ、地面から F4 の左右(ゴリラの両側)まで登れる。ガールの足場と F4 の中央(ゴリラ)へはハシゴが届かない', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const lv = await level(page);
  const byId = Object.fromEntries(lv.girders.map((g) => [g.id, g]));
  expect(['f0', 'F1', 'F2', 'F3', 'F4', 'top'].map((id) => byId[id].y1)).toEqual([540, 445, 350, 255, 160, 82]);
  for (const g of lv.girders) expect(g.y1).toBe(g.y2); // すべて平ら
  const order = ['f0', 'F1', 'F2', 'F3', 'F4'];
  for (let i = 1; i < order.length; i++) expect(byId[order[i - 1]].y1 - byId[order[i]].y1).toBe(95);
  // ハシゴは隣の段どうし(下の床・上の床の上にある)
  for (const l of lv.ladders) {
    expect(order.indexOf(l.upper) - order.indexOf(l.lower), `x=${l.x}`).toBe(1);
    for (const id of [l.lower, l.upper]) {
      expect(l.x).toBeGreaterThanOrEqual(byId[id].x1 + 7);
      expect(l.x).toBeLessThanOrEqual(byId[id].x2 - 7);
    }
  }
  expect(lv.ladders.some((l) => l.upper === 'top')).toBe(false); // ガールの足場へのハシゴはない
  // F4 へのハシゴはゴリラ(x=240、当たり判定の幅 40)から十分離れていて、左右に 1 本ずつ
  const toF4 = lv.ladders.filter((l) => l.upper === 'F4').map((l) => l.x).sort((a, b) => a - b);
  expect(toF4.length).toBe(2);
  expect(toF4[0]).toBeLessThan(240 - 20 - 40);
  expect(toF4[1]).toBeGreaterThan(240 + 20 + 40);
  // 各段で、ハシゴの数は 2〜3 本
  for (let i = 1; i < order.length; i++) {
    const n = lv.ladders.filter((l) => l.upper === order[i]).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
  }
});

test('R3. 安全ピンは 8 本(F1〜F4 に 2 本ずつ)。どの段も左右対称の位置ではない。ピンの穴(x±12)は床の内側にあり、ハシゴはピンの穴の端から 20px 以上離れている(第 2 段階でピンが抜けてもハシゴは切れない)。ゴリラは F4 の 2 本のピンの間', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const st = await stageData(page);
  const lv = await level(page);
  const byId = Object.fromEntries(lv.girders.map((g) => [g.id, g]));
  expect(st.pins.length).toBe(8);
  expect(new Set(st.pins.map((p) => p.id)).size).toBe(8);
  for (const f of ['F1', 'F2', 'F3', 'F4']) {
    const xs = st.pins.filter((p) => p.girder === f).map((p) => p.x).sort((a, b) => a - b);
    expect(xs.length, f).toBe(2);
    // 画面の中央(x=240)について左右対称でない
    expect(xs[0] + xs[1], f).not.toBe(480);
    for (const x of xs) {
      expect(x - 12, f).toBeGreaterThan(byId[f].x1 + 7);
      expect(x + 12, f).toBeLessThan(byId[f].x2 - 7);
    }
  }
  // ハシゴの上下の端は、その床のピンの穴の端から 20px 以上離れている
  for (const l of lv.ladders) {
    for (const p of st.pins) {
      if (p.girder !== l.lower && p.girder !== l.upper) continue;
      expect(Math.abs(l.x - p.x), `ハシゴ x=${l.x} とピン ${p.id}(x=${p.x})`).toBeGreaterThanOrEqual(12 + 20);
    }
  }
  // ゴリラ(当たり判定 幅 40)は F4 の 2 本のピンの間
  const f4 = st.pins.filter((p) => p.girder === 'F4').map((p) => p.x).sort((a, b) => a - b);
  expect(st.boss.girder).toBe('F4');
  expect(f4[0] + 12).toBeLessThan(st.boss.x - 20);
  expect(f4[1] - 12).toBeGreaterThan(st.boss.x + 20);
});

test('R4. ゴリラ警官は最上段 F4 の中央、ガールはその上の足場に最初からいる。ゴリラに触れると 1 ミス', async ({ page }) => {
  let s = await startAtStage(page, STAGE4);
  expect([s.boss.x, s.boss.y]).toEqual([240, 160]);
  expect([s.heroine.x, s.heroine.y]).toEqual([210, 82]);
  // F4 の左からゴリラへ歩いていくと当たる(本物のキーボード)
  await page.evaluate(() => window.__dp.placePlayer('F4', 170));
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 80 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('boss');
});

// 本物のキーボードで、地面から指定のハシゴを順に登る。route: [ハシゴの x, ...](下から順)
async function climbRoute(page, route) {
  let s;
  for (const x of route) {
    s = await walkTo(page, x);
    expect(s.state).toBe('playing');
    s = await climb(page, 'ArrowUp');
    expect(s.state).toBe('playing');
    expect(s.player.state).toBe('ground');
  }
  return s;
}

test('R5. 本物のキーボード操作だけで、地面から F4 の左(ゴリラの左)と右(ゴリラの右)まで登れる(途中でピンの上を歩いて通ると、そのピンは抜ける)', async ({ page }) => {
  test.setTimeout(120000);
  // 左ルート: 地面 x56 → F1 x88 → F2 x152 → F3 x72(F3 でピン p5 の上を通るので p5 が抜ける)→ F4 の左
  await startAtStage(page, STAGE4);
  let s = await climbRoute(page, [56, 88, 152, 72]);
  expect(s.player.girder).toBe('F4');
  expect(s.player.x).toBeLessThan(240 - 40);
  expect(s.pins.filter((p) => p.pulled).map((p) => p.id)).toEqual(['p5']);
  // 右ルート: 地面 x432 → F1 x424 → F2 x360(F2 でピン p4 の上を通る)→ F3 x400 → F4 の右
  await startAtStage(page, STAGE4);
  s = await climbRoute(page, [432, 424, 360, 400]);
  expect(s.player.girder).toBe('F4');
  expect(s.player.x).toBeGreaterThan(240 + 40);
  // 右ルートで通ったピンは p4(F2)だけ
  expect(s.pins.filter((p) => p.pulled).map((p) => p.id)).toEqual(['p4']);
});

test('R6. ガールの足場には跳んでも届かない(F4 から 78px 上。ジャンプの最高点は約 38px)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  for (const x of [180, 200]) {
    // ゴリラの左側で、ガールの足場の真下に近い所から真上に跳ぶ(ゴリラの当たり判定 x 220〜260 には入らない)
    await page.evaluate((px) => window.__dp.placePlayer('F4', px), x);
    await page.keyboard.press('Space');
    let s = await step(page, 1);
    let minY = Infinity;
    for (let i = 0; i < 80 && (s.player.state !== 'ground' || i < 3); i++) { s = await step(page, 1); minY = Math.min(minY, s.player.y); }
    expect(s.player.girder).toBe('F4');
    expect(160 - minY).toBeLessThan(78);
  }
});

test('R7. 4 面の画面: 赤錆の鉄骨と、ピンの位置に黄色い留め金が描かれる。ゴリラとガールも描かれる', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.waitForTimeout(80);
  const st = await stageData(page);
  const at = (x, y) => page.evaluate(([px, py]) => Array.from(document.getElementById('game').getContext('2d').getImageData(px, py, 1, 1).data.slice(0, 3)).join(','), [x, y]);
  // 鉄骨の本体(girderColors.body = #b0482a)。ピンから離れ、筋交いの黒い点(16px ごとの +3・+7・+11)を避けた所で、上面から 3px 下
  expect(await at(208, 445 + 3)).toBe('176,72,42');
  // ピンの留め金(#ffd23c)。継ぎ目の線(中心の 2px)を避けて、中心から 6px 横
  for (const p of st.pins) {
    const y = { F1: 445, F2: 350, F3: 255, F4: 160 }[p.girder];
    expect(await at(p.x - 6, y + 3), p.id).toBe('255,210,60');
  }
});

test('R8. 開発用ショートカット(?dev の 4 キー)で 4 面から始められる。4 面で C キーを押すと、残りのピンをすべて抜いた状態にしてクリア演出が始まる。3 面をクリアすると 4 面へ進む', async ({ page }) => {
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => window.__dp.setManual(true));
  await page.keyboard.press('Digit4');
  let s = await step(page, 1);
  expect(s.stageId).toBe('rivets');
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  await page.keyboard.press('KeyC');
  s = await step(page, 5);
  expect(s.state).toBe('collapse'); // 崩壊のクリア演出
  expect(s.pins.every((p) => p.pulled)).toBe(true);
  // 3 面から C キーでクリア → 逃走演出 → クリア表示 → 自動で面間演出 → 4 面(周回はそのまま)
  await page.keyboard.press('Digit3');
  s = await step(page, 1);
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.stageId).toBe('squat');
  await page.keyboard.press('KeyC');
  s = await step(page, 1);
  expect(s.state).toBe('escape');
  for (let i = 0; i < 1500 && s.state !== 'clear'; i++) s = await step(page, 1);
  expect(s.state).toBe('clear');
  s = await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
  expect(s.state).toBe('intermission'); // 3 面のあとは面間演出(やぐら完成)を見てから 4 面
  s = await passIntermission(page);
  expect(s.stageId).toBe('rivets');
  expect(s.round).toBe(1);
});

// ---------------------------------------------------------------- 第 2 段階

// レベル(level())とゴリラの位置から、移動の「場所」(床の鉄骨。F4 のゴリラのいる鉄骨はゴリラの左右に分ける)と、
// つながり(ハシゴ / 同じ高さの穴を跳び越える)を作る。テストの経路計算と、自動操作の道順に使う
function buildGraph(lv, boss) {
  const reach = 20 + 7; // ゴリラの当たり判定の幅の半分 + 主人公の幅の半分
  const nodes = [];
  for (const g of lv.girders) {
    if (g.id === 'top') continue; // ガールの足場(届かない)
    if (g.x1 < boss.x && boss.x < g.x2 && g.y1 === boss.y) {
      nodes.push({ id: g.id + '<', gid: g.id, x1: g.x1, x2: boss.x - reach, y: g.y1 });
      nodes.push({ id: g.id + '>', gid: g.id, x1: boss.x + reach, x2: g.x2, y: g.y1 });
    } else nodes.push({ id: g.id, gid: g.id, x1: g.x1, x2: g.x2, y: g.y1 });
  }
  const at = (gid, x) => nodes.find((n) => n.gid === gid && x >= n.x1 && x <= n.x2);
  const edges = [];
  for (const l of lv.ladders) {
    const a = at(l.lower, l.x);
    const b = at(l.upper, l.x);
    if (a && b) edges.push({ kind: 'ladder', a: a.id, b: b.id, x: l.x });
  }
  // 同じ高さで、すき間がピンの穴(24px)以下の 2 枚は跳び越えてつながる(ゴリラの左右は除く)
  for (const a of nodes) {
    for (const b of nodes) {
      if (a === b || a.y !== b.y || a.gid === b.gid) continue;
      const gap = b.x1 - a.x2;
      if (gap > 0 && gap <= 24.01) edges.push({ kind: 'hole', a: a.id, b: b.id, left: a.x2, right: b.x1 });
    }
  }
  return { nodes, edges, at };
}

// 幅優先探索: from から行ける場所(と、そこまでの最初の一手)
function bfs(graph, from) {
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of graph.edges) {
      for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) {
        if (x !== cur || y in prev) continue;
        prev[y] = { from: cur, edge: e };
        queue.push(y);
      }
    }
  }
  return prev;
}

test('R9. 本物のキーボードでピンの上を歩いて通り抜けると、ピンが抜けて 100 点・得点表示「100」・効果音。抜けた所の床(x±12)が消えて床が左右 2 枚に分かれ、ハシゴはどれも上下の床につながったまま(切れない)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.evaluate(() => { window.__dp.placePlayer('F1', 90); window.__dp.clearSounds(); });
  const s0 = await snap(page);
  await page.keyboard.down('ArrowRight');
  let s = await step(page, 1);
  for (let i = 0; i < 60 && !s.pins.find((p) => p.id === 'p1').pulled; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.pins.find((p) => p.id === 'p1').pulled).toBe(true);
  expect(s.player.state).toBe('ground'); // 抜いたときは穴の外にいて、落ちない
  expect(s.player.x).toBeGreaterThan(120 + 12);
  expect(s.score - s0.score).toBe(100);
  expect(s.popups).toContain('100');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('pin');
  const lv = await level(page);
  const f1 = lv.girders.filter((g) => g.y1 === 445).map((g) => [g.x1, g.x2]).sort((a, b) => a[0] - b[0]);
  expect(f1).toEqual([[16, 108], [132, 464]]);
  for (const l of lv.ladders) {
    const lo = lv.girders.find((g) => g.id === l.lower);
    const up = lv.girders.find((g) => g.id === l.upper);
    expect(l.x >= lo.x1 && l.x <= lo.x2 && l.x >= up.x1 && l.x <= up.x2, `ハシゴ x=${l.x}`).toBe(true);
  }
  // 2 回目は入らない(もう一度通っても得点は増えない)
  const before = s.score;
  s = await walkTo(page, 140);
  expect(s.score).toBe(before);
});

test('R10. ジャンプで真上を跳び越えてもピンは抜ける(着地は穴の向こう)。ピンの上でその場で真上に跳んでも抜けず、ピンの上に戻る(足元のピンを抜いて落ちることはない)', async ({ page }) => {
  // 跳び越える: F2 のピン p3(x=184)の手前から右へ跳ぶ
  await startAtStage(page, STAGE4);
  await page.evaluate(() => window.__dp.placePlayer('F2', 160));
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  let s = await step(page, 1);
  let pulledInAir = false;
  for (let i = 0; i < 80 && (s.player.state !== 'ground' || i < 3); i++) {
    s = await step(page, 1);
    if (s.player.state === 'air' && s.pins.find((p) => p.id === 'p3').pulled) pulledInAir = true;
  }
  await page.keyboard.up('ArrowRight');
  expect(pulledInAir).toBe(true);
  expect(s.state).toBe('playing');
  expect(s.player.x).toBeGreaterThan(184 + 12);
  expect(s.score).toBe(100);
  // その場で真上に跳ぶ: 抜けない
  await startAtStage(page, STAGE4);
  await page.evaluate(() => window.__dp.placePlayer('F3', 296));
  await page.keyboard.press('Space');
  s = await step(page, 1);
  for (let i = 0; i < 80 && (s.player.state !== 'ground' || i < 3); i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.player.girder).toBe('F3');
  expect(s.pins.find((p) => p.id === 'p6').pulled).toBe(false);
  // そのまま歩いて出ると抜ける(落ちない)
  s = await walkTo(page, 320);
  expect(s.pins.find((p) => p.id === 'p6').pulled).toBe(true);
  expect(s.player.state).toBe('ground');
});

test('R11. 8 つの穴はどれも、左右どちらからでもジャンプで跳び越えられる(踏み切り位置を 1px ずつ変えて実際に跳び、20px 以上の幅で届く)。歩いて穴に入ると下の段まで落ちて落下のミス', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const res = await page.evaluate(() => {
    const dp = window.__dp;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    const fresh = () => { dp.setManual(true); dp.startStage(3); let s = dp.step(1); while (s.state !== 'playing') s = dp.step(1); dp.setBossEnabled(false); };
    const out = [];
    for (const pin of window.DP.stages[3].pins) {
      for (const dir of [1, -1]) {
        const ok = [];
        for (let d = 0; d <= 50; d++) {
          fresh();
          dp.pullPin(pin.id);
          // 穴の手前 d px から、穴へ向かって跳ぶ
          const x = dir > 0 ? pin.x - 12 - d : pin.x + 12 + d;
          const g = dp.level().girders.find((q) => q.y1 === dp.surfaceY(pin.girder, pin.x) && x >= q.x1 && x <= q.x2);
          if (!g) continue;
          dp.placePlayer(g.id, x);
          const k = dir > 0 ? 'ArrowRight' : 'ArrowLeft';
          key(k, true); key(' ', true);
          let s = dp.step(1);
          key(' ', false);
          for (let i = 0; i < 200 && (s.player.state !== 'ground' || i < 3) && s.state === 'playing'; i++) s = dp.step(1);
          key(k, false);
          const across = s.state === 'playing' && s.player.y === dp.surfaceY(pin.girder, pin.x) && (dir > 0 ? s.player.x > pin.x + 12 : s.player.x < pin.x - 12);
          if (across) ok.push(d);
        }
        out.push({ pin: pin.id, dir, n: ok.length, max: Math.max(...ok) });
      }
    }
    // 歩いて穴に入る(F2 の p3)
    fresh();
    dp.pullPin('p3');
    dp.placePlayer('F2', 168);
    key('ArrowRight', true);
    let s = dp.step(1);
    for (let i = 0; i < 300 && s.state === 'playing'; i++) s = dp.step(1);
    key('ArrowRight', false);
    return { out, walk: { state: s.state, reason: s.deathReason } };
  });
  console.log('R11 穴を跳び越えられる踏み切り位置(穴の手前 0〜n px):\n  ' + res.out.map((r) => `${r.pin} ${r.dir > 0 ? '右へ' : '左へ'}: ${r.n}px`).join(' / '));
  for (const r of res.out) expect(r.n, `${r.pin} ${r.dir > 0 ? '右へ' : '左へ'}`).toBeGreaterThanOrEqual(20);
  expect(res.walk).toEqual({ state: 'dying', reason: 'fall' });
});

test('R12. どの順番で抜いても詰まない: ピンの抜け方 256 通りすべてで、スタートから(ハシゴと穴の跳び越えで)残りのピンすべてに行ける。最上段の F4 には、ゴリラを挟んで左右それぞれからハシゴで行ける', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const states = await page.evaluate(() => {
    const dp = window.__dp;
    const ids = window.DP.stages[3].pins.map((p) => p.id);
    const out = [];
    for (let mask = 0; mask < 256; mask++) {
      dp.setManual(true);
      dp.startStage(3);
      let s = dp.step(1);
      while (s.state !== 'playing') s = dp.step(1);
      ids.forEach((id, i) => { if (mask & (1 << i)) dp.pullPin(id); });
      s = dp.snapshot();
      out.push({ mask, lv: dp.level(), pins: s.pins, boss: s.boss, start: { girder: s.player.girder, x: s.player.x } });
    }
    return out;
  });
  expect(states.length).toBe(256);
  let checked = 0;
  for (const st of states) {
    const graph = buildGraph(st.lv, st.boss);
    const start = graph.at(st.start.girder, st.start.x);
    const reached = bfs(graph, start.id);
    for (const pin of st.pins) {
      if (pin.pulled) continue;
      const n = graph.nodes.find((q) => q.gid && q.y === (st.lv.girders.find((g) => g.id === pin.girder) || {}).y1 && pin.x - 12 >= q.x1 && pin.x + 12 <= q.x2);
      expect(n, `抜け方 ${st.mask}: ${pin.id} の床`).toBeTruthy();
      expect(n.id in reached, `抜け方 ${st.mask.toString(2).padStart(8, '0')}: ${pin.id} に行けない`).toBe(true);
      checked++;
    }
    // F4 のゴリラの左右には、どの抜け方でも(穴を跳び越えて)行ける
    const f4 = graph.nodes.filter((q) => q.y === 160);
    const left = f4.filter((q) => q.x2 < st.boss.x);
    const right = f4.filter((q) => q.x1 > st.boss.x);
    expect(left.some((q) => q.id in reached), `抜け方 ${st.mask}: F4 の左`).toBe(true);
    expect(right.some((q) => q.id in reached), `抜け方 ${st.mask}: F4 の右`).toBe(true);
  }
  expect(checked).toBe(8 * 128); // 256 通り × 残りのピン(平均 4 本)
  // 最初の状態で、F4 の左右へはそれぞれハシゴ(穴を跳ばずに)で上がれる
  const g0 = buildGraph(states[0].lv, states[0].boss);
  const toF4 = g0.edges.filter((e) => e.kind === 'ladder' && g0.nodes.find((q) => q.id === e.b).y === 160).map((e) => e.b).sort();
  expect(toF4).toEqual(['F4<', 'F4>']);
});

// 本物のキーボード入力だけで、order の順にピンを抜いていく自動操作。道順は buildGraph / bfs で毎回計算し、
// 歩く・ハシゴを登り降りする・穴を跳び越える。途中で通ったピンもそのまま抜ける。通った足場とピンの抜けた順を返す
async function pullAllWithKeyboard(page, order) {
  const held = new Set();
  const keys = async (...ks) => {
    for (const k of [...held]) if (!ks.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of ks) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const read = () => page.evaluate(() => ({ s: window.__dp.snapshot(), lv: window.__dp.level() }));
  let { s, lv } = await read();
  const pulledOrder = [];
  let action = null; // { kind: 'walk' | 'ladder' | 'jump', ... }
  let t = 0;
  for (; t < 9000 && s.state === 'playing'; t++) {
    for (const p of s.pins) if (p.pulled && !pulledOrder.includes(p.id)) pulledOrder.push(p.id);
    if (pulledOrder.length === 8) break;
    const pl = s.player;
    if (pl.state === 'ladder') await keys(action && action.dir < 0 ? 'ArrowDown' : 'ArrowUp');
    else if (pl.state !== 'ground') await keys();
    else {
      // 地上: 次の目標のピンへの道順を計算して、最初の一手を進める
      const graph = buildGraph(lv, s.boss);
      const cur = graph.at(pl.girder, pl.x);
      const target = s.pins.find((p) => p.id === order.find((id) => !s.pins.find((q) => q.id === id).pulled));
      const tgtNode = graph.nodes.find((q) => q.y === lv.girders.find((g) => g.id === target.girder).y1 && target.x >= q.x1 && target.x <= q.x2);
      const prev = bfs(graph, cur.id);
      let edge = null;
      for (let n = tgtNode.id; prev[n] && prev[n].from !== undefined; n = prev[n].from) { edge = prev[n].edge; if (prev[n].from === cur.id) break; }
      if (cur.id === tgtNode.id || !edge) {
        // 同じ床の上: ピンの向こう側(穴の外 8px)まで歩いて通り抜ける。向きはそのピンに向かい始めたときに決めて覚えておく
        // (中心を越えるたびに決め直すと、中心で行ったり来たりしてしまう)
        if (!action || action.kind !== 'walk' || action.pin !== target.id) action = { kind: 'walk', pin: target.id, side: pl.x < target.x ? 1 : -1 };
        const goal = target.x + action.side * 20;
        await keys(goal > pl.x ? 'ArrowRight' : 'ArrowLeft');
      } else if (edge.kind === 'ladder') {
        const up = graph.nodes.find((q) => q.id === cur.id).y > Math.min(...[edge.a, edge.b].map((id) => graph.nodes.find((q) => q.id === id).y));
        if (Math.abs(pl.x - edge.x) > 1) await keys(edge.x > pl.x ? 'ArrowRight' : 'ArrowLeft');
        else { action = { kind: 'ladder', dir: up ? 1 : -1 }; await keys(up ? 'ArrowUp' : 'ArrowDown'); }
      } else {
        // 穴を跳び越える: 穴の手前 6px まで歩いて、穴へ向かって跳ぶ
        const right = cur.id === edge.a;
        const from = right ? edge.left - 6 : edge.right + 6;
        if (Math.abs(pl.x - from) > 1) await keys(from > pl.x ? 'ArrowRight' : 'ArrowLeft');
        else { action = { kind: 'jump' }; await keys(right ? 'ArrowRight' : 'ArrowLeft', 'Space'); }
      }
    }
    await page.evaluate(() => window.__dp.step(1));
    ({ s, lv } = await read());
  }
  await keys();
  for (const p of s.pins) if (p.pulled && !pulledOrder.includes(p.id)) pulledOrder.push(p.id);
  return { state: s.state, reason: s.deathReason, pulledOrder, score: s.score - prizeScore(s), seconds: t / 60, lives: s.lives }; // score はアイテムを除いた得点
}

test('R13. 本物のキーボード操作だけで、いろいろな順番(左から・右から・段ごとに左右・上から)で 8 本すべてのピンを抜ける(ミスなし。8 本で 800 点。8 本目でクリア演出に入る)', async ({ page }) => {
  test.setTimeout(600000);
  const orders = {
    左の列から登って右の列を降りる: ['p1', 'p3', 'p5', 'p7', 'p8', 'p6', 'p4', 'p2'],
    右の列から登って左の列を降りる: ['p2', 'p4', 'p6', 'p8', 'p7', 'p5', 'p3', 'p1'],
    段ごとに左右: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'],
    上の段から: ['p7', 'p8', 'p5', 'p6', 'p3', 'p4', 'p1', 'p2'],
  };
  const results = {};
  for (const [name, order] of Object.entries(orders)) {
    await startAtStage(page, STAGE4);
    const r = await pullAllWithKeyboard(page, order);
    results[name] = `${r.pulledOrder.join('→')}(${r.seconds.toFixed(1)} 秒)`;
    expect(r.state, `${name}: ${r.reason}`).toBe('collapse'); // 8 本目でクリア演出に入る(ミスはしていない)
    expect(r.pulledOrder.length, name).toBe(8);
    expect(r.score, name).toBe(800);
  }
  console.log('R13 実際にピンが抜けた順:\n  ' + Object.entries(results).map(([k, v]) => `${k}: ${v}`).join('\n  '));
});

test('R14. ピンを抜いたあとミスしても、ピンと穴(床の分かれ方・鉄骨の id)はそのまま残り、主人公はスタート位置から再開する。得点は増えず、ボーナスは初期値、残機は 1 減る。ゴリラは穴の間の足場に乗ったままで、触れるとまたミスになる', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.evaluate(() => { window.__dp.pullPin('p7'); window.__dp.pullPin('p8'); });
  let s = await snap(page);
  expect(s.pins.filter((p) => p.pulled).length).toBe(2);
  const before = { score: s.score, lives: s.lives, girders: (await level(page)).girders, ladders: (await level(page)).ladders, bossGirder: s.boss.girder };
  expect(before.bossGirder).toBe('F4@140');
  // F4 の中央(ゴリラの足場)へ穴を跳び越えて入り、ゴリラへ歩くとミス
  const touchBoss = async () => {
    await page.evaluate(() => window.__dp.placePlayer('F4', 100));
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press('Space');
    let t = await step(page, 1);
    for (let i = 0; i < 200 && t.state === 'playing'; i++) t = await step(page, 1);
    await page.keyboard.up('ArrowRight');
    return t;
  };
  s = await touchBoss();
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('boss');
  for (let i = 0; i < 400 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  // ピンと穴はそのまま(抜いた順も同じ)
  expect(s.pins.filter((p) => p.pulled).map((p) => p.id)).toEqual(['p7', 'p8']);
  expect(s.pinOrder).toEqual(['p7', 'p8']);
  const lv = await level(page);
  expect(lv.girders).toEqual(before.girders);
  expect(lv.ladders).toEqual(before.ladders);
  expect(lv.girders.filter((g) => g.y1 === 160).map((g) => [g.x1, g.x2])).toEqual([[16, 116], [140, 332], [356, 464]]);
  // 主人公はスタート位置。得点はそのまま(ピンの 100 点は入れ直さない)、ボーナスは初期値、残機は 1 減る
  const st = await stageData(page);
  expect(s.player.x).toBe(st.playerStart.x);
  expect(s.player.girder).toBe('f0');
  expect(s.player.state).toBe('ground');
  expect(s.score).toBe(before.score);
  expect(s.popups).toEqual([]);
  expect(s.bonus).toBe(await page.evaluate(() => window.DP.config.score.bonusStart));
  expect(s.lives).toBe(before.lives - 1);
  // ゴリラは穴の間の足場(F4@140)に乗ったまま。触れるとまたミス
  expect(s.boss.girder).toBe('F4@140');
  expect(s.boss.x).toBe(240);
  s = await touchBoss();
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('boss');
});

// ---------------------------------------------------------------- 第 3 段階

// 7 本を(得点なしで)抜いた状態にして、8 本目(F4 の右の p8)を本物のキーボードで歩いて抜く。演出が始まった状態を返す
async function pullLastPin(page) {
  await page.evaluate(() => { for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) window.__dp.pullPin(id); window.__dp.placePlayer('F4', 420); window.__dp.clearSounds(); });
  await page.keyboard.down('ArrowLeft');
  let s = await snap(page);
  for (let i = 0; i < 80 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowLeft');
  return s;
}

// クリア演出を最後(クリア表示)まで 1 ステップずつ進め、段階ごとの記録を取る。onStep(s, i) を毎ステップ呼ぶ
async function runCollapse(page, onStep) {
  const rec = { phases: [], start: {}, s: null, bossY: {}, debrisAtGun: null, girdersAtGun: null, heartAt: null, scores: new Set(), lives: new Set(), states: new Set() };
  let s = await snap(page);
  for (let i = 0; i < 1500 && s.state === 'collapse'; i++) {
    if (onStep) await onStep(s, i);
    s = await step(page, 1);
    rec.scores.add(s.score);
    rec.lives.add(s.lives);
    rec.states.add(s.state);
    const c = s.collapse;
    if (!c) break;
    if (rec.phases[rec.phases.length - 1] !== c.phase) {
      rec.phases.push(c.phase);
      rec.start[c.phase] = c.total;
      if (c.phase === 'gun') {
        rec.debrisAtGun = c.debrisLeft;
        rec.girdersAtGun = (await level(page)).girders.map((g) => g.id);
      }
    }
    (rec.bossY[c.phase] = rec.bossY[c.phase] || []).push(c.by);
    if (c.heart && rec.heartAt === null) rec.heartAt = { px: c.px, gx: c.gx, py: c.py, gy: c.gy };
  }
  rec.s = s;
  return rec;
}

test('R15. 本物のキーボードで 8 本目の安全ピンを抜いた瞬間にクリア演出が始まり、「ガキン!」が鳴って操作が止まる。演出は 崩壊 → 拳銃乱射 → 落下 → 救出 の順に進み、最後に ROUND CLEAR', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  const s = await pullLastPin(page);
  expect(s.state).toBe('collapse');
  expect(s.collapse.phase).toBe('clank');
  expect(s.pins.every((p) => p.pulled)).toBe(true);
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('clank');
  const rec = await runCollapse(page);
  expect(rec.phases).toEqual(['clank', 'shake', 'crumble', 'gun', 'fall', 'impact', 'reunite', 'done']);
  expect(rec.s.state).toBe('clear');
  expect(rec.s.message).toBe('ROUND CLEAR');
  const sounds = await page.evaluate(() => window.__dp.sounds());
  // 鳴った順番(それぞれ最初に鳴ったところ): ガキン → 崩壊音 → 揺れのきしみ → 鉄骨が外れる音 → 鉄骨がぶつかる音 → 銃声
  //   → 衝撃音 → ガールの落下音 → 着地音 → ハート → 花火 → クリア
  const order = ['clank', 'collapse', 'rattle', 'creak', 'debrisHit', 'gun', 'boom', 'girlFall', 'girlLand', 'heart', 'firework', 'clear'];
  for (const name of order) expect(sounds, name).toContain(name);
  const idx = (n) => sounds.indexOf(n);
  for (let i = 1; i < order.length; i++) expect(idx(order[i - 1]), `${order[i - 1]} → ${order[i]}`).toBeLessThan(idx(order[i]));
  // 銃声はすべて衝撃音より前(乱射が終わってから落ちる)。ガールの音はゴリラ警官の衝撃音のあと
  expect(sounds.lastIndexOf('gun')).toBeLessThan(idx('boom'));
});

test('R16. 鉄骨は完全に崩れてから拳銃の乱射が始まる(崩れた鉄骨・ハシゴは 0、レベルに残るのは地面だけ)。乱射は約 3 秒(180 ステップ)で 18 発。その間ゴリラ警官は空中に残り、乱射が終わってから落ちる', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await pullLastPin(page);
  const flashes = [];
  const rec = await runCollapse(page, async (s) => { if (s.collapse && s.collapse.phase === 'gun' && s.collapse.flash > 0) flashes.push(s.collapse.total); });
  expect(rec.debrisAtGun).toBe(0);
  expect(rec.girdersAtGun).toEqual(['f0']);
  const gunFrames = rec.start.fall - rec.start.gun;
  expect(gunFrames).toBeGreaterThanOrEqual(170);
  expect(gunFrames).toBeLessThanOrEqual(190);
  // 乱射の間、ゴリラ警官の高さは変わらない(空中の y=160 のまま)。落ちるのは fall から
  expect(new Set(rec.bossY.gun)).toEqual(new Set([160]));
  expect(rec.bossY.impact[0]).toBe(540); // 地面に着いた瞬間に「衝撃」の段階へ移る
  for (let i = 1; i < rec.bossY.fall.length; i++) expect(rec.bossY.fall[i]).toBeGreaterThanOrEqual(rec.bossY.fall[i - 1]);
  const gunShots = (await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'gun').length;
  expect(gunShots).toBe(18);
  expect(flashes.length).toBeGreaterThan(0); // マズルフラッシュが出る
});

test('R17. ゴリラ警官は地面に落ちた瞬間に衝撃音が鳴り、画面が揺れてから消える。そのあと主人公とガールが画面の中央に並び、2 人の上にハートが出る', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await pullLastPin(page);
  const shakes = [];
  let goneDuringReunite = null;
  const rec = await runCollapse(page, async (s) => {
    const c = s.collapse;
    if (!c) return;
    if (c.phase === 'impact') shakes.push(c.shake);
    if (c.phase === 'reunite' && goneDuringReunite === null) goneDuringReunite = c.bossGone;
  });
  expect(shakes.some((v) => v !== 0)).toBe(true);
  expect(goneDuringReunite).toBe(true); // 救出はゴリラ警官が消えてから
  const h = rec.heartAt;
  expect(h).not.toBe(null);
  expect([h.py, h.gy]).toEqual([540, 540]); // どちらも地面
  expect(Math.abs((h.px + h.gx) / 2 - 240)).toBeLessThanOrEqual(1); // 画面の中央
  expect(h.px).toBeLessThan(h.gx); // 主人公が左、ガールが右
  expect(rec.s.boss.gone).toBe(true);
  expect([rec.s.player.x, rec.s.heroine.x]).toEqual([h.px, h.gx]);
});

test('R18. 残りの BONUS(クリアの基本点 + 残りのボーナス)が 1 回だけ得点に入る。演出中はボーナスが減らず、得点は ROUND CLEAR のときに 1 回だけ増える', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await step(page, 250); // ボーナスを少し減らしておく(2 秒ごとに 100)
  const s = await pullLastPin(page);
  const bonus = s.bonus;
  expect(bonus).toBeLessThan(5000);
  const before = s.score;
  const rec = await runCollapse(page);
  const cfg = await page.evaluate(() => window.DP.config.score);
  expect(rec.s.clearBonus).toBe(cfg.clearBase * 1 + bonus);
  expect(rec.s.score).toBe(before + cfg.clearBase + bonus);
  expect(rec.s.bonus).toBe(bonus); // 演出中に減っていない
  expect([...rec.scores].sort((a, b) => a - b)).toEqual([before, before + cfg.clearBase + bonus]); // 途中の得点は 2 種類だけ
  // クリア表示のまま待っても増えない
  const later = await step(page, 200);
  expect(later.score).toBe(rec.s.score);
});

test('R19. クリア演出中は、キーを押しても進行が変わらず、ミスにもならない(残機・状態はそのまま)。ROUND CLEAR のあと自動で次の周回の 1 面へ進む', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await pullLastPin(page);
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter'];
  const rec = await runCollapse(page, async (s, i) => {
    // いろいろなキーを押したり離したりする(ENTER で先へ飛ばされることもない)
    if (i % 7 === 0) await page.keyboard.down(keys[i % keys.length]);
    if (i % 7 === 3) await page.keyboard.up(keys[(i - 3) % keys.length]);
  });
  for (const k of keys) await page.keyboard.up(k);
  expect([...rec.states].filter((st) => st !== 'collapse')).toEqual(['clear']);
  expect([...rec.lives]).toEqual([3]);
  expect(rec.phases).toEqual(['clank', 'shake', 'crumble', 'gun', 'fall', 'impact', 'reunite', 'done']);
  // クリア表示が終わると自動で、次の周回(2 周目)の 1 面
  let s = await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  expect(s.stageId).toBe('girders');
  expect(s.round).toBe(2);
});

test('R20. 本物のキーボード操作だけで、4 面のスタートから安全ピン 8 本をすべて抜き、クリア演出を最後まで見て、次の周回の 1 面へ進める(ミスなし)', async ({ page }) => {
  test.setTimeout(300000);
  await startAtStage(page, STAGE4);
  const r = await pullAllWithKeyboard(page, ['p1', 'p3', 'p5', 'p7', 'p8', 'p6', 'p4', 'p2']);
  expect(r.pulledOrder.length).toBe(8);
  let s = await snap(page);
  expect(s.state).toBe('collapse');
  expect(s.score - prizeScore(s)).toBe(800); // ピン 8 本(通り道で取ったボーナスアイテムの得点は除く)
  const items = prizeScore(s);
  const rec = await runCollapse(page);
  expect(rec.s.state).toBe('clear');
  expect([...rec.lives]).toEqual([3]);
  s = await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
  expect(s.stageId).toBe('girders');
  expect(s.round).toBe(2);
  expect(s.score).toBe(800 + items + rec.s.clearBonus);
  console.log(`R20 ピンを抜いた順: ${r.pulledOrder.join('→')} / ${r.seconds.toFixed(1)} 秒 / クリアで +${rec.s.clearBonus}`);
});

// ---------------------------------------------------------------- ミス後の再挑戦(抜いたピンと穴はミスしても残る)

// ミスの演出が終わってプレイ中に戻るまで進める
async function waitRestart(page) {
  let s = await snap(page);
  for (let i = 0; i < 600 && s.state !== 'playing'; i++) s = await step(page, 1);
  return s;
}

test('R21. 本物のキーボードでピンを抜き、その穴に歩いて落ちてミスしても、抜いたピンと穴は残る(得点 100 点はそのまま。もう一度は入らない)。再開後、残りのピンを本物のキーボードで抜くと、8 本目でクリア演出に入り、得点は 1 本 100 点 × 8 本 = 800 点', async ({ page }) => {
  test.setTimeout(300000);
  await startAtStage(page, STAGE4);
  // F1 の p1 を歩いて抜く(100 点)
  await page.evaluate(() => window.__dp.placePlayer('F1', 90));
  let s = await walkTo(page, 150);
  expect(s.pins.find((p) => p.id === 'p1').pulled).toBe(true);
  expect(s.score).toBe(100);
  // 引き返して穴に歩いて入る → 落下のミス
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 300 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowLeft');
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('fall');
  s = await waitRestart(page);
  expect(s.pins.filter((p) => p.pulled).map((p) => p.id)).toEqual(['p1']);
  expect(s.score).toBe(100);
  expect(s.lives).toBe(2);
  expect((await level(page)).girders.filter((g) => g.y1 === 445).map((g) => [g.x1, g.x2])).toEqual([[16, 108], [132, 464]]);
  // スタートから残り 7 本を本物のキーボードで抜く(p1 の穴は跳び越える)
  const r = await pullAllWithKeyboard(page, ['p2', 'p4', 'p6', 'p8', 'p7', 'p5', 'p3']);
  expect(r.pulledOrder.length).toBe(8);
  expect(r.lives).toBe(2);
  s = await snap(page);
  expect(s.state).toBe('collapse');
  expect(s.score - prizeScore(s)).toBe(800); // ピン 8 本(通り道で取ったボーナスアイテムの得点は除く)
  const items = prizeScore(s);
  // クリア演出を最後まで見ると、ボーナスが 1 回だけ入る
  const rec = await runCollapse(page);
  expect(rec.s.state).toBe('clear');
  expect(rec.s.score).toBe(800 + items + rec.s.clearBonus);
  console.log(`R21 再開後に抜いた順: ${r.pulledOrder.join('→')} / ${r.seconds.toFixed(1)} 秒`);
});

test('R22. 7 本抜いた状態でミスしても 7 本と穴は残り、再開後に本物のキーボードで最後の 1 本を抜くとクリア演出に入る。ミスを 2 回はさんでも、抜いたピンは増えも減りもしない', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await page.evaluate(() => { for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) window.__dp.pullPin(id); });
  const girders = (await level(page)).girders;
  for (let n = 0; n < 2; n++) {
    await page.evaluate(() => window.__dp.killPlayer('fall'));
    let s = await waitRestart(page);
    expect(s.pins.filter((p) => p.pulled).length).toBe(7);
    expect(s.pins.find((p) => p.id === 'p8').pulled).toBe(false);
    expect(s.pinOrder).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect((await level(page)).girders).toEqual(girders);
    expect(s.lives).toBe(2 - n);
    expect(s.score).toBe(0);
  }
  const r = await pullAllWithKeyboard(page, ['p8']);
  expect(r.pulledOrder.length).toBe(8);
  const s = await snap(page);
  expect(s.state).toBe('collapse');
  expect(s.collapse.phase).toBe('clank');
  expect(s.score).toBe(100);
  console.log(`R22 スタートから p8 まで ${r.seconds.toFixed(1)} 秒`);
});

test('R23. ピンを抜いたままゲームオーバーになると、新しいゲームで 4 面に入ったときは 8 本とも抜けていない初期状態(床は各段 1 枚)に戻る', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.evaluate(() => { window.__dp.pullPin('p1'); window.__dp.pullPin('p6'); window.__dp.setLives(1); window.__dp.killPlayer('fall'); });
  let s = await snap(page);
  for (let i = 0; i < 600 && s.state !== 'gameover'; i++) s = await step(page, 1);
  expect(s.state).toBe('gameover');
  await page.evaluate(() => window.__dp.startStage(3));
  s = await step(page, 1);
  expect(s.stageId).toBe('rivets');
  expect(s.pins.filter((p) => p.pulled)).toEqual([]);
  expect(s.pinOrder).toEqual([]);
  const lv = await level(page);
  const st = await stageData(page);
  expect(lv.girders.map((g) => g.id)).toEqual(st.girders.map((g) => g.id));
  expect(s.boss.girder).toBe('F4');
});

test('R24. ピンを抜いたままミスしてから 4 面をクリアし、1 → 2 → 3 面を進めて次の周回の 4 面に入ると、8 本のピンと鉄骨は初期状態に戻っている', async ({ page }) => {
  test.setTimeout(180000);
  await startAtStage(page, STAGE4, { url: './?test&dev' }); // 1〜3 面は開発用の C キーでクリアして進める
  await page.evaluate(() => { for (const id of ['p2', 'p5', 'p8']) window.__dp.pullPin(id); window.__dp.killPlayer('fall'); });
  let s = await waitRestart(page);
  expect(s.pins.filter((p) => p.pulled).length).toBe(3);
  // 残りを抜いてクリア演出 → ROUND CLEAR → 次の周回の 1 面
  await page.evaluate(() => { for (const id of ['p1', 'p3', 'p4', 'p6']) window.__dp.pullPin(id); });
  s = await pullAllWithKeyboard(page, ['p7']);
  expect((await snap(page)).state).toBe('collapse');
  const advance = async () => {
    let t = await snap(page);
    for (let i = 0; i < 2000 && t.state !== 'clear'; i++) t = await step(page, 1);
    expect(t.state).toBe('clear');
    await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
    return passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  };
  s = await advance();
  expect(s.stageId).toBe('girders');
  expect(s.round).toBe(2);
  // 1〜3 面は開発用のクリア(逃走演出)で進める
  for (let n = 0; n < 3; n++) {
    s = await step(page, 100);
    expect(s.state).toBe('playing');
    await page.keyboard.press('KeyC');
    s = await advance();
  }
  expect(s.stageId).toBe('rivets');
  expect(s.round).toBe(2);
  expect(s.pins.length).toBe(8);
  expect(s.pins.filter((p) => p.pulled)).toEqual([]);
  expect(s.pinOrder).toEqual([]);
  const lv = await level(page);
  const st = await stageData(page);
  expect(lv.girders.map((g) => [g.id, g.x1, g.x2])).toEqual(st.girders.map((g) => [g.id, g.x1, g.x2]));
});

// ---------------------------------------------------------------- エンディング(乱射の 8 方向・効果音・お祝い)

test('R25. 拳銃の乱射は 8 方向(上下左右・斜め)へランダム: 18 発で 6 方向以上を使い、上・下・斜めも入る。同じ向きは続かない。1 発ごとに銃声が 1 回鳴り、弾丸は撃った向きへ飛び、銃口とマズルフラッシュは撃った向きの先にある(右向きは右手、左向きは左手)', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await pullLastPin(page);
  const DIRS = await page.evaluate(() => window.DP.collapse.DIRS);
  const k = await page.evaluate(() => window.DP.config.collapse);
  const shots = [];
  let s = await snap(page);
  for (let i = 0; i < 1500 && s.collapse && s.collapse.phase !== 'fall'; i++) {
    const before = s.collapse.shots.length;
    await page.evaluate(() => window.__dp.clearSounds());
    s = await step(page, 1);
    const c = s.collapse;
    if (c.shots.length > before) {
      // このステップで撃った: 銃声 1 回・マズルフラッシュ・新しい弾丸の向き・銃口の位置
      const d = c.gunDir;
      const [dx, dy] = DIRS[d];
      expect((await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'gun').length).toBe(1);
      expect(c.flash).toBeGreaterThan(0);
      const [vx, vy] = c.bulletDirs[c.bulletDirs.length - 1];
      expect(vx).toBeCloseTo(dx * k.bulletSpeed, 5);
      expect(vy).toBeCloseTo(dy * k.bulletSpeed, 5);
      if (dx > 0.1) expect(c.gunSide).toBe(1);
      if (dx < -0.1) expect(c.gunSide).toBe(-1);
      const hx = c.bx + c.gunSide * k.gunHandX;
      const hy = c.by - k.gunHandY;
      expect(c.muzzle.x).toBeCloseTo(hx + dx * k.gunReach, 5);
      expect(c.muzzle.y).toBeCloseTo(hy + dy * k.gunReach, 5);
      shots.push(d);
    }
  }
  expect(shots.length).toBe(18);
  expect(new Set(shots).size).toBeGreaterThanOrEqual(6);
  const name = (d) => ['右', '右下', '下', '左下', '左', '左上', '上', '右上'][d];
  expect(shots.some((d) => d === 6), '真上').toBe(true);
  expect(shots.some((d) => d === 2), '真下').toBe(true);
  expect(shots.some((d) => d % 2 === 1), '斜め').toBe(true);
  for (let i = 1; i < shots.length; i++) expect(shots[i]).not.toBe(shots[i - 1]);
  console.log('R25 乱射の向き: ' + shots.map(name).join(' '));
});

test('R26. 崩壊の効果音: 揺れている間に金属のきしみ(rattle)がくり返し鳴り、崩れ始めると鉄骨が外れる音(creak)、地面の高さにぶつかる音(debrisHit)が鳴る(崩壊が終わるまでに)。ガールは落ち始めに落下音、着地した瞬間に着地音が 1 回ずつ鳴る', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await pullLastPin(page);
  const byPhase = {};
  let landStep = null;
  let landSound = null;
  let s = await snap(page);
  for (let i = 0; i < 1500 && s.state === 'collapse'; i++) {
    await page.evaluate(() => window.__dp.clearSounds());
    const wasLanded = s.collapse.girlLanded;
    s = await step(page, 1);
    if (!s.collapse) break;
    const snd = await page.evaluate(() => window.__dp.sounds());
    const ph = s.collapse.phase;
    (byPhase[ph] = byPhase[ph] || []).push(...snd);
    if (!wasLanded && s.collapse.girlLanded) {
      landStep = s.collapse.total;
      landSound = snd.includes('girlLand');
      expect(s.collapse.gy).toBe(540);
    }
  }
  const count = (ph, n) => (byPhase[ph] || []).filter((x) => x === n).length;
  expect(count('shake', 'collapse')).toBe(1);
  expect(count('shake', 'rattle')).toBeGreaterThanOrEqual(3);
  expect(count('crumble', 'creak') + count('gun', 'creak')).toBeGreaterThanOrEqual(1);
  expect(count('crumble', 'debrisHit')).toBeGreaterThanOrEqual(2);
  for (const ph of ['gun', 'fall', 'impact', 'reunite']) expect(count(ph, 'debrisHit'), ph).toBe(0);
  expect(count('reunite', 'girlFall')).toBe(1);
  expect(count('reunite', 'girlLand')).toBe(1);
  expect(landStep).not.toBe(null);
  expect(landSound).toBe(true); // 着地したステップで鳴る
  console.log(`R26 揺れ: rattle ${count('shake', 'rattle')} 回 / 崩れ: creak ${count('crumble', 'creak')} 回・debrisHit ${count('crumble', 'debrisHit')} 回`);
});

test('R27. ハートが出た瞬間に、幸せな BGM(happy)が流れ、背景が青空・教会・お花畑に変わり、花火が打ち上がって音が鳴る。ハートの前は BGM なし・夜の背景。ROUND CLEAR の表示中も BGM と背景・花火は続き、自動で次の周回の 1 面へ進むと通常の BGM に戻る', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await pullLastPin(page);
  const music = () => page.evaluate(() => window.__dp.music());
  // 画面左上の空の色(描画は requestAnimationFrame なので 1 フレーム待ってから読む)
  const skyColor = async () => {
    await page.waitForTimeout(60);
    return page.evaluate(() => Array.from(document.querySelector('canvas').getContext('2d').getImageData(20, 20, 1, 1).data.slice(0, 3)));
  };
  const night = await skyColor();
  expect(night[2]).toBeLessThan(80); // 夜(暗い)
  let s = await snap(page);
  for (let i = 0; i < 1500 && !(s.collapse && s.collapse.heart); i++) {
    s = await step(page, 1);
    if (!s.collapse.heart) expect(await music()).toBe(null); // ハートの前は BGM なし
  }
  expect(s.collapse.heart).toBe(true);
  expect(s.collapse.phase).toBe('reunite');
  expect(s.collapse.bossGone).toBe(true); // ゴリラ警官が落ちて消えたあと
  expect(await music()).toBe('happy');
  expect(s.collapse.fireworkCount).toBe(1); // ハートと同時に 1 発目
  const sounds = await page.evaluate(() => window.__dp.sounds());
  expect(sounds.lastIndexOf('heart')).toBeLessThan(sounds.lastIndexOf('firework'));
  const sky = await skyColor();
  expect(sky[2]).toBeGreaterThan(180); // 青空
  expect(sky[2]).toBeGreaterThan(sky[0] + 80);
  // お花畑(画面の下の方)は緑が強い
  const field = await page.evaluate(() => Array.from(document.querySelector('canvas').getContext('2d').getImageData(6, 520, 1, 1).data.slice(0, 3)));
  expect(field[1]).toBeGreaterThan(field[0]);
  // ROUND CLEAR まで: 花火が何発も上がる
  for (let i = 0; i < 600 && s.state === 'collapse'; i++) s = await step(page, 1);
  expect(s.state).toBe('clear');
  expect(s.message).toBe('ROUND CLEAR');
  const atClear = s.collapse.fireworkCount;
  expect(atClear).toBeGreaterThanOrEqual(5);
  expect(await music()).toBe('happy');
  // クリア表示の間も花火は続き、背景も青空のまま
  s = await step(page, 120);
  expect(s.collapse.fireworkCount).toBeGreaterThan(atClear);
  expect(await music()).toBe('happy');
  const skyClear = await skyColor(); // クリア表示は画面全体に半透明の黒を重ねるので、少し暗い青空
  expect(skyClear[2]).toBeGreaterThan(skyClear[0] + 60);
  expect(skyClear[2]).toBeGreaterThan(120);
  const fw = (await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'firework').length;
  expect(fw).toBe(s.collapse.fireworkCount); // 1 発ごとに花火の音
  // クリア表示が終わると自動で次の周回の 1 面。BGM は通常の曲、背景は夜に戻る
  s = await step(page, 60);
  expect(await music()).toBe('happy');
  s = await leaveClear(page);
  expect(s.stageId).toBe('girders');
  expect(s.round).toBe(2);
  expect(s.collapse).toBe(null);
  expect(await music()).toBe('main');
  expect((await skyColor())[2]).toBeLessThan(80);
});

test('R28. 幸せな BGM はオリジナルの 8 小節ループ(C メジャー・矩形波のメロディー・三角波のベース・雑音のドラム)。音はすべて C メジャーの音階の中', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const r = await page.evaluate(() => {
    const info = window.DP.music.songInfo('happy');
    const chans = new Set();
    const off = [];
    const scale = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    for (let i = 0; i < info.steps; i++) {
      for (const e of window.DP.music.songEvents('happy', i)) {
        chans.add(e.ch);
        if (e.kind === 'lead' || e.kind === 'guitar' || e.kind === 'bass') {
          const midi = Math.round(69 + 12 * Math.log2(e.freq / 440));
          if (!scale.includes(((midi % 12) + 12) % 12)) off.push(midi);
        }
      }
    }
    return { info, chans: [...chans].sort(), off };
  });
  expect(r.info.bars).toBe(8);
  expect(r.info.title).toContain('original');
  expect(r.chans).toEqual(['noise', 'pulse1', 'pulse2', 'tri']);
  expect(r.off).toEqual([]);
});

// ---------------------------------------------------------------- 怒ったポリスマンあり(1 周目)

test('R29. 怒ったポリスマン(1 周目: 2 人)ありでも、本物のキーボード操作で 8 本すべてのピンを抜いてクリア演出まで進める(敵をよけない単純な自動操作なので、ミスしたら抜いたピンが残ったまま再挑戦する)', async ({ page }) => {
  test.setTimeout(600000);
  await startAtStage(page, STAGE4, { cops: true });
  await page.evaluate(() => window.__dp.setLives(9));
  const order = ['p1', 'p3', 'p5', 'p7', 'p8', 'p6', 'p4', 'p2'];
  let misses = 0;
  let s = await snap(page);
  for (let attempt = 0; attempt < 8 && s.state !== 'collapse'; attempt++) {
    await pullAllWithKeyboard(page, order);
    s = await snap(page);
    if (s.state === 'collapse') break;
    // ミスした: 抜いたピンは残ったまま、スタートから再挑戦
    expect(s.state).toBe('dying');
    misses++;
    const pulled = s.pins.filter((p) => p.pulled).length;
    for (let i = 0; i < 600 && s.state !== 'playing'; i++) s = await step(page, 1);
    expect(s.pins.filter((p) => p.pulled).length).toBe(pulled);
  }
  expect(s.state).toBe('collapse');
  expect(s.pins.every((p) => p.pulled)).toBe(true);
  console.log(`R29 ポリスマンありで 8 本抜くまでのミス: ${misses} 回`);
});

test('R30. ボーナスアイテム 3 個は、ピンの抜け方 256 通りすべてで、スタートから(ハシゴと穴の跳び越えで)行ける床の上にあり、真下に穴が開かない(取れなくならない)', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const states = await page.evaluate(() => {
    const dp = window.__dp;
    const ids = window.DP.stages[3].pins.map((p) => p.id);
    const out = [];
    for (let mask = 0; mask < 256; mask++) {
      dp.setManual(true);
      dp.setCopsEnabled(false);
      dp.startStage(3);
      let s = dp.step(1);
      while (s.state !== 'playing') s = dp.step(1);
      ids.forEach((id, i) => { if (mask & (1 << i)) dp.pullPin(id); });
      s = dp.snapshot();
      out.push({ mask, lv: dp.level(), prizes: s.prizes, boss: s.boss, start: { girder: s.player.girder, x: s.player.x } });
    }
    return out;
  });
  let checked = 0;
  for (const st of states) {
    const graph = buildGraph(st.lv, st.boss);
    const reached = bfs(graph, graph.at(st.start.girder, st.start.x).id);
    expect(st.prizes.length).toBe(3);
    for (const pz of st.prizes) {
      const name = `抜け方 ${st.mask.toString(2).padStart(8, '0')}: ${pz.id}`;
      expect(pz.girder, name).not.toBe(null); // 真下に床がある
      const g = st.lv.girders.find((q) => q.id === pz.girder);
      expect(pz.x - 10 >= g.x1 && pz.x + 10 <= g.x2, name).toBe(true); // アイテムの幅ごと床の上
      const n = graph.at(pz.girder, pz.x);
      expect(n && n.id in reached, `${name} に行けない`).toBe(true);
      checked++;
    }
  }
  expect(checked).toBe(256 * 3);
});
