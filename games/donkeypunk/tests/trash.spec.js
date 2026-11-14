// ドンキーパンク 1 面: 斜め投げのゴミ箱のテスト
// R5 以降、ゴリラの通常の投げ方の一部(R5・R6 10% / R7・R8 20% / R9 25% / R10〜 30%)が、四角い金属製のゴミ箱になる。
// ゴリラは頭の上に持ち上げ、斜め下へ投げる。ゴミ箱は「ジグザグ落下」(壊れた樽のような動き。DP.hazards.zigzag):
// 投げるたびに、最初の 1 区間(最初の鉄骨に当たるまで)の角度 5〜15 度と、そのあとの角度 20〜45 度(70% は 25〜35 度)を選び、
// 重力なしにまっすぐ斜め下へ進む(最初の鉄骨で 20〜45 度に切り替わる)。鉄骨に当たるたびに左右だけ反転して
// その鉄骨を通り抜け(同じ鉄骨では 1 回だけ)、画面の左右の端でも左右を反転し、最下段の下へ抜けたら消える。転がる動きにはならない。
// 鉄骨に当たるたびに「ガタン」。回転のアニメーションは進んだ距離に合わせる。当たり判定は 14×14。得点は単体と同じ(ジャンプ 100 / 釘バット 300)
const { test, expect } = require('@playwright/test');
const { step, snap, watchConsoleErrors } = require('./helpers');

watchConsoleErrors(test);

const RATES = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0.1, 6: 0.1, 7: 0.2, 8: 0.2, 9: 0.25, 10: 0.3 };

// 1 面を round 周回目で始めてプレイ中にする。opts.trashRate を渡すとゴミ箱の割合をテスト用に変える(1 で毎回ゴミ箱)
async function begin(page, round, opts = {}) {
  await page.goto(opts.url || './?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  return page.evaluate(([round, opts]) => {
    const d = window.__dp;
    d.setManual(true); d.setSeed(opts.seed || 1); d.startStage(0, round);
    let s = d.step(1);
    while (s.state !== 'playing') s = d.step(1);
    const g = d.gameForRender().data;
    if (opts.noOpening) g.boss.opening = null;
    if (opts.trashRate !== undefined) g.boss.rules = Object.assign({}, g.boss.rules, { trashRate: opts.trashRate });
    if (opts.bossOff) d.setBossEnabled(false);
    d.placePlayer('top', 300);
    return d.snapshot();
  }, [round, opts]);
}

test('T1. R1〜R4 ではゴミ箱は出ない(乱数 3 通り × 60 秒)。R1〜R4 の乱数の並びが変わらないことは stage1rounds.spec.js の R0・R0b で確かめる', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test&dev&inv=1');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const r of [1, 2, 3, 4]) {
    for (const seed of [1, 2, 3]) {
      const types = await page.evaluate(([r, seed]) => {
        const d = window.__dp;
        d.setManual(true); d.setSeed(seed); d.startStage(0, r);
        let s = d.step(1);
        while (s.state !== 'playing') s = d.step(1);
        d.placePlayer('top', 300);
        const types = new Set();
        for (let t = 0; t < 3600; t++) { s = d.step(1); for (const h of s.hazards) types.add(h.type); if (s.boss.holding) types.add('持ち上げ:' + s.boss.holding); }
        return [...types];
      }, [r, seed]);
      expect(types.some((t) => t.includes('trash')), `R${r} 乱数 ${seed}: ${types}`).toBe(false);
    }
  }
});

test('T2. 周回別の割合: R1〜R4 0%・R5〜R6 10%・R7〜R8 20%・R9 25%・R10 30%。R11・R20・R100 は R10 と同じ 30%。実際に投げた数でも、R5 は約 10%・R10 は約 30%(通常の投げ方のうち)', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('./?test&dev&inv=1');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const r of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 100]) {
    const rate = await page.evaluate((r) => { const d = window.__dp; d.setManual(true); d.startStage(0, r); return d.step(1).boss.rules.trashRate; }, r);
    expect(rate, `R${r}`).toBe(RATES[Math.min(r, 10)]);
  }
  // 実際に投げた数: 開幕の連続投げのあとの、通常の投げ方(連投の 2 本目は除く)のうちゴミ箱の割合
  for (const [r, expected, tol] of [[5, 0.1, 0.06], [10, 0.3, 0.08]]) {
    const res = await page.evaluate((r) => {
      const d = window.__dp;
      let normal = 0, trash = 0;
      for (let seed = 1; seed <= 12; seed++) {
        d.setManual(true); d.setSeed(seed); d.startStage(0, r);
        let s = d.step(1);
        while (s.state !== 'playing') s = d.step(1);
        d.placePlayer('top', 300);
        const n0 = s.boss.rules.openingThrows;
        let count = 0; let prevBoss = s.boss;
        for (let t = 0; t < 3600; t++) {
          s = d.step(1);
          // ゴリラが持ち上げた(待ち → 持ち上げ)瞬間に、何を持ったかを数える(連投の 2 本目は「転がす → 持ち上げ」なので数えない)
          if (prevBoss.state === 'idle' && s.boss.state === 'grab') {
            count++;
            if (count > n0) { normal++; if (s.boss.holding === 'trash') trash++; }
          }
          prevBoss = s.boss;
        }
      }
      return { normal, trash };
    }, r);
    const ratio = res.trash / res.normal;
    expect(res.normal, `R${r}`).toBeGreaterThan(150);
    expect(Math.abs(ratio - expected), `R${r}: ${res.trash}/${res.normal} = ${ratio.toFixed(3)}`).toBeLessThan(tol);
  }
});

// ゴミ箱を 1 個だけ投げさせて(そのあとゴリラは止める)、消えるまで毎ステップの状態を集める
async function traceOne(page, round, seed) {
  await begin(page, round, { url: './?test&dev&inv=1', seed, noOpening: true, trashRate: 1 });
  return page.evaluate(() => {
    const d = window.__dp;
    const g = d.gameForRender().data;
    d.clearSounds();
    let id = null;
    const path = [];
    for (let t = 0; t < 1200; t++) {
      d.step(1);
      const h = g.hazards.find((q) => (id === null ? q.type === 'trash' : q.id === id));
      if (!h) { if (id !== null) break; continue; }
      if (id === null) d.setBossEnabled(false);
      id = h.id;
      path.push({ x: h.x, y: h.y, vx: h.vx, vy: h.vy, state: h.state, hits: h.hits.slice(), angle: h.angle, firstAngle: h.firstAngle, box: window.DP.hazards.hitbox(h) });
    }
    return { path, sounds: d.sounds(), girders: d.level().girders };
  });
}

test('T3. ゴリラが頭の上にゴミ箱を持ち上げ、転がす動きに変わった瞬間に、頭の上から右下へジグザグ落下で飛び出す(1 本ずつ。連投にはならない)', async ({ page }) => {
  await begin(page, 10, { noOpening: true, trashRate: 1 });
  await page.evaluate(() => { const g = window.__dp.gameForRender().data; g.boss.rules.doubleRate = 1; });
  const res = await page.evaluate(() => {
    const d = window.__dp;
    const out = [];
    let prev = d.snapshot();
    const seen = new Set();
    for (let t = 0; t < 1500; t++) {
      const s = d.step(1);
      for (const h of s.hazards) {
        if (seen.has(h.id)) continue;
        seen.add(h.id);
        out.push({ t, type: h.type, state: h.state, x: h.x, y: h.y, dir: h.dir, prevBoss: prev.boss.state, prevHolding: prev.boss.holding, boss: s.boss.state, bossX: s.boss.x, bossY: s.boss.y });
      }
      prev = s;
    }
    return out;
  });
  expect(res.length).toBeGreaterThan(5);
  for (const th of res) {
    expect(th.type).toBe('trash');
    expect([th.prevBoss, th.prevHolding, th.boss]).toEqual(['grab', 'trash', 'throw']);
    expect(th.state).toBe('zigzag');
    expect(th.dir).toBe(1); // 右下へ
    expect(th.x).toBeGreaterThan(th.bossX + 18);
    expect(th.x).toBeLessThan(th.bossX + 18 + 3);
    expect(th.y).toBeLessThan(th.bossY - 50);
  }
  for (let i = 1; i < res.length; i++) expect(res[i].t - res[i - 1].t).toBeGreaterThanOrEqual(109);
});

test('T4. ジグザグ落下: 最初の 1 区間は 5〜15 度で飛び、最初の鉄骨で左右を反転して 20〜45 度に切り替わる。そのあとは鉄骨に当たると左右だけ反転する(縦の速さと角度は同じまま)。同じ鉄骨では 1 回だけ反転し、鉄骨を通り抜けて下の段へ進み、最下段(g0)まで反転をくり返して画面の下へ抜けて消える。転がる動きにはならない。当たるたびに「ガタン」。当たり判定は 14×14', async ({ page }) => {
  test.setTimeout(120000);
  for (const [round, seed] of [[5, 1], [5, 2], [10, 3], [10, 4], [10, 5]]) {
    const { path, sounds, girders } = await traceOne(page, round, seed);
    const label = `R${round} 乱数 ${seed}`;
    expect(path.every((q) => q.state === 'zigzag'), label + ' ずっとジグザグ落下(転がらない)').toBe(true);
    const last = path[path.length - 1];
    expect(last.y, label + ' 画面の下へ抜けて消えた').toBeGreaterThan(560);
    const hits = last.hits;
    // 同じ鉄骨で 2 回反転しない / 上の段から順に当たる / 最下段 g0 まで当たる
    expect(new Set(hits).size, label).toBe(hits.length);
    expect(hits[0], label).toBe('g5');
    expect(hits[hits.length - 1], label).toBe('g0');
    const order = ['g5', 'g4', 'g3', 'g2', 'g1', 'g0'];
    for (let i = 1; i < hits.length; i++) expect(order.indexOf(hits[i]), label).toBeGreaterThan(order.indexOf(hits[i - 1]));
    expect(hits.length, label).toBeGreaterThanOrEqual(4); // 鉄骨のない所(g2・g4 の左端)を通ると、その段は反転せずに通り過ぎる
    // 鉄骨に当たったステップで左右だけ反転(縦の速さは変わらない)し、そのあとも下へ進む(鉄骨を通り抜ける)
    // 最初の 1 区間の角度で飛び出し、最初の鉄骨から通常の角度
    const deg = (q) => (Math.atan2(q.vy, Math.abs(q.vx)) * 180) / Math.PI;
    expect(deg(path[0]), label).toBeCloseTo(path[0].firstAngle, 6);
    const firstHit = path.findIndex((q) => q.hits.length === 1);
    expect(deg(path[firstHit]), label).toBeCloseTo(path[0].angle, 6);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (i !== firstHit) expect(b.vy, label).toBeCloseTo(a.vy, 9); // 縦の速さが変わるのは最初の鉄骨だけ
      expect(b.y, label).toBeGreaterThan(a.y);
      if (b.hits.length > a.hits.length) {
        expect(Math.sign(b.vx), label + ' 当たったら反転').toBe(-Math.sign(a.vx));
        const gd = girders.find((q) => q.id === b.hits[b.hits.length - 1]);
        // 当たった鉄骨の上面を、このステップで上から下へ横切った
        const sy = (x) => gd.y1 + ((gd.y2 - gd.y1) * (x - gd.x1)) / (gd.x2 - gd.x1);
        expect(a.y, label).toBeLessThanOrEqual(sy(a.x) + 0.001);
        expect(b.y, label).toBeGreaterThan(sy(b.x));
      } else if (b.x > 10 && b.x < 470 && a.x > 10 && a.x < 470) {
        // (画面の端で反転すると、端から最大 1 ステップぶん内側に折り返すので、端から 3px 以内は除く)
        expect(Math.sign(b.vx), label + ' 鉄骨・画面の端以外では反転しない').toBe(Math.sign(a.vx));
      }
    }
    // 角度: 最初の 1 区間は 5〜15 度、そのあとは 20〜45 度
    expect(path[0].firstAngle, label).toBeGreaterThanOrEqual(5);
    expect(path[0].firstAngle, label).toBeLessThanOrEqual(15);
    expect(path[0].angle, label).toBeGreaterThanOrEqual(20);
    expect(path[0].angle, label).toBeLessThanOrEqual(45);
    // 当たるたびに「ガタン」(6 ステップに 1 回まで)
    const thuds = sounds.filter((n) => n === 'trashThud').length;
    expect(thuds, label).toBeGreaterThanOrEqual(hits.length - 1);
    expect(thuds, label).toBeLessThanOrEqual(hits.length);
    for (const q of path) expect([q.box.w, q.box.h], label).toEqual([14, 14]);
  }
});

test('T5. 画面の左右の端: 端に届いたら左右を反転して斜め下への落下を続ける(端で消えない・引っかからない・続けて反転しない)。最下段の下へ抜けたときだけ消える', async ({ page }) => {
  test.setTimeout(120000);
  await begin(page, 10, { url: './?test&dev&inv=1', noOpening: true, bossOff: true });
  // 右端・左端の近くから、浅い角度(45 度)で端へ向かって投げる
  for (const [label, x, y, dir] of [['右端', 440, 60, 1], ['左端', 40, 60, -1]]) {
    const r = await page.evaluate(([x, y, dir]) => {
      const d = window.__dp;
      const g = d.gameForRender().data;
      d.clearHazards();
      d.spawnHazard('trash', 'g5', 300);
      window.DP.hazards.zigzag(g.hazards[0], x, y, 45, 2.7, dir);
      const path = [];
      for (let t = 0; t < 400; t++) {
        d.step(1);
        const h = g.hazards[0];
        if (!h) break;
        path.push({ x: h.x, y: h.y, vx: h.vx, state: h.state });
      }
      return path;
    }, [x, y, dir]);
    const xs = r.map((q) => q.x);
    expect(Math.min(...xs), label).toBeGreaterThanOrEqual(7);
    expect(Math.max(...xs), label).toBeLessThanOrEqual(473);
    // 端で反転した(横の向きが変わった)ステップがあり、そのあとも下へ進んだ
    const flips = r.filter((q, i) => i > 0 && Math.sign(q.vx) !== Math.sign(r[i - 1].vx) && (q.x <= 10 || q.x >= 470));
    expect(flips.length, label + ' 端で反転').toBeGreaterThan(0);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].y, label).toBeGreaterThan(r[i - 1].y);
      // 同じ端で 2 ステップ続けて反転しない
      if (i > 1) expect(Math.sign(r[i].vx) !== Math.sign(r[i - 1].vx) && Math.sign(r[i - 1].vx) !== Math.sign(r[i - 2].vx), label).toBe(false);
    }
    expect(r.every((q) => q.state === 'zigzag'), label).toBe(true);
    expect(r[r.length - 1].y, label + ' 最下段の下へ抜けて消えた').toBeGreaterThan(560);
  }
  // R10 で毎回ゴミ箱を投げさせて 60 秒: ゴミ箱は画面の下へ抜けたときだけ消え、転がらず、画面の左右の外へ出ない
  const res = await page.evaluate(() => {
    const d = window.__dp;
    d.setSeed(11); d.startStage(0, 10);
    let s = d.step(1);
    while (s.state !== 'playing') s = d.step(1);
    const g = d.gameForRender().data;
    g.boss.opening = null; g.boss.rules = Object.assign({}, g.boss.rules, { trashRate: 1 });
    d.placePlayer('top', 300);
    const prev = new Map();
    const bad = [];
    let exits = 0;
    for (let t = 0; t < 3600; t++) {
      s = d.step(1);
      const now = new Map(s.hazards.map((h) => [h.id, h]));
      for (const h of s.hazards) {
        if (h.type === 'trash' && h.state !== 'zigzag') bad.push('ゴミ箱が転がった ' + JSON.stringify(h));
        if (h.type === 'trash' && (h.x < 6.9 || h.x > 473.1)) bad.push('画面の左右の外 ' + JSON.stringify(h));
      }
      for (const [id, p] of prev) {
        if (now.has(id) || p.type !== 'trash') continue;
        if (p.y > 540) exits++; else bad.push('途中で消えた ' + JSON.stringify(p));
      }
      prev.clear();
      for (const h of s.hazards) prev.set(h.id, h);
    }
    return { bad: bad.slice(0, 5), exits };
  });
  expect(res.bad).toEqual([]);
  expect(res.exits).toBeGreaterThan(10);
});

test('T6. 角度: 最初の 1 区間は 5〜15 度(一様)、最初の鉄骨からは 20〜45 度で約 70% が中心の 25〜35 度(残りは 20〜25 度と 35〜45 度)。速さは R5 2.4・R10 2.7 px/ステップ(瓶・缶と同じ周回の倍率)', async ({ page }) => {
  test.setTimeout(120000);
  for (const [round, speed] of [[5, 2.4], [10, 2.7]]) {
    await begin(page, round, { url: './?test&dev&inv=1', noOpening: true, trashRate: 1 });
    const res = await page.evaluate(() => {
      const d = window.__dp;
      const g = d.gameForRender().data;
      const out = [];
      const seen = new Set();
      for (let seed = 1; seed <= 6; seed++) {
        d.setSeed(seed); d.startStage(0, g.round);
        let s = d.step(1);
        while (s.state !== 'playing') s = d.step(1);
        g.boss.opening = null; g.boss.rules = Object.assign({}, g.boss.rules, { trashRate: 1 });
        d.placePlayer('top', 300);
        for (let t = 0; t < 7000; t++) {
          d.step(1);
          for (const h of g.hazards) if (h.type === 'trash' && !seen.has(h.id)) { seen.add(h.id); out.push({ angle: h.angle, first: h.firstAngle, speed: Math.hypot(h.vx, h.vy), real: (Math.atan2(h.vy, Math.abs(h.vx)) * 180) / Math.PI }); }
        }
      }
      return out;
    });
    expect(res.length, `R${round}`).toBeGreaterThan(250);
    for (const r of res) {
      expect(r.angle).toBeGreaterThanOrEqual(20);
      expect(r.angle).toBeLessThanOrEqual(45);
      expect(r.first).toBeGreaterThanOrEqual(5);
      expect(r.first).toBeLessThanOrEqual(15);
      expect(r.real).toBeCloseTo(r.first, 6); // 飛び出した向きは最初の 1 区間の角度
      expect(r.speed).toBeCloseTo(speed, 6);
    }
    const core = res.filter((r) => r.angle >= 25 && r.angle <= 35).length / res.length;
    expect(Math.abs(core - 0.7), `R${round} 25〜35 度の割合 ${core.toFixed(3)}`).toBeLessThan(0.08);
    // 中心の外(20〜25 度・35〜45 度)も両方出る。外の 30% は幅の比(5:10)で分かれる
    const low = res.filter((r) => r.angle < 25).length / res.length;
    const high = res.filter((r) => r.angle > 35).length / res.length;
    expect(low, `R${round} 20〜25 度`).toBeGreaterThan(0.04);
    expect(high, `R${round} 35〜45 度`).toBeGreaterThan(0.12);
    // 最初の 1 区間の角度は 5〜15 度に一様に散らばる(前半・後半とも出る)
    expect(res.filter((r) => r.first < 10).length / res.length).toBeGreaterThan(0.38);
    expect(res.filter((r) => r.first >= 10).length / res.length).toBeGreaterThan(0.38);
  }
});

test('T7. 当たり判定と得点: 落ちてくるゴミ箱に触れるとミス(DEV の無敵ならミスにならない)。真下を通られたジャンプでは 100 点(1 回だけ)、釘バットで壊すと 300 点(1 回だけ・破壊音 1 回・灰色のかけら)', async ({ page }) => {
  // 落ちてくるゴミ箱の通り道に立っているとミス: g3 に立ち、真上からまっすぐ近い角度で落とす
  const drop = async (url, opts = {}) => {
    await begin(page, 10, { url, bossOff: true });
    return page.evaluate((opts) => {
      const d = window.__dp;
      const g = d.gameForRender().data;
      d.clearHazards(); d.placePlayer('g3', 260);
      if (opts.bat) { d.setFacing(1); d.setBat(600); d.clearSounds(); }
      d.spawnHazard('trash', 'g5', 300);
      window.DP.hazards.zigzag(g.hazards[0], 250, 200, 75, 2.7, 1);
      g.hazards[0].passed.add('g5'); g.hazards[0].passed.add('g4');
      let s;
      for (let t = 0; t < 60; t++) { s = d.step(1); if (s.state !== 'playing' || !s.hazards.length) break; }
      return { state: s.state, score: s.score, left: s.hazards.length, sounds: d.sounds(), fx: g.effects.filter((e) => e.type === 'trash').length };
    }, opts);
  };
  let r = await drop('./?test');
  expect(r.state).toBe('dying');
  r = await drop('./?test&dev&inv=1');
  expect(r.state).toBe('playing');
  // 釘バット(頭上へ振る)で、落ちてくるゴミ箱を壊す
  r = await drop('./?test', { bat: true });
  expect(r.state).toBe('playing');
  expect(r.left).toBe(0);
  expect(r.score).toBe(300);
  expect(r.sounds.filter((n) => n === 'smash').length).toBe(1);
  expect(r.fx).toBe(1);
  // ジャンプ: 本物のキーボードで跳び、ゴミ箱が足元の鉄骨を通り抜けて真下を通る → 100 点(1 回だけ)
  await begin(page, 10, { bossOff: true });
  await page.evaluate(() => { const d = window.__dp; d.clearHazards(); d.placePlayer('g3', 260); });
  await page.keyboard.press('Space');
  let s = await step(page, 12);
  await page.evaluate(() => {
    const d = window.__dp;
    const g = d.gameForRender().data;
    d.spawnHazard('trash', 'g5', 300);
    // 足元の鉄骨(g3)のすぐ上・主人公の少し左から、右下へ浅く落とす(主人公の真下で g3 を横切って通り抜ける)
    window.DP.hazards.zigzag(g.hazards[0], 254, 296, 45, 2.7, 1);
    g.hazards[0].passed.add('g5'); g.hazards[0].passed.add('g4');
  });
  for (let i = 0; i < 60; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.score).toBe(100);
  expect(s.popups.filter((t) => t === '100').length).toBe(1);
});

test('T8. ドット絵: ゴミ箱は灰色・銀・黒の四角(瓶の緑・缶の赤を使わない)。持ち上げたとき・落ちているときに画面に描かれ、落ちている間も回って描かれる', async ({ page }) => {
  await begin(page, 10, { noOpening: true, trashRate: 1 });
  const colors = await page.evaluate(() => {
    const D = window.DP.sprites.DATA.trash; const P = window.DP.sprites.PALETTE;
    return { w: D.w, h: D.h, colors: [...new Set(D.rows.join('').replace(/\./g, ''))].map((c) => P[c]) };
  });
  expect([colors.w * 2, colors.h * 2]).toEqual([14, 14]);
  expect(colors.colors).not.toContain('#1f8a3a');
  expect(colors.colors).not.toContain('#e02a2a');
  const silverAt = (x, y) => page.evaluate(([x, y]) => {
    const ctx = document.querySelector('canvas').getContext('2d');
    const d = ctx.getImageData(Math.round(x - 12), Math.round(y - 22), 24, 24).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 0xcf && d[i + 1] === 0xd6 && d[i + 2] === 0xe0) n++;
    return n;
  }, [x, y]);
  let s = await snap(page);
  for (let i = 0; i < 200 && !(s.boss.state === 'grab' && s.boss.holding === 'trash'); i++) s = await step(page, 1);
  await page.waitForTimeout(60);
  expect(await silverAt(s.boss.x, s.boss.y - 44)).toBeGreaterThan(5);
  for (let i = 0; i < 300 && !s.hazards.some((h) => h.type === 'trash'); i++) s = await step(page, 1);
  s = await step(page, 20);
  await page.waitForTimeout(60);
  const h = s.hazards.find((q) => q.type === 'trash');
  expect(h.state).toBe('zigzag');
  expect(await silverAt(h.x, h.y)).toBeGreaterThan(3);
});

test('T9. 通る範囲: R5・R10 で、ゴミ箱は画面の左側だけでなく中央(x 160〜320)・右側(x 320〜480)にも飛んでくる。右端の近くまで届く(位置は乱数 6 通り × 40 秒、80px ごとの区間にいたステップ数で数える)', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./?test&dev&inv=1');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  for (const round of [5, 10]) {
    const r = await page.evaluate((round) => {
      const d = window.__dp; const g = d.gameForRender().data;
      const bins = [0, 0, 0, 0, 0, 0]; let total = 0; let maxX = 0;
      for (let seed = 1; seed <= 6; seed++) {
        d.setManual(true); d.setSeed(seed); d.startStage(0, round);
        let s = d.step(1); while (s.state !== 'playing') s = d.step(1);
        g.boss.opening = null; g.boss.rules = Object.assign({}, g.boss.rules, { trashRate: 1 });
        d.placePlayer('top', 300);
        for (let t = 0; t < 2400; t++) {
          d.step(1);
          for (const h of g.hazards) {
            if (h.type !== 'trash' || h.y < 0 || h.y > 560) continue;
            bins[Math.min(5, Math.floor(h.x / 80))]++; total++; maxX = Math.max(maxX, h.x);
          }
        }
      }
      return { pct: bins.map((n) => n / total), maxX };
    }, round);
    const left = r.pct[0] + r.pct[1], center = r.pct[2] + r.pct[3], right = r.pct[4] + r.pct[5];
    const label = `R${round}: 左 ${(left * 100).toFixed(0)}% / 中央 ${(center * 100).toFixed(0)}% / 右 ${(right * 100).toFixed(0)}%`;
    // 角度を 20〜45 度にしただけのころは、中央 7%・右 0%(いちばん右 x 236)だった
    expect(center, label).toBeGreaterThan(0.2);
    expect(right, label).toBeGreaterThan(0.04);
    expect(r.maxX, label).toBeGreaterThan(460);
    expect(left, label).toBeLessThan(0.8);
  }
});
