// ドンキーパンク 4 面の釘バットのテスト
// 釘バット 3 本(F4 の左 x=64・F3 の中央 x=216・F2 の中央 x=320。地面・F1 にはない)を、1〜3 面と同じくジャンプで拾う。
// 性能は 1〜3 面と同じ(10 秒・ジャンプとハシゴは不可・歩けばピンは抜ける)。怒ったポリスマンを倒すと 500 点で、通常の出現ルールでまた出る。
// ミスするとバットは 3 本とも元の場所に戻り、抜いたピンと穴・取ったボーナスアイテムは引き継ぐ(得点は二重に入らない)
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage, walkTo, climb } = require('./helpers');

watchConsoleErrors(test);

const STAGE4 = 3;
const FLOOR_Y = { f0: 540, F1: 445, F2: 350, F3: 255, F4: 160 };
// 期待する配置(ステージデータの items と同じ順)
const BATS = [
  { girder: 'F4', x: 64, ladder: 8 }, // ハシゴ x=72(F3 → F4)を上がりきった所
  { girder: 'F3', x: 216, ladder: 6 }, // ハシゴ x=152(F2 → F3)で上がって右へ
  { girder: 'F2', x: 320, ladder: 4 }, // ハシゴ x=280(F1 → F2)で上がって右へ
];

// ミスのあと、プレイ中に戻るまで進める
async function waitPlaying(page) {
  let s = await snap(page);
  for (let i = 0; i < 600 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  return s;
}

// その場でジャンプして着地するまで進める(本物のキーボード)
async function jumpInPlace(page) {
  await page.keyboard.press('Space');
  return step(page, 60);
}

test('K1. 配置: 4 面に釘バット 3 本(F4 の左 x=64・F3 の中央 x=216・F2 の中央 x=320)。地面・F1 にはない。床から 44px 浮いていて、穴の端から 50px 以上・すぐ近くにハシゴがある・ポリスマンの出現地点やボーナスアイテムと重ならない', async ({ page }) => {
  const s = await startAtStage(page, STAGE4);
  expect(s.items.length).toBe(3);
  s.items.forEach((it, i) => {
    const b = BATS[i];
    expect(it.type).toBe('bat');
    expect(it.taken).toBe(false);
    expect(it.x).toBe(b.x);
    expect(it.y).toBe(FLOOR_Y[b.girder] - 44); // 立っているだけでは届かず、ジャンプで届く高さ(1〜3 面と同じ)
  });
  // 上の方に 2 本(F4・F3)、真ん中に 1 本(F2)、下の 2 段(地面・F1)には置かない
  const floors = s.items.map((it) => Object.keys(FLOOR_Y).find((k) => FLOOR_Y[k] - 44 === it.y));
  expect(floors).toEqual(['F4', 'F3', 'F2']);
  const info = await page.evaluate(() => {
    const st = window.DP.stages[3];
    return { pins: st.pins, ladders: st.ladders, spawns: st.cops.spawns, prizes: st.prizes };
  });
  BATS.forEach((b) => {
    // 同じ段の穴(ピンの x±12)の端から 50px 以上(その場ジャンプで拾っても穴に関わらない)
    for (const p of info.pins.filter((q) => q.girder === b.girder)) expect(Math.abs(p.x - b.x) - 12).toBeGreaterThanOrEqual(50);
    // 寄り道しなくてよい: その段に着くハシゴが 64px 以内にある
    const near = info.ladders.filter((l) => l.upper === b.girder || l.lower === b.girder).map((l) => Math.abs(l.x - b.x));
    expect(Math.min(...near)).toBeLessThanOrEqual(64);
    // ポリスマンの出現地点から 40px 以上、ボーナスアイテムとは重ならない(バットは幅 36px)
    for (const sp of info.spawns.filter((q) => q.girder === b.girder)) expect(Math.abs(sp.x - b.x)).toBeGreaterThanOrEqual(40);
    for (const pz of info.prizes.filter((q) => q.girder === b.girder)) expect(Math.abs(pz.x - b.x)).toBeGreaterThanOrEqual(40);
  });
});

test('K2. 本物のキーボード: ハシゴで上がって、真下を歩いただけでは拾わず、その場ジャンプで拾える(3 本とも)。拾っても得点・ピンは変わらない', async ({ page }) => {
  for (let i = 0; i < BATS.length; i++) {
    const b = BATS[i];
    await startAtStage(page, STAGE4);
    // ハシゴの下の方につかまらせて、↑ で上りきる
    await page.evaluate(([idx, y]) => window.__dp.placePlayerLadder(idx, y), [b.ladder, FLOOR_Y[b.girder] + 80]);
    let s = await climb(page, 'ArrowUp');
    expect(s.player.state).toBe('ground');
    expect(s.player.y).toBe(FLOOR_Y[b.girder]);
    // 真下を歩いて通り過ぎても拾わない(F4 はハシゴの上がバットの真下なので、左右に歩いて戻る)
    s = await walkTo(page, b.x + 24);
    s = await walkTo(page, b.x - 10);
    s = await walkTo(page, b.x);
    expect(s.items[i].taken).toBe(false);
    expect(s.player.bat).toBe(0);
    await page.evaluate(() => window.__dp.clearSounds());
    s = await jumpInPlace(page);
    expect(s.items[i].taken).toBe(true);
    expect(s.player.bat).toBeGreaterThan(540); // 拾ってから着地まで少し減る(10 秒 = 600 ステップ)
    expect(s.player.state).toBe('ground');
    // 拾っても得点は入らない(F4 へのハシゴ x=72 はエロ本 x=60 の横を通るので、登るとエロ本の 500 点だけは入る。これは今までどおり)
    const prizeScore = s.prizes.filter((p) => p.taken).reduce((a, p) => a + p.score, 0);
    expect(s.score).toBe(prizeScore);
    expect(s.pins.every((p) => !p.pulled)).toBe(true);
    expect(await page.evaluate(() => window.__dp.sounds())).toContain('batGet');
    // ほかの 2 本は残っている
    expect(s.items.filter((it) => it.taken).length).toBe(1);
  }
});

test('K2b. F4 のバットは、ハシゴ x=72 を上がりきったその場でジャンプすれば拾える(歩かなくてよい)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.evaluate(() => window.__dp.placePlayerLadder(8, 240));
  let s = await climb(page, 'ArrowUp');
  expect(s.player.x).toBe(72);
  expect(s.player.y).toBe(160);
  s = await jumpInPlace(page);
  expect(s.items[0].taken).toBe(true);
  expect(s.player.bat).toBeGreaterThan(540);
});

test('K3. 穴を跳び越えるジャンプでは、バットを拾わない: F2〜F4 のピン 6 本を左右どちらからでも、穴の手前 0〜29px から跳んで越える(跳び越えたピンは抜ける)', async ({ page }) => {
  test.setTimeout(240000);
  await startAtStage(page, STAGE4);
  const pins = (await snap(page)).pins.filter((p) => p.girder !== 'F1');
  for (const pin of pins) {
    for (const dir of [1, -1]) {
      const key = dir > 0 ? 'ArrowRight' : 'ArrowLeft';
      for (let d = 0; d <= 29; d++) {
        // 穴の端(ピンの x∓12)から d px 手前
        const x = pin.x - dir * (12 + d);
        await page.evaluate(([gd, px]) => {
          const d = window.__dp;
          // 穴で分かれていたら、x を含む方の床に置く
          const lv = d.level();
          const g = lv.girders.find((q) => q.id.split('@')[0] === gd && px >= q.x1 && px <= q.x2);
          d.placePlayer(g ? g.id : gd, px);
          d.setFacing(px < 240 ? 1 : -1);
        }, [pin.girder, x]);
        await page.keyboard.down(key);
        await page.keyboard.press('Space');
        await step(page, 2);
        await page.keyboard.up(key);
        const s = await step(page, 50);
        expect(s.player.state, `${pin.id} ${dir > 0 ? '右' : '左'}へ ${d}px`).toBe('ground');
        expect(s.player.bat, `${pin.id} ${dir > 0 ? '右' : '左'}へ ${d}px でバットを拾った`).toBe(0);
        expect(s.items.every((it) => !it.taken)).toBe(true);
      }
    }
  }
  const s = await snap(page);
  expect(s.pins.filter((p) => p.girder !== 'F1').every((p) => p.pulled)).toBe(true);
});

test('K4. バットを持っている間は 1〜3 面と同じ: 10 秒(600 ステップ)、ジャンプ・ハシゴは不可、歩いて通り抜ければピンは抜ける(100 点)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const cfg = await page.evaluate(() => window.DP.config.bat);
  expect(cfg.duration).toBe(600);
  expect(cfg.itemFloat).toBe(44);
  // F3 の中央のバットを拾う
  await page.evaluate(() => window.__dp.placePlayer('F3', 216));
  let s = await jumpInPlace(page);
  expect(s.player.bat).toBeGreaterThan(0);
  // ジャンプできない
  await page.keyboard.press('Space');
  s = await step(page, 2);
  expect(s.player.state).toBe('ground');
  // 歩いてピン p6(x=296)を通り抜けると抜ける
  s = await walkTo(page, 330);
  expect(s.pins.find((p) => p.id === 'p6').pulled).toBe(true);
  expect(s.score).toBe(100);
  expect(s.player.bat).toBeGreaterThan(0);
  // ハシゴ x=400(F3 → F4)の下で ↑ を押しても登れない
  s = await walkTo(page, 400);
  await page.keyboard.down('ArrowUp');
  s = await step(page, 20);
  await page.keyboard.up('ArrowUp');
  expect(s.player.state).toBe('ground');
  expect(s.player.y).toBe(255);
  // 10 秒で終わる(拾ってから 600 ステップ)
  s = await step(page, s.player.bat + 1);
  expect(s.player.bat).toBe(0);
  // 終わればまた登れる
  s = await climb(page, 'ArrowUp');
  expect(s.player.y).toBe(160);
});

test('K5. 釘バットで怒ったポリスマンを倒すと 500 点・破壊音(smash)・得点表示「500」。倒したポリスマンは消える。現れている途中・気絶中は倒せない(得点なし)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  const score = await page.evaluate(() => window.DP.config.score.copSmash);
  expect(score).toBe(500);
  // F2 の中央のバットを拾って、右から歩いてくるポリスマンを待つ
  await page.evaluate(() => window.__dp.placePlayer('F2', 320));
  let s = await jumpInPlace(page);
  expect(s.player.bat).toBeGreaterThan(0);
  await page.evaluate(() => { window.__dp.setFacing(1); window.__dp.clearSounds(); window.__dp.spawnCop('F2', 370, { dir: -1, skipSpawn: true }); });
  const before = (await snap(page)).score;
  for (let i = 0; i < 120; i++) {
    s = await step(page, 1);
    if (!s.enemies.length || s.state !== 'playing') break;
  }
  expect(s.state).toBe('playing');
  expect(s.player.state).toBe('ground');
  expect(s.enemies.length).toBe(0);
  expect(s.score).toBe(before + 500);
  expect(s.popups).toContain('500');
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('smash');
  // 現れている途中(点滅)のポリスマンは、バットの範囲にいても倒れない
  await page.evaluate(() => { window.__dp.setBat(600); window.__dp.setFacing(1); window.__dp.spawnCop('F2', 336, { dir: 1 }); });
  const s0 = await snap(page);
  s = await step(page, 20);
  expect(s.enemies.length).toBe(1);
  expect(s.enemies[0].state).toBe('spawn');
  expect(s.score).toBe(s0.score);
  // 気絶しているポリスマン(穴から落ちた)も倒れず、300 点のあとに 500 点は入らない
  await page.evaluate(() => { window.__dp.clearEnemies(); window.__dp.spawnCop('F2', 392, { dir: 1, skipSpawn: true }); window.__dp.pullPin('p4'); });
  s = await step(page, 1);
  for (let i = 0; i < 120 && s.enemies[0] && s.enemies[0].state !== 'stunned'; i++) s = await step(page, 1);
  expect(s.enemies[0].state).toBe('stunned');
  const s1 = s;
  // 気絶したポリスマンの横(F1)へ行って、バットを振る
  await page.evaluate((x) => { window.__dp.placePlayer('F1', x - 20); window.__dp.setFacing(1); window.__dp.setBat(600); }, s.enemies[0].x);
  s = await step(page, 40);
  expect(s.score).toBe(s1.score);
});

// 1 周目の上限(2 人)までそろうまで進める(主人公はガールの足場の上で待つ。ハシゴがないのでポリスマンは来ない)
const MAX1 = 2;
async function waitFullCops(page) {
  await page.evaluate(() => window.__dp.placePlayer('top', 240));
  let s = await snap(page);
  for (let i = 0; i < 1500 && !(s.enemies.length === MAX1 && s.enemies.every((e) => e.state !== 'spawn')); i++) s = await step(page, 1);
  expect(s.enemies.length).toBe(MAX1);
  return s;
}

// 歩いているポリスマン(ハシゴの上でない)の後ろにバットを持った主人公を置いて倒す。倒したステップの状態を返す
async function smashOne(page, s) {
  // 主人公を置く場所(ポリスマンの 18px 後ろ)が同じ床の上(端から 12px 以上内側)にあり、ほかのポリスマンが近くにいないものを選ぶ。
  // いなければ少し進めて選び直す
  const lives = s.lives;
  let target = null;
  for (let tries = 0; tries < 300 && !target; tries++) {
    const girders = (await page.evaluate(() => window.__dp.level().girders));
    target = s.enemies.find((e) => {
      if (e.state !== 'walk' || e.ladder !== null) return false;
      const g = girders.find((q) => q.id === e.girder);
      const px = e.x - e.dir * 18;
      if (!g || px < g.x1 + 12 || px > g.x2 - 12) return false;
      if (g.id.split('@')[0] === 'F4' && Math.abs(px - 240) < 60) return false; // ゴリラ警官(F4 の x=240)に触れる所は避ける
      return s.enemies.every((o) => o === e || Math.abs(o.y - e.y) > 40 || Math.abs(o.x - px) > 60);
    }) || null;
    if (!target) s = await step(page, 1);
  }
  expect(target, '倒しに行けるポリスマンがいる').toBeTruthy();
  await page.evaluate(([gid, x, dir]) => {
    const d = window.__dp;
    d.placePlayer(gid, x - dir * 18);
    d.setFacing(dir);
    d.setBat(600);
  }, [target.girder, target.x, target.dir]);
  for (let i = 0; i < 60; i++) {
    s = await step(page, 1);
    if (!s.enemies.some((e) => e.id === target.id) || s.state !== 'playing') break;
  }
  expect(s.state).toBe('playing');
  expect(s.enemies.some((e) => e.id === target.id)).toBe(false);
  expect(s.lives).toBe(lives); // 主人公はミスしていない
  expect(s.state).toBe('playing');
  // 主人公はガールの足場へ戻す(ほかのポリスマンに当たらないように)。バットはそのまま持っていてよい
  await page.evaluate(() => window.__dp.placePlayer('top', 240));
  return s;
}

// 新しいポリスマン(現れている途中)が出るまで 1 ステップずつ進め、かかったステップ数を返す
async function stepsUntilSpawn(page, limit) {
  const ids = new Set((await snap(page)).enemies.map((e) => e.id));
  for (let n = 1; n <= limit; n++) {
    const s = await step(page, 1);
    const fresh = s.enemies.find((e) => !ids.has(e.id));
    if (fresh) return { n, s, fresh };
  }
  return { n: Infinity };
}

test('K6. 釘バットで倒されたポリスマンの代わりは、倒してから出現の間隔の 2 倍(1 周目 480 ステップ = 8 秒)たってから、出現地点に笛とともに出る(修正前は倒した次のステップに出ることが多かった)。人数・速さ・AI の数値は変わらない', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4, { cops: true });
  const cop = await page.evaluate(() => window.DP.config.cop);
  expect(cop.maxAlive).toEqual([2, 4, 5]); // 1 周目 2 人・2 周目 4 人・3 周目以降 5 人
  expect(cop.speed).toEqual([0.8, 0.9, 1.0]);
  expect(cop.climbSpeed).toEqual([0.5, 0.55, 0.6]);
  expect(cop.sameLevelChase).toEqual([0.6, 0.65, 0.7]);
  expect(cop.spawnInterval).toEqual([240, 210, 180]);
  expect(cop.firstSpawn).toBe(180);
  expect(cop.smashRespawnFactor).toBe(2);
  expect(await page.evaluate(() => window.DP.config.score.copSmash)).toBe(500);
  let s = await waitFullCops(page);
  s = await step(page, 200); // 前の出現から 260 ステップ(通常の出現の間隔 240 を過ぎる)
  const before = s.score;
  s = await smashOne(page, s);
  expect(s.score).toBe(before + 500);
  expect(s.enemies.length).toBe(MAX1 - 1);
  expect(s.copSmashWaits).toEqual([480]);
  // 倒した時点で、通常の出現の間隔(240)はもう過ぎている(修正前ならすぐ代わりが出ていた状況)
  expect(s.copTimer).toBeGreaterThanOrEqual(240);
  await page.evaluate(() => window.__dp.clearSounds());
  const r = await stepsUntilSpawn(page, 600);
  expect(r.n).toBe(480);
  expect(r.s.enemies.length).toBe(MAX1);
  expect(r.fresh.state).toBe('spawn');
  expect([416, 56]).toContain(r.fresh.x); // 出現地点(F3 の右 / F2 の左)
  expect(await page.evaluate(() => window.__dp.sounds())).toContain('whistle');
  expect(r.s.copSmashWaits).toEqual([]);
});

test('K10. 複数倒したとき: 1 人ごとに、倒してから 480 ステップは代わりを出さない。2 人目の代わりは「2 人目を倒してから 480」と「1 人目の代わりから通常の間隔 240」の遅い方', async ({ page }) => {
  test.setTimeout(180000);
  await startAtStage(page, STAGE4, { cops: true });
  let s = await waitFullCops(page);
  s = await smashOne(page, s);
  expect(s.copSmashWaits).toEqual([480]);
  // 100 ステップ後に 2 人目を倒す
  s = await step(page, 100 - 1);
  s = await snap(page);
  s = await smashOne(page, s);
  const gap = 480 - s.copSmashWaits[0]; // 1 人目を倒してから 2 人目を倒すまでのステップ
  expect(s.enemies.length).toBe(MAX1 - 2); // 1 周目は 2 人とも倒した
  expect(s.copSmashWaits.length).toBe(2);
  expect(s.copSmashWaits[1]).toBe(480);
  // 1 人目の代わり: 1 人目を倒してから 480
  const first = await stepsUntilSpawn(page, 600);
  expect(first.n).toBe(s.copSmashWaits[0]); // 1 人目の残り待ち時間ちょうどで出る = 1 人目を倒してから 480
  expect(gap).toBeGreaterThanOrEqual(100);
  // 2 人目の代わり: 2 人目を倒してから 480 以上、かつ 1 人目の代わりから通常の間隔 240 以上
  const second = await stepsUntilSpawn(page, 600);
  const sinceKill2 = first.n + second.n;
  expect(sinceKill2).toBeGreaterThanOrEqual(480);
  expect(second.n).toBeGreaterThanOrEqual(240);
  expect(second.n === 240 || sinceKill2 === 480).toBe(true); // どちらか遅い方ちょうど
  expect(second.s.enemies.length).toBe(MAX1);
  // 上限(1 周目 2 人)までそろったら、それ以上は出ない
  s = await step(page, 300);
  expect(s.enemies.length).toBe(MAX1);
});

test('K11. 待ち時間は周回で出現の間隔の 2 倍: 1 周目 480・2 周目 420・3 周目以降 360 ステップ(8 / 7 / 6 秒)', async ({ page }) => {
  await startAtStage(page, STAGE4);
  for (const [round, wait] of [[1, 480], [2, 420], [3, 360], [4, 360]]) {
    await page.evaluate((r) => { const d = window.__dp; d.startStage(3, r); d.setCopsEnabled(false); }, round);
    await step(page, 101);
    await page.evaluate(() => { const d = window.__dp; d.placePlayer('F2', 320); d.setFacing(1); d.setBat(600); d.spawnCop('F2', 350, { dir: -1, skipSpawn: true }); });
    let s;
    for (let i = 0; i < 60; i++) { s = await step(page, 1); if (!s.enemies.length) break; }
    expect(s.enemies.length).toBe(0);
    expect(s.copSmashWaits).toEqual([wait]);
  }
});

test('K12. 待ち時間が付くのは釘バットで倒したときだけ: ピンの穴から落として気絶したポリスマンが消えても待ち時間は付かない(通常の出現ルール)。ミスすると待ち時間も消える', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.evaluate(() => { const d = window.__dp; d.placePlayer('top', 240); d.spawnCop('F2', 392, { dir: 1, skipSpawn: true }); d.pullPin('p4'); });
  let s = await step(page, 1);
  for (let i = 0; i < 400 && s.enemies.length; i++) s = await step(page, 1);
  expect(s.enemies.length).toBe(0); // 気絶のあと消えた
  expect(s.copSmashWaits).toEqual([]);
  // 倒して待ち時間が付いたあとにミスすると、待ち時間はなくなる(ポリスマンも全員消えて数え直し)
  await page.evaluate(() => { const d = window.__dp; d.placePlayer('F3', 216); d.setFacing(1); d.setBat(600); d.spawnCop('F3', 250, { dir: -1, skipSpawn: true }); });
  for (let i = 0; i < 60; i++) { s = await step(page, 1); if (!s.enemies.length) break; }
  expect(s.copSmashWaits).toEqual([480]);
  await page.evaluate(() => window.__dp.killPlayer('fall'));
  s = await waitPlaying(page);
  expect(s.copSmashWaits).toEqual([]);
});

test('K7. ミスしたら: バット 3 本は元の場所に戻る(持っていたバットも手放す)。取ったボーナスアイテムは消えたまま・取っていないものは残る。抜いたピンと穴は残る。得点は二重に入らない', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4);
  // ピンを 3 本抜く(F3 の床が p5・p6 で 3 枚に分かれ、F3 のバットは真ん中の床に乗る)
  await page.evaluate(() => { const d = window.__dp; d.pullPin('p3'); d.pullPin('p5'); d.pullPin('p6'); });
  // ビール瓶(300 点)を取る
  await page.evaluate(() => window.__dp.placePlayer('F1', 420));
  let s = await walkTo(page, 460);
  expect(s.prizes.find((p) => p.id === 'beer').taken).toBe(true);
  // F2 のバットを拾う(F2 の中央の床は p3 の穴の右側 F2@196)
  const midF2 = s.items[2];
  await page.evaluate(() => {
    const d = window.__dp;
    const g = d.level().girders.find((q) => q.id.split('@')[0] === 'F2' && 320 >= q.x1 && 320 <= q.x2);
    d.placePlayer(g.id, 320);
  });
  s = await jumpInPlace(page);
  expect(s.items[2].taken).toBe(true);
  expect(s.player.bat).toBeGreaterThan(0);
  const score = s.score;
  const pinOrder = s.pinOrder.slice();
  const itemsBefore = s.items.map((it) => [it.x, it.y]);
  // ミス
  await page.evaluate(() => window.__dp.killPlayer('hazard'));
  s = await waitPlaying(page);
  expect(s.player.bat).toBe(0);
  expect(s.items.map((it) => [it.taken, it.gone])).toEqual([[false, false], [false, false], [false, false]]);
  expect(s.items.map((it) => [it.x, it.y])).toEqual(itemsBefore); // 床が分かれていても同じ位置・高さ
  expect(s.items[2].y).toBe(midF2.y);
  expect(s.prizes.map((p) => [p.id, p.taken])).toEqual([['beer', true], ['hbook', false], ['cash', false]]);
  expect(s.pinOrder).toEqual(pinOrder);
  expect(s.pins.filter((p) => p.pulled).map((p) => p.id).sort()).toEqual(['p3', 'p5', 'p6']);
  expect(s.score).toBe(score);
  // もう一度拾える(拾っても得点は入らない)。ビール瓶の場所へ行っても得点は増えない
  await page.evaluate(() => {
    const d = window.__dp;
    const g = d.level().girders.find((q) => q.id.split('@')[0] === 'F3' && 216 >= q.x1 && 216 <= q.x2);
    d.placePlayer(g.id, 216);
  });
  s = await jumpInPlace(page);
  expect(s.items[1].taken).toBe(true);
  expect(s.player.bat).toBeGreaterThan(0);
  expect(s.score).toBe(score);
  await page.evaluate(() => { window.__dp.setBat(0); window.__dp.placePlayer('F1', 420); });
  s = await walkTo(page, 460);
  expect(s.score).toBe(score);
  // 2 回目のミスでも同じ(バットは戻り、ビール瓶は消えたまま)
  await page.evaluate(() => window.__dp.killPlayer('fall'));
  s = await waitPlaying(page);
  expect(s.items.every((it) => !it.taken)).toBe(true);
  expect(s.prizes.find((p) => p.id === 'beer').taken).toBe(true);
  expect(s.score).toBe(score);
});

test('K8. クリア演出が始まると、持っているバットは手放し、取っていないバットは消える(崩れる鉄骨と一緒に空中に残らない)。次の周回の 4 面では 3 本とも戻る', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, STAGE4, { url: './?test&dev' });
  await page.evaluate(() => window.__dp.placePlayer('F2', 320));
  let s = await jumpInPlace(page);
  expect(s.player.bat).toBeGreaterThan(0);
  await page.keyboard.press('KeyC');
  s = await step(page, 1);
  expect(s.state).toBe('collapse');
  expect(s.player.bat).toBe(0);
  expect(s.items.map((it) => [it.taken, it.gone])).toEqual([[false, true], [false, true], [true, false]]);
  // 次の周回の 4 面では初期状態(テスト補助で周回 2 の 4 面を始める)
  await page.evaluate(() => window.__dp.startStage(3, 2));
  s = await step(page, 101);
  expect(s.items.map((it) => [it.taken, it.gone])).toEqual([[false, false], [false, false], [false, false]]);
});

test('K9. 描画: 3 本とも、取得判定と同じ場所に釘バットのドット絵が描かれている。取ったバットは描かれない', async ({ page }) => {
  await startAtStage(page, STAGE4);
  await page.waitForTimeout(80);
  const count = () => page.evaluate(() => {
    const s = window.__dp.snapshot();
    const ctx = document.querySelector('canvas').getContext('2d');
    return s.items.map((it) => {
      const d = ctx.getImageData(Math.round(it.x - it.w / 2), Math.round(it.y - it.h), it.w, it.h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0xd8 && d[i + 1] === 0x9a && d[i + 2] === 0x52) n++; // バットの木(明るい)
      return n;
    });
  });
  const px = await count();
  px.forEach((n) => expect(n).toBeGreaterThan(20));
  await page.evaluate(() => window.__dp.placePlayer('F3', 216));
  await jumpInPlace(page);
  await page.evaluate(() => window.__dp.setBat(0)); // 主人公が振るバットが範囲に入らないように
  await step(page, 1);
  await page.waitForTimeout(80);
  const px2 = await count();
  expect(px2[1]).toBe(0);
  expect(px2[0]).toBeGreaterThan(20);
  expect(px2[2]).toBeGreaterThan(20);
});
