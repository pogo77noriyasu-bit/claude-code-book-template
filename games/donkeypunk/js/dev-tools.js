// 開発用ショートカット(開発環境だけで有効)
// 有効になる条件: 「localhost / 127.0.0.1 / ローカルファイル(file://)で開いている」かつ「URL に ?dev が付いている」。
// GitHub Pages などの公開先では ?dev を付けても有効にならない。
//
// 使えるキー:
//   C     … (プレイ中のみ)ステージをクリアしたことにして、ゴリラ警官の逃走演出を直接始める
//   1〜9 … (いつでも)その面から新しいゲームを始める(1 = 1 面、2 = 2 面、3 = 3 面)
window.DP = window.DP || {};

DP.devTools = (function () {
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

  // loc は location と同じ形({ protocol, hostname, search })。テストから偽物を渡せるよう引数にしている
  function isDevEnvironment(loc) {
    const local = loc.protocol === 'file:' || LOCAL_HOSTS.includes(loc.hostname);
    return local && new URLSearchParams(loc.search).has('dev');
  }

  function install(game) {
    if (!isDevEnvironment(location)) return false;
    game.data.devMode = true; // 画面に「DEV」と出すため(renderer.js)
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyC') game._devClear();
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) game._startStage(Number(m[1]) - 1);
    });
    return true;
  }

  return { isDevEnvironment, install };
})();
