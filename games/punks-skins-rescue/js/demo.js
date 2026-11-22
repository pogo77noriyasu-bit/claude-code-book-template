// PUNKS & SKINS RESCUE: タイトル画面のゲーム説明デモ(2026-11-22)
// 4 パターンを順番に自動再生し、4 つ目のあとに HIGH SCORES 画面(上位 5 件。js/highscore.js)を SCORES_T 出して、1 つ目に戻る(ループ):
//   ① 味方: 落下 → 担架で救助 → 救急車 → ○   ② 味方: 落下 → 受け止めそこねる → ×
//   ③ 敵:   落下 → 担架で受け止めてしまう → × ④ 敵:   落下 → 見逃す → ○
// デモ専用のゲームの状態(PSR.game.create で作った別の物)を、本編と同じ規則 PSR.game.step で動かす。
// 本編の状態(得点・MISS・乱数など)には一切さわらない。キャバ嬢の操作だけをここで自動で行う。
// 描画は js/render.js の drawDemo(黒一色の画面)。
window.PSR = window.PSR || {};

PSR.demo = (function () {
  const C = PSR.config;

  const START_DELAY = 30; // パターンの説明を出してから、窓に人が現れるまで(ステップ)
  const RESULT_T = 150; // ○ / × を出している時間(このあと次のパターン)
  const SCORES_T = 360; // HIGH SCORES 画面を出している時間(6 秒。このあと 1 つ目のパターンへ)
  const MOVE_GAP = 12; // 自動操作で 1 ポジション動いたあと、次に動けるまで
  const WINDOW = 1; // 人が現れる窓(config.js の WINDOWS の番号。2 階)

  // 残りステップ(担架の高さに着くまで)
  const remain = (j) => (j && j.phase === 'arc' && j.arc.kind === 'catch' ? j.arc.T - j.arc.t : Infinity);

  // パターン: kind = 落ちてくる人(js/characters.js の id)、lane = キャバ嬢の最初の位置、
  //           ai(j, d) = キャバ嬢が向かう地点(null なら動かない)、expect = 正しい結果(テスト・確認用)
  //           caption / sub = 説明(英語)、captionJa / subJa = 同じ説明の日本語(タイトル画面で「英語 / 日本語」と併記)
  const PATTERNS = [
    {
      kind: 'punk',
      lane: 1,
      caption: 'PUNKS & SKINS : CATCH THEM!',
      sub: 'BOUNCE THEM TO THE AMBULANCE',
      captionJa: 'パンクスとスキンズを受け止めろ！',
      subJa: '救急車まで跳ね返せ',
      // 次に受け止める地点へ、跳ね返ってから少し遅れて動く(見て動く感じに)
      ai: (j) => (j && j.phase === 'arc' && j.arc.kind === 'catch' && j.arc.t >= 25 ? j.targets[j.idx] : null),
      expect: 'ok',
    },
    {
      kind: 'skin',
      lane: 2,
      caption: "PUNKS & SKINS : DON'T DROP THEM!",
      sub: 'DROPPED = MISS',
      captionJa: '落とすな！',
      subJa: '落としたらミス',
      // 着く直前になってから動き出す → 1 つ動いたところで間に合わず、そこで止まる
      ai: (j) => (remain(j) <= 10 ? 0 : null),
      expect: 'ng',
    },
    {
      kind: 'police',
      lane: 1,
      caption: "POLICE & RIOT : DON'T CATCH THEM!",
      sub: 'CAUGHT = MISS',
      captionJa: '警官と機動隊は受け止めるな！',
      subJa: '受け止めたらミス',
      ai: (j) => (j && j.phase === 'arc' && j.arc.t >= 40 ? j.targets[j.idx] : null),
      expect: 'ng',
    },
    {
      kind: 'riot',
      lane: 0,
      caption: 'POLICE & RIOT : LET THEM FALL!',
      sub: 'DODGE = SAFE',
      captionJa: '見逃せ！',
      subJa: 'よければセーフ',
      // 落ちてくる地点で待っていて、着く少し前によける
      ai: (j) => (j && remain(j) <= 45 ? 1 : null),
      expect: 'ok',
    },
  ];

  let d = null; // デモの状態

  // パターン i を最初から始める
  function begin(i, frame) {
    const p = PATTERNS[i];
    const dg = PSR.game.create(1); // デモ専用のゲームの状態(本編とは別)
    PSR.game.start(dg);
    dg.frame = frame || 0; // 点滅・回転の見た目を途切れさせない
    dg.spawnTimer = Infinity; // 自動の出現はしない(人はこちらで 1 人だけ出す)
    dg.hostess.lane = p.lane;
    dg.hostess.x = PSR.game.laneX(p.lane);
    dg.events.length = 0;
    d = { idx: i, t: 0, dg, jumper: null, phase: 'play', mark: null, markT: 0, moveT: 0, scoresT: 0, scores: [], history: d ? d.history : [] };
  }

  function reset() {
    d = null;
    begin(0, 0);
  }

  function step() {
    if (!d) reset();
    const p = PATTERNS[d.idx];
    const dg = d.dg;
    d.t++;

    if (d.phase === 'scores') {
      // HIGH SCORES 画面: 時間が来たら 1 つ目のパターンへ(点滅の見た目は途切れさせない)
      dg.frame++;
      if (++d.scoresT >= SCORES_T) begin(0, dg.frame);
      return;
    }

    if (d.phase === 'result') {
      // ○ / × を出している間も、倒れている人などの見た目は進める
      PSR.game.step(dg);
      dg.events.length = 0;
      if (++d.markT >= RESULT_T) {
        if (d.idx + 1 < PATTERNS.length) begin(d.idx + 1, dg.frame);
        else {
          // 4 つ目のあとは HIGH SCORES 画面。記録はここで 1 回だけ読む(表示中は毎フレーム読まない)
          d.phase = 'scores';
          d.scoresT = 0;
          d.scores = PSR.highscore ? PSR.highscore.list().slice(0, C.HIGHSCORE_MAX || 5) : [];
        }
      }
      return;
    }

    // 人を出す(落下の速さは 1 倍に固定して、毎回同じ動きにする)
    if (!d.jumper && d.t >= START_DELAY) {
      const j = PSR.game.spawn(dg, { kind: p.kind, first: C.FIRST_LANES[0], window: WINDOW });
      j.speed = 1;
      d.jumper = j;
    }

    // キャバ嬢の自動操作(1 ポジションずつ、MOVE_GAP ステップに 1 回)
    if (d.moveT > 0) d.moveT--;
    const target = p.ai(d.jumper, d);
    if (target != null && target !== dg.hostess.lane && d.moveT === 0) {
      PSR.game.move(dg, target < dg.hostess.lane ? -1 : 1);
      d.moveT = MOVE_GAP;
    }

    PSR.game.step(dg);
    dg.events.length = 0; // デモでは音を鳴らさない

    // 結果: 救急車に着いた / 敵を見逃した = ○、落とした / 敵を受け止めた = ×
    const j = d.jumper;
    let result = null;
    if (dg.rescued > 0) result = 'ok';
    else if (j && j.phase === 'lie') result = j.result === 'safe' ? 'ok' : 'ng';
    if (result) {
      d.phase = 'result';
      d.mark = result;
      d.markT = 0;
      d.history.push({ pattern: d.idx + 1, kind: p.kind, mark: result, expect: p.expect });
      if (d.history.length > 40) d.history.shift();
    }
  }

  // テスト・確認用
  function snapshot() {
    if (!d) reset();
    return {
      pattern: d.idx + 1,
      phase: d.phase,
      mark: d.mark,
      kind: PATTERNS[d.idx].kind,
      lane: d.dg.hostess.lane,
      history: d.history.slice(),
      scores: d.phase === 'scores' ? d.scores.slice() : null, // HIGH SCORES 画面で出している記録
    };
  }

  return {
    PATTERNS,
    SCORES_T,
    reset,
    step,
    snapshot,
    get state() {
      if (!d) reset();
      return d;
    },
  };
})();
