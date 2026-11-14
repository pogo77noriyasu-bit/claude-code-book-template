// 3 面: 周回ごとのパンクニワトリ(出現数・出現頻度)と火炎攻撃(R5 以降)のテスト
// 周回ごとの値はステージデータ js/stages/stage3.js の birds.rounds(R11 以降は R10)。
// ループを手動にして、ブラウザの中で決まったステップ数だけ進めて確かめる(1 ステップごとにやり取りすると遅いため)。
const { test, expect } = require('@playwright/test');
const { snap, watchConsoleErrors } = require('./helpers');

watchConsoleErrors(test);

// 3 面を周回 round で始めて、プレイ中の最初のステップの手前まで進める(鳥は出す。鉄球の当たり判定は止める)
async function start3(page, round = 1, { birds = true } = {}) {
  await page.goto('./?test');
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const s = await page.evaluate(([r, b]) => {
    const d = window.__dp;
    d.setManual(true); d.setSeed(1); d.setBirdsEnabled(b); d.setWreckingBallEnabled(false); d.startStage(2, r);
    let q = d.snapshot();
    while (q.state !== 'playing') q = d.step(1);
    return q;
  }, [round, birds]);
  expect(s.state).toBe('playing');
  expect(s.stageId).toBe('squat');
  return s;
}

// 主人公を鳥のどのラインにも当たらない場所(r2 の右端。y296)に置いたまま n ステップ進め、
// 鳥が出たステップ(プレイ中の何ステップ目か。1 始まり)・同時に飛んでいた数・火炎の記録を返す
function watchBirds(page, n) {
  return page.evaluate((k) => {
    const d = window.__dp;
    const seen = new Set();
    const spawns = []; // { step, line, id }
    let maxTotal = 0, maxPerLine = 0, burnSteps = 0, notWait = 0;
    const fireLens = new Set();
    let firstStep = null;
    for (let i = 1; i <= k; i++) {
      d.placePlayer('r2', 470);
      const s = d.step(1);
      if (s.state !== 'playing') return { error: 'state ' + s.state + ' at ' + i };
      if (firstStep === null) firstStep = s;
      for (const b of s.birds) {
        if (!seen.has(b.id)) { seen.add(b.id); spawns.push({ step: i, line: b.line, id: b.id, x: b.x }); }
        if (b.fire !== 'wait') notWait++;
        if (b.fire === 'burn') { burnSteps++; fireLens.add(b.fireBox.w); }
      }
      maxTotal = Math.max(maxTotal, s.birds.length);
      const per = [0, 0, 0, 0];
      for (const b of s.birds) per[b.line]++;
      maxPerLine = Math.max(maxPerLine, ...per);
    }
    return { spawns, maxTotal, maxPerLine, burnSteps, notWait, fireLens: [...fireLens], sounds: d.sounds() };
  }, n);
}

test.describe('3 面 周回ごとのパンクニワトリと火炎', () => {
  test('N1 R1 は改修前と同じ: 最初は ④ 180・③ 300・② 420・① 540 ステップ目、そのあと各ライン 480 ステップごと。1 ラインに 1 羽・火炎なし', async ({ page }) => {
    await start3(page, 1);
    await page.evaluate(() => window.__dp.clearSounds());
    const r = await watchBirds(page, 2000);
    expect(r.error).toBeUndefined();
    // 改修前の決まり(firstSpawn のあと 480 ごと。画面を横切るのは約 336 ステップなので待たされない)
    const first = [540, 420, 300, 180];
    const want = [];
    for (let line = 0; line < 4; line++) for (let t = first[line]; t <= 2000; t += 480) want.push({ step: t, line });
    const got = r.spawns.map((x) => ({ step: x.step, line: x.line }));
    const sort = (a) => a.slice().sort((p, q) => p.step - q.step || p.line - q.line);
    expect(sort(got)).toEqual(sort(want));
    // 飛んでくる側の画面の外(12px)から出る
    for (const sp of r.spawns) expect([-12 + 1.5, 480 + 12 - 1.5]).toContain(sp.x);
    expect(r.maxPerLine).toBe(1);
    expect(r.notWait).toBe(0);
    expect(r.burnSteps).toBe(0);
    expect(r.sounds).not.toContain('birdFire');
  });

  test('N2 周回の表: 出現の間隔は短く・数は多くなり、R11 以降は R10 のまま(上限)', async ({ page }) => {
    await start3(page, 1);
    const rows = await page.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 100].map((r) => window.__dp.birdRules(r)));
    expect(rows[0]).toEqual({ interval: 480, perLine: 1, maxTotal: 4, fire: null });
    expect(rows[9]).toEqual({ interval: 300, perLine: 2, maxTotal: 6, fire: { length: 40, windup: 24, burn: 30, cycle: 130 } });
    for (const i of [10, 11, 12]) expect(rows[i]).toEqual(rows[9]); // R11・R20・R100
    for (let i = 1; i < 10; i++) {
      expect(rows[i].interval).toBeLessThan(rows[i - 1].interval);
      expect(rows[i].perLine).toBeGreaterThanOrEqual(rows[i - 1].perLine);
      expect(rows[i].maxTotal).toBeGreaterThanOrEqual(rows[i - 1].maxTotal);
    }
    // 頻度の倍率(R1 の間隔 480 との比)は R10 で 1.6 倍(プレイ確認で 2.0 倍から下げた)。R1〜R5 は 1.0〜1.4 倍のまま
    expect(480 / rows[9].interval).toBe(1.6);
    expect(rows.slice(0, 5).map((r) => r.interval)).toEqual([480, 436, 400, 370, 343]);
  });

  test('N3 周回ごとの出現の間隔と、同時に飛ぶ数の上限(1 ライン・画面全体)', async ({ page }) => {
    for (const round of [2, 5, 6, 10, 20]) {
      const rule = await (async () => { await start3(page, round); return page.evaluate((r) => window.__dp.birdRules(r), round); })();
      const r = await watchBirds(page, 2400);
      expect(r.error).toBeUndefined();
      // ④(いちばん下のライン)の 1 羽目と 2 羽目の間は interval(満員でなければ待たない)
      const line3 = r.spawns.filter((x) => x.line === 3).map((x) => x.step);
      expect(line3[0]).toBe(180);
      expect(line3[1] - line3[0], `R${round} の間隔`).toBe(rule.interval);
      // どのラインでも、続けて出る間は interval 以上あく
      for (let line = 0; line < 4; line++) {
        const st = r.spawns.filter((x) => x.line === line).map((x) => x.step);
        for (let i = 1; i < st.length; i++) expect(st[i] - st[i - 1]).toBeGreaterThanOrEqual(rule.interval);
      }
      expect(r.maxPerLine, `R${round} 1 ラインの最大`).toBeLessThanOrEqual(rule.perLine);
      expect(r.maxTotal, `R${round} 画面全体の最大`).toBeLessThanOrEqual(rule.maxTotal);
      if (round >= 10) {
        expect(r.maxPerLine).toBe(2); // R10 では実際に 1 ラインに 2 羽になる
        // 頻度を 1.6 倍に下げたので、2400 ステップの間に画面全体で 6 羽(上限)までは届かない(最大 5 羽)
        expect(r.maxTotal).toBeGreaterThanOrEqual(5);
      }
    }
  });

  test('N4 R1〜R4 は火を噴かない。R5〜R9 は 20px、R10・R20・R100 は 40px', async ({ page }) => {
    for (const round of [1, 2, 3, 4, 5, 9, 10, 20, 100]) {
      await start3(page, round);
      await page.evaluate(() => window.__dp.clearSounds());
      const r = await watchBirds(page, 1500);
      expect(r.error).toBeUndefined();
      if (round <= 4) {
        expect(r.burnSteps, `R${round}`).toBe(0);
        expect(r.notWait).toBe(0);
        expect(r.sounds).not.toContain('birdFire');
      } else {
        expect(r.burnSteps, `R${round}`).toBeGreaterThan(0);
        expect(r.fireLens).toEqual([round >= 10 ? 40 : 20]);
        expect(r.sounds).toContain('birdFire');
      }
    }
  });

  test('N5 火炎は進行方向へ伸び、鳥と一緒に動く(左へ飛ぶ鳥は左へ)。当たり判定は床から 8〜16px', async ({ page }) => {
    for (const round of [5, 10]) {
      await start3(page, round, { birds: false });
      const L = round >= 10 ? 40 : 20;
      const res = await page.evaluate(() => {
        const d = window.__dp;
        const a = d.spawnBird(2, 200); // ③ 左 → 右
        const b = d.spawnBird(1, 300); // ② 右 → 左
        d.setBirdFire(a, 'burn', 0); d.setBirdFire(b, 'burn', 0);
        d.placePlayer('r2', 470);
        const s1 = d.step(1);
        d.placePlayer('r2', 470);
        const s2 = d.step(1);
        return { s1: s1.birds, s2: s2.birds };
      });
      for (const [i, dir] of [[0, 1], [1, -1]]) {
        const b1 = res.s1[i];
        const b2 = res.s2[i];
        expect(b1.dir).toBe(dir);
        // くちばし(中心から 11px 先)から進行方向へ L px
        expect(b1.fireBox.x - b1.x).toBeCloseTo(dir * (11 + L / 2), 6);
        expect(b1.fireBox.w).toBe(L);
        expect(b1.fireBox.h).toBe(8);
        expect(b1.y - b1.fireBox.y).toBe(8); // 下端は床から 8px、上端は 16px
        expect(b1.mouthOpen).toBe(true);
        // 次のステップ: 鳥と一緒に 1.5px 動く
        expect(b2.fireBox.x - b1.fireBox.x).toBeCloseTo(dir * 1.5, 6);
      }
    }
  });

  test('N6 予備動作 → 噴く → 休むの時間(R5: 30・36・サイクル 150 / R10: 24・30・130)。画面に入ってから始める', async ({ page }) => {
    for (const [round, w, bn, cyc] of [[5, 30, 36, 150], [10, 24, 30, 130]]) {
      await start3(page, round, { birds: false });
      // 画面の外(左)から出た ③ の鳥: 画面に 24px 入るまでは 'wait'(火炎のサイクルを始めない)
      const entry = await page.evaluate(() => {
        const d = window.__dp;
        const id = d.spawnBird(2);
        const out = [];
        for (let i = 0; i < 80; i++) {
          d.placePlayer('r2', 470);
          const b = d.step(1).birds.find((x) => x.id === id);
          out.push({ fire: b.fire, x: b.x });
        }
        d.clearBirds();
        return out;
      });
      const firstRest = entry.findIndex((o) => o.fire === 'rest');
      expect(entry[firstRest].x).toBeGreaterThanOrEqual(24);
      expect(entry[firstRest - 1].x).toBeLessThan(24);
      expect(entry[firstRest - 1].fire).toBe('wait');
      // 段階の長さは、リフトの縦穴のない所(③ の x=130 から右。リフト A の縦穴より右で、リフト B は 1 階の高さを通らない)で測る
      const tl = await page.evaluate(() => {
        const d = window.__dp;
        const id = d.spawnBird(2, 130);
        const out = [];
        for (let i = 0; i < 300; i++) {
          d.placePlayer('r2', 470);
          const b = d.step(1).birds.find((x) => x.id === id);
          if (!b) break;
          out.push({ fire: b.fire, x: b.x, mouth: b.mouthOpen });
        }
        return { id, out };
      });
      const ph = tl.out.map((o) => o.fire);
      expect(ph[0]).toBe('rest'); // もう画面の中なので、すぐ休みから
      // 最初の休み = 20 + 12 × (id % 4)(最初のステップで休みに入るので、予備動作はその次から数えて)
      const firstWind = ph.indexOf('windup');
      expect(firstWind).toBe(20 + 12 * (tl.id % 4));
      const runs = [];
      for (let i = firstWind; i < ph.length; i++) {
        if (!runs.length || runs[runs.length - 1].p !== ph[i]) runs.push({ p: ph[i], n: 0, at: i });
        runs[runs.length - 1].n++;
      }
      const winds = runs.filter((x) => x.p === 'windup');
      const burns = runs.filter((x) => x.p === 'burn');
      expect(winds[0].n).toBe(w);
      expect(burns[0].n).toBe(bn);
      // 噴き始めから次の噴き始めまで cycle
      expect(burns[1].at - burns[0].at).toBe(cyc);
      expect(winds[1].n).toBe(w);
      // 予備動作と噴いている間だけくちばしを開く
      tl.out.forEach((o) => expect(o.mouth).toBe(o.fire === 'windup' || o.fire === 'burn'));
    }
  });

  test('N7 火炎に触れると炎上・黒こげのミス。当たり判定の境目は見た目の先端と合う。高く跳んでいれば当たらない', async ({ page }) => {
    for (const round of [5, 10]) {
      const L = round >= 10 ? 40 : 20;
      await start3(page, round, { birds: false });
      // 屋上(y160)で、右へ飛ぶ ① の鳥の火炎の先端から 2px 先に主人公の当たり判定の左端を置く
      const r = await page.evaluate((len) => {
        const d = window.__dp;
        const id = d.spawnBird(0, 100);
        d.setBirdFire(id, 'burn', 0);
        const tip = 100 + 11 + len; // 火炎の先端
        const px = tip + 7 + 2; // 主人公の当たり判定(幅 14)の左端が先端の 2px 先
        d.placePlayer('b', px);
        const s1 = d.step(1); // 鳥が 1.5px 近づく(まだ 0.5px あいている)
        const s2 = d.step(1); // 重なる
        return { s1: s1.state, s2: s2.state, reason: s2.deathReason, fire: s1.birds[0].fire };
      }, L);
      expect(r.fire).toBe('burn');
      expect(r.s1, `R${round} 先端の手前`).toBe('playing');
      expect(r.s2, `R${round} 先端に触れた`).toBe('dying');
      expect(r.reason).toBe('burn');
      // 炎上の演出(60 ステップ)のあと残機が 1 減る
      const s = await page.evaluate(() => window.__dp.step(61));
      expect(s.state).toBe('ready');
      expect(s.lives).toBe(2);
    }
    // 足元が床から 16px より上なら、火炎の真上を通っても当たらない(体には当たらない高さ)
    await start3(page, 10, { birds: false });
    const air = await page.evaluate(() => {
      const d = window.__dp;
      const id = d.spawnBird(0, 100);
      d.setBirdFire(id, 'burn', 0);
      d.placePlayerAir(150, 160 - 17, 0); // 火炎の真上・足元は床から 17px
      const s = d.step(1);
      return { state: s.state, box: s.birds[0].fireBox };
    });
    expect(air.state).toBe('playing');
  });

  test('N8 釘バットでニワトリを倒すと、そのニワトリの火炎も同じステップで消える(得点は 500 のまま。火炎だけの得点なし)', async ({ page }) => {
    await start3(page, 5, { birds: false });
    const score0 = (await snap(page)).score;
    const r = await page.evaluate(() => {
      const d = window.__dp;
      // 1 階(y430)で左を向いてバットを持つ。③ の鳥(左 → 右)が火を噴きながら近づいてくる
      d.placePlayer('c1', 262);
      d.setFacing(-1);
      d.setBat(600);
      const id = d.spawnBird(2, 150);
      let s, killedAt = null, burnBefore = false;
      for (let i = 0; i < 120; i++) {
        d.setBirdFire(id, 'burn', 0); // ずっと噴かせる
        d.placePlayer('c1', 262);
        s = d.step(1);
        if (s.birds.length) burnBefore = s.birds[0].fire === 'burn' && !!s.birds[0].fireBox;
        if (!s.birds.length && killedAt === null) { killedAt = i; break; }
        if (s.state !== 'playing') break;
      }
      const after = d.step(30);
      return { state: s.state, killedAt, burnBefore, birds: s.birds.length, score: after.score, popups: s.popups, after: after.state };
    });
    expect(r.state).toBe('playing');
    expect(r.burnBefore).toBe(true);
    expect(r.killedAt).not.toBeNull();
    expect(r.birds).toBe(0); // 鳥と一緒に火炎も消えた(火炎は鳥の一部)
    expect(r.score - score0).toBe(500);
    expect(r.popups).toContain('500');
    expect(r.after).toBe('playing');
  });

  test('N9 ミス・面クリア(逃走演出)のあとに火炎が残らない', async ({ page }) => {
    await start3(page, 10);
    let s = await page.evaluate(() => {
      const d = window.__dp;
      const id = d.spawnBird(0, 100);
      d.setBirdFire(id, 'burn', 0);
      d.killPlayer('fall');
      let q = d.step(1);
      while (q.state !== 'playing') q = d.step(1);
      return q;
    });
    expect(s.birds).toEqual([]);
    // 逃走演出: 噴いている鳥がいる状態でガールに触れる
    s = await page.evaluate(() => {
      const d = window.__dp;
      const id = d.spawnBird(0, 100);
      d.setBirdFire(id, 'burn', 0);
      d.placePlayer('top', 214);
      const q = d.step(1);
      return Object.assign(q, { after: d.step(30).birds });
    });
    expect(s.state).toBe('escape');
    expect(s.birds).toEqual([]);
    expect(s.after).toEqual([]);
  });

  // 鳥(左 → 右)を出して、主人公を同じラインの床に置き、いろいろな踏み切りで跳ばせる。越えられた踏み切り(lead)を返す(なければ null)。
  // mode: 'burnToward' = 火炎をずっと噴かせ、鳥に向かって左へ歩きながら跳ぶ /
  //       'waitRest' = 鳥が遠く(主人公から 140px)にいるときに噴き始め、あとは通常のサイクル。主人公はその場で待ち、
  //                    噴き終わって休んでいる間に、その場で真上に跳ぶ
  async function dodge(page, round, line, girder, px, birdX, mode, leads) {
    for (const lead of leads) {
      await start3(page, round, { birds: false });
      const r = await page.evaluate(([ln, gd, x, bx, ld, md]) => {
        const d = window.__dp;
        const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
        const id = d.spawnBird(ln, bx);
        d.setBirdFire(id, 'rest', 0, 9999);
        d.placePlayer(gd, x);
        let s = d.snapshot();
        if (md === 'burnToward') key('ArrowLeft', true);
        let jumped = false, started = false, burned = false;
        for (let i = 0; i < 600 && s.state === 'playing'; i++) {
          const b = s.birds.find((q) => q.id === id);
          if (!b) break;
          if (md === 'burnToward') d.setBirdFire(id, 'burn', 0);
          else if (!started && s.player.x - b.x <= 140) { d.setBirdFire(id, 'burn', 0); started = true; }
          if (b.fire === 'burn') burned = true;
          const resting = md === 'burnToward' || (started && b.fire === 'rest');
          if (!jumped && resting && s.player.x - b.x <= ld) { key(' ', true); jumped = true; }
          s = d.step(1);
          if (jumped) key(' ', false);
          if (jumped && s.player.state === 'ground' && s.birds.length && s.birds[0].x > s.player.x + 10) break; // 越えた
        }
        key('ArrowLeft', false);
        return { state: s.state, passed: s.birds.length ? s.birds[0].x > s.player.x : false, burned };
      }, [line, girder, px, birdX, lead, mode]);
      if (r.state === 'playing' && r.passed && r.burned) return lead;
    }
    return null;
  }

  test('N10 よけられる(R5): 噴き続けている鳥にも、向かって歩きながら跳べば当たらない(屋上と 1 階)', async ({ page }) => {
    for (const [line, girder, px, birdX] of [[0, 'b', 260, 40], [2, 'c1', 250, 60]]) {
      const ok = await dodge(page, 5, line, girder, px, birdX, 'burnToward', Array.from({ length: 23 }, (_, i) => 30 + i * 2));
      expect(ok, `R5 ライン ${line}`).not.toBeNull();
    }
  });

  test('N11 よけられる(R5・R10): 噴き始めを見たらその場で待ち、噴き終わって休んでいる間にその場で跳べば越えられる(屋上と 1 階)', async ({ page }) => {
    // R10 の火炎(40px)は、噴き続けている鳥を跳び越えるには空中にいる時間が足りないことが多い。
    // R10 のよけ方は「噴いている間は近づかず、休んでいる間に跳ぶ」(噴く 30 ステップ・休み 76 ステップ)
    for (const round of [5, 10]) {
      for (const [line, girder, px, birdX] of [[0, 'b', 260, 40], [2, 'c1', 250, 60]]) {
        const ok = await dodge(page, round, line, girder, px, birdX, 'waitRest', [22, 26, 18, 30, 34, 14]);
        expect(ok, `R${round} ライン ${line}`).not.toBeNull();
      }
    }
  });

  test('N12 リフト(エレベーター)の縦穴には火を噴かない。噴いている途中で縦穴に近づいたらやめ、通り過ぎたらまた噴く', async ({ page }) => {
    // 縦穴 = リフトの幅 + 左右 8px。リフト A(x 76〜100)は ②③④ のライン、リフト B(x 352〜376)は ①② のラインを通る
    const shafts = [{ x1: 68, x2: 108, lines: [1, 2, 3] }, { x1: 344, x2: 384, lines: [0, 1] }];
    const overShaft = (b) => b.fireBox && shafts.some((sh) => sh.lines.includes(b.line) &&
      b.fireBox.x + b.fireBox.w / 2 > sh.x1 && b.fireBox.x - b.fireBox.w / 2 < sh.x2);
    // ふつうに鳥を出して、長く見張る(R5・R10)
    for (const round of [5, 10]) {
      await start3(page, round);
      const list = await page.evaluate(() => {
        const d = window.__dp;
        const out = [];
        for (let i = 0; i < 3000; i++) {
          d.placePlayer('r2', 470);
          const s = d.step(1);
          for (const b of s.birds) if (b.fire === 'burn') out.push({ line: b.line, fireBox: b.fireBox, x: b.x });
        }
        return out;
      });
      expect(list.length, `R${round} 噴いた`).toBeGreaterThan(0);
      const bad = list.filter(overShaft);
      expect(bad, `R${round} 縦穴にかかった火炎`).toEqual([]);
    }
    // ② の鳥(右 → 左)がリフト B の縦穴の手前で噴いている: 縦穴に入る前にやめ、通り過ぎたあとでまた噴く
    await start3(page, 10, { birds: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      const id = d.spawnBird(1, 470);
      d.setBirdFire(id, 'burn', 0, 0);
      const out = [];
      for (let i = 0; i < 260; i++) {
        d.placePlayer('r2', 470);
        const b = d.step(1).birds.find((x) => x.id === id);
        if (!b) break;
        out.push({ fire: b.fire, x: b.x, fireBox: b.fireBox, line: b.line });
      }
      return out;
    });
    const firstStop = r.findIndex((o) => o.fire !== 'burn');
    expect(firstStop).toBeGreaterThan(0); // はじめは噴いていた
    // やめたときの火炎の先(左端)は、まだ縦穴の右端(384)より右
    const last = r[firstStop - 1].fireBox;
    expect(last.x - last.w / 2).toBeGreaterThanOrEqual(384 - 1.5);
    expect(r.filter(overShaft)).toEqual([]);
    // 縦穴を通り過ぎたあと(鳥がリフト B の左へ出たあと)、また噴く
    expect(r.some((o) => o.fire === 'burn' && o.x < 330)).toBe(true);
  });

  // リフトに乗ったまま、鳥が縦穴を通るタイミング k をずらして、「何もしない」か「リフトの上でその場で跳ぶ」で助かるかを調べる。
  // cfg: { lift: 'A' | 'B', line(鳥のライン), lineY(そのラインの床), board(乗せ方), refY(この高さに足元が来たステップを k = 0 にする) }
  // 戻り値: 助からなかった k の一覧
  function liftScan(page, round, cfg) {
    return page.evaluate(([r, c]) => {
      const d = window.__dp;
      const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
      const begin = () => {
        key(' ', false);
        d.setManual(true); d.setBirdsEnabled(false); d.setWreckingBallEnabled(false); d.startStage(2, r);
        let s = d.snapshot(); while (s.state !== 'playing') s = d.step(1);
        if (c.lift === 'A') {
          // 地面で A の下に立ち、上がってくる板に乗る
          d.placePlayer('f0', 88);
          for (let i = 0; i < 600; i++) { s = d.step(1); if (s.player.girder && s.player.girder[0] === 'A') break; }
        } else {
          // B が 2 階に着いたら(bottomAt 650)、床の真ん中に乗る
          for (let i = 0; i < 650; i++) s = d.step(1);
          d.placePlayer(d.lifts()[1].plates[0].id, 364);
          s = d.snapshot();
        }
        return s;
      };
      begin();
      // 基準: 足元が refY に着く(B で 2 階から出るときは、動き始める)ステップ
      let T = 0;
      for (; T < 2000; T++) {
        const s = d.step(1);
        if (c.lift === 'B' && c.refY === 320) { if (s.player.y < 319.9) break; } else if (s.player.y <= c.refY) break;
      }
      const shaftX = c.lift === 'A' ? 88 : 364;
      const dir = [1, -1, 1, -1][c.line]; // ① 右へ / ② 左へ / ③ 右へ / ④ 左へ
      const LEAD = 60;
      const bad = [];
      for (let k = -60; k <= 30; k += 3) {
        const cross = T + k;
        if (cross - LEAD < 1) continue;
        const tries = [null];
        for (let j = Math.max(1, cross - 45); j <= cross + 5; j++) tries.push(j);
        let ok = false;
        for (const j of tries) {
          let s = begin();
          let dead = false;
          for (let i = 0; i <= cross + 25; i++) {
            if (i === cross - LEAD) d.spawnBird(c.line, shaftX - dir * 1.5 * LEAD);
            if (j !== null && i === j) key(' ', true);
            if (j !== null && i === j + 2) key(' ', false);
            s = d.step(1);
            if (s.state !== 'playing') { dead = true; break; }
          }
          key(' ', false);
          // 助かった = 鳥に当たらず、リフトの上(または跳んでいる途中)にいる
          if (!dead && (s.player.state === 'air' || /^[AB]\d/.test(s.player.girder || ''))) { ok = true; break; }
        }
        if (!ok) bad.push(k);
      }
      return { T, bad };
    }, [round, cfg]);
  }

  test('N13 動いているリフトの上では、ニワトリが縦穴の上を跳ねて(またはくぐって)越えるので、リフトに乗ったままよけられる(R1・R5・R10)', async ({ page }) => {
    test.setTimeout(600000);
    await start3(page, 1, { birds: false });
    const cases = [
      { name: 'リフト B → 屋上(①)', lift: 'B', line: 0, refY: 160 },
      { name: 'リフト B が 2 階から出る(②)', lift: 'B', line: 1, refY: 320 },
      { name: 'リフト A → 2 階(②)', lift: 'A', line: 1, refY: 320 },
      { name: 'リフト A → 1 階(③)', lift: 'A', line: 2, refY: 430 },
      { name: 'リフト A に乗った直後の地面(④)', lift: 'A', line: 3, refY: 530 },
    ];
    const report = [];
    for (const round of [1, 5, 10]) {
      for (const c of cases) {
        const r = await liftScan(page, round, c);
        report.push(`R${round} ${c.name}: 助からない k = ${r.bad.length ? r.bad.join(',') : 'なし'}`);
        expect(r.bad, `R${round} ${c.name}`).toEqual([]);
      }
    }
    console.log('N13\n' + report.join('\n'));
  });

  test('N14 跳ねる(くぐる)のは、動いているリフトに乗っている主人公の体にかかりそうなときだけ。床・止まっているリフトの上では今までどおり', async ({ page }) => {
    // 屋上(床)に立っている主人公: ① の鳥はリフト B の縦穴を跳ねずに通り、屋上では今までどおり当たる
    await start3(page, 1, { birds: false });
    let r = await page.evaluate(() => {
      const d = window.__dp;
      d.placePlayer('b', 200);
      d.spawnBird(0, 250); // 主人公より右(縦穴の手前)から右へ
      let hop = false;
      for (let i = 0; i < 160; i++) { d.placePlayer('b', 200); const s = d.step(1); if (s.birds[0] && s.birds[0].hopping) hop = true; if (!s.birds.length) break; }
      return { hop };
    });
    expect(r.hop).toBe(false);
    // 止まっているリフト B(屋上の高さ)の上: 跳ねないので、何もしなければ当たる(床と同じく跳んでよける)
    await start3(page, 1, { birds: false });
    r = await page.evaluate(() => {
      const d = window.__dp;
      let s;
      // B が屋上の高さに着いて止まるまで進める
      for (let i = 0; i < 2000; i++) { s = d.step(1); const B = d.lifts()[1]; if (Math.abs(B.plates[0].y - 160) < 0.01 && B.pause > 30) break; }
      d.placePlayer(d.lifts()[1].plates[0].id, 364);
      d.spawnBird(0, 330); // すぐ手前から
      let hop = false;
      for (let i = 0; i < 40; i++) { s = d.step(1); if (s.birds[0] && s.birds[0].hopping) hop = true; if (s.state !== 'playing') break; }
      return { hop, state: s.state, reason: s.deathReason };
    });
    expect(r.hop).toBe(false);
    expect(r.state).toBe('dying');
    expect(r.reason).toBe('hazard');
    // リフトに乗っていないとき(地面でリフト A を待っている)も跳ねない
    await start3(page, 1, { birds: false });
    r = await page.evaluate(() => {
      const d = window.__dp;
      d.spawnBird(3, 200); // ④ 右 → 左。主人公は A の右の地面
      let hop = false;
      for (let i = 0; i < 200; i++) { d.placePlayer('f0', 300); const s = d.step(1); if (s.birds[0] && s.birds[0].hopping) hop = true; if (!s.birds.length) break; }
      return { hop };
    });
    expect(r.hop).toBe(false);
  });

  test('N15 跳ね上がりの動きは滑らか(1 ステップのずれの変化が小さい)で、縦穴を越えたら元の高さに戻る。当たり判定と絵は同じだけずれる', async ({ page }) => {
    await start3(page, 1, { birds: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      let s;
      for (let i = 0; i < 650; i++) s = d.step(1);
      d.placePlayer(d.lifts()[1].plates[0].id, 364);
      // B が屋上の高さへ上がる途中で ① の鳥が縦穴を通るように出す
      const B = d.lifts()[1];
      const out = [];
      let spawned = false;
      for (let i = 0; i < 700; i++) {
        s = d.step(1);
        const by = d.lifts()[1].plates[0].y;
        if (!spawned && by < 240) { d.spawnBird(0, 200); spawned = true; continue; }
        const b = s.birds[0];
        if (b) out.push({ x: b.x, dy: b.hopDy, hop: b.hopping, boxY: b.box.y, y: b.y });
        if (spawned && !s.birds.length) break;
        if (s.state !== 'playing') return { dead: s.deathReason };
      }
      return { out };
    });
    expect(r.dead).toBeUndefined();
    const dys = r.out.map((o) => o.dy);
    expect(Math.min(...dys)).toBeLessThan(-20); // 上へ跳ねた
    for (let i = 1; i < dys.length; i++) expect(Math.abs(dys[i] - dys[i - 1])).toBeLessThanOrEqual(3); // 1 ステップで 3px 以下しか変わらない
    expect(dys[dys.length - 1]).toBe(0); // 最後は元の高さ
    // 当たり判定は床から 4px 上 + ずれ
    r.out.forEach((o) => expect(o.boxY).toBeCloseTo(o.y + o.dy - 4, 6));
  });
});
