// 入力(キーボードとタッチボタン)
// 1 回押すと 1 マス跳ぶ(押しっぱなしで連続しては跳ばない)。跳んでいる途中に押した分は 1 つだけ覚えておき、
// 着地したらすぐ跳ぶ(すばやく 2 回押したときに 2 回目を取りこぼさない)。
// タッチボタンの扱いは「きこりのパンク」で直した方法を参考にしている:
//   - ボタンは pointerdown で動く(click を待たない)。指ごと(pointerId)に押しているボタンを覚える
//   - 指を離した・iOS にタッチを取られた(cancel)・キャプチャを失った、のどれでも押した表示を消す
//   - 画面に触れている指が 0 本になったら、押した表示をすべて消す(離したイベントの取りこぼし対策)
PW.input = (function () {
  const KEYS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyA: 'left',
    KeyD: 'right',
    Enter: 'start',
    Space: 'start',
    KeyM: 'sound',
  };
  const MOVES = ['up', 'down', 'left', 'right'];

  let queued = null; // 先に押された移動(1 つだけ)
  const pressed = new Set(); // 押した瞬間の操作(start・sound。1 ステップで消費)
  const touchPointers = new Map(); // 指ごとに押しているボタンの要素

  // 操作 name を押した
  function press(name) {
    if (MOVES.includes(name)) queued = name;
    else pressed.add(name);
  }

  // 次に跳ぶ向き(なければ null)。読んだら消える
  function takeMove() {
    const m = queued;
    queued = null;
    return m;
  }

  // 押した瞬間か(読んだら消える)
  function consume(name) {
    const had = pressed.has(name);
    pressed.delete(name);
    return had;
  }

  function endStep() {
    pressed.clear();
  }

  // 覚えている入力をすべて消す(ミス・ゴールのあとに、前の入力で勝手に跳ばないように)
  function clear() {
    queued = null;
  }

  function releasePointer(e) {
    const el = touchPointers.get(e.pointerId);
    if (!el) return;
    touchPointers.delete(e.pointerId);
    el.classList.remove('on');
  }
  function releaseAll() {
    for (const el of touchPointers.values()) el.classList.remove('on');
    touchPointers.clear();
  }

  function install() {
    window.addEventListener('keydown', (e) => {
      const name = KEYS[e.code];
      if (!name) return;
      e.preventDefault();
      if (e.repeat) return; // 押しっぱなしでは連続して跳ばない
      if (PW.audio) PW.audio.unlock();
      press(name);
    });

    // タッチボタン(data-key="up" など)
    const pad = document.querySelector('.pad');
    if (pad) {
      pad.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button[data-key]');
        if (!btn) return;
        e.preventDefault();
        // 指がボタンの外で離れても、離したイベントがパッドに届くようにする
        try {
          pad.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 取れなくても下の安全策で消える */
        }
        if (PW.audio) PW.audio.unlock();
        press(btn.dataset.key);
        btn.classList.add('on');
        touchPointers.set(e.pointerId, btn);
      });
      pad.addEventListener('pointerup', releasePointer);
      pad.addEventListener('pointercancel', releasePointer);
      pad.addEventListener('lostpointercapture', (e) => {
        if (e.target === pad) releasePointer(e);
      });
      // パッドの上では長押しメニュー・文字選択・ダブルタップ拡大などのタッチの標準動作を止める
      pad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      pad.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    // キャプチャが効かなかったときの保険: どこで離してもその指の表示を消す
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    // 最後の安全装置: 触れている指が 0 本になったら、すべて離した扱い
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) releaseAll();
    };
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('blur', () => {
      releaseAll();
      clear();
    });
  }

  return { install, press, takeMove, consume, endStep, clear, MOVES, touchCount: () => touchPointers.size };
})();
