// 起動処理とメインループ
// 物理は固定ステップ(1/60 秒)で進め、描画は requestAnimationFrame ごとに行う。
window.DP = window.DP || {};

(function () {
  const C = DP.config;
  const canvas = document.getElementById('game');
  const game = DP.createGame();
  const renderer = DP.createRenderer(canvas);
  DP.input.attach(window);

  // ループの制御。manual はテスト補助(?test)のときだけ使う
  const loop = {
    manual: false,
    // 1 ステップ進める(更新 → 入力の「押した瞬間」を消費)
    step() {
      game.update(DP.input);
      DP.input.endStep();
    },
  };

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(now - last, 100); // タブ復帰時などに一気に進みすぎないよう制限
    last = now;
    if (loop.manual) {
      acc = 0;
    } else {
      while (acc >= C.STEP_MS) {
        loop.step();
        acc -= C.STEP_MS;
      }
    }
    renderer.render(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // テスト補助を有効にする(URL に ?test が付いているときだけ。通常プレイでは何もしない)
  if (DP.installTestHooks) DP.installTestHooks(game, loop, renderer);
  // 開発用ショートカット(開発環境で ?dev が付いているときだけ。公開先では何もしない)
  if (DP.devTools) DP.devTools.install(game);
})();
