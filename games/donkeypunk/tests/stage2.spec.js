// ドンキーパンク 2 面「ライブハウス搬入口」の第 1 段階のテスト
// (地形・ハシゴ・面の遷移・開発用ショートカット。コンベアはまだ動かない足場)
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage, hold, walkTo, climb, passIntermission, leaveClear } = require('./helpers');

watchConsoleErrors(test);

const STAGE2 = 1; // 2 面の番号(0 始まり)
// 2 面の正規ルート(各段で歩く x と、登った先の足場)
const LEFT_ROUTE = [[440, 'c1'], [64, 'mid'], [96, 'c2l'], [200, 'c3'], [288, 'top']];
const CENTER_ROUTE = [[440, 'c1'], [200, 'mid'], [296, 'c2r'], [448, 'c3'], [288, 'top']];
// 中段の足場は 1 枚につながっているので、下段からのハシゴ(x=64 / 200)と中段コンベアへのハシゴ
// (x=96 / 296 / 384)は自由に組み合わせられる。登り方は全部で 6 通り
const ALL_ROUTES = [];
for (const up of [64, 200]) {
  ALL_ROUTES.push([[440, 'c1'], [up, 'mid'], [96, 'c2l'], [200, 'c3'], [288, 'top']]);
  for (const side of [296, 384]) ALL_ROUTES.push([[440, 'c1'], [up, 'mid'], [side, 'c2r'], [448, 'c3'], [288, 'top']]);
}
const level = (page) => page.evaluate(() => window.__dp.level());

// 最上段でガールに触れてクリアし、逃走演出が終わってクリア表示になるまで進める
async function clearByTouchingGirl(page) {
  await page.evaluate(() => window.__dp.placePlayer('top', 240));
  await step(page, 1);
  await page.evaluate(() => window.__dp.placePlayer('top', 205));
  let s = await step(page, 1);
  expect(s.state).toBe('escape');
  for (let i = 0; i < 900 && s.state === 'escape'; i++) s = await step(page, 1);
  expect(s.state).toBe('clear');
  return s;
}

// 正規ルートの登り方(各段で歩く x と、登った先の足場)
async function climbRoute(page, route) {
  let s;
  for (const [x, next] of route) {
    s = await walkTo(page, x);
    expect(s.state).toBe('playing');
    s = await climb(page, 'ArrowUp');
    expect(s.state).toBe('playing');
    expect(s.player.girder).toBe(next);
  }
  return s;
}

test('S1. 面の並びは 1 面 → 2 面で、2 面は平らな足場・端から端までの中段の足場・コンベア・ハシゴでできている', async ({ page }) => {
  await startAtStage(page, STAGE2);
  expect(await page.evaluate(() => window.__dp.stageIds())).toEqual(['girders', 'livehouse', 'squat', 'rivets']); // 4 面(rivets)まで
  const s = await snap(page);
  expect(s.stageId).toBe('livehouse');
  expect(s.message).toBe('');
  const lv = await level(page);
  const byId = Object.fromEntries(lv.girders.map((g) => [g.id, g]));

  // すべて平らな足場
  for (const g of lv.girders) expect(g.y1).toBe(g.y2);
  // コンベア予定地(第 1 段階では見た目だけ)
  expect(lv.girders.filter((g) => g.kind === 'conveyor').map((g) => g.id).sort()).toEqual(['c1', 'c2l', 'c2r', 'c3']);
  // 中段の足場(茶色)は、画面の左端から右端まで 1 枚につながっている(すき間がない)
  expect(lv.girders.filter((g) => g.y1 === 350).map((g) => g.id)).toEqual(['mid']);
  expect(byId.mid.x1).toBe(0);
  expect(byId.mid.x2).toBe(480);
  // 中段の足場につながるハシゴ(下段から 2 本・中段コンベアへ 3 本)は、すべて足場の上面にきちんと届いている
  const midLadders = lv.ladders.filter((l) => l.lower === 'mid' || l.upper === 'mid');
  expect(midLadders.map((l) => l.x).sort((a, b) => a - b)).toEqual([64, 96, 200, 296, 384]);
  for (const l of midLadders) {
    if (l.upper === 'mid') expect(l.topY).toBe(350);
    else expect(l.bottomY).toBe(350);
  }
  // すべてのハシゴの上端・下端は、つながる足場の上面にきちんと届いている(コンベアを延ばしても位置は同じ)
  expect(lv.ladders.map((l) => l.x)).toEqual([440, 64, 200, 96, 296, 384, 200, 448, 288]);
  for (const l of lv.ladders) {
    expect(l.bottomY).toBe(byId[l.lower].y1);
    expect(l.topY).toBe(byId[l.upper].y1);
    expect(l.x).toBeGreaterThanOrEqual(byId[l.lower].x1);
    expect(l.x).toBeLessThanOrEqual(byId[l.lower].x2);
    expect(l.x).toBeGreaterThanOrEqual(byId[l.upper].x1);
    expect(l.x).toBeLessThanOrEqual(byId[l.upper].x2);
  }
  // 中段コンベアは中央(アンプの予定地)で左右に分かれる
  expect(byId.c2r.x1 - byId.c2l.x2).toBeGreaterThan(14);
  // 段の間隔は、ハシゴを使わずに落ちるとミスになる高さ(48px)より大きい
  for (const l of lv.ladders) expect(l.bottomY - l.topY).toBeGreaterThan(48);
  // 切れたハシゴは置いていない(第 1 段階)
  expect(lv.ladders.some((l) => l.broken)).toBe(false);
  // ゴリラ警官は最上段、ガールは 1 面と同じ位置
  expect(s.boss.x).toBe(56);
  expect(s.boss.y).toBe(160);
  expect(s.heroine.x).toBe(210);
  expect(s.heroine.y).toBe(82);
});

test('S2. 床からガールの足場まで、ハシゴだけでつながるルートがあり、最上段でゴリラ警官に道をふさがれない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const lv = await level(page);
  // 幅優先探索: ハシゴを上り下りして、すべての足場へ行けるか
  const seen = new Set(['f0']);
  const queue = ['f0'];
  while (queue.length) {
    const cur = queue.shift();
    for (const l of lv.ladders) {
      for (const [a, b] of [[l.lower, l.upper], [l.upper, l.lower]]) {
        if (a === cur && !seen.has(b)) { seen.add(b); queue.push(b); }
      }
    }
  }
  expect([...seen].sort()).toEqual(['c1', 'c2l', 'c2r', 'c3', 'f0', 'mid', 'top']);

  // 最上段(c3)に着くハシゴから、ガールの足場へのハシゴまで歩くとき、ゴリラ警官の当たり判定を通らない
  const s = await snap(page);
  const bossLeft = s.boss.x - 20 - 7; // ゴリラの当たり判定の半分(20)+ 主人公の当たり判定の半分(7)
  const bossRight = s.boss.x + 20 + 7;
  const toTop = lv.ladders.find((l) => l.lower === 'c3' && l.upper === 'top');
  const arrivals = lv.ladders.filter((l) => l.upper === 'c3');
  expect(arrivals.length).toBe(2);
  for (const a of arrivals) {
    const lo = Math.min(a.x, toTop.x);
    const hi = Math.max(a.x, toTop.x);
    expect(hi < bossLeft || lo > bossRight).toBe(true);
  }
});

test('S3. 実際のキー操作で 2 面を左ルートで登りきり、クリアすると 3 面へ進む(周回数はそのまま)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // 床を右へ → 下段コンベアを左へ → 左の足場 → 中段コンベア(左)を右へ → 最上段 → ガールの足場
  let s = await climbRoute(page, LEFT_ROUTE);
  const scoreBefore = s.score;
  s = await walkTo(page, 200);
  expect(s.state).toBe('escape'); // 1 面と同じ逃走演出
  expect(s.score).toBeGreaterThan(scoreBefore);
  for (let i = 0; i < 900 && s.state === 'escape'; i++) s = await step(page, 1);
  expect(s.state).toBe('clear');
  // ENTER で 3 面へ進む(1 面に戻って周回数が増えるのは 3 面のクリア後)
  s = await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  expect(s.stageId).toBe('squat');
  expect(s.round).toBe(1);
});

test('S4. 実際のキー操作で 2 面を中央ルートでも登りきれる', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // 床を右へ → 下段コンベアを左へ → 中央の足場を右へ → 中段コンベア(右)を右へ → 最上段を左へ → ガールの足場
  await climbRoute(page, CENTER_ROUTE);
});

test('S5. 1 面をクリアすると 2 面へ進み、2 面ではゴリラ警官がビールを投げず、普通の足場では流されない', async ({ page }) => {
  await startAtStage(page, 0);
  await clearByTouchingGirl(page);
  let s = await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  expect(s.message).toBe('STAGE 2');
  expect(s.stageId).toBe('livehouse');
  expect(s.round).toBe(1);
  expect(s.boss.gone).toBe(false);
  expect(s.heroine.gone).toBe(false);
  for (let i = 0; i < 120 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');

  // ゴリラを有効にしても、2 面ではビールを投げない(仕掛けがない)
  await page.evaluate(() => window.__dp.setBossEnabled(true));
  s = await step(page, 600);
  expect(s.hazards).toEqual([]);
  expect(s.state).toBe('playing');

  // コンベアでない足場(床・中段の足場)の上では流されない(コンベアの動きは C1〜C6 で確認)
  for (const [gid, x] of [['f0', 300], ['mid', 40], ['mid', 230], ['mid', 420], ['mid', 8], ['mid', 472]]) {
    await page.evaluate(([id, px]) => window.__dp.placePlayer(id, px), [gid, x]);
    s = await step(page, 120);
    expect(s.player.x).toBe(x);
    expect(s.player.girder).toBe(gid);
    expect(s.player.state).toBe('ground');
  }
});

test('S6. 中段の足場は端から端まで歩いても落ちない(画面の端で止まる)。ガールの足場の端からは従来どおり落下のミス', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => { window.__dp.setBossEnabled(false); window.__dp.placePlayer('mid', 100); });
  // 左端まで歩く: 画面の端で止まり、足場に立ったまま
  let s = await hold(page, 'ArrowLeft', 120);
  s = await step(page, 10);
  expect(s.state).toBe('playing');
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('mid');
  expect(s.player.x).toBeLessThanOrEqual(8);
  // 右端まで歩く(アンプの格子の台の前と、以前のすき間 x 120〜168・312〜360 も通る)
  s = await hold(page, 'ArrowRight', 500);
  s = await step(page, 10);
  expect(s.state).toBe('playing');
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('mid');
  expect(s.player.x).toBeGreaterThanOrEqual(472);
  expect(s.player.y).toBe(350);

  // 画面の端まで届いていない足場の端は今までどおり: ガールの足場の右端から最上段へ落ちると落下のミス
  await page.evaluate(() => window.__dp.placePlayer('top', 296));
  s = await hold(page, 'ArrowRight', 20);
  for (let i = 0; i < 120 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('fall');
});

test('S6b. 落下のミスを踏み切った高さから測るようにしても、ガールの足場の端から外へ跳んで最上段へ降りると今までどおり落下のミス(78px 落ちる)', async ({ page }) => {
  for (const [x, key] of [[298, 'ArrowRight'], [182, 'ArrowLeft']]) {
    await startAtStage(page, STAGE2);
    await page.evaluate((px) => { window.__dp.setBossEnabled(false); window.__dp.placePlayer('top', px); }, x);
    // 本物のキーボードで外へ向かって跳ぶ
    await page.keyboard.down(key);
    await page.keyboard.press('Space');
    let s = await step(page, 1);
    await page.keyboard.up(key);
    for (let i = 0; i < 200 && s.state === 'playing'; i++) s = await step(page, 1);
    expect(s.state, `ガールの足場の x=${x} から ${key}`).toBe('dying');
    expect(s.deathReason).toBe('fall');
  }
});

test('S7. 2 面の足場・コンベア予定地・ハシゴ・逃走用ハシゴが画面に描かれる', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.waitForTimeout(100); // 描画は requestAnimationFrame なので 1 コマ待つ
  const px = await page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d');
    const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    return {
      platform: at(17, 351), // 左の足場(錆びた茶色の鉄骨)
      belt: at(153, 449), // 下段コンベアのベルト
      pulley: at(10, 447), // 下段コンベアの左端の滑車(画面の内側に寄せて描く。中心の黒い軸を避けた外側)
      ladder: at(440 - 7, 500), // 床 → 下段コンベアのハシゴ(x=440)の支柱
      escape: at(120 - 7, 20), // 逃走用ハシゴ
      gap: at(240, 230), // 中段コンベアのすき間の上(何も描かない)
    };
  });
  expect(px.platform).toEqual([154, 82, 38]); // #9a5226
  expect(px.belt).toEqual([42, 42, 52]);
  expect(px.pulley).toEqual([60, 216, 255]);
  expect(px.ladder).toEqual([60, 216, 255]);
  expect(px.escape).toEqual([60, 216, 255]);
  expect(px.gap).not.toEqual([60, 216, 255]);
});

test('S8. 2 面の釘バットは通り道から外れた場所に浮いていて、ジャンプで拾える', async ({ page }) => {
  const start = await startAtStage(page, STAGE2);
  expect(start.items.length).toBe(2);
  const lv = await level(page);
  for (const [i, gid] of [[0, 'mid'], [1, 'c1']]) {
    const it = start.items[i];
    // ハシゴの近くには置かない(つかむ位置で拾ってしまわないよう、当たり判定どうしが離れている)
    for (const l of lv.ladders.filter((l) => l.lower === gid || l.upper === gid)) {
      expect(Math.abs(l.x - it.x)).toBeGreaterThan(it.w / 2 + 7);
    }
    // 下を歩いても拾わず、真下でジャンプすると拾う
    await page.evaluate(([id, x]) => window.__dp.placePlayer(id, x), [gid, it.x]);
    let s = await step(page, 30);
    expect(s.items[i].taken).toBe(false);
    await page.keyboard.press('Space');
    for (let k = 0; k < 90; k++) s = await step(page, 1);
    expect(s.items[i].taken).toBe(true);
    expect(s.player.state).toBe('ground');
    await page.evaluate(() => window.__dp.setBat(0));
  }
});

test('S9. 開発用ショートカット: ?dev で 2 キーを押すと 2 面から、1 キーで 1 面から、3 キーで 3 面から始められる(?dev なしでは効かない)', async ({ page }) => {
  // ?dev なし: 2 キーは効かない
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => window.__dp.setManual(true));
  await page.keyboard.press('2');
  let s = await step(page, 1);
  expect(s.state).toBe('title');

  // ?dev あり: タイトルで 2 キー → 2 面の READY
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => window.__dp.setManual(true));
  await page.keyboard.press('2');
  s = await snap(page);
  expect(s.state).toBe('ready');
  expect(s.message).toBe('STAGE 2');
  expect(s.stageId).toBe('livehouse');
  expect(s.score).toBe(0);
  expect(s.lives).toBe(3);

  // プレイ中に 1 キー → 1 面の READY(新しいゲーム)
  s = await step(page, 100);
  expect(s.state).toBe('playing');
  await page.keyboard.press('1');
  s = await snap(page);
  expect(s.state).toBe('ready');
  expect(s.stageId).toBe('girders');

  // 3 キー → 3 面の READY
  await page.keyboard.press('3');
  s = await snap(page);
  expect(s.stageId).toBe('squat');
  expect(s.message).toBe('STAGE 3');

  // 存在しない面(5 キー)は何もしない(4 キーは開発中の 4 面。tests/stage4.spec.js の R8)
  await page.keyboard.press('5');
  s = await snap(page);
  expect(s.stageId).toBe('squat');
  expect(s.state).toBe('ready');
});

test('S10. 2 面の鉄骨は錆びた茶色(1 面はピンクのまま)で、中央に爆音アンプと揺らめく炎が描かれる', async ({ page }) => {
  // 1 面: ピンクの鉄骨のまま、アンプもない
  await startAtStage(page, 0);
  await page.waitForTimeout(100);
  const stage1 = await page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d');
    const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    return { girder: at(1, Math.round(window.__dp.surfaceY('g0', 1)) + 1), hasAmp: !!window.DP.stages[0].amp };
  });
  expect(stage1.girder).toEqual([255, 47, 110]); // #ff2f6e
  expect(stage1.hasAmp).toBe(false);

  // 2 面
  await startAtStage(page, STAGE2);
  await page.waitForTimeout(100);
  const read = () => page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d');
    const at = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    // 炎の範囲(アンプの上端 y=218 より上の 32x30)の色を数える
    const img = ctx.getImageData(224, 188, 32, 30).data;
    const count = { Y: 0, O: 0, R: 0 };
    const sig = [];
    for (let i = 0; i < img.length; i += 4) {
      const c = img[i] + ',' + img[i + 1] + ',' + img[i + 2];
      if (c === '255,210,60') count.Y++;
      if (c === '255,138,30') count.O++;
      if (c === '255,42,42') count.R++;
      sig.push(c === '5,4,15' ? 0 : 1); // 背景かどうか
    }
    return {
      girder: at(17, 351), top: at(180, 83),
      ampFrame: at(223, 219), ampKnob: at(227, 223), stand: at(225, 300),
      count, sig: sig.join(''),
    };
  });
  const a = await read();
  expect(a.girder).toEqual([154, 82, 38]); // 錆びた茶色 #9a5226
  expect(a.top).toEqual([154, 82, 38]); // ガールの足場も茶色
  expect(a.ampFrame).toEqual([207, 214, 224]); // アンプの銀の枠
  expect(a.ampKnob).toEqual([255, 210, 60]); // 金色のつまみ
  expect(a.stand).not.toEqual([5, 4, 15]); // 下の格子の台が描かれている
  // 炎は赤・オレンジ・黄色の 3 色
  expect(a.count.Y).toBeGreaterThan(10);
  expect(a.count.O).toBeGreaterThan(10);
  expect(a.count.R).toBeGreaterThan(5);
  // 揺らめく: 時間がたつと炎の形が変わる
  await step(page, 10);
  await page.waitForTimeout(100);
  const b = await read();
  expect(b.sig).not.toBe(a.sig);

  // 下の格子の台は見た目だけ: 台の前(中央の足場の上)に立っても何も起きない
  // (アンプ本体と炎に触れたときの炎上は B 系のテスト)
  await page.evaluate(() => window.__dp.placePlayer('mid', 240));
  const s = await step(page, 120);
  expect(s.state).toBe('playing');
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('mid');
});

// ---- ベルトコンベア ----

const conveyors = async (page) => Object.fromEntries((await page.evaluate(() => window.__dp.conveyors())).map((c) => [c.id, c]));
const SPEED = 0.5; // config.conveyor.speed

test('C1. コンベアの上に立っていると流れる向きに運ばれる(中段の左右はアンプの方へ)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const cv = await conveyors(page);
  expect(cv.c2l.dir).toBe(1); // 左のコンベアは右(アンプ)へ
  expect(cv.c2r.dir).toBe(-1); // 右のコンベアは左(アンプ)へ
  for (const [gid, x0] of [['c1', 300], ['c2l', 60], ['c2r', 420], ['c3', 380]]) {
    const dir = (await conveyors(page))[gid].dir;
    await page.evaluate(([id, px]) => window.__dp.placePlayer(id, px), [gid, x0]);
    const s = await step(page, 40);
    expect(s.player.girder).toBe(gid);
    expect(s.player.state).toBe('ground');
    expect(s.player.x).toBeCloseTo(x0 + dir * SPEED * 40, 5);
  }
});

test('C2. 流れに逆らって歩くと遅く、流れに沿って歩くと速く進み、足音は自分で歩いたときだけ鳴る', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // c2l は右へ流れる
  await page.evaluate(() => { window.__dp.placePlayer('c2l', 150); window.__dp.clearSounds(); });
  let s = await hold(page, 'ArrowLeft', 50);
  expect(s.player.x).toBeCloseTo(150 - (1.4 - SPEED) * 50, 5); // 逆らう: 0.9/ステップ
  await page.evaluate(() => window.__dp.placePlayer('c2l', 60));
  s = await hold(page, 'ArrowRight', 50);
  expect(s.player.x).toBeCloseTo(60 + (1.4 + SPEED) * 50, 5); // 沿う: 1.9/ステップ

  // 立ち止まって流されているだけのときは足音が鳴らない
  await page.evaluate(() => { window.__dp.placePlayer('c2l', 60); window.__dp.clearSounds(); });
  s = await step(page, 60);
  expect(s.player.x).toBeGreaterThan(60);
  const steps = (await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'stepA' || n === 'stepB');
  expect(steps).toEqual([]);
});

test('C3. コンベアで画面の端まで運ばれても落ちない(端で止まり、ベルトに押されたまま立っている)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // 下段は最初右へ流れ、8 秒で逆転する。逆転をまたいで 10 秒間乗ったまま(右端 → 左端へ運ばれる)。
  // 最上段は最初左へ流れ、6 秒で右へ逆転する(左にはゴリラ警官がいるので、右端で確かめる)
  for (const [gid, x, edge] of [['c1', 455, 'right'], ['c3', 440, 'right']]) {
    // 最上段は右へ流れ始めるまで待ってから乗る
    if (gid === 'c3') for (let i = 0; i < 400 && (await conveyors(page)).c3.dir !== 1; i++) await step(page, 10);
    await page.evaluate(([id, px]) => window.__dp.placePlayer(id, px), [gid, x]);
    let s = await step(page, 1);
    let reached = false;
    for (let i = 0; i < 600; i++) {
      s = await step(page, 1);
      expect(s.state).toBe('playing');
      expect(s.player.state).toBe('ground');
      expect(s.player.girder).toBe(gid);
      if (edge === 'right' ? s.player.x >= 472 : s.player.x <= 8) reached = true;
    }
    expect(reached).toBe(true); // 画面の端まで運ばれた
  }
});

test('C7. 下段・中段左右・最上段のコンベアは画面の端まで届いていて、端へ歩いても運ばれても落ちない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const lv = await level(page);
  const byId = Object.fromEntries(lv.girders.map((g) => [g.id, g]));
  // 端まで延ばしたのは外側の端だけ。アンプのすき間(x 220〜260)はそのまま
  expect([byId.c1.x1, byId.c1.x2]).toEqual([0, 480]);
  expect([byId.c2l.x1, byId.c2l.x2]).toEqual([0, 220]);
  expect([byId.c2r.x1, byId.c2r.x2]).toEqual([260, 480]);
  expect([byId.c3.x1, byId.c3.x2]).toEqual([0, 480]);
  // 流れの向きに関係なく、外側の端へ歩き続けても落ちない(流れに逆らう向きも、沿う向きも)
  for (const [gid, x, key] of [['c1', 40, 'ArrowLeft'], ['c1', 440, 'ArrowRight'], ['c2l', 40, 'ArrowLeft'], ['c2r', 440, 'ArrowRight'], ['c3', 440, 'ArrowRight']]) {
    // (最上段の左端はゴリラ警官の向こう側なので、ここでは右端だけ確かめる)
    await page.evaluate(([id, px]) => window.__dp.placePlayer(id, px), [gid, x]);
    let s = await hold(page, key, 150);
    // 画面の端で止まっている
    if (key === 'ArrowLeft') expect(s.player.x).toBeLessThanOrEqual(8);
    else expect(s.player.x).toBeGreaterThanOrEqual(472);
    // キーを離してベルトに運ばれても、足場の上に立ったまま
    s = await step(page, 30);
    expect(s.state).toBe('playing');
    expect(s.player.state).toBe('ground');
    expect(s.player.girder).toBe(gid);
  }
  // ファイヤースカルも、延ばしたコンベアの外側の端で折り返して落ちない(端の 8px 手前で向きを変える)
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.placePlayer('mid', 240);
    for (const [id, x, dir] of [['c1', 12, -1], ['c1', 468, 1], ['c2l', 12, -1], ['c2r', 468, 1], ['c3', 468, 1]]) dp.spawnSkull(id, x, { dir, skipSpawn: true });
  });
  let sk = await step(page, 1);
  for (let i = 0; i < 240; i++) {
    sk = await step(page, 1);
    for (const e of sk.enemies) {
      expect(e.x).toBeGreaterThanOrEqual(7.9);
      expect(e.x).toBeLessThanOrEqual(472.1);
      expect(['walk', 'ladder']).toContain(e.state);
    }
  }
  expect(sk.enemies.length).toBe(5); // 1 体も落ちていない
  await page.evaluate(() => window.__dp.clearEnemies());

  // 中段のコンベアはアンプへ流れるので、内側の端(アンプ)へ運ばれると今までどおり炎上する
  await page.evaluate(() => window.__dp.placePlayer('c2l', 180));
  let s;
  for (let i = 0; i < 300; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.deathReason).toBe('burn');
});

test('C4. ハシゴの上と空中では運ばれない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const lv = await level(page);
  // c1 → mid のハシゴ(x=64)に、c1 から少し登ったところでつかまって止まる
  const l = lv.ladders.find((x) => x.lower === 'c1' && x.upper === 'mid');
  await page.evaluate((lad) => window.__dp.placePlayerLadder(lad.index, lad.bottomY - 10), l);
  let s = await step(page, 60);
  expect(s.player.state).toBe('ladder');
  expect(s.player.x).toBe(l.x);

  // コンベアの上でその場ジャンプ: 空中では流されないので、踏み切った位置の真上を上下する
  await page.evaluate(() => window.__dp.placePlayer('c1', 300));
  await page.keyboard.press('Space');
  s = await step(page, 1);
  expect(s.player.state).toBe('air');
  const xJump = s.player.x;
  const xs = [];
  for (let i = 0; i < 60 && s.player.state === 'air'; i++) {
    s = await step(page, 1);
    if (s.player.state === 'air') xs.push(s.player.x);
  }
  expect(new Set(xs)).toEqual(new Set([xJump]));
  expect(s.player.state).toBe('ground'); // 着地したらまた運ばれる
  const xLand = s.player.x;
  s = await step(page, 10);
  expect(s.player.x).not.toBe(xLand);
});

test('C5. 下段と最上段は一定時間ごとに向きが逆転し、その 1 秒前から予告する(中段は逆転しない)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => window.__dp.placePlayer('mid', 230)); // じゃまにならない場所
  let cv = await conveyors(page);
  const startDir = { c1: cv.c1.dir, c3: cv.c3.dir, c2l: cv.c2l.dir, c2r: cv.c2r.dir };
  expect(cv.c1.reverseEvery).toBe(480);
  expect(cv.c3.reverseEvery).toBe(360);
  expect(cv.c2l.reverseEvery).toBe(0);

  // 最上段: 逆転の 60 ステップ前までは予告なし、そこから予告、360 ステップで逆転
  const t0 = cv.c3.timer;
  await step(page, 360 - 61 - t0);
  cv = await conveyors(page);
  expect(cv.c3.warn).toBe(false);
  await step(page, 2);
  cv = await conveyors(page);
  expect(cv.c3.warn).toBe(true);
  expect(cv.c3.dir).toBe(startDir.c3);
  await step(page, 360 - cv.c3.timer);
  cv = await conveyors(page);
  expect(cv.c3.dir).toBe(-startDir.c3);
  expect(cv.c3.warn).toBe(false);
  expect(cv.c3.vx).toBeCloseTo(-startDir.c3 * SPEED, 5);

  // 下段は 480 ステップで逆転。中段は向きが変わらない
  await step(page, 480 - cv.c1.timer);
  cv = await conveyors(page);
  expect(cv.c1.dir).toBe(-startDir.c1);
  expect(cv.c2l.dir).toBe(startDir.c2l);
  expect(cv.c2r.dir).toBe(startDir.c2r);
});

test('C6. ベルトの模様は流れる向きに動き、逆転の予告中は滑車が黄色く点滅する。ミスすると最初の向きに戻る', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => window.__dp.placePlayer('mid', 230));
  // 下段コンベアのベルトの継ぎ目の位置を読む
  const seams = () => page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d');
    const img = ctx.getImageData(100, 449, 40, 1).data;
    const xs = [];
    for (let i = 0; i < 40; i++) if (img[i * 4] === 85 && img[i * 4 + 1] === 85 && img[i * 4 + 2] === 106) xs.push(100 + i);
    return xs;
  });
  await page.waitForTimeout(100);
  const a = await seams();
  await step(page, 4); // 0.5 x 4 = 2px 右へ
  await page.waitForTimeout(100);
  const b = await seams();
  expect(a.length).toBeGreaterThan(0);
  expect(b).toEqual(a.map((x) => x + 2));

  // 最上段の逆転の予告中は、滑車が黄色くなるコマがある
  const cv = await conveyors(page);
  await step(page, 360 - 50 - cv.c3.timer);
  const colors = new Set();
  for (let i = 0; i < 12; i++) {
    await step(page, 1);
    await page.waitForTimeout(40);
    colors.add(await page.evaluate(() => Array.from(document.getElementById('game').getContext('2d').getImageData(10, 162, 1, 1).data.slice(0, 3)).join(',')));
  }
  expect(colors.has('255,210,60')).toBe(true); // 黄色(予告)
  expect(colors.has('60,216,255')).toBe(true); // ふだんの水色

  // ミスすると組み立て直され、最初の向き・時間に戻る
  await step(page, 100); // 最上段は逆転済み
  expect((await conveyors(page)).c3.dir).toBe(1);
  await page.evaluate(() => window.__dp.placePlayer('c2l', 210));
  let s;
  for (let i = 0; i < 400 && s?.state !== 'ready'; i++) s = await step(page, 1);
  expect(s.state).toBe('ready');
  const after = await conveyors(page);
  expect(after.c3.dir).toBe(-1);
  expect(after.c3.timer).toBe(0);
});

// ---- 爆音アンプでの炎上 ----

const BURN_FRAMES = 60; // config.timing.dyingByReason.burn
const DYING_FRAMES = 120; // config.timing.dying(ふつうのミス)

// ミスの演出が終わって READY になるまでのステップ数を数える(残機もあわせて返す)
async function stepsUntilReady(page) {
  let s, n = 0;
  for (; n < 400; n++) {
    s = await step(page, 1);
    if (s.state !== 'dying') break;
  }
  return { n: n + 1, s };
}

test('B1. 爆音アンプに触れると炎上し、約 1 秒の演出のあと残機が 1 つだけ減って再スタートする', async ({ page }) => {
  const start = await startAtStage(page, STAGE2);
  // 中段の左コンベアの端からアンプへ歩いていく
  await page.evaluate(() => window.__dp.placePlayer('c2l', 208));
  let s;
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 60; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('burn'); // 落下ではなく炎上
  expect(s.player.state).toBe('dead');
  const box = await page.evaluate(() => window.__dp.ampHitbox());
  expect(Math.abs(s.player.x - box.x) * 2).toBeLessThan(box.w + 14); // アンプに触れる位置で止まった
  const at = s.player;

  // 演出中は操作・移動・コンベアが止まり、残機は減らない
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) s = await hold(page, key, 5);
  await page.keyboard.press('Space');
  s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.player.x).toBe(at.x);
  expect(s.player.y).toBe(at.y);
  expect(s.lives).toBe(start.lives);

  // 約 1 秒(60 ステップ)で終わり、残機が 1 つだけ減って READY から再スタート
  await page.evaluate(() => window.__dp.placePlayer('c2l', 208)); // わざと再びアンプに近づけても二重には減らない
  const r = await stepsUntilReady(page);
  expect(r.s.state).toBe('ready');
  expect(r.s.lives).toBe(start.lives - 1);
  expect(r.s.player.state).toBe('ground');
  expect(r.s.player.girder).toBe('f0'); // スタート地点
});

test('B2. 炎上の演出は 60 ステップ、落下のミスは従来どおり 120 ステップ', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // 炎上: 中段の左コンベアに流されてアンプへ(歩かなくても運ばれて触れる)
  await page.evaluate(() => window.__dp.placePlayer('c2l', 210));
  let s;
  for (let i = 0; i < 60; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.deathReason).toBe('burn');
  let r = await stepsUntilReady(page);
  expect(r.n).toBe(BURN_FRAMES);

  // 落下: ガールの足場の右端から(アンプには触れない)
  for (let i = 0; i < 120 && r.s.state !== 'playing'; i++) r.s = await step(page, 1);
  await page.evaluate(() => { window.__dp.setBossEnabled(false); window.__dp.placePlayer('top', 296); });
  s = await hold(page, 'ArrowRight', 20);
  for (let i = 0; i < 120 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.deathReason).toBe('fall');
  r = await stepsUntilReady(page);
  expect(r.n).toBe(DYING_FRAMES);
});

test('B3. アンプの上の炎に上から触れても炎上する。下の格子の台の前に立っても炎上しない', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const box = await page.evaluate(() => window.__dp.ampHitbox());
  // 炎の高さ(アンプ本体の上端より上)で、アンプの真上から落とす
  await page.evaluate((y) => window.__dp.placePlayerAir(240, y, 0), box.y - box.h - 2);
  let s;
  for (let i = 0; i < 30; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.deathReason).toBe('burn');
  expect(s.player.y).toBeLessThan(box.y); // アンプ本体の下まで落ちる前に燃えた
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);

  // 格子の台の前(中段の足場の上)に立っても炎上しない
  await page.evaluate(() => { window.__dp.setBossEnabled(false); window.__dp.placePlayer('mid', 240); });
  s = await step(page, 60);
  expect(s.state).toBe('playing');
  expect(s.player.state).toBe('ground');
});

test('B4. 残機が 1 のときに炎上するとゲームオーバー(残機はマイナスにならない)', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => { window.__dp.setLives(1); window.__dp.placePlayer('c2l', 214); });
  let s;
  for (let i = 0; i < 30; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.deathReason).toBe('burn');
  const r = await stepsUntilReady(page);
  expect(r.s.state).toBe('gameover');
  expect(r.s.lives).toBe(0);
});

test('B5. 炎上の演出では主人公のまわりに赤・オレンジ・黄色の炎が描かれる', async ({ page }) => {
  await startAtStage(page, STAGE2);
  await page.evaluate(() => window.__dp.placePlayer('c2l', 214));
  let s;
  for (let i = 0; i < 30; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  s = await step(page, 20); // 燃え上がったところ
  await page.waitForTimeout(100);
  const count = await page.evaluate((p) => {
    const ctx = document.getElementById('game').getContext('2d');
    // 主人公のまわり(アンプの炎と重ならないよう、主人公より左側の半分)を数える
    const x0 = Math.round(p.x) - 16;
    const img = ctx.getImageData(x0, Math.round(p.y) - 44, 12, 46).data;
    const n = { Y: 0, O: 0, R: 0 };
    for (let i = 0; i < img.length; i += 4) {
      const c = img[i] + ',' + img[i + 1] + ',' + img[i + 2];
      if (c === '255,210,60') n.Y++;
      if (c === '255,138,30') n.O++;
      if (c === '255,42,42') n.R++;
    }
    return n;
  }, s.player);
  expect(count.Y).toBeGreaterThan(4);
  expect(count.O).toBeGreaterThan(4);
  expect(count.R).toBeGreaterThan(4);
});

test('B6. 炎上の演出は使い回せる: 「触れると炎上」の障害物に当たっても同じ炎上になる(1 面でも)', async ({ page }) => {
  const start = await startAtStage(page, 0);
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.placePlayer('g0', 200);
    const id = dp.spawnHazard('can', 'g0', 240);
    dp.setHazardBurns(id, true);
  });
  let s;
  for (let i = 0; i < 80; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.deathReason).toBe('burn');
  const r = await stepsUntilReady(page);
  expect(r.n).toBe(BURN_FRAMES);
  expect(r.s.lives).toBe(start.lives - 1);
});

// ---- ジグザグのルート(案 A) ----

test('Z1. 左右どちらか片側のハシゴだけでは最上段まで登れず、どの登り方でも左右に折り返す', async ({ page }) => {
  await startAtStage(page, STAGE2);
  const lv = await level(page);
  // 上へ登るだけで床からガールの足場まで行けるか(使えるハシゴを絞って調べる)
  const reaches = (ladders) => {
    const seen = new Set(['f0']);
    const queue = ['f0'];
    while (queue.length) {
      const cur = queue.shift();
      for (const l of ladders) if (l.lower === cur && !seen.has(l.upper)) { seen.add(l.upper); queue.push(l.upper); }
    }
    return seen.has('top');
  };
  expect(reaches(lv.ladders)).toBe(true);
  // 右半分(x >= 240)のハシゴだけ / 左半分(x < 240)とガールの足場へのハシゴだけ、では登れない
  expect(reaches(lv.ladders.filter((l) => l.x >= 240))).toBe(false);
  expect(reaches(lv.ladders.filter((l) => l.x < 240 || l.upper === 'top'))).toBe(false);
  // 床からガールの足場までの登り方をすべて数える(深さ優先探索)
  const routes = [];
  const walk = (cur, path) => {
    if (cur === 'top') { routes.push(path.join(' > ')); return; }
    for (const l of lv.ladders) if (l.lower === cur) walk(l.upper, path.concat(l.upper + '@' + l.x));
  };
  walk('f0', ['f0']);
  // 中段の足場が 1 枚なので、下段から 2 本 × 中段コンベアへ 3 本 = 6 通り(ALL_ROUTES と同じ)
  expect(routes.sort()).toEqual(
    ALL_ROUTES.map((rt) => ['f0'].concat(rt.map(([x, g]) => g + '@' + x)).join(' > ')).sort());
  // どちらのルートも、各段で反対側へ横断する(左右に折り返す)
  for (const route of ALL_ROUTES) {
    let turns = 0;
    let prevDir = 1; // スタート(x=60)から床を右へ
    let x = 60;
    for (const [tx] of route) {
      const dir = Math.sign(tx - x) || prevDir;
      if (dir !== prevDir) turns++;
      prevDir = dir;
      x = tx;
    }
    expect(turns).toBeGreaterThanOrEqual(2);
  }
});

test('Z2. 最短クリア時間は 18〜22 秒(敵なし・最短の操作で測る)。どのルートでも登りきれる', async ({ page }) => {
  await startAtStage(page, STAGE2);
  // 実際のキー入力でルートを最短で進み、プレイ開始からガールに触れる(逃走演出が始まる)までのステップを数える
  const timeOf = (route) => page.evaluate((rt) => {
    const dp = window.__dp;
    const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k }));
    dp.setSkullsEnabled(false);
    dp.setBazookaEnabled(false); // 敵なしで測る(ゴリラのバズーカも止める)
    dp.startStage(1);
    let s = dp.step(1);
    while (s.state !== 'playing') s = dp.step(1);
    let leg = 0, held = null, t = 0;
    const press = (k) => { if (held !== k) { if (held) key(held, false); if (k) key(k, true); held = k; } };
    for (; t < 3600 && s.state === 'playing'; t++) {
      const p = s.player;
      if (p.state === 'ground') {
        if (leg < rt.length) {
          const [tx, next] = rt[leg];
          if (Math.abs(p.x - tx) > 1) press(p.x < tx ? 'ArrowRight' : 'ArrowLeft');
          else press('ArrowUp');
          if (p.girder === next) leg++;
        } else press(p.x > 205 ? 'ArrowLeft' : 'ArrowRight');
      } else if (p.state === 'ladder') press('ArrowUp');
      s = dp.step(1);
    }
    press(null);
    return { state: s.state, seconds: t / 60 };
  }, route);
  const times = [];
  for (const route of ALL_ROUTES) {
    const r = await timeOf(route);
    expect(r.state).toBe('escape');
    times.push(r.seconds);
  }
  // いちばん速いルートが 18〜22 秒
  expect(Math.min(...times)).toBeGreaterThanOrEqual(18);
  expect(Math.min(...times)).toBeLessThanOrEqual(22);
});
