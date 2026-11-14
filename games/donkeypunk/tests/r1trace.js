// 1 面 R1 の「投げる時刻・種類・瓶と缶の軌跡」を記録する補助(周回難易度の改修で R1 が変わっていないことを確かめる)。
// round を渡すと、その周回で記録する(R2〜R4 は tests/fixtures/stage1-r2r4.json。ゴミ箱を足す前の記録)
// 記録: RECORD_R1=1 npx playwright test tests/stage1rounds.spec.js -g R0   → tests/fixtures/stage1-r1.json を書く
// 比較: 同じ関数で今のコードの記録を取り、ファイルと 1 ステップ単位(指紋)で一致することを確かめる
const SCENARIOS = [
  // 主人公の位置で、瓶・缶がハシゴを降りるかの判定(ハシゴの下の安全地帯)が変わるので 2 通り
  { name: 'top300', girder: 'top', x: 300 },
  { name: 'g1ladder256', girder: 'g1', x: 256 },
];
const SEEDS = [1, 7, 42];
const STEPS = 1800; // 30 秒

async function traceR1(page, scenario, seed, round = 1) {
  return page.evaluate(([sc, seed, steps, round]) => {
    const d = window.__dp;
    d.setManual(true);
    d.setSeed(seed);
    d.startStage(0, round);
    let s = d.step(1);
    while (s.state !== 'playing') s = d.step(1);
    const g = d.gameForRender().data;
    d.placePlayer(sc.girder, sc.x);
    // FNV-1a(32bit)で、毎ステップの瓶・缶の状態をまとめた指紋を作る
    let hash = 0x811c9dc5;
    const add = (str) => { for (let i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; } };
    const throws = [];
    const seen = new Set();
    for (let t = 1; t <= steps; t++) {
      // 主人公は動かさない(同じ位置に置き直す。ミスしても数え続ける)
      if (g.state === 'playing') d.placePlayer(sc.girder, sc.x);
      s = d.step(1);
      for (const h of g.hazards) {
        if (!seen.has(h.id)) { seen.add(h.id); throws.push([t, h.type]); }
        add(t + ':' + h.type + ':' + h.x.toFixed(4) + ':' + h.y.toFixed(4) + ':' + h.state + ';');
      }
    }
    return { throws, hash: hash.toString(16), count: seen.size };
  }, [scenario, seed, STEPS, round]);
}

module.exports = { SCENARIOS, SEEDS, STEPS, traceR1 };
