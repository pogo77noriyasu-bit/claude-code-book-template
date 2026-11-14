// ドンキーパンクの DEV モード(js/dev-tools.js)のテスト: 周回・面の指定と無敵フラグ
// DEV モードは「localhost / 127.0.0.1 / ローカルファイル」かつ URL に ?dev のときだけ有効(テストは localhost で配信している)。
//   URL: ?dev&round=3&stage=4&inv=1 / キー: I = 無敵の切り替え・R = 周回の入力・1〜9 = 面を選んで開始・C = クリア
//   無敵中は敵・障害物・落下でミスにならない(画面の下へ落ちたら最後に立った足場へ戻る)。得点・アイテム・ピン・クリアは通常どおり。
//   DEV モードのあいだはハイスコアを保存しない
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, walkTo } = require('./helpers');

watchConsoleErrors(test);

const HISCORE_KEY = 'pachiDonkey.highScore';

// URL を開いて手動ステップにする(query は '?test&dev&round=3' のような文字列)
async function open(page, query) {
  await page.goto('./' + query);
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state);
  await page.evaluate(() => { window.__dp.setManual(true); window.__dp.setSeed(1); });
  return snap(page);
}

// テスト補助で面を始めて、プレイ中まで進める(ゴリラの投下・スカル・ポリスマン・鳥の自動の出現は止める)。DEV の無敵・周回はそのまま
async function begin(page, index, round) {
  await page.evaluate(([i, r]) => {
    const d = window.__dp;
    d.setSkullsEnabled(false); d.setCopsEnabled(false); d.setBirdsEnabled(false);
    d.startStage(i, r);
  }, [index, round || 1]);
  await step(page, 1);
  await page.evaluate(() => { window.__dp.setBossEnabled(false); window.__dp.setBirdsEnabled(false); });
  const s = await step(page, 100);
  expect(s.state).toBe('playing');
  return s;
}

// 主人公がミスしていない(プレイ中のまま・残機も減っていない)ことを確かめる
function expectAlive(s, lives, label) {
  expect(s.state, label).toBe('playing');
  expect(s.player.state, label).not.toBe('dead');
  expect(s.lives, label).toBe(lives);
}

// 右下の「INVINCIBLE」の文字(黄 #ffd23c か赤 #ff5a5a)のドット数
const invincibleLabelPixels = (page) => page.evaluate(() => {
  const ctx = document.querySelector('canvas').getContext('2d');
  const d = ctx.getImageData(380, 548, 96, 12).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const yellow = d[i] === 0xff && d[i + 1] === 0xd2 && d[i + 2] === 0x3c;
    const red = d[i] === 0xff && d[i + 1] === 0x5a && d[i + 2] === 0x5a;
    if (yellow || red) n++;
  }
  return n;
});

test('D1. URL で周回・面・無敵を指定できる(3 周目・4 面・無敵 1 / 100 周目・2 面・無敵 0)。省略した項目は 周回 1・面 1・無敵 0、範囲外や数字でない値は無視する', async ({ page }) => {
  let s = await open(page, '?test&dev&round=3&stage=4&inv=1');
  expect([s.stageIndex, s.round, s.dev.mode, s.dev.invincible, s.dev.round]).toEqual([3, 3, true, true, 3]);
  expect(s.state).toBe('ready'); // 開いてすぐその面の READY
  s = await step(page, 101);
  expect(s.state).toBe('playing');
  expect(s.round).toBe(3);

  s = await open(page, '?test&dev&round=100&stage=2&inv=0');
  expect([s.stageIndex, s.round, s.dev.invincible, s.dev.round]).toEqual([1, 100, false, 100]);

  // 省略: 何も書かなければ今までどおりタイトルから(周回 1・無敵 OFF)
  s = await open(page, '?test&dev');
  expect([s.state, s.dev.mode, s.dev.invincible, s.dev.round]).toEqual(['title', true, false, 1]);
  // 面だけ・周回だけ・無敵だけ
  s = await open(page, '?test&dev&stage=3');
  expect([s.stageIndex, s.round, s.dev.invincible]).toEqual([2, 1, false]);
  s = await open(page, '?test&dev&round=7');
  expect([s.stageIndex, s.round]).toEqual([0, 7]);
  s = await open(page, '?test&dev&inv=1');
  expect([s.state, s.dev.invincible]).toEqual(['title', true]);
  // 範囲外・数字でない値は無視(その項目は初期値。どれも正しくなければタイトルのまま)
  s = await open(page, '?test&dev&round=0&stage=9&inv=2');
  expect([s.state, s.dev.invincible, s.dev.round]).toEqual(['title', false, 1]);
  s = await open(page, '?test&dev&round=abc&stage=2.5&inv=yes');
  expect([s.state, s.dev.invincible, s.dev.round]).toEqual(['title', false, 1]);
  s = await open(page, '?test&dev&round=1000&stage=4');
  expect([s.stageIndex, s.round]).toEqual([3, 1]);
  // 読み取りのしくみ
  const r = await page.evaluate(() => {
    const f = (q) => window.DP.devTools.parseParams(q, 4);
    return [f('?dev&round=999&stage=1&inv=0'), f('?dev&round=-1&stage=0&inv=on'), f('?dev&round= 5 &stage=04')];
  });
  expect(r).toEqual([
    { round: 999, stage: 1, inv: false },
    { round: null, stage: null, inv: null },
    { round: 5, stage: 4, inv: null },
  ]);
});

test('D2. ?dev がない通常プレイでは絶対に有効にならない: URL に inv=1 などを書いても無視、I・R キーも効かない。DEV モードでなければ無敵の印が立っていてもミスになる', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error('通常プレイで入力欄が出た: ' + d.message()); });
  let s = await open(page, '?test&round=3&stage=4&inv=1');
  expect([s.state, s.stageIndex, s.round, s.dev.mode, s.dev.invincible]).toEqual(['title', 0, 1, false, false]);
  await page.keyboard.press('Enter');
  await step(page, 1);
  await page.evaluate(() => window.__dp.setBossEnabled(false));
  s = await step(page, 100);
  expect(s.state).toBe('playing');
  await page.keyboard.press('KeyI');
  await page.keyboard.press('KeyR');
  s = await step(page, 1);
  expect(s.dev.invincible).toBe(false);
  expect(s.round).toBe(1);
  expect(await invincibleLabelPixels(page)).toBe(0);
  // 二重の守り: 万一 devInvincible が立っても、DEV モードでなければミスになる
  await page.evaluate(() => { window.__dp.gameForRender().data.devInvincible = true; window.__dp.killPlayer('hazard'); });
  s = await step(page, 1);
  expect(s.state).toBe('dying');
  // 公開先(https の別のホスト。GitHub Pages)でも、?dev を付けたときだけ DEV モードになる(β版の公開後も調査・調整・動画撮影に使う)。
  // ?dev を付けなければ、公開先でもローカルでも通常プレイ
  const env = await page.evaluate(() => [
    window.DP.devTools.isDevEnvironment({ protocol: 'https:', hostname: 'example.github.io', search: '?dev&round=3&stage=4&inv=1' }),
    window.DP.devTools.isDevEnvironment({ protocol: 'https:', hostname: 'example.github.io', search: '' }),
    window.DP.devTools.isDevEnvironment({ protocol: 'https:', hostname: 'example.github.io', search: '?round=3&stage=4&inv=1' }),
  ]);
  expect(env).toEqual([true, false, false]);
});

test('D3. I キーで無敵を切り替える(初期値は OFF)。無敵中は右下に「INVINCIBLE」(黄と赤で点滅)、左下に今の周回と面', async ({ page }) => {
  await open(page, '?test&dev');
  let s = await begin(page, 0);
  expect(s.dev.invincible).toBe(false);
  await page.waitForTimeout(60);
  expect(await invincibleLabelPixels(page)).toBe(0);
  await page.keyboard.press('KeyI');
  s = await step(page, 1);
  expect(s.dev.invincible).toBe(true);
  await page.waitForTimeout(60);
  expect(await invincibleLabelPixels(page)).toBeGreaterThan(20);
  // 点滅しても消えはしない(15 ステップごとに色が変わる)
  await step(page, 15);
  await page.waitForTimeout(60);
  expect(await invincibleLabelPixels(page)).toBeGreaterThan(20);
  await page.keyboard.press('KeyI');
  s = await step(page, 1);
  expect(s.dev.invincible).toBe(false);
  await page.waitForTimeout(60);
  expect(await invincibleLabelPixels(page)).toBe(0);
});

test('D4. 無敵中は敵・障害物に触れてもミスにならない(1 面のビール瓶・缶とゴリラ / 2 面のスカルと爆音アンプ / 3 面の鉄球とパンクニワトリ / 4 面のポリスマン)。無敵 OFF なら同じことでミスになる', async ({ page }) => {
  test.setTimeout(120000);
  await open(page, '?test&dev&inv=1');
  const cases = [
    ['1 面のビール瓶', 0, (d) => { d.placePlayer('g0', 200); d.spawnHazard('bottle', 'g0', 200); }],
    ['1 面の缶', 0, (d) => { d.placePlayer('g0', 200); d.spawnHazard('can', 'g0', 200); }],
    ['1 面のゴリラ', 0, (d) => { const s = d.snapshot(); d.placePlayer(s.boss.girder, s.boss.x); }],
    ['2 面のスカル', 1, (d) => { d.placePlayer('mid', 240); d.spawnSkull('mid', 240, { skipSpawn: true }); }],
    ['2 面の爆音アンプ', 1, (d) => { const a = d.ampHitbox(); d.placePlayerAir(a.x, a.y - 10, 0); }],
    ['3 面の鉄球', 2, (d) => { const b = d.snapshot().wreckingBall; d.placePlayerAir(b.x, b.y + 12, 0); }],
    ['3 面のパンクニワトリ', 2, (d) => { d.placePlayer('f0', 200); d.spawnBird(3, 200); }],
    ['4 面のポリスマン', 3, (d) => { d.placePlayer('F2', 320); d.spawnCop('F2', 320, { skipSpawn: true }); }],
  ];
  for (const [label, stage, setup] of cases) {
    // 無敵 ON: ミスにならない
    let s = await begin(page, stage);
    expect(s.dev.invincible).toBe(true);
    const lives = s.lives;
    await page.evaluate(`(${setup.toString()})(window.__dp)`);
    s = await step(page, 20);
    expectAlive(s, lives, label + '(無敵 ON)');
    // 無敵 OFF: 同じことでミスになる
    await page.keyboard.press('KeyI');
    s = await begin(page, stage);
    expect(s.dev.invincible).toBe(false);
    await page.evaluate(`(${setup.toString()})(window.__dp)`);
    s = await step(page, 20);
    expect(s.state, label + '(無敵 OFF)').toBe('dying');
    await page.keyboard.press('KeyI'); // 次のために ON に戻す
    await step(page, 1);
  }
});

test('D5. 無敵中は落下でもミスにならない: 高い所から落ちても着地して立つ(4 面の穴)。下に足場がなく画面の下へ出たら、最後に立っていた足場へ戻る(3 面)。残機は減らない', async ({ page }) => {
  await open(page, '?test&dev&inv=1');
  // 4 面: ピンの穴に歩いて入る → 95px 下の地面に着地して立つ
  let s = await begin(page, 3);
  const lives = s.lives;
  await page.evaluate(() => { window.__dp.pullPin('p2'); window.__dp.placePlayer('F1', 310); });
  s = await walkTo(page, 344);
  s = await step(page, 60);
  expectAlive(s, lives, '4 面の穴');
  expect(s.player.state).toBe('ground');
  expect(s.player.y).toBe(540);
  // 3 面: 1 階に立ってから、右の足場 r1 の下(下に何もない)へ落ちる → 1 階の同じ場所に戻る
  s = await begin(page, 2);
  await page.evaluate(() => window.__dp.placePlayer('c1', 200));
  await step(page, 2);
  await page.evaluate(() => window.__dp.placePlayerAir(440, 470, 0));
  for (let i = 0; i < 200 && s.dev.recovered === 0; i++) s = await step(page, 1);
  expect(s.dev.recovered).toBe(1);
  expectAlive(s, lives, '3 面の穴');
  expect([s.player.state, s.player.girder, s.player.x, s.player.y]).toEqual(['ground', 'c1', 200, 430]);
  // 戻ったあとも普通に歩ける
  s = await walkTo(page, 230);
  expect(s.player.x).toBeGreaterThan(225);
  expect(s.player.girder).toBe('c1');
  // リフトの上では戻り先を覚えない(動く床に戻すと危ないので、その前に立っていた足場のまま)
  // (リフト B の床 x 352〜376 に乗せてから落とす)
  const lift = await page.evaluate(() => window.__dp.level().girders.find((q) => q.kind === 'lift' && q.x1 === 352));
  expect(lift).toBeTruthy();
  await page.evaluate((id) => window.__dp.placePlayer(id, 364), lift.id);
  s = await step(page, 2);
  expect(s.player.girder).toBe(lift.id);
  await page.evaluate(() => window.__dp.placePlayerAir(440, 470, 0));
  for (let i = 0; i < 200 && s.dev.recovered < 2; i++) s = await step(page, 1);
  expect(s.dev.recovered).toBe(2);
  expect(s.player.girder).toBe('c1');
  expect(s.lives).toBe(lives);
});

test('D6. 無敵中も、得点・安全ピン・ボーナスアイテム・釘バット(ポリスマンを倒す)・ステージクリアは通常どおり。ボーナスも減っていく', async ({ page }) => {
  test.setTimeout(120000);
  await open(page, '?test&dev&inv=1');
  let s = await begin(page, 3);
  // 安全ピン(歩いて通り抜けて 100 点)
  await page.evaluate(() => window.__dp.placePlayer('F1', 90));
  s = await walkTo(page, 150);
  expect(s.pins.find((p) => p.id === 'p1').pulled).toBe(true);
  expect(s.score).toBe(100);
  // ボーナスアイテム(ビール瓶 300 点)
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  s = await walkTo(page, 460);
  expect(s.prizes.find((p) => p.id === 'beer').taken).toBe(true);
  expect(s.score).toBe(400);
  // 釘バットを拾って、ポリスマンを倒す(500 点)
  await page.evaluate(() => window.__dp.placePlayer('F2', 320));
  await page.keyboard.press('Space');
  s = await step(page, 60);
  expect(s.player.bat).toBeGreaterThan(0);
  await page.evaluate(() => { window.__dp.setFacing(1); window.__dp.spawnCop('F2', 360, { dir: -1, skipSpawn: true }); });
  for (let i = 0; i < 120 && (await snap(page)).enemies.length; i++) await step(page, 1);
  s = await snap(page);
  expect(s.enemies.length).toBe(0);
  expect(s.score).toBe(900);
  // ポリスマンをジャンプで飛び越える(100 点)。無敵でも、当たったステップで飛び越えの得点が飛ばされない
  await page.evaluate(() => { window.__dp.setBat(0); window.__dp.placePlayer('F2', 300); window.__dp.setFacing(1); window.__dp.spawnCop('F2', 336, { dir: -1, skipSpawn: true }); });
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  await step(page, 3);
  await page.keyboard.up('ArrowRight');
  s = await step(page, 50);
  expect(s.score).toBe(1000);
  // ボーナスは時間とともに減る
  const bonus = s.bonus;
  s = await step(page, 200);
  expect(s.bonus).toBeLessThan(bonus);
  // クリア: 残りのピンを抜いて 8 本目を歩いて抜く → クリア演出 → ROUND CLEAR(クリアの得点が入る)
  await page.evaluate(() => { const d = window.__dp; d.clearEnemies(); for (const id of ['p2', 'p3', 'p4', 'p5', 'p7', 'p8']) d.pullPin(id); });
  await page.evaluate(() => {
    const d = window.__dp;
    const g = d.level().girders.find((q) => q.id.split('@')[0] === 'F3' && 307.5 >= q.x1 && 307.5 <= q.x2);
    d.placePlayer(g.id, 307.5);
  });
  await step(page, 1);
  const before = (await snap(page)).score;
  await page.keyboard.down('ArrowRight');
  s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('collapse');
  for (let i = 0; i < 2000 && s.state === 'collapse'; i++) s = await step(page, 1);
  expect(s.message).toBe('ROUND CLEAR');
  expect(s.score).toBe(before + 100 + s.clearBonus);
  // 1 面のクリア(ガールに触れて逃走演出)
  s = await begin(page, 0);
  const s0 = s;
  await page.evaluate(() => { const st = window.__dp.snapshot(); window.__dp.placePlayer('top', st.heroine.x + 30); });
  s = await walkTo(page, s0.heroine.x);
  expect(s.state).toBe('escape');
  expect(s.score).toBeGreaterThan(0);
});

test('D7. DEV モードのあいだはハイスコアを保存しない(画面の HI も変わらない)。DEV モードでなければ今までどおり保存する', async ({ page }) => {
  await page.goto('./?test');
  await page.evaluate((k) => localStorage.setItem(k, '100'), HISCORE_KEY);
  // DEV モード: 得点が 100 を超えても HI は 100 のまま、保存もされない
  await open(page, '?test&dev&inv=1');
  let s = await begin(page, 3);
  expect(s.hiScore).toBe(100);
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  s = await walkTo(page, 460); // ビール瓶 300 点
  expect(s.score).toBe(300);
  expect(s.hiScore).toBe(100);
  expect(await page.evaluate((k) => localStorage.getItem(k), HISCORE_KEY)).toBe('100');
  // 無敵 OFF の DEV モードでも保存しない
  await page.keyboard.press('KeyI');
  s = await begin(page, 3);
  expect(s.dev.invincible).toBe(false);
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  s = await walkTo(page, 460);
  expect(s.hiScore).toBe(100);
  expect(await page.evaluate((k) => localStorage.getItem(k), HISCORE_KEY)).toBe('100');
  // 通常プレイ(?dev なし): 今までどおり保存する
  await open(page, '?test');
  s = await begin(page, 3);
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  s = await walkTo(page, 460);
  expect(s.hiScore).toBe(300);
  expect(await page.evaluate((k) => localStorage.getItem(k), HISCORE_KEY)).toBe('300');
});

test('D8. R キーで周回数を入力すると、その周回で今の面から始め直す。1〜4 キーは今の DEV の周回で面を選ぶ(最初は 1 周目 = 今までどおり)。正しくない入力・キャンセルは無視。C キーも今までどおり', async ({ page }) => {
  await open(page, '?test&dev');
  // 1〜4 キー: 周回はまだ 1(今までどおり)
  await page.keyboard.press('Digit3');
  let s = await step(page, 1);
  expect([s.stageIndex, s.round]).toEqual([2, 1]);
  // R キー → 100 を入力 → 100 周目の 3 面
  page.once('dialog', (d) => d.accept('100'));
  await page.keyboard.press('KeyR');
  s = await step(page, 1);
  expect([s.stageIndex, s.round, s.dev.round, s.state]).toEqual([2, 100, 100, 'ready']);
  // 1〜4 キーは 100 周目のまま面を選ぶ
  await page.keyboard.press('Digit2');
  s = await step(page, 1);
  expect([s.stageIndex, s.round]).toEqual([1, 100]);
  await page.keyboard.press('Digit4');
  s = await step(page, 1);
  expect([s.stageIndex, s.round]).toEqual([3, 100]);
  // 正しくない入力(0・1000・文字)とキャンセルは無視(周回も面も変わらない)
  for (const answer of ['0', '1000', 'abc', null]) {
    page.once('dialog', (d) => (answer === null ? d.dismiss() : d.accept(answer)));
    await page.keyboard.press('KeyR');
    s = await step(page, 1);
    expect([s.stageIndex, s.round, s.dev.round], String(answer)).toEqual([3, 100, 100]);
  }
  // 3 周目に変えて 1 面
  page.once('dialog', (d) => d.accept('3'));
  await page.keyboard.press('KeyR');
  await page.keyboard.press('Digit1');
  s = await step(page, 1);
  expect([s.stageIndex, s.round]).toEqual([0, 3]);
  // C キー(プレイ中): 今までどおりクリア演出へ
  s = await step(page, 101);
  expect(s.state).toBe('playing');
  await page.keyboard.press('KeyC');
  s = await step(page, 1);
  expect(s.state).toBe('escape');
});

test('D9. 無敵の設定は、ミスのあと(の代わりの復帰)・面の切り替え・新しいゲーム・次の面へ進んでも続く。周回の指定も 1〜4 キーで続く', async ({ page }) => {
  await open(page, '?test&dev&round=3&stage=1&inv=1');
  let s = await step(page, 101);
  expect([s.round, s.dev.invincible]).toEqual([3, true]);
  // C キーでクリア → 逃走演出 → クリア表示 → 面間演出 → 2 面(3 周目のまま、無敵のまま)
  await page.keyboard.press('KeyC');
  for (let i = 0; i < 3000 && s.stageIndex === 0; i++) s = await step(page, 1);
  expect([s.stageIndex, s.round, s.dev.invincible]).toEqual([1, 3, true]);
  // 面を選び直しても続く
  await page.keyboard.press('Digit4');
  s = await step(page, 1);
  expect([s.stageIndex, s.round, s.dev.invincible]).toEqual([3, 3, true]);
  // ゲームオーバーにはならないので残機はずっと同じ
  s = await step(page, 101);
  const lives = s.lives;
  await page.evaluate(() => window.__dp.killPlayer('hazard'));
  s = await step(page, 5);
  expectAlive(s, lives, 'テスト補助の killPlayer でもミスにならない');
});
