// 入力(全種目で共通)
// - 種目の操作は RUN と ACTION の 2 つだけ。PC は SPACE = RUN、ENTER = ACTION。スマホは画面下のボタン
// - 「押した瞬間」だけを数える。キーの長押し(オートリピート)やボタンの押しっぱなしでは増えない
// - メニューは上下左右と決定(RUN / ACTION のどちらでも)・戻る(ESC)。画面のタップ位置も渡す
PO.input = (function () {
  const C = PO.config;
  const counts = { run: 0, action: 0, up: 0, down: 0, left: 0, right: 0, back: 0 };
  const lastTap = { run: -1, action: -1 };
  const held = {}; // 押されているキー(押しっぱなしの 2 回目以降を無視する)
  let taps = []; // 画面(canvas)のタップ位置(論理座標)
  let listeners = [];
  let ignored = 0; // 数えなかった入力(長押し・短すぎる連打)。テスト用
  const btnDown = { run: 0, action: 0 }; // スマホのボタンを押している指の数(押し続けている間の判定に使う)
  const forced = {}; // テスト補助から「押しっぱなし」にした入力

  const KEYMAP = {
    Space: 'run',
    Enter: 'action',
    NumpadEnter: 'action',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Escape: 'back',
    Backspace: 'back',
  };

  function now() {
    return performance.now() / 1000;
  }

  // RUN / ACTION は短すぎる間隔の連打を数えない(direct = true はテスト補助からの注入で、この判定をしない)
  function press(name, direct) {
    if (!direct && name in lastTap) {
      const t = now();
      if (lastTap[name] >= 0 && t - lastTap[name] < C.MIN_TAP_INTERVAL) {
        ignored++;
        return;
      }
      lastTap[name] = t;
    }
    counts[name]++;
    listeners.forEach((fn) => fn(name));
  }

  function onKeyDown(e) {
    if (e.code === 'KeyM') {
      if (!e.repeat) PO.sound.toggle();
      return;
    }
    const name = KEYMAP[e.code];
    if (!name) return;
    e.preventDefault(); // SPACE でのスクロールなどを止める
    if (e.repeat || held[e.code]) {
      ignored++; // 長押しのオートリピートは数えない
      return;
    }
    held[e.code] = true;
    PO.sound.unlock();
    press(name);
  }
  function onKeyUp(e) {
    held[e.code] = false;
  }

  // スマホのボタン。押した瞬間(pointerdown)だけ数える
  // 指を離した・ボタンの外で離した・取り消された(pointercancel・lostpointercapture)ときは押している状態を解除する。
  // ボタンが隠れた・画面が裏に回ったなどで離した合図が来ないときのために、releaseButtons() でまとめて解除できる
  const buttonSets = {}; // ボタンごとの、押している指(pointerId)の集合
  function bindButton(el) {
    const name = el.dataset.input;
    const down = new Set();
    buttonSets[name] = { down, el };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (down.has(e.pointerId)) return;
      down.add(e.pointerId);
      btnDown[name] = down.size;
      el.classList.add('pressed');
      PO.sound.unlock();
      press(name);
    });
    const up = (e) => {
      down.delete(e.pointerId);
      btnDown[name] = down.size;
      if (!down.size) el.classList.remove('pressed');
    };
    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((t) => el.addEventListener(t, up));
  }

  // 画面のタップ(メニューの項目選び・タイトルの開始)
  function bindCanvas(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      PO.sound.unlock();
      const r = canvas.getBoundingClientRect();
      taps.push({ x: ((e.clientX - r.left) / r.width) * C.W, y: ((e.clientY - r.top) / r.height) * C.H });
    });
  }

  // スマホのボタンを押している状態をすべて解除する(画面の切り替えでボタンが隠れたとき・画面が裏に回ったとき・touchcancel)
  function releaseButtons() {
    Object.keys(buttonSets).forEach((name) => {
      buttonSets[name].down.clear();
      buttonSets[name].el.classList.remove('pressed');
      btnDown[name] = 0;
    });
  }
  function releaseAll() {
    Object.keys(held).forEach((k) => (held[k] = false));
    releaseButtons();
  }

  function init(canvas) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // 画面が裏に回る・アプリを切り替える・システムがタッチを取り消したときは、押している状態を残さない
    window.addEventListener('blur', releaseAll);
    window.addEventListener('pagehide', releaseAll);
    window.addEventListener('touchcancel', releaseButtons);
    document.addEventListener('visibilitychange', () => document.hidden && releaseAll());
    document.querySelectorAll('.pad-btn').forEach(bindButton);
    bindCanvas(canvas);
  }

  // その名前の入力が何回あったかを返して 0 に戻す
  function consume(name) {
    const n = counts[name];
    counts[name] = 0;
    return n;
  }
  function consumeTaps() {
    const t = taps;
    taps = [];
    return t;
  }
  // その入力がいま押され続けているか(缶蹴りの「押している間だけ角度が上がる」に使う)。
  // キーボードは keydown〜keyup の間、スマホのボタンは指が触れている間
  function isDown(name) {
    if (forced[name]) return true;
    if (btnDown[name] > 0) return true;
    return Object.keys(KEYMAP).some((code) => KEYMAP[code] === name && held[code]);
  }
  // テスト補助: 押しっぱなしの状態を作る・やめる
  function setHeld(name, on) {
    forced[name] = !!on;
  }

  // 場面が変わるときに、たまっている入力を捨てる
  function clear() {
    Object.keys(counts).forEach((k) => (counts[k] = 0));
    taps = [];
  }
  // 入力の状態をすべて初期化する(操作説明のデモの終わり)。たまっている入力に加えて、押しっぱなしの記録・連打の間隔の記録も消す。
  // 押しっぱなしのキーの記録を消しても、オートリピート(e.repeat)は数えないので長押しが連打にはならない
  function reset() {
    clear();
    releaseAll();
    Object.keys(lastTap).forEach((k) => (lastTap[k] = -1));
  }

  return {
    init,
    consume,
    consumeTaps,
    clear,
    reset,
    releaseButtons,
    press,
    isDown,
    setHeld,
    onPress: (fn) => listeners.push(fn),
    get ignored() {
      return ignored;
    },
  };
})();
