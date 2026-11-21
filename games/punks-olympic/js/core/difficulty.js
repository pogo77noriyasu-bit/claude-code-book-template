// ROUND 別の CPU の難易度(2026-11-19)。設定は config.js の PO.ROUND_DIFFICULTY に一元化し、ここで種目ごとの値を計算する
// - 各種目は競技を作るとき(create)に PO.difficulty.params(種目, R1 の調整値) を呼び、いまの ROUND の値で上書きした調整値を使う。
//   種目のファイルには ROUND 別の数値を書かない
// - R1 は L = 0 なので、どの値も R1 の調整値のまま(R1 の難易度は変わらない)
// - リレーのバトン交換の判定(プレイヤーと CPU の両方。競技・操作説明のデモ・タイミングのバーで同じ)は relayJudge()
PO.difficulty = (function () {
  const D = () => PO.ROUND_DIFFICULTY;
  const cur = (round) => round || (PO.progress && PO.progress.round) || 1;
  const at = (list, round) => list[Math.min(list.length, Math.max(1, round)) - 1];

  // ROUND の基準の CPU 能力(R1 = 1.0)
  function level(round) {
    return at(D().cpuLevel, cur(round));
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r2 = (v) => Math.round(v * 1000) / 1000;

  // いまの ROUND の調整値: base(その種目の R1 の調整値)をコピーし、ROUND の分だけ CPU を強くした値で上書きする
  function params(eventId, base, round) {
    const L = level(round) - 1;
    const E = D().events[eventId] || {};
    const p = Object.assign({}, base);
    const scale = (v, w) => v * (1 + L * (w || 0));
    if (E.speed != null) {
      p.CPU_SPEED_SCALE = scale(base.CPU_SPEED_SCALE, E.speed);
      p.CPU_SPEED_CAP = E.speedCap;
    }
    if (eventId === 'anpan') p.CPU_JUMP_SUCCESS = base.CPU_JUMP_SUCCESS.map((v) => r2(clamp(v + L * E.jumpAdd, 0, E.jumpMax)));
    if (eventId === 'tug') {
      // 敵の PERFECT・GREAT を上げ、合計が total を超えるときは GOOD から減らす(MISS が減る)
      const e = base.CPU_ENEMY;
      const P = e.PERFECT * (1 + L * E.perfect);
      const G = e.GREAT * (1 + L * E.great);
      const total = Math.max(e.PERFECT + e.GREAT + e.GOOD, Math.min(E.total, P + G + e.GOOD));
      p.CPU_ENEMY = { PERFECT: r2(P), GREAT: r2(G), GOOD: r2(Math.max(0, total - P - G)) };
    }
    if (eventId === 'balltoss') {
      p.CPU_SPEED_SCALE = scale(base.CPU_SPEED_SCALE, E.rate);
      p.CPU_RATE_CAP = E.rateCap;
      p.CPU_HITS = base.CPU_HITS.map((v) => r2(clamp(v + L * E.hitAdd, 0, E.hitMax)));
    }
    if (eventId === 'cankick') {
      p.CPU_GAP = base.CPU_GAP.map((g) => g.map((v) => r2(Math.max(E.gapMin, v * (1 - L * E.gap)))));
      p.CPU_ANGLE_ERR = base.CPU_ANGLE_ERR.map((v) => r2(Math.max(E.angleErrMin, v * (1 - L * E.angleErr))));
      p.CPU_FOUL = base.CPU_FOUL.map((v) => r2(Math.max(0, v * (1 - L * E.foul))));
    }
    if (eventId === 'relay') {
      p.CPU_PASS = base.CPU_PASS.map((t) => {
        const P = clamp(t.PERFECT + L * E.perfectAdd, 0, E.perfectMax);
        const total = clamp(t.PERFECT + t.GOOD + (L * E.perfectAdd) / 2, 0, E.passTotal);
        return { PERFECT: r2(P), GOOD: r2(Math.max(0, total - P)) };
      });
      Object.assign(p, relayJudge(round));
    }
    return p;
  }

  // リレーのバトン交換の判定の範囲 { PERFECT_M, GOOD_M }(いまの ROUND)
  function relayJudge(round) {
    return Object.assign({}, at(D().relayJudge, cur(round)));
  }

  return { level, params, relayJudge };
})();
