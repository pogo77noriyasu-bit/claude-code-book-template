// 入力(キーボードとタッチボタン)
// 方向キーは「押している順」を覚えておき、最後に押したものを優先する
PQ.input = (function () {
  const DIRS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };
  const KEYS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyA: 'left',
    KeyD: 'right',
    Space: 'draw',
    KeyZ: 'draw',
    Enter: 'start',
    KeyM: 'sound',
  };

  const held = new Set(); // 押している操作(方向・draw)
  let order = []; // 押している方向(新しい順)
  const pressed = new Set(); // 押した瞬間(1 ステップで消費)

  function down(name) {
    if (DIRS[name]) {
      order = [name].concat(order.filter((n) => n !== name));
    }
    if (!held.has(name)) pressed.add(name);
    held.add(name);
  }

  function up(name) {
    held.delete(name);
    if (DIRS[name]) order = order.filter((n) => n !== name);
  }

  function install() {
    window.addEventListener('keydown', (e) => {
      const name = KEYS[e.code];
      if (!name) return;
      e.preventDefault();
      if (e.repeat) return;
      if (PQ.audio) PQ.audio.unlock();
      down(name);
    });
    window.addEventListener('keyup', (e) => {
      const name = KEYS[e.code];
      if (name) up(name);
    });
    // ウィンドウを離れたら押しっぱなしを解除
    window.addEventListener('blur', () => {
      releaseAllTouches();
      held.clear();
      order = [];
    });

    // タッチボタン(data-key="up" など)
    // 指ごと(pointerId)に押しているボタンを覚える。方向ボタンと DRAW の同時押しのように
    // 複数の指で押しても、それぞれ別に押す・離すが効く。同じボタンを 2 本の指で押していたら、
    // 両方離すまで押したまま。押し方(押している間だけ有効・離すと止まる)は以前と同じ。
    document.querySelectorAll('[data-key]').forEach((el) => {
      const name = el.dataset.key;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (PQ.audio) PQ.audio.unlock();
        if (touchPointers.has(e.pointerId)) releasePointer(e); // 念のため(同じ指の押し直し)
        touchPointers.set(e.pointerId, { el, name });
        down(name);
        el.classList.add('on');
      });
      const off = (e) => {
        e.preventDefault();
        releasePointer(e);
      };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('lostpointercapture', releasePointer);
    });

    const pad = document.querySelector('.touch');
    if (pad) {
      // ボタンの上では長押しメニュー(コピーなど)・文字選択・ダブルタップ拡大などの標準動作を止める。
      // touchstart を止めても pointerdown / pointerup は届くので、ボタンの操作は変わらない
      pad.addEventListener('touchstart', (e) => e.cancelable && e.preventDefault(), { passive: false });
      pad.addEventListener('contextmenu', (e) => e.preventDefault());
      pad.addEventListener('selectstart', (e) => e.preventDefault());
    }
    // 保険 1: ボタンの外で指を離しても、その指のボタンを離す
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    // 保険 2: 画面に触れている指が 0 本になったら、タッチボタンをすべて離す(離したイベントの取りこぼし対策)
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) releaseAllTouches();
    };
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
  }

  // タッチボタンを押している指(pointerId → { el, name })
  const touchPointers = new Map();

  // その指で押していたボタンを離す。ほかの指が同じボタンを押していれば押したまま
  function releasePointer(e) {
    const t = touchPointers.get(e.pointerId);
    if (!t) return;
    touchPointers.delete(e.pointerId);
    for (const o of touchPointers.values()) if (o.name === t.name) return;
    up(t.name);
    t.el.classList.remove('on');
  }

  function releaseAllTouches() {
    for (const t of touchPointers.values()) {
      up(t.name);
      t.el.classList.remove('on');
    }
    touchPointers.clear();
  }

  // 押している方向の一覧({dx, dy}。新しい順)
  function dirs() {
    return order.map((n) => DIRS[n]);
  }

  function isHeld(name) {
    return held.has(name);
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

  return { install, dirs, isHeld, consume, endStep, down, up, touchCount: () => touchPointers.size };
})();
