// 起動と固定ステップのメインループ(動きは 1/60 秒ごと、描画は requestAnimationFrame)
// あわせて、スマホでの誤操作防止(「きこりのパンク」で直した方法と同じ考え方)を入れる。
(function () {
  const canvas = document.getElementById('game');
  PW.renderer.init(canvas);
  PW.input.install();
  canvas.focus();

  // 画面をタップしたら ENTER と同じ(スマホでの開始・再挑戦)
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    PW.audio.unlock();
    PW.input.press('start');
  });

  // 音の ON / OFF ボタン(スマホ用。PC は M キー)
  const soundBtn = document.getElementById('sound-toggle');
  const showSound = () => {
    if (soundBtn) soundBtn.textContent = PW.audio.isOn() ? '音: ON' : '音: OFF';
  };
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      PW.audio.unlock();
      PW.audio.toggle();
      showSound();
    });
  }
  showSound();

  // ---- タッチ端末での誤操作防止 ----
  // スクロール・引っぱって更新・ピンチ拡大・ダブルタップ拡大・長押しメニュー・文字選択を、
  // Web ページ側で止められる範囲で止める(style.css の .touch-ui と組み合わせる)。
  // タッチボタンを出す画面のときだけ <html> に touch-ui を付けるので、PC(マウスとキーボード)には効かない。
  // ※ 画面の下端からのスワイプなど、iOS 自体の操作は止められない
  const mouseUI = window.matchMedia('(hover: hover) and (pointer: fine)');
  let touchUI = false;
  function updateTouchUI() {
    touchUI = !mouseUI.matches;
    document.documentElement.classList.toggle('touch-ui', touchUI);
  }
  updateTouchUI();
  if (mouseUI.addEventListener) mouseUI.addEventListener('change', updateTouchUI);

  // 音のボタンだけは、ふつうにタップ(click)できるよう標準動作を止めない
  const blockable = (target) => !(target instanceof Element && target.closest('#sound-toggle'));
  document.addEventListener(
    'touchmove',
    (e) => {
      if (touchUI && e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => touchUI && e.preventDefault(), { passive: false });
  }
  let lastTouchEnd = -Infinity;
  document.addEventListener(
    'touchend',
    (e) => {
      if (!touchUI) return;
      const now = e.timeStamp;
      if (now - lastTouchEnd < 350 && e.cancelable && blockable(e.target)) e.preventDefault(); // ダブルタップ拡大
      lastTouchEnd = now;
    },
    { passive: false }
  );
  document.addEventListener('dblclick', (e) => touchUI && e.preventDefault());
  document.addEventListener('contextmenu', (e) => touchUI && e.preventDefault());
  document.addEventListener('selectstart', (e) => touchUI && e.preventDefault());
  canvas.addEventListener('touchstart', (e) => touchUI && e.preventDefault(), { passive: false });

  // ---- メインループ ----
  const STEP = 1000 / 60;
  let last = performance.now();
  let acc = 0;
  PW.loop = { manual: false }; // テストでは手動ステップにする

  function frame(now) {
    if (!PW.loop.manual) {
      acc += Math.min(250, now - last);
      while (acc >= STEP) {
        PW.game.update();
        acc -= STEP;
      }
    }
    last = now;
    PW.renderer.draw(PW.game.data);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 開発用ショートカット(URL に ?dev のときだけ)
  if (PW.devTools) PW.devTools.install(PW.game);
})();
