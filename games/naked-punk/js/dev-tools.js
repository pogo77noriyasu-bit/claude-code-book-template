// 開発用ショートカット(DEV モード)。難易度の調整・不具合の調査に使う
// 有効になる条件: URL に ?dev が付いていること(ドンキーパンク・PUNKS QIX・PUNKS WALK AND JUMP と同じ)。?dev がなければ何もしない。
// DEV モードのあいだはハイスコアを保存せず、画面の HI も変えない。
//
// URL: ?dev&stage=3 … 開いてすぐ 3 面の READY から(1〜99。正しくない値は無視してタイトルから)
//      &inv=1     … 無敵 ON で始める
// キー: 1〜9 … (いつでも)その面から新しいゲーム / C … (プレイ中)ステージクリアにする / I … 無敵の ON / OFF
//       P / J / T / H … (プレイ中・READY)パトカー / ジープ / 軽武装戦車 / 重戦車 をすぐ出す(面によらず)
//       B … ブレイク演出を見る(押すたびにパトカー → ジープ → 軽戦車 → 重戦車。終わったら今の面を最初から)
//       無敵中は敵に触れてもミスにならない(ビール中に倒すことはできる)
NP.devTools = (function () {
  const MAX_STAGE = 99;

  function isDevEnvironment(loc) {
    return new URLSearchParams(loc.search).has('dev');
  }

  function parseIntIn(text, min, max) {
    if (text === null || text === undefined) return null;
    const s = String(text).trim();
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return n >= min && n <= max ? n : null;
  }

  function parseParams(search) {
    const q = new URLSearchParams(search);
    const inv = q.get('inv');
    return {
      stage: parseIntIn(q.get('stage'), 1, MAX_STAGE),
      inv: inv === '1' ? true : inv === '0' ? false : null,
    };
  }

  let breakIndex = 0; // B キーで次に見るブレイク演出

  function install(game) {
    if (!isDevEnvironment(location)) return false;
    const g = game.data;
    g.devMode = true;
    const params = parseParams(location.search);
    g.devInvincible = params.inv === true;
    if (params.stage !== null) game.newGame(params.stage);
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) game.newGame(Number(m[1]));
      if (e.code === 'KeyC') game.devClear();
      if (e.code === 'KeyI') g.devInvincible = !g.devInvincible;
      // 乱入キャラクターをすぐ出す: P パトカー / J ジープ / T 軽武装戦車 / H 重戦車
      const car = { KeyP: 'patrol', KeyJ: 'jeep', KeyT: 'lightTank', KeyH: 'heavyTank' }[e.code];
      if (car) game.devSpawn(car);
      // ブレイク演出を見る: B を押すたびにパトカー → ジープ → 軽戦車 → 重戦車 の順(終わったら今の面を最初から)
      if (e.code === 'KeyB') {
        game.devIntermission(NP.intermission.ORDER[breakIndex % NP.intermission.ORDER.length]);
        breakIndex++;
      }
    });
    return true;
  }

  return { isDevEnvironment, parseParams, install, MAX_STAGE };
})();
