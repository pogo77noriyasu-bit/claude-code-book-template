// 2 面: ゴリラ警官のバズーカ砲と蛇行ミサイルのテスト(js/bazooka.js、仕掛け 'bazooka')
// ループを手動にして決まったステップ数だけ進め、構え → 狙う → 発射の流れ、狙う角度、蛇行の式、当たり判定、
// 釘バットでの破壊(1,000 点・1 回だけ・巻き添えなし)、跳び越えの 100 点、撃たない場面、周回の表、回避できることを確かめる。
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors } = require('./helpers');

watchConsoleErrors(test);

const PLAYER_H = 26;
const PIVOT = { dx: 12, dy: -22 }; // config.missile.pivot
const TUBE = 22; // config.missile.tubeFront

// 2 面を周回 round で始め、プレイ中の最初のステップまで進める(スカルは出さない。ゴリラのバズーカは有効)。
// url に '&dev&inv=1' を足すと DEV モードの無敵(当たってもミスにならない)
async function startBz(page, { round = 1, url = './?test' } = {}) {
  await page.goto(url);
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate((r) => {
    const d = window.__dp;
    d.setManual(true); d.setSeed(1); d.setSkullsEnabled(false); d.startStage(1, r);
  }, round);
  let s = await snap(page);
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.stageId).toBe('livehouse');
  return s;
}

// 主人公を毎ステップ同じ場所に置き直しながら進める(コンベアで流されないように)。
// cond は「s(スナップショット)と i(何ステップ目か。0 から)を受け取る式」の文字列。true になったら止める。
// 1 ステップごとにブラウザとやり取りすると遅いので、ループはブラウザの中で回す
async function stepPinned(page, girder, x, n, cond) {
  return page.evaluate(([gd, px, k, src]) => {
    const f = src ? new Function('s', 'i', 'return (' + src + ');') : null;
    let s;
    for (let i = 0; i < k; i++) {
      if (gd) window.__dp.placePlayer(gd, px);
      s = window.__dp.step(1);
      if (f && f(s, i)) return { s, i };
    }
    return { s, i: k };
  }, [girder, x, n, cond || null]);
}

// 肩から主人公の体の中心への角度(度。0〜135 に収める。左向きなら反転した肩から測り直す)
function expectedAngle(boss, p) {
  const calc = (flip) => {
    const px = boss.x + (flip ? -PIVOT.dx : PIVOT.dx);
    const py = boss.y + PIVOT.dy;
    let a = (Math.atan2(p.y - PLAYER_H / 2 - py, p.x - px) * 180) / Math.PI;
    if (a < -90) a += 360;
    return Math.max(0, Math.min(135, a));
  };
  let a = calc(false);
  if (a > 90) a = calc(true);
  return a;
}

// ミサイルの位置の式(js/bazooka.js の posAt と同じ。ampRamp = 24)
function formula(m, s) {
  const rad = (m.angle * Math.PI) / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  const env = Math.min(1, s / 24);
  const o = m.amp * env * Math.sin((2 * Math.PI * (s - m.aimDist)) / m.wave);
  return { x: m.x0 + ux * s - uy * o, y: m.y0 + uy * s + ux * o };
}

test.describe('2 面 バズーカ砲と蛇行ミサイル', () => {
  test('BZ1 構え → 狙う → 発射の時間・効果音・閃光・反動(R1)', async ({ page }) => {
    await startBz(page);
    await page.evaluate(() => window.__dp.clearSounds());
    // プレイ開始から 2 秒(120 ステップ)は構えない
    let r = await stepPinned(page, 'mid', 300, 400, "s.bazooka.phase !== 'wait'");
    expect(r.i + 1).toBe(120);
    expect(r.s.bazooka.phase).toBe('raise');
    expect(await page.evaluate(() => window.__dp.sounds())).toContain('bazookaReady');
    // 担ぎ上げは 24 ステップ
    r = await stepPinned(page, 'mid', 300, 100, "s.bazooka.phase !== 'raise'");
    expect(r.i + 1).toBe(24);
    expect(r.s.bazooka.phase).toBe('aim');
    expect(r.s.bazooka.missiles).toHaveLength(0);
    // R1 は 60 ステップ狙ってから撃つ
    r = await stepPinned(page, 'mid', 300, 100, "s.bazooka.phase !== 'aim'");
    expect(r.i + 1).toBe(60);
    const s = r.s;
    expect(s.bazooka.phase).toBe('recoil');
    expect(s.bazooka.missiles).toHaveLength(1);
    expect(s.bazooka.fired).toBe(1);
    expect(s.bazooka.flash).toBe(6);
    expect(await page.evaluate(() => window.__dp.sounds())).toContain('bazookaFire');
    // 閃光は 6 ステップで消え、反動は 12 ステップで待機に戻る
    const s6 = await stepPinned(page, 'mid', 300, 6);
    expect(s6.s.bazooka.flash).toBe(0);
    const s12 = await stepPinned(page, 'mid', 300, 6);
    expect(s12.s.bazooka.phase).toBe('wait');
  });

  test('BZ2 発射した瞬間の主人公の位置を狙う(水平・斜め下・急角度・左下)', async ({ page }) => {
    const cases = [
      { girder: 'c3', x: 300, min: 0, max: 8, flip: false }, // 同じ段: ほぼ水平
      { girder: 'mid', x: 300, min: 30, max: 50, flip: false }, // 2 段下: 斜め下
      { girder: 'f0', x: 140, min: 70, max: 90, flip: false }, // いちばん下の段の手前: 急角度
      { girder: 'f0', x: 10, min: 90, max: 135, flip: true }, // ゴリラより左の下: 左斜め下(左向き)
    ];
    for (const c of cases) {
      await startBz(page);
      // 撃つ 1 ステップ前(狙う時間の最後)まで進める
      const pre = await stepPinned(page, c.girder, c.x, 400, "s.bazooka.phase === 'aim' && s.bazooka.t === 59");
      const before = pre.s;
      const r = await stepPinned(page, c.girder, c.x, 1);
      const m = r.s.bazooka.missiles[0];
      expect(m, `${c.girder} x=${c.x} で撃つ`).toBeTruthy();
      // 撃ったステップの主人公の位置から計算した角度と一致する
      // (コンベアの上では、置き直したあと同じステップでコンベアに運ばれてから狙われる)
      const want = expectedAngle(r.s.boss, r.s.player);
      expect(m.angle).toBeCloseTo(want, 5);
      expect(m.angle).toBeGreaterThanOrEqual(c.min);
      expect(m.angle).toBeLessThanOrEqual(c.max);
      expect(r.s.bazooka.flip).toBe(c.flip);
      // 撃ち出す位置は砲口(肩から 22px 先)
      const pvx = r.s.boss.x + (c.flip ? -PIVOT.dx : PIVOT.dx);
      const pvy = r.s.boss.y + PIVOT.dy;
      expect(Math.hypot(m.x0 - pvx, m.y0 - pvy)).toBeCloseTo(TUBE, 5);
      // 狙う間も砲身は主人公の方を向いている(撃つ前のステップの向き)
      expect(before.bazooka.angle).toBeCloseTo(expectedAngle(before.boss, before.player), 5);
    }
  });

  test('BZ3 発射後は追尾しない: 蛇行はサイン波の式どおりで、主人公が動いても変わらない', async ({ page }) => {
    await startBz(page);
    const r = await stepPinned(page, 'mid', 300, 400, 's.bazooka.missiles.length > 0');
    const m0 = r.s.bazooka.missiles[0];
    let maxOff = 0;
    // 主人公を左右に大きく動かしても、ミサイルの道筋は変わらない
    const list = await page.evaluate(() => {
      const out = [];
      for (let k = 0; k < 90; k++) { window.__dp.placePlayer('f0', k % 2 ? 40 : 440); out.push(window.__dp.step(1)); }
      return out;
    });
    for (let i = 0; i < 90; i++) {
      const s = list[i];
      const m = s.bazooka.missiles[0];
      expect(m.angle).toBe(m0.angle);
      const f = formula(m, m.s);
      expect(m.x).toBeCloseTo(f.x, 6);
      expect(m.y).toBeCloseTo(f.y, 6);
      expect(m.s).toBeCloseTo(1.8 * (i + 1), 6); // R1 の弾速 1.8(撃ったステップには進まない)
      // 基本の飛行方向の線からのずれ
      const rad = (m.angle * Math.PI) / 180;
      const off = -(m.x - m.x0) * Math.sin(rad) + (m.y - m.y0) * Math.cos(rad);
      maxOff = Math.max(maxOff, Math.abs(off));
    }
    // 蛇行の幅は R1 の ±10px まで、実際に左右へ振れている
    expect(maxOff).toBeGreaterThan(8);
    expect(maxOff).toBeLessThanOrEqual(10 + 1e-6);
    // 狙った位置(s = aimDist)では、ちょうど基本の飛行方向の線の上(ずれ 0)
    const at = formula(m0, m0.aimDist);
    const rad = (m0.angle * Math.PI) / 180;
    expect(Math.abs(-(at.x - m0.x0) * Math.sin(rad) + (at.y - m0.y0) * Math.cos(rad))).toBeLessThan(1e-9);
  });

  test('BZ4 動かずにいると当たって炎上のミス(演出は炎上・黒こげ)', async ({ page }) => {
    await startBz(page);
    const r = await stepPinned(page, 'mid', 300, 700, "s.state !== 'playing'");
    expect(r.s.state).toBe('dying');
    expect(r.s.deathReason).toBe('burn');
    expect(r.s.bazooka.fired).toBe(1);
    // 当たったミサイルは主人公の体に重なっている
    const m = r.s.bazooka.missiles[0];
    expect(Math.abs(m.x - 300)).toBeLessThan(7 + 5 + 2);
    // 炎上の演出(60 ステップ)のあと、残機が 1 減って同じ面の READY から
    const s = await step(page, 61);
    expect(s.state).toBe('ready');
    expect(s.lives).toBe(2);
  });

  test('BZ5 鉄骨・ベルトコンベアを通り抜け、画面の外で消える。煙は出るが当たらない', async ({ page }) => {
    await startBz(page);
    await page.evaluate(() => { window.__dp.setBazookaEnabled(false); window.__dp.placePlayer('f0', 440); });
    // 斜め下(60 度)に撃つ: c2l(255)・mid(350)・c1(445)・f0(540)の高さを通り過ぎて、画面の下から出ていく
    await page.evaluate(() => window.__dp.fireMissile({ angle: 60, aimDist: 100 }));
    let s = await snap(page);
    const ys = [];
    let maxSmoke = 0;
    for (let i = 0; i < 400; i++) {
      s = await page.evaluate(() => { window.__dp.placePlayer('f0', 440); return window.__dp.step(1); });
      if (!s.bazooka.missiles.length) break;
      ys.push(s.bazooka.missiles[0].y);
      maxSmoke = Math.max(maxSmoke, s.bazooka.smoke);
    }
    expect(s.bazooka.missiles).toHaveLength(0);
    expect(Math.max(...ys)).toBeGreaterThan(540); // いちばん下の床より下まで、止まらずに進んだ
    expect(Math.max(...ys)).toBeLessThanOrEqual(560 + 16 + 3); // 画面の下から 16px 出たら消える
    expect(maxSmoke).toBeGreaterThan(5);
    expect(s.state).toBe('playing');

    // 煙には当たり判定がない: 主人公のすぐ前から、主人公と反対の向きへ撃つ(煙は主人公の上に漂う)
    await page.evaluate(() => { window.__dp.placePlayer('mid', 300); window.__dp.fireMissile({ angle: 0, x: 318, y: 337, aimDist: 100 }); });
    let smokeSeen = 0;
    for (let i = 0; i < 120; i++) {
      s = await page.evaluate(() => { window.__dp.placePlayer('mid', 300); return window.__dp.step(1); });
      smokeSeen = Math.max(smokeSeen, s.bazooka.smoke);
      expect(s.state).toBe('playing');
    }
    expect(smokeSeen).toBeGreaterThan(0);
  });

  test('BZ6 撃たない場面: ガールの足場・最後のハシゴ・砲口のすぐ近く。狙っている途中なら構えを解く', async ({ page }) => {
    // ガールの足場
    await startBz(page);
    let r = await stepPinned(page, 'top', 280, 600);
    expect(r.s.bazooka.fired).toBe(0);
    expect(r.s.bazooka.phase).toBe('wait');
    // ガールの足場への最後のハシゴ(noHazard。index 8)
    await startBz(page);
    const firedOnLadder = await page.evaluate(() => {
      let s;
      for (let i = 0; i < 600; i++) { window.__dp.placePlayerLadder(8, 120); s = window.__dp.step(1); }
      return s.bazooka.fired;
    });
    expect(firedOnLadder).toBe(0);
    // 砲口のすぐ近く(最上段のゴリラのすぐ右)
    await startBz(page);
    r = await stepPinned(page, 'c3', 100, 600);
    expect(r.s.bazooka.fired).toBe(0);
    expect(r.s.state).toBe('playing');
    // 狙っている途中でガールの足場へ移ったら、構えを解いて撃たない
    await startBz(page);
    r = await stepPinned(page, 'mid', 300, 400, "s.bazooka.phase === 'aim' && s.bazooka.t === 10");
    r = await stepPinned(page, 'top', 280, 1);
    expect(r.s.bazooka.phase).toBe('wait');
    r = await stepPinned(page, 'top', 280, 300);
    expect(r.s.bazooka.fired).toBe(0);
  });

  test('BZ7 周回の表: R11 以降は R10 と同じ(上限)。撃ったミサイルと発射の間隔が表どおり', async ({ page }) => {
    await startBz(page);
    const rows = await page.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 50].map((r) => window.__dp.bazookaRules(r)));
    expect(rows[0]).toEqual({ aim: 60, interval: 330, speed: 1.8, amp: 10, wave: 120, maxAlive: 1 });
    expect(rows[9]).toEqual({ aim: 38, interval: 150, speed: 2.7, amp: 18, wave: 84, maxAlive: 2 });
    expect(rows[10]).toEqual(rows[9]);
    expect(rows[11]).toEqual(rows[9]);
    expect(rows[12]).toEqual(rows[9]);
    // だんだん難しくなる(狙う時間・間隔は短く、弾速・蛇行の幅は大きく)
    for (let i = 1; i < 10; i++) {
      expect(rows[i].aim).toBeLessThanOrEqual(rows[i - 1].aim);
      expect(rows[i].interval).toBeLessThan(rows[i - 1].interval);
      expect(rows[i].speed).toBeGreaterThan(rows[i - 1].speed);
      expect(rows[i].amp).toBeGreaterThanOrEqual(rows[i - 1].amp);
    }
    // 実際の発射: 狙う時間と、発射から次の発射までの間隔(ミサイルは毎ステップ消して当たらないようにする)
    for (const round of [1, 5, 10, 15]) {
      const row = rows[Math.min(round, 10) - 1];
      await startBz(page, { round });
      const { fires, aimLen, first } = await page.evaluate(() => {
        const fires = [];
        let aimStart = null, aimLen = null, first = null;
        for (let i = 0; i < 1200 && fires.length < 3; i++) {
          window.__dp.placePlayer('mid', 300);
          const s = window.__dp.step(1);
          if (s.bazooka.phase === 'aim' && aimStart === null) aimStart = i;
          if (s.bazooka.missiles.length) {
            if (fires.length === 0) { aimLen = i - aimStart; first = s.bazooka.missiles[0]; }
            fires.push(i);
            window.__dp.clearMissiles();
          }
        }
        return { fires, aimLen, first };
      });
      expect(first.speed).toBe(row.speed);
      expect(first.amp).toBe(row.amp);
      expect(first.wave).toBe(row.wave);
      expect(aimLen, `R${round} の狙う時間`).toBe(row.aim);
      expect(fires[1] - fires[0], `R${round} の発射の間隔`).toBe(row.interval);
      expect(fires[2] - fires[1]).toBe(row.interval);
    }
  });

  test('BZ8 同時に飛ぶ数の上限(R1 は 1 本・R10 は 2 本)。上限の間は構えない', async ({ page }) => {
    // R1: 1 本目が飛んでいる間は、間隔が過ぎても構えない(無敵で当たってもミスにしない)
    await startBz(page, { round: 1, url: './?test&dev&inv=1' });
    let r = await stepPinned(page, 'f0', 470, 600, 's.bazooka.fired === 1');
    r = await stepPinned(page, 'f0', 470, 260); // 間隔(330)の残りを過ぎても
    expect(r.s.bazooka.missiles).toHaveLength(1);
    expect(r.s.bazooka.phase).toBe('wait');
    expect(r.s.bazooka.cool).toBe(0);
    expect(r.s.bazooka.fired).toBe(1);
    // R10: 2 本まで同時に飛び、3 本目は 1 本消えるまで待つ
    await startBz(page, { round: 10, url: './?test&dev&inv=1' });
    // 下段の右端を狙わせる(遠いので長く飛ぶ)。毎ステップの飛んでいる数を記録する
    const counts = await page.evaluate(() => {
      const out = [];
      for (let i = 0; i < 1500; i++) { window.__dp.placePlayer('c1', 478); out.push(window.__dp.step(1).bazooka.missiles.length); }
      return out;
    });
    expect(Math.max(...counts)).toBe(2);
  });

  test('BZ9 釘バットで壊すと 1,000 点を 1 回だけ。派手な爆発・専用の爆発音・画面の揺れ。巻き添えなし', async ({ page }) => {
    await startBz(page);
    await page.evaluate(() => {
      const d = window.__dp;
      d.setBazookaEnabled(false);
      d.placePlayer('mid', 300);
      d.setFacing(-1);
      d.setBat(600);
      // 爆発の近く(釘バットは届かない所)にスカルを置く(巻き添えで倒れないこと)
      d.spawnSkull('mid', 222, { skipSpawn: true, dir: -1 });
      d.clearSounds();
      d.fireMissile({ angle: 0, x: 200, y: 336, aimDist: 100 });
    });
    const score0 = (await snap(page)).score;
    let s, hitAt = null;
    for (let i = 0; i < 200; i++) {
      s = await page.evaluate(() => { window.__dp.placePlayer('mid', 300); return window.__dp.step(1); });
      if (hitAt === null && s.bazooka.blasts > 0) {
        hitAt = i;
        expect(s.bazooka.missiles).toHaveLength(0);
        expect(s.score - score0).toBe(1000);
        expect(s.popups).toContain('1000');
        expect(s.bazooka.shake).toBe(12);
        // 巻き添えなし: 爆発の近くのスカルは残っている
        const sk = s.enemies.filter((e) => e.type === 'skull');
        expect(sk).toHaveLength(1);
        expect(Math.abs(sk[0].x - s.player.x)).toBeLessThan(140);
      }
      expect(s.state).toBe('playing');
    }
    expect(hitAt).not.toBeNull();
    // そのあとも加点は増えない(二重加点なし)。爆発は 40 ステップで消える
    expect(s.score - score0).toBe(1000);
    expect(s.bazooka.blasts).toBe(0);
    const sounds = await page.evaluate(() => window.__dp.sounds());
    expect(sounds.filter((n) => n === 'missileBoom')).toHaveLength(1);
    expect(sounds).not.toContain('smash');
  });

  test('BZ10 ジャンプで跳び越えると 100 点(1 本 1 回)', async ({ page }) => {
    await startBz(page);
    await page.evaluate(() => { window.__dp.setBazookaEnabled(false); window.__dp.placePlayer('mid', 300); });
    // 足元すれすれ(床から 5px 上)を水平に飛ぶミサイル。主人公の位置で蛇行のずれが 0 になるようにする
    const startX = 100;
    let ok = false;
    for (const lead of [30, 36, 42, 48, 54, 24, 60]) {
      await page.evaluate(() => { window.__dp.clearMissiles(); window.__dp.placePlayer('mid', 300); });
      const score0 = (await snap(page)).score;
      await page.evaluate((x) => window.__dp.fireMissile({ angle: 0, x, y: 345, aimDist: 300 - x }), startX);
      let s = await snap(page);
      while (s.bazooka.missiles.length && s.bazooka.missiles[0].x < 300 - lead) s = await step(page, 1);
      await page.keyboard.down('Space');
      s = await step(page, 1);
      await page.keyboard.up('Space');
      for (let i = 0; i < 90 && s.state === 'playing'; i++) s = await step(page, 1);
      if (s.state !== 'playing') {
        // この踏み切りでは当たった: やり直す
        await startBz(page);
        await page.evaluate(() => { window.__dp.setBazookaEnabled(false); window.__dp.placePlayer('mid', 300); });
        continue;
      }
      expect(s.score - score0).toBe(100);
      expect(s.player.state).toBe('ground');
      ok = true;
      break;
    }
    expect(ok, 'どれかの踏み切りで跳び越えられる').toBe(true);
  });

  test('BZ11 ミスすると片付いて 2 秒数え直し。クリアの逃走演出でも片付く', async ({ page }) => {
    await startBz(page);
    await page.evaluate(() => { window.__dp.fireMissile({ angle: 20 }); window.__dp.fireMissile({ angle: 70 }); });
    let s = await step(page, 3);
    expect(s.bazooka.missiles).toHaveLength(2);
    await page.evaluate(() => window.__dp.killPlayer('fall'));
    s = await step(page, 1);
    expect(s.state).toBe('dying');
    for (let i = 0; i < 400 && s.state !== 'playing'; i++) s = await step(page, 1);
    // 組み立て直した直後: バズーカの状態は新しいレベルで作り直される(プレイ中の最初のステップで用意する)
    expect(s.bazooka).toBeNull();
    s = await step(page, 1);
    // ミサイル・煙なし、待機から 2 秒数え直し(最初のステップで 1 減っている)
    expect(s.bazooka.missiles).toHaveLength(0);
    expect(s.bazooka.smoke).toBe(0);
    expect(s.bazooka.phase).toBe('wait');
    expect(s.bazooka.cool).toBe(119);
    // 逃走演出: ガールに触れたらミサイルは消え、ゴリラは構えを解く
    await stepPinned(page, 'mid', 300, 400, "s.bazooka.phase === 'aim'");
    await page.evaluate(() => { window.__dp.fireMissile({ angle: 30 }); });
    const r = await stepPinned(page, 'mid', 300, 2);
    expect(r.s.bazooka.missiles.length).toBeGreaterThan(0);
    expect(r.s.bazooka.phase).toBe('aim');
    await page.evaluate(() => window.__dp.placePlayer('top', 214));
    s = await step(page, 1);
    expect(s.state).toBe('escape');
    expect(s.bazooka.missiles).toHaveLength(0);
    expect(s.bazooka.smoke).toBe(0);
    expect(s.bazooka.phase).toBe('wait');
  });

  test('BZ12 回避できる: 発射の瞬間に横へ歩き出せば当たらない(R1・R10、いくつかの段と位置)', async ({ page }) => {
    const cases = [
      { girder: 'mid', x: 300, key: 'ArrowRight' },
      { girder: 'mid', x: 160, key: 'ArrowLeft' },
      { girder: 'f0', x: 200, key: 'ArrowRight' },
      { girder: 'f0', x: 330, key: 'ArrowLeft' },
    ];
    for (const round of [1, 10]) {
      for (const c of cases) {
        await startBz(page, { round });
        const r = await stepPinned(page, c.girder, c.x, 600, 's.bazooka.missiles.length > 0');
        expect(r.s.bazooka.fired).toBe(1);
        await page.evaluate(() => window.__dp.setBazookaEnabled(false)); // 2 本目は撃たせない
        await page.keyboard.down(c.key);
        const s = (await stepPinned(page, null, 0, 400, "!s.bazooka.missiles.length || s.state !== 'playing'")).s;
        await page.keyboard.up(c.key);
        expect(s.state, `R${round} ${c.girder} x=${c.x} から ${c.key}`).toBe('playing');
      }
    }
  });

  test('BZ13 同じ段で水平に撃たれても、ジャンプで跳び越えられる(R10)', async ({ page }) => {
    let ok = false;
    for (const lead of [24, 30, 36, 42, 18, 48]) {
      await startBz(page, { round: 10 });
      const r = await stepPinned(page, 'c3', 300, 600, 's.bazooka.missiles.length > 0');
      expect(r.s.bazooka.missiles[0].angle).toBeLessThan(8);
      await page.evaluate(() => window.__dp.setBazookaEnabled(false));
      let s = r.s;
      // コンベアに流されないよう、踏み切るまでは同じ場所に置き直す
      while (s.bazooka.missiles.length && s.bazooka.missiles[0].x < 300 - lead && s.state === 'playing') {
        s = await page.evaluate(() => { window.__dp.placePlayer('c3', 300); return window.__dp.step(1); });
      }
      await page.keyboard.down('Space');
      s = await step(page, 1);
      await page.keyboard.up('Space');
      for (let i = 0; i < 120 && s.state === 'playing' && s.bazooka.missiles.length; i++) s = await step(page, 1);
      if (s.state === 'playing') { ok = true; break; }
    }
    expect(ok, 'どれかの踏み切りで跳び越えられる').toBe(true);
  });

  test('BZ14 ほかの面ではバズーカを使わない', async ({ page }) => {
    for (const idx of [0, 2, 3]) {
      await page.goto('./?test');
      await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
      await page.evaluate((i) => { const d = window.__dp; d.setManual(true); d.setSeed(1); d.setSkullsEnabled(false); d.setCopsEnabled(false); d.setBirdsEnabled(false); d.startStage(i); }, idx);
      const s = await step(page, 300);
      expect(s.bazooka).toBeNull();
    }
  });
});
