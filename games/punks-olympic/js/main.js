// 起動・メインループ(固定ステップ)・画面サイズ合わせ・スマホの誤操作防止
PO.main = (function () {
  const C = PO.config;
  let canvas, ctx;
  let scene = null;
  let sceneName = '';
  let manual = false; // テスト用: true のときループは時間を進めない(step で進める)
  let acc = 0;
  let last = null;

  function go(name, params) {
    PO.input.clear();
    // リトライ・画面遷移で歓声を残さない(リザルトへは、全員ゴール後のフェードアウトをそのまま続ける)
    if (name !== 'result') PO.sound.crowd('stop');
    PO.sound.bgm('stop'); // BGM は次の画面に残さない(いまは表彰式だけ)
    sceneName = name;
    scene = PO.scenes[name];
    scene.enter(params || {});
    setButtons(scene.buttons || []);
  }

  // スマホのボタン(RUN / ACTION)を、その画面で使うものだけ出す。
  // 画面が変わると隠れるボタンには指を離した合図が来ないことがあるので、押している状態をここで解除する
  function setButtons(list) {
    PO.input.releaseButtons();
    document.querySelectorAll('.pad-btn').forEach((el) => {
      const b = list.find((x) => x.id === el.dataset.input);
      el.hidden = !b;
      if (b) el.textContent = b.label;
      el.classList.remove('pressed');
    });
    document.getElementById('pad').dataset.count = list.length;
    fitButtons();
  }
  // ボタンの文字がボタンに収まるよう、文字の大きさを小さくする(横向き・小さい画面で ACTION / THROW などが見切れないように)
  function fitButtons() {
    document.querySelectorAll('.pad-btn').forEach((el) => {
      el.style.fontSize = '';
      if (el.hidden || !el.clientWidth) return;
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (size > 12 && el.scrollWidth > el.clientWidth - 8) {
        size -= 2;
        el.style.fontSize = size + 'px';
      }
    });
  }

  function tick(dt) {
    scene.update(dt);
  }
  function render() {
    ctx.imageSmoothingEnabled = false; // 拡大縮小は最近傍(ドットをぼかさない)
    scene.render(ctx);
  }

  // 実時間を固定ステップに分けて進める(フレームレートが違っても速さ・タイムは同じ)
  function frame(ts) {
    if (!manual) {
      if (last != null) {
        acc += Math.min(0.25, (ts - last) / 1000);
        while (acc >= C.STEP) {
          tick(C.STEP);
          acc -= C.STEP;
        }
      }
      last = ts;
    }
    render();
    requestAnimationFrame(frame);
  }

  // 画面に収まるよう 4:3 のまま拡大縮小
  function fit() {
    const stage = document.getElementById('stage');
    const s = Math.min(stage.clientWidth / C.W, stage.clientHeight / C.H);
    canvas.style.width = Math.floor(C.W * s) + 'px';
    canvas.style.height = Math.floor(C.H * s) + 'px';
  }

  // スマホ: ダブルタップの拡大・ピンチ・スクロール・長押しのメニュー・文字選択を止める
  function guardTouch() {
    const stop = (e) => e.preventDefault();
    document.addEventListener('touchstart', (e) => e.touches.length > 1 && stop(e), { passive: false });
    document.addEventListener('touchmove', stop, { passive: false });
    document.addEventListener('touchend', stop, { passive: false });
    ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu', 'selectstart'].forEach((t) => document.addEventListener(t, stop, { passive: false }));
  }

  // 音を出せるようにする(AudioContext を作る・再開する)。iPhone の Safari は「指を離した」操作(touchend・pointerup)や
  // クリック・キー入力のときでないと音の再生を許さないので、それらの操作のたびに呼ぶ(指が触れた瞬間の pointerdown だけでは足りない)
  function bindAudioUnlock() {
    ['touchend', 'pointerup', 'click', 'keydown'].forEach((t) => document.addEventListener(t, () => PO.sound.unlock(), { capture: true, passive: true }));
  }

  function start() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    const touch = 'ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', touch);
    document.body.classList.toggle('muted', !PO.sound.enabled);
    PO.input.init(canvas);
    guardTouch();
    bindAudioUnlock();
    const soundBtn = document.getElementById('sound-btn');
    soundBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      PO.sound.unlock();
      PO.sound.toggle();
    });
    // 画面の大きさ・向きが変わったら合わせ直す(iPhone は向きを変えたあと少し遅れて大きさが変わることがあるので、少しあとにもう一度)
    const refit = () => {
      fit();
      fitButtons();
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', () => {
      refit();
      setTimeout(refit, 300);
    });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
    fit();
    PO.assets
      .load()
      .then(() => {
        // 開発用のプレビュー(js/dev-preview.js。localhost などで ?preview=ceremony のときだけ)。ふだんはタイトルから
        const pv = PO.devPreview && PO.devPreview.initial();
        if (pv) go(pv.scene, pv.params);
        else go('title');
        requestAnimationFrame(frame);
        document.body.classList.add('ready');
      })
      .catch((err) => {
        console.error(err);
        ctx.fillStyle = '#fff';
        ctx.font = '24px sans-serif';
        ctx.fillText(String(err.message || err), 20, 40);
      });
  }

  return {
    start,
    go,
    fit,
    fitButtons,
    tick,
    render,
    get sceneName() {
      return sceneName;
    },
    get scene() {
      return scene;
    },
    setManual(on) {
      manual = on;
      last = null;
      acc = 0;
    },
  };
})();

window.addEventListener('DOMContentLoaded', PO.main.start);
