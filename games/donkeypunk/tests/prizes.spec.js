// ドンキーパンク 4 面のボーナスアイテム(仕掛け 'prizes')のテスト
// ビール瓶 300 点(F1 の右端)・エロ本 500 点(F3 の左端)・札束 800 点(F4 の右端)。面の最初から置いてあり、歩いて触れるだけで取れる。
// 取ったアイテムはミス後も消えたまま(ピンと同じ引き継ぎ)、新しいゲーム・次の周回では戻る。ポリスマンやゴリラは取らない。
// 取れなくならないこと(ピンの抜け方 256 通り)は tests/stage4.spec.js の R30
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage, walkTo, climb, leaveClear, passIntermission } = require('./helpers');

watchConsoleErrors(test);

const STAGE4 = 3;
const prize = (s, id) => s.prizes.find((p) => p.id === id);

test('P1. 配置: 4 面に 3 個(ビール瓶 300 点・F1 x=450 / エロ本 500 点・F3 x=60 / 札束 800 点・F4 x=452)。どれも穴(ピンの x±12)の端から 20px 以上、ポリスマンの出現地点から 40px 以上離れている。1・2 面にはない(3 面には別の種類が 6 個)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const s = await snap(page);
  expect(s.prizes.map((p) => [p.id, p.type, p.girder, p.x, p.score, p.taken])).toEqual([
    ['beer', 'beer', 'F1', 450, 300, false],
    ['hbook', 'hbook', 'F3', 60, 500, false],
    ['cash', 'cash', 'F4', 452, 800, false],
  ]);
  const st = await page.evaluate(() => window.DP.stages[3]);
  for (const p of st.prizes) {
    for (const pin of st.pins.filter((q) => q.girder === p.girder)) expect(Math.abs(p.x - pin.x) - 12, `${p.id} と ${pin.id}`).toBeGreaterThanOrEqual(20);
    for (const sp of st.cops.spawns.filter((q) => q.girder === p.girder)) expect(Math.abs(p.x - sp.x), `${p.id} と出現地点`).toBeGreaterThanOrEqual(40);
  }
  // 1・2 面にはない(3 面にも同じ仕掛けで 6 個ある。tests/stage3prizes.spec.js で確かめる。4 面の 3 個とは種類が違う)
  for (const i of [0, 1]) {
    await startAtStage(page, i);
    expect((await snap(page)).prizes, `${i + 1} 面`).toEqual([]);
  }
  await startAtStage(page, 2);
  const p3 = (await snap(page)).prizes;
  expect(p3).toHaveLength(6);
  expect(p3.some((p) => ['beer', 'hbook', 'cash'].includes(p.type))).toBe(false);
});

test('P2. 本物のキーボード操作: スタートからハシゴを登って F1 の右端まで歩くとビール瓶を取れる(300 点・得点表示「300」・効果音 prize・アイテムが消える)。もう一度通っても得点は増えない', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  await page.evaluate(() => window.__dp.clearSounds());
  let s = await walkTo(page, 432); // 地面 → F1 のハシゴ(x=432)
  s = await climb(page, 'ArrowUp');
  expect(s.player.girder).toBe('F1');
  const before = s.score;
  s = await walkTo(page, 462);
  expect(prize(s, 'beer').taken).toBe(true);
  expect(s.score - before).toBe(300);
  expect(s.popups).toContain('300');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('prize');
  // 引き返してもう一度通っても増えない
  s = await walkTo(page, 430);
  s = await walkTo(page, 462);
  expect(s.score - before).toBe(300);
});

test('P3. エロ本(500 点)と札束(800 点)も歩いて触れるだけで取れる(ジャンプしなくてよい)。3 つで合計 1600 点', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const s0 = await snap(page);
  await page.evaluate(() => window.__dp.placePlayer('F3', 88)); // ピン p5(x 92〜116)の外から歩く
  let s = await walkTo(page, 52);
  expect(prize(s, 'hbook').taken).toBe(true);
  expect(s.score - s0.score).toBe(500);
  expect(s.popups).toContain('500');
  await page.evaluate(() => window.__dp.placePlayer('F4', 410));
  s = await walkTo(page, 460);
  expect(prize(s, 'cash').taken).toBe(true);
  expect(s.score - s0.score).toBe(1300);
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  s = await walkTo(page, 460);
  expect(s.score - s0.score).toBe(1600);
  expect(s.prizes.every((p) => p.taken)).toBe(true);
  expect(s.player.state).toBe('ground'); // ずっと歩いていただけ
});

test('P4. 主人公以外は取らない: 怒ったポリスマンがアイテムの上を何度通っても、アイテムは残り得点も増えない', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.evaluate(() => {
    const dp = window.__dp;
    dp.placePlayer('top', 280);
    dp.spawnCop('F1', 440, { skipSpawn: true, dir: 1 });
    dp.spawnCop('F3', 80, { skipSpawn: true, dir: -1 });
    dp.spawnCop('F4', 440, { skipSpawn: true, dir: 1 });
  });
  const s0 = await snap(page);
  let s = await step(page, 600);
  expect(s.state).toBe('playing');
  expect(s.prizes.every((p) => !p.taken)).toBe(true);
  expect(s.score).toBe(s0.score);
});

test('P5. ミス後: 取ったアイテムは消えたまま(得点も二重に入らない)。取っていないアイテム、抜いたピンと穴は残る', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.evaluate(() => { window.__dp.pullPin('p2'); window.__dp.placePlayer('F1', 420); });
  let s = await walkTo(page, 460);
  expect(prize(s, 'beer').taken).toBe(true);
  const score = s.score;
  await page.evaluate(() => window.__dp.killPlayer('fall'));
  s = await snap(page);
  for (let i = 0; i < 600 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.prizes.map((p) => [p.id, p.taken])).toEqual([['beer', true], ['hbook', false], ['cash', false]]);
  expect(s.score).toBe(score);
  expect(s.pins.find((p) => p.id === 'p2').pulled).toBe(true);
  // もう一度ビール瓶の場所へ行っても何も起きない
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  s = await walkTo(page, 460);
  expect(s.score).toBe(score);
  // 2 回ミスしても同じ
  await page.evaluate(() => window.__dp.killPlayer('fall'));
  s = await snap(page);
  for (let i = 0; i < 600 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(prize(s, 'beer').taken).toBe(true);
});

test('P6. 新しいゲーム(ゲームオーバーのあと)と、次の周回の 4 面では、3 つとも戻っている', async ({ page }) => {
  test.setTimeout(180000);
  // ゲームオーバー → 新しいゲーム
  await startAtStage(page, STAGE4);
  await page.evaluate(() => { window.__dp.placePlayer('F1', 420); });
  let s = await walkTo(page, 460);
  expect(prize(s, 'beer').taken).toBe(true);
  await page.evaluate(() => { window.__dp.setLives(1); window.__dp.killPlayer('fall'); });
  s = await snap(page);
  for (let i = 0; i < 600 && s.state !== 'gameover'; i++) s = await step(page, 1);
  expect(s.state).toBe('gameover');
  await page.evaluate(() => window.__dp.startStage(3));
  s = await step(page, 1);
  expect(s.prizes.every((p) => !p.taken)).toBe(true);
  // 1 つ取ってから 4 面をクリア → 1〜3 面を進めて次の周回の 4 面
  await startAtStage(page, STAGE4, { url: './?test&dev' });
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  s = await walkTo(page, 460);
  expect(prize(s, 'beer').taken).toBe(true);
  await page.keyboard.press('KeyC');
  for (let i = 0; i < 3000 && s.state !== 'clear'; i++) s = await step(page, 1);
  s = await leaveClear(page);
  expect(s.round).toBe(2);
  for (let n = 0; n < 3; n++) {
    for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
    await page.keyboard.press('KeyC');
    for (let i = 0; i < 3000 && s.state !== 'clear'; i++) s = await step(page, 1);
    await leaveClear(page);
    s = await passIntermission(page);
  }
  expect(s.stageId).toBe('rivets');
  expect(s.round).toBe(2);
  expect(s.prizes.every((p) => !p.taken)).toBe(true);
});

test('P7. ピンをどの順番で抜いても、アイテムの位置・高さは変わらず床の上にある(床が分かれたら、乗っている床は x を含む方の鉄骨)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const r = await page.evaluate(() => {
    const dp = window.__dp;
    const before = dp.snapshot().prizes.map((p) => [p.id, p.x, p.y]);
    for (const id of ['p2', 'p5', 'p8', 'p1', 'p3', 'p4', 'p6', 'p7']) dp.pullPin(id);
    const s = dp.snapshot();
    return { before, after: s.prizes.map((p) => [p.id, p.x, p.y]), girders: s.prizes.map((p) => p.girder) };
  });
  expect(r.after).toEqual(r.before);
  expect(r.girders).toEqual(['F1@356', 'F3', 'F4@356']);
});

test('P8. クリア演出が始まると、取っていないアイテムは消える。演出の段階と ROUND CLEAR のボーナスは今までどおり(取ったアイテムの得点はそのまま残る)', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4, { url: './?test&dev' });
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  let s = await walkTo(page, 460);
  const score = s.score;
  expect(score).toBe(300);
  await page.keyboard.press('KeyC');
  s = await step(page, 1);
  expect(s.state).toBe('collapse');
  // 取ったビール瓶は「取った」のまま、取っていない 2 つは消える(描かれない)
  expect(s.prizes.map((p) => [p.id, p.taken, p.gone])).toEqual([['beer', true, false], ['hbook', false, true], ['cash', false, true]]);
  const phases = [];
  for (let i = 0; i < 2000 && s.state === 'collapse'; i++) {
    s = await step(page, 1);
    if (s.collapse && phases[phases.length - 1] !== s.collapse.phase) phases.push(s.collapse.phase);
  }
  expect(phases).toEqual(['clank', 'shake', 'crumble', 'gun', 'fall', 'impact', 'reunite', 'done']);
  expect(s.message).toBe('ROUND CLEAR');
  expect(s.score).toBe(score + s.clearBonus);
});

test('P9. ドット絵: エロ本はピンクの表紙にカタカナの白い文字「エロ」(大)と「本」と赤いビキニ、ビール瓶は立てた茶色の瓶(1 面の転がる緑の瓶とは別の絵)、札束はお札(濃い緑の縁取り・「¥」・肖像の丸)と紙の厚みの白い縞と赤い縁取りの白い帯封。どれも 2 倍で画面に描かれている', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const r = await page.evaluate(() => {
    const D = window.DP.sprites.DATA;
    const P = window.DP.sprites.PALETTE;
    const colors = (n) => [...new Set(D[n].rows.join('').replace(/\./g, ''))].map((c) => P[c]);
    // 白(W)のドットだけを '#' にした、指定範囲の形
    const mask = (n, x, y, w, h, ch) => D[n].rows.slice(y, y + h).map((r) => [...r.slice(x, x + w)].map((c) => (c === ch ? '#' : '.')).join(''));
    return {
      hbook: colors('hbook'), beer: colors('beerUp'), cash: colors('cash'), beerH: D.beerUp.h, beerW: D.beerUp.w, bottle0W: D.bottle0.w,
      e: mask('hbook', 3, 2, 5, 5, 'W'), ro: mask('hbook', 10, 2, 5, 5, 'W'), hon: mask('hbook', 2, 9, 7, 7, 'W'),
      yen: mask('cash', 2, 1, 5, 6, 'g'), band: D.cash.rows.map((r) => r.slice(7, 11)),
      stripes: [9, 10, 11].map((y) => D.cash.rows[y]), border: D.cash.rows[0],
    };
  });
  expect(r.hbook).toEqual(expect.arrayContaining(['#ff5aa6', '#ffffff', '#ff2a2a']));
  // 表紙の文字: カタカナの「エ」「ロ」(5×5)と、その下の「本」(7×7)。英字の「H」「BOOK」ではない
  expect(r.e).toEqual(['.###.', '..#..', '..#..', '..#..', '#####']);
  expect(r.ro).toEqual(['#####', '#...#', '#...#', '#...#', '#####']);
  expect(r.hon).toEqual(['...#...', '#######', '..###..', '.#.#.#.', '#..#..#', '.#####.', '...#...']);
  expect(r.beer).toEqual(expect.arrayContaining(['#8e5626', '#ffd23c']));
  expect(r.beer).not.toContain('#1f8a3a'); // 1 面の瓶の緑ではない
  expect(r.beerH).toBeGreaterThan(r.beerW); // 立てて置いている(縦長)
  expect(r.cash).toEqual(expect.arrayContaining(['#1f8a3a', '#ffffff', '#0e5222', '#f4bc94', '#a81414', '#e02a2a']));
  // 札束: 「¥」・上から下まで通る帯封(赤い縁取りの白)・紙の厚みの白い縞・濃い緑の縁取り
  expect(r.yen).toEqual(['#...#', '.#.#.', '#####', '..#..', '#####', '..#..']);
  r.band.forEach((b) => expect(b).toMatch(/^r[WC]{2}r$/));
  expect(r.stripes[0]).toMatch(/^mW{6}rWWrW{6}m$/);
  expect(r.stripes[1]).toMatch(/^mc{6}rWWrc{6}m$/);
  expect(r.stripes[2]).toMatch(/^mW{6}rWWrW{6}m$/);
  expect(r.border).toMatch(/^m{7}rWWrm{7}$/);
  // 画面: 各アイテムの場所に、その色のドットが描かれている
  await page.waitForTimeout(80);
  const px = await page.evaluate(() => {
    const s = window.__dp.snapshot();
    const ctx = document.querySelector('canvas').getContext('2d');
    const count = (p, hex) => {
      const d = ctx.getImageData(p.x - 20, p.y - 44, 40, 46).data;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) n++;
      return n;
    };
    const by = (id) => s.prizes.find((p) => p.id === id);
    return { hbook: count(by('hbook'), '#ff5aa6'), hbookWhite: count(by('hbook'), '#ffffff'), beer: count(by('beer'), '#8e5626'), cash: count(by('cash'), '#1f8a3a') };
  });
  expect(px.hbook).toBeGreaterThan(30);
  expect(px.beer).toBeGreaterThan(20);
  expect(px.cash).toBeGreaterThan(20);
  // エロ本は 2 倍で描く(1 ドット = 2×2px。1.5 倍のように線の太さがばらつかない)。白い文字(49 ドット)が 2×2px ずつ描かれている
  expect(px.hbookWhite).toBeGreaterThanOrEqual(4 * 49);
});
