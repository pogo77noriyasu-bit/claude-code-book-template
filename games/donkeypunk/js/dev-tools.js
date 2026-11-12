// 開発用ショートカット(開発環境だけで有効)
// 有効になる条件: 「localhost / 127.0.0.1 / ローカルファイル(file://)で開いている」かつ「URL に ?dev が付いている」。
// GitHub Pages などの公開先では ?dev を付けても有効にならない。
//
// 使えるキー(プレイ中のみ):
//   C … ステージをクリアしたことにして、ゴリラ警官の逃走演出を直接始める
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
    });
    return true;
  }

  return { isDevEnvironment, install };
})();
