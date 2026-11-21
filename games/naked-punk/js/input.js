// 入力(キーボードとタッチボタン)
// 方向は「最後に押した向き」を覚えておく(game.js が主人公の want に渡す)。離しても忘れない。
// タッチボタンの扱いは「きこりのパンク」「PUNKS WALK AND JUMP」で直した方法と同じ:
//   - ボタンは pointerdown で動く(click を待たない)。指ごと(pointerId)に押しているボタンを覚える
//   - 指を離した・iOS にタッチを取られた(cancel)・キャプチャを失った、のどれでも押した表示を消す
//   - 画面に触れている指が 0 本になったら、押した表示をすべて消す(離したイベントの取りこぼし対策)
NP.input = (function () {
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

  let dir = null; // 最後に押した向き
  const pressed = new Set(); // 押した瞬間の操作(start・sound。1 ステップで消費)
  const touchPointers = new Map(); // 指ごとに押しているボタンの要素

  function press(name) {
    if (MOVES.includes(name)) dir = name;
    else pressed.add(name);
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

  // 覚えている向きを消す(ミス・次の面のあとに、前の入力で勝手に進まないように)
  function clear() {
    dir = null;
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
      if (NP.audio) NP.audio.unlock();
      if (e.repeat && !MOVES.includes(name)) return;
      press(name);
    });

    // タッチボタン(data-key="up" など)
    const pad = document.querySelector('.pad');
    if (pad) {
      pad.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('button[data-key]');
        if (!btn) return;
        e.preventDefault();
        try {
          pad.setPointerCapture(e.pointerId);
        } catch (err) {
          /* 取れなくても下の安全策で消える */
        }
        if (NP.audio) NP.audio.unlock();
        press(btn.dataset.key);
        btn.classList.add('on');
        touchPointers.set(e.pointerId, btn);
      });
      pad.addEventListener('pointerup', releasePointer);
      pad.addEventListener('pointercancel', releasePointer);
      pad.addEventListener('lostpointercapture', (e) => {
        if (e.target === pad) releasePointer(e);
      });
      pad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      pad.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) releaseAll();
    };
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('blur', releaseAll);
  }

  return { install, press, consume, endStep, clear, dir: () => dir, MOVES, touchCount: () => touchPointers.size };
})();
