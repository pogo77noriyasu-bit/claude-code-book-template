// 開発用ショートカット(DEV モード)。難易度の調整・不具合の調査に使う
// 有効になる条件: URL に ?dev が付いていること(ローカルでも GitHub Pages の公開先でも。ドンキーパンクと同じ)。
// ?dev を付けずに開いた通常プレイには何も影響しない。
// DEV モードのあいだはハイスコアを保存せず画面の HI も変えないので、通常のハイスコア(今後のランキングも)には記録されない。
//
// URL で始める面を指定できる(範囲外・数字でない値は無視して、今までどおりタイトルから):
//   ?dev&stage=6   … 開いてすぐ 6 面の READY から始める(stage は 1〜99)
//
// 使えるキー:
//   1〜9 … (いつでも)その面から新しいゲームを始める(1 = 1 面 … 9 = 9 面)
//   C     … (プレイ中のみ)ステージをクリアしたことにする(クリアの演出のあと次の面へ)
//   I     … (いつでも)無敵の ON / OFF。無敵中は群衆が線や主人公に触れてもミスにならない
window.PQ = window.PQ || {};

PQ.devTools = (function () {
  const MAX_STAGE = 99;

  // DEV モードにするか(URL に ?dev が付いているか。ホストは問わない)。
  // loc は location と同じ形({ search })。テストから偽物を渡せるよう引数にしている
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

  // URL の stage / inv を読む。値がないか正しくない項目は null
  function parseParams(search) {
    const q = new URLSearchParams(search);
    const inv = q.get('inv');
    return {
      stage: parseIntIn(q.get('stage'), 1, MAX_STAGE),
      inv: inv === '1' ? true : inv === '0' ? false : null,
    };
  }

  // DEV モードを有効にする(?dev がなければ何もしないで false)
  function install(game) {
    if (!isDevEnvironment(location)) return false;
    const g = game.data;
    g.devMode = true; // 画面に「DEV」と出す・ハイスコアを保存しない・無敵を使えるようにする
    const params = parseParams(location.search);
    g.devInvincible = params.inv === true;
    if (params.stage !== null) game.newGame(params.stage);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) game.newGame(Number(m[1]));
      if (e.code === 'KeyC') game.devClear();
      if (e.code === 'KeyI') g.devInvincible = !g.devInvincible;
    });
    return true;
  }

  return { isDevEnvironment, parseParams, install, MAX_STAGE };
})();
