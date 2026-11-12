// ドンキーパンク 2 面の敵「ファイヤースカル」のテスト
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage, hold } = require('./helpers');

watchConsoleErrors(test);

const STAGE2 = 1;
const BURN_FRAMES = 60; // config.timing.dyingByReason.burn
const level = (page) => page.evaluate(() => window.__dp.level());
const skulls = (s) => s.enemies.filter((e) => e.type === 'skull');

// 主人公をガールの足場の右端に置く(スカルはそこへ上がるハシゴを使わないので安全な観察場所)
const parkSafe = (page) => page.evaluate(() => window.__dp.placePlayer('top', 290));

// n ステップ進めながら、毎ステップ全スカルの状態を集める
async function record(page, n) {
  return page.evaluate((k) => {
    const dp = window.__dp;
    const out = [];
    for (let i = 0; i < k; i++) {
      const s = dp.step(1);
      out.push({ state: s.state, player: s.player, enemies: s.enemies, lives: s.lives });
    }
    return out;
  }, n);
}

test('K1. ファイヤースカルは 2 面だけに出現し、1 面には出ない', async ({ page }) => {
  // 1 面: 出現を有効にしても、長く進めても出ない
  await startAtStage(page, 0, { skulls: true });
  await page.evaluate(() => window.__dp.placePlayer('top', 290));
  let s = await step(page, 900);
  expect(s.enemies).toEqual([]);

  // 2 面: 最初の 1 体はプレイ開始から 60 ステップ(1 秒。READY の間は数えない)、
  // 2 体目はそこから 120 ステップ(2 秒)後
  await startAtStage(page, STAGE2, { skulls: true });
  await parkSafe(page);
  const playing = async () => (await snap(page)).state === 'playing';
  // プレイ開始(READY が終わった瞬間)から数えるため、READY から測り直す
  await page.evaluate(() => window.__dp.startStage(1));
  s = await step(page, 1);
  expect(s.state).toBe('ready');
  let n = 0; // プレイ中のステップ数
  for (let i = 0; i < 200 && !(await playing()); i++) s = await step(page, 1);
  await parkSafe(page);
  const firstAt = [];
  for (; n < 400; n++) {
    s = await step(page, 1);
    const count = skulls(s).length;
    if (count > firstAt.length) firstAt.push(n + 1);
    if (firstAt.length >= 2) break;
  }
  expect(await playing()).toBe(true);
  expect(firstAt).toEqual([60, 60 + 120]); // 2 体目以降は 120 ステップ(2 秒)ごと
});

test('K2. スカルは必ず爆音アンプから現れ、左右の中段コンベアに着地する(同時に 3 体まで、左右どちらにも出る)', async ({ page }) => {
  await startAtStage(page, STAGE2, { skulls: true });
  await parkSafe(page);
  const amp = await page.evaluate(() => window.__dp.ampHitbox());
  const rows = await record(page, 4000);
  const first = new Map(); // id → 最初に見えたときの状態
  const landed = new Map(); // id → 着地したときの状態
  const prev = new Map();
  let maxAlive = 0;
  for (const r of rows) {
    expect(r.state).toBe('playing');
    const sk = r.enemies.filter((e) => e.type === 'skull');
    maxAlive = Math.max(maxAlive, sk.length);
    for (const e of sk) {
      if (!first.has(e.id)) first.set(e.id, e);
      const p = prev.get(e.id);
      if (p && p.state === 'leap' && e.state === 'walk') landed.set(e.id, e);
      prev.set(e.id, e);
    }
  }
  expect(first.size).toBeGreaterThanOrEqual(3);
  for (const e of first.values()) {
    expect(e.state).toBe('emerge'); // 最初はアンプの炎の中
    expect(e.x).toBe(amp.x);
    expect(e.y).toBeLessThan(amp.y); // アンプの上端あたり
  }
  expect(landed.size).toBeGreaterThanOrEqual(3);
  for (const e of landed.values()) {
    expect(['c2l', 'c2r']).toContain(e.girder);
    expect(e.x).toBe(e.girder === 'c2l' ? 200 : 280);
    expect(e.dir).toBe(e.girder === 'c2l' ? -1 : 1); // アンプから離れる向き
  }
  expect(maxAlive).toBeLessThanOrEqual(3);

  // 左右どちらにも飛び出す(ランダム): 着地したら片付けて、次々に出させる
  const landedSides = await page.evaluate(() => {
    const dp = window.__dp;
    dp.clearEnemies(); // 前半で出たスカル(ほかの足場を歩いている)を片付けてから
    const out = [];
    for (let i = 0; i < 6000 && out.length < 12; i++) {
      const st = dp.step(1);
      const e = st.enemies.find((x) => x.state === 'walk');
      if (e) { out.push(e.girder); dp.clearEnemies(); }
    }
    return out;
  });
  expect(landedSides.length).toBe(12);
  expect(new Set(landedSides)).toEqual(new Set(['c2l', 'c2r']));
});

test('K3. スカルは足場の端やすき間から落ちず、アンプに触れず、ハシゴの上ではハシゴの位置にいる', async ({ page }) => {
  await startAtStage(page, STAGE2, { skulls: true });
  await parkSafe(page);
  const lv = await level(page);
  const byId = Object.fromEntries(lv.girders.map((g) => [g.id, g]));
  const amp = await page.evaluate(() => window.__dp.ampHitbox());
  // ハシゴをよく使うようにして、長く動かす
  await page.evaluate(() => { window.DP.config.skull.ladderChance = 0.5; });
  const rows = await record(page, 4000);
  const problems = [];
  let usedLadder = false, onConveyor = false, girdersVisited = new Set();
  for (const r of rows) {
    if (r.state !== 'playing') { problems.push('プレイ中でなくなった ' + r.state); break; }
    for (const e of r.enemies) {
      // 出現(アンプの炎の中)と飛び出しの間だけは、アンプを通り抜けてよい(A 系のテストで確認)
      if (e.state === 'spawn' || e.state === 'emerge' || e.state === 'leap') continue;
      if (e.state === 'walk') {
        const g = byId[e.girder];
        girdersVisited.add(e.girder);
        if (g.kind === 'conveyor') onConveyor = true;
        if (e.x < g.x1 + 7.99 || e.x > g.x2 - 7.99) problems.push(`端からはみ出し id${e.id} ${e.girder} x=${e.x}`);
        if (Math.abs(e.y - g.y1) > 0.01) problems.push(`浮き/めり込み id${e.id} ${e.girder} y=${e.y}`);
      } else if (e.state === 'ladder') {
        usedLadder = true;
        const l = lv.ladders[e.ladder];
        if (e.x !== l.x) problems.push(`ハシゴから外れた id${e.id}`);
        if (e.y < l.topY - 0.01 || e.y > l.bottomY + 0.01) problems.push(`ハシゴの範囲外 id${e.id}`);
        if (l.upper === 'top') problems.push('ガールの足場へのハシゴを使った');
      } else problems.push('知らない状態 ' + e.state);
      // アンプの当たり判定と重ならない(スカルの当たり判定 14x12、足元は y-1)
      const ov = Math.abs(e.x - amp.x) * 2 < 14 + amp.w && e.y - 1 - 12 < amp.y && amp.y - amp.h < e.y - 1;
      if (ov) problems.push(`アンプに触れた id${e.id} x=${e.x} y=${e.y}`);
    }
  }
  expect(problems.slice(0, 5)).toEqual([]);
  expect(usedLadder).toBe(true); // ときどきハシゴで上下の足場へ移っている
  expect(onConveyor).toBe(true);
  expect(girdersVisited.size).toBeGreaterThanOrEqual(4);
});

test('K4. コンベアの上ではベルトの速さが足し引きされ、端の手前で折り返す', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await parkSafe(page);
  // 中段の左コンベアは右(アンプ)へ 0.5 で流れる。右向きのスカルは 0.9 + 0.5 = 1.4 で進む
  const id = await page.evaluate(() => window.__dp.spawnSkull('c2l', 100, { dir: 1, skipSpawn: true }));
  await page.evaluate(() => { window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0; });
  let s = await step(page, 10);
  let e = s.enemies.find((x) => x.id === id);
  expect(e.x).toBeCloseTo(100 + 1.4 * 10, 5);
  // そのまま進むと、アンプのすき間の手前(右端 220 - 8)で折り返す
  s = await step(page, 120);
  e = s.enemies.find((x) => x.id === id);
  expect(e.girder).toBe('c2l');
  expect(e.dir).toBe(-1);
  expect(e.x).toBeLessThanOrEqual(212);
  // 左向きは 0.9 - 0.5 = 0.4 で逆らって進む
  const x0 = e.x;
  s = await step(page, 10);
  e = s.enemies.find((x) => x.id === id);
  expect(e.x).toBeCloseTo(x0 - 0.4 * 10, 5);
});

test('K5. 主人公がつかまっているハシゴには入ってこず、ハシゴの主人公に重ならない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const lv = await level(page);
  const L = lv.ladders.find((l) => l.lower === 'c1' && l.upper === 'mid' && l.x === 200);
  // ハシゴを必ず使う設定にしても入ってこないことを確かめる
  await page.evaluate(() => { window.DP.config.skull.ladderChance = 1; window.DP.config.skull.chaseChance = 1; });
  for (const y of [L.bottomY - 8, (L.topY + L.bottomY) / 2, L.topY + 30]) {
    await page.evaluate(([lad, py]) => {
      const dp = window.__dp;
      dp.clearEnemies();
      dp.placePlayerLadder(lad.index, py);
      // 上下の足場で、ハシゴへ向かってくるスカル
      dp.spawnSkull('c1', lad.x - 40, { dir: 1, skipSpawn: true });
      dp.spawnSkull('c1', lad.x + 40, { dir: -1, skipSpawn: true });
      dp.spawnSkull('mid', lad.x + 40, { dir: -1, skipSpawn: true });
    }, [L, y]);
    const rows = await record(page, 400);
    for (const r of rows) {
      expect(r.state).toBe('playing');
      for (const e of r.enemies) expect(e.ladder).not.toBe(L.index);
    }
  }
  // スカルがハシゴを登っている途中で、主人公が同じハシゴの下からつかまると、スカルは上へ離れていく
  await page.evaluate(() => { window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0; });
  const mid = (L.topY + L.bottomY) / 2;
  await page.evaluate(([lad, y]) => {
    const dp = window.__dp;
    dp.clearEnemies();
    const id = dp.spawnSkull('c1', lad.x, { skipSpawn: true });
    dp.placeSkullOnLadder(id, lad.index, y, 1); // 下へ降りてくる途中
    dp.placePlayerLadder(lad.index, lad.bottomY - 2); // 主人公がハシゴの下につかまる
  }, [L, mid]);
  const rows = await record(page, 120);
  let prevY = mid;
  for (const r of rows) {
    expect(r.state).toBe('playing');
    const e = r.enemies[0];
    if (e.state === 'ladder') {
      expect(e.y).toBeLessThanOrEqual(prevY + 0.001); // 降りてこず、上へ戻っていく
      prevY = e.y;
    }
  }
  const last = rows[rows.length - 1].enemies[0];
  expect(last.state).toBe('walk');
  expect(last.girder).toBe('mid'); // 上の足場へ戻った
});

test('K6. ファイヤースカルに触れると炎上のミスになり、残機は 1 つだけ減る', async ({ page }) => {
  const start = await startAtStage(page, STAGE2);
  await page.evaluate(() => {
    window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0;
    window.__dp.placePlayer('mid', 200);
    window.__dp.spawnSkull('mid', 240, { dir: -1, skipSpawn: true });
  });
  let s;
  for (let i = 0; i < 120; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('burn'); // アンプと同じ炎上の演出
  // 演出中にスカルが重なったままでも、残機は二重に減らない
  let n = 0;
  for (; n < 200 && s.state === 'dying'; n++) s = await step(page, 1);
  expect(n).toBe(BURN_FRAMES);
  expect(s.state).toBe('ready');
  expect(s.lives).toBe(start.lives - 1);
  expect(s.enemies).toEqual([]); // ミスすると敵も片付く
});

test('K7. 出現の演出中(炎が燃え上がる間)は触れてもミスにならない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => {
    window.__dp.placePlayer('mid', 240);
    window.__dp.spawnSkull('mid', 240); // 主人公の真上に、出現の演出から
  });
  let s = await step(page, 20);
  expect(s.state).toBe('playing');
  expect(skulls(s)[0].state).toBe('spawn');
  s = await step(page, 15); // 演出(30 ステップ)が終わると当たる
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('burn');
});

test('K8. 釘バットでファイヤースカルを倒すと 500 点で、ドクロが砕けて炎が消える演出が出る', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => {
    const dp = window.__dp;
    window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0;
    dp.placePlayer('mid', 190); dp.setFacing(1); dp.setBat(600); dp.clearSounds();
    dp.spawnSkull('mid', 250, { dir: -1, skipSpawn: true });
  });
  const before = (await snap(page)).score;
  let s;
  for (let i = 0; i < 120; i++) {
    s = await step(page, 1);
    if (skulls(s).length === 0 || s.state !== 'playing') break;
  }
  expect(s.state).toBe('playing');
  expect(skulls(s)).toEqual([]);
  expect(s.score).toBe(before + 500);
  expect(s.popups).toContain('500');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('smash');
  // 砕ける演出(白い骨のかけらと青い炎)が描かれる
  await page.waitForTimeout(100);
  const colors = await page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d');
    const img = ctx.getImageData(190, 300, 90, 60).data;
    const set = new Set();
    for (let i = 0; i < img.length; i += 4) set.add(img[i] + ',' + img[i + 1] + ',' + img[i + 2]);
    return [...set];
  });
  expect(colors).toContain('255,255,255'); // 骨のかけら
  expect(colors.some((c) => ['232,248,255', '127,216,255', '47,127,255'].includes(c))).toBe(true); // 消えていく青い炎
});

test('K9. ファイヤースカルのドット絵: 白いドクロ・赤いバンダナ・青白い炎が描かれ、炎が揺らめく', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await parkSafe(page);
  await page.evaluate(() => {
    window.DP.config.skull.speed = 0; // 動かさずに見た目だけ確かめる
    window.__dp.spawnSkull('mid', 240, { skipSpawn: true });
  });
  const read = async () => {
    await step(page, 1);
    await page.waitForTimeout(80);
    return page.evaluate(() => {
      const ctx = document.getElementById('game').getContext('2d');
      const img = ctx.getImageData(222, 300, 36, 50).data;
      const n = { white: 0, red: 0, blue: 0 };
      const sig = [];
      for (let i = 0; i < img.length; i += 4) {
        const c = img[i] + ',' + img[i + 1] + ',' + img[i + 2];
        if (c === '255,255,255') n.white++;
        if (c === '255,42,42') n.red++;
        if (['232,248,255', '127,216,255', '47,127,255'].includes(c)) n.blue++;
        sig.push(['232,248,255', '127,216,255', '47,127,255'].includes(c) ? 1 : 0);
      }
      return { n, sig: sig.join('') };
    });
  };
  const a = await read();
  expect(a.n.white).toBeGreaterThan(40);
  expect(a.n.red).toBeGreaterThan(10);
  expect(a.n.blue).toBeGreaterThan(20);
  await step(page, 12);
  const b = await read();
  expect(b.sig).not.toBe(a.sig); // 炎が揺らめいている
});

test('K10. クリアの逃走演出が始まると敵は片付き、演出中に出現もしない', async ({ page }) => {
  await startAtStage(page, STAGE2, { skulls: true });
  await page.evaluate(() => window.__dp.spawnSkull('mid', 60, { skipSpawn: true }));
  await page.evaluate(() => window.__dp.placePlayer('top', 240));
  await step(page, 1);
  await page.evaluate(() => window.__dp.placePlayer('top', 205));
  let s = await step(page, 1);
  expect(s.state).toBe('escape');
  expect(s.enemies).toEqual([]);
  for (let i = 0; i < 900 && s.state === 'escape'; i++) {
    s = await step(page, 1);
    expect(s.enemies).toEqual([]);
  }
  expect(s.state).toBe('clear');
});

// ---- 爆音アンプからの出現 ----

test('A1. 出現のタイミングでアンプの炎が一瞬大きく燃え上がり、その中から約 0.5 秒かけてスカルが現れる', async ({ page }) => {
  await startAtStage(page, STAGE2, { skulls: true });
  await parkSafe(page);
  // アンプの炎(黄・オレンジ・赤)のいちばん上の高さ(y)。小さいほど高く燃えている
  const flameTop = () => page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d');
    const img = ctx.getImageData(222, 120, 36, 98).data; // アンプの上(y 120〜218)
    for (let y = 0; y < 98; y++) {
      for (let x = 0; x < 36; x++) {
        const i = (y * 36 + x) * 4;
        const c = img[i] + ',' + img[i + 1] + ',' + img[i + 2];
        if (c === '255,210,60' || c === '255,138,30' || c === '255,42,42') return 120 + y;
      }
    }
    return 218;
  });
  await page.waitForTimeout(80);
  const normal = await flameTop();
  // 最初のスカルが出るまで進める(プレイ開始から 60 ステップ)
  let s = await snap(page);
  for (let i = 0; i < 400 && skulls(s).length === 0; i++) s = await step(page, 1);
  const sk = skulls(s)[0];
  expect(sk.state).toBe('emerge');
  expect(await page.evaluate(() => window.__dp.ampFlare())).toBeGreaterThan(0);
  // 燃え上がりのいちばん大きいところ(出現から 10 ステップほど)
  await step(page, 10);
  await page.waitForTimeout(80);
  const flared = await flameTop();
  expect(flared).toBeLessThan(normal - 40); // ふだんより大きく(40px 以上)高く燃え上がる
  // 約 0.5 秒(出現したステップを含めて 30 ステップ)で姿を現しきって飛び出す
  s = await step(page, 18);
  expect(skulls(s)[0].state).toBe('emerge');
  s = await step(page, 1);
  expect(skulls(s)[0].state).toBe('leap');
  // 燃え上がりは飛び出している間に小さくなり、着地したらふだんの大きさに戻る(F1 で詳しく確認)
  expect(await page.evaluate(() => window.__dp.ampFlare())).toBeGreaterThan(0);
  s = await step(page, 24);
  expect(skulls(s)[0].state).toBe('walk');
  expect(await page.evaluate(() => window.__dp.ampFlare())).toBe(0);
});

test('A2. 飛び出したスカルは弧を描いてアンプの上を越え、中段コンベアに着地して通常の移動になる', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await parkSafe(page);
  // 左の着地点(x=200)は最上段へのハシゴと同じ位置なので、このテストではハシゴを使わせない(飛び出しと着地だけを見る)
  await page.evaluate(() => { window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0; });
  for (const side of ['left', 'right']) {
    await page.evaluate((sd) => { window.__dp.clearEnemies(); window.__dp.spawnSkullFromAmp(sd); }, side);
    const rows = await record(page, 30 + 24 + 30);
    const leap = rows.map((r) => r.enemies[0]).filter((e) => e.state === 'leap');
    expect(leap.length).toBe(24); // config.skull.leapFrames
    // 弧: いったん上がってから下りる
    const ys = leap.map((e) => e.y);
    expect(Math.min(...ys)).toBeLessThan(ys[0] - 5);
    // 着地後は通常の移動(歩いている)
    const last = rows[rows.length - 1].enemies[0];
    expect(last.state).toBe('walk');
    expect(last.girder).toBe(side === 'left' ? 'c2l' : 'c2r');
    // アンプから離れる向きへ進んでいる
    if (side === 'left') expect(last.x).toBeLessThan(200);
    else expect(last.x).toBeGreaterThan(280);
  }
});

test('A3. 出現(炎の中)と飛び出しの間は、主人公に重なってもミスにならない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // コンベアを止めて、主人公を左の飛び出しの通り道(アンプのすぐ左)に立たせる
  await page.evaluate(() => {
    window.DP.config.conveyor.speed = 0;
    window.__dp.placePlayer('c2l', 213);
    window.__dp.spawnSkullFromAmp('left');
  });
  const box = (e) => ({ x: e.x, y: e.y - 1, w: 14, h: 12 });
  const overlaps = (p, b) => Math.abs(p.x - b.x) * 2 < 14 + b.w && p.y - 26 < b.y && b.y - b.h < p.y;
  let touched = false;
  for (let i = 0; i < 53; i++) {
    const s = await step(page, 1);
    const e = s.enemies[0];
    expect(['emerge', 'leap']).toContain(e.state);
    if (overlaps(s.player, box(e))) touched = true;
    expect(s.state).toBe('playing'); // 重なっていてもミスにならない
  }
  expect(touched).toBe(true); // 実際に通り道で重なった
});

test('A4. 飛び出す方向は主人公の位置に関係なく左右それぞれ約 50%(主人公がいる側にも出る)', async ({ page }) => {
  await startAtStage(page, STAGE2, { skulls: true });
  await page.evaluate(() => { window.DP.config.conveyor.speed = 0; }); // 主人公が流されないように
  // 着地したら片付けながら、飛び出した側を集める(着地のときに重なってもミスにならないので最後までプレイ中)
  const collect = (count) => page.evaluate((k) => {
    const dp = window.__dp;
    const out = [];
    for (let i = 0; i < 40000 && out.length < k; i++) {
      const st = dp.step(1);
      if (st.state !== 'playing') return { out, dead: true };
      const e = st.enemies.find((x) => x.state === 'walk');
      if (e) { out.push(e.girder); dp.clearEnemies(); }
    }
    return { out, dead: false };
  }, count);
  // 右ルート(右の中段の足場)・左ルート(左の中段の足場)・アンプのすぐ左、のどこにいても左右両方に出る
  for (const [gid, x] of [['mid', 420], ['mid', 60], ['c2l', 216]]) {
    await page.evaluate(([id, px]) => { window.__dp.clearEnemies(); window.__dp.placePlayer(id, px); }, [gid, x]);
    const r = await collect(40);
    expect(r.dead).toBe(false);
    expect(r.out.length).toBe(40);
    const left = r.out.filter((g) => g === 'c2l').length;
    expect(new Set(r.out)).toEqual(new Set(['c2l', 'c2r']));
    expect(left).toBeGreaterThanOrEqual(10); // 40 回中、片側が 10〜30 回(約 50%)
    expect(left).toBeLessThanOrEqual(30);
  }
});

test('A5. 通常の移動中のスカルはアンプを通り抜けず、アンプの手前で折り返す(出現のときだけ例外)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await parkSafe(page);
  await page.evaluate(() => { window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0; });
  // 右のコンベアの着地点から、アンプへ向かって(左向きに)歩かせる
  const id = await page.evaluate(() => window.__dp.spawnSkull('c2r', 300, { dir: -1, skipSpawn: true }));
  const rows = await record(page, 300);
  const xs = rows.map((r) => r.enemies.find((e) => e.id === id)).map((e) => e.x);
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(268); // 右端 260 + 8 より左へ行かない
  const last = rows[rows.length - 1].enemies.find((e) => e.id === id);
  expect(last.girder).toBe('c2r'); // アンプを越えて左へ渡っていない
});

// ---- 出現のときのアンプの炎(見た目だけ) ----

// アンプの炎(黄・オレンジ・赤)の範囲を画面から読む。
// 高さ: 炎の中央の柱(x 226〜254)で、ガールの足場より下(y 92〜218)のいちばん上の y
//      (ガールの赤いスカートが炎と同じ色なので、足場より上は測らない)
// 幅: アンプの上端すぐ上の帯(y 210〜216)で、炎がある左右の端の x
const flameBox = (page) => page.evaluate(() => {
  const ctx = document.getElementById('game').getContext('2d');
  const isFlame = (d, i) => {
    const c = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
    return c === '255,210,60' || c === '255,138,30' || c === '255,42,42';
  };
  let top = 218;
  const a = ctx.getImageData(226, 92, 28, 126).data;
  outer: for (let y = 0; y < 126; y++) for (let x = 0; x < 28; x++) if (isFlame(a, (y * 28 + x) * 4)) { top = 92 + y; break outer; }
  let left = 999, right = -1;
  const b = ctx.getImageData(200, 210, 80, 7).data;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 80; x++) if (isFlame(b, (y * 80 + x) * 4)) { left = Math.min(left, 200 + x); right = Math.max(right, 200 + x); }
  return { top, left, right };
});

test('F1. 出現のときアンプの炎は一気に約 3.5 倍まで噴き上がって横にも広がり、スカルが飛び出したあと元の大きさに戻る', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await parkSafe(page);
  await page.waitForTimeout(80);
  const normal = await flameBox(page);
  expect(await page.evaluate(() => window.__dp.ampFlameScale())).toEqual({ scale: 1, cols: 16, flaring: false });

  await page.evaluate(() => window.__dp.spawnSkullFromAmp('left'));
  // 大きさの変化を 1 ステップずつ記録する
  const seq = await page.evaluate(() => {
    const dp = window.__dp;
    const out = [];
    for (let i = 0; i < 60; i++) {
      const st = dp.step(1);
      out.push({ fs: dp.ampFlameScale(), skull: st.enemies[0] && st.enemies[0].state });
    }
    return out;
  });
  const scales = seq.map((r) => r.fs.scale);
  // 一気に噴き上がる: 6 ステップ以内に最大(3.5 倍)
  expect(Math.max(...scales)).toBeCloseTo(3.5, 5);
  expect(scales.findIndex((v) => v >= 3.5 - 1e-9)).toBeLessThan(6);
  // スカルが炎の中にいる間は最大のまま、飛び出している間に小さくなっていく
  for (const r of seq) if (r.skull === 'emerge' && seq.indexOf(r) >= 6) expect(r.fs.scale).toBeCloseTo(3.5, 5);
  const leap = seq.filter((r) => r.skull === 'leap').map((r) => r.fs.scale);
  expect(leap.length).toBeGreaterThan(10);
  for (let i = 1; i < leap.length; i++) expect(leap[i]).toBeLessThanOrEqual(leap[i - 1]);
  // 横幅も広がる(柱 16 本 → 22 本)
  expect(Math.max(...seq.map((r) => r.fs.cols))).toBe(22);
  // 着地したら元の大きさ
  const landed = seq.find((r) => r.skull === 'walk');
  expect(landed.fs).toEqual({ scale: 1, cols: 16, flaring: false });

  // 画面でも確かめる: 最大のときは、ふだんよりずっと高く・広い
  await page.evaluate(() => { window.__dp.clearEnemies(); window.__dp.spawnSkullFromAmp('right'); window.__dp.step(12); });
  await page.waitForTimeout(80);
  const big = await flameBox(page);
  const normalH = 218 - normal.top;
  const bigH = 218 - big.top;
  expect(bigH).toBeGreaterThan(normalH * 2.5); // 約 3.5 倍(揺らめきの分の余裕を見て 2.5 倍以上)
  expect(big.right - big.left).toBeGreaterThan(normal.right - normal.left + 8); // 横にも広がる
  // 元に戻ったあとは、ふだんの高さ
  await page.evaluate(() => window.__dp.step(60));
  await page.waitForTimeout(80);
  const after = await flameBox(page);
  expect(218 - after.top).toBeLessThan(normalH * 1.6);
});

test('F2. 大きくなった炎は見た目だけ: アンプの当たり判定は広がらず、炎の見た目に重なっても判定の外ならミスにならない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const before = await page.evaluate(() => window.__dp.ampHitbox());
  expect(before).toEqual({ x: 240, y: 258, w: 32, h: 58 });
  // 最上段(炎の見た目が届く高さ)のアンプの真上に主人公を立たせる。コンベアは止める
  await page.evaluate(() => {
    window.DP.config.conveyor.speed = 0;
    window.__dp.placePlayer('c3', 240);
    window.__dp.spawnSkullFromAmp('left');
  });
  let s;
  for (let i = 0; i < 54; i++) {
    s = await step(page, 1);
    expect(s.state).toBe('playing');
    expect(await page.evaluate(() => window.__dp.ampHitbox())).toEqual(before); // 当たり判定は変わらない
  }
  // 主人公のまわりに、実際に炎の見た目が重なっていた(最大のときに確かめる)
  await page.evaluate(() => { window.__dp.clearEnemies(); window.__dp.spawnSkullFromAmp('left'); window.__dp.step(12); });
  await page.waitForTimeout(80);
  const top = (await flameBox(page)).top;
  expect(top).toBeLessThan(160); // 炎のてっぺんが最上段(y=160)より上まで届いている
  s = await step(page, 1);
  expect(s.state).toBe('playing');
});

// ---- 追跡 AI ----

test('T1. ハシゴの選び方: 主人公がいる段の方向へのハシゴは 70%、ほかは 20%', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const r = await page.evaluate(() => {
    const lv = window.__dp.level();
    const L = lv.ladders.find((l) => l.lower === 'c1' && l.upper === 'mid' && l.x === 200);
    // スカルを下の段(c1)・ハシゴの位置に置いて、主人公の位置を変えながら確率を聞く
    const id = window.__dp.spawnSkull('c1', 200, { skipSpawn: true });
    return window.__dp.chanceFor(id, L.index); // ゲームの中のスカルとハシゴで確率を聞く
  });
  expect(r).toEqual({ playerAbove: 0.7, playerBelow: 0.2, sameLevel: 0.2 });
});

test('T2. 同じ段では 1 秒ごとに向きを考え直し、約 70% で主人公の方を向く(完全には追わない)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // thinkDir に乱数を 1000 回渡して、主人公の方を向く割合を数える(同じ段・違う段)
  const r = await page.evaluate(() => window.__dp.thinkStats(1000));
  expect(r.sameLevelToward).toBeGreaterThan(0.64);
  expect(r.sameLevelToward).toBeLessThan(0.76); // 約 70%。ときどき逆を向く
  expect(r.otherLevelReverse).toBeGreaterThan(0.1);
  expect(r.otherLevelReverse).toBeLessThan(0.2); // 違う段では約 15% の気まぐれ

  // 実際の動き: 床で、主人公と反対の向きに歩き出したスカルが、数秒のうちに主人公の方へ向きを変えて近づく
  await page.evaluate(() => {
    window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0; // 床から出ないように
    window.__dp.placePlayer('f0', 60);
    window.__dp.spawnSkull('f0', 300, { dir: 1, skipSpawn: true }); // 主人公と反対(右)へ
  });
  const rows = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 600; i++) {
      const st = window.__dp.step(1);
      if (st.state !== 'playing') { out.push({ dead: true }); break; }
      out.push({ x: st.enemies[0].x, dir: st.enemies[0].dir });
    }
    return out;
  });
  const turned = rows.findIndex((r) => r.dir === -1);
  expect(turned).toBeGreaterThan(-1);
  expect(turned).toBeLessThan(300); // 5 秒以内に主人公の方を向く
  // 最後には主人公に追いつく(ミス)か、最初より近づいている
  const last = rows[rows.length - 1];
  expect(last.dead || last.x < 300).toBe(true);
});

test('T3. 追跡を強めても、主人公がつかまっているハシゴには入らず、同じ段のハシゴの手前で引き返す', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const lv = await level(page);
  const L = lv.ladders.find((l) => l.lower === 'c1' && l.upper === 'mid' && l.x === 200);
  // 追跡を最大にしても安全ルールが勝つことを確かめる
  await page.evaluate(() => { const c = window.DP.config.skull; c.chaseChance = 1; c.ladderChance = 1; c.sameLevelChase = 1; });
  await page.evaluate((lad) => {
    const dp = window.__dp;
    dp.placePlayerLadder(lad.index, (lad.topY + lad.bottomY) / 2);
    dp.spawnSkull('c1', lad.x - 60, { dir: 1, skipSpawn: true });
    dp.spawnSkull('c1', lad.x + 60, { dir: -1, skipSpawn: true });
    dp.spawnSkull('mid', lad.x + 50, { dir: -1, skipSpawn: true });
  }, L);
  const rows = await record(page, 900);
  for (const r of rows) {
    expect(r.state).toBe('playing');
    for (const e of r.enemies) {
      expect(e.ladder).not.toBe(L.index);
      if (e.state === 'walk' && (e.girder === 'c1' || e.girder === 'mid')) expect(Math.abs(e.x - L.x)).toBeGreaterThanOrEqual(19.5);
    }
  }
});

// ---- 着地のときの重なり ----

test('G1. 着地した場所で主人公と重なっていてもミスにならず、重なりが解けたら通常の当たり判定に戻る', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // 左の着地点(x=200)に主人公を立たせる。コンベアは止め、スカルはハシゴを使わない
  await page.evaluate(() => {
    window.DP.config.conveyor.speed = 0;
    window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0;
    window.DP.config.skull.sameLevelChase = 0; // 主人公から離れる向きに歩かせる(重なりを解くため)
    window.__dp.placePlayer('c2l', 200);
    window.__dp.spawnSkullFromAmp('left');
  });
  // 出現(30)+ 飛び出し(24)で着地
  let s = await step(page, 54);
  let e = skulls(s)[0];
  expect(e.state).toBe('walk');
  expect(e.landGrace).toBe(true); // 重なっているので当たらない状態
  expect(s.state).toBe('playing');
  const overlap = (p, k) => Math.abs(p.x - k.x) < 14 && p.y - 26 < k.y - 1 && k.y - 13 < p.y;
  expect(overlap(s.player, e)).toBe(true); // 実際に重なっている

  // 重なっている間はミスにならず、離れたら当たらない状態が解ける
  let released = -1;
  for (let i = 0; i < 120; i++) {
    s = await step(page, 1);
    expect(s.state).toBe('playing');
    e = skulls(s)[0];
    if (!e.landGrace) { released = i; break; }
    expect(overlap(s.player, e)).toBe(true);
  }
  expect(released).toBeGreaterThan(-1);
  expect(overlap(s.player, e)).toBe(false);

  // 通常の当たり判定に戻ったので、主人公がスカルに近づいて触れるとミス(炎上)
  await page.evaluate((x) => window.__dp.placePlayer('c2l', x + 10), e.x);
  for (let i = 0; i < 30 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('burn');
});

test('G2. 着地のときに重なっていなければ、着地した瞬間から通常の当たり判定', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => {
    window.DP.config.conveyor.speed = 0;
    window.DP.config.skull.ladderChance = 0; window.DP.config.skull.chaseChance = 0;
    window.__dp.placePlayer('c2l', 150); // 着地点(200)から離れた、スカルが歩いてくる位置
    window.__dp.spawnSkullFromAmp('left');
  });
  let s = await step(page, 54);
  const e = skulls(s)[0];
  expect(e.state).toBe('walk');
  expect(e.landGrace).toBe(false);
  // 主人公の方へ歩いてきて触れるとミス
  for (let i = 0; i < 300 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('burn');
});

test('V1. ファイヤースカルの速さ: 普通の足場では 0.9、ハシゴは 0.6(変更なし)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await parkSafe(page);
  await page.evaluate(() => { const c = window.DP.config.skull; c.ladderChance = 0; c.chaseChance = 0; c.wanderChance = 0; });
  // 床(コンベアではない)を右へ 20 ステップ
  const id = await page.evaluate(() => window.__dp.spawnSkull('f0', 200, { dir: 1, skipSpawn: true }));
  let s = await step(page, 20);
  expect(s.enemies.find((e) => e.id === id).x).toBeCloseTo(200 + 0.9 * 20, 5);
  // ハシゴの途中に置いて 20 ステップ(上へ 0.6)
  const lv = await level(page);
  const L = lv.ladders.find((l) => l.lower === 'f0' && l.x === 440);
  const y0 = (L.topY + L.bottomY) / 2;
  await page.evaluate(([sid, lad, y]) => window.__dp.placeSkullOnLadder(sid, lad.index, y, -1), [id, L, y0]);
  s = await step(page, 20);
  expect(s.enemies.find((e) => e.id === id).y).toBeCloseTo(y0 - 0.6 * 20, 5);
});
