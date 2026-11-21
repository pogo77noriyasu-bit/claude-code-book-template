// 開発用ショートカット(DEV モード)
// 有効になる条件: URL に ?dev が付いていること(ローカルでも GitHub Pages の公開先でも)。
// β版の公開後も、不具合の調査・難易度の調整・宣伝用のプレイ動画の撮影に使うため、公開先でも使えるようにした
// (以前は localhost / 127.0.0.1 / file:// のときだけ)。?dev を付けずに開いた通常プレイには何も影響しない。
// DEV モードのあいだはハイスコアを保存しないので、通常のハイスコア(ランキング)にも影響しない。
//
// URL で一度に指定できる(省略した項目は 周回 1・面 1・無敵 0。範囲外・数字でない値は無視してその項目は初期値):
//   ?dev&round=3&stage=4&inv=1   … 3 周目の 4 面から、無敵 ON で始める
//   ?dev&round=100&stage=2&inv=0 … 100 周目の 2 面から、無敵 OFF で始める
//   round(周回)は 1〜999、stage(面)は 1〜面の数、inv(無敵)は 1 = ON / 0 = OFF。round か stage を書くと開いてすぐその面の READY から
//
// 使えるキー:
//   C     … (プレイ中のみ)ステージをクリアしたことにして、ゴリラ警官の逃走演出を直接始める
//           (4 面では、残りの安全ピンをすべて抜いた状態にして、崩壊のクリア演出を始める)
//   1〜9 … (いつでも)その面から新しいゲームを始める(1 = 1 面 … 4 = 4 面)。周回は今の DEV の周回(最初は 1)
//   R     … (いつでも)周回数を入力する欄を出す。入れた周回で、今の面から新しいゲームを始める
//   I     … (いつでも)無敵の ON / OFF を切り替える。無敵中は敵・障害物・落下でミスにならない(得点・アイテム・ピン・クリアは通常どおり)
//
// DEV モードのあいだはハイスコアを保存しない(game.js の saveHiScore)。
window.DP = window.DP || {};

DP.devTools = (function () {
  const MAX_ROUND = 999;

  // DEV モードにするか(URL に ?dev が付いているか。ホストは問わない)。
  // loc は location と同じ形({ protocol, hostname, search })。テストから偽物を渡せるよう引数にしている
  function isDevEnvironment(loc) {
    return new URLSearchParams(loc.search).has('dev');
  }

  // 整数の文字列だけを受け付ける(min〜max の範囲外・小数・数字でないものは null)
  function parseIntIn(text, min, max) {
    if (text === null || text === undefined) return null;
    const s = String(text).trim();
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return n >= min && n <= max ? n : null;
  }

  // URL の round / stage / inv を読む。stageCount は面の数。値がないか正しくない項目は null
  function parseParams(search, stageCount) {
    const q = new URLSearchParams(search);
    const inv = q.get('inv');
    return {
      round: parseIntIn(q.get('round'), 1, MAX_ROUND),
      stage: parseIntIn(q.get('stage'), 1, stageCount),
      inv: inv === '1' ? true : inv === '0' ? false : null,
    };
  }

  function install(game) {
    if (!isDevEnvironment(location)) return false;
    const g = game.data;
    g.devMode = true; // 画面に「DEV」と出す・ハイスコアを保存しない・無敵を使えるようにする
    const params = parseParams(location.search, DP.stages.length);
    g.devRound = params.round || 1; // 1〜9 キー・R キーで始めるときの周回
    g.devInvincible = params.inv === true; // 無敵(初期値は OFF)
    // URL で面か周回を指定したら、開いてすぐその面から始める
    if (params.round !== null || params.stage !== null) game._startStage((params.stage || 1) - 1, g.devRound);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyC') game._devClear();
      if (e.code === 'KeyI') g.devInvincible = !g.devInvincible;
      if (e.code === 'KeyR') {
        const answer = window.prompt('周回数を入力してください(1〜' + MAX_ROUND + ')', String(g.devRound));
        const round = parseIntIn(answer, 1, MAX_ROUND);
        if (round !== null) {
          g.devRound = round;
          game._startStage(g.stageIndex || 0, round);
        }
      }
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) game._startStage(Number(m[1]) - 1, g.devRound);
    });
    return true;
  }

  return { isDevEnvironment, parseParams, install, MAX_ROUND };
})();
