// ドンキーパンク 4 面の雑魚敵「怒ったポリスマン」(js/cops.js、仕掛け 'cops')のテスト
// 鉄骨の上を歩き、ハシゴで段を移って主人公へゆるく寄ってくる。主人公の方へ振り向く前に「!」で 0.2 秒止まる。
// 穴・足場の端で折り返して落ちない。足元のピンを抜かれると穴から落ちて気絶(300 点)。周回で人数・速さが変わる
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage } = require('./helpers');

watchConsoleErrors(test);

const STAGE4 = 3;
const cops = (s) => s.enemies.filter((e) => e.type === 'cop');
// 主人公をガールの足場に置く(ポリスマンが来られない場所。4 面ではガールに触れてもクリアにならない)
const parkSafe = (page) => page.evaluate(() => window.__dp.placePlayer('top', 280));

// 4 面をポリスマンありで始める(round: 周回)。READY が終わってプレイ中になった状態を返す
async function start4(page, { round = 1, cops: on = true } = {}) {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(([r, c]) => {
    window.__dp.setManual(true);
    window.__dp.setSeed(1);
    window.__dp.setCopsEnabled(c);
    window.__dp.startStage(3, r);
  }, [round, on]);
  let s = await step(page, 1);
  await page.evaluate(() => window.__dp.setBossEnabled(false));
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  return s;
}

test('C1. 出現: 4 面だけに出る。プレイ開始から 180 ステップ(3 秒)で 1 人目が笛の合図(whistle)とともに点滅しながら現れ(60 ステップ。この間は当たらない)、4 秒後に 2 人目。1 周目は同時に 2 人まで。出現地点は F3 の右と F2 の左から交互(ふさがっていればもう一方)', async ({ page }) => {
  test.setTimeout(120000);
  // 1〜3 面: 出現を有効にしていても出ない
  for (const i of [0, 1, 2]) {
    await startAtStage(page, i, { cops: true });
    await page.evaluate(() => { window.__dp.setLadderChance(0); window.__dp.placePlayer('top', 240); });
    const s = await step(page, 600);
    expect(cops(s), `${i + 1} 面`).toEqual([]);
  }
  await start4(page);
  await parkSafe(page);
  await page.evaluate(() => window.__dp.clearSounds());
  const seen = [];
  let s;
  for (let t = 1; t <= 1200; t++) {
    s = await page.evaluate(() => window.__dp.step(1));
    for (const e of cops(s)) if (!seen.find((x) => x.id === e.id)) seen.push({ id: e.id, t, x: e.x, girder: e.girder, state: e.state });
    expect(cops(s).length).toBeLessThanOrEqual(2);
  }
  expect(seen.length).toBe(2); // 2 人とも生きているので、それ以上は出ない
  expect(seen[0]).toMatchObject({ t: 180, x: 416, girder: 'F3', state: 'spawn' });
  expect(seen[1]).toMatchObject({ t: 180 + 240, x: 56, girder: 'F2', state: 'spawn' });
  expect((await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'whistle').length).toBe(2);
});

test('C2. 現れている間(点滅中の 60 ステップ)は主人公と重なっても当たらない。歩き出したあとに触れるとミス(hazard)', async ({ page }) => {
  await start4(page, { cops: false });
  await page.evaluate(() => { window.__dp.placePlayer('F1', 240); window.__dp.spawnCop('F1', 240); });
  let s = await step(page, 59);
  expect(s.state).toBe('playing');
  expect(cops(s)[0].state).toBe('spawn');
  s = await step(page, 2);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
});

test('C3. 主人公が出現地点の近く(同じ段の 80px 以内)にいると、その地点からは出ず、もう一方の地点から出る', async ({ page }) => {
  await start4(page);
  await page.evaluate(() => window.__dp.placePlayer('F3', 400)); // F3 の右の出現地点のそば
  let s = await step(page, 180);
  expect(cops(s).length).toBe(1);
  expect(cops(s)[0]).toMatchObject({ girder: 'F2', x: 56 });
});

test('C4. 穴と足場の端で折り返して、歩いて落ちることはない: ピンの抜け方 256 通りすべてで、ポリスマン 3 人を 600 ステップ動かしても誰も落ちず、いつも足場の端から 8px 以上内側(またはハシゴの上)にいる', async ({ page }) => {
  test.setTimeout(300000);
  await start4(page, { cops: false });
  const res = await page.evaluate(() => {
    const dp = window.__dp;
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const bad = [];
    let checked = 0;
    for (let mask = 0; mask < 256; mask++) {
      dp.setSeed(mask + 1);
      dp.startStage(3);
      let s = dp.step(1);
      dp.setBossEnabled(false);
      while (s.state !== 'playing') s = dp.step(1);
      dp.setCopsEnabled(false);
      dp.placePlayer('top', 280);
      ids.forEach((id, k) => { if (mask & (1 << k)) dp.pullPin(id); });
      // 各段の、穴でない所に 3 人出す
      const lv = dp.level();
      const floors = lv.girders.filter((g) => g.id !== 'f0' && g.id !== 'top' && g.x2 - g.x1 > 40);
      for (let k = 0; k < 3; k++) {
        const g = floors[(mask + k * 3) % floors.length];
        dp.spawnCop(g.id.split('@')[0], (g.x1 + g.x2) / 2, { skipSpawn: true, dir: k % 2 ? 1 : -1 });
      }
      for (let i = 0; i < 600; i++) {
        s = dp.step(1);
        const lv2 = dp.level();
        for (const e of s.enemies) {
          checked++;
          if (e.state === 'fall' || e.state === 'stunned') { bad.push({ mask, e }); continue; }
          if (e.state === 'ladder') continue;
          const g = lv2.girders.find((q) => q.id === e.girder);
          if (!g || e.x < g.x1 + 8 - 1e-6 || e.x > g.x2 - 8 + 1e-6) bad.push({ mask, e, g });
        }
        if (s.state !== 'playing') break;
      }
    }
    return { bad: bad.slice(0, 5), n: bad.length, checked };
  });
  expect(res.n, JSON.stringify(res.bad)).toBe(0);
  expect(res.checked).toBeGreaterThan(256 * 600 * 2);
});

test('C5. 振り向きの予告: 主人公の方へ向きを変えるときは、必ず 12 ステップ(0.2 秒)その場で止まって「!」の状態(turn)になってから振り向く', async ({ page }) => {
  test.setTimeout(180000);
  await start4(page, { cops: false });
  const res = await page.evaluate(() => {
    const dp = window.__dp;
    const turns = [];
    for (let seed = 1; seed <= 30; seed++) {
      dp.setSeed(seed);
      dp.startStage(3);
      let s = dp.step(1);
      dp.setBossEnabled(false);
      while (s.state !== 'playing') s = dp.step(1);
      dp.setCopsEnabled(false);
      dp.placePlayer('F1', 400);
      dp.spawnCop('F1', 200, { skipSpawn: true, dir: -1 }); // 主人公と反対を向いて歩いている
      let prev = s.enemies[0] || dp.snapshot().enemies[0];
      let cur = null;
      for (let i = 0; i < 240 && s.state === 'playing'; i++) {
        s = dp.step(1);
        const e = s.enemies[0];
        if (!e) break;
        if (e.state === 'turn' && prev.state !== 'turn') cur = { start: i, x: e.x, dirBefore: prev.dir, steps: 0, moved: false, turnTo: e.turnTo };
        if (cur && e.state === 'turn') { cur.steps++; if (e.x !== cur.x) cur.moved = true; }
        if (cur && e.state !== 'turn') { cur.dirAfter = e.dir; turns.push(cur); cur = null; }
        prev = e;
      }
    }
    return turns;
  });
  expect(res.length).toBeGreaterThan(5);
  for (const t of res) {
    expect(t.steps).toBe(12);
    expect(t.moved).toBe(false);
    expect(t.dirAfter).toBe(t.turnTo);
    expect(t.dirAfter).toBe(-t.dirBefore);
  }
});

test('C6. 追いかけ方はゆるい: 同じ段で主人公と反対を向いているとき、1 秒ごとの考え直しで主人公の方へ振り向く割合は約 60%(400 回の試行で 50〜70%)', async ({ page }) => {
  test.setTimeout(180000);
  await start4(page, { cops: false });
  const r = await page.evaluate(() => {
    const dp = window.__dp;
    let toward = 0;
    let n = 0;
    for (let seed = 1; seed <= 400; seed++) {
      dp.setSeed(seed * 7 + 3);
      dp.startStage(3);
      let s = dp.step(1);
      dp.setBossEnabled(false);
      while (s.state !== 'playing') s = dp.step(1);
      dp.setCopsEnabled(false);
      dp.placePlayer('F1', 440);
      // x=200 から左へ歩かせる(考え直すまでの 60 ステップでハシゴの上を通らない位置。通るとハシゴを使うことがある)
      dp.spawnCop('F1', 200, { skipSpawn: true, dir: -1 });
      for (let i = 0; i < 60; i++) s = dp.step(1); // 60 ステップ目で考え直す
      const e = s.enemies[0];
      n++;
      if (e.state === 'turn') toward++;
    }
    return { toward, n };
  });
  const rate = r.toward / r.n;
  console.log(`C6 主人公の方へ振り向いた割合: ${(rate * 100).toFixed(1)}%`);
  expect(rate).toBeGreaterThan(0.5);
  expect(rate).toBeLessThan(0.7);
});

test('C7. 主人公がつかまっているハシゴには入らず、そのハシゴの上下の足場ではハシゴから 20px より近づかない(ハシゴを使う確率を 100% にしても)', async ({ page }) => {
  await start4(page, { cops: false });
  const r = await page.evaluate(() => {
    const dp = window.__dp;
    const c = window.DP.config.cop;
    const keep = [c.chaseChance, c.ladderChance];
    c.chaseChance = 1;
    c.ladderChance = 1;
    const lv = dp.level();
    const l = lv.ladders.find((q) => q.lower === 'F1' && q.upper === 'F2' && q.x === 280);
    dp.placePlayerLadder(l.index, l.bottomY - 40);
    dp.spawnCop('F2', l.x + 80, { skipSpawn: true, dir: -1 }); // 上の段から近づいてくる
    dp.spawnCop('F1', l.x - 80, { skipSpawn: true, dir: 1 }); // 下の段から近づいてくる
    let minDist = Infinity;
    let entered = false;
    for (let i = 0; i < 400; i++) {
      const s = dp.step(1);
      for (const e of s.enemies) {
        if (e.ladder === l.index) entered = true;
        if (e.state !== 'ladder' && (e.girder === 'F1' || e.girder === 'F2' || e.girder.startsWith('F1@') || e.girder.startsWith('F2@'))) minDist = Math.min(minDist, Math.abs(e.x - l.x));
      }
      if (s.state !== 'playing') return { dead: true };
    }
    c.chaseChance = keep[0];
    c.ladderChance = keep[1];
    return { minDist, entered };
  });
  expect(r.dead).toBeUndefined();
  expect(r.entered).toBe(false);
  expect(r.minDist).toBeGreaterThanOrEqual(20 - 1);
});

test('C8. ジャンプで飛び越えると 100 点(1 回のジャンプで同じポリスマンから 1 回だけ)。向かってくるポリスマンに向かって跳べば越えられる。真上を通る前に当たればミスで得点なし', async ({ page }) => {
  test.setTimeout(120000);
  await start4(page, { cops: false });
  const res = await page.evaluate(() => {
    const dp = window.__dp;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    const out = [];
    for (let d = 10; d <= 70; d += 2) {
      dp.setSeed(1);
      dp.startStage(3);
      let s = dp.step(1);
      dp.setBossEnabled(false);
      while (s.state !== 'playing') s = dp.step(1);
      dp.setCopsEnabled(false);
      dp.placePlayer('f0', 100);
      dp.spawnCop('f0', 100 + d, { skipSpawn: true, dir: -1 });
      const score0 = dp.snapshot().score;
      dp.clearSounds();
      key('ArrowRight', true); key(' ', true);
      s = dp.step(1);
      key(' ', false);
      for (let i = 0; i < 120 && s.state === 'playing'; i++) { s = dp.step(1); if (i > 3 && s.player.state === 'ground') break; }
      key('ArrowRight', false);
      const e = s.enemies[0];
      out.push({ d, state: s.state, gain: s.score - score0, passed: !!e && e.x < s.player.x, sounds: dp.sounds().filter((n) => n === 'score').length });
    }
    return out;
  });
  const ok = res.filter((r) => r.state === 'playing' && r.passed);
  console.log('C8 飛び越えられた距離: ' + ok.map((r) => r.d).join(' '));
  expect(ok.length).toBeGreaterThanOrEqual(5);
  for (const r of ok) {
    expect(r.gain, `d=${r.d}`).toBe(100);
    expect(r.sounds, `d=${r.d}`).toBe(1);
  }
  // 当たってミスになったとき: 真上を通る前なら 0 点。真上を通ってから降りるときにぶつかった場合は、通った時点の 100 点だけ
  const hit = res.filter((x) => x.state !== 'playing');
  for (const r of hit) expect([0, 100], `d=${r.d}`).toContain(r.gain);
  expect(hit.some((r) => r.gain === 0)).toBe(true);
});

test('C9. 足元のピンを抜くと、穴の上にいたポリスマンは下の段へ落ちて気絶し(300 点・効果音 copStun)、90 ステップ後に消える。落ちている間・気絶中は当たらない。穴から外れていたポリスマンは落ちない', async ({ page }) => {
  await start4(page, { cops: false });
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.placePlayer('top', 280);
    dp.spawnCop('F1', 126, { skipSpawn: true, dir: 1 }); // p1(x=120)の穴(x 108〜132)の上
    dp.spawnCop('F1', 140, { skipSpawn: true, dir: 1 }); // 穴から外れている
    dp.clearSounds();
  });
  const s0 = await snap(page);
  await page.evaluate(() => window.__dp.pullPin('p1'));
  let s = await snap(page);
  expect(cops(s).map((e) => e.state)).toEqual(['fall', 'walk']);
  let stunnedAt = null;
  for (let i = 0; i < 200 && cops(s).length > 1; i++) {
    s = await step(page, 1);
    const e = cops(s).find((x) => x.state !== 'walk' && x.state !== 'turn' && x.state !== 'ladder');
    if (e && e.state === 'stunned' && stunnedAt === null) {
      stunnedAt = i;
      expect(e.y).toBe(540); // 地面まで落ちて気絶
      expect(s.score - s0.score).toBe(300);
      expect(s.popups).toContain('300');
    }
  }
  expect(stunnedAt).not.toBe(null);
  expect(cops(s).length).toBe(1); // 気絶したポリスマンは消えた
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('copStun');
  // 気絶中は当たらない: 地面で気絶しているポリスマンに主人公を重ねてもミスにならない
  await page.evaluate(() => { const dp = window.__dp; dp.clearEnemies(); dp.spawnCop('F2', 184, { skipSpawn: true }); dp.placePlayer('top', 280); dp.pullPin('p3'); });
  for (let i = 0; i < 40 && cops(await snap(page))[0].state !== 'stunned'; i++) await step(page, 1);
  s = await snap(page);
  expect(cops(s)[0].state).toBe('stunned');
  await page.evaluate(() => window.__dp.placePlayer('F1', window.__dp.snapshot().enemies[0].x));
  s = await step(page, 10);
  expect(s.state).toBe('playing');
});

test('C10. 本物のキーボード: ピンの上にいるポリスマンを、ピンごとジャンプで飛び越えると、ピン 100 点 + 飛び越え 100 点 + 穴から落として 300 点', async ({ page }) => {
  test.setTimeout(120000);
  await start4(page, { cops: false });
  // うまくいく踏み切り位置とポリスマンの位置を探す(ブラウザの中で、キーは本物と同じイベント)。
  // ポリスマンは左へ歩いてくるので、主人公がピンの真上あたりで飛び越え、穴の範囲(x 108〜132)を抜けたときに
  // ポリスマンがまだ穴の範囲にいると落ちる
  const found = await page.evaluate(() => {
    const dp = window.__dp;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    for (let cx = 130; cx <= 200; cx += 2) {
      for (let px = 50; px <= 104; px += 2) {
        dp.setSeed(1);
        dp.startStage(3);
        let s = dp.step(1);
        dp.setBossEnabled(false);
        while (s.state !== 'playing') s = dp.step(1);
        dp.setCopsEnabled(false);
        dp.placePlayer('F1', px);
        dp.spawnCop('F1', cx, { skipSpawn: true, dir: -1 });
        const sc = dp.snapshot().score;
        key('ArrowRight', true); key(' ', true);
        s = dp.step(1);
        key(' ', false);
        for (let i = 0; i < 160 && s.state === 'playing'; i++) {
          s = dp.step(1);
          if (i > 3 && s.player.state === 'ground') key('ArrowRight', false);
          if (s.enemies.length === 0) break;
        }
        key('ArrowRight', false);
        if (s.state === 'playing' && s.score - sc === 500) return { px, cx };
      }
    }
    return null;
  });
  expect(found).not.toBe(null);
  // 見つけた位置から、Playwright の本物のキーボード入力でもう一度
  await start4(page, { cops: false });
  await page.evaluate((f) => { window.__dp.placePlayer('F1', f.px); window.__dp.spawnCop('F1', f.cx, { skipSpawn: true, dir: -1 }); }, found);
  const s0 = await snap(page);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  let s = await step(page, 1);
  for (let i = 0; i < 160 && s.state === 'playing' && cops(s).length; i++) {
    s = await step(page, 1);
    if (i > 3 && s.player.state === 'ground') await page.keyboard.up('ArrowRight');
  }
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('playing');
  expect(s.pins.find((p) => p.id === 'p1').pulled).toBe(true);
  expect(s.score - s0.score).toBe(500);
  console.log(`C10 踏み切り位置 x=${found.px} / ポリスマン x=${found.cx}`);
});

test('C11. ミスすると、ポリスマンは全員消えて出現は最初から数え直し(再開から 180 ステップは出ない)。ピンと穴は残る。出現地点は穴の右側の床でも正しく出る', async ({ page }) => {
  test.setTimeout(120000);
  await start4(page);
  await parkSafe(page);
  await page.evaluate(() => { window.__dp.pullPin('p6'); window.__dp.pullPin('p3'); });
  let s = await step(page, 500);
  expect(cops(s).length).toBe(2);
  await page.evaluate(() => window.__dp.killPlayer('fall'));
  s = await snap(page);
  expect(s.state).toBe('dying');
  for (let i = 0; i < 600 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(cops(s)).toEqual([]);
  expect(s.pins.filter((p) => p.pulled).map((p) => p.id).sort()).toEqual(['p3', 'p6']);
  await parkSafe(page);
  s = await step(page, 179);
  expect(cops(s)).toEqual([]);
  s = await step(page, 1);
  expect(cops(s).length).toBe(1);
  // F3 は p6 の穴で分かれているので、右の出現地点は右側の鉄骨(F3@308)に出る
  expect(cops(s)[0].girder).toBe('F3@308');
  expect(cops(s)[0].x).toBe(416);
});

test('C12. 周回ごとの難しさ(暫定値): 同時に出る人数 2 → 4 → 5、歩く速さ 0.8 → 0.9 → 1.0、ハシゴ 0.5 → 0.55 → 0.6、主人公の方を向く確率 60% → 65% → 70%、出現の間隔 4 → 3.5 → 3 秒。4 周目以降は 3 周目と同じ', async ({ page }) => {
  test.setTimeout(180000);
  const expectFor = { 1: [2, 0.8, 0.5, 0.6, 240], 2: [4, 0.9, 0.55, 0.65, 210], 3: [5, 1.0, 0.6, 0.7, 180], 4: [5, 1.0, 0.6, 0.7, 180] };
  for (const round of [1, 2, 3, 4]) {
    await start4(page, { round });
    await parkSafe(page);
    const [max, speed, climb, chase, interval] = expectFor[round];
    const spawnT = [];
    let s;
    for (let t = 1; t <= 180 + interval * (max + 1); t++) {
      s = await page.evaluate(() => window.__dp.step(1));
      if (cops(s).length > spawnT.length) spawnT.push(t);
    }
    expect(cops(s).length, `${round} 周目の人数`).toBe(max);
    expect(spawnT[0]).toBe(180);
    expect(spawnT[1] - spawnT[0], `${round} 周目の間隔`).toBe(interval);
    for (const e of cops(s)) expect([e.speed, e.climbSpeed, e.sameLevelChase], `${round} 周目`).toEqual([speed, climb, chase]);
  }
});

test('C13. 4 面のクリア演出が始まるとポリスマンは片付き、演出(崩壊 → 乱射 → 落下 → 救出 → ROUND CLEAR)は今までどおり進む', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.setSeed(1); window.__dp.startStage(3); });
  let s = await step(page, 100);
  await page.evaluate(() => window.__dp.placePlayer('top', 280));
  s = await step(page, 500);
  expect(cops(s).length).toBe(2);
  await page.keyboard.press('KeyC');
  s = await step(page, 1);
  expect(s.state).toBe('collapse');
  expect(s.enemies).toEqual([]);
  const phases = [];
  for (let i = 0; i < 2000 && s.state === 'collapse'; i++) {
    s = await step(page, 1);
    if (s.collapse && phases[phases.length - 1] !== s.collapse.phase) phases.push(s.collapse.phase);
    expect(s.enemies).toEqual([]);
  }
  expect(phases).toEqual(['clank', 'shake', 'crumble', 'gun', 'fall', 'impact', 'reunite', 'done']);
  expect(s.message).toBe('ROUND CLEAR');
});

// 8 本目のピン p6(F3 の x=296)の右端の内側に主人公を置き、触れた状態にする。ほかの 7 本は先に抜いておく
async function readyLastPin(page) {
  await page.evaluate(() => { const d = window.__dp; for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p7', 'p8']) d.pullPin(id); });
  await page.evaluate(() => {
    const d = window.__dp;
    const g = d.level().girders.find((q) => q.id.split('@')[0] === 'F3' && 307.5 >= q.x1 && 307.5 <= q.x2);
    d.placePlayer(g.id, 307.5); // ピンの x±12 の内側
  });
  await step(page, 1); // 触れた(次に x±12 の外へ出た瞬間に抜ける)
}

test('C15. 不具合の修正: 8 本目のピンを抜いたのと同じステップに出現のタイミングが来ても、新しいポリスマンは出ない(エンディングに残らない)。笛も鳴らない', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await parkSafe(page);
  await step(page, 200); // 最初の出現(180 ステップ)のタイミングを過ぎておく(自動の出現は止めてある)
  expect((await snap(page)).copTimer).toBeGreaterThanOrEqual(180);
  // p6 以外の 7 本を抜いて、p6 の右端に立つ(p6 は下で 8 本目として歩いて抜く)
  await readyLastPin(page);
  let s = await snap(page);
  expect(s.pins.filter((q) => q.pulled).length).toBe(7);
  // ここで自動の出現を有効にする: 修正前は、同じステップで 8 本目のあとにポリスマンが出ていた
  await page.evaluate(() => { window.__dp.setCopsEnabled(true); window.__dp.clearSounds(); });
  await page.keyboard.down('ArrowRight');
  s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.player.x).toBeGreaterThan(308);
  expect(s.state).toBe('collapse');
  expect(s.enemies).toEqual([]);
  expect(await page.evaluate(() => window.__dp.sounds())).not.toContain('whistle');
});

test('C16. 8 本目を抜いた瞬間に、歩いている・現れている途中・落ちている・気絶しているポリスマンがいても全員消え、エンディング(ROUND CLEAR が終わるまで)に一人も出ない。演出の段階・幸せな BGM・得点は今までどおり', async ({ page }) => {
  test.setTimeout(180000);
  await startAtStage(page, STAGE4, { cops: true });
  // 出現の自動は有効のまま。最初の 1 人が出る前(180 ステップ未満)に準備する
  await page.evaluate(() => { const d = window.__dp; for (const id of ['p1', 'p4', 'p5', 'p7', 'p8']) d.pullPin(id); });
  // A: 穴から落として気絶させる(F1 の p2)
  await page.evaluate(() => { const d = window.__dp; d.placePlayer('top', 280); d.spawnCop('F1', 344, { dir: 1, skipSpawn: true }); d.pullPin('p2'); });
  let s = await snap(page);
  for (let i = 0; i < 80 && !(s.enemies[0] && s.enemies[0].state === 'stunned'); i++) s = await step(page, 1);
  expect(s.enemies.map((e) => e.state)).toEqual(['stunned']);
  // p6 の右端に立って触れた状態にする
  await page.evaluate(() => {
    const d = window.__dp;
    const g = d.level().girders.find((q) => q.id.split('@')[0] === 'F3' && 307.5 >= q.x1 && 307.5 <= q.x2);
    d.placePlayer(g.id, 307.5);
  });
  await step(page, 1);
  // B: 歩いている(F2)/ C: 現れている途中(F4 の右)/ D: 落ちている(F2 の p3 の穴)
  await page.evaluate(() => {
    const d = window.__dp;
    d.spawnCop('F2', 300, { dir: -1, skipSpawn: true });
    d.spawnCop('F4', 420, { dir: -1 });
    d.spawnCop('F2', 184, { dir: 1, skipSpawn: true });
    d.pullPin('p3');
  });
  s = await snap(page);
  expect(s.enemies.map((e) => e.state).sort()).toEqual(['fall', 'spawn', 'stunned', 'walk']);
  expect(s.pins.filter((q) => q.pulled).length).toBe(7);
  const scoreBefore = s.score;
  await page.evaluate(() => window.__dp.clearSounds());
  await page.keyboard.down('ArrowRight');
  s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('collapse');
  expect(s.enemies).toEqual([]);
  expect(s.score).toBe(scoreBefore + 100); // 8 本目のピンの 100 点だけ
  // エンディングの最後まで: 毎ステップ、ポリスマンはいない
  const phases = [];
  let happy = false;
  for (let i = 0; i < 2000 && s.state === 'collapse'; i++) {
    s = await step(page, 1);
    expect(s.enemies).toEqual([]);
    if (s.collapse && phases[phases.length - 1] !== s.collapse.phase) phases.push(s.collapse.phase);
    if (await page.evaluate(() => window.__dp.music()) === 'happy') happy = true;
  }
  expect(phases).toEqual(['clank', 'shake', 'crumble', 'gun', 'fall', 'impact', 'reunite', 'done']);
  expect(happy).toBe(true);
  expect(s.state).toBe('clear');
  expect(s.message).toBe('ROUND CLEAR');
  expect(s.score).toBe(scoreBefore + 100 + s.clearBonus);
  // ROUND CLEAR の表示中(5 秒)も出ない
  for (let i = 0; i < 400 && s.state === 'clear'; i++) {
    s = await step(page, 1);
    if (s.state === 'clear') expect(s.enemies).toEqual([]);
  }
  expect(s.stageIndex).toBe(0); // 次の周回の 1 面へ
  expect(await page.evaluate(() => window.__dp.sounds())).not.toContain('whistle');
});

test('C14. ドット絵: ハシゴを登る背中向き(copClimb)と気絶(copDizzy)を足した。どれも面間演出の警察官と同じ 14×18', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const sizes = await page.evaluate(() => ['copWalkA', 'copWalkB', 'copClimb', 'copDizzy'].map((n) => [window.DP.sprites.DATA[n].w, window.DP.sprites.DATA[n].h]));
  for (const sz of sizes) expect(sz).toEqual([14, 18]);
});
