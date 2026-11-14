// ドンキーパンク Stage 1 の動作テスト
// ?test を付けて開くと window.__dp(テスト補助)が使える。
// ループを手動にして決まったステップ数だけ進めるので、結果は毎回同じになる。
const { test, expect } = require('@playwright/test');

// 各テストでコンソールのエラーを集め、最後に 0 件であることを確認する
let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(async () => {
  expect(errors, 'ブラウザのコンソールにエラーが出ていないこと').toEqual([]);
});

// ---- 補助関数 ----

const snap = (page) => page.evaluate(() => window.__dp.snapshot());
const step = (page, n) => page.evaluate((k) => window.__dp.step(k), n);
const { passIntermission, leaveClear } = require('./helpers'); // 1〜3 面のあとの面間演出を見終わるまで進める
// プレイヤーの当たり判定の高さ(config.player.height と同じ値)
const DP_HEIGHT = 26;
// プレイヤーのドット絵の高さ(モヒカン込み。20 ドット × 2)
const SPRITE_HEIGHT = 40;

// タイトルを開いて ENTER で開始し、プレイ中まで進める。
// 敵の投下は止めておき、各テストで必要な障害物だけを出す。
async function startGame(page, { boss = false } = {}) {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.setSeed(1); });
  await page.keyboard.press('Enter');
  await step(page, 1);
  await page.evaluate((on) => window.__dp.setBossEnabled(on), boss);
  await step(page, 100); // READY 表示が終わるまで
  const s = await snap(page);
  expect(s.state).toBe('playing');
  return s;
}

// キーを押したまま n ステップ進める
async function hold(page, key, n) {
  await page.keyboard.down(key);
  const s = await step(page, n);
  await page.keyboard.up(key);
  return s;
}

// 地面の上で、指定の x まで歩く
async function walkTo(page, x) {
  let s = await snap(page);
  const key = s.player.x < x ? 'ArrowRight' : 'ArrowLeft';
  await page.keyboard.down(key);
  for (let i = 0; i < 600; i++) {
    s = await step(page, 1);
    if (Math.abs(s.player.x - x) <= 1 || s.state !== 'playing') break;
  }
  await page.keyboard.up(key);
  return s;
}

// ハシゴを上りきる(または下りきる)まで進める
async function climb(page, key) {
  let s;
  await page.keyboard.down(key);
  for (let i = 0; i < 300; i++) {
    s = await step(page, 1);
    if (i > 2 && s.player.state === 'ground') break;
  }
  await page.keyboard.up(key);
  return s;
}

// ---- テスト ----

test('1. タイトルからゲームを開始できる', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => window.__dp.setManual(true));
  await page.keyboard.press('Enter');
  let s = await step(page, 1);
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  expect(s.lives).toBe(3);
  expect(s.score).toBe(0);
  s = await step(page, 100);
  expect(s.state).toBe('playing');
  expect(s.player.girder).toBe('g0');
});

test('2. 左右に移動でき、画面の外へは出ない', async ({ page }) => {
  const s0 = await startGame(page);
  let s = await hold(page, 'ArrowRight', 30);
  expect(s.player.x).toBeGreaterThan(s0.player.x + 30);
  const surfaceR = await page.evaluate((x) => window.__dp.surfaceY('g0', x), s.player.x);
  expect(s.player.y).toBeCloseTo(surfaceR, 5); // 斜めの鉄骨に沿って歩く

  const x1 = s.player.x;
  s = await hold(page, 'ArrowLeft', 20);
  expect(s.player.x).toBeLessThan(x1 - 20);

  // 左端まで歩き続けても画面内に留まる
  s = await hold(page, 'ArrowLeft', 200);
  expect(s.player.x).toBeGreaterThanOrEqual(7);
  expect(s.player.state).toBe('ground');
});

test('3. ジャンプして鉄骨に着地できる', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => window.__dp.placePlayer('g0', 200));
  const before = await snap(page);
  await page.keyboard.press('Space');
  let s = await step(page, 1);
  expect(s.player.state).toBe('air');
  let minY = s.player.y;
  for (let i = 0; i < 60 && s.player.state === 'air'; i++) {
    s = await step(page, 1);
    minY = Math.min(minY, s.player.y);
  }
  expect(before.player.y - minY).toBeGreaterThan(25); // 十分な高さまで跳んだ
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('g0');
  expect(s.player.y).toBeCloseTo(before.player.y, 5); // 元の高さにぴったり着地
  expect(s.state).toBe('playing'); // 通常のジャンプではミスにならない

  // 横ジャンプ: 右へ跳んで、斜めの鉄骨の上に正しく着地する
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  for (let i = 0; i < 60 && s.player.state === 'air'; i++) s = await step(page, 1);
  const surf = await page.evaluate((x) => window.__dp.surfaceY('g0', x), s.player.x);
  expect(s.player.x).toBeGreaterThan(240);
  expect(s.player.y).toBeCloseTo(surf, 5);
});

test('4. 鉄骨を下から突き抜けない', async ({ page }) => {
  await startGame(page);

  // (a) 実際のジャンプ: g1 の左端付近は上の g2 との隙間が狭く、頭がぶつかる
  await page.evaluate(() => window.__dp.placePlayer('g1', 40));
  const ceiling = await page.evaluate(() => window.__dp.surfaceY('g2', 40) + 8); // g2 の下面
  await page.keyboard.press('Space');
  let s = await step(page, 1);
  let minHead = s.player.head;
  for (let i = 0; i < 80 && s.player.state === 'air'; i++) {
    s = await step(page, 1);
    minHead = Math.min(minHead, s.player.head);
  }
  expect(minHead).toBeGreaterThanOrEqual(ceiling - 0.01); // 頭は下面より上へ行かない
  expect(s.player.girder).toBe('g1'); // 元の段に戻る

  // (b) 強い上向きの速度で下から突っ込ませても、鉄骨の下で止まる
  const g1Bottom = await page.evaluate(() => window.__dp.surfaceY('g1', 200) + 8);
  await page.evaluate((y) => window.__dp.placePlayerAir(200, y, -12), g1Bottom + 26 + 4);
  for (let i = 0; i < 10; i++) {
    s = await step(page, 1);
    expect(s.player.head).toBeGreaterThanOrEqual(g1Bottom - 0.01);
  }
  for (let i = 0; i < 120 && s.player.state === 'air'; i++) s = await step(page, 1);
  expect(s.player.girder).toBe('g0'); // 下の段に落ちて着地する(g1 の上には乗らない)
});

test('5. ハシゴの位置でだけ上下に移動できる', async ({ page }) => {
  await startGame(page);
  const lv = await page.evaluate(() => window.__dp.level());
  const ladder = lv.ladders.find((l) => l.lower === 'g0' && l.upper === 'g1' && l.x === 110);

  // ハシゴのない場所で ↑ を押しても登れない
  await page.evaluate(() => window.__dp.placePlayer('g0', 200));
  let s = await hold(page, 'ArrowUp', 30);
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('g0');

  // ハシゴの少し横(つかめる範囲)から登る
  await page.evaluate((x) => window.__dp.placePlayer('g0', x), ladder.x + 4);
  s = await hold(page, 'ArrowUp', 20);
  expect(s.player.state).toBe('ladder');
  expect(s.player.x).toBe(ladder.x); // ハシゴの中央に合わせる
  const yMid = s.player.y;

  // 昇降中は左右に動かない
  s = await hold(page, 'ArrowLeft', 20);
  expect(s.player.x).toBe(ladder.x);
  expect(s.player.y).toBe(yMid);
  // ジャンプもできない
  await page.keyboard.press('Space');
  s = await step(page, 5);
  expect(s.player.state).toBe('ladder');

  // 上りきると上の段に立つ
  s = await climb(page, 'ArrowUp');
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('g1');
  expect(s.player.y).toBeCloseTo(ladder.topY, 5);

  // 下りる
  s = await climb(page, 'ArrowDown');
  expect(s.player.girder).toBe('g0');
  expect(s.player.y).toBeCloseTo(ladder.bottomY, 5);
});

test('6. ビール瓶・缶が鉄骨を転がり、端から下の段へ落ちる', async ({ page }) => {
  await startGame(page);
  // プレイヤーはじゃまにならない最上段へ
  await page.evaluate(() => window.__dp.placePlayer('top', 290));
  const result = await page.evaluate(() => {
    const dp = window.__dp;
    dp.clearHazards();
    const ids = [dp.spawnHazard('bottle', 'g5', 110), dp.spawnHazard('can', 'g5', 140)];
    const visited = { [ids[0]]: new Set(), [ids[1]]: new Set() };
    const types = {};
    const problems = [];
    let gone = 0;
    for (let i = 0; i < 4000; i++) {
      const s = dp.step(1);
      for (const h of s.hazards) {
        types[h.id] = h.type;
        if (h.state === 'roll') {
          visited[h.id].add(h.girder);
          // 転がり中は必ず鉄骨の上面に乗っている
          const surf = dp.surfaceY(h.girder, h.x);
          if (Math.abs(surf - h.y) > 0.01) problems.push(`id${h.id} 浮き/めり込み ${h.girder} x=${h.x} y=${h.y}`);
        }
        if (h.state === 'fall') {
          // 落下中も最下段より下へすり抜けない
          if (h.x >= 0 && h.x <= 480 && h.y > dp.surfaceY('g0', h.x) + 0.01) problems.push(`id${h.id} 最下段をすり抜け`);
        }
      }
      if (s.state !== 'playing') problems.push('プレイ中でなくなった: ' + s.state);
      if (s.hazards.length === 0) { gone = i; break; }
    }
    return { visited: { a: [...visited[ids[0]]], b: [...visited[ids[1]]] }, types, problems: problems.slice(0, 5), gone };
  });
  expect(result.problems).toEqual([]);
  expect(Object.values(result.types).sort()).toEqual(['bottle', 'can']);
  // 上から順に下の段へ降りてきて、最後は最下段から画面外へ消える
  for (const v of [result.visited.a, result.visited.b]) {
    expect(v[0]).toBe('g5');
    expect(v).toContain('g0');
  }
  expect(result.gone).toBeGreaterThan(0);
});

test('7. 障害物に当たると残機が減り、開始位置から再開する', async ({ page }) => {
  const start = await startGame(page);
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.spawnHazard('can', 'g0', 230); });
  let s = await step(page, 60);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
  s = await step(page, 130);
  expect(s.lives).toBe(2);
  expect(s.state).toBe('ready');
  expect(s.player.x).toBe(start.player.x);
  expect(s.player.girder).toBe('g0');
  expect(s.hazards).toEqual([]);

  // ジャンプ中に当たってもミスになる
  s = await step(page, 100);
  expect(s.state).toBe('playing');
  await page.evaluate(() => {
    const y = window.__dp.surfaceY('g0', 300);
    window.__dp.spawnHazard('bottle', 'g0', 300);
    window.__dp.placePlayerAir(300, y - 6, -1);
  });
  s = await step(page, 1);
  expect(s.state).toBe('dying');

  // ちゃんと飛び越えればミスにならず 100 点
  s = await step(page, 130);
  s = await step(page, 100);
  expect(s.lives).toBe(1);
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.spawnHazard('can', 'g0', 270); });
  for (let i = 0; i < 200; i++) {
    s = await step(page, 1);
    if (s.hazards[0].x - s.player.x <= 22) break; // 缶まで約 22px で踏み切る
  }
  await page.keyboard.press('Space');
  s = await step(page, 80);
  expect(s.state).toBe('playing');
  expect(s.lives).toBe(1);
  expect(s.score).toBe(100);
});

test('8. 残機ゼロでゲームオーバーになり、ENTER で再挑戦できる', async ({ page }) => {
  await startGame(page);
  for (let life = 3; life >= 1; life--) {
    await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.spawnHazard('bottle', 'g0', 225); });
    let s = await step(page, 60);
    expect(s.state).toBe('dying');
    s = await step(page, 125);
    expect(s.lives).toBe(life - 1);
    if (life > 1) {
      expect(s.state).toBe('ready');
      await step(page, 100);
    } else {
      expect(s.state).toBe('gameover');
    }
  }
  await page.keyboard.press('Enter');
  let s = await step(page, 1);
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  expect(s.lives).toBe(3);
  expect(s.score).toBe(0);
});

test('9. ハシゴを登って最上段のガールに触れるとクリア(Oi! Oi! Oi!)', async ({ page }) => {
  await startGame(page);
  // 最下段から最上段まで、実際のキー操作で登る
  const route = [
    [110, 'g1'], [72, 'g2'], [184, 'g3'], [92, 'g4'], [216, 'g5'], [288, 'top'],
  ];
  let s;
  for (const [x, next] of route) {
    s = await walkTo(page, x);
    expect(s.state).toBe('playing');
    s = await climb(page, 'ArrowUp');
    expect(s.player.girder).toBe(next);
  }
  const scoreBefore = s.score;
  s = await walkTo(page, 200);
  // ガールに触れると、まずゴリラ警官の逃走演出(テスト 35)。終わるとクリア表示
  expect(s.state).toBe('escape');
  expect(s.score).toBeGreaterThan(scoreBefore);
  for (let i = 0; i < 900 && s.state === 'escape'; i++) s = await step(page, 1);
  expect(s.state).toBe('clear');
  expect(s.message).toBe('Oi! Oi! Oi!');

  // 演出のあと ENTER で次の面(2 面)へ進む。周回数はそのまま(2 面をクリアすると 1 面に戻って R2)
  s = await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  expect(s.message).toBe('STAGE 2');
  expect(s.stageId).toBe('livehouse');
  expect(s.round).toBe(1);
});

test('10. 通常プレイ(テスト補助なし)でコンソールエラーが出ず、補助も公開されない', async ({ page }) => {
  await page.goto('./');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => typeof window.__dp)).toBe('undefined');
  await page.keyboard.press('Enter');
  // 実時間で 6 秒ほど適当に操作する(敵も通常どおり投下する)
  const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'Space', 'ArrowRight', 'ArrowDown'];
  for (let i = 0; i < 12; i++) {
    const k = keys[i % keys.length];
    await page.keyboard.down(k);
    await page.waitForTimeout(400);
    await page.keyboard.up(k);
  }
  await page.waitForTimeout(500);
});

// ---- 足音 ----

// 記録された効果音のうち、足音(stepA=ピコ / stepB=ポコ)だけを取り出す
const footsteps = async (page) =>
  (await page.evaluate(() => window.__dp.sounds())).filter((n) => n === 'stepA' || n === 'stepB');

test('11. 左右に歩いている間だけ「ピコ」「ポコ」が交互に鳴り、止まると鳴りやむ', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.clearSounds(); });

  // 右へ 60 ステップ歩く(12 ステップごとに 1 歩 → 5 歩)
  await hold(page, 'ArrowRight', 60);
  let fs = await footsteps(page);
  expect(fs).toEqual(['stepA', 'stepB', 'stepA', 'stepB', 'stepA']);

  // 立ち止まったら鳴らない
  await page.evaluate(() => window.__dp.clearSounds());
  await step(page, 60);
  expect(await footsteps(page)).toEqual([]);

  // 左へ歩いても鳴る(歩き直すと「ピコ」から)
  await hold(page, 'ArrowLeft', 30);
  fs = await footsteps(page);
  expect(fs).toEqual(['stepA', 'stepB', 'stepA']);
});

test('12. ハシゴを登り降りしているときと、ジャンプ中は足音が鳴らない', async ({ page }) => {
  await startGame(page);
  const lv = await page.evaluate(() => window.__dp.level());
  const ladder = lv.ladders.find((l) => l.lower === 'g0' && l.upper === 'g1' && l.x === 110);
  await page.evaluate((x) => { window.__dp.placePlayer('g0', x); window.__dp.clearSounds(); }, ladder.x);

  let s = await climb(page, 'ArrowUp');
  expect(s.player.girder).toBe('g1');
  s = await climb(page, 'ArrowDown');
  expect(s.player.girder).toBe('g0');
  expect(await footsteps(page)).toEqual([]);

  // その場ジャンプ(空中)でも鳴らない
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.clearSounds(); });
  await page.keyboard.press('Space');
  s = await step(page, 1);
  expect(s.player.state).toBe('air');
  for (let i = 0; i < 120 && s.player.state === 'air'; i++) s = await step(page, 1);
  expect(await footsteps(page)).toEqual([]);
});

test('13. M キーで音を OFF にすると足音も鳴らず、ON に戻すとまた鳴る', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.clearSounds(); });
  expect(await page.evaluate(() => window.__dp.soundEnabled())).toBe(true);

  await page.keyboard.press('m');
  await step(page, 1);
  expect(await page.evaluate(() => window.__dp.soundEnabled())).toBe(false);
  await hold(page, 'ArrowRight', 40);
  expect(await footsteps(page)).toEqual([]);

  await page.keyboard.press('m');
  await step(page, 1);
  expect(await page.evaluate(() => window.__dp.soundEnabled())).toBe(true);
  await hold(page, 'ArrowLeft', 40);
  expect((await footsteps(page)).length).toBeGreaterThan(0);
});

// ---- ハシゴ上端で待つときの障害物 ----

// g1(右へ転がる段)の x=60 に缶を置き、ハシゴ 0(x=110, g0→g1)を通り過ぎるまで進める。
// 降りる確率は 100% にして、「降りない」のがプレイヤーの位置のおかげだと分かるようにする。
async function rollOverLadder0(page, placePlayer) {
  return page.evaluate((how) => {
    const dp = window.__dp;
    const ladder = dp.level().ladders[0];
    dp.clearHazards();
    dp.setLadderChance(1);
    if (how.type === 'ladder') dp.placePlayerLadder(how.index, dp.level().ladders[how.index].topY + how.below);
    else dp.placePlayer(how.girder, how.x);
    const id = dp.spawnHazard('can', 'g1', 60);
    const states = new Set();
    let s;
    for (let i = 0; i < 200; i++) {
      s = dp.step(1);
      const h = s.hazards.find((x) => x.id === id);
      if (!h) break;
      states.add(h.state);
      if (s.state !== 'playing') break;
      if (h.state === 'roll' && h.girder === 'g1' && h.x > ladder.x + 30) break;
    }
    dp.setLadderChance(null);
    return { states: [...states], s };
  }, placePlayer);
}

test('14. ハシゴの上端付近で待っていると、障害物は降りずに頭上を通過する', async ({ page }) => {
  const start = await startGame(page);
  // 頭が上の段の上面より 2px 下(当たらないギリギリ)でハシゴにつかまって待つ
  const r = await rollOverLadder0(page, { type: 'ladder', index: 0, below: DP_HEIGHT + 2 });
  expect(r.states).toEqual(['roll']); // 一度もハシゴを降りない
  expect(r.s.state).toBe('playing');
  expect(r.s.lives).toBe(start.lives);
  expect(r.s.player.state).toBe('ladder');
  expect(r.s.player.ladder).toBe(0);
});

test('15. プレイヤーがそのハシゴにいなければ、これまでどおり障害物はハシゴを降りる', async ({ page }) => {
  await startGame(page);
  // 鉄骨の上の離れた場所にいるとき
  let r = await rollOverLadder0(page, { type: 'ground', girder: 'g0', x: 300 });
  expect(r.states).toContain('ladder');
  // 別のハシゴ(ハシゴ 1: x=380, g0→g1)につかまっているとき
  r = await rollOverLadder0(page, { type: 'ladder', index: 1, below: DP_HEIGHT + 2 });
  expect(r.states).toContain('ladder');
  expect(r.s.state).toBe('playing');
});

test('16. ハシゴの上端から頭を出しすぎていると、転がる障害物に当たる(当たり判定は従来どおり)', async ({ page }) => {
  await startGame(page);
  const r = await rollOverLadder0(page, { type: 'ladder', index: 0, below: 10 });
  expect(r.states).not.toContain('ladder');
  expect(r.s.state).toBe('dying');
  expect(r.s.deathReason).toBe('hazard');
});

// ---- 釘バット ----

const BAT_DURATION = 600; // config.bat.duration と同じ値

// 空中にいる間ずっと進める(着地するまで)。途中で一度でも空中だったかも返す
async function untilLanded(page) {
  let s = await step(page, 1);
  let wasAir = s.player.state === 'air';
  for (let i = 0; i < 120 && s.player.state === 'air'; i++) s = await step(page, 1);
  return { s, wasAir };
}

test('17. 釘バットは鉄骨から浮いていて、当たり判定は見た目(ドット絵)と同じ大きさ・位置', async ({ page }) => {
  const start = await startGame(page);
  const info = await page.evaluate(() => {
    const spr = window.DP.sprites.DATA.batSide;
    return { w: spr.w * window.DP.config.PIXEL, h: spr.h * window.DP.config.PIXEL };
  });
  const placed = [['g2', start.items[0]], ['g4', start.items[1]]];
  for (const [girder, it] of placed) {
    expect(it.w).toBe(info.w);
    expect(it.h).toBe(info.h);
    const surf = await page.evaluate(([gid, x]) => window.__dp.surfaceY(gid, x), [girder, it.x]);
    // 下端が鉄骨から 44px 浮いている。立っているときのモヒカンの先(40px)より上
    expect(surf - it.y).toBeCloseTo(44, 5);
    expect(surf - it.y).toBeGreaterThan(SPRITE_HEIGHT);
    expect(surf - it.y).toBeGreaterThan(DP_HEIGHT);
  }
});

test('18. 釘バットの下を歩いても拾えず、真下でジャンプして触れると拾う(持ったまま歩ける)', async ({ page }) => {
  const start = await startGame(page);
  const item = start.items[0]; // g2 の右端寄り
  await page.evaluate((x) => { window.__dp.placePlayer('g2', x - 40); window.__dp.clearSounds(); }, item.x);

  // 下を端から端まで歩いて通り抜けても拾わない
  let s = await walkTo(page, item.x + 20);
  expect(s.player.x).toBeGreaterThan(item.x + 15);
  s = await walkTo(page, item.x - 30);
  expect(s.items[0].taken).toBe(false);
  expect(s.player.bat).toBe(0);
  expect(await page.evaluate(() => window.__dp.sounds())).not.toContain('batGet');

  // 真下でジャンプすると、空中で触れて拾う
  await page.evaluate((x) => { window.__dp.placePlayer('g2', x); window.__dp.clearSounds(); }, item.x);
  await page.keyboard.press('Space');
  let got = null;
  for (let i = 0; i < 60; i++) {
    s = await step(page, 1);
    if (s.player.bat > 0 && !got) got = s;
  }
  expect(got).not.toBeNull();
  expect(got.player.state).toBe('air'); // 拾った瞬間は空中
  expect(got.player.head).toBeLessThan(item.y); // 頭が釘バットの下端より上に届いている
  expect(s.items[0].taken).toBe(true);
  expect(s.items[1].taken).toBe(false);
  expect(s.player.state).toBe('ground');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('batGet');

  // 持ったまま歩ける(使用中は BGM が流れるので足音は鳴らない: テスト 25)。振りは上・下を交互にくり返す
  const x0 = s.player.x;
  const phases = new Set();
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 40; i++) {
    s = await step(page, 1);
    phases.add(s.player.batPhase);
  }
  await page.keyboard.up('ArrowLeft');
  expect([...phases].sort()).toEqual(['down', 'up']);
  expect(s.player.x).toBeLessThan(x0 - 20);
});

test('19. ジャンプしても釘バットに触れなければ拾えない', async ({ page }) => {
  const start = await startGame(page);
  const item = start.items[0];
  // 横に少しずれた位置(当たり判定どうしが重ならない距離)で真上にジャンプする
  const gap = (item.w + 14) / 2 + 2; // 14 = 主人公の当たり判定の幅
  await page.evaluate((x) => window.__dp.placePlayer('g2', x), item.x - gap);
  await page.keyboard.press('Space');
  const r = await untilLanded(page);
  expect(r.wasAir).toBe(true);
  expect(r.s.items[0].taken).toBe(false);
  expect(r.s.player.bat).toBe(0);

  // 境目より内側なら届く(当たり判定が見た目どおりの幅であることの確認)
  await page.evaluate((x) => window.__dp.placePlayer('g2', x), item.x - gap + 6);
  await page.keyboard.press('Space');
  const r2 = await untilLanded(page);
  expect(r2.s.items[0].taken).toBe(true);
});

test('20. 釘バットを持っている間はジャンプもハシゴの昇降もできない', async ({ page }) => {
  await startGame(page);
  const lv = await page.evaluate(() => window.__dp.level());
  const up = lv.ladders.find((l) => l.lower === 'g2' && l.x === 184); // g2 から上へ
  const down = lv.ladders.find((l) => l.upper === 'g2' && l.x === 256); // g2 から下へ
  await page.evaluate(() => window.__dp.setBat(600));

  // ジャンプできない
  await page.evaluate(() => window.__dp.placePlayer('g2', 300));
  await page.keyboard.press('Space');
  let s = await step(page, 10);
  expect(s.player.state).toBe('ground');

  // ハシゴを上れない
  await page.evaluate((x) => window.__dp.placePlayer('g2', x), up.x);
  s = await hold(page, 'ArrowUp', 30);
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('g2');

  // ハシゴを下りられない
  await page.evaluate((x) => window.__dp.placePlayer('g2', x), down.x);
  s = await hold(page, 'ArrowDown', 30);
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('g2');
  expect(s.player.bat).toBeGreaterThan(0);
});

test('21. 振り回している釘バットで前から来たビール瓶・缶を割ると得点と効果音', async ({ page }) => {
  await startGame(page);
  // 最下段 g0 は左へ転がる。プレイヤーは右を向いて待つ
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.placePlayer('g0', 200); dp.setFacing(1); dp.setBat(600); dp.clearSounds();
    dp.spawnHazard('can', 'g0', 260);
    dp.spawnHazard('bottle', 'g0', 330);
  });
  const before = (await snap(page)).score;
  let s;
  for (let i = 0; i < 150; i++) {
    s = await step(page, 1);
    if (s.hazards.length === 0 || s.state !== 'playing') break;
  }
  expect(s.state).toBe('playing');
  expect(s.hazards).toEqual([]);
  expect(s.score).toBe(before + 300 * 2);
  const sounds = await page.evaluate(() => window.__dp.sounds());
  expect(sounds.filter((n) => n === 'smash').length).toBe(2);
});

test('22. 釘バットを持っていても、背中側から来たビールには当たる', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.placePlayer('g0', 200); dp.setFacing(-1); dp.setBat(600);
    dp.spawnHazard('can', 'g0', 260);
  });
  let s;
  for (let i = 0; i < 150; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
});

test('23. 制限時間が終わると警告音のあと通常状態に戻り、またジャンプ・ハシゴができる', async ({ page }) => {
  await startGame(page);
  const lv = await page.evaluate(() => window.__dp.level());
  const up = lv.ladders.find((l) => l.lower === 'g2' && l.x === 184);
  await page.evaluate((x) => { window.__dp.placePlayer('g2', x); window.__dp.setBat(200); window.__dp.clearSounds(); }, up.x);

  let s = await step(page, 199);
  expect(s.player.bat).toBe(1);
  s = await step(page, 1);
  expect(s.player.bat).toBe(0);
  expect(s.player.batPhase).toBe(null);
  const sounds = await page.evaluate(() => window.__dp.sounds());
  expect(sounds.filter((n) => n === 'batTick').length).toBeGreaterThan(0); // 残り 3 秒の警告音
  expect(sounds[sounds.length - 1]).toBe('batEnd');

  // ハシゴに上れる
  s = await hold(page, 'ArrowUp', 10);
  expect(s.player.state).toBe('ladder');
  // ジャンプできる
  await page.evaluate(() => window.__dp.placePlayer('g2', 300));
  await page.keyboard.press('Space');
  s = await step(page, 2);
  expect(s.player.state).toBe('air');
});

test('24. ミスすると釘バットは手放し、アイテムは元の場所に戻る', async ({ page }) => {
  const start = await startGame(page);
  // 真下でジャンプして拾う
  await page.evaluate((x) => { window.__dp.placePlayer('g2', x); }, start.items[0].x);
  await page.keyboard.press('Space');
  let s = (await untilLanded(page)).s;
  expect(s.items[0].taken).toBe(true);
  expect(s.player.bat).toBeGreaterThan(0);
  // 高いところから落としてミスにする
  await page.evaluate(() => window.__dp.placePlayerAir(330, 100, 0));
  for (let i = 0; i < 300; i++) {
    s = await step(page, 1);
    if (s.state === 'ready') break;
  }
  expect(s.state).toBe('ready');
  expect(s.player.bat).toBe(0);
  expect(s.items.map((it) => it.taken)).toEqual([false, false]);
});

// ---- 釘バット使用中の BGM ----

const music = (page) => page.evaluate(() => window.__dp.music());

test('25. 釘バットを拾うと BGM が流れ、使用中は足音が鳴らず、破壊音は BGM と同時に鳴る', async ({ page }) => {
  const start = await startGame(page);
  expect(await music(page)).toBe('main'); // 拾う前は通常の BGM
  // 真下でジャンプして拾う
  await page.evaluate((x) => { window.__dp.placePlayer('g2', x); window.__dp.setFacing(-1); window.__dp.clearSounds(); }, start.items[0].x);
  await page.keyboard.press('Space');
  let s = (await untilLanded(page)).s;
  expect(s.player.bat).toBeGreaterThan(0);
  expect(await music(page)).toBe('bat');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('batGet'); // 取得音はそのまま

  // 歩いても足音は鳴らない(BGM は流れたまま)
  await page.evaluate(() => window.__dp.clearSounds());
  await hold(page, 'ArrowLeft', 60);
  expect(await footsteps(page)).toEqual([]);
  expect(await music(page)).toBe('bat');

  // 前から来た缶を割ると、BGM を止めずに破壊音が鳴る(g2 は左へ転がるので右を向く)
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.setFacing(1); dp.clearSounds();
    const p = dp.snapshot().player;
    dp.spawnHazard('can', 'g2', p.x + 70);
  });
  for (let i = 0; i < 120; i++) {
    s = await step(page, 1);
    if (s.hazards.length === 0) break;
  }
  expect(s.state).toBe('playing');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('smash');
  expect(await music(page)).toBe('bat');
});

test('26. 残り 3 秒の警告音は BGM 中も鳴り、時間切れで通常の BGM に戻って足音が戻る', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.setBat(200); window.__dp.clearSounds(); });
  let s = await step(page, 100);
  expect(await music(page)).toBe('bat');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('batTick');
  s = await step(page, 100);
  expect(s.player.bat).toBe(0);
  expect(await music(page)).toBe('main');
  const sounds = await page.evaluate(() => window.__dp.sounds());
  expect(sounds[sounds.length - 1]).toBe('batEnd');

  await page.evaluate(() => window.__dp.clearSounds());
  await hold(page, 'ArrowRight', 30);
  expect((await footsteps(page)).length).toBeGreaterThan(0);
});

test('27. ミスしたときとクリアしたとき(逃走演出の開始時)は BGM が止まる', async ({ page }) => {
  await startGame(page);
  // ミス(高いところから落ちる)
  await page.evaluate(() => { window.__dp.setBat(600); });
  await step(page, 1);
  expect(await music(page)).toBe('bat');
  await page.evaluate(() => window.__dp.placePlayerAir(330, 100, 0));
  let s;
  for (let i = 0; i < 200; i++) {
    s = await step(page, 1);
    if (s.state === 'dying') break;
  }
  expect(s.state).toBe('dying');
  expect(await music(page)).toBe(null);

  // 再開後、持ったままガールに触れてクリア
  for (let i = 0; i < 300 && s.state !== 'playing'; i++) s = await step(page, 1);
  await page.evaluate(() => { window.__dp.setBossEnabled(false); window.__dp.clearHazards(); window.__dp.placePlayer('top', 240); window.__dp.setBat(600); });
  await step(page, 1);
  expect(await music(page)).toBe('bat');
  await page.evaluate(() => window.__dp.placePlayer('top', 205));
  s = await step(page, 2);
  expect(s.state).toBe('escape'); // クリア後の逃走演出に入った時点で止まる
  expect(await music(page)).toBe(null);
});

test('28. M キーで音を OFF にすると BGM も止まり、ON に戻すと使用時間内なら釘バットの BGM を再開する', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.setBat(300); });
  await step(page, 1);
  expect(await music(page)).toBe('bat');

  await page.keyboard.press('m');
  await step(page, 1);
  expect(await music(page)).toBe(null);
  await step(page, 30);
  expect(await music(page)).toBe(null); // OFF の間は流れない

  await page.keyboard.press('m');
  let s = await step(page, 1);
  expect(s.player.bat).toBeGreaterThan(0);
  expect(await music(page)).toBe('bat');

  // OFF のまま時間切れになったら、ON に戻すと釘バットではなく通常の BGM が流れる
  await page.keyboard.press('m');
  await step(page, 1);
  s = await step(page, 300);
  expect(s.player.bat).toBe(0);
  expect(await music(page)).toBe(null);
  await page.keyboard.press('m');
  await step(page, 1);
  expect(await music(page)).toBe('main');
});

test('29. 破壊音「ビュイ～ン」は得点表示と同じステップで鳴り、その間 BGM の音量を下げる(BGM は止めない)', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.placePlayer('g0', 200); dp.setFacing(1); dp.setBat(600);
    dp.spawnHazard('bottle', 'g0', 300);
  });
  let s = await step(page, 1);
  expect(await music(page)).toBe('bat');
  expect(await page.evaluate(() => window.__dp.musicDucked())).toBe(false);
  await page.evaluate(() => window.__dp.clearSounds());

  const before = s.score;
  for (let i = 0; i < 150; i++) {
    s = await step(page, 1);
    if (s.score !== before) break;
  }
  // 得点・得点表示・破壊音が同じステップで出る
  expect(s.score).toBe(before + 300);
  expect(s.popups).toContain('300');
  expect(await page.evaluate(() => window.__dp.sounds())).toEqual(['smash']);
  // BGM は流れたまま、破壊音の間だけ下げている
  expect(await music(page)).toBe('bat');
  expect(await page.evaluate(() => window.__dp.musicDucked())).toBe(true);
  // 0.5 秒(+ 余裕)たつと元に戻る
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__dp.musicDucked())).toBe(false);
  expect(await music(page)).toBe('bat');
});

// ---- 途中で切れているハシゴ ----

const brokenLadders = async (page) => (await page.evaluate(() => window.__dp.level())).ladders.filter((l) => l.broken);

test('30. 切れたハシゴが配置され、正規のハシゴだけで最下段からゴールまで行ける', async ({ page }) => {
  await startGame(page);
  const lv = await page.evaluate(() => window.__dp.level());
  const broken = lv.ladders.filter((l) => l.broken);
  expect(broken.length).toBe(4);
  for (const l of broken) {
    // 登れる上端は上の段の上面 + 52px(モヒカンの先まで上の段に届かない)。切れ端との間にすき間がある
    expect(l.climbTopY).toBeCloseTo(l.topY + 52, 5);
    expect(l.stubBottomY).toBeLessThan(l.climbTopY - 6);
    expect(l.climbTopY).toBeLessThan(l.bottomY - 12); // 途中までは登れる長さがある
  }
  // 正規のハシゴだけをたどって g0 から top まで行けること(幅優先探索)
  const seen = new Set(['g0']);
  const queue = ['g0'];
  while (queue.length) {
    const cur = queue.shift();
    for (const l of lv.ladders) {
      if (!l.broken && l.lower === cur && !seen.has(l.upper)) { seen.add(l.upper); queue.push(l.upper); }
    }
  }
  expect(seen.has('top')).toBe(true);
});

test('31. 切れたハシゴは途中まで登れるが上の段には届かず、行き止まりから下へ降りられる', async ({ page }) => {
  await startGame(page);
  for (const l of await brokenLadders(page)) {
    await page.evaluate(([gid, x]) => window.__dp.placePlayer(gid, x), [l.lower, l.x]);
    // ずっと ↑ を押し続けても行き止まりで止まる
    let s = await hold(page, 'ArrowUp', 200);
    expect(s.player.state).toBe('ladder');
    expect(s.player.girder).toBe(null);
    expect(s.player.y).toBeCloseTo(l.climbTopY, 5);
    // 頭は上の段の下面(上面 + 厚み 8px)より下
    expect(s.player.head).toBeGreaterThan(l.topY + 8);
    // 下へ降りると下の段に立つ
    s = await climb(page, 'ArrowDown');
    expect(s.player.state).toBe('ground');
    expect(s.player.girder).toBe(l.lower);
    expect(s.player.y).toBeCloseTo(l.bottomY, 5);
  }
});

test('32. 切れたハシゴは上の段からつかまって降りられず、釘バット所持中は下からもつかまれない', async ({ page }) => {
  await startGame(page);
  const l = (await brokenLadders(page))[0];
  await page.evaluate(([gid, x]) => window.__dp.placePlayer(gid, x), [l.upper, l.x]);
  let s = await hold(page, 'ArrowDown', 30);
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe(l.upper);

  await page.evaluate(([gid, x]) => { window.__dp.placePlayer(gid, x); window.__dp.setBat(600); }, [l.lower, l.x]);
  s = await hold(page, 'ArrowUp', 30);
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe(l.lower);
});

test('33. 障害物は切れたハシゴも降りられるが、行き止まりで待っていれば降りずに頭上を通過する', async ({ page }) => {
  const start = await startGame(page);
  // g0→g1 の切れたハシゴ(x=250)。g1 は右へ転がる
  const l = (await brokenLadders(page)).find((x) => x.lower === 'g0');
  const run = (onLadder) => page.evaluate(([lad, onL]) => {
    const dp = window.__dp;
    dp.clearHazards();
    dp.setLadderChance(1);
    if (onL) dp.placePlayerLadder(lad.index, lad.climbTopY);
    else dp.placePlayer('g0', 420);
    const id = dp.spawnHazard('bottle', 'g1', lad.x - 50);
    const states = [];
    let s;
    for (let i = 0; i < 300; i++) {
      s = dp.step(1);
      const h = s.hazards.find((x) => x.id === id);
      if (!h || s.state !== 'playing') break;
      if (states[states.length - 1] !== h.state + ':' + h.girder) states.push(h.state + ':' + h.girder);
      if (h.girder === 'g0' || (h.girder === 'g1' && h.x > lad.x + 40)) break;
    }
    dp.setLadderChance(null);
    return { states, s };
  }, [l, onLadder]);

  // 誰もいなければ、すき間を通って下の段まで降りる
  let r = await run(false);
  expect(r.states).toContain('ladder:null');
  expect(r.states[r.states.length - 1]).toBe('roll:g0');

  // 行き止まりで待っていると、降りずに通過する(頭は当たらない高さ)
  r = await run(true);
  expect(r.states).toEqual(['roll:g1']);
  expect(r.s.state).toBe('playing');
  expect(r.s.lives).toBe(start.lives);
  expect(r.s.player.ladder).toBe(l.index);
});

// ---- 画面上部の逃走用ハシゴと、クリア後の逃走演出 ----

// 最上段でガールに触れてクリアする(逃走演出が始まったところで返す)
async function touchGirl(page) {
  await page.evaluate(() => { window.__dp.placePlayer('top', 240); });
  await step(page, 1);
  await page.evaluate(() => window.__dp.placePlayer('top', 205));
  const s = await step(page, 1);
  expect(s.state).toBe('escape');
  return s;
}

test('34. ゴリラ警官とガールの間に、画面最上部まで続く 2 本のハシゴが最初から表示され、プレイヤーは登れない', async ({ page }) => {
  const s = await startGame(page);
  const lv = await page.evaluate(() => window.__dp.level());
  expect(lv.escapeLadders).toEqual([120, 152]);
  for (const x of lv.escapeLadders) {
    expect(x).toBeGreaterThan(s.boss.x);
    expect(x).toBeLessThan(s.heroine.x);
    expect(lv.ladders.some((l) => l.x === x)).toBe(false); // 通常のハシゴには入っていない
  }
  // ゴリラ・ガールの位置は今までどおり
  expect(s.boss.x).toBe(56);
  expect(s.heroine.x).toBe(210);

  // 画面に描かれている(支柱の色を、最上部と g5 のすぐ上で調べる)
  await page.waitForTimeout(100); // 描画は requestAnimationFrame なので 1 コマ待つ
  const colors = await page.evaluate((xs) => {
    const ctx = document.getElementById('game').getContext('2d');
    const out = [];
    for (const x of xs) for (const y of [2, 130]) {
      const d = ctx.getImageData(x - 7, y, 1, 1).data;
      out.push([d[0], d[1], d[2]]);
    }
    return out;
  }, lv.escapeLadders);
  for (const c of colors) expect(c).toEqual([60, 216, 255]); // #3cd8ff

  // プレイヤーは g5 から登れない
  for (const x of lv.escapeLadders) {
    await page.evaluate((px) => window.__dp.placePlayer('g5', px), x);
    const r = await hold(page, 'ArrowUp', 30);
    expect(r.player.state).toBe('ground');
    expect(r.player.girder).toBe('g5');
  }
});

test('35. クリアするとゴリラ警官がガールのところへ歩き、担いで 2 本のハシゴを登って消え、クリア表示へ移る', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { window.__dp.setBat(600); window.__dp.spawnHazard('can', 'g0', 300); });
  await step(page, 1);
  expect(await music(page)).toBe('bat');
  await page.evaluate(() => window.__dp.clearSounds());
  let s = await touchGirl(page);
  // 通常プレイの音・障害物・釘バットは止まる
  expect(s.hazards).toEqual([]);
  expect(s.player.bat).toBe(0);
  expect(await music(page)).toBe(null);

  const phases = [];
  const startX = s.escape.bossX;
  let walkMaxX = startX;
  let carryOk = true;
  let climb = { frames: new Set(), xs: new Set(), firstY: null, lastY: null };
  for (let i = 0; i < 900 && s.state === 'escape'; i++) {
    s = await step(page, 1);
    if (s.state !== 'escape') break;
    const e = s.escape;
    if (phases[phases.length - 1] !== e.phase) phases.push(e.phase);
    if (e.phase === 'walk') walkMaxX = Math.max(walkMaxX, e.bossX);
    // 担いでいる間、ガールはゴリラの頭の上(肩の上)にいる
    if (['struggle', 'carry', 'climb'].includes(e.phase)) {
      if (!e.carrying || Math.abs(e.girlX - e.bossX) > 24 || e.girlY > e.bossY - 40) carryOk = false;
    }
    if (e.phase === 'climb') {
      climb.frames.add(e.walkFrame);
      climb.xs.add(e.bossX);
      if (climb.firstY === null) climb.firstY = e.bossY;
      climb.lastY = e.bossY;
    }
    // 演出中は死なない
    expect(s.player.state).not.toBe('dead');
  }
  // 段階が順番どおり
  expect(phases).toEqual(['walk', 'reach', 'lift', 'struggle', 'carry', 'climb', 'done'].filter((p) => p !== 'done'));
  // ガールの方へ歩いた
  expect(walkMaxX).toBeGreaterThan(startX + 80);
  expect(carryOk).toBe(true);
  // 2 本のハシゴの真ん中で、手を交互に動かして登った
  expect([...climb.xs]).toEqual([136]);
  expect([...climb.frames].sort()).toEqual([0, 1]);
  expect(climb.firstY).toBeGreaterThan(140);
  expect(climb.lastY).toBeLessThan(0); // 画面の上へ消えた

  // 演出が終わるとクリア表示。2 人はもういない
  expect(s.state).toBe('clear');
  expect(s.message).toBe('Oi! Oi! Oi!');
  expect(s.boss.gone).toBe(true);
  expect(s.heroine.gone).toBe(true);
  const sounds = await page.evaluate(() => window.__dp.sounds());
  expect(sounds).toContain('bossStep');
  expect(sounds).toContain('scream');
  expect(sounds[sounds.length - 1]).toBe('clear');

  // ENTER で次の面(2 面)に進むと、2 人とも元の位置(2 面でも同じ位置)に戻る
  s = await leaveClear(page); // クリア表示は自動で次へ(ENTER なし)
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  expect(s.boss.gone).toBe(false);
  expect(s.heroine.gone).toBe(false);
  expect(s.boss.x).toBe(56);
});

test('36. 逃走演出中はプレイヤーの操作を受け付けず、障害物も動かず、当たってもミスにならない', async ({ page }) => {
  await startGame(page);
  let s = await touchGirl(page);
  const p0 = s.player;
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.setBossEnabled(true);
    // あえてプレイヤーと重なる位置に缶を置く
    dp.spawnHazard('can', 'top', dp.snapshot().player.x);
  });
  const h0 = (await snap(page)).hazards[0];
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    s = await hold(page, key, 15);
  }
  await page.keyboard.press('Space');
  s = await step(page, 30);
  expect(s.state).toBe('escape');
  expect(s.player.x).toBe(p0.x);
  expect(s.player.y).toBe(p0.y);
  expect(s.player.state).toBe('ground');
  expect(s.hazards.length).toBe(1); // ゴリラが新しく投げることもない
  expect(s.hazards[0].x).toBe(h0.x);
  expect(s.hazards[0].y).toBe(h0.y);
  expect(s.lives).toBe(3);
});

// ---- 逃走演出の音と、開発用ショートカット ----

// Web Audio で実際に作られた発振器・音源の数を数えるため、ページを開く前に差し込む
async function countAudioNodes(page) {
  await page.addInitScript(() => {
    window.__audioNodes = 0;
    for (const m of ['createOscillator', 'createBufferSource']) {
      const orig = BaseAudioContext.prototype[m];
      BaseAudioContext.prototype[m] = function () { window.__audioNodes++; return orig.call(this); };
    }
  });
}
const audioNodes = (page) => page.evaluate(() => window.__audioNodes);

// ?test&dev で開いてプレイ中まで進める(開発用ショートカットが使える)
async function startDevGame(page) {
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.setSeed(1); });
  await page.keyboard.press('Enter');
  await step(page, 1);
  await page.evaluate(() => window.__dp.setBossEnabled(false));
  await step(page, 100);
}

// 逃走演出を最後まで進めながら、段階ごとに「鳴らした音」と「作られた音の部品の数」を集める
async function runEscape(page) {
  const byPhase = {};
  let s = await snap(page);
  for (let i = 0; i < 900 && s.state === 'escape'; i++) {
    const before = (await page.evaluate(() => window.__dp.sounds())).length;
    const nodes0 = await audioNodes(page);
    s = await step(page, 1);
    const ph = s.state === 'escape' ? s.escape.phase : s.state;
    const added = (await page.evaluate(() => window.__dp.sounds())).slice(before);
    const b = (byPhase[ph] = byPhase[ph] || { sounds: [], nodes: 0 });
    b.sounds.push(...added);
    b.nodes += (await audioNodes(page)) - nodes0;
  }
  return { byPhase, s };
}

test('37. 逃走演出中は足音・悲鳴・登る音を鳴らし、終わるとクリアジングル(Web Audio の音も実際に作られる)', async ({ page }) => {
  await countAudioNodes(page);
  await startDevGame(page);
  await page.evaluate(() => window.__dp.setBat(600));
  await step(page, 1);
  expect(await music(page)).toBe('bat');
  await page.evaluate(() => window.__dp.clearSounds());

  await page.keyboard.press('c'); // 開発用ショートカットでクリア演出を開始
  let s = await snap(page);
  expect(s.state).toBe('escape');
  expect(await music(page)).toBe(null); // 釘バットの BGM は止まる

  const { byPhase } = await runEscape(page);
  const steps = (list) => list.filter((n) => n === 'bossStep' || n === 'bossStep2');
  // 歩くとき・足踏み・担いで歩くときにドスン(左右の足で 2 種類)
  expect(steps(byPhase.walk.sounds).length).toBeGreaterThan(5);
  expect(new Set(steps(byPhase.walk.sounds)).size).toBe(2);
  expect(steps(byPhase.struggle.sounds).length).toBeGreaterThan(2);
  expect(steps(byPhase.carry.sounds).length).toBeGreaterThan(0);
  // 抱き上げるときに悲鳴(1 回だけ)
  expect(byPhase.lift.sounds).toEqual(['scream']);
  // 登るときに上昇音を何度も
  expect(byPhase.climb.sounds.filter((n) => n === 'climb').length).toBeGreaterThan(8);
  // 終わったらクリアジングル
  expect(byPhase.clear.sounds).toEqual(['clear']);
  // どの段階でも、実際に Web Audio の音(発振器・音源)が作られている
  for (const ph of ['walk', 'lift', 'struggle', 'carry', 'climb', 'clear']) {
    expect(byPhase[ph].nodes, ph + ' で音が作られていない').toBeGreaterThan(0);
  }
});

test('38. M キーで音を OFF にしていると、逃走演出中もクリアジングルも鳴らない', async ({ page }) => {
  await countAudioNodes(page);
  await startDevGame(page);
  await page.keyboard.press('m');
  await step(page, 1);
  expect(await page.evaluate(() => window.__dp.soundEnabled())).toBe(false);
  await page.evaluate(() => window.__dp.clearSounds());
  const nodes0 = await audioNodes(page);

  await page.keyboard.press('c');
  const { s } = await runEscape(page);
  expect(s.state).toBe('clear');
  expect(await page.evaluate(() => window.__dp.sounds())).toEqual([]);
  expect(await audioNodes(page)).toBe(nodes0); // 音の部品が 1 つも作られていない
});

test('39. 開発用ショートカット(C キー)は ?dev を付けた開発環境だけで有効で、公開先では無効', async ({ page }) => {
  // ?dev なし: C キーを押しても何も起きない
  await startGame(page);
  await page.keyboard.press('c');
  let s = await step(page, 1);
  expect(s.state).toBe('playing');

  // ?dev あり(127.0.0.1 = 開発環境): C キーでクリア演出が始まり、クリアの得点も入る
  await startDevGame(page);
  const before = (await snap(page)).score;
  // タイトル・READY 中は効かない(プレイ中だけ)
  await page.keyboard.press('c');
  s = await snap(page);
  expect(s.state).toBe('escape');
  expect(s.score).toBeGreaterThan(before);

  // 判定のしくみ: 公開先(GitHub Pages など)では ?dev を付けても無効
  const results = await page.evaluate(() => {
    const f = window.DP.devTools.isDevEnvironment;
    return {
      local: f({ protocol: 'http:', hostname: '127.0.0.1', search: '?dev' }),
      localhost: f({ protocol: 'http:', hostname: 'localhost', search: '?test&dev' }),
      file: f({ protocol: 'file:', hostname: '', search: '?dev' }),
      localNoDev: f({ protocol: 'http:', hostname: 'localhost', search: '' }),
      pages: f({ protocol: 'https:', hostname: 'example.github.io', search: '?dev' }),
      other: f({ protocol: 'https:', hostname: 'example.com', search: '?dev' }),
    };
  });
  expect(results).toEqual({ local: true, localhost: true, file: true, localNoDev: false, pages: false, other: false });
});

test('40. 開発用ショートカットはタイトル画面や READY 中には効かない', async ({ page }) => {
  await page.goto('./?test&dev');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(() => window.__dp.setManual(true));
  await page.keyboard.press('c');
  let s = await step(page, 1);
  expect(s.state).toBe('title');
  await page.keyboard.press('Enter');
  s = await step(page, 1);
  s = await passIntermission(page); // 1〜3 面のあとは面間演出を見てから次の面
  expect(s.state).toBe('ready');
  await page.keyboard.press('c');
  s = await step(page, 1);
  expect(s.state).toBe('ready');
});

// ---- 主人公のモヒカン(描画)と当たり判定 ----

test('41. モヒカンは額から頭頂部・後頭部・首筋まで続く大きな扇形で、当たり判定とは別の大きさ', async ({ page }) => {
  await startGame(page);
  const info = await page.evaluate(() => {
    const D = window.DP.sprites.DATA;
    const rows = D.punkStand.rows;
    const isHair = (c) => c === 'R' || c === 'r';
    const faceTop = rows.findIndex((r) => /S/.test(r)); // 顔のいちばん上の行
    // 顔の範囲(肌 S の左端・右端)。右向きなので右が額側、左が後頭部側
    const faceRows = rows.slice(faceTop, faceTop + 4);
    const faceLeft = Math.min(...faceRows.map((r) => r.indexOf('S')));
    const faceRight = Math.max(...faceRows.map((r) => r.lastIndexOf('S')));
    const hairAt = (rowFrom, rowTo, test) => {
      let n = 0;
      for (let y = rowFrom; y < rowTo; y++) for (let x = 0; x < rows[y].length; x++) if (isHair(rows[y][x]) && test(x)) n++;
      return n;
    };
    const firstHairRow = rows.findIndex((r) => /[Rr]/.test(r));
    return {
      w: D.punkStand.w,
      mohawkRows: faceTop - firstHairRow, // 顔より上の毛の行数
      top: rows[0],
      // 額より前(顔の右端より右)へ張り出した毛
      front: hairAt(0, faceTop, (x) => x > faceRight),
      // 頭頂部(顔の幅の真上)
      crown: hairAt(0, faceTop, (x) => x >= faceLeft && x <= faceRight),
      // 後頭部・首筋(顔の行で、顔より左 = 後ろ)
      back: hairAt(faceTop, faceTop + 4, (x) => x < faceLeft),
      // いちばん下の毛の行(首の付け根まで届いているか)
      lowestHairRow: rows.reduce((m, r, i) => (/[Rr]/.test(r) ? i : m), -1),
      faceTop,
      sameHeadAll: ['punkWalk', 'punkJump'].every((n) => D[n].rows.slice(0, faceTop + 4).join() === rows.slice(0, faceTop + 4).join()),
      climbRows: D.punkClimb.rows.findIndex((r) => /S/.test(r)),
      spriteH: D.punkStand.h * window.DP.config.PIXEL,
      hitH: window.DP.config.player.height,
    };
  });
  // 以前の 3 行より 2 倍以上の高さ
  expect(info.mohawkRows).toBeGreaterThanOrEqual(6);
  // 頭頂部だけでなく、額の前・後頭部・首筋にも毛がある(扇形の前半と後半)
  expect(info.crown).toBeGreaterThan(20);
  expect(info.front).toBeGreaterThan(5);
  expect(info.back).toBeGreaterThan(15);
  expect(info.lowestHairRow).toBe(info.faceTop + 3); // 首の付け根(顔のいちばん下の行)まで続く
  // 毛先がギザギザ: いちばん上の行は途切れ途切れ
  expect(info.top.replace(/^\.+|\.+$/g, '')).toMatch(/R\.+R/);
  // 歩き・ジャンプも同じ頭。ハシゴ用(背中向き)も同じ高さのトサカ
  expect(info.sameHeadAll).toBe(true);
  expect(info.climbRows).toBe(info.faceTop);
  // 描画サイズ(40px)と当たり判定(26px)は別
  expect(info.spriteH).toBe(SPRITE_HEIGHT);
  expect(info.hitH).toBe(DP_HEIGHT);
  expect(info.w).toBe(20); // 後頭部へ広げるため 20 ドット幅
});

test('42. 右向き・左向きのモヒカンが、左右反転した形で描かれる', async ({ page }) => {
  await startGame(page);
  // 画面のドットを読んで、頭の上(当たり判定より上の 12px)の赤いドットの位置を集める
  const redDots = async (facing) => {
    await page.evaluate((f) => { window.__dp.placePlayer('g0', 200); window.__dp.setFacing(f); }, facing);
    const s = await step(page, 1);
    await page.waitForTimeout(100); // 描画は requestAnimationFrame
    return page.evaluate((p) => {
      const ctx = document.getElementById('game').getContext('2d');
      const x0 = Math.round(p.x) - 20;
      const y0 = Math.round(p.y + 1) - 40; // ドット絵の上端(絵全体 40x40 を読む)
      const img = ctx.getImageData(x0, y0, 40, 40).data;
      const dots = [];
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
        const i = (y * 40 + x) * 4;
        const [r, g, b] = [img[i], img[i + 1], img[i + 2]];
        if ((r === 255 && g === 42 && b === 42) || (r === 168 && g === 20 && b === 20)) dots.push(x + ',' + y);
      }
      return dots;
    }, s.player);
  };
  const right = await redDots(1);
  const left = await redDots(-1);
  expect(right.length).toBeGreaterThan(300); // 大きな扇形(2x2 のドットがたくさん)
  expect(left.length).toBe(right.length);
  // 左向きは右向きをちょうど左右反転した形
  const mirrored = right.map((d) => { const [x, y] = d.split(',').map(Number); return (39 - x) + ',' + y; }).sort();
  expect(left.slice().sort()).toEqual(mirrored);
});

test('43. ハシゴの安全地帯では、モヒカンだけにビールが触れてもミスにならず、胴体に当たるとミス', async ({ page }) => {
  const start = await startGame(page);
  const lv = await page.evaluate(() => window.__dp.level());
  const l = lv.ladders[0]; // g0→g1, x=110。g1 は右へ転がる
  const run = (below) => page.evaluate(([lad, b]) => {
    const dp = window.__dp;
    dp.clearHazards();
    dp.placePlayerLadder(lad.index, lad.topY + b);
    const id = dp.spawnHazard('bottle', 'g1', lad.x - 40);
    let s, touchedMohawk = false;
    for (let i = 0; i < 120; i++) {
      s = dp.step(1);
      const h = s.hazards.find((x) => x.id === id);
      if (s.state !== 'playing' || !h) break;
      // ビール瓶(高さ 9px)とモヒカン(当たり判定の上 14px)が重なっているか
      const p = s.player;
      const mohawkTop = p.head - 14;
      if (Math.abs(h.x - p.x) * 2 < 18 + 24 && h.y > mohawkTop && h.y - 9 < p.head) touchedMohawk = true;
      if (h.x > lad.x + 40) break;
    }
    return { s, touchedMohawk };
  }, [l, below]);

  // 頭(当たり判定の上端)が上の段の上面より 1px 下: モヒカンは上の段の上へ突き出し、ビールが触れる
  let r = await run(DP_HEIGHT + 1);
  expect(r.touchedMohawk).toBe(true);
  expect(r.s.state).toBe('playing');
  expect(r.s.lives).toBe(start.lives);

  // 胴体(当たり判定)が上の段の上へ出ていると当たってミス
  r = await run(DP_HEIGHT - 4);
  expect(r.s.state).toBe('dying');
  expect(r.s.deathReason).toBe('hazard');
});

test('44. 鉄骨の上でも、胴体に転がってきたビールが当たればミス(当たり判定は従来どおり)', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => { window.__dp.placePlayer('g0', 200); window.__dp.spawnHazard('can', 'g0', 240); });
  let s;
  for (let i = 0; i < 80; i++) {
    s = await step(page, 1);
    if (s.state !== 'playing') break;
  }
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
});

test('45. 落下のミスはジャンプの最高点ではなく踏み切った高さから測る: 1 面の段の間(52px 以上)は、どの段の端から外へ跳んで降りても今までどおり落下のミス。その場で跳ぶのは平気', async ({ page }) => {
  // [足場, 立つ位置(端の少し内側), 跳ぶ向き]。どれも外へ跳ぶと 1 つ下の段へ 52〜64px 落ちる(いちばん差が小さいのは g5 の右端 → g4)
  const EDGES = [['g5', 444, 'ArrowRight'], ['g4', 36, 'ArrowLeft'], ['g3', 444, 'ArrowRight'], ['g2', 36, 'ArrowLeft'], ['g1', 444, 'ArrowRight']];
  for (const [id, x, key] of EDGES) {
    await startGame(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [id, x]);
    // 本物のキーボードで外へ向かって跳ぶ
    await page.keyboard.down(key);
    await page.keyboard.press('Space');
    let s = await step(page, 1);
    await page.keyboard.up(key);
    let landedOn = null;
    for (let i = 0; i < 200 && s.state === 'playing'; i++) {
      s = await step(page, 1);
      if (s.player.state === 'ground') landedOn = s.player.girder;
    }
    expect(s.state, `${id} から ${key} へ跳んで降りる`).toBe('dying');
    expect(s.deathReason).toBe('fall');
    expect(landedOn, `${id} の 1 つ下の段に着地してミスになる`).not.toBe(id);
  }
  // その場で真上に跳んで同じ段に戻るのはミスにならない(着地点は踏み切った高さと同じ)
  await startGame(page);
  await page.evaluate(() => window.__dp.placePlayer('g1', 200));
  await page.keyboard.press('Space');
  let s = await step(page, 1);
  for (let i = 0; i < 80; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('g1');
});
