// PUNKS & SKINS RESCUE: スマートフォンのタッチ操作(2026-11-22)
// 横向きのスマートフォンで、左下・右下の丸いボタン(index.html の .btn。見た目だけ)と画面のタップで遊ぶ。
// ボタンを押した判定は、ボタンのまわりの広い透明な領域 .hit で受ける(2026-11-22。少しずれても反応する)。見た目は style.css の
// 「スマートフォン(タッチ画面)」の部分。PC(マウス・キーボード)ではボタンを出さず、ここの処理も動かない。
//   - ボタンは 1 回タップで 1 ポジション(押した瞬間 pointerdown で動く。長押ししても続けて動かない)
//   - 指ごと(pointerId)に押しているボタンを覚えるので、複数の指で押しても状態が壊れない(離した指のボタンだけ戻る)
//   - タイトル画面では、画面かボタンをタップするとゲームを始める(GAME OVER の表示中・タイトルに戻った直後は始めない。
//     game.js の start が決める)
//   - スクロール・拡大・長押しのメニューを止める(touch-action は style.css、iOS のピンチは gesturestart を止める)
// ゲームのルールは変えない(キーボードの ← → / ENTER と同じ関数を呼ぶだけ)。
window.PSR = window.PSR || {};

PSR.touch = (function () {
  const pointers = new Map(); // pointerId → 押しているボタンの要素

  // タッチ画面か(スマートフォン・タブレット)。PC では false
  const isTouch = () => window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  function release(e) {
    const el = pointers.get(e.pointerId);
    if (!el) return;
    pointers.delete(e.pointerId);
    // 同じボタンを別の指がまだ押していれば、押した見た目のまま
    if (![...pointers.values()].includes(el)) el.classList.remove('on');
  }

  function releaseAll() {
    for (const el of pointers.values()) el.classList.remove('on');
    pointers.clear();
  }

  // タイトル画面ならゲームを始める。始めたら true
  function startIfTitle() {
    const g = PSR.state;
    return g.state === 'title' && PSR.game.start(g) !== false;
  }

  function install() {
    const hits = document.querySelectorAll('.hit[data-dir]');
    for (const hit of hits) {
      const btn = hit.parentElement.querySelector('.btn'); // 押した見た目にする丸ボタン
      hit.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        PSR.audio.unlock(); // 音はユーザーの操作のあとでないと鳴らせない
        try {
          hit.setPointerCapture(e.pointerId); // 指が判定の外へずれても、離すまでこのボタン
        } catch (err) {
          /* 対応していないブラウザでは何もしない */
        }
        pointers.set(e.pointerId, btn);
        btn.classList.add('on');
        if (startIfTitle()) return; // タイトル画面: 始めるだけ(動かない)
        PSR.game.move(PSR.state, Number(hit.dataset.dir));
      });
      hit.addEventListener('pointerup', release);
      hit.addEventListener('pointercancel', release);
      hit.addEventListener('lostpointercapture', release);
      hit.addEventListener('contextmenu', (e) => e.preventDefault()); // 長押しのメニューを出さない
    }
    // 画面(canvas)をタップ: タイトル画面ならゲームを始める
    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return; // PC のクリックでは何もしない(PC の操作は変えない)
      e.preventDefault();
      PSR.audio.unlock();
      startIfTitle();
    });
    // iOS Safari は pointerup / touchend でないと音を出せないことがあるので、離したときにももう一度
    document.addEventListener('touchend', () => PSR.audio.unlock(), { passive: true });
    // スクロール・拡大を止める(ボタン・画面の上。touch-action: none と合わせて)
    document.addEventListener(
      'touchmove',
      (e) => {
        if (isTouch()) e.preventDefault();
      },
      { passive: false }
    );
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => {
      if (isTouch()) e.preventDefault();
    });
    // 画面が隠れた・向きが変わったときは、押している状態を全部戻す
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);
    window.addEventListener('orientationchange', releaseAll);
  }

  install();
  return { isTouch, pressed: () => pointers.size };
})();
