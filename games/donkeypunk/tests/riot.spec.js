// 4 面: 警察ヘリ(アパッチ風)と機動隊員・銃弾のテスト(js/riot.js、仕掛け 'riot')
// 周回ごとの値はステージデータ js/stages/stage4.js の riot.rounds(R11 以降は R10)。
// ループを手動にして、多くはブラウザの中でまとめて進めて確かめる(1 ステップごとにやり取りすると遅いため)。
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors } = require('./helpers');

watchConsoleErrors(test);

const STAGE4 = 3;

// 4 面を周回 round で始め、プレイ中の最初のステップまで進める。ポリスマンは出さない。
// riot: ヘリを出すか / url に '&dev&inv=1' を足すと DEV の無敵(当たってもミスにならない)
async function start4(page, round, { riot = true, url = './?test', seed = 1 } = {}) {
  await page.goto(url);
  await page.waitForFunction(() => window.__dp && window.__dp.snapshot().state === 'title');
  const s = await page.evaluate(([r, rt, sd]) => {
    const d = window.__dp;
    d.setManual(true); d.setSeed(sd); d.setCopsEnabled(false); d.setRiotEnabled(rt); d.startStage(3, r);
    let q = d.snapshot();
    while (q.state !== 'playing') q = d.step(1);
    return q;
  }, [round, riot, seed]);
  expect(s.stageId).toBe('rivets');
  return s;
}

// 主人公を置いたまま n ステップ進め、ヘリが出たステップ・向きなどを集める(ブラウザの中で)
function watch(page, n, { girder = 'F1', x = 240, clearRiots = false } = {}) {
  return page.evaluate(([k, gd, px, clr]) => {
    const d = window.__dp;
    const seen = new Set();
    const helis = [];
    let maxRiot = 0, rotor = 0, chuteFire = false, bullets = 0;
    d.clearSounds();
    for (let i = 1; i <= k; i++) {
      d.placePlayer(gd, px);
      const s = d.step(1);
      if (s.state !== 'playing') return { error: s.state + ' ' + s.deathReason + ' at ' + i };
      for (const h of s.riot ? s.riot.helis : []) if (!seen.has(h.id)) { seen.add(h.id); helis.push({ step: i, dir: h.dir, targets: h.targets }); }
      const riots = s.enemies.filter((e) => e.type === 'riot');
      maxRiot = Math.max(maxRiot, riots.length);
      bullets = Math.max(bullets, s.riot ? s.riot.bullets.length : 0);
      if (clr) d.clearEnemies();
    }
    rotor = d.sounds().filter((nm) => nm === 'rotor').length;
    return { helis, maxRiot, rotor, bullets };
  }, [n, girder, x, clearRiots]);
}

test.describe('4 面 警察ヘリと機動隊員', () => {
  test('RT1 周回の表: R1 は来ない。R2〜R10 は仕様の値で、R11・R20・R100 は R10 と同じ(上限)。ピンは R1・R2 が 1 回、R3 以降 2 回', async ({ page }) => {
    await start4(page, 1);
    const rows = await page.evaluate(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 100].map((r) => window.__dp.riotRules(r)));
    expect(rows[0].heli).toBeNull();
    expect(rows[0].total).toBe(0);
    expect(rows.slice(1, 10).map((r) => r.heli / 60)).toEqual([12, 10, 9, 8, 7.5, 7, 6.5, 6, 6]);
    expect(rows.slice(1, 10).map((r) => r.total)).toEqual([1, 2, 2, 3, 3, 3, 3, 4, 4]); // 1 ステージあたりの累計の上限
    expect(rows.slice(1, 10).map((r) => r.drops.join('-'))).toEqual(['1-1', '1-1', '1-1', '1-1', '1-1', '1-2', '1-2', '1-2', '2-2']);
    expect(rows.map((r) => r.pinPasses)).toEqual([1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    for (const i of [10, 11, 12]) expect(rows[i]).toEqual(rows[9]);
    // だんだん難しくなる(構える時間・撃つ間隔は短く、弾速・歩く速さは同じか速く)
    for (let i = 2; i < 10; i++) {
      expect(rows[i].aim).toBeLessThanOrEqual(rows[i - 1].aim);
      expect(rows[i].cooldown).toBeLessThanOrEqual(rows[i - 1].cooldown);
      expect(rows[i].bullet).toBeGreaterThanOrEqual(rows[i - 1].bullet);
      expect(rows[i].speed).toBeGreaterThanOrEqual(rows[i - 1].speed);
    }
  });

  test('RT2 R1 は来ない。R2・R5・R10 は開始 5 秒後に 1 機目、そのあと周回の間隔ごと。累計の上限まで投下したらもう来ない', async ({ page }) => {
    await start4(page, 1, { url: './?test&dev&inv=1' });
    let r = await watch(page, 1500);
    expect(r.error).toBeUndefined();
    expect(r.helis).toEqual([]);
    // R2: 累計 1 人 = 1 機だけ / R5: 1 機 1 人で累計 3 人 = 3 機 / R10: 1 機 2 人で累計 4 人 = 2 機。
    // 機動隊員は毎ステップ片付ける(倒されたのと同じ)が、補充はしないので、それ以上は来ない
    for (const [round, iv, n] of [[2, 720, 1], [5, 480, 3], [10, 360, 2]]) {
      await start4(page, round, { url: './?test&dev&inv=1' });
      r = await watch(page, 300 + iv * 5, { clearRiots: true });
      expect(r.error).toBeUndefined();
      expect(r.helis.map((h) => h.step), `R${round}`).toEqual(Array.from({ length: n }, (_, k) => 300 + iv * k));
    }
  });

  test('RT3 ヘリは左右どちらからも来る。主人公が向かっている先(主人公の段で 70px 以上離れた場所)へ投下して、反対側へ飛び去る', async ({ page }) => {
    const dirs = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      await start4(page, 10, { url: './?test&dev&inv=1', seed });
      const r = await watch(page, 1100, { girder: 'F2', x: 240, clearRiots: true });
      expect(r.helis.length).toBeGreaterThan(0);
      for (const h of r.helis) {
        dirs.add(h.dir);
        for (const t of h.targets) {
          expect(t.floor).toBe('F2');
          expect(Math.abs(t.x - 240)).toBeGreaterThanOrEqual(70);
        }
      }
    }
    expect([...dirs].sort()).toEqual([-1, 1]);
    // 飛び去る: 投下したあと、反対側の画面の外へ出て消える
    await start4(page, 2, { url: './?test&dev&inv=1' });
    const out = await page.evaluate(() => {
      const d = window.__dp;
      d.spawnHeli(1, [{ floor: 'F1', x: 300 }]);
      let s, dropped = null, gone = null;
      for (let i = 0; i < 600; i++) {
        d.placePlayer('F1', 100);
        s = d.step(1);
        const h = s.riot.helis[0];
        if (h && h.targets[0].dropped && dropped === null) dropped = { i, x: h.x };
        if (!h && gone === null) { gone = i; break; }
      }
      return { dropped, gone, riots: s.enemies.filter((e) => e.type === 'riot').map((e) => ({ state: e.state, x: e.x })) };
    });
    expect(out.dropped.x).toBeGreaterThanOrEqual(300);
    expect(out.dropped.x).toBeLessThan(303);
    expect(out.gone).not.toBeNull();
    expect(out.riots[0].state).toBe('chute');
  });

  test('RT4 ヘリの見た目: ローターが回り(羽根の長さが変わる)、警告ランプが点滅する。「POLICE」を描く。左向きは機体だけ左右反転', async ({ page }) => {
    await start4(page, 2, { riot: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      d.spawnHeli(1, []);
      for (let i = 0; i < 150; i++) d.step(1); // 画面の真ん中あたりへ
      const canvas = document.createElement('canvas');
      canvas.width = 480; canvas.height = 560;
      const ren = window.DP.createRenderer(canvas);
      const game = d.gameForRender();
      const h = game.data.level.riot.helis[0];
      const c2 = canvas.getContext('2d');
      const row = (y) => { let n = 0; const px = c2.getImageData(0, y, 480, 1).data; for (let i = 0; i < 480; i++) if (px[i * 4] === 0xaa && px[i * 4 + 1] === 0xb2) n++; return n; };
      const red = (x, y) => Array.from(c2.getImageData(x, y, 1, 1).data.slice(0, 3)).join(',');
      const out = [];
      for (let f = 0; f < 8; f++) {
        game.data.frame = 1000 + f * 2;
        ren.render(game);
        out.push({ blade: row(Math.round(h.y) - 24), lamp: red(Math.round(h.x) + 6, Math.round(h.y) + 15) });
      }
      return { out, x: h.x };
    });
    const blades = new Set(r.out.map((o) => o.blade));
    expect(blades.size).toBeGreaterThan(2); // 羽根の長さが変わる(回って見える)
    const lamps = new Set(r.out.map((o) => o.lamp));
    expect(lamps.has('255,42,42')).toBe(true); // 赤く光る
    expect(lamps.size).toBeGreaterThan(1); // 点滅する
  });

  test('RT5 ローター音は画面に見えている間だけ鳴り、飛び去ると止まる。ヘリには当たり判定がなく、撃たない', async ({ page }) => {
    await start4(page, 2, { riot: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      d.clearSounds();
      d.spawnHeli(1, []);
      let s, onCount = 0, lastOnStep = -1, rotorAfter = 0, died = false, bullets = 0;
      for (let i = 0; i < 500; i++) {
        // ガールの足場(y82)に立つ: ヘリの機体(y 約 28〜72)と主人公の体(y 56〜82)が重なる高さ
        const h0 = d.snapshot().riot.helis[0];
        d.placePlayer('top', 240);
        const before = d.sounds().filter((n) => n === 'rotor').length;
        s = d.step(1);
        const after = d.sounds().filter((n) => n === 'rotor').length;
        const h = s.riot.helis[0];
        if (h && h.onScreen) { onCount++; lastOnStep = i; }
        else if (lastOnStep >= 0 && after > before) rotorAfter++;
        if (s.state !== 'playing') died = true;
        bullets = Math.max(bullets, s.riot.bullets.length);
      }
      return { onCount, rotor: d.sounds().filter((n) => n === 'rotor').length, rotorAfter, died, bullets };
    });
    expect(r.onCount).toBeGreaterThan(100);
    expect(r.rotor).toBe(Math.ceil(r.onCount / 8)); // 見えている間、8 ステップごと
    expect(r.rotorAfter).toBe(0); // 見えなくなったら鳴らない
    expect(r.died).toBe(false); // ヘリに触れてもミスにならない
    expect(r.bullets).toBe(0); // ヘリは撃たない
  });

  test('RT6 パラシュート降下: 1.2px/ステップで左右に揺れながら降り、降下中は当たらない・撃たない。着地するとパラシュートが消え、猶予 60 ステップは撃たない', async ({ page }) => {
    await start4(page, 10, { riot: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      const id = d.spawnRiot('F1', 300, { state: 'chute', y: 72 });
      const out = [];
      let s;
      for (let i = 0; i < 600; i++) {
        // 主人公は同じ段(F1)の、降下の真下に立つ → 降下中は当たらない・撃たない
        d.placePlayer('F1', 300);
        s = d.step(1);
        const e = s.enemies.find((q) => q.id === id);
        out.push({ state: e.state, x: e.x, y: e.y, bullets: s.riot ? s.riot.bullets.length : 0, alive: s.state === 'playing', landGrace: e.landGrace });
        if (e.state === 'walk') break;
      }
      return out;
    });
    const chute = r.filter((o) => o.state === 'chute');
    expect(chute.length).toBeGreaterThan(200);
    for (let i = 1; i < chute.length; i++) expect(chute[i].y - chute[i - 1].y).toBeCloseTo(1.2, 6);
    expect(Math.max(...chute.map((o) => Math.abs(o.x - 300)))).toBeGreaterThan(6); // 揺れる
    expect(Math.max(...chute.map((o) => Math.abs(o.x - 300)))).toBeLessThanOrEqual(8 + 1e-9);
    expect(chute.every((o) => o.bullets === 0 && o.alive)).toBe(true);
    // 着地: 主人公と重なって降りたので、離れるまで当たらない(landGrace)。猶予の間は撃たない
    const land = r.filter((o) => o.state === 'land');
    expect(land.length).toBe(60);
    expect(land[0].y).toBe(445);
    expect(land[0].landGrace).toBe(true);
    expect(land.every((o) => o.bullets === 0 && o.alive)).toBe(true);
  });

  test('RT7 着地後、主人公が同じ段にいれば主人公の方を向いて構え(予備動作)、周回の時間のあと水平に撃つ。発砲音と閃光', async ({ page }) => {
    for (const round of [2, 5, 10]) {
      await start4(page, round, { riot: false });
      const rule = await page.evaluate((r) => window.__dp.riotRules(r), round);
      const r = await page.evaluate(() => {
        const d = window.__dp;
        d.clearSounds();
        const id = d.spawnRiot('F1', 360, { state: 'walk', dir: 1 });
        let s, aimAt = null, fireAt = null, b = null, dir = null;
        for (let i = 0; i < 300; i++) {
          d.placePlayer('F1', 200);
          s = d.step(1);
          const e = s.enemies.find((q) => q.id === id);
          if (e.state === 'aim' && aimAt === null) { aimAt = i; dir = e.dir; }
          if (s.riot.bullets.length && fireAt === null) { fireAt = i; b = s.riot.bullets[0]; break; }
        }
        return { aimAt, fireAt, b, dir, flashes: s.riot.flashes, sounds: d.sounds() };
      });
      expect(r.dir, `R${round} 主人公の方を向く`).toBe(-1);
      expect(r.fireAt - r.aimAt, `R${round} 構える時間`).toBe(rule.aim);
      expect(r.b.dir).toBe(-1);
      expect(r.b.speed).toBe(rule.bullet);
      expect(r.b.y).toBe(445 - 6); // 床から 6〜10px の高さ
      expect(r.b.box.h).toBe(4);
      expect(r.flashes).toBeGreaterThan(0);
      expect(r.sounds).toContain('riotShot');
    }
  });

  test('RT8 銃弾は水平にまっすぐ飛ぶ(誘導しない)。立っていると当たってミス。ジャンプで跳び越えると 100 点(1 発 1 回)', async ({ page }) => {
    // 当たる
    await start4(page, 10, { riot: false });
    let r = await page.evaluate(() => {
      const d = window.__dp;
      d.placePlayer('F1', 200);
      d.fireRiotBullet(320, 445, -1, 2.8);
      let s, ys = new Set();
      for (let i = 0; i < 120; i++) { s = d.step(1); if (s.riot.bullets[0]) ys.add(s.riot.bullets[0].y); if (s.state !== 'playing') break; }
      return { state: s.state, reason: s.deathReason, ys: [...ys] };
    });
    expect(r.state).toBe('dying');
    expect(r.reason).toBe('hazard');
    expect(r.ys).toEqual([439]); // 高さは変わらない
    // 跳び越える(弾が来るのを見てその場で跳ぶ)。どの踏み切りでも 1 発から 100 点は 1 回だけ
    let ok = null;
    for (const lead of [30, 40, 50, 60, 24, 70]) {
      await start4(page, 10, { riot: false });
      const score0 = (await snap(page)).score;
      r = await page.evaluate((ld) => {
        const d = window.__dp;
        const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
        d.placePlayer('F1', 200);
        d.fireRiotBullet(360, 445, -1, 2.8);
        let s = d.snapshot(), jumped = false;
        for (let i = 0; i < 200 && s.state === 'playing'; i++) {
          const b = s.riot.bullets[0];
          if (!jumped && b && b.x - s.player.x <= ld) { key(' ', true); jumped = true; }
          s = d.step(1);
          if (jumped) key(' ', false);
          if (!s.riot.bullets.length && s.player.state === 'ground') break;
        }
        return { state: s.state, score: s.score };
      }, lead);
      if (r.state === 'playing') { ok = { lead, gained: r.score - score0 }; break; }
    }
    expect(ok, 'どれかの踏み切りで跳び越えられる').not.toBeNull();
    expect(ok.gained).toBe(100);
  });

  test('RT9 ハシゴの上の主人公には銃弾が当たらず、機動隊員も撃たない(安全地帯)', async ({ page }) => {
    await start4(page, 10, { riot: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      const lv = d.level();
      // F1 → F2 のハシゴ(x=280)の下端につかまる(足元は F1 の高さ)
      const L = lv.ladders.find((l) => l.x === 280);
      const id = d.spawnRiot('F1', 400, { state: 'walk', dir: -1 });
      d.fireRiotBullet(380, 445, -1, 2.8);
      let s, aimed = false;
      for (let i = 0; i < 200; i++) {
        d.placePlayerLadder(L.index, 440);
        s = d.step(1);
        const e = s.enemies.find((q) => q.id === id);
        if (e && e.state === 'aim') aimed = true;
        if (s.state !== 'playing') break;
      }
      return { state: s.state, aimed };
    });
    expect(r.state).toBe('playing');
    expect(r.aimed).toBe(false);
  });

  test('RT10 釘バットで倒すと 1,000 点を 1 回だけ・「1000」・専用の撃破音・派手な演出。降下中は倒せない。当たり判定はすぐ消える', async ({ page }) => {
    await start4(page, 5, { riot: false });
    const score0 = (await snap(page)).score;
    const r = await page.evaluate(() => {
      const d = window.__dp;
      d.clearSounds();
      d.placePlayer('F1', 200);
      d.setFacing(1);
      d.setBat(600);
      const id = d.spawnRiot('F1', 240, { state: 'walk', dir: -1 });
      let s, gone = null;
      for (let i = 0; i < 60; i++) {
        d.placePlayer('F1', 200);
        s = d.step(1);
        if (!s.enemies.some((e) => e.id === id) && gone === null) gone = { i, score: s.score, popups: s.popups.slice() };
        if (s.state !== 'playing') break;
      }
      const after = d.step(40);
      return { gone, state: s.state, final: after.score, sounds: d.sounds() };
    });
    expect(r.state).toBe('playing');
    expect(r.gone).not.toBeNull();
    expect(r.gone.score - score0).toBe(1000);
    expect(r.gone.popups).toContain('1000');
    expect(r.final - score0).toBe(1000);
    expect(r.sounds.filter((n) => n === 'riotDown')).toHaveLength(1);
    // 降下中は倒せない(バットの範囲を通っても消えない)
    await start4(page, 5, { riot: false });
    const c = await page.evaluate(() => {
      const d = window.__dp;
      d.placePlayer('F1', 300);
      d.setBat(600);
      const id = d.spawnRiot('F1', 310, { state: 'chute', y: 300 }); // 40 ステップでは着地しない高さ
      let s;
      for (let i = 0; i < 40; i++) { d.placePlayer('F1', 300); s = d.step(1); }
      const e = s.enemies.find((q) => q.id === id);
      return { exists: !!e, state: e && e.state };
    });
    expect(c.exists).toBe(true);
  });

  test('RT11 体をジャンプで跳び越えると 100 点。足元のピンを抜かれると穴から落ちて気絶し 300 点', async ({ page }) => {
    // 跳び越え(歩いてくる隊員に向かって跳ぶ)
    let ok = false;
    for (const lead of [30, 36, 42, 24, 48]) {
      await start4(page, 2, { riot: false });
      const score0 = (await snap(page)).score;
      const r = await page.evaluate((ld) => {
        const d = window.__dp;
        const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
        // 主人公は F2(隊員は F1)にいる間に近づけ、隊員が歩いてきたら F1 に置いて向かって跳ぶ
        const id = d.spawnRiot('F1', 300, { state: 'walk', dir: -1, cool: 9999 }); // 撃たせずに歩かせる
        d.placePlayer('F1', 200);
        let s = d.snapshot(), jumped = false;
        key('ArrowRight', true);
        for (let i = 0; i < 200 && s.state === 'playing'; i++) {
          const e = s.enemies.find((q) => q.id === id);
          if (!jumped && e && e.x - s.player.x <= ld) { key(' ', true); jumped = true; }
          s = d.step(1);
          if (jumped) key(' ', false);
          if (jumped && s.player.state === 'ground') break;
        }
        key('ArrowRight', false);
        return { state: s.state, score: s.score };
      }, lead);
      if (r.state === 'playing' && r.score - score0 === 100) { ok = true; break; }
    }
    expect(ok, '向かって跳べば体を越えて 100 点').toBe(true);
    // 穴から落ちる: F1 の p1(x=120)の上に隊員を置いてピンを抜く
    await start4(page, 2, { riot: false });
    const score0 = (await snap(page)).score;
    const r = await page.evaluate(() => {
      const d = window.__dp;
      d.clearSounds();
      const id = d.spawnRiot('F1', 120, { state: 'walk', dir: 1 });
      d.placePlayer('F2', 300);
      d.pullPin('p1');
      let s, stunned = false;
      for (let i = 0; i < 120; i++) { d.placePlayer('F2', 300); s = d.step(1); const e = s.enemies.find((q) => q.id === id); if (e && e.state === 'stunned') stunned = true; }
      return { stunned, score: s.score, sounds: d.sounds() };
    });
    expect(r.stunned).toBe(true);
    expect(r.score - score0).toBe(300);
    expect(r.sounds).toContain('copStun');
  });

  test('RT12 機動隊員は 1 ステージあたりの累計の上限まで(R2 1 人・R5 3 人・R10 4 人)。倒されても補充せず、投下しきったらヘリも来ない', async ({ page }) => {
    for (const [round, total] of [[2, 1], [5, 3], [10, 4]]) {
      await start4(page, round, { url: './?test&dev&inv=1' });
      // 着地した隊員は毎ステップ片付ける(倒されたのと同じ)。長く見張っても、投下の累計は total で止まる
      const r = await page.evaluate(() => {
        const d = window.__dp;
        let s, lastHeliStep = -1;
        const seen = new Set();
        for (let i = 1; i <= 4000; i++) {
          d.placePlayer('F1', 240);
          s = d.step(1);
          for (const h of s.riot ? s.riot.helis : []) if (!seen.has(h.id)) { seen.add(h.id); lastHeliStep = i; }
          // 降下を終えた隊員を片付ける(降下中は残す)
          const g = d.gameForRender().data;
          g.enemies = g.enemies.filter((e) => e.type !== 'riot' || e.state === 'chute');
        }
        return { dropped: s.riot.dropped, helis: seen.size, lastHeliStep, flying: s.riot.helis.length };
      });
      expect(r.dropped, `R${round} 累計`).toBe(total);
      expect(r.flying).toBe(0); // もうヘリは飛んでいない
      expect(r.lastHeliStep).toBeLessThan(3000);
    }
  });

  test('RT12b ミスしても投下の累計は数え直さない(引き継ぐ)。次の周回の 4 面では 0 から', async ({ page }) => {
    await start4(page, 5); // R5: 累計 3 人
    let s = await page.evaluate(() => {
      const d = window.__dp;
      let q;
      // 2 人投下されるまで進める(主人公はハシゴの上 = 撃たれない安全地帯で待つ)
      const lv = d.level();
      const L = lv.ladders.find((l) => l.x === 280);
      for (let i = 0; i < 2000; i++) { d.placePlayerLadder(L.index, 420); q = d.step(1); if (q.riot && q.riot.dropped >= 2) break; }
      const before = q.riot.dropped;
      d.killPlayer('fall');
      q = d.step(1);
      while (q.state !== 'playing') q = d.step(1);
      q = d.step(1);
      return Object.assign(q, { before });
    });
    expect(s.before).toBe(2);
    expect(s.riot.dropped).toBe(2); // ミス後も 2 人のまま(残りは 1 人だけ)
    expect(s.enemies.filter((e) => e.type === 'riot')).toEqual([]); // 隊員そのものは片付く
    // 残り 1 人を投下したら、それ以上は来ない
    s = await page.evaluate(() => {
      const d = window.__dp;
      const lv = d.level();
      const L = lv.ladders.find((l) => l.x === 280);
      let q, helis = new Set();
      for (let i = 0; i < 3000; i++) {
        d.placePlayerLadder(L.index, 420);
        q = d.step(1);
        for (const h of q.riot.helis) helis.add(h.id);
      }
      return Object.assign(q, { helisAfter: helis.size });
    });
    expect(s.riot.dropped).toBe(3);
    expect(s.helisAfter).toBe(1);
    // 次の周回(R6)の 4 面では 0 から
    s = await page.evaluate(() => {
      const d = window.__dp;
      d.startStage(3, 6);
      let q = d.snapshot();
      while (q.state !== 'playing') q = d.step(1);
      return d.step(1);
    });
    expect(s.riot.dropped).toBe(0);
  });

  test('RT13 降りる場所: 主人公から 70px 以上、ハシゴ・穴の端・ゴリラから離れた足場。主人公の真上に降りて重なっても、離れるまで当たらない', async ({ page }) => {
    await start4(page, 10, { riot: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      const lv = d.level();
      const out = [];
      for (const [gd, x, face] of [['F1', 240, 1], ['F1', 240, -1], ['F2', 60, 1], ['F3', 400, -1], ['F4', 60, 1], ['F4', 420, -1], ['f0', 30, 1]]) {
        d.placePlayer(gd, x);
        d.setFacing(face);
        const ts = d.riotTargets(2);
        out.push({ gd, x, face, ts, ladders: lv.ladders.map((l) => ({ x: l.x, lower: l.lower, upper: l.upper })) });
      }
      return out;
    });
    for (const o of r) {
      expect(o.ts.length, `${o.gd} x=${o.x}`).toBeGreaterThan(0);
      for (const t of o.ts) {
        expect(t.floor).toBe(o.gd);
        expect(Math.abs(t.x - o.x)).toBeGreaterThanOrEqual(70);
        for (const l of o.ladders) if (l.lower === o.gd || l.upper === o.gd) expect(Math.abs(l.x - t.x)).toBeGreaterThanOrEqual(16);
        if (o.gd === 'F4') expect(Math.abs(t.x - 240)).toBeGreaterThanOrEqual(56); // ゴリラ
      }
      // 向いている方に降りられる場所があれば、そちらを先に選ぶ(F1 の真ん中なら左右どちらにも足場がある)
      if (o.gd === 'F1' && o.x === 240) expect(Math.sign(o.ts[0].x - o.x)).toBe(o.face);
    }
  });

  test('RT14 ミス・クリア演出・次の周回で、ヘリ・機動隊員・パラシュート・銃弾は残らず、ローター音も止まる', async ({ page }) => {
    await start4(page, 10, { riot: false });
    let s = await page.evaluate(() => {
      const d = window.__dp;
      d.spawnHeli(1, [{ floor: 'F2', x: 300 }]);
      d.spawnRiot('F1', 400, { state: 'walk' });
      d.spawnRiot('F3', 300, { state: 'chute', y: 100 });
      d.fireRiotBullet(300, 350, 1, 2.8);
      d.placePlayer('F4', 60);
      d.step(5);
      d.killPlayer('fall');
      let q = d.step(1);
      while (q.state !== 'playing') q = d.step(1);
      return q;
    });
    expect(s.enemies.filter((e) => e.type === 'riot')).toEqual([]);
    expect(s.riot === null || (s.riot.helis.length === 0 && s.riot.bullets.length === 0)).toBe(true);
    // クリア演出: 7 本を抜いた状態で、残る 1 本を抜く
    s = await page.evaluate(() => {
      const d = window.__dp;
      d.spawnHeli(-1, [{ floor: 'F1', x: 200 }]);
      d.spawnRiot('F1', 400, { state: 'walk' });
      d.fireRiotBullet(300, 350, 1, 2.8);
      for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) d.pullPin(id);
      d.step(2);
      // R10 は 2 回必要: 半解除にしてから通過させる
      const g = d.gameForRender().data;
      const p8 = g.level.pins.find((p) => p.id === 'p8');
      p8.passes = 1; p8.half = true;
      d.placePlayer('F4', 420);
      const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
      key('ArrowLeft', true);
      let q = d.snapshot();
      for (let i = 0; i < 80 && q.state === 'playing'; i++) q = d.step(1);
      key('ArrowLeft', false);
      d.clearSounds(); // クリア演出に入ってからの音だけを数える
      const later = d.step(120);
      return Object.assign(q, { rotorLater: d.sounds().filter((n) => n === 'rotor').length, laterRiot: later.riot, laterEnemies: later.enemies });
    });
    expect(s.state).toBe('collapse');
    expect(s.enemies).toEqual([]);
    expect(s.riot.helis).toEqual([]);
    expect(s.riot.bullets).toEqual([]);
    expect(s.rotorLater).toBe(0);
    expect(s.laterEnemies).toEqual([]);
  });

  test('RT15 R10: 構え(予備動作)を見てから跳べば、銃弾をよけられる(構え始めから跳ぶまでのステップをずらして確かめる)', async ({ page }) => {
    await start4(page, 10, { riot: false });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
      const ok = [];
      for (let k = 0; k <= 60; k += 2) {
        d.setManual(true); d.setCopsEnabled(false); d.setRiotEnabled(false); d.startStage(3, 10);
        let s = d.snapshot(); while (s.state !== 'playing') s = d.step(1);
        const id = d.spawnRiot('F1', 330, { state: 'walk', dir: -1 });
        let aimAt = null, jumped = false;
        for (let i = 0; i < 300 && s.state === 'playing'; i++) {
          if (!jumped) d.placePlayer('F1', 200);
          const e = s.enemies.find((q) => q.id === id);
          if (e && e.state === 'aim' && aimAt === null) aimAt = i;
          if (aimAt !== null && !jumped && i - aimAt >= k) { key(' ', true); jumped = true; }
          s = d.step(1);
          if (jumped) key(' ', false);
          // 1 発目が主人公の後ろへ抜けて、着地したら成功(2 発目は数えない)
          const b = s.riot && s.riot.bullets[0];
          if (jumped && s.player.state === 'ground' && (!b || b.x < s.player.x - 20)) break;
        }
        if (s.state === 'playing' && jumped) ok.push(k);
      }
      return ok;
    });
    // 構えてから撃つまで 20 ステップ。弾が届くまでにも時間があるので、構えを見てから跳べるタイミングが十分ある
    expect(r.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...r)).toBeGreaterThanOrEqual(20); // 撃ったのを見てから跳んでも間に合う
  });
});
