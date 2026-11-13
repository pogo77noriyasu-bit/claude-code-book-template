// ドンキーパンク 3 面「解体中のスクワット」の第 1 段階のテスト
// (背景・足場・ハシゴ・循環リフト A・往復リフト B・乗り降り・落下・クリアルート・面の順番・BGM。敵はまだいない)
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, hold } = require('./helpers');

watchConsoleErrors(test);

const STAGE3 = 2; // 3 面の番号(0 始まり)
const level = (page) => page.evaluate(() => window.__dp.level());
const lifts = async (page) => Object.fromEntries((await page.evaluate(() => window.__dp.lifts())).map((l) => [l.id, l]));

// 3 面(周回 round)から始めて、プレイ中まで進める。パンクニワトリは birds: true のときだけ出す
// (ほかのテストは地形・リフト・鉄球だけを確かめる。2 面のテストでファイヤースカルを止めるのと同じ)
// ball: false で鉄球の当たり判定を止める(クリア時間だけを測る L2・L10。鉄球ありの通しプレイは L14・L32)
async function start3(page, round = 1, { birds = false, ball = true } = {}) {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  await page.evaluate(([r, b, wb]) => { window.__dp.setManual(true); window.__dp.setSeed(1); window.__dp.setBirdsEnabled(b); window.__dp.setWreckingBallEnabled(wb); window.__dp.startStage(2, r); }, [round, birds, ball]);
  let s = await step(page, 1);
  for (let i = 0; i < 200 && s.state !== 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.stageId).toBe('squat');
  return s;
}

// 実際のキー入力で最短ルートを進む自動プレイ。route: 'c2'(リフト A を 2 階・左で降りる)/ 'c1'(1 階で降りて、がれきの階段を登る)/
// 'low'(下ルート: 地面から崩れた足場 u1 → u2 → u3 と跳んで登り、P1 → M1 → 1 階 → がれきの階段で 2 階へ。
// リフト B は 2 階 ⇔ 屋上の往復で 1 階へは降りない)。
// リフトの板・床は幅 24px で両側の足場との間に 12px のすき間があり、2 階は割れているので、ほとんどの移動はジャンプで行う。
// プレイ開始からガールに触れる(逃走演出が始まる)までの秒数と、各区間の記録を返す
function playRoute(page, route) {
  return page.evaluate((rt) => {
    const dp = window.__dp;
    const key = (k, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k }));
    const held = new Set();
    // 押しておくキーをまとめて指定する(押していないキーは離す)。' ' はジャンプ
    const keys = (...ks) => {
      for (const k of [...held]) if (!ks.includes(k)) { key(k, false); held.delete(k); }
      for (const k of ks) if (!held.has(k)) { key(k, true); held.add(k); }
    };
    // 地上で x まで歩き、着いたら dir の向きへ跳ぶ。跳んだら true
    const walkJump = (pl, x, dir) => {
      if (Math.abs(pl.x - x) > 1) { keys(pl.x < x ? 'ArrowRight' : 'ArrowLeft'); return false; }
      keys(dir > 0 ? 'ArrowRight' : 'ArrowLeft', ' ');
      return true;
    };
    let s = dp.snapshot();
    let phase = rt === 'low' ? 'toU1' : 'boardA';
    let t = 0;
    const log = {};
    const lvl = rt === 'c2' ? 320 : 430;
    const exitFloor = rt === 'c2' ? 'c2a' : 'c1';
    const TAKEOFF_B = 311; // リフト B の床の真ん中に着地する踏み切り位置(2 階・右 / 1 階)
    for (; t < 4000 && s.state === 'playing'; t++) {
      const pl = s.player;
      const B = dp.lifts()[1];
      const by = B.plates[0].y;
      const ground = pl.state === 'ground';
      const on = (id) => ground && pl.girder === id;
      if (pl.state === 'ladder') {
        keys('ArrowUp'); // ハシゴは上へ登りきる
      } else if (!ground) {
        keys(); // 空中では何も押さない(着地したらすぐ次の操作)
      } else if (phase === 'boardA') {
        // 地面を右へ歩いてリフト A の下で待つ(上がってくる板に乗る)
        keys(...(Math.abs(pl.x - 88) > 1 ? [pl.x < 88 ? 'ArrowRight' : 'ArrowLeft'] : []));
        if (pl.girder && pl.girder[0] === 'A') { phase = 'exitA'; log.boardA = t; }
      } else if (phase === 'exitA') {
        // 板が降りる階とほぼ同じ高さ(±6px)に来たら右へ跳ぶ
        if (on(exitFloor)) { phase = rt === 'c2' ? 'toS3' : 'toS1'; log.exitA = t; keys(); }
        else if (Math.abs(pl.y - lvl) <= 6) keys('ArrowRight', ' ');
        else keys();
      } else if (phase === 'toU1') {
        // 下ルート: 地面 → u1 → u2 → u3(どれも右上へ 28px)
        if (on('u1')) phase = 'toU2';
        else walkJump(pl, 188, 1);
      } else if (phase === 'toU2') {
        if (on('u2')) phase = 'toU3';
        else walkJump(pl, 228, 1);
      } else if (phase === 'toU3') {
        if (on('u3')) { phase = 'toP1'; log.u3 = t; }
        else walkJump(pl, 281, 1);
      } else if (phase === 'toP1') {
        // u3 → P1(右上へ 26px。B の縦穴の下のがれき)→ M1(左上へ 20px)→ 1 階(左へ)→ がれきの階段(別ルートと同じ)
        if (on('P1')) { phase = 'toM1'; log.p1 = t; }
        else walkJump(pl, 334, 1);
      } else if (phase === 'toM1') {
        if (on('M1')) { phase = 'toC1'; log.m1 = t; }
        else walkJump(pl, 359, -1);
      } else if (phase === 'toC1') {
        if (on('c1')) { phase = 'toS1'; log.c1 = t; }
        else walkJump(pl, 310, -1);
      } else if (phase === 'toS1') {
        // 1 階 → がれき 1 段目(左上へ)→ 2 段目(左上へ)→ 3 段目(左上へ)。
        // 1 階の右端は x=272 なので、跳べる範囲(x 257〜272)の真ん中から跳ぶ
        if (on('s1')) phase = 'toS2';
        else if (walkJump(pl, 264, -1)) {}
      } else if (phase === 'toS2') {
        if (on('s2')) phase = 'toS3b';
        else walkJump(pl, 240, -1);
      } else if (phase === 'toS3b') {
        if (on('s3')) phase = 'toC2b';
        else walkJump(pl, 202, -1);
      } else if (phase === 'toS3') {
        // 2 階・左の右端から歩いて、がれき 3 段目へ降りる
        if (on('s3')) phase = 'toC2b';
        else keys('ArrowRight');
      } else if (phase === 'toC2b') {
        // がれき 3 段目 → 2 階・中(右上へ)→ 2 階・右(28px のすき間を右へ)
        if (on('c2b')) phase = 'toC2c';
        else walkJump(pl, 180, 1);
      } else if (phase === 'toC2c') {
        if (on('c2c')) { phase = 'toB'; log.c2c = t; }
        else walkJump(pl, 240, 1);
      } else if (phase === 'toB') {
        // 踏み切り位置まで歩き、着地(約 38 ステップ後)のときにリフト B が同じ階に「上り」で止まっているよう跳ぶ
        const floorY = 320;
        if (pl.girder && pl.girder[0] === 'B') { phase = 'rideB'; log.boardB = t; keys(); }
        else if (Math.abs(pl.x - TAKEOFF_B) > 1) keys(pl.x < TAKEOFF_B ? 'ArrowRight' : 'ArrowLeft');
        else {
          let arrive = -1;
          let stay = 0;
          if (B.dir < 0 && Math.abs(by - floorY) < 0.01 && B.pause > 0) { arrive = 0; stay = B.pause; }
          // B は上(屋上の高さ)から降りてきて 2 階に着く。止まる時間が短い周回では、着く前から跳ぶ
          else if (B.dir > 0 && B.pause === 0 && by < floorY) { arrive = (floorY - by) / B.speed; stay = B.pauseFrames; }
          if (arrive >= 0 && arrive <= 36 && arrive + stay >= 40) keys('ArrowRight', ' ');
          else keys();
        }
      } else if (phase === 'rideB') {
        // 屋上の高さ(160)で止まったら、床の真ん中から左へ跳んで屋上の端のがれきへ
        if (on('bs')) { phase = 'toRoof'; log.exitB = t; keys(); }
        else if (Math.abs(by - 160) < 0.01 && B.pause > 0) walkJump(pl, 364, -1);
        else keys();
      } else if (phase === 'toRoof') {
        // がれき → 屋上(少し低い)へ左へ跳ぶ
        if (on('b')) phase = 'toLadder';
        else walkJump(pl, 314, -1);
      } else if (phase === 'toLadder') {
        keys(Math.abs(pl.x - 288) > 1 ? (pl.x < 288 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp');
        if (pl.girder === 'top') phase = 'girl';
      } else if (phase === 'girl') {
        keys(pl.x > 205 ? 'ArrowLeft' : 'ArrowRight');
      }
      s = dp.step(1);
    }
    keys();
    return { state: s.state, deathReason: s.deathReason, seconds: t / 60, log, phase };
  }, route);
}

test('L1. 3 面は 1・2 面のあとに並び、地面・1 階・割れた 2 階・がれきの階段・崩れた屋上・ガールの足場・右の小さな足場・2 つのリフトでできている', async ({ page }) => {
  const s = await start3(page);
  expect(await page.evaluate(() => window.__dp.stageIds())).toEqual(['girders', 'livehouse', 'squat']);
  const lv = await level(page);
  const byId = Object.fromEntries(lv.girders.map((g) => [g.id, g]));
  // 固定の足場はすべて平ら。段の間隔はハシゴやリフトを使わずに落ちるとミスになる高さ(48px)より大きい
  for (const g of lv.girders) if (g.kind !== 'lift') expect(g.y1).toBe(g.y2);
  expect([byId.f0.y1, byId.c1.y1, byId.c2a.y1, byId.b.y1, byId.top.y1]).toEqual([540, 430, 320, 160, 82]);
  // 2 階は 3 つに割れている: 左と中の間は がれきの階段の穴、中と右の間は 28px のすき間
  expect(['c2a', 'c2b', 'c2c'].map((id) => [byId[id].x1, byId[id].x2, byId[id].y1])).toEqual([[112, 152, 320], [216, 252, 320], [280, 340, 320]]);
  expect(byId.c2c.x1 - byId.c2b.x2).toBe(28);
  // がれきの階段: 1 段 28px ずつ高くなる 3 段(1 階 430 → 402 → 374 → 346 → 2 階 320 へ跳び上がる)
  expect(['s1', 's2', 's3'].map((id) => [byId[id].kind, byId[id].y1])).toEqual([['rubble', 402], ['rubble', 374], ['rubble', 346]]);
  // 上の 2 段は 2 階の床の真下にない(真下だと跳んだときに頭が床の裏にぶつかる)。主人公の当たり判定の半分 7px も含めて
  for (const id of ['s2', 's3']) {
    for (const f of ['c2a', 'c2b', 'c2c']) expect(byId[id].x2 + 7 <= byId[f].x1 || byId[id].x1 - 7 >= byId[f].x2 || id === 's3').toBe(true);
  }
  // 屋上の右端は崩れていて、リフト B との間に がれき(bs)が 1 つ残っている。r2 は 2 階より 24px 高い
  expect([byId.b.x2, byId.bs.x1, byId.bs.x2, byId.bs.y1]).toEqual([296, 304, 344, 152]);
  expect(byId.r2.y1).toBe(296);
  // リフトの板・床は幅 24px(はじめの 48px の半分。縦穴の中心 x=88 / 364 は同じ)。
  // 1 階・2 階・屋上・右の足場との間には 12px のすき間がある(歩いては渡れず、ジャンプで渡る)
  const L = await lifts(page);
  expect(L.A.type).toBe('loop');
  expect(L.B.type).toBe('shuttle');
  for (const id of ['A', 'B']) expect(L[id].x2 - L[id].x1).toBe(24);
  expect((L.A.x1 + L.A.x2) / 2).toBe(88);
  expect((L.B.x1 + L.B.x2) / 2).toBe(364);
  for (const id of ['c1', 'c2a']) expect(byId[id].x1 - L.A.x2).toBe(12);
  expect(L.B.x1 - byId.c2c.x2).toBe(12);
  // 1 階の右端は x=272 で、リフト B との間は 80px あいている(下ルートの縦の空き)
  expect([byId.c1.x1, byId.c1.x2]).toEqual([112, 272]);
  expect(L.B.x1 - byId.c1.x2).toBe(80);
  // 下ルートの崩れた足場: 地面から 28px ずつ高くなる 3 つ(540 → 512 → 484 → 456 → P1 430)
  expect(['u1', 'u2', 'u3'].map((id) => [byId[id].kind, byId[id].x1, byId[id].x2, byId[id].y1])).toEqual([
    ['rubble', 212, 244, 512], ['rubble', 252, 298, 484], ['rubble', 306, 344, 456],
  ]);
  // リフト B の右の飛び石: r2(296)→ R1(274)→ R2(252)と右上へ 22px ずつ。R2 は画面の右端まで
  expect(['R1', 'R2'].map((id) => [byId[id].kind, byId[id].x1, byId[id].x2, byId[id].y1])).toEqual([
    ['rubble', 420, 442, 274], ['rubble', 456, 480, 252],
  ]);
  // 飛び石は B の縦穴(x 352〜376)より右で、どれも r2 の上にある(歩いて降りれば r2 に着く)
  for (const id of ['R1', 'R2']) {
    expect(byId[id].x1).toBeGreaterThan(L.B.x2 + 7);
    expect(byId[id].x1).toBeGreaterThanOrEqual(byId.r2.x1);
  }
  // 上の石(R2)は下の石(R1)の真上に来ない(体の幅の半分 7px も含めて。R1 から跳んでも頭をぶつけない)
  expect(byId.R1.x2 + 7).toBeLessThan(byId.R2.x1);
  // r2 から R1 へ跳ぶ踏み切り位置(x 384〜398)の真上にも石がない
  for (const id of ['R1', 'R2']) expect(byId[id].x1 - 7).toBeGreaterThan(398);
  // 右上の棚と飛び石: B の最上段(160)→ K1(150)→ K2(126)→ K3(102)。K1 は画面の右端まで届く横長の棚で、
  // 左端は B の床の右端(x376)のすぐ右。K2・K3 は K1 の上(歩いて降りれば下の段に着く)
  expect(['K1', 'K2', 'K3', 'M1'].map((id) => [byId[id].kind, byId[id].x1, byId[id].x2, byId[id].y1])).toEqual([
    ['rubble', 378, 480, 150], ['rubble', 420, 448, 126], ['rubble', 456, 480, 102], ['rubble', 276, 322, 410],
  ]);
  expect(byId.K1.x1).toBeGreaterThan(L.B.x2);
  expect(L.B.stops[L.B.stops.length - 1]).toBeGreaterThan(byId.K1.y1); // B は K1 より上へは来ない(重ならない)
  expect(byId.K2.x2 + 7).toBeLessThan(byId.K3.x1); // K3 は K2 の真上に来ない(K2 から跳んでも頭をぶつけない)
  // M1 は 1 階の右端の 4px 右から始まり、1 階より 20px 高い。2 階・右の裏(y328)との間に主人公の背の高さ以上あいている。
  // 右端は下ルートの P1 → M1 のため x=322 まで延ばしてあり、u3 の左寄りの上にかかる(u3 に立っても頭は M1 の裏より下)
  expect([byId.M1.x1 - byId.c1.x2, byId.c1.y1 - byId.M1.y1]).toEqual([4, 20]);
  expect(byId.M1.y1 - 26).toBeGreaterThan(byId.c2c.y1 + 8);
  expect(byId.u3.y1 - 26).toBeGreaterThan(byId.M1.y1 + 8);
  // P1(B の縦穴の下のがれき。B の 1 階乗り場の跡): 1 階と同じ高さ。u3 の右端に立った体がめり込まない x=352 から、
  // r1 の左端(388)まですき間なくつながる(跳びすぎても穴に落ちない)
  expect([byId.P1.kind, byId.P1.x1, byId.P1.x2, byId.P1.y1]).toEqual(['rubble', 352, 388, 430]);
  expect(byId.P1.x1).toBeGreaterThan(byId.u3.x2 + 7);
  expect(byId.r1.x1 - byId.P1.x2).toBe(0);
  // P1 に立っても、頭(足元 - 26px)は 2 階に止まった B の裏・2 階・右の裏(y328)より十分下
  expect(byId.P1.y1 - 26 - 38).toBeGreaterThan(byId.c2c.y1 + 8); // 真上に跳んだ最高点でも当たらない
  // u3 はリフト B の床の真下にかからない(体の幅の半分 7px も含めて)
  expect(byId.u3.x2 + 7).toBeLessThan(L.B.x1);
  // u3 に立っても頭(足元 - 26px)は 1 階の高さより下にあり、ほかの足場の中にもぐらない
  for (const g of lv.girders) {
    if (g.kind === 'lift' || g.id === 'u3') continue;
    const overlapX = g.x2 >= byId.u3.x1 - 7 && g.x1 <= byId.u3.x2 + 7;
    const overlapY = g.y1 + 8 > byId.u3.y1 - 26 && g.y1 < byId.u3.y1;
    expect(overlapX && overlapY, g.id).toBe(false);
  }
  expect(byId.r1.x1 - L.B.x2).toBe(12);
  // 速さ・動く範囲は幅を変える前と同じ
  expect([L.A.speed, L.A.top, L.A.bottom, L.B.speed]).toEqual([0.5, 240, 540, 0.6]);
  // リフト B は 2 階(320)⇔ 屋上の高さ(160)の往復(1 階へは降りない)
  expect(L.B.stops).toEqual([320, 160]);
  // B の最下段より下の縦穴にある足場は P1 だけ(ほかは穴)
  expect(lv.girders.filter((g) => g.kind !== 'lift' && g.y1 > 320 && g.x2 > L.B.x1 && g.x1 < L.B.x2).map((g) => g.id)).toEqual(['P1']);
  // ハシゴは屋上 → ガールの足場の 1 本だけ(1 階 → 2 階のハシゴは、がれきの階段に置き換えた)
  expect(lv.ladders.map((l) => [l.lower, l.upper, l.x])).toEqual([['b', 'top', 288]]);
  for (const l of lv.ladders) {
    expect(l.bottomY).toBe(byId[l.lower].y1);
    expect(l.topY).toBe(byId[l.upper].y1);
  }
  // ゴリラ警官・ガールは 1・2 面と同じ位置。敵・障害物はまだ出ない
  expect([s.boss.x, s.boss.y, s.heroine.x, s.heroine.y]).toEqual([56, 160, 210, 82]);
  await page.evaluate(() => window.__dp.placePlayer('f0', 200)); // リフトに乗らない場所で待つ
  const later = await step(page, 600);
  expect(later.state).toBe('playing');
  expect(later.hazards).toEqual([]);
  expect(later.enemies).toEqual([]);
});

test('L2. 実際のキー操作で、メインルート(2 階・左で降りる)・別ルート(1 階で降りて がれきの階段)・下ルート(崩れた足場 → P1 → M1 → 1 階 → がれきの階段)とも最初から最後までジャンプでクリアでき、最短は約 20 秒', async ({ page }) => {
  const times = {};
  for (const route of ['c2', 'c1', 'low']) {
    // クリア時間を測るので鉄球の当たり判定は止める(鉄球は通算ステップで揺れるので、待つ時間が毎回変わるため)
    await start3(page, 1, { ball: false });
    const r = await playRoute(page, route);
    expect(r.state, route).toBe('escape'); // ガールに触れて逃走演出へ
    times[route] = r.seconds;
    if (route === 'low') {
      // 下ルートはリフト A に寄らず、u3 → P1 → M1 → 1 階 と渡ってから、がれきの階段で 2 階へ上がり、2 階で B に乗る
      expect(r.log.boardA).toBeUndefined();
      expect(r.log.u3).toBeLessThan(r.log.p1);
      expect(r.log.p1).toBeLessThan(r.log.m1);
      expect(r.log.m1).toBeLessThan(r.log.c1);
      expect(r.log.c1).toBeLessThan(r.log.c2c);
      expect(r.log.c2c).toBeLessThan(r.log.boardB);
    } else {
      expect(r.log.boardA).toBeLessThan(120); // スタートからすぐリフト A に乗れる
    }
    expect(r.seconds).toBeGreaterThanOrEqual(17);
    expect(r.seconds).toBeLessThanOrEqual(22);
    // 逃走演出が終わるとクリア表示
    let s = await snap(page);
    for (let i = 0; i < 900 && s.state === 'escape'; i++) s = await step(page, 1);
    expect(s.state).toBe('clear');
  }
  console.log('L2 クリア時間(秒):', JSON.stringify(times));
});

test('L3. 循環リフト A: 地面でリフトの下に立っていると上がってくる板に乗り、一定の速さで上へ運ばれる', async ({ page }) => {
  await start3(page);
  const A = (await lifts(page)).A;
  expect(A.speed).toBe(0.5);
  // 板は同じ間隔で並んで上がる
  const ys = A.plates.map((p) => p.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(A.spacing, 5);
  await page.evaluate(() => window.__dp.placePlayer('f0', 88));
  let s;
  for (let i = 0; i < 200; i++) {
    s = await step(page, 1);
    if (s.player.girder && s.player.girder[0] === 'A') break;
  }
  expect(s.player.girder[0]).toBe('A');
  expect(s.player.state).toBe('ground');
  const y0 = s.player.y;
  s = await step(page, 60);
  expect(s.player.y).toBeCloseTo(y0 - 30, 5); // 0.5 px × 60 ステップ
  expect(s.player.state).toBe('ground');
  expect(s.state).toBe('playing');
});

test('L4. 循環リフト A: 乗り過ごすと上端で板が消え、その場から落ちて落下のミス(歯車によるミスはない)', async ({ page }) => {
  await start3(page);
  // 2 階より上を上がっている板に乗せて、そのまま待つ
  const A = (await lifts(page)).A;
  const plate = A.plates.filter((p) => p.y < 300).sort((a, b) => b.y - a.y)[0];
  await page.evaluate((id) => window.__dp.placePlayer(id, 88), plate.id);
  let s;
  let sawAir = false;
  for (let i = 0; i < 400; i++) {
    s = await step(page, 1);
    if (s.player.state === 'air') sawAir = true;
    if (s.state !== 'playing') break;
  }
  expect(sawAir).toBe(true); // 板が消えて落ちた
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('fall');
});

test('L5. 循環リフト A から降りる: 板が階とほぼ同じ高さのときに右へ跳ぶと 2 階・左 / 1 階へ降りられる。歩いて踏み出すと、すき間から落ちる', async ({ page }) => {
  // 高さ y にいちばん近い板の id
  const plateNear = async (y) => (await lifts(page)).A.plates.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a)).id;
  for (const [floor, y] of [['c2a', 320], ['c1', 430]]) {
    await start3(page);
    // 板が階より 4px 低い所に来たら、右へ歩きながらジャンプ
    await page.evaluate((pid) => window.__dp.placePlayer(pid, 92), await plateNear(y + 60));
    let s;
    for (let i = 0; i < 400; i++) {
      s = await step(page, 1);
      if (s.player.y <= y + 4) break;
    }
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press('Space');
    for (let i = 0; i < 90; i++) {
      s = await step(page, 1);
      if (i > 2 && s.player.state === 'ground') break;
    }
    await page.keyboard.up('ArrowRight');
    expect(s.state).toBe('playing');
    expect(s.player.girder).toBe(floor);
  }
  // 板が 2 階と同じ高さでも、歩いて踏み出すと 12px のすき間から落ちる(落下のミス)
  await start3(page);
  await page.evaluate((pid) => window.__dp.placePlayer(pid, 96), await plateNear(380));
  let s;
  for (let i = 0; i < 400; i++) {
    s = await step(page, 1);
    if (s.player.y <= 320) break;
  }
  s = await hold(page, 'ArrowRight', 20);
  for (let i = 0; i < 200 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('fall');
});

test('L6. 往復リフト B: 2 階 ⇔ 屋上の高さを往復し、両端で止まって折り返す(2 階より下の 1 階へは降りない)。乗っている主人公も一緒に運ばれる', async ({ page }) => {
  await start3(page);
  const B0 = (await lifts(page)).B;
  expect(B0.speed).toBe(0.6);
  expect(B0.pauseFrames).toBe(60);
  // 2 往復分(約 22 秒)動きを記録する: 止まった高さと、止まったときに次へ進む向き
  const stops = [];
  let prev = null;
  let maxY = -Infinity;
  for (let i = 0; i < 1320; i++) {
    await step(page, 1);
    const B = (await lifts(page)).B;
    const y = B.plates[0].y;
    if (B.pause === B.pauseFrames && prev !== y) stops.push([y, B.dir]);
    expect(y).toBeGreaterThanOrEqual(160);
    expect(y).toBeLessThanOrEqual(320); // 緑線(2 階)より下へは降りない
    maxY = Math.max(maxY, y);
    prev = y;
  }
  expect(maxY).toBe(320);
  // 止まるのは 2 階と屋上の高さだけ。2 階では上り(-1)、屋上の高さでは下り(1)へ折り返す
  expect(stops.length).toBeGreaterThanOrEqual(4);
  for (const [y, dir] of stops) expect([[320, -1], [160, 1]]).toContainEqual([y, dir]);
  for (let i = 1; i < stops.length; i++) expect(stops[i][0]).not.toBe(stops[i - 1][0]); // 交互に止まる
  // 1 往復は 約 654 ステップ(片道 160px ÷ 0.6 + 両端で 60 ステップずつ止まる)
  expect(B0.stops).toEqual([320, 160]);

  // 乗っている主人公は床と一緒に上下する
  await start3(page);
  const B = (await lifts(page)).B;
  await page.evaluate((id) => window.__dp.placePlayer(id, 364), B.plates[0].id);
  for (let i = 0; i < 300; i++) {
    const s = await step(page, 1);
    const by = (await lifts(page)).B.plates[0].y;
    expect(s.player.y).toBeCloseTo(by, 5);
    expect(s.player.state).toBe('ground');
  }
});

test('L7. すべてのジャンプが届く: 踏み切り位置を 1px ずつ変えて実際に跳び、着地できる範囲が十分あることを確かめる', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  // ジャンプの一覧: [名前, 踏み切る足場(B = 往復リフト), 踏み切り x の範囲, 向き, 着地する足場, B を止めておく高さ, 必要な範囲(px)]
  const JUMPS = [
    ['1 階 → がれき 1 段目', 'c1', [250, 272], -1, 's1', null, 16], // 1 階を短くして 30px → 16px(x 257〜272)
    ['がれき 1 段目 → 2 段目', 's1', [216, 246], -1, 's2', null, 22], // 2 段目の左端を延ばして 14px → 22px にした
    ['がれき 2 段目 → 3 段目', 's2', [192, 208], -1, 's3', null, 10],
    ['がれき 3 段目 → 2 階・中', 's3', [152, 192], 1, 'c2b', null, 16],
    ['2 階・中 → 2 階・右(28px のすき間)', 'c2b', [216, 252], 1, 'c2c', null, 20],
    ['2 階・右 → リフト B(2 階)', 'c2c', [280, 340], 1, 'B', 320, 16],
    // 下ルート(地面 → u1 → u2 → u3 → P1 → M1 → 1 階。リフト B は 1 階へ降りない)
    ['地面 → u1', 'f0', [140, 240], 1, 'u1', null, 30],
    ['u1 → u2', 'u1', [212, 244], 1, 'u2', null, 30],
    ['u2 → u3', 'u2', [252, 298], 1, 'u3', null, 26],
    // u3 の左寄りから跳ぶと、頭が延ばした M1 の裏に当たって u3 に戻る(ミスにはならない。テスト L35)
    ['u3 → P1(26px 高い)', 'u3', [306, 344], 1, 'P1', null, 18],
    ['P1 → M1(左上へ 20px)', 'P1', [352, 388], -1, 'M1', null, 13],
    ['M1 → 1 階(左へ)', 'M1', [276, 322], -1, 'c1', null, 16],
    ['リフト B(屋上の高さ)→ 屋上の端のがれき', 'B', [352, 376], -1, 'bs', 160, 22], // がれきを右へ延ばして 20px → 22px,
    ['屋上の端のがれき → 屋上', 'bs', [304, 344], -1, 'b', null, 41], // がれき(幅 40px)のどこからでも,
    ['リフト B(2 階)→ r2(24px 高い)', 'B', [352, 376], 1, 'r2', 320, 20],
    // リフト B の右の飛び石(r2 → R1 → R2。どれも右上へ 22px)
    ['r2 → R1', 'r2', [384, 442], 1, 'R1', null, 14],
    ['R1 → R2', 'R1', [420, 442], 1, 'R2', null, 20],
    ['P1 → r1(釘バット。同じ高さ)', 'P1', [352, 388], 1, 'r1', null, 30],
    // 右上の棚と飛び石(B の最上段 → K1 → K2 → K3)と、1 階の右の飛び石 M1
    ['リフト B(屋上の高さ)→ K1', 'B', [352, 376], 1, 'K1', 160, 24],
    ['K1 → K2', 'K1', [378, 448], 1, 'K2', null, 16],
    ['K2 → K3', 'K2', [420, 448], 1, 'K3', null, 24],
    ['1 階 → M1', 'c1', [220, 272], 1, 'M1', null, 16],
  ];
  const results = await page.evaluate((jumps) => {
    const dp = window.__dp;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    // ジャンプの届く範囲だけを測るので、鉄球の当たり判定は止めておく(鉄球はテスト L23〜L25 で確かめる)
    const fresh = () => { dp.setManual(true); dp.setWreckingBallEnabled(false); dp.setBirdsEnabled(false); dp.startStage(2); let s = dp.step(1); while (s.state !== 'playing') s = dp.step(1); };
    // B が高さ y に止まった直後まで進める(待つ間は主人公をリフトから離れた地面に置く)
    const waitB = (y) => { dp.placePlayer('f0', 200); for (let i = 0; i < 3000; i++) { const B = dp.lifts()[1]; if (Math.abs(B.plates[0].y - y) < 0.01 && B.pause === B.pauseFrames) return B; dp.step(1); } return null; };
    // dir の向きへ歩きながら跳び、着地したらすぐキーを離す。着地した足場の id(リフトなら 'B' / 'A')、ミスなら 'X'
    const jump = (dir) => {
      const k = dir > 0 ? 'ArrowRight' : 'ArrowLeft';
      key(k, true); key(' ', true);
      let s = dp.step(1);
      key(' ', false);
      for (let i = 0; i < 200; i++) { s = dp.step(1); if (s.player.state === 'ground' || s.state !== 'playing') break; }
      key(k, false);
      for (let i = 0; i < 3 && s.state === 'playing'; i++) s = dp.step(1);
      if (s.state !== 'playing') return 'X';
      const g = s.player.girder || 'air';
      return /^[AB]\d/.test(g) ? g[0] : g;
    };
    return jumps.map(([name, from, [x1, x2], dir, to, bAt]) => {
      const ok = [];
      for (let x = x1; x <= x2; x++) {
        fresh();
        let gid = from;
        if (bAt !== null) { const B = waitB(bAt); if (from === 'B') gid = B.plates[0].id; }
        dp.placePlayer(gid, x);
        if (jump(dir) === to) ok.push(x);
      }
      return { name, ok: ok.length, from: Math.min(...ok), to: Math.max(...ok) };
    });
  }, JUMPS);
  console.log('L7 着地できる踏み切り位置:\n' + results.map((r) => `  ${r.name}: ${r.ok}px(${r.from}〜${r.to})`).join('\n'));
  for (let i = 0; i < JUMPS.length; i++) {
    const r = results[i];
    // 着地できる踏み切り位置が、必要な範囲(px)以上ある
    expect(r.ok, r.name + `(着地できた踏み切り位置 ${r.from}〜${r.to})`).toBeGreaterThanOrEqual(JUMPS[i][6]);
  }
});

test('L7c. 近道はできない: 2 階・右から r2 へは届かない。リフト B から屋上へ直接は届かない(がれきを経由する)。屋上の端のがれきから歩いて降りると落ちる', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const r = await page.evaluate(() => {
    const dp = window.__dp;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    const fresh = () => { dp.setManual(true); dp.setBirdsEnabled(false); dp.startStage(2); let s = dp.step(1); while (s.state !== 'playing') s = dp.step(1); };
    const waitB = (y) => { dp.placePlayer('f0', 200); for (let i = 0; i < 3000; i++) { const B = dp.lifts()[1]; if (Math.abs(B.plates[0].y - y) < 0.01 && B.pause === B.pauseFrames) return B; dp.step(1); } return null; };
    const land = (k, s) => { for (let i = 0; i < 200; i++) { s = dp.step(1); if (s.player.state === 'ground' || s.state !== 'playing') break; } key(k, false); for (let i = 0; i < 3 && s.state === 'playing'; i++) s = dp.step(1); return s.state !== 'playing' ? 'X' : s.player.girder; };
    const jump = (dir) => { const k = dir > 0 ? 'ArrowRight' : 'ArrowLeft'; key(k, true); key(' ', true); const s = dp.step(1); key(' ', false); return land(k, s); };
    const walk = (dir) => { const k = dir > 0 ? 'ArrowRight' : 'ArrowLeft'; key(k, true); let s; for (let i = 0; i < 40; i++) { s = dp.step(1); if (s.player.state === 'air') break; } return land(k, s); };
    const out = { c2cToR2: [], bToRoof: [], bsWalk: null, walkToS3: null, r2WalkToB: null };
    // 2 階・右のどこから跳んでも r2 には着かない(B がいないとき)
    for (let x = 280; x <= 340; x += 2) { fresh(); waitB(160); dp.placePlayer('c2c', x); out.c2cToR2.push(jump(1)); }
    // B(屋上の高さ)のどこから左へ跳んでも、直接は屋上(b)に着かない
    for (let x = 352; x <= 376; x += 2) { fresh(); const B = waitB(160); dp.placePlayer(B.plates[0].id, x); out.bToRoof.push(jump(-1)); }
    fresh(); dp.placePlayer('bs', 306); out.bsWalk = walk(-1);
    // 2 階・左の右端から歩くと、がれき 3 段目に降りられる。r2 の左端から歩くと、2 階に止まっている B に降りられる
    fresh(); dp.placePlayer('c2a', 148); out.walkToS3 = walk(1);
    fresh(); waitB(320); dp.placePlayer('r2', 388); out.r2WalkToB = walk(-1);
    return out;
  });
  expect(r.c2cToR2).not.toContain('r2');
  expect(r.bToRoof).not.toContain('b');
  expect(r.bsWalk).toBe('X');
  expect(r.walkToS3).toBe('s3');
  expect(r.r2WalkToB).toMatch(/^B/);
});

test('L7b. リフトの板・床の見た目と当たり判定は一致する: 端ぎりぎりまで立てて、1px でも外へ出ると落ちる', async ({ page }) => {
  await start3(page);
  // 往復リフト B が 2 階(いちばん下の階)に止まっている間に確かめる
  for (let i = 0; i < 3000; i++) {
    const B = (await lifts(page)).B;
    if (Math.abs(B.plates[0].y - 320) < 0.01 && B.pause === B.pauseFrames) break;
    await step(page, 1);
  }
  await page.waitForTimeout(80);
  const B = (await lifts(page)).B;
  const y = Math.round(B.plates[0].y);
  // 描かれている黄色の範囲 = 当たり判定の範囲(x1〜x2)
  const px = await page.evaluate(([x1, x2, yy]) => {
    const ctx = document.getElementById('game').getContext('2d');
    const at = (x) => Array.from(ctx.getImageData(x, yy + 1, 1, 1).data.slice(0, 3)).join(',');
    return { left: at(x1), right: at(x2 - 1), outL: at(x1 - 1), outR: at(x2) };
  }, [B.x1, B.x2, y]);
  expect(px.left).toBe('255,210,60');
  expect(px.right).toBe('255,210,60');
  expect(px.outL).not.toBe('255,210,60');
  expect(px.outR).not.toBe('255,210,60');
  // 端の上には立っていられる
  for (const x of [B.x1, B.x2]) {
    await page.evaluate(([id, px2]) => window.__dp.placePlayer(id, px2), [B.plates[0].id, x]);
    const s = await step(page, 2);
    expect(s.player.state).toBe('ground');
    expect(s.player.girder).toBe(B.plates[0].id);
  }
  // 1 歩でも外へ出ると落ちはじめる
  await page.evaluate(([id, px2]) => window.__dp.placePlayer(id, px2), [B.plates[0].id, B.x2]);
  const s = await hold(page, 'ArrowRight', 1);
  expect(s.player.state).toBe('air');
});

test('L8. 往復リフト B がいないときに縦穴へ踏み出すと、真下の穴へ落ちて落下のミス', async ({ page }) => {
  await start3(page);
  // B が 2 階より上にいる間に、2 階・右の右端から踏み出す
  for (let i = 0; i < 2000; i++) {
    const B = (await lifts(page)).B;
    if (B.plates[0].y < 250) break;
    await step(page, 1);
  }
  await page.evaluate(() => window.__dp.placePlayer('c2c', 336));
  let s = await hold(page, 'ArrowRight', 10);
  for (let i = 0; i < 300 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('fall');
});

test('L9. リフトの上でもジャンプでき、同じリフトに戻れる。上がってくる往復リフトへ、着く前から跳んでも乗れる', async ({ page }) => {
  await start3(page);
  // 循環リフト A の上でその場ジャンプ → 上がり続ける板に着地する(ミスにならない)
  const A = (await lifts(page)).A;
  const plate = A.plates.sort((a, b) => b.y - a.y)[1];
  await page.evaluate((id) => window.__dp.placePlayer(id, 88), plate.id);
  await page.keyboard.press('Space');
  let s = await step(page, 1);
  expect(s.player.state).toBe('air');
  for (let i = 0; i < 90 && s.player.state !== 'ground'; i++) s = await step(page, 1);
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe(plate.id);
  expect(s.state).toBe('playing');

  // 往復リフト B が屋上の高さより 12px 下から上がってくるところで、屋上の端のがれきから右へ跳ぶ → 上がってきた B に着地
  // (B は 2 階より下へ降りなくなったので、2 階では「下から上がってくる B」は来ない)
  await start3(page);
  for (let i = 0; i < 3000; i++) {
    const B = (await lifts(page)).B;
    const y = B.plates[0].y;
    if (B.dir < 0 && B.pause === 0 && y >= 171.5 && y <= 172.5) break;
    await step(page, 1);
  }
  await page.evaluate(() => window.__dp.placePlayer('bs', 314));
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  for (let i = 0; i < 90; i++) {
    s = await step(page, 1);
    if (i > 2 && s.player.state === 'ground') break;
  }
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('playing');
  expect(s.player.girder[0]).toBe('B');
});

test('L10. 周回ごとにリフトが速くなり、往復リフトの止まる時間が短くなる。3 周目でもクリアできる', async ({ page }) => {
  const cfg = await (async () => { await page.goto('./?test'); return page.evaluate(() => window.DP.config.lift); })();
  for (const round of [1, 2, 3, 4]) {
    await start3(page, round);
    const L = await lifts(page);
    const i = Math.min(round, 3) - 1;
    expect(L.A.speed).toBe(cfg.loop.speed[i]);
    expect(L.B.speed).toBe(cfg.shuttle.speed[i]);
    expect(L.B.pauseFrames).toBe(cfg.shuttle.pause[i]);
  }
  expect(cfg.loop.speed[0]).toBeLessThan(cfg.loop.speed[2]);
  expect(cfg.shuttle.pause[0]).toBeGreaterThan(cfg.shuttle.pause[2]);
  // 3 周目も最短ルートでクリアできる(B は 2 階に 24 ステップしか止まらないので、降りてくる B へ着く前から跳ぶ)
  await start3(page, 3, { ball: false });
  const r = await playRoute(page, 'c2');
  expect(r.state).toBe('escape');
});

test('L7d. がれき 3 段目 → 2 階・中: 2 階・左から右へ歩き続けて 3 段目に降り、歩きながら跳ぶとき、成功するタイミングが 12 フレーム以上ある', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const r = await page.evaluate(() => {
    const dp = window.__dp;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    const ok = [];
    // 3 段目に着地してから k ステップ目にジャンプを押す(右は押し続ける)
    for (let k = 0; k <= 30; k++) {
      dp.setManual(true); dp.setBirdsEnabled(false); dp.startStage(2);
      let s = dp.step(1);
      while (s.state !== 'playing') s = dp.step(1);
      dp.placePlayer('c2a', 146);
      key('ArrowRight', true);
      s = dp.snapshot();
      let n = -1;
      for (let i = 0; i < 300 && s.state === 'playing'; i++) {
        if (n < 0 && s.player.state === 'ground' && s.player.girder === 's3') n = 0;
        if (n >= 0) {
          if (n === k) key(' ', true);
          if (n === k + 1) key(' ', false);
          n++;
          if (n > k + 2 && s.player.state === 'ground' && s.player.girder !== 's3') break;
        }
        s = dp.step(1);
      }
      key('ArrowRight', false);
      for (let i = 0; i < 120 && s.state === 'playing' && s.player.state !== 'ground'; i++) s = dp.step(1);
      if (s.state === 'playing' && s.player.girder === 'c2b') ok.push(k);
    }
    return ok;
  });
  expect(r.length).toBeGreaterThanOrEqual(12);
  // 成功するタイミングは途切れずに続いている
  expect(r[r.length - 1] - r[0] + 1).toBe(r.length);
});

test('L7e. がれきの階段は、右キーを押し続けるだけで 3 段目 → 2 段目 → 1 段目 → 1 階と歩いて降りられる(実際のキー操作だけで確認)', async ({ page }) => {
  // 主人公の位置は一度も書き換えない。スタートから実際のキー操作でリフト A に乗り、右キーを押したまま
  // 1 回だけ跳んで 2 階・左へ移る(2 階・左へはリフト A から跳ぶしかない)。そのあとは右キーを離さず、ジャンプもしない
  await start3(page);
  let s = await snap(page);
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 100 && s.player.x < 87.5; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(Math.abs(s.player.x - 88)).toBeLessThan(1.5);
  // 上がってくる板に乗り、2 階の高さ近くまで運ばれるのを待つ
  for (let i = 0; i < 900 && !(s.player.girder && s.player.girder[0] === 'A' && s.player.y <= 326); i++) s = await step(page, 1);
  expect(s.player.girder[0]).toBe('A');
  await page.keyboard.down('ArrowRight'); // ここから最後まで押し続ける
  await page.keyboard.press('Space');
  s = await step(page, 1);
  for (let i = 0; i < 90 && s.player.state !== 'ground'; i++) s = await step(page, 1);
  expect(s.player.girder).toBe('c2a');

  // 右キーを押し続けるだけで、各段に順番に着地する(どの段も 26〜28px 下。落下のミスになる 48px より小さい)
  const landings = [];
  let cur = 'c2a';
  let fromY = null;
  for (let i = 0; i < 400 && s.state === 'playing'; i++) {
    s = await step(page, 1);
    if (s.player.state === 'air' && fromY === null) fromY = s.player.y;
    if (s.player.state === 'ground' && s.player.girder !== cur) {
      cur = s.player.girder;
      landings.push([cur, Math.round(s.player.y - fromY)]);
      fromY = null;
      if (cur === 'c1') break;
    }
    if (s.player.state === 'ground') fromY = null;
  }
  expect(s.state).toBe('playing');
  expect(landings).toEqual([['s3', 26], ['s2', 28], ['s1', 28], ['c1', 28]]);
  // 1 階に着いたあとも、そのまま右へ歩き続けられる(1 階の右端 x=272 は下ルートの縦の空きなので、その手前まで)
  const x0 = s.player.x;
  const n = Math.floor((272 - x0) / 1.4) - 1;
  expect(n).toBeGreaterThanOrEqual(5);
  s = await step(page, n);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('playing');
  expect(s.player.girder).toBe('c1');
  expect(s.player.x).toBeCloseTo(x0 + 1.4 * n, 5);
});

test('L11. がれきの階段を実際のキー操作で跳んで登り、2 階・中へ出られる(1 階 → 1 段目 → 2 段目 → 3 段目 → 2 階・中)', async ({ page }) => {
  await start3(page);
  await page.evaluate(() => window.__dp.placePlayer('c1', 264));
  // [踏み切り x, 向き, 着地する足場](1 階の右端は x=272 なので、1 段目へは x=264 から跳ぶ)
  for (const [x, dir, to] of [[264, -1, 's1'], [240, -1, 's2'], [202, -1, 's3'], [180, 1, 'c2b']]) {
    let s = await snap(page);
    const k0 = s.player.x < x ? 'ArrowRight' : 'ArrowLeft';
    if (Math.abs(s.player.x - x) > 1) {
      await page.keyboard.down(k0);
      for (let i = 0; i < 100 && Math.abs(s.player.x - x) > 1; i++) s = await step(page, 1);
      await page.keyboard.up(k0);
    }
    const k = dir > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(k);
    await page.keyboard.press('Space');
    for (let i = 0; i < 90; i++) {
      s = await step(page, 1);
      if (i > 2 && s.player.state === 'ground') break;
    }
    await page.keyboard.up(k);
    expect(s.state).toBe('playing');
    expect(s.player.girder).toBe(to);
  }
});

test('L12. 面の順番: 2 面をクリアすると 3 面、3 面をクリアすると 1 面(2 周目)へ戻る。3 面でも共通 BGM が流れる', async ({ page }) => {
  await start3(page);
  expect(await page.evaluate(() => window.__dp.music())).toBe('main');
  // 3 面をクリア(ガールに触れる)→ 逃走演出 → クリア表示 → ENTER で 1 面(2 周目)
  await page.evaluate(() => window.__dp.placePlayer('top', 240));
  await step(page, 1);
  await page.evaluate(() => window.__dp.placePlayer('top', 205));
  let s = await step(page, 1);
  expect(s.state).toBe('escape');
  for (let i = 0; i < 900 && s.state === 'escape'; i++) s = await step(page, 1);
  expect(s.state).toBe('clear');
  s = await step(page, 160);
  await page.keyboard.press('Enter');
  s = await step(page, 1);
  expect(s.state).toBe('ready');
  expect(s.stageId).toBe('girders');
  expect(s.round).toBe(2);
  expect(await page.evaluate(() => window.__dp.music())).toBe('main');
});

test('L13. 3 面の見た目: 灰色のコンクリートの足場と、黄黒のしま模様のリフトが描かれる', async ({ page }) => {
  await start3(page);
  await page.evaluate(() => window.__dp.placePlayer('f0', 300));
  await page.waitForTimeout(100);
  const L = await lifts(page);
  const by = Math.round(L.B.plates[0].y);
  const px = await page.evaluate((y) => {
    const ctx = document.getElementById('game').getContext('2d');
    const at = (x, yy) => Array.from(ctx.getImageData(x, yy, 1, 1).data.slice(0, 3));
    return { floor: at(200, 432), liftB: at(353, y + 1) };
  }, by);
  expect(px.floor).toEqual([124, 128, 136]); // #7c8088(コンクリート)
  expect(px.liftB).toEqual([255, 210, 60]); // #ffd23c(リフトの黄色)
});

test('L7f. がれき 1 段目 → 2 段目: 1 段目の右端から左へ 22px の範囲なら、どこから跳んでも 2 段目に着地できる。2 段目の左の延長部分(3 段目の真下)からは、その場で真上に跳べば 3 段目に乗れる(実際のキー操作で確認)', async ({ page }) => {
  // 2 段目は x 184〜208(幅 24px)。右端は 2 階・中の床の真下に入れないので延ばさない
  const tryJump = async (from, x, key) => {
    await start3(page);
    await page.evaluate(([id, px]) => window.__dp.placePlayer(id, px), [from, x]);
    await step(page, 1);
    if (key) await page.keyboard.down(key);
    await page.keyboard.press('Space');
    let s;
    for (let i = 0; i < 120; i++) {
      s = await step(page, 1);
      if (s.state !== 'playing' || (i > 1 && s.player.state === 'ground')) break;
    }
    if (key) await page.keyboard.up(key);
    s = await step(page, 3);
    return s.state === 'playing' ? s.player.girder : 'X';
  };
  for (let x = 225; x <= 246; x++) expect(await tryJump('s1', x, 'ArrowLeft'), `1 段目 x=${x} から左へ`).toBe('s2');
  for (const x of [184, 188, 191]) expect(await tryJump('s2', x, null), `2 段目 x=${x} から真上へ`).toBe('s3');
});

test('L7g. 屋上の端のがれき(幅 40px): 実際のキー操作で、リフト B(屋上の高さ)から跳び移って着地でき、そこから屋上へ跳べる。描かれた幅と当たり判定が一致する', async ({ page }) => {
  test.setTimeout(300000); // 1 ステップずつ進めながら何度も跳ぶので時間がかかる(全テストを並列で流すと 2 分を超えることがある)
  // B が屋上の高さ(160)に止まった直後まで進める(待つ間は主人公を地面に置く)
  const waitB160 = async () => {
    await page.evaluate(() => window.__dp.placePlayer('f0', 200));
    for (let i = 0; i < 3000; i++) {
      const B = (await lifts(page)).B;
      if (Math.abs(B.plates[0].y - 160) < 0.01 && B.pause === B.pauseFrames) return B;
      await step(page, 1);
    }
    throw new Error('B が屋上の高さに来ない');
  };
  // 本物のキーボードで dir の向きへ歩きながら跳び、着地(またはミス)まで進める
  const jump = async (dir) => {
    const k = dir > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(k);
    await page.keyboard.down('Space');
    let s = await step(page, 1);
    await page.keyboard.up('Space');
    for (let i = 0; i < 200 && s.player.state !== 'ground' && s.state === 'playing'; i++) s = await step(page, 1);
    await page.keyboard.up(k);
    s = await step(page, 2);
    return s;
  };

  // ① リフト B → がれき: 床の左端 3px(跳ぶとがれきの左を越える)を除き、左へ跳ぶとがれきに着地する。
  //    床の右端から跳ぶと、延ばした部分(x 324 より右)に着地する(延ばす前は届かずに落ちていた)
  const landedX = [];
  for (const x of [355, 360, 364, 370, 375, 376]) {
    await start3(page);
    const B = await waitB160();
    await page.evaluate(([id, px]) => window.__dp.placePlayer(id, px), [B.plates[0].id, x]);
    const s = await jump(-1);
    expect(s.state, `B の x=${x} から`).toBe('playing');
    expect(s.player.girder, `B の x=${x} から`).toBe('bs');
    expect(s.player.y).toBe(152);
    landedX.push(Math.round(s.player.x));
  }
  expect(landedX.filter((x) => x > 324).length).toBe(2);

  // ② がれき → 屋上: がれきの左端から右端(延長部分)まで、どこから左へ跳んでも屋上に着地する
  for (const x of [304, 314, 324, 334, 344]) {
    await start3(page);
    await page.evaluate((px) => window.__dp.placePlayer('bs', px), x);
    const s = await jump(-1);
    expect(s.state, `がれきの x=${x} から`).toBe('playing');
    expect(s.player.girder, `がれきの x=${x} から`).toBe('b');
  }

  // ③ B から跳び移ったその足で、がれきから屋上へ(続けてキー操作)
  await start3(page);
  const B = await waitB160();
  await page.evaluate((id) => window.__dp.placePlayer(id, 364), B.plates[0].id);
  let s = await jump(-1);
  expect(s.player.girder).toBe('bs');
  s = await jump(-1);
  expect(s.player.girder).toBe('b');

  // ④ 見た目と当たり判定: 描かれた灰色の範囲 = x 304〜344。両端ぎりぎりに立てて、1px 外へ出ると落ちる
  await start3(page);
  await page.waitForTimeout(80);
  const px = await page.evaluate(() => {
    const ctx = document.getElementById('game').getContext('2d');
    const at = (x) => Array.from(ctx.getImageData(x, 155, 1, 1).data.slice(0, 3)).join(',');
    return { left: at(304), right: at(343), outL: at(303), outR: at(344) };
  });
  const body = '124,128,136'; // girderColors.body (#7c8088)
  expect(px.left).toBe(body);
  expect(px.right).toBe(body);
  expect(px.outL).not.toBe(body);
  expect(px.outR).not.toBe(body);
  for (const x of [304, 344]) {
    await page.evaluate((p2) => window.__dp.placePlayer('bs', p2), x);
    const t = await step(page, 2);
    expect(t.player.state).toBe('ground');
    expect(t.player.girder).toBe('bs');
  }
  await page.evaluate(() => window.__dp.placePlayer('bs', 344));
  s = await hold(page, 'ArrowRight', 1);
  expect(s.player.state).toBe('air');
});

// Playwright の本物のキーボード入力(page.keyboard)だけで 3 面を最初から最後まで進める。
// route: 'c2'(通常ルート: リフト A → 2 階 → リフト B)/
// 'low'(下ルート: 崩れた足場 u1 → u2 → u3 → P1 → M1 → 1 階 → がれきの階段 → 2 階 → リフト B)。
// 位置の書き換えはせず、毎ステップ状態を見てキーを押す・離すだけ。通った足場の順番と、ガールに触れたときの状態を返す
async function playWithKeyboard(page, route, opts = {}) {
  const held = new Set();
  // 押しておくキーをまとめて指定する(それ以外は離す)
  const keys = async (...ks) => {
    for (const k of [...held]) if (!ks.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of ks) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const read = () => page.evaluate(() => ({ s: window.__dp.snapshot(), B: window.__dp.lifts()[1] }));
  const walkJump = async (pl, x, dir) => {
    if (Math.abs(pl.x - x) > 1) return keys(pl.x < x ? 'ArrowRight' : 'ArrowLeft');
    return keys(dir > 0 ? 'ArrowRight' : 'ArrowLeft', 'Space');
  };
  let phase = route === 'low' ? 'toU1' : 'boardA';
  const visited = [];
  // opts.detour: B が 2 階に止まったとき右の飛び石へ寄り道し(r2 → R1 → R2)、歩いて r2 へ降りて B に戻る
  let detourDone = !opts.detour;
  // opts.topDetour: B が最上段に止まったとき右上の棚へ寄り道し(K1 → K2 → K3)、歩いて K1 へ降り、
  // K1 の左端から最上段に止まっている B へ歩いて降りて戻る
  let topDone = !opts.topDetour;
  // opts.birds: パンクニワトリを見て避ける(近づいてきたら立ち止まり、ちょうどよいときにその場で真上に跳ぶ)
  // 鳥が来るまでのステップ数(来ないなら Infinity)。主人公の当たり判定(幅 14・高さ 26)と鳥の当たり判定
  // (幅 12・床から 4〜12px)が上下に重なりそうで、鳥が近づいてくるときだけ数える。止まって待つ前提で鳥の速さ 1.5 で割る
  const birdETA = (pl, birds) => {
    let best = Infinity;
    for (const b of birds) {
      const top = b.box.y - b.box.h;
      if (!(pl.y - 26 < b.box.y + 2 && top - 2 < pl.y)) continue; // 高さが違う
      const dx = b.x - pl.x;
      if (dx * b.dir > 0) continue; // もう通り過ぎた(遠ざかっている)
      best = Math.min(best, Math.max(0, Math.abs(dx) - 13) / 1.5);
    }
    return best;
  };
  const dodges = [];
  let { s, B } = await read();
  for (let t = 0; t < 4000 && s.state === 'playing'; t++) {
    const pl = s.player;
    const by = B.plates[0].y;
    const ground = pl.state === 'ground';
    const gid = pl.girder ? (/^[AB]\d/.test(pl.girder) ? pl.girder[0] : pl.girder) : null;
    if (ground && gid && visited[visited.length - 1] !== gid) visited.push(gid);
    const on = (id) => ground && gid === id;
    const eta = opts.birds ? birdETA(pl, s.birds) : Infinity;
    // ハシゴ(屋上 → ガールの足場)の下で、①の鳥が来る前に登りきれないときは屋上で待つ
    const ladderWait = opts.birds && phase === 'toLadder' && Math.abs(pl.x - 288) <= 1 &&
      s.birds.some((b) => b.line === 0 && (288 - b.x) * b.dir > -14 && Math.abs(288 - b.x) / 1.5 < 45);
    if (opts.birds && ground && eta <= 9) { dodges.push(gid); await keys('Space'); } // 鳥の上を跳び越える
    else if (opts.birds && ground && (eta <= 30 || ladderWait)) await keys(); // 立ち止まって待つ
    else if (pl.state === 'ladder') await keys('ArrowUp');
    else if (!ground) await keys();
    // 通常ルート
    else if (phase === 'boardA') { if (on('A')) phase = 'exitA'; else await keys(...(Math.abs(pl.x - 88) > 1 ? [pl.x < 88 ? 'ArrowRight' : 'ArrowLeft'] : [])); }
    else if (phase === 'exitA') { if (on('c2a')) phase = 'toS3'; else if (Math.abs(pl.y - 320) <= 6) await keys('ArrowRight', 'Space'); else await keys(); }
    else if (phase === 'toS3') { if (on('s3')) phase = 'toC2b'; else await keys('ArrowRight'); }
    // 鳥ありのとき: ②の鳥(右 → 左)が主人公の真上を通り過ぎて十分左へ行くまで、がれき 3 段目(鳥の高さより下)で待つ。
    // 2 階・中 → 2 階・右へは、鉄球が左の端寄り(中心 x ≤ 186)にいるときに跳ぶ(真上を通るときに跳ぶと当たる)
    else if (phase === 'toC2b') {
      if (on('c2b')) phase = 'toC2c';
      else if (opts.birds && s.birds.some((b) => b.line === 1 && b.x > pl.x - 30)) await keys();
      else await walkJump(pl, 180, 1);
    }
    else if (phase === 'toC2c') {
      if (on('c2c')) phase = 'toB';
      else if (Math.abs(pl.x - 240) <= 1 && s.wreckingBall.x > 186) await keys();
      else await walkJump(pl, 240, 1);
    }
    else if (phase === 'toB') {
      if (on('B')) phase = 'rideB';
      else if (Math.abs(pl.x - 311) > 1) await keys(pl.x < 311 ? 'ArrowRight' : 'ArrowLeft');
      else {
        let arrive = -1; let stay = 0;
        if (B.dir < 0 && Math.abs(by - 320) < 0.01 && B.pause > 0) { arrive = 0; stay = B.pause; }
        // B は上(屋上の高さ)から降りてきて 2 階に着く。止まる時間が短い周回では、着く前から跳ぶ
        else if (B.dir > 0 && B.pause === 0 && by < 320) { arrive = (320 - by) / B.speed; stay = B.pauseFrames; }
        if (arrive >= 0 && arrive <= 36 && arrive + stay >= 40) await keys('ArrowRight', 'Space'); else await keys();
      }
    }
    // 下ルート
    else if (phase === 'toU1') { if (on('u1')) phase = 'toU2'; else await walkJump(pl, 188, 1); }
    else if (phase === 'toU2') { if (on('u2')) phase = 'toU3'; else await walkJump(pl, 228, 1); }
    else if (phase === 'toU3') { if (on('u3')) phase = 'toP1'; else await walkJump(pl, 281, 1); }
    // u3 → P1(右上へ 26px)→ M1(左上へ 20px)→ 1 階(左へ)→ がれきの階段 → 2 階・中(別ルートと同じ)。
    // 鳥ありのとき: u3 と M1 は鳥の高さでない(当たらない)ので、③の鳥(左 → 右・1 階 y430)が
    // 着地する足場(P1 / 1 階)を通り過ぎるまでそこで待つ
    else if (phase === 'toP1') {
      if (on('P1')) phase = 'toM1';
      else if (opts.birds && s.birds.some((b) => b.line === 2 && b.x > 250 && b.x < 392)) await keys();
      else await walkJump(pl, 334, 1);
    }
    else if (phase === 'toM1') { if (on('M1')) phase = 'toC1'; else await walkJump(pl, 359, -1); }
    else if (phase === 'toC1') {
      if (on('c1')) phase = 'toS1';
      else if (opts.birds && s.birds.some((b) => b.line === 2 && b.x < 330)) await keys();
      else await walkJump(pl, 310, -1);
    }
    else if (phase === 'toS1') { if (on('s1')) phase = 'toS2'; else await walkJump(pl, 264, -1); }
    else if (phase === 'toS2') { if (on('s2')) phase = 'toS3b'; else await walkJump(pl, 240, -1); }
    else if (phase === 'toS3b') { if (on('s3')) phase = 'toC2b'; else await walkJump(pl, 202, -1); }
    // 寄り道: B(2 階)→ r2 → R1 → R2 → 歩いて r2 へ降りる → r2 の左端から 2 階に止まっている B へ歩いて降りる
    // (B の床のどこからでも r2 に届くので、B が 2 階に止まっていればその場ですぐ右へ跳ぶ)
    else if (phase === 'rideB' && !detourDone && on('B') && Math.abs(by - 320) < 0.01 && B.pause > 0) { phase = 'toR2floor'; await keys('ArrowRight', 'Space'); }
    else if (phase === 'toR2floor') { if (on('r2')) phase = 'toR1'; else await keys(); }
    else if (phase === 'toR1') { if (on('R1')) phase = 'toR2'; else await walkJump(pl, opts.r2Takeoff, 1); }
    else if (phase === 'toR2') { if (on('R2')) phase = 'backDown'; else await walkJump(pl, 431, 1); }
    else if (phase === 'backDown') { if (on('r2')) phase = 'backToB'; else await keys('ArrowLeft'); }
    else if (phase === 'backToB') {
      if (on('B')) { phase = 'rideB'; detourDone = true; await keys(); }
      else if (pl.x > 390) await keys('ArrowLeft');
      else if (Math.abs(by - 320) < 0.01 && B.pause >= 20) await keys('ArrowLeft'); // B が 2 階にいるときだけ左端から降りる
      else await keys();
    }
    // 寄り道(右上): B(最上段)→ K1 → K2 → K3 → 歩いて K2 → K1 へ降りる → K1 の左端から最上段の B へ歩いて降りる
    // (B の床のどこからでも K1 に届くので、B が最上段に止まっていればその場ですぐ右へ跳ぶ)
    else if (phase === 'rideB' && !topDone && on('B') && Math.abs(by - 160) < 0.01 && B.pause > 0) { phase = 'toK1'; await keys('ArrowRight', 'Space'); }
    else if (phase === 'toK1') { if (on('K1')) phase = 'toK2'; else await keys(); }
    else if (phase === 'toK2') { if (on('K2')) phase = 'toK3'; else await walkJump(pl, 392, 1); }
    else if (phase === 'toK3') { if (on('K3')) phase = 'downK'; else await walkJump(pl, 434, 1); }
    else if (phase === 'downK') { if (on('K1')) phase = 'backToBtop'; else await keys('ArrowLeft'); }
    else if (phase === 'backToBtop') {
      if (on('B')) { phase = 'rideB'; topDone = true; await keys(); }
      else if (pl.x > 384) await keys('ArrowLeft');
      else if (Math.abs(by - 160) < 0.01 && B.pause >= 20) await keys('ArrowLeft'); // B が最上段にいるときだけ左端から降りる
      else await keys();
    }
    // 共通: リフト B で屋上の高さへ → 屋上の端のがれき → 屋上 → ハシゴ → ガール
    else if (phase === 'rideB') { if (on('bs')) phase = 'toRoof'; else if (Math.abs(by - 160) < 0.01 && B.pause > 0) await walkJump(pl, 364, -1); else await keys(); }
    else if (phase === 'toRoof') { if (on('b')) phase = 'toLadder'; else await walkJump(pl, 314, -1); }
    else if (phase === 'toLadder') { if (on('top')) phase = 'girl'; else await keys(Math.abs(pl.x - 288) > 1 ? (pl.x < 288 ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp'); }
    else if (phase === 'girl') await keys(pl.x > 205 ? 'ArrowLeft' : 'ArrowRight');
    await page.evaluate(() => window.__dp.step(1));
    ({ s, B } = await read());
  }
  await keys();
  // last: 終わったときの主人公・鳥・鉄球(ミスしたときの原因を調べる用)
  return { state: s.state, deathReason: s.deathReason, visited, phase, dodges, lives: s.lives,
    last: { x: s.player.x, y: s.player.y, st: s.player.state, birds: s.birds.map((b) => [b.line, Math.round(b.x)]), ball: s.wreckingBall && [s.wreckingBall.x, s.wreckingBall.y] } };
}

test('L14. Playwright の本物のキーボード操作だけで、通常ルート(リフト A → 2 階 → リフト B)と下ルート(崩れた足場 u1 → u2 → u3 → P1 → M1 → 1 階 → がれきの階段 → 2 階 → リフト B)の両方を最初から最後まで通ってクリアできる', async ({ page }) => {
  test.setTimeout(180000);
  // 通常ルート: 1 階を短くしても、今までどおり 2 階を通ってクリアできる(下の足場には触れない)
  await start3(page);
  const main = await playWithKeyboard(page, 'c2');
  expect(main.state, `通常ルート: ${main.phase} で止まった(${main.deathReason})`).toBe('escape');
  expect(main.visited).toEqual(['f0', 'A', 'c2a', 's3', 'c2b', 'c2c', 'B', 'bs', 'b', 'top']);
  // 下ルート: 地面から崩れた足場を 3 つ跳んで登り、P1 → M1 → 1 階と渡って、がれきの階段から 2 階・中で通常ルートに合流してクリアできる
  // (リフト B は 1 階へ降りないので、B には 2 階で乗る)
  await start3(page);
  const low = await playWithKeyboard(page, 'low');
  expect(low.state, `下ルート: ${low.phase} で止まった(${low.deathReason})`).toBe('escape');
  // (スタートから右へ歩くとリフト A の下を通るので、上がってきた板に一瞬乗って地面へ降りることがある。そこは数えない)
  const afterGround = low.visited.slice(low.visited.lastIndexOf('f0'));
  expect(afterGround).toEqual(['f0', 'u1', 'u2', 'u3', 'P1', 'M1', 'c1', 's1', 's2', 's3', 'c2b', 'c2c', 'B', 'bs', 'b', 'top']);
});

test('L15. 下ルートの安全確認: u2 のどこから右へ跳んでもミスにならない(左寄りからは 1 階の床の裏に頭をぶつけて u2 に戻る)。u3・P1 に立っていても、リフト B は降りてこない(重ならない)', async ({ page }) => {
  // u2 の左寄り(x 252〜270。1 階の床の真下)から右へ跳ぶ → 頭をぶつけて落ちるが、u2 の上に戻ってミスにならない
  for (let x = 252; x <= 270; x += 2) {
    await start3(page);
    await page.evaluate((px) => window.__dp.placePlayer('u2', px), x);
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press('Space');
    let s = await step(page, 1);
    let minHead = Infinity;
    for (let i = 0; i < 120 && (s.player.state !== 'ground' || i < 3); i++) { s = await step(page, 1); minHead = Math.min(minHead, s.player.y - 26); }
    await page.keyboard.up('ArrowRight');
    expect(s.state, `u2 の x=${x} から`).toBe('playing');
    expect(s.player.girder, `u2 の x=${x} から`).toBe('u2');
    expect(minHead).toBeGreaterThanOrEqual(437.5); // 頭は 1 階の床の裏(y438)より上へ出ていない
  }
  // u3 の右端・P1 の真ん中(B の縦穴の真下)に立ったまま B が 1 往復以上しても、B は 2 階(y320)より下へ来ず、
  // 主人公はそのまま立っている(頭 y404 / y430 と B の裏 y328 の間は十分あく)
  for (const [gid, x] of [['u3', 340], ['P1', 364]]) {
    await start3(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [gid, x]);
    let s;
    let maxB = -Infinity;
    for (let i = 0; i < 700; i++) {
      s = await step(page, 1);
      const B = (await lifts(page)).B;
      maxB = Math.max(maxB, B.plates[0].y);
      expect(s.player.state).toBe('ground');
      expect(s.player.girder).toBe(gid);
      expect(s.state).toBe('playing');
    }
    expect(maxB).toBe(320);
    expect(s.player.y - 26).toBeGreaterThan(maxB + 8);
  }
});

test('L16. リフト B の右の飛び石: 本物のキーボード操作で、B(2 階)→ r2 → R1 → R2 と跳んで登り、歩いて r2 へ降り、2 階に止まった B へ歩いて戻ってクリアできる', async ({ page }) => {
  test.setTimeout(240000);
  // 通常ルートの途中(B に 2 階で乗ったあと)で寄り道する
  await start3(page);
  const r = await playWithKeyboard(page, 'c2', { detour: true, r2Takeoff: 391 });
  expect(r.state, `${r.phase} で止まった(${r.deathReason})`).toBe('escape');
  expect(r.visited).toEqual(['f0', 'A', 'c2a', 's3', 'c2b', 'c2c', 'B', 'r2', 'R1', 'R2', 'r2', 'B', 'bs', 'b', 'top']);
  // 下ルートの途中(P1 → M1 → 1 階 → がれきの階段 → 2 階で B に乗ったあと)でも寄り道できる
  await start3(page);
  const low = await playWithKeyboard(page, 'low', { detour: true, r2Takeoff: 391 });
  expect(low.state, `下ルート: ${low.phase} で止まった(${low.deathReason})`).toBe('escape');
  const tail = low.visited.slice(low.visited.lastIndexOf('f0'));
  expect(tail).toEqual(['f0', 'u1', 'u2', 'u3', 'P1', 'M1', 'c1', 's1', 's2', 's3', 'c2b', 'c2c', 'B', 'r2', 'R1', 'R2', 'r2', 'B', 'bs', 'b', 'top']);
});

test('L17. 飛び石から元のルートへ安全に戻れる: R1・R2 のどの端から歩いて降りても R1 か r2 に着地する。その場で跳んでも、R2 から右へ跳んでも落ちない。r2 の左端から歩けば 2 階に止まっている B に乗れる', async ({ page }) => {
  test.setTimeout(150000);
  // 本物のキーボードで歩き、着地(またはミス)まで進める
  const walkOff = async (id, x, key) => {
    await start3(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [id, x]);
    await page.keyboard.down(key);
    let s = await step(page, 1);
    for (let i = 0; i < 80 && s.player.state === 'ground' && s.player.girder === id; i++) s = await step(page, 1);
    for (let i = 0; i < 120 && s.player.state !== 'ground' && s.state === 'playing'; i++) s = await step(page, 1);
    await page.keyboard.up(key);
    s = await step(page, 2);
    return s;
  };
  // 歩いて降りる: [足場, 立つ位置, キー, 着地する足場]
  for (const [id, x, key, to] of [['R1', 422, 'ArrowLeft', 'r2'], ['R1', 440, 'ArrowRight', 'r2'], ['R2', 458, 'ArrowLeft', 'r2']]) {
    const s = await walkOff(id, x, key);
    expect(s.state, `${id} から ${key}`).toBe('playing');
    expect(s.player.girder, `${id} から ${key}`).toBe(to);
  }
  // R2 の右端(画面の端)へ歩いても落ちない
  await start3(page);
  await page.evaluate(() => window.__dp.placePlayer('R2', 466));
  let s = await hold(page, 'ArrowRight', 40);
  expect(s.player.state).toBe('ground');
  expect(s.player.girder).toBe('R2');
  // その場で跳ぶ・R2 から右へ跳ぶ → 同じ石に戻る
  for (const [id, x, keysDown] of [['R1', 431, []], ['R2', 468, []], ['R2', 460, ['ArrowRight']]]) {
    await start3(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [id, x]);
    for (const k of keysDown) await page.keyboard.down(k);
    await page.keyboard.press('Space');
    s = await step(page, 1);
    for (let i = 0; i < 120 && (s.player.state !== 'ground' || i < 3); i++) s = await step(page, 1);
    for (const k of keysDown) await page.keyboard.up(k);
    expect(s.state).toBe('playing');
    expect(s.player.girder).toBe(id);
  }
  // r2 の左端から歩くと、2 階に止まっている B に降りられる(B が 2 階にいないときに降りると穴へ落ちるのは今までどおり)
  await start3(page);
  for (let i = 0; i < 3000; i++) {
    const B = (await lifts(page)).B;
    if (Math.abs(B.plates[0].y - 320) < 0.01 && B.pause === B.pauseFrames) break;
    await step(page, 1);
  }
  await page.evaluate(() => window.__dp.placePlayer('r2', 388));
  s = await hold(page, 'ArrowLeft', 12);
  for (let i = 0; i < 60 && s.player.state !== 'ground'; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.player.girder).toMatch(/^B/);
});


test('L18. 落下のミスは踏み切った高さから測る: 跳んで 48px 以内の低い所へ降りるのは平気(R2 → r2・u3 → u2・K3 → K1)。それより低い所へ跳んで降りると今までどおりミス', async ({ page }) => {
  test.setTimeout(120000);
  // 本物のキーボードで dir の向きへ跳び、着地(またはミス)まで進める
  const jumpFrom = async (id, x, key, bAt = null) => {
    await start3(page);
    if (bAt !== null) await waitBAt(page, bAt);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [id, x]);
    await page.keyboard.down(key);
    await page.keyboard.press('Space');
    let s = await step(page, 1);
    for (let i = 0; i < 200 && (s.player.state !== 'ground' || i < 3) && s.state === 'playing'; i++) s = await step(page, 1);
    await page.keyboard.up(key);
    for (let i = 0; i < 3 && s.state === 'playing'; i++) s = await step(page, 1);
    return s;
  };
  // [足場, 立つ位置, 向き, 着地する足場, 落差]。修正前は最高点(踏み切りの約 38px 上)から測っていたのでどれもミスだった
  for (const [id, x, key, to] of [
    ['R2', 460, 'ArrowLeft', 'r2'], // 44px
    ['R2', 470, 'ArrowLeft', 'r2'],
    ['u3', 312, 'ArrowLeft', 'u2'], // 28px
    ['u3', 336, 'ArrowLeft', 'u2'],
    ['K3', 460, 'ArrowLeft', 'K1'], // 48px(ちょうど境目。48px を超えたらミス)
    ['K3', 470, 'ArrowLeft', 'K1'],
  ]) {
    const s = await jumpFrom(id, x, key);
    expect(s.state, `${id} の x=${x} から ${key}`).toBe('playing');
    expect(s.player.girder, `${id} の x=${x} から ${key}`).toBe(to);
  }
  // R1 から左へ跳ぶと r2 を越えて縦穴へ落ちる → 今までどおり落下のミス
  // (B が 2 階に止まっているときは B が受け止める(46px 下)ので、B が屋上の高さにいるときに確かめる)
  for (const x of [424, 436]) {
    const s = await jumpFrom('R1', x, 'ArrowLeft', 160);
    expect(s.state, `R1 の x=${x} から左へ`).toBe('dying');
    expect(s.deathReason).toBe('fall');
  }
});

test('L19. 右上の棚と飛び石: 本物のキーボード操作で、B(最上段)→ K1 → K2 → K3 と跳んで登り、歩いて K1 へ降り、K1 の左端から最上段の B へ歩いて戻ってクリアできる(通常ルート・下ルートとも)', async ({ page }) => {
  test.setTimeout(240000);
  await start3(page);
  const r = await playWithKeyboard(page, 'c2', { topDetour: true });
  expect(r.state, `${r.phase} で止まった(${r.deathReason})`).toBe('escape');
  expect(r.visited).toEqual(['f0', 'A', 'c2a', 's3', 'c2b', 'c2c', 'B', 'K1', 'K2', 'K3', 'K2', 'K1', 'B', 'bs', 'b', 'top']);
  await start3(page);
  const low = await playWithKeyboard(page, 'low', { topDetour: true });
  expect(low.state, `下ルート: ${low.phase} で止まった(${low.deathReason})`).toBe('escape');
  const tail = low.visited.slice(low.visited.lastIndexOf('f0'));
  expect(tail).toEqual(['f0', 'u1', 'u2', 'u3', 'P1', 'M1', 'c1', 's1', 's2', 's3', 'c2b', 'c2c', 'B', 'K1', 'K2', 'K3', 'K2', 'K1', 'B', 'bs', 'b', 'top']);
  // 右の飛び石(r2 → R1 → R2)と右上の棚の両方へ寄り道してもクリアできる
  await start3(page);
  const both = await playWithKeyboard(page, 'c2', { detour: true, r2Takeoff: 391, topDetour: true });
  expect(both.state, `${both.phase} で止まった(${both.deathReason})`).toBe('escape');
  expect(both.visited).toEqual(['f0', 'A', 'c2a', 's3', 'c2b', 'c2c', 'B', 'r2', 'R1', 'R2', 'r2', 'B', 'K1', 'K2', 'K3', 'K2', 'K1', 'B', 'bs', 'b', 'top']);
});

// B が高さ y に止まった直後まで進める(待つ間は主人公を地面に置く)
async function waitBAt(page, y) {
  await page.evaluate(() => window.__dp.placePlayer('f0', 200));
  for (let i = 0; i < 3000; i++) {
    const B = (await lifts(page)).B;
    if (Math.abs(B.plates[0].y - y) < 0.01 && B.pause === B.pauseFrames) return B;
    await step(page, 1);
  }
  throw new Error(`B が y=${y} に来ない`);
}

// B がいちばん下の 2 階にいる(最上段にいない)ときまで進める
async function waitBAway(page) {
  await page.evaluate(() => window.__dp.placePlayer('f0', 200));
  for (let i = 0; i < 3000; i++) {
    const B = (await lifts(page)).B;
    if (Math.abs(B.plates[0].y - 320) < 0.01) return B;
    await step(page, 1);
  }
  throw new Error('B が 2 階に来ない');
}

// 本物のキーボードで key を押したまま歩き、今の足場から降りて別の足場に着地する(またはミスする)まで進める
async function walkOffWith(page, key) {
  await page.keyboard.down(key);
  let s = await step(page, 1);
  const from = s.player.girder;
  for (let i = 0; i < 120 && s.state === 'playing' && !(s.player.state === 'ground' && s.player.girder !== from); i++) s = await step(page, 1);
  await page.keyboard.up(key);
  for (let i = 0; i < 3 && s.state === 'playing'; i++) s = await step(page, 1);
  return s;
}

test('L20. 右上の棚と飛び石から元のルートへ安全に戻れる: K3・K2 の端から歩いて降りると下の段に着地し、K1 の左端から歩けば最上段の B に乗れる。その場で跳んでも、画面の右端へ歩いても落ちない', async ({ page }) => {
  test.setTimeout(150000);
  // 歩いて降りる: [足場, 立つ位置, キー, 着地する足場]
  for (const [id, x, key, to] of [['K3', 458, 'ArrowLeft', 'K2'], ['K2', 422, 'ArrowLeft', 'K1'], ['K2', 446, 'ArrowRight', 'K1']]) {
    await start3(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [id, x]);
    const s = await walkOffWith(page, key);
    expect(s.state, `${id} から ${key}`).toBe('playing');
    expect(s.player.girder, `${id} から ${key}`).toBe(to);
  }
  // K1 の左端から歩くと、最上段に止まっている B に降りられる(左端を x=378 にしたので、踏み外した位置から B に届く)
  for (const x of [380, 390, 400]) {
    await start3(page);
    await waitBAt(page, 160);
    await page.evaluate((px) => window.__dp.placePlayer('K1', px), x);
    const s = await walkOffWith(page, 'ArrowLeft');
    expect(s.state, `K1 の x=${x} から左へ歩く`).toBe('playing');
    expect(s.player.girder, `K1 の x=${x} から左へ歩く`).toMatch(/^B/);
    expect(s.player.y).toBe(160);
  }
  // B が最上段にいないときに K1 の左端から降りると、縦穴へ落ちて落下のミス(r1・r2 の左端と同じ)
  await start3(page);
  await waitBAway(page);
  await page.evaluate(() => window.__dp.placePlayer('K1', 382));
  let s = await walkOffWith(page, 'ArrowLeft');
  for (let i = 0; i < 200 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('fall');
  // K1・K3 の右端(画面の端)へ歩いても落ちない
  for (const id of ['K1', 'K3']) {
    await start3(page);
    await page.evaluate((g) => window.__dp.placePlayer(g, 466), id);
    s = await hold(page, 'ArrowRight', 40);
    expect(s.player.state).toBe('ground');
    expect(s.player.girder).toBe(id);
  }
  // その場で真上に跳ぶ → 同じ足場に戻る(K1 は K2 の真下でない所から)
  for (const [id, x] of [['K1', 396], ['K1', 470], ['K2', 434], ['K3', 468]]) {
    await start3(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [id, x]);
    await page.keyboard.press('Space');
    s = await step(page, 1);
    for (let i = 0; i < 120 && (s.player.state !== 'ground' || i < 3); i++) s = await step(page, 1);
    expect(s.state).toBe('playing');
    expect(s.player.girder, `${id} の x=${x} で真上に跳ぶ`).toBe(id);
  }
  // 最上段の B のまん中から左へ跳べば、今までどおり屋上の端のがれきに着地する(K1 を足しても変わらない)
  await start3(page);
  const B = await waitBAt(page, 160);
  await page.evaluate((id) => window.__dp.placePlayer(id, 364), B.plates[0].id);
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.press('Space');
  s = await step(page, 1);
  for (let i = 0; i < 200 && (s.player.state !== 'ground' || i < 3); i++) s = await step(page, 1);
  await page.keyboard.up('ArrowLeft');
  expect(s.player.girder).toBe('bs');
});

test('L21. 1 階の右の飛び石 M1: 本物のキーボード操作で 1 階から跳び乗れ、歩いて降りれば 1 階か u3、左へ跳べば がれき 1 段目か 1 階に着地する', async ({ page }) => {
  test.setTimeout(120000);
  // 1 階 → M1(右上へ 20px)
  await start3(page);
  await page.evaluate(() => window.__dp.placePlayer('c1', 200));
  let s = await hold(page, 'ArrowRight', Math.round((244 - 200) / 1.4));
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  s = await step(page, 1);
  for (let i = 0; i < 120 && (s.player.state !== 'ground' || i < 3); i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('playing');
  expect(s.player.girder).toBe('M1');
  expect(s.player.y).toBe(410);
  // 歩いて降りる: 左 → 1 階、右 → u3
  for (const [x, key, to] of [[278, 'ArrowLeft', 'c1'], [298, 'ArrowRight', 'u3']]) {
    await start3(page);
    await page.evaluate((px) => window.__dp.placePlayer('M1', px), x);
    s = await walkOffWith(page, key);
    expect(s.state, `M1 から ${key}`).toBe('playing');
    expect(s.player.girder, `M1 から ${key}`).toBe(to);
  }
  // 左へ跳ぶ・その場で跳ぶ: M1 のどこからでもミスにならない
  for (const [x, keysDown, ok] of [[276, ['ArrowLeft'], ['s1', 'c1']], [288, ['ArrowLeft'], ['s1', 'c1']], [300, ['ArrowLeft'], ['s1', 'c1']], [322, ['ArrowLeft'], ['s1', 'c1']], [288, [], ['M1']]]) {
    await start3(page);
    await page.evaluate((px) => window.__dp.placePlayer('M1', px), x);
    for (const k of keysDown) await page.keyboard.down(k);
    await page.keyboard.press('Space');
    s = await step(page, 1);
    for (let i = 0; i < 120 && (s.player.state !== 'ground' || i < 3); i++) s = await step(page, 1);
    for (const k of keysDown) await page.keyboard.up(k);
    expect(s.state, `M1 の x=${x} から ${keysDown}`).toBe('playing');
    expect(ok, `M1 の x=${x} から ${keysDown}`).toContain(s.player.girder);
  }
});

test('L22. 新しい足場(K1・K2・K3・M1・P1)の見た目と当たり判定は一致する。釘バットの取り方(浮いていて、跳ばないと拾えない)は変わらない', async ({ page }) => {
  test.setTimeout(120000);
  await start3(page);
  await page.waitForTimeout(80);
  // 描かれた灰色の範囲 = 当たり判定の x1〜x2(上面から 3px 下の 1 列で調べる。画面の右端まで届く足場は右外を調べない)
  const lv = await level(page);
  const byId = Object.fromEntries(lv.girders.map((g) => [g.id, g]));
  const body = '124,128,136'; // girderColors.body (#7c8088)
  for (const id of ['K1', 'K2', 'K3', 'M1', 'P1']) {
    const g = byId[id];
    const px = await page.evaluate(([x1, x2, y]) => {
      const ctx = document.getElementById('game').getContext('2d');
      const at = (x) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)).join(',');
      return { left: at(x1), right: at(x2 - 1), outL: at(x1 - 1), outR: x2 < 480 ? at(x2) : null };
    }, [g.x1, g.x2, g.y1 + 3]);
    // P1 は右端で r1 とつながっている(右の外も足場)ので、右の外は調べない
    if (id === 'P1') px.outR = null;
    expect(px.left, `${id} の左端`).toBe(body);
    expect(px.right, `${id} の右端`).toBe(body);
    expect(px.outL, `${id} の左の外`).not.toBe(body);
    if (px.outR !== null) expect(px.outR, `${id} の右の外`).not.toBe(body);
    // 両端ぎりぎりに立てる(画面の右端まで届く足場は、主人公が画面の端で止まる位置まで)
    for (const x of [g.x1, Math.min(g.x2, 473)]) {
      await page.evaluate(([gid, p2]) => window.__dp.placePlayer(gid, p2), [id, x]);
      const t = await step(page, 2);
      expect(t.player.state, `${id} の x=${x}`).toBe('ground');
      expect(t.player.girder, `${id} の x=${x}`).toBe(id);
    }
    // 左端から 1 歩外へ出ると落ちる
    await page.evaluate(([gid, p2]) => window.__dp.placePlayer(gid, p2), [id, g.x1]);
    const t = await hold(page, 'ArrowLeft', 1);
    expect(t.player.state, `${id} の左端から外へ`).toBe('air');
    await start3(page);
    await page.waitForTimeout(40);
  }
  // 釘バット: r1 の上を端から端まで歩いても拾えず、真下で跳ぶと拾う(新しい足場を足しても変わらない)
  await start3(page);
  let s = await page.evaluate(() => window.__dp.snapshot());
  const it = s.items.find((i) => i.type === 'bat');
  expect(it.taken).toBe(false);
  expect(it.y + it.h).toBeLessThanOrEqual(430 - 26); // 浮いている(立った主人公の頭の上端より下には来ない)
  await page.evaluate(() => window.__dp.placePlayer('r1', 392));
  s = await hold(page, 'ArrowRight', 60);
  expect(s.items.find((i) => i.type === 'bat').taken).toBe(false);
  expect(s.player.bat).toBe(0);
  await page.evaluate(() => window.__dp.placePlayer('r1', 446));
  await page.keyboard.press('Space');
  for (let i = 0; i < 60; i++) s = await step(page, 1);
  expect(s.player.bat).toBeGreaterThan(0);
});

// ---- 解体用の鉄球(本体に触れるとミス。ワイヤーには当たり判定なし) ----

// 3 面のステージデータの鉄球(振れ幅・周期などを読む)
const ballDef = (page) => page.evaluate(() => DP.stages[2].wreckingBall);

test('L23. 鉄球: 2 階・中で鉄球が真上に来るときに本物のキーボードで真上に跳ぶと、頭が鉄球本体に触れて 1 ミス(残機が 1 つ減り、スタートからやり直し)', async ({ page }) => {
  const start = await start3(page);
  await page.evaluate(() => window.__dp.placePlayer('c2b', 226)); // 吊っている点(x226)の真下
  // 鉄球が左から真上へ向かってくる途中(中心が x 196〜206)まで待つ
  let s = await step(page, 1);
  let prevX = s.wreckingBall.x;
  for (let i = 0; i < 400; i++) {
    s = await step(page, 1);
    const bx = s.wreckingBall.x;
    if (bx > prevX && bx >= 196 && bx <= 206) break;
    prevX = bx;
  }
  expect(s.state).toBe('playing'); // 2 階に立っているだけでは鉄球に届かない
  await page.keyboard.press('Space');
  let hitAt = null;
  for (let i = 0; i < 60 && s.state === 'playing'; i++) {
    s = await step(page, 1);
    if (s.state === 'dying') hitAt = s;
  }
  expect(hitAt, '鉄球に当たってミスになる').not.toBeNull();
  expect(hitAt.deathReason).toBe('hazard');
  // ミスになったステップでは、主人公の当たり判定(中心 x・足元 y・幅 14・高さ 26)が鉄球本体の矩形のどれかに重なっている
  const pb = { x: hitAt.player.x, y: hitAt.player.y, w: 14, h: 26 };
  const ov = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y - a.h < b.y && b.y - b.h < a.y;
  expect(hitAt.wreckingBall.boxes.some((b) => ov(pb, b))).toBe(true);
  // ミスの演出が終わると残機が 1 つだけ減って、スタート地点からやり直し
  for (let i = 0; i < 400 && s.state !== 'ready'; i++) s = await step(page, 1);
  expect(s.state).toBe('ready');
  expect(s.lives).toBe(start.lives - 1);
  expect(s.player.girder).toBe('f0');
});

test('L24. 鉄球: 触れなければミスにならない。2 階の鉄球の下に立っている・歩いているだけでは届かず、鉄球が離れているときなら 2 階・中から 2 階・右へ跳んで渡れる', async ({ page }) => {
  test.setTimeout(120000);
  // ① 2 階・中に立ったまま 1 往復(period ステップ)以上待ってもミスにならない
  await start3(page);
  const def = await ballDef(page);
  await page.evaluate(() => window.__dp.placePlayer('c2b', 226));
  let s = await step(page, def.period + 10);
  expect(s.state).toBe('playing');
  expect(s.player.girder).toBe('c2b');
  // ② 2 階・中 → 2 階・右の間を本物のキーボードで歩いて往復しても(ジャンプしなければ)ミスにならない
  await page.evaluate(() => window.__dp.placePlayer('c2c', 282));
  s = await hold(page, 'ArrowRight', 40);
  s = await hold(page, 'ArrowLeft', 40);
  expect(s.state).toBe('playing');
  // ③ 鉄球が左の端にいるとき(中心 x ≤ 180)に、2 階・中の右寄りから本物のキーボードで右へ跳べば 2 階・右に着地できる
  await page.evaluate(() => window.__dp.placePlayer('c2b', 240));
  for (let i = 0; i < 400; i++) { s = await step(page, 1); if (s.wreckingBall.x <= 180) break; }
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  s = await step(page, 1);
  for (let i = 0; i < 120 && (s.player.state !== 'ground' || i < 3) && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('playing');
  expect(s.player.girder).toBe('c2c');
});

test('L25. 鉄球: ワイヤー(鎖)には当たり判定がない。揺れている間ずっと、ワイヤーの真ん中に主人公を重ねてもミスにならない', async ({ page }) => {
  await start3(page);
  const def = await ballDef(page);
  // 1 往復の間、毎ステップ「次のステップのワイヤーの真ん中」に主人公(空中)を重ねてから 1 ステップ進める
  const r = await page.evaluate((wb) => {
    const dp = window.__dp;
    const pos = (f) => DP.mechanics.wreckingBall.position(wb, f);
    let s = dp.snapshot();
    let checked = 0;
    for (let i = 0; i < wb.period && s.state === 'playing'; i++) {
      const next = pos(s.wreckingBall.frame + 1);
      const mx = (wb.pivotX + next.x) / 2;
      const my = (wb.pivotY + next.y) / 2;
      dp.placePlayerAir(mx, my + 13, 0); // 主人公の当たり判定の中心をワイヤーの真ん中に
      s = dp.step(1);
      checked++;
    }
    return { state: s.state, checked };
  }, def);
  expect(r.state).toBe('playing');
  expect(r.checked).toBe(def.period);
});

test('L26. 鉄球: 揺れている間も当たり判定が本体の見た目に追従する。どの位置でも、本体の左右の端から 1px 外ならミスにならず、1px 重なるとミス。描かれた本体の灰色と当たり判定の範囲が一致する', async ({ page }) => {
  test.setTimeout(120000);
  await start3(page);
  const def = await ballDef(page);
  // 1 往復を 12 等分した各時点で調べる。本体のいちばん横に広い矩形は x-10〜x+10(幅 20)、主人公は幅 14 なので、
  // 主人公の中心が鉄球の中心から 17px 離れていれば触れない、16px なら重なる。真上(足元が鉄球の中心の 11px 上)なら触れない
  const results = await page.evaluate((wb) => {
    const dp = window.__dp;
    const pos = (f) => DP.mechanics.wreckingBall.position(wb, f);
    const fresh = () => { dp.startStage(2); let s = dp.step(1); while (s.state !== 'playing') s = dp.step(1); return s; };
    const out = [];
    for (let k = 0; k < 12; k++) {
      for (const [dx, dy, expectHit] of [[17, 13, false], [16, 13, true], [-17, 13, false], [-16, 13, true], [0, -11, false], [0, -9, true]]) {
        let s = fresh();
        // 1 往復の k/12 の時点まで進める
        const target = Math.round((wb.period * k) / 12);
        while (((s.wreckingBall.frame + 1) % wb.period) !== target) s = dp.step(1);
        const b = pos(s.wreckingBall.frame + 1);
        dp.placePlayerAir(b.x + dx, b.y + dy, 0);
        s = dp.step(1);
        out.push({ k, dx, dy, expectHit, hit: s.state === 'dying', reason: s.deathReason, bx: s.wreckingBall.x, by: s.wreckingBall.y });
      }
    }
    return out;
  }, def);
  for (const r of results) {
    expect(r.hit, `1 往復の ${r.k}/12、鉄球 (${r.bx}, ${r.by}) から (${r.dx}, ${r.dy})`).toBe(r.expectHit);
    if (r.hit) expect(r.reason).toBe('hazard');
  }
  // 揺れている(12 時点で鉄球の位置が変わっている)
  expect(new Set(results.map((r) => r.bx)).size).toBeGreaterThan(6);

  // 見た目: 今の位置の鉄球本体を描いた灰色(#6a6a78)の範囲 = 当たり判定の 3 枚の矩形を合わせた範囲(丸の上下左右の端と、角の欠け)
  await start3(page);
  await page.evaluate(() => window.__dp.placePlayer('f0', 30)); // 主人公は鉄球から離しておく
  await page.waitForTimeout(80);
  const px = await page.evaluate(() => {
    const s = window.__dp.snapshot();
    const { x, y } = s.wreckingBall;
    const ctx = document.getElementById('game').getContext('2d');
    const at = (px2, py) => Array.from(ctx.getImageData(px2, py, 1, 1).data.slice(0, 3)).join(',');
    return {
      // 内側(当たり判定の中)
      inside: [at(x - 10, y), at(x + 9, y), at(x, y - 10), at(x, y + 9), at(x - 8, y - 8 + 1), at(x + 7, y + 7)],
      // 外側(当たり判定の外)
      outside: [at(x - 11, y), at(x + 10, y), at(x, y + 10), at(x - 9, y - 9), at(x + 8, y + 8)],
    };
  });
  const ball = '106,106,120'; // #6a6a78
  for (const c of px.inside) expect(c).toBe(ball);
  for (const c of px.outside) expect(c).not.toBe(ball);
});

// ---- 空飛ぶパンクニワトリ ----

test('L32. パンクニワトリを出したまま、本物のキーボード操作で通常ルートと下ルートを最初から最後まで攻略できる(鳥が来たら立ち止まり、その場で跳んで避ける)', async ({ page }) => {
  test.setTimeout(240000);
  for (const route of ['c2', 'low']) {
    await start3(page, 1, { birds: true });
    const r = await playWithKeyboard(page, route, { birds: true });
    console.log(`L32 ${route}: ${r.state} / 鳥を跳んで避けた足場 ${JSON.stringify(r.dodges)} / 通った足場 ${r.visited.join('→')}`);
    expect(r.state, `${route}: ${r.phase} で止まった(${r.deathReason}) ${JSON.stringify(r.last)}`).toBe('escape');
    expect(r.last.birds).toEqual([]); // クリアの逃走演出が始まると鳥は片付く
  }
});


// 鳥の当たり判定と主人公の当たり判定が重なっているか
const birdOverlaps = (pl, b) => Math.abs(pl.x - b.box.x) * 2 < 14 + b.box.w && pl.y - 26 < b.box.y && b.box.y - b.box.h < pl.y;

test('L27. パンクニワトリ: 4 本のラインすべてに出現する。上から ①青/左→右(屋上 y160)・②赤/右→左(2 階 y320)・③黄/左→右(1 階 y430)・④緑/右→左(地面 y540)。飛んでくる側の画面の外から、下のラインから順に 1 羽ずつ出て、同じラインに 2 羽以上は出ない', async ({ page }) => {
  test.setTimeout(120000);
  await start3(page, 1, { birds: true });
  await page.evaluate(() => window.__dp.placePlayer('r2', 430)); // どのラインの高さでもない足場で待つ
  const first = {};
  let maxPerLine = 0;
  let t = 0;
  for (; t < 1500 && Object.keys(first).length < 4; t++) {
    const s = await step(page, 1);
    expect(s.state).toBe('playing');
    for (const b of s.birds) if (!(b.line in first)) first[b.line] = { color: b.color, dir: b.dir, y: b.y, x: b.x, t };
    const per = [0, 1, 2, 3].map((i) => s.birds.filter((b) => b.line === i).length);
    maxPerLine = Math.max(maxPerLine, ...per);
  }
  expect([0, 1, 2, 3].map((i) => first[i] && [first[i].color, first[i].dir, first[i].y])).toEqual([
    ['blue', 1, 160], ['red', -1, 320], ['yellow', 1, 430], ['green', -1, 540],
  ]);
  // 出てきた位置は飛んでくる側の画面の外(左 → 右なら x < 0、右 → 左なら x > 480)
  for (const i of [0, 1, 2, 3]) {
    if (first[i].dir > 0) expect(first[i].x).toBeLessThan(0);
    else expect(first[i].x).toBeGreaterThan(480);
  }
  // 最初の 1 羽は下のライン(④)から順に、2 秒(120 ステップ)ずつずれて出る(同時には出ない)
  expect([3, 2, 1, 0].map((i) => first[i].t)).toEqual([...[3, 2, 1, 0].map((i) => first[3].t + (3 - i) * 120)]);
  expect(maxPerLine).toBe(1);
});

test('L28. パンクニワトリ: 羽を上げた姿・下げた姿を 8 ステップごとに入れ替えて羽ばたき(絵が変わる)、当たり判定の大きさ・位置は変わらない。トサカの色はラインの色で、飛ぶ向きに合わせて左右反転して描かれる', async ({ page }) => {
  await start3(page);
  await page.evaluate(() => window.__dp.placePlayer('r2', 430));
  // 4 羽を、リフト・主人公・ほかの色の物から離れた所に出す(③は 1 階の左寄り、④は地面の左寄り)
  await page.evaluate(() => { const d = window.__dp; d.spawnBird(0, 200); d.spawnBird(1, 260); d.spawnBird(2, 150); d.spawnBird(3, 200); });
  const wings = [];
  const boxes = [];
  let s;
  for (let i = 0; i < 32; i++) {
    s = await step(page, 1);
    wings.push(s.birds[0].wing);
    boxes.push(s.birds.map((b) => [b.box.y, b.box.w, b.box.h, b.box.x - b.x]));
  }
  // 8 ステップごとに up / down が入れ替わる
  const runs = [];
  for (const w of wings) if (!runs.length || runs[runs.length - 1][0] !== w) runs.push([w, 1]); else runs[runs.length - 1][1]++;
  expect(new Set(wings)).toEqual(new Set(['up', 'down']));
  for (const r of runs.slice(1, -1)) expect(r[1]).toBe(8);
  // 当たり判定は羽ばたいても同じ(中心は鳥の x、幅 12・高さ 8、下端は床の 4px 上)
  for (const b of boxes) expect(b).toEqual(boxes[0]);
  expect(boxes[0]).toEqual([[156, 12, 8, 0], [316, 12, 8, 0], [426, 12, 8, 0], [536, 12, 8, 0]]);

  // 画面の絵: 羽の上げ下げで絵が変わる・トサカの色・くちばし(オレンジ)が進む向きの側にある
  const look = async () => {
    await page.waitForTimeout(80);
    return page.evaluate(() => {
      const ctx = document.getElementById('game').getContext('2d');
      return window.__dp.snapshot().birds.map((b) => {
        const x0 = Math.round(b.x) - 12;
        const y0 = b.y - 22;
        const d = ctx.getImageData(x0, y0, 24, 22).data;
        const hex = [];
        let beakX = [];
        for (let i = 0; i < d.length; i += 4) {
          const h = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
          hex.push(h);
          const px = (i / 4) % 24;
          const py = Math.floor(i / 4 / 24);
          if (h === '#ff8a1e' && py < 14) beakX.push(px); // 上の方のオレンジ = くちばし(足は下)
        }
        return { line: b.line, dir: b.dir, wing: b.wing, hex, beakX };
      });
    });
  };
  const a = await look();
  await step(page, 8);
  const b2 = await look();
  const comb = { blue: '#3a8cff', red: '#ff2a2a', yellow: '#ffd23c', green: '#3cd04a' };
  const lineColor = ['blue', 'red', 'yellow', 'green'];
  for (let i = 0; i < 4; i++) {
    expect(a[i].wing).not.toBe(b2[i].wing);
    expect(a[i].hex.join()).not.toBe(b2[i].hex.join()); // 羽ばたくと絵が変わる
    // トサカはラインの色で、ほかの 3 色は使っていない
    for (const [name, hex] of Object.entries(comb)) {
      const n = a[i].hex.filter((h) => h === hex).length;
      if (name === lineColor[i]) expect(n, `ライン ${i + 1} のトサカ`).toBeGreaterThan(0);
      else expect(n, `ライン ${i + 1} に ${name} がない`).toBe(0);
    }
    expect(a[i].hex.filter((h) => h === '#ffffff').length).toBeGreaterThan(40); // 体は白
    // くちばしは進む向きの側(右へ飛ぶなら右半分、左へ飛ぶなら左半分)
    const avg = a[i].beakX.reduce((p, c) => p + c, 0) / a[i].beakX.length;
    if (a[i].dir > 0) expect(avg).toBeGreaterThan(16);
    else expect(avg).toBeLessThan(8);
  }
});

test('L29. パンクニワトリ: 床に立っている・歩いている主人公に当たると 1 ミス(4 本のラインすべて)。ミスすると鳥は消えて、出現も最初から数え直す', async ({ page }) => {
  test.setTimeout(120000);
  // [ライン, 立つ足場, x]
  for (const [line, gid, x] of [[0, 'b', 200], [1, 'c2c', 320], [2, 'c1', 140], [3, 'f0', 150]]) {
    const start = await start3(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [gid, x]);
    await page.evaluate(([i, px]) => window.__dp.spawnBird(i, px), [line, x + ([1, -1, 1, -1][line] > 0 ? -80 : 80)]);
    let s = await step(page, 1);
    let hit = null;
    for (let i = 0; i < 120 && s.state === 'playing'; i++) { s = await step(page, 1); if (s.state === 'dying') hit = s; }
    expect(hit, `ライン ${line + 1}`).not.toBeNull();
    expect(hit.deathReason).toBe('hazard');
    expect(hit.birds.some((b) => birdOverlaps(hit.player, b))).toBe(true); // 当たり判定どうしが重なったときにミス
    if (line === 3) {
      // 残機が 1 つだけ減ってスタートからやり直し。鳥は消えている
      for (let i = 0; i < 400 && s.state !== 'ready'; i++) s = await step(page, 1);
      expect(s.lives).toBe(start.lives - 1);
      expect(s.birds).toEqual([]);
    }
  }
  // 本物のキーボードで鳥に向かって歩いていっても当たる(地面。④の鳥は右から来る)
  await start3(page);
  await page.evaluate(() => { window.__dp.placePlayer('f0', 60); window.__dp.spawnBird(3, 200); });
  await page.keyboard.down('ArrowRight');
  let s = await step(page, 1);
  for (let i = 0; i < 120 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
});

test('L30. パンクニワトリ: 本物のキーボードでジャンプすれば上を跳び越えて避けられる(4 本のラインの床と乗り場すべて)。その場で跳んで避けられるタイミングは 14 ステップ以上あり、鳥に向かって跳んでも避けられる', async ({ page }) => {
  test.setTimeout(360000); // 23 通りのタイミング × 11 か所を実際に跳ぶ
  // 鳥を手前 60px に出し、当たり判定が触れる k ステップ前にその場で跳ぶ。成功した k の数を数える
  // [名前, ライン, 足場, x, リフト B を止めておく高さ]
  const CASES = [
    ['① 屋上', 0, 'b', 200], ['① 屋上の端のがれき', 0, 'bs', 324], ['① K1', 0, 'K1', 400], ['① B(最上段)', 0, 'B', 364, 160],
    ['② 2 階・左', 1, 'c2a', 132], ['② 2 階・右', 1, 'c2c', 320], ['② B(2 階)', 1, 'B', 364, 320],
    ['③ 1 階', 2, 'c1', 140], ['③ r1', 2, 'r1', 400], ['③ P1', 2, 'P1', 364],
    ['④ 地面', 3, 'f0', 150],
  ];
  const results = [];
  for (const [name, line, gid0, x, bAt] of CASES) {
    const ok = [];
    await start3(page);
    for (let k = 0; k <= 22; k++) {
      // ページを読み込み直さずに 3 面をやり直し、主人公と鳥を置く(B を使うときは止まるまで待つ)
      const dir = [1, -1, 1, -1][line];
      await page.evaluate(([g, px, b, i, bx]) => {
        const dp = window.__dp;
        dp.startStage(2);
        let st = dp.step(1);
        while (st.state !== 'playing') st = dp.step(1);
        let id = g;
        if (b) {
          dp.placePlayer('f0', 30);
          for (let n = 0; n < 3000; n++) { const B = dp.lifts()[1]; if (Math.abs(B.plates[0].y - b) < 0.01 && B.pause === B.pauseFrames) { id = B.plates[0].id; break; } dp.step(1); }
        }
        dp.placePlayer(id, px);
        dp.spawnBird(i, bx);
      }, [gid0, x, bAt || 0, line, x - dir * 60]);
      const touchAt = (60 - 1.5 - 13) / 1.5; // 当たり判定が触れるまでのステップ
      let s = await step(page, 1);
      let jumped = false;
      for (let t = 0; t < 90 && s.state === 'playing'; t++) {
        if (!jumped && touchAt - t <= k) { await page.keyboard.press('Space'); jumped = true; }
        s = await step(page, 1);
      }
      if (s.state === 'playing') ok.push(k);
    }
    results.push(`${name}: ${ok.length} ステップ(接触の ${Math.min(...ok)}〜${Math.max(...ok)} ステップ前)`);
    expect(ok.length, name).toBeGreaterThanOrEqual(14);
  }
  console.log('L30 その場で跳んで避けられるタイミング:\n  ' + results.join('\n  '));
  // 鳥に向かって跳ぶ(地面で、右から来る④の鳥に向かって右へ跳ぶ。近づく速さは 1.5 + 1.4 なので、もっと近くで跳べばよい)
  await start3(page);
  await page.evaluate(() => { window.__dp.placePlayer('f0', 100); window.__dp.spawnBird(3, 220); });
  let s = await step(page, 1);
  for (let i = 0; i < 80 && s.birds[0].x > 100 + 13 + 22; i++) s = await step(page, 1);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.press('Space');
  for (let i = 0; i < 80 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('playing');
  expect(s.player.girder).toBe('f0');
  expect(s.player.x).toBeGreaterThan(140); // 鳥の向こう側に着地した
});

test('L31. パンクニワトリ: 画面の外へ出たら消える(左 → 右の鳥は右の外、右 → 左の鳥は左の外で)', async ({ page }) => {
  await start3(page);
  await page.evaluate(() => { window.__dp.placePlayer('r2', 430); window.__dp.spawnBird(0, 460); window.__dp.spawnBird(1, 20); });
  let s = await step(page, 1);
  expect(s.birds.length).toBe(2);
  const seen = { 0: [], 1: [] };
  for (let i = 0; i < 60 && s.birds.length; i++) {
    s = await step(page, 1);
    for (const b of s.birds) seen[b.line].push(b.x);
  }
  expect(s.birds).toEqual([]);
  // 消える直前は画面の外(絵の幅の半分 12px より外)にいた
  expect(Math.max(...seen[0])).toBeGreaterThan(480 + 11);
  expect(Math.min(...seen[1])).toBeLessThan(-11);
});

test('L33. パンクニワトリ: ラインの高さでない足場(r2・M1・がれきの階段・u1・u3・R1・K2)に立っていれば、真横を鳥が通っても当たらない', async ({ page }) => {
  test.setTimeout(120000);
  // [足場, x, 近くを通るライン]
  for (const [gid, x, line] of [['r2', 400, 1], ['M1', 288, 2], ['s1', 230, 2], ['s3', 170, 1], ['u1', 228, 3], ['u3', 324, 2], ['R1', 430, 1], ['K2', 434, 0]]) {
    await start3(page);
    await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [gid, x]);
    const dir = [1, -1, 1, -1][line];
    await page.evaluate(([i, px]) => window.__dp.spawnBird(i, px), [line, x - dir * 50]);
    const s = await step(page, 80);
    expect(s.state, `${gid} の x=${x}`).toBe('playing');
    expect(s.player.girder).toBe(gid);
  }
});

test('L34. パンクニワトリ: 釘バットを持っているときは、前から来た鳥を倒せる(得点 500)。背中側から来た鳥には当たる(ビールと同じ)', async ({ page }) => {
  await start3(page);
  await page.evaluate(() => { const d = window.__dp; d.placePlayer('c1', 160); d.setBat(600); d.spawnBird(2, 60); });
  // 左を向かせる(③の鳥は左から来る)
  let s = await hold(page, 'ArrowLeft', 1);
  const score0 = s.score;
  for (let i = 0; i < 90 && s.state === 'playing' && s.birds.length; i++) s = await step(page, 1);
  expect(s.state).toBe('playing');
  expect(s.birds).toEqual([]);
  expect(s.score - score0).toBe(500);
  // 背中側(右を向いている)から来ると当たる
  await start3(page);
  await page.evaluate(() => { const d = window.__dp; d.placePlayer('c1', 160); d.setBat(600); d.spawnBird(2, 60); });
  s = await hold(page, 'ArrowRight', 1);
  for (let i = 0; i < 90 && s.state === 'playing'; i++) s = await step(page, 1);
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
});

// 本物のキーボードで、足場 gid の x に立って keysDown を押したまま跳ぶ(jump: false なら歩くだけ)。
// 着地して止まるか、ミスするまで進めて、最後の状態を返す
async function actFrom(page, gid, x, keysDown, jump = true) {
  await start3(page);
  await page.evaluate(([g, px]) => window.__dp.placePlayer(g, px), [gid, x]);
  for (const k of keysDown) await page.keyboard.down(k);
  if (jump) await page.keyboard.press('Space');
  let s = await step(page, 1);
  // 跳ぶときは着地まで。歩くときは今の足場を離れて別の足場に着地するまで
  for (let i = 0; i < 200 && s.state === 'playing'; i++) {
    if (jump && i >= 3 && s.player.state === 'ground') break;
    if (!jump && s.player.state === 'ground' && s.player.girder !== gid) break;
    s = await step(page, 1);
  }
  for (const k of keysDown) await page.keyboard.up(k);
  for (let i = 0; i < 3 && s.state === 'playing'; i++) s = await step(page, 1);
  return s;
}

test('L35. 下ルートの P1・M1 の安全確認: 本物のキーボード操作で、u3・P1・M1 のどこから跳んでも頭の衝突や着地しそこねで理不尽なミスにならない。u3 → P1・P1 → M1・P1 → r1 は十分な幅で届く', async ({ page }) => {
  test.setTimeout(300000);
  const result = {};
  const run = async (name, gid, xs, keysDown, allowed, jump = true) => {
    result[name] = {};
    for (const x of xs) {
      const s = await actFrom(page, gid, x, keysDown, jump);
      const where = s.state === 'playing' ? (s.player.girder || 'air') : `ミス(${s.deathReason})`;
      result[name][x] = where;
      expect(allowed, `${name}: x=${x} → ${where}`).toContain(where);
    }
  };
  const range = (a, b, d = 2) => { const r = []; for (let x = a; x <= b; x += d) r.push(x); if (r[r.length - 1] !== b) r.push(b); return r; };
  // u3 から右へ跳ぶ: P1 に着地するか、左寄り(延ばした M1 の下)からは頭が M1 の裏に当たって u3 に戻る。
  // 右端から跳びすぎても、P1 とつながった r1 に着地する。どこからでもミスにならない
  await run('u3 → 右へ跳ぶ', 'u3', range(306, 344, 1), ['ArrowRight'], ['P1', 'u3', 'r1']);
  // u3 でその場で跳ぶ: M1 の下でも頭をぶつけて u3 に戻るだけ
  await run('u3 でその場で跳ぶ', 'u3', [306, 312, 318, 324, 330, 344], [], ['u3']);
  // u3 から左へ跳ぶ: u2(28px 下)か、M1 の裏に頭が当たって u3 に戻る。ミスにならない
  await run('u3 → 左へ跳ぶ', 'u3', range(306, 344, 2), ['ArrowLeft'], ['u2', 'u3']);
  // P1 から左へ跳ぶ: M1 に着地するか、右寄りからは M1 に届かず u3 に降りる(26px 下。ミスにならない)
  await run('P1 → 左へ跳ぶ', 'P1', range(352, 388, 1), ['ArrowLeft'], ['M1', 'u3']);
  // P1 でその場で跳ぶ / 右へ跳ぶ・歩く(釘バットの r1。すき間なくつながっている)
  await run('P1 でその場で跳ぶ', 'P1', [352, 364, 386], [], ['P1']); // x=388 は r1 との境目(どちらに乗っても同じ高さ)
  await run('P1 → 右へ跳ぶ', 'P1', range(352, 388, 6), ['ArrowRight'], ['r1']);
  await run('P1 から右へ歩く', 'P1', [384], ['ArrowRight'], ['r1'], false);
  // P1 の左端から歩いて降りると u3 に着く(26px 下)
  await run('P1 から左へ歩く', 'P1', [354], ['ArrowLeft'], ['u3'], false);
  // M1 から跳ぶ: 左へは 1 階かがれき 1 段目、その場では M1、右へは u3 を越えて穴(ここは今までどおりミス。L21 の説明と同じ)
  await run('M1 → 左へ跳ぶ', 'M1', range(276, 322, 2), ['ArrowLeft'], ['c1', 's1']);
  await run('M1 でその場で跳ぶ', 'M1', [280, 300, 322], [], ['M1']);
  // M1 の右端(延ばした所)から右へ歩いて降りると u3 に着く(46px 下。ミスにならない)
  await run('M1 から右へ歩く', 'M1', [320], ['ArrowRight'], ['u3'], false);
  // r1 から左へ跳ぶ・歩く: P1 か u3 に降りる(戻り道)
  await run('r1 → 左へ跳ぶ', 'r1', [388, 394, 400, 410], ['ArrowLeft'], ['P1', 'u3']);
  await run('r1 から左へ歩く', 'r1', [392], ['ArrowLeft'], ['P1'], false);
  console.log('L35 着地先:\n' + Object.entries(result).map(([k, v]) => `  ${k}: ` + Object.entries(v).map(([x, w]) => `${x}→${w}`).join(' ')).join('\n'));
  // 届く幅: u3 → P1 は 18px 以上、P1 → M1 は 13px 以上(L7 でも確かめる)
  const okU3 = Object.values(result['u3 → 右へ跳ぶ']).filter((w) => w === 'P1').length;
  const okP1 = Object.values(result['P1 → 左へ跳ぶ']).filter((w) => w === 'M1').length;
  expect(okU3).toBeGreaterThanOrEqual(18); // 1px おきに調べた数
  expect(okP1).toBeGreaterThanOrEqual(13);
  // u2 → u3 は M1 を延ばしても今までどおり届く(頭の最高点 y420 は M1 の裏 y418 より下)
  for (const x of [276, 281, 286]) {
    const s = await actFrom(page, 'u2', x, ['ArrowRight']);
    expect(s.state, `u2 の x=${x} → u3`).toBe('playing');
    expect(s.player.girder, `u2 の x=${x} → u3`).toBe('u3');
  }
});

test('L36. パンクニワトリの回避ボーナス: その鳥のラインの床からジャンプで跳び越えると 100 点(1 面のビールと同じ得点表示「100」)。同じ鳥からは 1 回だけ。立っているだけ・別の高さの足場で跳んだとき・当たったときは入らない', async ({ page }) => {
  test.setTimeout(180000);
  // 鳥を手前 60px に出し、当たり判定が触れる k ステップ前に本物のキーボードでその場で跳ぶ。鳥が画面の外へ消えるまで進める
  const run = async (gid, x, line, k, { jump = true, bAt = null } = {}) => {
    await start3(page);
    const dir = [1, -1, 1, -1][line];
    await page.evaluate(([g, px, b, i, bx]) => {
      const dp = window.__dp;
      let id = g;
      if (b) {
        dp.placePlayer('f0', 30);
        for (let n = 0; n < 3000; n++) { const B = dp.lifts()[1]; if (Math.abs(B.plates[0].y - b) < 0.01 && B.pause === B.pauseFrames) { id = B.plates[0].id; break; } dp.step(1); }
      }
      dp.placePlayer(id, px);
      dp.spawnBird(i, bx);
    }, [gid, x, bAt || 0, line, x - dir * 60]);
    const s0 = await snap(page);
    const touchAt = (60 - 1.5 - 13) / 1.5;
    let s = await step(page, 1);
    let jumped = false;
    const popups = new Set();
    let maxScore = s0.score;
    for (let t = 0; t < 420 && s.state === 'playing'; t++) {
      if (jump && !jumped && touchAt - t <= k) { await page.keyboard.press('Space'); jumped = true; }
      s = await step(page, 1);
      for (const p of s.popups) popups.add(p);
      maxScore = Math.max(maxScore, s.score);
      if (s.birds.length === 0 && s.player.state === 'ground') break;
    }
    return { state: s.state, gained: s.score - s0.score, popups: [...popups], birdsLeft: s.birds.length };
  };
  // ラインの床から跳び越える → 100 点が 1 回だけ(鳥が画面の外へ消えるまで見ても 100 のまま)。得点表示は「100」
  for (const [name, gid, x, line, bAt] of [
    ['② 2 階・左', 'c2a', 132, 1], ['③ 1 階', 'c1', 140, 2], ['③ P1', 'P1', 364, 2], ['④ 地面', 'f0', 150, 3],
    ['① 屋上', 'b', 200, 0], ['① 屋上の端のがれき(y152)', 'bs', 324, 0], ['① K1(y150)', 'K1', 400, 0], ['② B(2 階)', 'B', 364, 1, 320],
  ]) {
    const r = await run(gid, x, line, 10, { bAt });
    expect(r.state, name).toBe('playing');
    expect(r.gained, name).toBe(100);
    expect(r.popups, name).toEqual(['100']);
    expect(r.birdsLeft, name).toBe(0);
  }
  // 立っているだけで鳥が通過する(高さの違う足場なので当たらない)→ 加点しない
  for (const [name, gid, x, line] of [['M1 の下を ③ が通る', 'M1', 296, 2], ['r2 の下を ② が通る', 'r2', 400, 1], ['u3 の上を ③ が通る', 'u3', 324, 2]]) {
    const r = await run(gid, x, line, 0, { jump: false });
    expect(r.state, name).toBe('playing');
    expect(r.gained, name).toBe(0);
    expect(r.popups, name).toEqual([]);
  }
  // 別の高さの足場で跳んで、鳥が真下を通っても加点しない(M1 は ③ の 20px 上、r2 は ② の 24px 上)
  for (const [name, gid, x, line] of [['M1 で跳ぶ(③ が下を通る)', 'M1', 296, 2], ['r2 で跳ぶ(② が下を通る)', 'r2', 400, 1]]) {
    const r = await run(gid, x, line, 10);
    expect(r.state, name).toBe('playing');
    expect(r.gained, name).toBe(0);
  }
  // ラインの床で跳ばずに鳥に当たったときは、加点されずにミス(通過しただけでは入らない)
  const hit = await run('c1', 140, 2, 0, { jump: false });
  expect(hit.state).toBe('dying');
  expect(hit.gained).toBe(0);
  // 1 面のビールを跳び越えたときの得点は今までどおり 100 点(得点の処理を共通にしても変わらない)
  const cfg = await page.evaluate(() => window.DP.config.score);
  expect(cfg.jumpOver).toBe(100);
});
