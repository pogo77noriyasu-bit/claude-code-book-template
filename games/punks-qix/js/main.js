// 起動と固定ステップのメインループ(物理は 1/60 秒ごと、描画は requestAnimationFrame)
(function () {
  const canvas = document.getElementById('game');
  PQ.renderer.init(canvas);
  PQ.input.install();
  canvas.focus();

  // ---- スマホでの誤操作防止(PUNKS WALK AND JUMP・NAKED PUNK と同じやり方) ----
  // iPhone で長押し・連続タップをすると「コピー」などの選択メニューや拡大が出て操作が妨げられるので、
  // タッチ端末(マウスのない画面)のときだけ <html> に touch-ui を付け、CSS とイベントの両方で標準動作を止める。
  // PC(マウス・キーボード)では何もしない。
  const mouseUI = window.matchMedia('(hover: hover) and (pointer: fine)');
  let touchUI = false;
  function updateTouchUI() {
    touchUI = !mouseUI.matches;
    document.documentElement.classList.toggle('touch-ui', touchUI);
  }
  updateTouchUI();
  if (mouseUI.addEventListener) mouseUI.addEventListener('change', updateTouchUI);

  // 「← ゲーム一覧へ」のリンクだけは、ふつうにタップできるよう標準動作を止めない
  const blockable = (target) => !(target instanceof Element && target.closest('a'));
  // スクロール・引っぱって更新
  document.addEventListener(
    'touchmove',
    (e) => {
      if (touchUI && e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  // ピンチ拡大(iOS Safari の独自イベント)
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => touchUI && e.preventDefault(), { passive: false });
  }
  // ダブルタップ拡大(すばやい 2 回目のタッチの終わりを止める)
  let lastTouchEnd = -Infinity;
  document.addEventListener(
    'touchend',
    (e) => {
      if (!touchUI) return;
      const now = e.timeStamp;
      if (now - lastTouchEnd < 350 && e.cancelable && blockable(e.target)) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
  document.addEventListener('dblclick', (e) => touchUI && e.preventDefault());
  // 長押しメニュー・文字選択
  document.addEventListener('contextmenu', (e) => touchUI && e.preventDefault());
  document.addEventListener('selectstart', (e) => touchUI && e.preventDefault());
  // キャンバスの上の長押し・連続タップ(画面タップでの開始は pointerdown なので止まらない)
  canvas.addEventListener('touchstart', (e) => touchUI && e.cancelable && e.preventDefault(), { passive: false });

  // 画面をタップしたら ENTER と同じ(スマホでの開始・再挑戦)
  canvas.addEventListener('pointerdown', () => {
    PQ.audio.unlock();
    PQ.input.down('start');
    PQ.input.up('start');
  });

  // 画面に合わせて縮小表示されるとき(表示の画素数が 480 より少ないとき)の対策:
  // pixelated だと 1px の線の行・列がまるごと間引かれて消えるので、補間ありの表示に切り替える
  function updateSmoothing() {
    const shown = canvas.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    canvas.style.imageRendering = shown < canvas.width ? 'auto' : '';
  }
  updateSmoothing();
  window.addEventListener('resize', updateSmoothing);

  const STEP = 1000 / 60;
  let last = performance.now();
  let acc = 0;
  PQ.loop = { manual: false }; // テストでは手動ステップにする

  function frame(now) {
    if (!PQ.loop.manual) {
      acc += Math.min(250, now - last);
      while (acc >= STEP) {
        PQ.game.update();
        acc -= STEP;
      }
    }
    last = now;
    PQ.renderer.draw(PQ.game.data);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 開発用ショートカット(URL に ?dev が付いているときだけ。通常プレイでは何もしない)
  if (PQ.devTools) PQ.devTools.install(PQ.game);
})();
