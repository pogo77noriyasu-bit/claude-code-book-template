// キーボード入力
// キーを「操作」(left / right / up / down / jump / start / sound) に変換して覚えておく。
window.DP = window.DP || {};

DP.input = (function () {
  const KEY_MAP = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ' ': 'jump',
    Spacebar: 'jump',
    Enter: 'start',
    m: 'sound',
    M: 'sound',
  };
  // ページがスクロールしないよう、既定の動作を止めるキー
  const PREVENT = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar']);

  const down = new Set(); // 押されている操作
  const pressed = new Set(); // このステップで新たに押された操作(1 回の更新で消費する)

  function onKeyDown(e) {
    const action = KEY_MAP[e.key];
    if (!action) return;
    if (PREVENT.has(e.key)) e.preventDefault();
    if (!down.has(action) && !e.repeat) pressed.add(action);
    down.add(action);
  }

  function onKeyUp(e) {
    const action = KEY_MAP[e.key];
    if (!action) return;
    down.delete(action);
  }

  function attach(target) {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    // ウィンドウからフォーカスが外れたら押しっぱなし扱いを解除する
    window.addEventListener('blur', () => down.clear());
  }

  return {
    attach,
    isDown: (a) => down.has(a),
    wasPressed: (a) => pressed.has(a),
    // 1 回の更新が終わったら呼ぶ
    endStep: () => pressed.clear(),
    reset: () => { down.clear(); pressed.clear(); },
  };
})();
