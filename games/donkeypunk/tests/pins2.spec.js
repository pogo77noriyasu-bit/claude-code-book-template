// 4 面: 安全ピンの撤去条件(R1・R2 は 1 回の通過、R3 以降は 2 回の通過)のテスト
// 1 回目の通過(R3 以降): ピンクから白(半解除)・短い効果音 pinHalf・穴は開かない・得点なし。2 回目: 今までどおり抜ける(穴・100 点・pin)。
// 通過 = ピンの範囲に入ってから横に出ること(立ち続けても・1 回のジャンプでも 2 回にならない)。半解除はミス後も引き継ぎ、次の周回で戻る。
const { test, expect } = require('@playwright/test');
const { snap, step, watchConsoleErrors, startAtStage } = require('./helpers');

watchConsoleErrors(test);

const STAGE4 = 3;

// F1 の p1(x=120)を、右から左へ歩いて 1 回通過させる(範囲の外 x=150 → x=90)
async function walkAcross(page, from, to) {
  return page.evaluate(([a, b]) => {
    const d = window.__dp;
    const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
    d.placePlayer('F1', a);
    const k = b < a ? 'ArrowLeft' : 'ArrowRight';
    key(k, true);
    let s = d.snapshot();
    for (let i = 0; i < 120 && s.state === 'playing'; i++) {
      s = d.step(1);
      if ((b < a && s.player.x <= b) || (b > a && s.player.x >= b)) break;
    }
    key(k, false);
    return d.step(1);
  }, [from, to]);
}
const pinOf = (s, id) => s.pins.find((p) => p.id === id);
const f1Pieces = (page) => page.evaluate(() => window.__dp.level().girders.filter((g) => g.y1 === 445).map((g) => [g.x1, g.x2]));

test.describe('4 面 安全ピンの 2 回通過', () => {
  test('PN1 R1・R2 は 1 回の通過で抜ける(今までどおり。黄色)', async ({ page }) => {
    for (const round of [1, 2]) {
      await startAtStage(page, STAGE4, { round });
      const s0 = await snap(page);
      expect(s0.pinPassesNeeded).toBe(1);
      const s = await walkAcross(page, 150, 90);
      expect(pinOf(s, 'p1').pulled, `R${round}`).toBe(true);
      expect(s.score - s0.score).toBe(100);
      expect(await f1Pieces(page)).toEqual([[16, 108], [132, 464]]); // 穴が開いた
    }
  });

  test('PN2 R3・R5・R10 は 2 回: 1 回目は白くなる(半解除)だけで穴も得点もなし・効果音 pinHalf。2 回目で抜ける(穴・100 点・pin)', async ({ page }) => {
    for (const round of [3, 5, 10]) {
      await startAtStage(page, STAGE4, { round });
      const s0 = await snap(page);
      expect(s0.pinPassesNeeded).toBe(2);
      expect(pinOf(s0, 'p1')).toMatchObject({ passes: 0, half: false, pulled: false });
      await page.evaluate(() => window.__dp.clearSounds());
      let s = await walkAcross(page, 150, 90);
      expect(pinOf(s, 'p1'), `R${round} 1 回目`).toMatchObject({ passes: 1, half: true, pulled: false });
      expect(s.score).toBe(s0.score);
      expect(await f1Pieces(page)).toEqual([[16, 464]]); // 穴は開かない
      let sounds = await page.evaluate(() => window.__dp.sounds());
      expect(sounds).toContain('pinHalf');
      expect(sounds).not.toContain('pin');
      // 2 回目(反対向きに歩いて戻る)
      await page.evaluate(() => window.__dp.clearSounds());
      s = await walkAcross(page, 90, 150);
      expect(pinOf(s, 'p1'), `R${round} 2 回目`).toMatchObject({ pulled: true });
      expect(s.score - s0.score).toBe(100);
      expect(await f1Pieces(page)).toEqual([[16, 108], [132, 464]]);
      sounds = await page.evaluate(() => window.__dp.sounds());
      expect(sounds).toContain('pin');
    }
  });

  test('PN3 ピンの色: R1・R2 は黄色、R3 以降は初期状態がピンク・半解除で白', async ({ page }) => {
    const colorAt = (page) => page.evaluate(() => {
      const d = window.__dp;
      const canvas = document.createElement('canvas');
      canvas.width = 480; canvas.height = 560;
      const r = window.DP.createRenderer(canvas);
      r.render(d.gameForRender());
      return Array.from(canvas.getContext('2d').getImageData(112, 448, 1, 1).data.slice(0, 3)).join(','); // p1 の留め金
    });
    await startAtStage(page, STAGE4, { round: 2 });
    expect(await colorAt(page)).toBe('255,210,60'); // 黄色 #ffd23c
    await startAtStage(page, STAGE4, { round: 3 });
    expect(await colorAt(page)).toBe('255,90,166'); // ピンク #ff5aa6
    await walkAcross(page, 150, 90);
    expect(await colorAt(page)).toBe('244,244,250'); // 白 #f4f4fa
  });

  test('PN4 跳び越えても通過に数える。1 回のジャンプでは 1 回だけ。立ち続けても数えない', async ({ page }) => {
    await startAtStage(page, STAGE4, { round: 3 });
    // ピンの上に立ち続ける(範囲から出ない)
    let s = await page.evaluate(() => {
      const d = window.__dp;
      let q;
      for (let i = 0; i < 120; i++) { d.placePlayer('F1', 120); q = d.step(1); }
      return q;
    });
    expect(pinOf(s, 'p1').passes).toBe(0);
    // 範囲から外へ歩いて出ると 1 回(上に立っていた分は 1 回にしかならない)
    s = await walkAcross(page, 120, 90);
    expect(pinOf(s, 'p1').passes).toBe(1);
    // 跳び越え: 右から左へ、ピンの上を 1 回のジャンプで越える → 2 回目になって抜ける
    await startAtStage(page, STAGE4, { round: 3 });
    s = await page.evaluate(() => {
      const d = window.__dp;
      const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
      d.placePlayer('F1', 146);
      key('ArrowLeft', true); key(' ', true);
      let q = d.step(1);
      key(' ', false);
      const passes = [];
      for (let i = 0; i < 80; i++) { q = d.step(1); passes.push(q.pins.find((p) => p.id === 'p1').passes); if (i > 3 && q.player.state === 'ground') break; }
      key('ArrowLeft', false);
      return Object.assign(q, { passesSeen: [...new Set(passes)] });
    });
    expect(pinOf(s, 'p1').passes).toBe(1); // 1 回のジャンプで 1 回だけ
    expect(s.passesSeen).toEqual([0, 1]);
    expect(pinOf(s, 'p1').half).toBe(true);
  });

  test('PN5 ミスしても半解除(白)と抜いたピンは引き継ぐ。次の周回では初期状態に戻る', async ({ page }) => {
    await startAtStage(page, STAGE4, { round: 3 });
    await walkAcross(page, 150, 90); // p1 を半解除
    await page.evaluate(() => window.__dp.pullPin('p7')); // p7 は抜いた状態
    let s = await page.evaluate(() => {
      const d = window.__dp;
      d.killPlayer('fall');
      let q = d.step(1);
      while (q.state !== 'playing') q = d.step(1);
      return q;
    });
    expect(s.lives).toBe(2);
    expect(pinOf(s, 'p1')).toMatchObject({ half: true, passes: 1, pulled: false });
    expect(pinOf(s, 'p7').pulled).toBe(true);
    expect(s.pinOrder).toEqual(['p7']);
    // 白いピンはもう 1 回の通過で抜ける
    s = await walkAcross(page, 90, 150);
    expect(pinOf(s, 'p1').pulled).toBe(true);
    // 次の周回(R4)の 4 面では、すべて初期状態
    s = await page.evaluate(() => {
      const d = window.__dp;
      d.startStage(3, 4);
      let q = d.snapshot();
      while (q.state !== 'playing') q = d.step(1);
      return q;
    });
    expect(s.pins.every((p) => !p.pulled && !p.half && p.passes === 0)).toBe(true);
  });

  test('PN6 R3 以降も 8 本すべて完全に抜くとクリア演出(半解除のピンが残っているうちは始まらない)', async ({ page }) => {
    await startAtStage(page, STAGE4, { round: 3 });
    const s = await page.evaluate(() => {
      const d = window.__dp;
      for (const id of ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) d.pullPin(id);
      return d.step(1);
    });
    expect(s.state).toBe('playing');
    let t = await walkAcross(page, 150, 90); // p1 の 1 回目: 半解除のまま
    expect(t.state).toBe('playing');
    expect(pinOf(t, 'p1').half).toBe(true);
    t = await walkAcross(page, 90, 150); // 2 回目: 8 本目が抜けてクリア演出
    expect(t.state).toBe('collapse');
  });

  test('PN7 半解除は地形を変えないので、どの白いピンからでももう一度通過できる(8 本すべてを半解除にしてから、全部 2 回目で抜ける)', async ({ page }) => {
    await startAtStage(page, STAGE4, { round: 3 });
    const r = await page.evaluate(() => {
      const d = window.__dp;
      const g = d.gameForRender().data;
      for (const p of g.level.pins) { p.passes = 1; p.half = true; }
      const lv = d.level();
      const pieces = lv.girders.length;
      // それぞれのピンの左から右へ歩いて通過する(同じ床の上。穴は開いていないので歩いて渡れる)
      const key = (k, dn) => window.dispatchEvent(new KeyboardEvent(dn ? 'keydown' : 'keyup', { key: k }));
      const pulled = [];
      for (const p of g.level.pins) {
        d.placePlayer(p.girder, p.x - 24);
        key('ArrowRight', true);
        let q = d.snapshot();
        for (let i = 0; i < 60 && q.state === 'playing'; i++) { q = d.step(1); if (q.player.x >= p.x + 20) break; }
        key('ArrowRight', false);
        if (q.pins.find((x) => x.id === p.id).pulled) pulled.push(p.id);
        if (q.state !== 'playing') break;
      }
      return { pieces, pulled, state: d.snapshot().state };
    });
    expect(r.pieces).toBe(6); // 半解除だけでは床は分かれていない(地面 + F1〜F4 + ガールの足場)
    expect(r.pulled).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
    expect(r.state).toBe('collapse');
  });
});
