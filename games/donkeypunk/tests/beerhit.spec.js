// ドンキーパンク 1 面: ビール瓶・缶と主人公の当たり判定、ハシゴの下の安全地帯のテスト
// ・瓶・缶との判定は幅 12 × 高さ 22px(config.hazard.playerHit)。主人公の判定(14×26)より上を 4px・左右を 1px ずつ小さくして、
//   額のてっぺんや体の端をかすめた程度ではミスにしない。目から下の顔と胴体に当たればミス
// ・主人公がハシゴの下(下の段で、ハシゴの中心から左右 16px 以内)で待っているときは、瓶・缶はそのハシゴを降りてこない。
//   ほかのハシゴでは今までどおり 25% で降りる。下の段を転がってくる瓶や、すでに降りている瓶には当たる(無敵ではない)
// ・2 面のスカル・3 面の鳥と鉄球・ゴリラとの判定、主人公と瓶の速さは変えない
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage, walkTo, climb } = require('./helpers');

watchConsoleErrors(test);

const level = (page) => page.evaluate(() => window.__dp.level());

test('B1. 数値: 瓶・缶との判定は 12×22px、主人公の判定(スカル・鳥・鉄球・ゴリラ用)は 14×26px のまま。主人公の速さ・ジャンプ、瓶・缶の速さ、ハシゴを降りる確率 25% は変わらない', async ({ page }) => {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const c = await page.evaluate(() => window.DP.config);
  expect(c.hazard.playerHit).toEqual({ width: 12, height: 22 });
  expect([c.player.width, c.player.height]).toEqual([14, 26]);
  expect([c.player.walkSpeed, c.player.jumpVelocity, c.player.gravity, c.player.climbSpeed]).toEqual([1.4, 4.2, 0.22, 1.1]);
  expect([c.hazard.bottle.speed, c.hazard.can.speed, c.hazard.ladderSpeed, c.hazard.ladderChance]).toEqual([1.5, 1.15, 1.0, 0.25]);
  expect(c.hazard.ladderSafeX).toBe(16);
});

test('B2. 境目(当たり判定の計算): 瓶・缶の下端が主人公の足元から 22px より上なら当たらず(額のてっぺん 4px をかすめてもミスにならない)、22px より下へ入れば当たる。横は中心の差が (12 + 瓶・缶の幅) / 2 以上なら当たらない。主人公の判定(14×26)なら当たっていた位置', async ({ page }) => {
  await startAtStage(page, 0);
  const r = await page.evaluate(() => {
    const DP = window.DP;
    const p = { x: 200, y: 500 };
    const out = {};
    for (const type of ['bottle', 'can']) {
      const c = DP.config.hazard[type];
      const box = (x, y) => ({ x, y, w: c.width, h: c.height });
      const newHit = (b) => DP.geometry.overlaps(DP.hazards.playerHitbox(p), b);
      const oldHit = (b) => DP.geometry.overlaps(DP.player.hitbox(p), b);
      const side = (12 + c.width) / 2;
      out[type] = {
        topGraze: [newHit(box(200, 500 - 22)), oldHit(box(200, 500 - 22))], // 下端が額のてっぺん 4px の中
        topGraze2: [newHit(box(200, 500 - 25)), oldHit(box(200, 500 - 25))],
        face: newHit(box(200, 500 - 21.5)), // 目の高さまで入る
        body: newHit(box(200, 495)),
        sideGraze: [newHit(box(200 + side, 495)), oldHit(box(200 + side, 495))], // 体の端 1px をかすめる
        sideIn: newHit(box(200 + side - 0.5, 495)),
      };
    }
    return out;
  });
  for (const type of ['bottle', 'can']) {
    expect(r[type].topGraze, type).toEqual([false, true]);
    expect(r[type].topGraze2, type).toEqual([false, true]);
    expect(r[type].face, type).toBe(true);
    expect(r[type].body, type).toBe(true);
    expect(r[type].sideGraze, type).toEqual([false, true]);
    expect(r[type].sideIn, type).toBe(true);
  }
});

test('B3. 上から降りてくる瓶・缶(実際に動かす): ハシゴの下で立っている主人公の額のてっぺんをかすめている間はミスにならず、目の高さまで下りてきたらミス', async ({ page }) => {
  for (const type of ['bottle', 'can']) {
    await startAtStage(page, 0);
    const r = await page.evaluate((t) => {
      const dp = window.__dp;
      const lv = dp.level();
      const l = lv.ladders[0]; // g0 → g1(x=110)
      dp.placePlayer(l.lower, l.x);
      const p0 = dp.snapshot().player;
      const id = dp.spawnHazard(t, l.upper, l.x);
      // 主人公の頭の少し上(判定の上端 26px のさらに 6px 上)から降らせる
      dp.placeHazardOnLadder(id, l.index, p0.y - 32);
      const log = [];
      let s = dp.snapshot();
      for (let i = 0; i < 40 && s.state === 'playing'; i++) {
        s = dp.step(1);
        const h = s.hazards.find((x) => x.id === id);
        log.push({ state: s.state, depth: p0.y - (h ? h.y : NaN) }); // 瓶・缶の下端が足元から何 px 上か
      }
      return log;
    }, type);
    const deadAt = r.findIndex((x) => x.state !== 'playing');
    expect(deadAt, type).toBeGreaterThan(0);
    // 生きている間に、下端が 22〜26px(額のてっぺん 4px)に入っていたステップがある
    expect(r.slice(0, deadAt).some((x) => x.depth < 26 && x.depth >= 22), type).toBe(true);
    // ミスになったのは、下端が 22px より下に入ったとき
    const last = r[deadAt - 1].depth; // ミスになったステップで動いたあと(dying になってからは動かない)の位置
    expect(r[deadAt].depth, type).toBeLessThan(22);
    expect(last, type).toBeGreaterThanOrEqual(22);
    expect((await snap(page)).deathReason).toBe('hazard');
  }
});

test('B4. ハシゴの下の安全地帯: 降りる確率を 100% にしても、主人公がハシゴの下の段でハシゴの中心から左右 16px 以内に立っている・その場で跳んでいるときは、瓶はそのハシゴを降りずに上の段を通過する。17px 以上離れていれば降りてくる(すべてのハシゴで確認)', async ({ page }) => {
  test.setTimeout(180000);
  await startAtStage(page, 0);
  const res = await page.evaluate(() => {
    const dp = window.__dp;
    const key = (k, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: k }));
    dp.setLadderChance(1);
    const lv = dp.level();
    const out = [];
    for (const l of lv.ladders) {
      if (lv.ladders[l.index] && window.DP.stages[0].ladders[l.index].noHazard) continue;
      const upper = lv.girders.find((g) => g.id === l.upper);
      const downhill = upper.y1 > upper.y2 ? -1 : 1; // 低い側へ転がる
      for (const [dx, jump] of [[-16, false], [0, false], [16, false], [0, true], [-17, false], [17, false]]) {
        dp.clearHazards();
        dp.placePlayer(l.lower, l.x + dx);
        // 瓶をハシゴの上り側(転がってくる側)30px に置く
        const id = dp.spawnHazard('bottle', l.upper, l.x - downhill * 30);
        let s = dp.snapshot();
        let descended = false;
        if (jump) { key(' ', true); s = dp.step(1); key(' ', false); }
        for (let i = 0; i < 40; i++) {
          s = dp.step(1);
          if (jump && s.player.state === 'ground' && i % 30 === 5) { key(' ', true); dp.step(1); key(' ', false); }
          const h = s.hazards.find((x) => x.id === id);
          if (h && h.state === 'ladder') descended = true;
          if (!h || Math.abs(h.x - l.x) > 20 && (h.x - l.x) * downhill > 0) break;
        }
        out.push({ ladder: l.index, dx, jump, descended, state: s.state });
      }
    }
    dp.setLadderChance(null);
    return out;
  });
  const ladders = new Set(res.map((r) => r.ladder));
  expect(ladders.size).toBeGreaterThanOrEqual(10);
  for (const r of res) {
    const name = `ハシゴ ${r.ladder} dx=${r.dx}${r.jump ? ' 跳ぶ' : ''}`;
    if (Math.abs(r.dx) <= 16) expect(r.descended, name).toBe(false);
    else expect(r.descended, name).toBe(true);
    expect(r.state, name).toBe('playing');
  }
});

test('B5. 安全地帯はそのハシゴだけ: ハシゴの下で待っていても、ほかのハシゴでは今までどおり降りてくる。ハシゴにつかまっているときも降りてこない(前からの安全地帯)', async ({ page }) => {
  await startAtStage(page, 0);
  const r = await page.evaluate(() => {
    const dp = window.__dp;
    dp.setLadderChance(1);
    const lv = dp.level();
    // ハシゴ 0(g0 → g1、x=110)の下で待ち、g1 の別のハシゴ 2 ではない、g2 → g1 へ降りるハシゴ 3(x=256)の上へ瓶を流す
    const l0 = lv.ladders[0];
    const l3 = lv.ladders[3];
    dp.placePlayer(l0.lower, l0.x);
    const up = lv.girders.find((g) => g.id === l3.upper);
    const downhill = up.y1 > up.y2 ? -1 : 1;
    const id = dp.spawnHazard('bottle', l3.upper, l3.x - downhill * 30);
    let other = false;
    for (let i = 0; i < 40; i++) {
      const s = dp.step(1);
      const h = s.hazards.find((x) => x.id === id);
      if (h && h.state === 'ladder') other = true;
    }
    // ハシゴ 3 につかまっている(途中)ときは、ハシゴ 3 を降りてこない
    dp.clearHazards();
    dp.placePlayerLadder(l3.index, l3.bottomY - 30);
    const id2 = dp.spawnHazard('bottle', l3.upper, l3.x - downhill * 30);
    let onLadder = false;
    for (let i = 0; i < 40; i++) {
      const s = dp.step(1);
      const h = s.hazards.find((x) => x.id === id2);
      if (h && h.state === 'ladder') onLadder = true;
    }
    dp.setLadderChance(null);
    return { other, onLadder };
  });
  expect(r.other).toBe(true);
  expect(r.onLadder).toBe(false);
});

test('B6. 無敵ではない: ハシゴの下で待っていても、下の段を転がってくる瓶には当たってミス。すでにハシゴを降りている瓶の下へ自分から入ってもミス', async ({ page }) => {
  // 下の段を転がってくる瓶(ハシゴ 1: g0 の x=380。g0 の高い側から転がす)
  await startAtStage(page, 0);
  let s = await page.evaluate(() => {
    const dp = window.__dp;
    const lv = dp.level();
    const l = lv.ladders[1];
    const g0 = lv.girders.find((g) => g.id === l.lower);
    const downhill = g0.y1 > g0.y2 ? -1 : 1;
    dp.placePlayer(l.lower, l.x);
    dp.spawnHazard('bottle', l.lower, l.x - downhill * 60);
    let t = dp.snapshot();
    for (let i = 0; i < 80 && t.state === 'playing'; i++) t = dp.step(1);
    return t;
  });
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
  // 降りている途中の瓶の下へ、本物のキーボードで歩いて入る
  await startAtStage(page, 0);
  await page.evaluate(() => {
    const dp = window.__dp;
    const l = dp.level().ladders[0];
    dp.placePlayer(l.lower, l.x - 40);
    const id = dp.spawnHazard('bottle', l.upper, l.x);
    dp.placeHazardOnLadder(id, l.index, l.bottomY - 10); // 主人公の顔の高さ
    window.__dp.setLadderChance(0);
  });
  await page.keyboard.down('ArrowRight');
  s = await snap(page);
  for (let i = 0; i < 60 && s.state === 'playing'; i++) s = await step(page, 1);
  await page.keyboard.up('ArrowRight');
  expect(s.state).toBe('dying');
  expect(s.deathReason).toBe('hazard');
  await page.evaluate(() => window.__dp.setLadderChance(null));
});

test('B7. 本物のキーボード操作: 1 面でハシゴの下まで歩いて待つと、降りる確率 100% の瓶が何本上を通っても、そのハシゴは降りてこない。瓶が通りすぎてから、そのハシゴを登れる', async ({ page }) => {
  test.setTimeout(120000);
  await startAtStage(page, 0);
  const lv = await level(page);
  const l = lv.ladders[0]; // g0 → g1(x=110)
  await page.evaluate(() => window.__dp.setLadderChance(1));
  let s = await walkTo(page, l.x);
  expect(Math.abs(s.player.x - l.x)).toBeLessThanOrEqual(1);
  const up = lv.girders.find((g) => g.id === l.upper);
  const downhill = up.y1 > up.y2 ? -1 : 1;
  // 上の段に 5 本の瓶を間をあけて流す
  for (let n = 0; n < 5; n++) {
    await page.evaluate(([u, x]) => window.__dp.spawnHazard('bottle', u, x), [l.upper, l.x - downhill * (30 + n * 40)]);
  }
  let descended = 0;
  for (let i = 0; i < 260; i++) {
    s = await step(page, 1);
    // 待っているハシゴを降りた瓶だけを数える(通りすぎた瓶が先の別のハシゴで降りるのは今までどおり)
    descended += s.hazards.filter((h) => h.state === 'ladder' && h.ladder === l.index).length;
    expect(s.state).toBe('playing');
  }
  expect(descended).toBe(0);
  await page.evaluate(() => { window.__dp.clearHazards(); window.__dp.setLadderChance(null); });
  s = await climb(page, 'ArrowUp');
  expect(s.player.girder).toBe(l.upper);
  expect(s.state).toBe('playing');
});
